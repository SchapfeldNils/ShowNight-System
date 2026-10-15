import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import { createServer, connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readRunState,
  requestStop,
  runStateName,
  serviceState,
  startControl,
} from "../apps/local/src/control.js";

/** Startet einen Kindprozess mit echtem Steuerkanal und wartet auf „ready“. */
async function child(root: string) {
  const p = spawn(
    process.execPath,
    ["--import", "tsx", "tests/local-control-child.ts", root],
    { windowsHide: true, stdio: ["ignore", "pipe", "inherit"] },
  );
  let output = "";
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Kind startet nicht.")),
      20000,
    );
    p.stdout.on("data", (b) => {
      output += b.toString();
      if (output.includes("ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
    p.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Kind vorzeitig beendet."));
    });
  });
  const exited = new Promise<number | null>((resolve) =>
    p.exitCode !== null ? resolve(p.exitCode) : p.once("exit", resolve),
  );
  return { p, exited, output: () => output };
}

test("Issue #32: geordneter Stopp über den lokalen Steuerkanal", async () => {
  const root = await mkdtemp(join(tmpdir(), "shownight-control-"));
  assert.deepEqual(await serviceState(root), { state: "stopped" });
  const notRunning = await requestStop(root);
  assert.equal(notRunning.result, "not-running");

  const { p, exited, output } = await child(root);
  try {
    const state = await readRunState(root);
    assert.equal(state?.pid, p.pid);
    assert.equal((await serviceState(root)).state, "running");
    const stopped = await requestStop(root, 15000);
    assert.equal(stopped.result, "stopped", stopped.message);
    assert.equal(await exited, 0);
    assert.match(output(), /stopped/);
    await assert.rejects(access(join(root, runStateName)));
    assert.deepEqual(await serviceState(root), { state: "stopped" });
    // Erneuter Stopp liefert eine verständliche Rückmeldung statt eines Fehlers.
    assert.equal((await requestStop(root)).result, "not-running");
  } finally {
    if (p.exitCode === null) p.kill();
  }

  // Erneuter Start nach dem Stopp ist möglich.
  const again = await child(root);
  try {
    assert.equal((await serviceState(root)).state, "running");
    assert.equal((await requestStop(root, 15000)).result, "stopped");
    assert.equal(await again.exited, 0);
  } finally {
    if (again.p.exitCode === null) again.p.kill();
  }
});

test("Issue #32: falsches Token beendet nichts; veralteter Zustand wird erkannt", async () => {
  const root = await mkdtemp(join(tmpdir(), "shownight-control-"));
  let stops = 0;
  const control = await startControl({
    root,
    origin: "https://localhost:3443",
    mode: "run",
    onStop: () => stops++,
  });
  try {
    const original = await readFile(join(root, runStateName), "utf8");
    const state = JSON.parse(original);
    // Direkter Aufruf mit falschem Token.
    const reply = await new Promise<string>((resolve, reject) => {
      const socket = connect({ host: "127.0.0.1", port: control.port });
      let text = "";
      socket.setEncoding("utf8");
      socket.on("connect", () =>
        socket.write(
          JSON.stringify({ action: "stop", token: "0".repeat(64) }) + "\n",
        ),
      );
      socket.on("data", (c: string) => (text += c));
      socket.on("end", () => resolve(text));
      socket.on("error", reject);
    });
    assert.deepEqual(JSON.parse(reply), { ok: false });
    // requestStop mit manipuliertem Token im Laufzustand: kein Stopp, klare Meldung.
    await writeFile(
      join(root, runStateName),
      JSON.stringify({ ...state, token: "f".repeat(64) }),
    );
    const failed = await requestStop(root, 2000);
    assert.equal(failed.result, "failed");
    assert.match(failed.message, /Nichts gewaltsam beendet/);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(stops, 0);
    await writeFile(join(root, runStateName), original);
  } finally {
    await control.close();
  }
  await assert.rejects(access(join(root, runStateName)));

  // Veralteter Laufzustand: Prozess existiert nicht mehr.
  const gone = spawn(process.execPath, ["-e", ""], { windowsHide: true });
  const pid = gone.pid!;
  await new Promise((r) => gone.once("exit", r));
  await writeFile(
    join(root, runStateName),
    JSON.stringify({
      version: 2,
      pid,
      startedAt: new Date().toISOString(),
      port: 65000,
      token: "a".repeat(64),
      mode: "run",
      origin: "https://localhost:3443",
    }),
  );
  assert.deepEqual(await serviceState(root), { state: "stale" });
  const stale = await requestStop(root);
  assert.equal(stale.result, "not-running");
  await assert.rejects(access(join(root, runStateName)));

  // Unlesbarer Zustand: nichts beenden, nichts löschen.
  await writeFile(join(root, runStateName), "{kein json");
  assert.deepEqual(await serviceState(root), { state: "unreadable" });
  assert.equal((await requestStop(root)).result, "failed");
  await access(join(root, runStateName));
});

test("Issue #32: fremder Dienst ohne Laufzustand bleibt unberührt", async () => {
  const root = await mkdtemp(join(tmpdir(), "shownight-control-"));
  const foreign = createServer((s) => s.end());
  await new Promise<void>((r) => foreign.listen(0, "127.0.0.1", r));
  try {
    const result = await requestStop(root);
    assert.equal(result.result, "not-running");
    assert.equal(foreign.listening, true);
  } finally {
    await new Promise<void>((r) => foreign.close(() => r()));
  }
});

test("Review PR #51: fehlgeschlagene Veröffentlichung schließt den Kanal; fremder Laufzustand bleibt", async () => {
  const servers = () =>
    process.getActiveResourcesInfo().filter((r) => r === "TCPServerWrap")
      .length;
  const before = servers();
  await assert.rejects(
    startControl({
      root: join(tmpdir(), "shownight-fehlt-" + Date.now(), "nicht", "da"),
      origin: "https://localhost:3443",
      mode: "run",
      onStop: () => {},
    }),
  );
  assert.equal(servers(), before);

  const root = await mkdtemp(join(tmpdir(), "shownight-control-"));
  const control = await startControl({
    root,
    origin: "https://localhost:3443",
    mode: "run",
    onStop: () => {},
  });
  // Ein späterer Start hat den Laufzustand ersetzt: close() darf ihn nicht löschen.
  const replaced = {
    ...JSON.parse(await readFile(join(root, runStateName), "utf8")),
    startedAt: new Date(Date.now() + 1000).toISOString(),
  };
  await writeFile(join(root, runStateName), JSON.stringify(replaced));
  await control.close();
  assert.deepEqual(
    JSON.parse(await readFile(join(root, runStateName), "utf8")),
    replaced,
  );
});
