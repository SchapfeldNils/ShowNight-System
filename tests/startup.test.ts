import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  startupStatus,
  printStartupStatus,
} from "../apps/local/src/startup.js";
import { initVault } from "../apps/local/src/vault.js";
import { LocalAccounts } from "../apps/local/src/accounts.js";

test("Erststart: fehlendes Profil wird erklärt, ohne Dateien anzulegen", async () => {
  const dir = await mkdtemp(join(tmpdir(), "shownight-status-"));
  const result = await startupStatus(
    join(dir, "server"),
    join(dir, "packages"),
  );
  assert.equal(result.ready, false);
  assert.equal(result.dataRoot, join(dir, "server"));
  assert.equal(result.packageRoot, join(dir, "packages"));
  assert.equal(result.origin, undefined);
  assert.match(result.lines.join("\n"), /Profil: fehlt/);
  assert.match(result.lines.join("\n"), /Schema 2 reicht nicht/);
  assert.deepEqual(await readdir(dir), []);
});
test("Unzugänglicher oder ungültiger Profilpfad wird nicht als Ersteinrichtung ausgegeben", async () => {
  const dir = await mkdtemp(join(tmpdir(), "shownight-status-"));
  const invalidRoot = join(dir, "synthetic-file");
  await writeFile(invalidRoot, "retained-data");
  const result = await startupStatus(invalidRoot, join(dir, "packages"));
  assert.equal(result.ready, false);
  assert.match(result.lines.join("\n"), /Profil: nicht zugänglich/);
  assert.doesNotMatch(
    result.lines.join("\n"),
    /Profil: fehlt|Nur bei tatsächlicher Ersteinrichtung/,
  );
  assert.equal(await readFile(invalidRoot, "utf8"), "retained-data");
  const wrongType = join(dir, "profile");
  await mkdir(join(wrongType, "server.dpapi"), { recursive: true });
  assert.match(
    (await startupStatus(wrongType, dir)).lines.join("\n"),
    /Profil: nicht zugänglich/,
  );
});
test("Status zeigt tatsächlich verwendete Pfade und Benutzerkontext, ohne Dateiinhalte", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "shownight-status-"));
  const result = await startupStatus(
    join(dir, "alternate-profile"),
    join(dir, "alternate-packages"),
  );
  const output: string[] = [];
  context.mock.method(console, "log", (line: string) => output.push(line));
  printStartupStatus(result);
  const text = output.join("\n");
  assert.ok(text.includes("Datenpfad dieses Starts: " + result.dataRoot));
  assert.ok(text.includes("Paketpfad dieses Starts: " + result.packageRoot));
  assert.ok(
    text.includes(
      "LOCALAPPDATA dieses Starts: " +
        (process.env.LOCALAPPDATA ?? "nicht gesetzt"),
    ),
  );
  assert.match(text, /Windows-Benutzerkontext:/);
  assert.match(
    text,
    /bestehender Einrichtung zuerst Windows-Benutzer und Startkontext prüfen/,
  );
});
test("Teilprofil und beschädigtes Profil bleiben erhalten, Rohfehler werden verborgen", async () => {
  const dir = await mkdtemp(join(tmpdir(), "shownight-status-"));
  const file = join(dir, "server.sntarget");
  await writeFile(file, "synthetic-retained-target");
  assert.match(
    (await startupStatus(dir, dir)).lines.join("\n"),
    /teilweise vorhanden/,
  );
  await writeFile(join(dir, "server.dpapi"), "synthetic-private-sentinel");
  const result = await startupStatus(dir, dir);
  assert.equal(result.ready, false);
  assert.match(result.lines.join("\n"), /nicht lesbar/);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-private-sentinel/);
  assert.equal(await readFile(file, "utf8"), "synthetic-retained-target");
});
test(
  "Windows-Erstinstallation: Status und echter Starter erhalten Identität, fehlende Importe getrennt",
  { skip: process.platform !== "win32" },
  async () => {
    const profile = await mkdtemp(join(tmpdir(), "shownight-status-"));
    const root = join(profile, "ShowNight", "local-server");
    const secrets = join(profile, "ShowNight", "secrets");
    const { vault, recovery } = await initVault(root, secrets);
    const accounts = new LocalAccounts(root, vault.key);
    accounts.configureRecovery(recovery);
    accounts.close();
    const preserved = [
      "server.dpapi",
      "server.cer",
      "server.pfx",
      "server.sntarget",
      "accounts.sqlite",
    ];
    const before = await Promise.all(
      preserved.map((file) => readFile(join(root, file))),
    );
    const result = await startupStatus(
      root,
      join(profile, "ShowNight", "local-packages"),
    );
    assert.equal(result.ready, false);
    assert.equal(result.origin, "https://localhost:3443");
    const text = result.lines.join("\n");
    assert.match(text, /Serverschlüssel: fehlt/);
    assert.match(text, /Anmeldestand: fehlt/);
    assert.match(text, /Inhaltspaket: fehlt/);
    assert.match(text, /Adress-\/Gültigkeitsprüfung bestanden/);
    const run = promisify(execFile);
    const env = { ...process.env, LOCALAPPDATA: profile };
    const status = await run(
      process.execPath,
      ["--import", "tsx", "apps/local/src/server-main.ts", "status"],
      { env, windowsHide: true },
    );
    assert.match(status.stdout, /Diese Statusprüfung startet keinen Server/);
    await assert.rejects(
      run(
        process.execPath,
        ["--import", "tsx", "apps/local/src/server-main.ts", "run-renderer"],
        { env, windowsHide: true },
      ),
      (error: any) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /Dienst nicht gestartet/);
        assert.match(error.stdout, /Anmeldestand: fehlt/);
        assert.doesNotMatch(error.stderr, /Lokaler Server fehlgeschlagen/);
        return true;
      },
    );
    assert.deepEqual(
      await Promise.all(preserved.map((file) => readFile(join(root, file)))),
      before,
    );
  },
);
test("Status legt fehlende Konten-/Paketdatenbanken nicht an", async () => {
  const root = await mkdtemp(join(tmpdir(), "shownight-status-"));
  const packages = join(root, "packages");
  await mkdir(packages);
  await startupStatus(root, packages);
  assert.deepEqual(await readdir(packages), []);
});
