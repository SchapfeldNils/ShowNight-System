import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  unlink,
  cp,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve, dirname, sep } from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
if (process.platform !== "win32")
  throw new Error("Windows-Paket auf Windows erstellen.");
const version = "24.19.0",
  name = `node-v${version}-win-x64.zip`;
const expected =
  "57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73";
const local = process.argv[2] === "local";
const server = process.argv[2] === "server";
const work = resolve(".local/agent-package"),
  out = resolve(
    server
      ? "dist/server-windows"
      : local
        ? "dist/local-windows"
        : "dist/agent-windows",
  );
await mkdir(work, { recursive: true });
if (
  !out.startsWith(resolve("dist") + sep) ||
  !["agent-windows", "local-windows", "server-windows"].includes(
    out.split(sep).at(-1),
  )
)
  throw new Error("Ungültiges eigenes Paketverzeichnis.");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const archive = join(work, name);
let bytes;
try {
  bytes = await readFile(archive);
} catch {
  const response = await fetch(
    `https://nodejs.org/download/release/v${version}/${name}`,
    { signal: AbortSignal.timeout(120000), redirect: "error" },
  );
  if (!response.ok)
    throw new Error("Offizielle Node-Laufzeit nicht verfügbar.");
  bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(archive, bytes);
}
if (createHash("sha256").update(bytes).digest("hex") !== expected)
  throw new Error("Laufzeit-Prüfsumme falsch.");
const ps = join(
  process.env.SystemRoot ?? "C:/Windows",
  "System32/WindowsPowerShell/v1.0/powershell.exe",
);
async function zipOperation(script, values) {
  const prefix = `$ErrorActionPreference='Stop';[Console]::InputEncoding=[Text.Encoding]::UTF8;[void][Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem');
    $values=[Console]::In.ReadToEnd().Split([char]0);`;
  await new Promise((resolve, reject) => {
    const child = spawn(
      ps,
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(prefix + script, "utf16le").toString("base64"),
      ],
      { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
    );
    const timer = setTimeout(() => child.kill(), 120000);
    child.stderr.resume();
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Windows ZIP-Werkzeug fehlt."));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve()
        : reject(new Error("Windows ZIP-Erstellung fehlgeschlagen."));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(values.join("\0"));
  });
}
// Paths are stdin data, never interpolated into executable PowerShell text.
await zipOperation(
  `$zip=[IO.Compression.ZipFile]::OpenRead($values[0]);try {
  [IO.Compression.ZipFileExtensions]::ExtractToFile($zip.GetEntry('node-v24.19.0-win-x64/node.exe'),[IO.Path]::Combine($values[1],'node.exe'),$true);
  [IO.Compression.ZipFileExtensions]::ExtractToFile($zip.GetEntry('node-v24.19.0-win-x64/LICENSE'),[IO.Path]::Combine($values[1],'Node-LICENSE.txt'),$true)
} finally {$zip.Dispose()}`,
  [archive, out],
);
await copyFile(
  server
    ? "dist/server/main.js"
    : local
      ? "dist/local/main.js"
      : "dist/agent/main.js",
  join(out, "main.js"),
);
await writeFile(
  join(out, "package.json"),
  JSON.stringify({ type: "module", private: true }),
);
if (server) {
  await cp("dist/server/web", join(out, "web"), { recursive: true });
  // Bundle inputs identify every bundled package, including transitive packages.
  // Include each installed package's manifest and license/notice files.
  const inputs = JSON.parse(
      await readFile("dist/server/bundle-inputs.json", "utf8"),
    ),
    roots = new Set();
  roots.add(resolve("node_modules/react"));
  roots.add(resolve("node_modules/react-dom"));
  roots.add(
    dirname(
      createRequire(
        await realpath("node_modules/react-dom/package.json"),
      ).resolve("scheduler/package.json"),
    ),
  );
  for (const input of inputs) {
    const m = input
      .replaceAll("\\", "/")
      .match(/^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//);
    if (m) roots.add(m[1]);
  }
  let i = 0;
  for (const root of roots) {
    const dir = join(out, "licenses", String(++i));
    await mkdir(dir, { recursive: true });
    await copyFile(join(root, "package.json"), join(dir, "package.json"));
    for (const entry of await readdir(root, { withFileTypes: true }))
      if (
        entry.isFile() &&
        /^(license|licence|copying|notice)/i.test(entry.name)
      )
        await copyFile(join(root, entry.name), join(dir, entry.name));
  }
}
for (const [file, mode] of server
  ? [
      ["Server-Einrichten.cmd", "init"],
      ["Serverschluessel-Importieren.cmd", "trust"],
      ["Anmeldestand-Importieren.cmd", "import-auth"],
      ["Server-Start.cmd", "run"],
      ["Admin-Wiederherstellen.cmd", "recover"],
      ["Admin-Konten-Anzeigen.cmd", "admins"],
    ]
  : local
    ? [
        ["Importieren.cmd", "import"],
        ["Pakete-Anzeigen.cmd", "list"],
        ["Pakete-Pruefen.cmd", "check-all"],
      ]
    : [
        ["Einrichten.cmd", "pair"],
        ["Start.cmd", "run"],
        ["VirtualDJ-Pruefen.cmd", "check-vdj"],
      ]) {
  await writeFile(
    join(out, file),
    `@echo off\r\n"%~dp0node.exe" "%~dp0main.js" ${mode}\r\npause\r\n`,
  );
}
await copyFile(
  server
    ? "docs/entwicklung/s3-lokalserver.md"
    : local
      ? "docs/entwicklung/s3-paketablage.md"
      : "docs/entwicklung/s2-agent.md",
  join(out, "Anleitung.md"),
);
if (!local && !server)
  await copyFile("node_modules/ws/LICENSE", join(out, "ws-LICENSE.txt"));
await copyFile("node_modules/zod/LICENSE", join(out, "zod-LICENSE.txt"));
await writeFile(
  join(out, "runtime-sha256.txt"),
  `${expected}  ${name}\nQuelle: https://nodejs.org/download/release/v${version}/SHASUMS256.txt\n`,
);
const zipName = server
  ? "shownight-server-windows-x64.zip"
  : local
    ? "shownight-local-windows-x64.zip"
    : "shownight-agent-windows-x64.zip";
const zip = resolve("dist/" + zipName);
await unlink(zip).catch((e) => {
  if (e.code !== "ENOENT") throw e;
});
await zipOperation(
  `[IO.Compression.ZipFile]::CreateFromDirectory($values[0],$values[1],[IO.Compression.CompressionLevel]::Optimal,$true)`,
  [out, zip],
);
await writeFile(
  zip + ".sha256",
  createHash("sha256")
    .update(await readFile(zip))
    .digest("hex") +
    "  " +
    zipName +
    "\n",
);
console.log("Windows-x64-Paket erstellt; Laufzeit-SHA256 geprüft.");
