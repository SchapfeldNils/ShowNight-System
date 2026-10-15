import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  access,
  realpath,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
if (process.platform !== "win32" || process.env.CI !== "true")
  throw new Error(
    "Installertest ausschließlich in isolierter Windows-CI ausführen.",
  );
const ps = join(
  process.env.SystemRoot,
  "System32/WindowsPowerShell/v1.0/powershell.exe",
);
function powershell(script, env = {}) {
  return execFileSync(
    ps,
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(
        "$ErrorActionPreference='Stop';" + script,
        "utf16le",
      ).toString("base64"),
    ],
    {
      env: { ...process.env, ...env },
      encoding: "utf8",
      windowsHide: true,
      timeout: 30000,
    },
  );
}
const registry =
  "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{91B460DA-7153-4619-9B7D-DC6EAD45982B}_is1";
assert.equal(
  powershell("Test-Path -LiteralPath $env:TEST_REGISTRY", {
    TEST_REGISTRY: registry,
  }).trim(),
  "False",
  "Kein vorhandenes ShowNight-Profil im Installertest überschreiben.",
);
const isolated = await realpath(
  await mkdtemp(join(tmpdir(), "shownight-installer-")),
);
const folder = join(isolated, "Anwendung mit Leerzeichen");
const profile = join(isolated, "profile");
const group = "ShowNight Installer Test " + randomUUID();
const proof = resolve("test-results/installer");
await mkdir(proof, { recursive: true });
const setup = resolve(
  "dist/streaming-installer/ShowNight-Streaming-Setup-x64.exe",
);
function install(name) {
  return spawnExit(setup, [
    "/VERYSILENT",
    "/SUPPRESSMSGBOXES",
    "/NORESTART",
    "/SP-",
    "/DIR=" + folder,
    "/GROUP=" + group,
    "/LOG=" + join(proof, name + ".log"),
  ]);
}
function spawnExit(exe, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { env, windowsHide: true, stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Installerprüfung zu langsam."));
    }, 120000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}
