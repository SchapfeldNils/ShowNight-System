import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { LiveEngine, type StandSource } from "../apps/local/src/live.js";
import { liveRights, type MonitorTimer } from "../packages/contracts/src/live.js";
import { manifest as manifestSchema } from "../packages/contracts/src/index.js";
import { transferManifest, type TransferManifest } from "../packages/contracts/src/transfer.js";
import { timerPreparation } from "../packages/contracts/src/timer.js";
import { clockValue } from "../apps/web/src/timer-preview.js";
import { localNetworkAddress } from "../apps/local/src/network.js";

// Live-Bühnenmonitor (Issue #41, D024/P5). Synthetic stands only.
const eventId = randomUUID(),
  showId = randomUUID(),
  plainShowId = randomUUID(),
  cueId = randomUUID();
const preset = timerPreparation.parse({
  mode: "countdown",
  durationSeconds: 60,
  warningSeconds: 10,
  normalColor: "#112233",
});
function pkg(timers = true) {
  return {
    schemaVersion: timers ? 3 : 1,
    id: randomUUID(),
    eventId,
    createdAt: "2026-10-19T12:00:00.000Z",
    eventRevision: 4,
    event: { name: "Synthetischer Abend", date: null, location: "", modules: [] },
    shows: [showId, plainShowId].map((id, i) => ({
      id,
      name: i ? "Show ohne Entwurf" : "Synthetische Show",
      description: "",
      revision: 1,
      sourceShowId: null,
      sourceRevision: null,
      cues: [
        { id: i ? randomUUID() : cueId, name: "Begrüßung", triggerHint: "", notes: "", enabled: true, mediaIds: [] },
      ],
    })),
    media: [],
    status: "valid",
    errors: [],
    liveActivationSupported: false,
    ...(timers ? { timers: [{ showId, revision: 3, preset }] } : {}),
  };
}
function source() {
  const packages = new Map<string, TransferManifest>();
  const s: StandSource = {
    manifest(id) {
      const m = packages.get(id);
      if (!m) throw new Error("fehlt");
      return { manifest: m, headerHash: createHash("sha256").update(JSON.stringify(m)).digest("hex") };
    },
    verify: async () => ({ status: "valid", errors: [] }),
    eventOf: (id) => packages.get(id)?.eventId,
  };
  const add = (m: unknown) => {
    const id = randomUUID();
    packages.set(id, m as TransferManifest);
    return id;
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

async function setup(timers = true) {
  const dir = await mkdtemp(join(tmpdir(), "shownight-monitor-"));
  const { s, add } = source();
  let now = Date.parse("2026-10-19T18:00:00.000Z");
  const clock = {
    get: () => new Date(now),
    advance: (ms: number) => {
      now += ms;
    },
  };
  const engine = new LiveEngine(dir, s, clock.get);
  const packageId = add(pkg(timers));
  const r = await engine.execute(tech, rTech, cmd("stand.activate", { packageId, expectedStandRevision: 0 }));
  assert.equal(r.accepted, true, r.message);
  let rev = 0;
  const mon = async (type: string, payload: object = {}, actor = regieB, rights = rLive) => {
    const out = await engine.execute(actor, rights, cmd(type, payload, { expectedMonitorRevision: rev }));
    if (out.accepted) rev = out.monitorRevision!;
    return out;
  };
  const shown = (t: MonitorTimer | null) =>
    clockValue(
      { valueMs: t!.valueMs, anchorMs: t!.anchorAt ? Date.parse(t!.anchorAt) : null },
      t!.mode === "elapsed" ? "elapsed" : "countdown",
      clock.get().getTime(),
    );
  return { dir, engine, clock, mon, shown, add, s };
}

test("Paketversion 3: Timerentwürfe mit und ohne Szenen, alte Versionen unverändert", () => {
  const v3 = pkg(true);
  assert.equal(manifestSchema.safeParse(v3).success, true);
  assert.equal(transferManifest.safeParse(v3).success, true);
  // Version 1 and 2 stay as they were; timers need version 3.
  assert.equal(manifestSchema.safeParse(pkg(false)).success, true);
  assert.equal(manifestSchema.safeParse({ ...v3, schemaVersion: 1 }).success, false);
  assert.equal(manifestSchema.safeParse({ ...v3, schemaVersion: 2 }).success, false);
  assert.equal(manifestSchema.safeParse({ ...pkg(false), schemaVersion: 3 }).success, false);
  // Version 3 with scenes is accepted as well (scenes optional there).
  const scene = {
    id: randomUUID(),
    showId,
    revision: 1,
    definition: { name: "Leer", logicalWidth: 1920, logicalHeight: 1080, background: "#000000", layers: [] },
  };
  const withScene = { ...v3, scenes: [scene] };
  assert.equal(manifestSchema.safeParse(withScene).success, true);
  assert.equal(transferManifest.safeParse(withScene).success, true);
  // Foreign or duplicate show references are refused for the transfer.
  assert.equal(
    transferManifest.safeParse({ ...v3, timers: [{ showId: randomUUID(), revision: 1, preset }] }).success,
    false,
  );
  assert.equal(
    transferManifest.safeParse({ ...v3, timers: [v3.timers![0], v3.timers![0]] }).success,
    false,
  );
});

test("Timer: nur Admin/Live/Technik, Entwurf aus dem Paket, Zeit vom Server", async () => {
  const { dir, engine, clock, mon, shown } = await setup();
  try {
    const denied = await mon("timer.load", { showId }, member, rMember);
    assert.equal(denied.status, 403);
    assert.equal((await mon("timer.start")).code, "NO_TIMER");
    const loaded = await mon("timer.load", { showId });
    assert.equal(loaded.accepted, true, loaded.message);
    let t = engine.monitorView(eventId).timer!;
    assert.equal(t.mode, "countdown");
    assert.equal(t.draftRevision, 3);
    assert.equal(t.normalColor, "#112233");
    assert.equal(t.anchorAt, null);
    assert.equal(shown(t), 60000);
    assert.equal((await mon("timer.resume")).code, "TIMER_STATE");
    assert.equal((await mon("timer.start")).accepted, true);
    assert.equal((await mon("timer.start")).code, "TIMER_STATE");
    clock.advance(10_000);
    assert.equal(shown(engine.monitorView(eventId).timer), 50000);
    assert.equal((await mon("timer.pause")).accepted, true);
    clock.advance(30_000);
    t = engine.monitorView(eventId).timer!;
    assert.equal(shown(t), 50000, "Pause hält die Zeit");
    assert.equal((await mon("timer.start")).code, "TIMER_STATE", "Start nur einmal, danach fortsetzen");
    assert.equal((await mon("timer.resume")).accepted, true);
    clock.advance(5_000);
    assert.equal((await mon("timer.adjust", { deltaSeconds: 30 })).accepted, true);
    assert.equal(shown(engine.monitorView(eventId).timer), 75000);
    clock.advance(80_000);
    assert.equal(shown(engine.monitorView(eventId).timer), -5000, "Überziehung läuft weiter");
    assert.equal((await mon("timer.reset")).accepted, true);
    t = engine.monitorView(eventId).timer!;
    assert.equal(shown(t), 60000);
    assert.equal(t.started, false);
    // A show without a draft uses the default values, visibly marked.
    const plain = await mon("timer.load", { showId: plainShowId });
    assert.match(plain.message, /Standardwerte/);
    assert.equal(engine.monitorView(eventId).timer!.draftRevision, null);
    assert.equal((await mon("timer.load", { showId: randomUUID() })).code, "SHOW");
  } finally {
    engine.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Timer: Laufzeit und Zieluhrzeit, Dauer vorgeben", async () => {
  const { dir, engine, clock, mon, shown } = await setup();
  try {
    assert.equal((await mon("timer.load", { showId, durationSeconds: 900 })).accepted, true);
    assert.equal(shown(engine.monitorView(eventId).timer), 900_000);
    const target = new Date(clock.get().getTime() + 600_000).toISOString();
    assert.equal(
      (await mon("timer.load", { showId, targetAt: target, durationSeconds: 5 })).status,
      422,
    );
    assert.equal(
      (await mon("timer.load", { showId, targetAt: new Date(clock.get().getTime() - 1000).toISOString() })).status,
      422,
    );
    assert.equal((await mon("timer.load", { showId, targetAt: target })).accepted, true);
    let t = engine.monitorView(eventId).timer!;
    assert.equal(t.mode, "target");
    assert.equal(shown(t), 600_000);
    clock.advance(60_000);
    assert.equal(shown(engine.monitorView(eventId).timer), 540_000, "Zieluhrzeit läuft sofort");
    assert.equal((await mon("timer.pause")).code, "TIMER_MODE");
    assert.equal((await mon("timer.reset")).code, "TIMER_MODE");
    assert.equal((await mon("timer.adjust", { deltaSeconds: 120 })).accepted, true);
    t = engine.monitorView(eventId).timer!;
    assert.equal(shown(t), 660_000);
    assert.equal(t.targetAt, new Date(Date.parse(target) + 120_000).toISOString());
    assert.equal((await mon("timer.clear")).accepted, true);
    assert.equal(engine.monitorView(eventId).timer, null);
  } finally {
    engine.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Laufzeit: Korrektur nie unter null", async () => {
  const { dir, engine, clock, s, add } = await setup(false);
  try {
    // A package with an elapsed-time draft replaces the stand.
    const elapsed = pkg(true);
    elapsed.timers = [{ showId, revision: 1, preset: timerPreparation.parse({ mode: "elapsed" }) }];
    const pid = add(elapsed);
    const act = await engine.execute(tech, rTech, cmd("stand.activate", { packageId: pid, expectedStandRevision: 1 }));
    assert.equal(act.accepted, true, act.message);
    let rev = 0;
    const run = async (type: string, payload: object = {}) => {
      const r = await engine.execute(tech, rTech, cmd(type, payload, { expectedMonitorRevision: rev }));
      if (r.accepted) rev = r.monitorRevision!;
      return r;
    };
    assert.equal((await run("timer.load", { showId, durationSeconds: 10 })).status, 422);
    await run("timer.load", { showId });
    await run("timer.start");
    clock.advance(20_000);
    await run("timer.adjust", { deltaSeconds: -60 });
    const t = engine.monitorView(eventId).timer!;
    assert.equal(t.mode, "elapsed");
    assert.equal(t.valueMs, 0);
    void s;
  } finally {
    engine.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Konkurrenz: Monitorrevision schützt, GO-Revision bleibt unberührt, Wiederholung idempotent", async () => {
  const { dir, engine, mon } = await setup();
  try {
    const created = await engine.execute(tech, rTech, cmd("run.create", { showId, kind: "probe" }));
    const runId = created.runId!;
    await engine.execute(tech, rTech, cmd("run.start", {}, { runId, expectedLiveRevision: 1 }));
    await mon("timer.load", { showId });
    // Two directors press start on the same monitor revision: exactly one wins.
    const a = cmd("timer.start", {}, { expectedMonitorRevision: 1 }),
      b = cmd("timer.start", {}, { expectedMonitorRevision: 1 });
    const [ra, rb] = await Promise.all([
      engine.execute(tech, rTech, a),
      engine.execute(regieB, rLive, b),
    ]);
    assert.deepEqual([ra.accepted, rb.accepted].sort(), [false, true]);
    const loser = ra.accepted ? rb : ra;
    assert.equal(loser.code, "MONITOR_REVISION");
    assert.match(loser.message, /Timerstart/);
    assert.equal(loser.monitorRevision, 2);
    // Replay of the same commandId returns the stored result, nothing runs twice.
    const again = await engine.execute(tech, rTech, a);
    assert.equal(again.replayed, true);
    assert.equal(again.accepted, ra.accepted);
    assert.equal(engine.monitorView(eventId).revision, 2);
    // Timer actions never change the run's live revision: GO still works.
    const go = await engine.execute(regieB, rLive, cmd("cue.go", { expectedNextCueId: cueId }, { runId, expectedLiveRevision: 2 }));
    assert.equal(go.accepted, true, go.message);
    const history = engine.history(eventId).map((e) => e.type);
    assert.ok(history.includes("timer.start"));
  } finally {
    engine.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Hinweise: Ablauf unabhängig von Timerpause, bewusst ausblenden", async () => {
  const { dir, engine, clock, mon } = await setup();
  try {
    await mon("timer.load", { showId });
    await mon("timer.start");
    for (const text of ["  ", "x".repeat(1001)])
      await assert.rejects(
        engine.execute(regieB, rLive, cmd("hint.show", { text, layout: "alongside", expirySeconds: null }, { expectedMonitorRevision: 2 })),
        "Text wird geprüft",
      );
    const shown = await mon("hint.show", { text: "Noch 2 Minuten", layout: "replace", expirySeconds: 20 });
    assert.equal(shown.accepted, true, shown.message);
    await mon("timer.pause");
    clock.advance(19_000);
    assert.equal(engine.monitorView(eventId).hint?.text, "Noch 2 Minuten");
    assert.equal(engine.monitorView(eventId).hint?.layout, "replace");
    clock.advance(2_000);
    assert.equal(engine.monitorView(eventId).hint, null, "Ablauf trotz Timerpause");
    assert.equal((await mon("hint.hide")).code, "NO_HINT");
    await mon("hint.show", { text: "Bitte zum Ende kommen", layout: "alongside", expirySeconds: null });
    clock.advance(3600_000);
    assert.equal(engine.monitorView(eventId).hint?.text, "Bitte zum Ende kommen", "Ohne Ablauf bleibt er");
    assert.equal((await mon("hint.hide")).accepted, true);
    assert.equal(engine.monitorView(eventId).hint, null);
    // The display view carries timer and hints only.
    assert.deepEqual(Object.keys(engine.monitorView(eventId)).sort(), [
      "hint",
      "protocolVersion",
      "revision",
      "serverTime",
      "simulated",
      "timer",
    ]);
  } finally {
    engine.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Neustart: gespeicherter Zustand, laufender Timer zählt nach Serverzeit weiter", async () => {
  const { dir, engine, clock, mon, shown, s } = await setup();
  await mon("timer.load", { showId });
  await mon("timer.start");
  await mon("hint.show", { text: "Kurze Unterbrechung", layout: "alongside", expirySeconds: null });
  clock.advance(5_000);
  engine.close();
  clock.advance(10_000);
  const reopened = new LiveEngine(dir, s, clock.get);
  try {
    const view = reopened.monitorView(eventId);
    assert.equal(shown(view.timer), 45_000);
    assert.equal(view.hint?.text, "Kurze Unterbrechung");
    assert.equal(view.revision, 3);
    const stale = await reopened.execute(tech, rTech, cmd("timer.pause", {}, { expectedMonitorRevision: 2 }));
    assert.equal(stale.code, "MONITOR_REVISION");
  } finally {
    reopened.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Anzeige-Link: nur Hash gespeichert, Widerruf und Ablauf wirken sofort", async () => {
  const { dir, engine, clock } = await setup();
  try {
    const link = engine.createLink(eventId, tech, "Tablet Bühne links", 2);
    assert.match(link.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(engine.linkEvent(link.token), eventId);
    assert.equal(engine.linkEvent(link.token.slice(0, -1) + (link.token.endsWith("A") ? "B" : "A")), null);
    assert.equal(engine.linkEvent("kurz"), null);
    assert.deepEqual(engine.links(eventId).map((l) => l.label), ["Tablet Bühne links"]);
    assert.equal(JSON.stringify(engine.links(eventId)).includes(link.token), false);
    const open = engine.createLink(eventId, tech, "Monitor PC", null);
    assert.equal(engine.revokeLink(eventId, link.id, regieB), true);
    assert.equal(engine.revokeLink(eventId, link.id, regieB), false);
    assert.equal(engine.linkEvent(link.token), null);
    assert.equal(engine.revokeLink(randomUUID(), open.id, regieB), false, "fremde Veranstaltung");
    const short = engine.createLink(eventId, tech, "Kurz", 1);
    clock.advance(3600_000);
    assert.equal(engine.linkEvent(short.token), null, "abgelaufen");
    assert.equal(engine.linkEvent(open.token), eventId, "unbefristet");
    assert.deepEqual(engine.links(eventId).map((l) => l.label), ["Monitor PC"]);
    const summaries = engine.history(eventId).map((e) => e.summary).join(" ");
    assert.match(summaries, /widerrufen/);
    assert.equal(summaries.includes(open.token), false);
  } finally {
    engine.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Anzeige-Link nur im lokalen Netz", () => {
  for (const ip of ["127.0.0.1", "::1", "192.168.1.20", "::ffff:10.0.0.5", "172.16.4.1"])
    assert.equal(localNetworkAddress(ip), true, ip);
  for (const ip of ["8.8.8.8", "::ffff:1.2.3.4", "2001:db8::1", "172.32.0.1", "169.254.1.1"])
    assert.equal(localNetworkAddress(ip), false, ip);
});
