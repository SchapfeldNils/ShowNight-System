import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { LiveEngine, type StandSource } from "../apps/local/src/live.js";
import { liveRights } from "../packages/contracts/src/live.js";
import type { TransferManifest } from "../packages/contracts/src/transfer.js";

// Synthetic stands only; no real event or buyer data.
const eventId = randomUUID(),
  showId = randomUUID();
const cueIds = Array.from({ length: 4 }, () => randomUUID());
type Cue = { id: string; name: string; enabled: boolean; notes?: string };
function manifest(revision: number, cues: Cue[], shows = [showId]) {
  return {
    schemaVersion: 2,
    id: randomUUID(),
    eventId,
    createdAt: new Date().toISOString(),
    eventRevision: revision,
    event: { name: "Synthetischer Abend", date: null, location: "", modules: {} },
    shows: shows.map((id) => ({
      id,
      name: "Synthetische Show",
      description: "",
      revision,
      sourceShowId: null,
      sourceRevision: null,
      cues: cues.map((c) => ({
        id: c.id,
        name: c.name,
        triggerHint: "",
        notes: c.notes ?? "",
        enabled: c.enabled,
        mediaIds: [],
      })),
    })),
    media: [],
    status: "valid",
    errors: [],
    liveActivationSupported: false,
    scenes: [],
  } as unknown as TransferManifest;
}
const baseCues: Cue[] = [
  { id: cueIds[0], name: "Begrüßung", enabled: true },
  { id: cueIds[1], name: "Deaktiviert", enabled: false },
  { id: cueIds[2], name: "Einspieler", enabled: true },
  { id: cueIds[3], name: "Abschluss", enabled: true },
];
function source() {
  const packages = new Map<string, { manifest: TransferManifest; valid: boolean }>();
  const add = (m: TransferManifest, valid = true) => {
    const id = randomUUID();
    packages.set(id, { manifest: m, valid });
    return id;
  };
  const s: StandSource = {
    manifest(id) {
      const p = packages.get(id);
      if (!p) throw new Error("fehlt");
      return {
        manifest: p.manifest,
        headerHash: createHash("sha256").update(JSON.stringify(p.manifest)).digest("hex"),
      };
    },
    async verify(id) {
      return packages.get(id)?.valid
        ? { status: "valid", errors: [] }
        : { status: "invalid", errors: ["Datei fehlt."] };
    },
    eventOf: (id) => packages.get(id)?.manifest.eventId,
  };
  return { s, add };
}
const tech = { id: randomUUID(), displayName: "Technik A" },
  regieB = { id: randomUUID(), displayName: "Regie B" },
  member = { id: randomUUID(), displayName: "Mitglied" };
const rTech = liveRights(false, ["technik"]),
  rLive = liveRights(false, ["live"]),
  rMember = liveRights(false, ["mitglied"]);
const cmd = (type: string, payload: object, extra: object = {}) => ({
  protocolVersion: 1,
  commandId: randomUUID(),
  eventId,
  type,
  payload,
  ...extra,
});

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "shownight-live-"));
  const { s, add } = source();
  const engine = new LiveEngine(dir, s);
  return { dir, engine, add, s };
}

test("D021: Rechte für GO und Aktivierung", () => {
  assert.deepEqual(liveRights(false, ["live"]), { view: true, operate: true, activate: false });
  assert.deepEqual(liveRights(false, ["technik"]), { view: true, operate: true, activate: true });
  assert.deepEqual(liveRights(false, ["leitung", "mitglied"]), { view: true, operate: false, activate: false });
  assert.deepEqual(liveRights(true, []), { view: true, operate: true, activate: true });
});

