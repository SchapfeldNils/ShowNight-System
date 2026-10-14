import {
  cp,
  mkdir,
  readFile,
  writeFile,
  access,
  rm,
  realpath,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
if (process.platform !== "win32") throw new Error("Windows erforderlich.");
const renderer = process.argv.includes("--renderer");
const source = resolve(
  renderer ? "dist/server-renderer-windows" : "dist/server-windows",
);
const stage = resolve(
  ".local/streaming-installer",
  renderer ? "renderer" : "server",
);
const out = resolve("dist/streaming-installer");
await access(join(source, "node.exe"));
await access(join(source, "main.js"));
if (renderer) await access(join(source, "renderer/integrity.json"));
const stagingRoot = resolve(".local/streaming-installer");
await mkdir(stagingRoot, { recursive: true });
// Resolve the existing target before recursive deletion; never follow a redirected stage.
const stagingParent = await realpath(stagingRoot);
const previous = await realpath(stage).catch((e) => {
  if (e.code === "ENOENT") return null;
  throw e;
});
if (
  previous &&
  previous !== join(stagingParent, renderer ? "renderer" : "server")
)
  throw new Error("Umgeleitetes Installer-Staging wird nicht entfernt.");
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await mkdir(out, { recursive: true });
await cp(source, stage, { recursive: true });
await writeFile(
  join(stage, "Streaming-Start.cmd"),
  '@echo off\r\n"%~dp0node.exe" "%~dp0main.js" ' +
    (renderer ? "run-renderer" : "run") +
    "\r\npause\r\n",
);
await writeFile(
  join(stage, "Installationshinweise.txt"),
  [
    "ShowNight Streaming - Softwarevorbereitung",
    "",
    "Windows x64. Installation für den aktuellen Windows-Benutzer.",
    "Enthalten: lokaler HTTPS-Server, Weboberfläche und eigene Node-Laufzeit.",
    renderer
      ? "Renderer enthalten: ausschließlich gekennzeichnete Softwarediagnose."
      : "Renderer in diesem Vorabpaket noch nicht enthalten.",
    "Keine Freigabe für Veranstaltungsbetrieb, HDMI, Audio oder OBS-Ausgabe.",
    "",
    "Nach der Installation über das Startmenü:",
    "Zuerst 'Einrichtungsstatus prüfen' öffnen; fehlende Schritte werden einzeln erklärt.",
    "1. Lokalen Server einmal einrichten. Bestehende Einrichtung nicht erneut initialisieren.",
    "   Danach .snpkg-Dateien über Inhaltspaket importieren im Startmenü laden.",
    "2. Serverschlüssel und für diesen Rechner ausgestellten Anmeldestand importieren.",
    "   Ablauf und Voraussetzungen stehen in Anleitung.md im Programmordner.",
    "3. Lokales HTTPS-Zertifikat wie dort beschrieben prüfen und vertrauen.",
    "4. ShowNight Streaming starten, dann die ausgegebene HTTPS-Adresse im Browser öffnen.",
    "   Zum Beenden im Serverfenster Strg+C verwenden.",
    "",
    "Node/npm, Compiler und GStreamer-SDK sind beim Anwender nicht erforderlich.",
    ...(renderer
      ? [
          "Passende kostenlose Microsoft Visual-C++-v14-x64-Laufzeit und Arial erforderlich.",
          "https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist",
          "Medienauswahl und Grenzen: Paketmedien-Anleitung.md im Programmordner.",
        ]
      : []),
    "Einrichtung, Konten, Medienpakete und Schlüssel liegen getrennt unter",
    "%LOCALAPPDATA%\\ShowNight. Updates und Deinstallation behalten diese Daten.",
    "Aktiven Server/Renderer vor einem Update regulär beenden.",
    "Setup startet keinen Server und ändert weder Zertifikatvertrauen noch Firewall.",
    "Es gibt keinen automatischen Windows-Autostart.",
    "",
    "Lizenzen: Node-LICENSE.txt und licenses/ im Programmordner.",
    "Setup erstellt mit Inno Setup (https://jrsoftware.org/), kostenlos nutzbar",
    "nach dessen Inno Setup License; der Compiler wird nicht mitinstalliert.",
    "Entwicklungspaket: noch nicht mit einem Herausgeberzertifikat signiert.",
  ].join("\r\n"),
);
const candidates = [
  process.env.INNO_SETUP_COMPILER,
  join(
    process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)",
    "Inno Setup 6/ISCC.exe",
  ),
  join(process.env.ProgramFiles ?? "C:/Program Files", "Inno Setup 6/ISCC.exe"),
].filter(Boolean);
let compiler;
for (const candidate of candidates) {
  try {
    await access(candidate);
    compiler = candidate;
    break;
  } catch {}
}
if (!compiler)
  throw new Error(
    "Inno Setup 6 fehlt auf dem Buildrechner; INNO_SETUP_COMPILER kann ISCC.exe angeben.",
  );
execFileSync(
  compiler,
  [
    "/DPayloadDir=" + stage,
    "/DOutputDir=" + out,
    resolve("deploy/windows/streaming.iss"),
  ],
  { stdio: "inherit", windowsHide: true, timeout: 300000 },
);
const name = "ShowNight-Streaming-Setup-x64.exe";
const bytes = await readFile(join(out, name));
await writeFile(
  join(out, name + ".sha256"),
  createHash("sha256").update(bytes).digest("hex") + "  " + name + "\n",
);
await writeFile(
  join(out, "build-info.json"),
  JSON.stringify(
    {
      version: "0.3.7",
      rendererIncluded: renderer,
      stage: "software-preparation",
      signed: false,
      dataPreservedOnUninstall: true,
    },
    null,
    2,
  ),
);
console.log(
  "ShowNight Streaming Setup-EXE erstellt; Renderer enthalten: " + renderer,
);
