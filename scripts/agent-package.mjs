import { readFile, writeFile, mkdir, copyFile, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
if (process.platform !== "win32")
  throw new Error("Windows-Paket auf Windows erstellen.");
const version = "24.19.0",
  name = `node-v${version}-win-x64.zip`;
const expected =
  "57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73";
const work = resolve(".local/agent-package"),
  out = resolve("dist/agent-windows");
await mkdir(work, { recursive: true });
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
await copyFile("dist/agent/main.js", join(out, "main.js"));
await writeFile(
  join(out, "package.json"),
  JSON.stringify({ type: "module", private: true }),
);
for (const [file, mode] of [
  ["Einrichten.cmd", "pair"],
  ["Start.cmd", "run"],
  ["VirtualDJ-Pruefen.cmd", "check-vdj"],
]) {
  await writeFile(
    join(out, file),
    `@echo off\r\n"%~dp0node.exe" "%~dp0main.js" ${mode}\r\npause\r\n`,
  );
}
await copyFile("docs/entwicklung/s2-agent.md", join(out, "Anleitung.md"));
await copyFile("node_modules/ws/LICENSE", join(out, "ws-LICENSE.txt"));
await copyFile("node_modules/zod/LICENSE", join(out, "zod-LICENSE.txt"));
await writeFile(
  join(out, "runtime-sha256.txt"),
  `${expected}  ${name}\nQuelle: https://nodejs.org/download/release/v${version}/SHASUMS256.txt\n`,
);
const zip = resolve("dist/shownight-agent-windows-x64.zip");
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
    .digest("hex") + "  shownight-agent-windows-x64.zip\n",
);
console.log("Windows-x64-Paket erstellt; Laufzeit-SHA256 geprüft.");