test("Liveaktivierung: nur geprüft, nur Technik/Admin, Revision geschützt", async () => {
  const { dir, engine, add } = await setup();
  try {
    const invalid = add(manifest(1, baseCues), false),
      valid = add(manifest(1, baseCues));
    const byLive = await engine.execute(regieB, rLive, cmd("stand.activate", { packageId: valid, expectedStandRevision: 0 }));
    assert.equal(byLive.status, 403);
    const bad = await engine.execute(tech, rTech, cmd("stand.activate", { packageId: invalid, expectedStandRevision: 0 }));
    assert.equal(bad.code, "PACKAGE_INVALID");
    const noRun = await engine.execute(tech, rTech, cmd("run.create", { showId, kind: "probe" }));
    assert.equal(noRun.code, "NO_STAND");
    const ok = await engine.execute(tech, rTech, cmd("stand.activate", { packageId: valid, expectedStandRevision: 0 }));
    assert.equal(ok.status, 200);
    const stale = await engine.execute(tech, rTech, cmd("stand.activate", { packageId: valid, expectedStandRevision: 0 }));
    assert.equal(stale.code, "STAND_REVISION");
    const snap = engine.snapshot(eventId, rTech);
    assert.equal(snap.stand.revision, 1);
    assert.equal(snap.stand.packageId, valid);
    assert.equal(snap.simulated, true);
  } finally {
    engine.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Durchlauf: Start ohne GO, gemeinsames Ziel, konkurrierendes GO genau einmal, Ablaufende", async () => {
  const { dir, engine, add } = await setup();
  try {
    const p = add(manifest(1, baseCues));
    await engine.execute(tech, rTech, cmd("stand.activate", { packageId: p, expectedStandRevision: 0 }));
    const denied = await engine.execute(member, rMember, cmd("run.create", { showId, kind: "probe" }));
    assert.equal(denied.status, 403);
    const created = await engine.execute(regieB, rLive, cmd("run.create", { showId, kind: "auffuehrung" }));
    const runId = created.runId!;
    const run = () => engine.snapshot(eventId, rLive).runs.find((r) => r.id === runId)!;
    const start = await engine.execute(regieB, rLive, cmd("run.start", {}, { runId, expectedLiveRevision: 1 }));
    assert.equal(start.status, 200);
    assert.equal(run().nextCueId, cueIds[0]);
    assert.equal(run().output, null, "Start löst keinen Einsatz aus");

    // Two directors press GO on the same state: only the first is executed.
    const rev = run().liveRevision;
    const goA = cmd("cue.go", { expectedNextCueId: cueIds[0] }, { runId, expectedLiveRevision: rev });
    const goB = cmd("cue.go", { expectedNextCueId: cueIds[0] }, { runId, expectedLiveRevision: rev });
    const [a, b] = await Promise.all([
      engine.execute(tech, rTech, goA),
      engine.execute(regieB, rLive, goB),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const loser = a.status === 409 ? a : b;
    assert.equal(loser.code, "LIVE_REVISION");
    assert.match(loser.message, /zuletzt GO durch/);
    assert.equal(run().output?.cueId, cueIds[0]);
    assert.equal(run().nextCueId, cueIds[2], "deaktivierter Einsatz wird übersprungen");

    // Retransmission of the same command returns the stored result only.
    const seq = engine.snapshot(eventId, rLive).sequence;
    const winner = a.status === 200 ? { c: goA, actor: tech, r: rTech } : { c: goB, actor: regieB, r: rLive };
    const again = await engine.execute(winner.actor, winner.r, winner.c);
    assert.equal(again.replayed, true);
    assert.equal(again.status, 200);
    assert.equal(engine.snapshot(eventId, rLive).sequence, seq);
    const reused = await engine.execute(winner.actor, winner.r, { ...winner.c, payload: { expectedNextCueId: cueIds[2] } });
    assert.equal(reused.code, "COMMAND_REUSED");

    // Concurrent preparation: the first valid change wins.
    const rev2 = run().liveRevision;
    const p1 = await engine.execute(tech, rTech, cmd("cue.prepare", { cueId: cueIds[3] }, { runId, expectedLiveRevision: rev2 }));
    const p2 = await engine.execute(regieB, rLive, cmd("cue.prepare", { cueId: cueIds[2] }, { runId, expectedLiveRevision: rev2 }));
    assert.equal(p1.status, 200);
    assert.equal(p2.code, "LIVE_REVISION");
    assert.equal(run().nextCueId, cueIds[3]);
    const wrongTarget = await engine.execute(regieB, rLive, cmd("cue.go", { expectedNextCueId: cueIds[2] }, { runId, expectedLiveRevision: run().liveRevision }));
    assert.equal(wrongTarget.code, "GO_TARGET");
    const last = await engine.execute(regieB, rLive, cmd("cue.go", { expectedNextCueId: cueIds[3] }, { runId, expectedLiveRevision: run().liveRevision }));
    assert.match(last.message, /Ablaufende/);
    assert.equal(run().atEnd, true);
    const after = await engine.execute(regieB, rLive, cmd("cue.go", { expectedNextCueId: cueIds[3] }, { runId, expectedLiveRevision: run().liveRevision }));
    assert.equal(after.code, "AT_END");

    // Only one performance at a time; a probe may run in parallel.
    const second = await engine.execute(regieB, rLive, cmd("run.create", { showId, kind: "auffuehrung" }));
    const blocked = await engine.execute(regieB, rLive, cmd("run.start", {}, { runId: second.runId, expectedLiveRevision: 1 }));
    assert.equal(blocked.code, "RUN_ACTIVE");
    const probe = await engine.execute(regieB, rLive, cmd("run.create", { showId, kind: "probe" }));
    const probeStart = await engine.execute(regieB, rLive, cmd("run.start", { startCueId: cueIds[2] }, { runId: probe.runId, expectedLiveRevision: 1 }));
    assert.equal(probeStart.status, 200);
    assert.equal(engine.snapshot(eventId, rLive).runs.find((r) => r.id === probe.runId)!.nextCueId, cueIds[2]);

    const end = await engine.execute(regieB, rLive, cmd("run.end", {}, { runId, expectedLiveRevision: run().liveRevision }));
    assert.equal(end.status, 200);
    assert.equal(run().status, "ended");
    assert.equal(run().output?.cueId, cueIds[3], "Beenden ohne pauschalen Stopp");
  } finally {
    engine.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Standwechsel: laufende Ausgabe bleibt, geänderter nächster Einsatz sperrt GO, keine Teilaktivierung, Rückkehr", async () => {
  const { dir, engine, add } = await setup();
  try {
    const v1 = add(manifest(1, baseCues));
    await engine.execute(tech, rTech, cmd("stand.activate", { packageId: v1, expectedStandRevision: 0 }));
    const runId = (await engine.execute(regieB, rLive, cmd("run.create", { showId, kind: "probe" }))).runId!;
    const run = () => engine.snapshot(eventId, rLive).runs.find((r) => r.id === runId)!;
    await engine.execute(regieB, rLive, cmd("run.start", {}, { runId, expectedLiveRevision: 1 }));
    await engine.execute(regieB, rLive, cmd("cue.go", { expectedNextCueId: cueIds[0] }, { runId, expectedLiveRevision: run().liveRevision }));
    assert.equal(run().nextCueId, cueIds[2]);

    // New stand: running cue renamed, next cue changed, a new cue appended.
    const extra = randomUUID();
    const v2 = add(
      manifest(2, [
        { id: cueIds[0], name: "Begrüßung NEU", enabled: true },
        baseCues[1],
        { id: cueIds[2], name: "Einspieler", enabled: true, notes: "geändert" },
        baseCues[3],
        { id: extra, name: "Zugabe", enabled: true },
      ]),
    );
    const act = await engine.execute(tech, rTech, cmd("stand.activate", { packageId: v2, expectedStandRevision: 1 }));
    assert.equal(act.status, 200);
    assert.equal(run().output?.name, "Begrüßung", "laufende Ausgabe bleibt die alte Fassung");
    assert.equal(run().nextBlocked, "next_changed");
    assert.equal(run().cues.at(-1)?.id, extra, "neuer Einsatz im kommenden Ablauf");
    const locked = await engine.execute(regieB, rLive, cmd("cue.go", { expectedNextCueId: cueIds[2] }, { runId, expectedLiveRevision: run().liveRevision }));
    assert.equal(locked.code, "GO_LOCKED");
    await engine.execute(regieB, rLive, cmd("cue.prepare", { cueId: cueIds[2] }, { runId, expectedLiveRevision: run().liveRevision }));
    assert.equal(run().nextBlocked, null);

    // A stand without the show of an open run is refused completely.
    const v3 = add(manifest(3, baseCues, [randomUUID()]));
    const refused = await engine.execute(tech, rTech, cmd("stand.activate", { packageId: v3, expectedStandRevision: 2 }));
    assert.equal(refused.code, "RUN_SHOW_MISSING");
    assert.equal(engine.snapshot(eventId, rTech).stand.packageId, v2);
    assert.equal(run().packageId, v2);

    // Deleted next cue after rollback: removed in v1? No – rollback restores v1 content.
    const back = await engine.execute(tech, rTech, cmd("stand.rollback", { expectedStandRevision: 2 }));
    assert.equal(back.status, 200);
    const snap = engine.snapshot(eventId, rTech);
    assert.equal(snap.stand.packageId, v1);
    assert.equal(snap.stand.previousPackageId, v2);
    assert.equal(run().nextBlocked, "next_changed", "Rückkehr ändert den vorbereiteten Einsatz erneut");
    assert.equal(run().output?.name, "Begrüßung");
  } finally {
    engine.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Ereignisse: Sequenz, neue Epoch nach Neustart, Zustand dauerhaft", async () => {
  const { dir, engine, add, s } = await setup();
  let reopened: LiveEngine | null = null;
  try {
    const p = add(manifest(1, baseCues));
    await engine.execute(tech, rTech, cmd("stand.activate", { packageId: p, expectedStandRevision: 0 }));
    const runId = (await engine.execute(regieB, rLive, cmd("run.create", { showId, kind: "probe" }))).runId!;
    const first = engine.events(eventId, engine.epoch, 0);
    assert.equal(first.snapshotRequired, false);
    assert.deepEqual(first.events.map((e) => e.type), ["stand.activate", "run.create"]);
    assert.equal(first.events[1].actorName, "Regie B");
    const last = first.events[1].sequence;
    await engine.execute(regieB, rLive, cmd("run.start", {}, { runId, expectedLiveRevision: 1 }));
    assert.deepEqual(engine.events(eventId, engine.epoch, last).events.map((e) => e.type), ["run.start"]);
    assert.equal(engine.events(eventId, "andere-epoch", last).snapshotRequired, true);
    assert.equal(engine.events(eventId, engine.epoch, last + 100).snapshotRequired, true);
    engine.close();
    reopened = new LiveEngine(dir, s);
    assert.notEqual(reopened.epoch, engine.epoch);
    const run = reopened.snapshot(eventId, rLive).runs[0];
    assert.equal(run.status, "running");
    assert.equal(run.nextCueId, cueIds[0]);
    assert.equal(reopened.history(eventId).length, 3);
  } finally {
    reopened?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