let installed = false;
let blocker;
try {
  assert.equal(await install("install"), 0);
  installed = true;
  const buildInfo = JSON.parse(
    await readFile(resolve("dist/streaming-installer/build-info.json"), "utf8"),
  );
  assert.equal(
    powershell(
      "(Get-ItemProperty -LiteralPath $env:TEST_REGISTRY).DisplayVersion",
      { TEST_REGISTRY: registry },
    ).trim(),
    buildInfo.version,
    "Installierte Versionskennung muss den Artefaktmetadaten entsprechen.",
  );
  const runtime = join(folder, "node.exe");
  assert.equal(
    execFileSync(runtime, ["--version"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim(),
    "v24.19.0",
  );
  const shortcut = powershell(
    "$p=Join-Path ([Environment]::GetFolderPath('Programs')) ($env:TEST_GROUP+'\\ShowNight Streaming starten.lnk');(New-Object -ComObject WScript.Shell).CreateShortcut($p).TargetPath",
    { TEST_GROUP: group },
  ).trim();
  assert.equal(shortcut.toLowerCase(), ps.toLowerCase());
  const launcherArguments = powershell(
    "$p=Join-Path ([Environment]::GetFolderPath('Programs')) ($env:TEST_GROUP+'\\ShowNight Streaming starten.lnk');(New-Object -ComObject WScript.Shell).CreateShortcut($p).Arguments",
    { TEST_GROUP: group },
  ).trim();
  assert.ok(launcherArguments.includes(join(folder, "Server-Oberflaeche.ps1")));
  assert.match(launcherArguments, /-STA/);
  const launcherStatus = execFileSync(
    ps,
    [
      "-NoProfile",
      "-STA",
      "-ExecutionPolicy",
      "RemoteSigned",
      "-File",
      join(folder, "Server-Oberflaeche.ps1"),
      "-CheckOnly",
    ],
    {
      env: { ...process.env, LOCALAPPDATA: profile },
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(JSON.parse(launcherStatus).ready, false);
  assert.equal(
    JSON.parse(launcherStatus).dataRoot,
    join(profile, "ShowNight/local-server"),
  );
  const nativeUi = JSON.parse(
    execFileSync(
      ps,
      [
        "-NoProfile",
        "-STA",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        join(folder, "Server-Oberflaeche.ps1"),
        "-UiCheck",
      ],
      {
        env: { ...process.env, LOCALAPPDATA: profile },
        encoding: "utf8",
        windowsHide: true,
        timeout: 30000,
      },
    ),
  );
  assert.equal(nativeUi.title, "ShowNight · Lokaler Server");
  assert.ok(
    nativeUi.details.includes(
      "Datenordner: " + join(profile, "ShowNight/local-server"),
    ),
  );
  assert.ok(
    nativeUi.details.includes(
      "Paketordner: " + join(profile, "ShowNight/local-packages"),
    ),
  );
  assert.match(nativeUi.details, /Profil: fehlt/);
  assert.equal(nativeUi.startEnabled, false);
  assert.equal(nativeUi.stopEnabled, false);
  assert.equal(nativeUi.installUpdateEnabled, false);
  assert.equal(nativeUi.openEnabled, false);
  const env = { ...process.env, LOCALAPPDATA: profile };
  const statusShortcut = powershell(
    "$p=Join-Path ([Environment]::GetFolderPath('Programs')) ($env:TEST_GROUP+'\\Einrichtungsstatus prüfen.lnk');(New-Object -ComObject WScript.Shell).CreateShortcut($p).TargetPath",
    { TEST_GROUP: group },
  ).trim();
  assert.equal(
    statusShortcut.toLowerCase(),
    join(folder, "Server-Status.cmd").toLowerCase(),
  );
  await access(statusShortcut);
  // Issue #32: Startmenüeintrag „Server stoppen“ und verständliche Rückmeldung ohne laufenden Server.
  const stopShortcut = powershell(
    "$p=Join-Path ([Environment]::GetFolderPath('Programs')) ($env:TEST_GROUP+'\\Server stoppen.lnk');(New-Object -ComObject WScript.Shell).CreateShortcut($p).TargetPath",
    { TEST_GROUP: group },
  ).trim();
  assert.equal(
    stopShortcut.toLowerCase(),
    join(folder, "Server-Stoppen.cmd").toLowerCase(),
  );
  await access(stopShortcut);
  const stopWithoutServer = execFileSync(
    runtime,
    [join(folder, "main.js"), "stop"],
    { env, encoding: "utf8", windowsHide: true },
  );
  assert.match(stopWithoutServer, /Server läuft nicht/);
  assert.match(
    execFileSync(runtime, [join(folder, "main.js"), "status"], {
      env,
      encoding: "utf8",
      windowsHide: true,
    }),
    /Dienst: gestoppt/,
  );
  const firstStatus = execFileSync(
    runtime,
    [join(folder, "main.js"), "status"],
    { env, encoding: "utf8", windowsHide: true },
  );
  assert.match(firstStatus, /Profil: fehlt/);
  assert.notEqual(
    await spawnExit(runtime, [join(folder, "main.js"), "run"], env),
    0,
  );
  const importerShortcut = powershell(
    "$p=Join-Path ([Environment]::GetFolderPath('Programs')) ($env:TEST_GROUP+'\\Inhaltspaket importieren.lnk');(New-Object -ComObject WScript.Shell).CreateShortcut($p).TargetPath",
    { TEST_GROUP: group },
  ).trim();
  assert.equal(
    importerShortcut.toLowerCase(),
    join(folder, "Server-Paket-Importieren.cmd").toLowerCase(),
  );
  await access(importerShortcut);
  assert.equal(
    await spawnExit(runtime, [join(folder, "main.js"), "init"], env),
    0,
  );
  const target = join(profile, "ShowNight/local-server/server.sntarget");
  const original = await readFile(target);
  const privateFiles = [
    join(profile, "ShowNight/local-server/server.dpapi"),
    join(profile, "ShowNight/secrets/local-server-recovery.env"),
  ];
  const privateBefore = await Promise.all(
    privateFiles.map((path) => readFile(path)),
  );
  // Issue #33: installierte Version und Updateprüfung ohne Serverschlüssel.
  assert.equal(
    JSON.parse(await readFile(join(folder, "version.json"), "utf8")).version,
    buildInfo.version,
  );
  assert.equal(
    JSON.parse(
      execFileSync(runtime, [join(folder, "main.js"), "update-check"], {
        env,
        encoding: "utf8",
        windowsHide: true,
      }),
    ).state,
    "not-configured",
  );
  const preparedStatus = execFileSync(
    runtime,
    [join(folder, "main.js"), "status"],
    { env, encoding: "utf8", windowsHide: true },
  );
  assert.match(preparedStatus, /Anmeldestand: fehlt/);
  assert.match(preparedStatus, /Serverschlüssel: fehlt/);
  assert.deepEqual(
    await Promise.all(privateFiles.map((path) => readFile(path))),
    privateBefore,
  );
  blocker = spawn(runtime, ["-e", "setInterval(()=>{},1000)"], {
    windowsHide: true,
    stdio: "ignore",
  });
  await new Promise((r) => setTimeout(r, 1000));
  // Ein fremdes Skript mit der eigenen Laufzeit ist kein ShowNight-Server dieser
  // Installation: Der Stoppversuch findet keinen Laufzustand, nichts wird beendet
  // oder überschrieben.
  assert.notEqual(
    await install("running-blocked"),
    0,
    "Nicht eindeutig zugeordnete eigene Laufzeit muss Update verhindern.",
  );
  assert.equal(blocker.exitCode, null, "Fremder Prozess bleibt unberührt.");
  assert.match(
    await readFile(join(proof, "running-blocked.log"), "utf8"),
    /Eigenen ShowNight-Server geordnet beenden/,
  );
  const stopped = new Promise((r) => blocker.once("exit", r));
  blocker.kill();
  await stopped;
  blocker = null;
  assert.equal(await install("upgrade"), 0);
  assert.deepEqual(
    await Promise.all(privateFiles.map((path) => readFile(path))),
    privateBefore,
    "Update erhält DPAPI-Identität und Wiederherstellungsschlüssel.",
  );
  assert.deepEqual(
    await readFile(target),
    original,
    "Update erhält Einrichtung.",
  );
  assert.equal(
    await spawnExit(join(folder, "unins000.exe"), [
      "/VERYSILENT",
      "/SUPPRESSMSGBOXES",
      "/NORESTART",
      "/LOG=" + join(proof, "uninstall.log"),
    ]),
    0,
  );
  installed = false;
  await new Promise((r) => setTimeout(r, 1000));
  await assert.rejects(access(runtime));
  assert.deepEqual(
    await Promise.all(privateFiles.map((path) => readFile(path))),
    privateBefore,
    "Deinstallation erhält DPAPI-Identität und Wiederherstellungsschlüssel.",
  );
  assert.deepEqual(
    await readFile(target),
    original,
    "Deinstallation erhält Einrichtung.",
  );
  await writeFile(
    join(proof, "result.json"),
    JSON.stringify(
      {
        install: true,
        bundledRuntime: true,
        startMenu: true,
        activeUpdateBlocked: true,
        unidentifiedProcessUntouched: true,
        stopShortcut: true,
        upgradePreservesData: true,
        uninstallPreservesData: true,
        physicalOutputTested: false,
        rendererIncluded: JSON.parse(
          await readFile("dist/streaming-installer/build-info.json", "utf8"),
        ).rendererIncluded,
      },
      null,
      2,
    ),
  );
  console.log(
    "Setup: Installation, Startmenü, Laufzeit, aktive Updatesperre, Update und Deinstallation bestanden.",
  );
} finally {
  if (blocker) blocker.kill();
  if (installed)
    await spawnExit(join(folder, "unins000.exe"), [
      "/VERYSILENT",
      "/SUPPRESSMSGBOXES",
      "/NORESTART",
    ]).catch(() => {});
}
