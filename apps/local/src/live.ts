// Local live state, package 1 (Issue #45, D007/D009/D011/D012, D021).
// Simulated output only: GO changes the server-side state and history, it
// sends nothing to the renderer, devices, audio or HDMI.
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  activationCommands,
  liveCommand,
  monitorCommands,
  operateCommands,
  type BlockReason,
  type LiveCommand,
  type LiveCommandResult,
  type LiveCue,
  type LiveEvent,
  type LiveOutput,
  type LiveRun,
  type LiveSnapshot,
  type MonitorHint,
  type MonitorLink,
  type MonitorState,
  type MonitorTimer,
  type MonitorView,
} from "../../../packages/contracts/src/live.js";
import type { TransferManifest } from "../../../packages/contracts/src/transfer.js";
import { defaultTimerPreparation } from "../../../packages/contracts/src/timer.js";
import {
  clockValue,
  correctClock,
  formatClock,
  type PreviewClock,
} from "../../web/src/timer-preview.js";

export type StandSource = {
  /** Manifest and header hash of an imported package. Throws if absent/changed. */
  manifest(packageId: string): { manifest: TransferManifest; headerHash: string };
  /** Full file check before activation (D009 point 5). */
  verify(packageId: string): Promise<{ status: string; errors: string[] }>;
  /** Event the package is bound to in the prepared offline snapshot. */
  eventOf(packageId: string): string | undefined;
};
export type LiveActor = { id: string; displayName: string };
export type LiveRights = { view: boolean; operate: boolean; activate: boolean };

class Refusal extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type RunRow = {
  id: string;
  event_id: string;
  show_id: string;
  kind: "probe" | "auffuehrung";
  status: "prepared" | "running" | "ended";
  live_revision: number;
  package_id: string;
  header_sha: string;
  next_cue_id: string | null;
  next_blocked: BlockReason | null;
  position_cue_id: string | null;
  at_end: number;
  output_json: string | null;
  created_at: string;
  last_action_json: string | null;
  /**
   * Cues that were at or before the output position when a new stand was
   * activated. An automatic advance onto one of them is never silent.
   */
  passed_guard: string | null;
};
type MonitorRow = {
  event_id: string;
  revision: number;
  timer_json: string | null;
  hint_json: string | null;
  last_action_json: string | null;
};
type StandRow = {
  event_id: string;
  revision: number;
  package_id: string | null;
  header_sha: string | null;
  activated_at: string | null;
  activated_by: string | null;
  previous_package_id: string | null;
  previous_header_sha: string | null;
};

const tokenHash = (token: string) =>
  createHash("sha256").update("shownight-monitor-link:" + token).digest("hex");
const kindLabel = { probe: "Probe", auffuehrung: "Aufführung" } as const;
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : value,
  );

export class LiveEngine {
  private db: DatabaseSync;
  /** New transport epoch per process start; clients then reload a snapshot. */
  readonly epoch = randomUUID();
  constructor(
    root: string,
    private source: StandSource,
    private now: () => Date = () => new Date(),
  ) {
    this.db = new DatabaseSync(join(root, "live.sqlite"));
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
    );
    const version = Number(
      this.db.prepare("PRAGMA user_version").get()?.user_version ?? 0,
    );
    if (version < 0 || version > 3) {
      this.db.close();
      throw new Error("Lokales Liveschema nicht unterstützt.");
    }
    this.db.exec(`CREATE TABLE IF NOT EXISTS live_stands(
      event_id TEXT PRIMARY KEY, revision INTEGER NOT NULL,
      package_id TEXT, header_sha TEXT, activated_at TEXT, activated_by TEXT,
      previous_package_id TEXT, previous_header_sha TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS live_runs(
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, show_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('probe','auffuehrung')),
      status TEXT NOT NULL CHECK(status IN ('prepared','running','ended')),
      live_revision INTEGER NOT NULL, package_id TEXT NOT NULL, header_sha TEXT NOT NULL,
      next_cue_id TEXT, next_blocked TEXT, position_cue_id TEXT, at_end INTEGER NOT NULL DEFAULT 0,
      output_json TEXT, created_at TEXT NOT NULL, created_by TEXT NOT NULL, last_action_json TEXT,
      passed_guard TEXT
    ) STRICT;
    CREATE INDEX IF NOT EXISTS live_runs_event ON live_runs(event_id, created_at);
    CREATE TABLE IF NOT EXISTS live_commands(
      command_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, request_hash TEXT NOT NULL,
      result_json TEXT NOT NULL, created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS live_events(
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, run_id TEXT,
      type TEXT NOT NULL, live_revision INTEGER, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL,
      at TEXT NOT NULL, summary TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS live_events_event ON live_events(event_id, sequence);
    CREATE TABLE IF NOT EXISTS live_monitors(
      event_id TEXT PRIMARY KEY, revision INTEGER NOT NULL,
      timer_json TEXT, hint_json TEXT, last_action_json TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS live_monitor_links(
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
      expires_at TEXT, revoked_at TEXT, revoked_by TEXT
    ) STRICT;
    CREATE INDEX IF NOT EXISTS live_monitor_links_event ON live_monitor_links(event_id, created_at);
    `);
    // Version 2: cues already passed before a stand switch (JSON array).
    if (
      !(this.db.prepare("PRAGMA table_info(live_runs)").all() as { name: string }[]).some(
        (c) => c.name === "passed_guard",
      )
    )
      this.db.exec("ALTER TABLE live_runs ADD COLUMN passed_guard TEXT");
    // Version 3: stage monitor state and display links (Issue #41).
    this.db.exec("PRAGMA user_version=3");
  }
  close() {
    this.db.close();
  }

  private stand(eventId: string): StandRow {
    return (
      (this.db
        .prepare("SELECT * FROM live_stands WHERE event_id=?")
        .get(eventId) as StandRow | undefined) ?? {
        event_id: eventId,
        revision: 0,
        package_id: null,
        header_sha: null,
        activated_at: null,
        activated_by: null,
        previous_package_id: null,
        previous_header_sha: null,
      }
    );
  }
  private sequence() {
    return Number(
      this.db.prepare("SELECT COALESCE(MAX(sequence),0) AS s FROM live_events").get()
        ?.s ?? 0,
    );
  }
  /** Manifest of a stand; the stored header hash pins the exact content. */
  private bound(packageId: string, headerSha: string) {
    let m: { manifest: TransferManifest; headerHash: string };
    try {
      m = this.source.manifest(packageId);
    } catch {
      throw new Refusal(
        409,
        "STAND_MISSING",
        "Datenstand ist lokal nicht mehr vorhanden oder nicht lesbar.",
      );
    }
    if (m.headerHash !== headerSha)
      throw new Refusal(
        409,
        "STAND_CHANGED",
        "Aktiver Datenstand wurde verändert. Bitte Paket prüfen und neu aktivieren.",
      );
    return m.manifest;
  }
  private cues(manifest: TransferManifest, showId: string): LiveCue[] {
    const show = manifest.shows.find((s) => s.id === showId);
    if (!show) return [];
    return show.cues.map((c) => {
      const scene = c.sceneId
        ? manifest.scenes?.find((s) => s.id === c.sceneId)
        : undefined;
      return {
        id: c.id,
        name: c.name,
        triggerHint: c.triggerHint,
        enabled: c.enabled,
        sceneId: c.sceneId ?? null,
        sceneName: scene?.definition.name ?? null,
      };
    });
  }
  /** Content of a cue including its scene version; changes mark it stale. */
  private fingerprint(manifest: TransferManifest, showId: string, cueId: string) {
    const cue = manifest.shows
      .find((s) => s.id === showId)
      ?.cues.find((c) => c.id === cueId);
    if (!cue) return null;
    const scene = cue.sceneId
      ? manifest.scenes?.find((s) => s.id === cue.sceneId)
      : undefined;
    // Media content counts too: same ID with new bytes is a changed cue.
    const ids = [
      ...cue.mediaIds,
      ...(scene?.definition.layers.flatMap((l) =>
        l.kind === "image" ? [l.mediaId] : [],
      ) ?? []),
    ];
    const media = ids.map(
      (id) => manifest.media.find((m) => m.id === id)?.sha256 ?? null,
    );
    return stable({ cue, scene: scene ? scene.definition : null, media });
  }
  /**
   * Order check between the position and the shared GO target (D009 6/7).
   * Any reorder, removal or (de)activation in between, or a target that
   * changed sides, blocks GO; pure insertions block with their own reason.
   */
  private orderChange(
    oldCues: LiveCue[],
    newCues: LiveCue[],
    position: string | null,
    target: string,
  ): BlockReason | null {
    const span = (cues: LiveCue[]) => {
      const ids = cues.map((c) => c.id);
      const a = position ? ids.indexOf(position) : -1,
        b = ids.indexOf(target);
      if ((position && a < 0) || b < 0) return null;
      const part = a < b ? cues.slice(a + 1, b) : cues.slice(b + 1, a);
      return { dir: Math.sign(b - a), part };
    };
    const o = span(oldCues),
      n = span(newCues);
    if (!o || !n) return "position_removed";
    if (o.dir !== n.dir) return "next_moved";
    const known = new Set(oldCues.map((c) => c.id));
    const key = (c: LiveCue) => c.id + ":" + c.enabled;
    const common = n.part.filter((c) => known.has(c.id));
    if (common.map(key).join() !== o.part.map(key).join()) return "next_moved";
    return common.length < n.part.length ? "cues_inserted" : null;
  }
  private following(cues: LiveCue[], afterCueId: string | null) {
    const start = afterCueId ? cues.findIndex((c) => c.id === afterCueId) : -1;
    return cues.slice(start + 1).find((c) => c.enabled)?.id ?? null;
  }

  snapshot(eventId: string, rights: LiveRights): LiveSnapshot {
    const stand = this.stand(eventId);
    const eventRevision = (pkg: string | null, sha: string | null) => {
      if (!pkg || !sha) return null;
      try {
        return this.bound(pkg, sha).eventRevision;
      } catch {
        return null;
      }
    };
    const rows = this.db
      .prepare(
        "SELECT * FROM live_runs WHERE event_id=? ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'prepared' THEN 1 ELSE 2 END, created_at DESC LIMIT 50",
      )
      .all(eventId) as RunRow[];
    const runs: LiveRun[] = rows.map((r) => {
      let manifest: TransferManifest | null = null;
      try {
        manifest = this.bound(r.package_id, r.header_sha);
      } catch {
        manifest = null;
      }
      const show = manifest?.shows.find((s) => s.id === r.show_id);
      return {
        id: r.id,
        showId: r.show_id,
        showName: show?.name ?? "Show nicht im Datenstand",
        kind: r.kind,
        status: r.status,
        liveRevision: r.live_revision,
        packageId: r.package_id,
        eventRevision: manifest?.eventRevision ?? 0,
        cues: manifest ? this.cues(manifest, r.show_id) : [],
        nextCueId: r.next_cue_id,
        nextBlocked: r.next_blocked,
        positionCueId: r.position_cue_id,
        atEnd: !!r.at_end,
        output: r.output_json ? (JSON.parse(r.output_json) as LiveOutput) : null,
        createdAt: r.created_at,
        lastAction: r.last_action_json ? JSON.parse(r.last_action_json) : null,
      };
    });
    return {
      protocolVersion: 1,
      authorityId: "local-server",
      authorityEpoch: this.epoch,
      sequence: this.sequence(),
      eventId,
      simulated: true,
      stand: {
        revision: stand.revision,
        packageId: stand.package_id,
        eventRevision: eventRevision(stand.package_id, stand.header_sha),
        activatedAt: stand.activated_at,
        activatedBy: stand.activated_by,
        previousPackageId: stand.previous_package_id,
        previousEventRevision: eventRevision(
          stand.previous_package_id,
          stand.previous_header_sha,
        ),
      },
      runs,
      monitor: this.monitor(eventId),
      serverTime: this.now().toISOString(),
      rights,
    };
  }

  private monitor(eventId: string): MonitorState {
    const row = this.db
      .prepare("SELECT * FROM live_monitors WHERE event_id=?")
      .get(eventId) as MonitorRow | undefined;
    return {
      revision: row?.revision ?? 0,
      timer: row?.timer_json ? (JSON.parse(row.timer_json) as MonitorTimer) : null,
      hint: row?.hint_json ? (JSON.parse(row.hint_json) as MonitorHint) : null,
      lastAction: row?.last_action_json ? JSON.parse(row.last_action_json) : null,
    };
  }
  /** Timer and hints only; an expired hint is not delivered (F20, P5). */
  monitorView(eventId: string): MonitorView {
    const m = this.monitor(eventId);
    const now = this.now();
    return {
      protocolVersion: 1,
      simulated: true,
      serverTime: now.toISOString(),
      revision: m.revision,
      timer: m.timer,
      hint:
        m.hint && (!m.hint.expiresAt || Date.parse(m.hint.expiresAt) > now.getTime())
          ? m.hint
          : null,
    };
  }

  /** Display links (P5): random token, only its hash is stored. */
  createLink(
    eventId: string,
    actor: LiveActor,
    label: string,
    validHours: number | null,
  ): MonitorLink & { token: string } {
    const token = randomBytes(32).toString("base64url");
    const now = this.now();
    const link: MonitorLink = {
      id: randomUUID(),
      label,
      createdAt: now.toISOString(),
      createdBy: actor.displayName,
      expiresAt: validHours
        ? new Date(now.getTime() + validHours * 3600_000).toISOString()
        : null,
    };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO live_monitor_links VALUES(?,?,?,?,?,?,?,NULL,NULL)")
        .run(link.id, eventId, tokenHash(token), label, link.createdAt, actor.displayName, link.expiresAt);
      this.log(eventId, null, "monitor.link.create", null, actor, `Anzeige-Link „${label}“ erstellt`);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return { ...link, token };
  }
  links(eventId: string): MonitorLink[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM live_monitor_links WHERE event_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at",
        )
        .all(eventId, this.now().toISOString()) as Record<string, string | null>[]
    ).map((r) => ({
      id: String(r.id),
      label: String(r.label),
      createdAt: String(r.created_at),
      createdBy: String(r.created_by),
      expiresAt: r.expires_at,
    }));
  }
  revokeLink(eventId: string, linkId: string, actor: LiveActor) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = this.db
        .prepare(
          "UPDATE live_monitor_links SET revoked_at=?,revoked_by=? WHERE id=? AND event_id=? AND revoked_at IS NULL RETURNING label",
        )
        .get(this.now().toISOString(), actor.displayName, linkId, eventId) as
        | { label: string }
        | undefined;
      if (r) this.log(eventId, null, "monitor.link.revoke", null, actor, `Anzeige-Link „${r.label}“ widerrufen`);
      this.db.exec("COMMIT");
      return !!r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  /** Event of a valid (not revoked, not expired) display token, else null. */
  linkEvent(token: string): string | null {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const r = this.db
      .prepare(
        "SELECT event_id FROM live_monitor_links WHERE token_hash=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)",
      )
      .get(tokenHash(token), this.now().toISOString()) as { event_id: string } | undefined;
    return r?.event_id ?? null;
  }

  /** Events after a sequence. A different epoch or a gap requires a snapshot. */
  events(eventId: string, epoch: string | undefined, after: number) {
    const current = this.sequence();
    if (epoch !== this.epoch || after > current)
      return { epoch: this.epoch, snapshotRequired: true, events: [] as LiveEvent[] };
    const events = (
      this.db
        .prepare(
          "SELECT * FROM live_events WHERE event_id=? AND sequence>? ORDER BY sequence LIMIT 201",
        )
        .all(eventId, after) as Record<string, unknown>[]
    ).map(
      (e): LiveEvent => ({
        sequence: Number(e.sequence),
        type: String(e.type),
        runId: (e.run_id as string | null) ?? null,
        liveRevision: (e.live_revision as number | null) ?? null,
        actorId: String(e.actor_id),
        actorName: String(e.actor_name),
        at: String(e.at),
        summary: String(e.summary),
      }),
    );
    // More than 200 missing events: let the client reload the full state.
    if (events.length > 200)
      return { epoch: this.epoch, snapshotRequired: true, events: [] };
    return { epoch: this.epoch, snapshotRequired: false, events };
  }

  history(eventId: string, limit = 100): LiveEvent[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM live_events WHERE event_id=? ORDER BY sequence DESC LIMIT ?",
        )
        .all(eventId, limit) as Record<string, unknown>[]
    )
      .map((e) => ({
        sequence: Number(e.sequence),
        type: String(e.type),
        runId: (e.run_id as string | null) ?? null,
        liveRevision: (e.live_revision as number | null) ?? null,
        actorId: String(e.actor_id),
        actorName: String(e.actor_name),
        at: String(e.at),
        summary: String(e.summary),
      }))
      .reverse();
  }

  /**
   * Execute one command. Order is the server's processing order (single
   * synchronous SQLite transaction per command); client timestamps play no role.
   */
  async execute(
    actor: LiveActor,
    rights: LiveRights,
    raw: unknown,
    /** Current rights after slow checks (session, block or role may change). */
    recheck: () => LiveRights = () => rights,
  ): Promise<LiveCommandResult> {
    const cmd = liveCommand.parse(raw);
    const hash = createHash("sha256")
      .update(stable({ actor: actor.id, cmd }))
      .digest("hex");
    const known = this.db
      .prepare("SELECT actor_id,request_hash,result_json FROM live_commands WHERE command_id=?")
      .get(cmd.commandId) as
      | { actor_id: string; request_hash: string; result_json: string }
      | undefined;
    if (known) return this.replay(cmd, known, actor, hash);
    let verified: { status: string; errors: string[] } | null = null;
    try {
      if (operateCommands.includes(cmd.type) && !rights.operate)
        throw new Refusal(
          403,
          "FORBIDDEN",
          "Livebedienung erfordert Admin oder die Rolle „live“ bzw. „technik“.",
        );
      if (activationCommands.includes(cmd.type) && !rights.activate)
        throw new Refusal(
          403,
          "FORBIDDEN",
          "Liveaktivierung erfordert Admin oder die Rolle „technik“.",
        );
      if (cmd.type === "stand.activate") {
        if (this.source.eventOf(cmd.payload.packageId) !== cmd.eventId)
          throw new Refusal(404, "PACKAGE", "Paket gehört nicht zu dieser Veranstaltung.");
        // Hashing files is slow; the stand revision is rechecked afterwards.
        verified = await this.source.verify(cmd.payload.packageId);
        if (verified.status !== "valid")
          throw new Refusal(
            422,
            "PACKAGE_INVALID",
            "Paket ist nicht vollständig geprüft: " + verified.errors.slice(0, 3).join(" "),
          );
        if (!recheck().activate)
          throw new Refusal(403, "FORBIDDEN", "Berechtigung inzwischen entzogen.");
      }
      if (cmd.type === "stand.rollback") {
        // D009 5 applies to the return as well: full file check first. The
        // stand revision inside the transaction pins the same previous stand.
        const previous = this.stand(cmd.eventId).previous_package_id;
        if (previous) {
          verified = await this.source.verify(previous);
          if (verified.status !== "valid")
            throw new Refusal(
              422,
              "PACKAGE_INVALID",
              "Vorheriger Datenstand ist nicht mehr vollständig: " +
                verified.errors.slice(0, 3).join(" "),
            );
          if (!recheck().activate)
            throw new Refusal(403, "FORBIDDEN", "Berechtigung inzwischen entzogen.");
        }
      }
    } catch (e) {
      if (e instanceof Refusal) return this.finish(cmd, actor, hash, e);
      throw e;
    }
    // A concurrent identical command may have finished while verifying.
    const late = this.db
      .prepare("SELECT actor_id,request_hash,result_json FROM live_commands WHERE command_id=?")
      .get(cmd.commandId) as
      | { actor_id: string; request_hash: string; result_json: string }
      | undefined;
    if (late) return this.replay(cmd, late, actor, hash);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = this.apply(cmd, actor);
      const result: LiveCommandResult = {
        commandId: cmd.commandId,
        accepted: true,
        replayed: false,
        status: 200,
        code: "OK",
        message: out.message,
        runId: out.runId,
        liveRevision: out.liveRevision,
        monitorRevision: out.monitorRevision ?? null,
        sequence: this.sequence(),
      };
      this.store(cmd, actor, hash, result);
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      if (e instanceof Refusal) return this.finish(cmd, actor, hash, e);
      throw e;
    }
  }
  private replay(
    cmd: LiveCommand,
    known: { actor_id: string; request_hash: string; result_json: string },
    actor: LiveActor,
    hash: string,
  ): LiveCommandResult {
    if (known.actor_id !== actor.id || known.request_hash !== hash)
      return {
        commandId: cmd.commandId,
        accepted: false,
        replayed: false,
        status: 409,
        code: "COMMAND_REUSED",
        message: "Befehlskennung wurde bereits für einen anderen Befehl verwendet.",
        runId: null,
        liveRevision: null,
        monitorRevision: null,
        sequence: this.sequence(),
      };
    return { ...(JSON.parse(known.result_json) as LiveCommandResult), replayed: true };
  }
  private finish(cmd: LiveCommand, actor: LiveActor, hash: string, e: Refusal) {
    const run =
      "runId" in cmd
        ? (this.db
            .prepare("SELECT live_revision FROM live_runs WHERE id=? AND event_id=?")
            .get(cmd.runId, cmd.eventId) as
            | { live_revision: number }
            | undefined)
        : undefined;
    const result: LiveCommandResult = {
      commandId: cmd.commandId,
      accepted: false,
      replayed: false,
      status: e.status,
      code: e.code,
      message: e.message,
      runId: "runId" in cmd ? cmd.runId : null,
      liveRevision: run?.live_revision ?? null,
      monitorRevision:
        "expectedMonitorRevision" in cmd ? this.monitor(cmd.eventId).revision : null,
      sequence: this.sequence(),
    };
    // Refusals are stored too: a retransmission must not execute later on a
    // changed state (no implicit queueing, D007 point 6).
    try {
      this.store(cmd, actor, hash, result);
    } catch {
      /* a parallel identical command stored first; the result is equivalent */
    }
    return result;
  }
  private store(cmd: LiveCommand, actor: LiveActor, hash: string, result: LiveCommandResult) {
    this.db
      .prepare("INSERT INTO live_commands VALUES(?,?,?,?,?)")
      .run(cmd.commandId, actor.id, hash, JSON.stringify(result), this.now().toISOString());
  }
  private log(
    eventId: string,
    runId: string | null,
    type: string,
    liveRevision: number | null,
    actor: LiveActor,
    summary: string,
  ) {
    this.db
      .prepare(
        "INSERT INTO live_events(event_id,run_id,type,live_revision,actor_id,actor_name,at,summary) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(eventId, runId, type, liveRevision, actor.id, actor.displayName, this.now().toISOString(), summary);
  }
  private run(cmd: LiveCommand & { runId: string; expectedLiveRevision: number }) {
    const r = this.db
      .prepare("SELECT * FROM live_runs WHERE id=? AND event_id=?")
      .get(cmd.runId, cmd.eventId) as RunRow | undefined;
    if (!r) throw new Refusal(404, "RUN", "Durchlauf nicht gefunden.");
    if (r.live_revision !== cmd.expectedLiveRevision) {
      const last = r.last_action_json
        ? (JSON.parse(r.last_action_json) as { type: string; by: string })
        : null;
      throw new Refusal(
        409,
        "LIVE_REVISION",
        "Livezustand hat sich inzwischen geändert" +
          (last ? ` (zuletzt ${actionLabel(last.type)} durch ${last.by})` : "") +
          ". Bitte aktuellen Stand prüfen und bewusst neu auslösen.",
      );
    }
    return r;
  }
  private touch(r: RunRow, actor: LiveActor, type: string, fields: Partial<RunRow>) {
    const next = { ...r, ...fields, live_revision: r.live_revision + 1 };
    next.last_action_json = JSON.stringify({
      type,
      by: actor.displayName,
      at: this.now().toISOString(),
    });
    this.db
      .prepare(
        "UPDATE live_runs SET status=?,live_revision=?,package_id=?,header_sha=?,next_cue_id=?,next_blocked=?,position_cue_id=?,at_end=?,output_json=?,last_action_json=?,passed_guard=? WHERE id=? AND live_revision=?",
      )
      .run(
        next.status,
        next.live_revision,
        next.package_id,
        next.header_sha,
        next.next_cue_id,
        next.next_blocked,
        next.position_cue_id,
        next.at_end,
        next.output_json,
        next.last_action_json,
        next.passed_guard,
        r.id,
        r.live_revision,
      );
    return next;
  }

  private apply(
    cmd: LiveCommand,
    actor: LiveActor,
  ): {
    message: string;
    runId: string | null;
    liveRevision: number | null;
    monitorRevision?: number;
  } {
    if (monitorCommands.includes(cmd.type))
      return this.applyMonitor(cmd as MonitorCommand, actor);
    switch (cmd.type) {
      case "stand.activate":
      case "stand.rollback":
        return this.switchStand(cmd, actor);
      case "run.create": {
        const stand = this.stand(cmd.eventId);
        if (!stand.package_id || !stand.header_sha)
          throw new Refusal(409, "NO_STAND", "Für diese Veranstaltung ist noch kein Datenstand aktiv.");
        const manifest = this.bound(stand.package_id, stand.header_sha);
        const show = manifest.shows.find((s) => s.id === cmd.payload.showId);
        if (!show) throw new Refusal(404, "SHOW", "Show ist im aktiven Datenstand nicht enthalten.");
        const id = randomUUID();
        this.db
          .prepare(
            "INSERT INTO live_runs(id,event_id,show_id,kind,status,live_revision,package_id,header_sha,created_at,created_by,last_action_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            id,
            cmd.eventId,
            show.id,
            cmd.payload.kind,
            "prepared",
            1,
            stand.package_id,
            stand.header_sha,
            this.now().toISOString(),
            actor.id,
            JSON.stringify({ type: cmd.type, by: actor.displayName, at: this.now().toISOString() }),
          );
        const summary = `${kindLabel[cmd.payload.kind]} „${show.name}“ angelegt`;
        this.log(cmd.eventId, id, cmd.type, 1, actor, summary);
        return { message: summary, runId: id, liveRevision: 1 };
      }
      case "run.start": {
        const r = this.run(cmd);
        if (r.status !== "prepared")
          throw new Refusal(409, "RUN_STATE", "Durchlauf ist nicht im Zustand „vorbereitet“.");
        if (
          r.kind === "auffuehrung" &&
          this.db
            .prepare("SELECT 1 FROM live_runs WHERE event_id=? AND kind='auffuehrung' AND status='running'")
            .get(cmd.eventId)
        )
          throw new Refusal(
            409,
            "RUN_ACTIVE",
            "Es läuft bereits eine Aufführung. Diese zuerst ausdrücklich beenden.",
          );
        const cues = this.cues(this.bound(r.package_id, r.header_sha), r.show_id);
        let next = this.following(cues, null);
        if (cmd.payload.startCueId) {
          const start = cues.find((c) => c.id === cmd.payload.startCueId);
          if (!start?.enabled)
            throw new Refusal(422, "CUE", "Starteinsatz ist nicht vorhanden oder deaktiviert.");
          next = start.id;
        }
        // D012 point 2: start prepares the first cue, it does not trigger it.
        const n = this.touch(r, actor, cmd.type, {
          status: "running",
          next_cue_id: next,
          next_blocked: null,
          at_end: next ? 0 : 1,
          passed_guard: null,
        });
        const name = cues.find((c) => c.id === next)?.name;
        const summary = "Durchlauf gestartet" + (name ? ` · nächster Einsatz „${name}“` : " · keine aktiven Einsätze");
        this.log(cmd.eventId, r.id, cmd.type, n.live_revision, actor, summary);
        return { message: summary, runId: r.id, liveRevision: n.live_revision };
      }
      case "cue.prepare": {
        const r = this.run(cmd);
        if (r.status !== "running")
          throw new Refusal(409, "RUN_STATE", "Der Durchlauf läuft nicht.");
        const cue = this.cues(this.bound(r.package_id, r.header_sha), r.show_id).find(
          (c) => c.id === cmd.payload.cueId,
        );
        if (!cue?.enabled)
          throw new Refusal(422, "CUE", "Einsatz ist nicht vorhanden oder deaktiviert.");
        // Preparing a new cue keeps the stand-switch guard for the cues that
        // were already passed; consciously preparing one of those (a replay)
        // ends the guard, because the director chose to go back.
        const guard = r.passed_guard ? (JSON.parse(r.passed_guard) as string[]) : [];
        const n = this.touch(r, actor, cmd.type, {
          next_cue_id: cue.id,
          next_blocked: null,
          at_end: 0,
          passed_guard: guard.includes(cue.id) ? null : r.passed_guard,
        });
        const summary = `Nächster Einsatz – gemeinsam: „${cue.name}“`;
        this.log(cmd.eventId, r.id, cmd.type, n.live_revision, actor, summary);
        return { message: summary, runId: r.id, liveRevision: n.live_revision };
      }
      case "cue.go": {
        const r = this.run(cmd);
        if (r.status !== "running")
          throw new Refusal(409, "RUN_STATE", "Der Durchlauf läuft nicht.");
        if (r.next_blocked)
          throw new Refusal(
            409,
            "GO_LOCKED",
            "GO gesperrt: Der nächste Einsatz hat sich durch den neuen Datenstand geändert. Bitte bewusst neu vorbereiten.",
          );
        if (!r.next_cue_id)
          throw new Refusal(409, "AT_END", "Ablaufende: kein nächster Einsatz markiert.");
        if (r.next_cue_id !== cmd.payload.expectedNextCueId)
          throw new Refusal(409, "GO_TARGET", "Der markierte nächste Einsatz ist ein anderer. Bitte prüfen.");
        const manifest = this.bound(r.package_id, r.header_sha);
        const cues = this.cues(manifest, r.show_id);
        const cue = cues.find((c) => c.id === r.next_cue_id && c.enabled);
        if (!cue) throw new Refusal(409, "GO_TARGET", "Nächster Einsatz nicht mehr vorhanden.");
        const output: LiveOutput = {
          cueId: cue.id,
          name: cue.name,
          sceneId: cue.sceneId,
          sceneName: cue.sceneName,
          packageId: r.package_id,
          eventRevision: manifest.eventRevision,
          takenAt: this.now().toISOString(),
          takenBy: actor.displayName,
        };
        const next = this.following(cues, cue.id);
        // D009 6/7, D012 10: a cue that was already passed before a stand
        // switch never becomes the next GO target silently.
        const guard = r.passed_guard ? (JSON.parse(r.passed_guard) as string[]) : [];
        const guarded = !!next && guard.includes(next);
        const n = this.touch(r, actor, cmd.type, {
          output_json: JSON.stringify(output),
          position_cue_id: cue.id,
          next_cue_id: next,
          next_blocked: guarded ? "next_moved" : null,
          at_end: next ? 0 : 1,
        });
        const summary =
          `GO „${cue.name}“ (Simulation)` +
          (!next
            ? " · Ablaufende"
            : guarded
              ? " · nächster Einsatz lag vor dem Standwechsel bereits hinter der Position, GO gesperrt bis zur Bestätigung"
              : "");
        this.log(cmd.eventId, r.id, cmd.type, n.live_revision, actor, summary);
        return { message: summary, runId: r.id, liveRevision: n.live_revision };
      }
      case "run.end": {
        const r = this.run(cmd);
        if (r.status === "ended")
          throw new Refusal(409, "RUN_STATE", "Durchlauf ist bereits beendet.");
        // D012 point 6: no undocumented global stop; the simulated output stays
        // as it is until a defined closing action exists.
        const n = this.touch(r, actor, cmd.type, { status: "ended", next_cue_id: null, next_blocked: null });
        const summary = "Durchlauf beendet · Ausgabe unverändert (keine Abschlussaktion festgelegt)";
        this.log(cmd.eventId, r.id, cmd.type, n.live_revision, actor, summary);
        return { message: summary, runId: r.id, liveRevision: n.live_revision };
      }
    }
    throw new Refusal(400, "COMMAND", "Unbekannter Befehl.");
  }

  /**
   * Stage timer and hints (Issue #41, D024). The local server's clock is
   * authoritative: the state stores value and anchor, displays add the time
   * since the anchor using their measured clock offset.
   */
  private applyMonitor(cmd: MonitorCommand, actor: LiveActor) {
    const row = this.db
      .prepare("SELECT * FROM live_monitors WHERE event_id=?")
      .get(cmd.eventId) as MonitorRow | undefined;
    const revision = row?.revision ?? 0;
    if (revision !== cmd.expectedMonitorRevision) {
      const last = row?.last_action_json
        ? (JSON.parse(row.last_action_json) as { type: string; by: string })
        : null;
      throw new Refusal(
        409,
        "MONITOR_REVISION",
        "Bühnenmonitor hat sich inzwischen geändert" +
          (last ? ` (zuletzt ${actionLabel(last.type)} durch ${last.by})` : "") +
          ". Bitte aktuellen Stand prüfen und bewusst neu auslösen.",
      );
    }
    const now = this.now();
    const nowMs = now.getTime();
    let timer = row?.timer_json ? (JSON.parse(row.timer_json) as MonitorTimer) : null;
    let hint = row?.hint_json ? (JSON.parse(row.hint_json) as MonitorHint) : null;
    const clockMode = (t: MonitorTimer) => (t.mode === "elapsed" ? "elapsed" : "countdown");
    const clock = (t: MonitorTimer): PreviewClock => ({
      valueMs: t.valueMs,
      anchorMs: t.anchorAt ? Date.parse(t.anchorAt) : null,
    });
    const store = (t: MonitorTimer, c: PreviewClock): MonitorTimer => ({
      ...t,
      valueMs: c.valueMs,
      anchorAt: c.anchorMs === null ? null : new Date(c.anchorMs).toISOString(),
    });
    const needTimer = () => {
      if (!timer)
        throw new Refusal(409, "NO_TIMER", "Es ist kein Timer geladen.");
      return timer;
    };
    const noTarget = (t: MonitorTimer) => {
      if (t.mode === "target")
        throw new Refusal(
          409,
          "TIMER_MODE",
          "Eine Zieluhrzeit läuft unabhängig und lässt sich nicht pausieren oder zurücksetzen. Bitte korrigieren oder neu laden.",
        );
    };
    let summary: string;
    switch (cmd.type) {
      case "timer.load": {
        const stand = this.stand(cmd.eventId);
        if (!stand.package_id || !stand.header_sha)
          throw new Refusal(409, "NO_STAND", "Für diese Veranstaltung ist noch kein Datenstand aktiv.");
        const manifest = this.bound(stand.package_id, stand.header_sha);
        const show = manifest.shows.find((s) => s.id === cmd.payload.showId);
        if (!show) throw new Refusal(404, "SHOW", "Show ist im aktiven Datenstand nicht enthalten.");
        const draft = manifest.timers?.find((t) => t.showId === show.id);
        const preset = draft?.preset ?? defaultTimerPreparation;
        const base = {
          showId: show.id,
          showName: show.name,
          draftRevision: draft?.revision ?? null,
          started: false,
          warningSeconds: preset.warningSeconds,
          normalColor: preset.normalColor,
          warningColor: preset.warningColor,
          overrunColor: preset.overrunColor,
          showOverrun: preset.showOverrun,
        };
        if (cmd.payload.targetAt) {
          if (cmd.payload.durationSeconds !== undefined)
            throw new Refusal(422, "TIMER", "Zieluhrzeit und Dauer schließen sich aus.");
          const target = Date.parse(cmd.payload.targetAt);
          if (target <= nowMs || target - nowMs > 86400_000)
            throw new Refusal(422, "TIMER", "Die Zieluhrzeit muss in den nächsten 24 Stunden liegen.");
          timer = {
            ...base,
            mode: "target",
            targetAt: new Date(target).toISOString(),
            initialMs: target - nowMs,
            valueMs: target - nowMs,
            anchorAt: now.toISOString(),
            started: true,
          };
        } else {
          const seconds =
            preset.mode === "countdown"
              ? (cmd.payload.durationSeconds ?? preset.durationSeconds)
              : 0;
          if (preset.mode === "elapsed" && cmd.payload.durationSeconds !== undefined)
            throw new Refusal(422, "TIMER", "Eine Laufzeit hat keine Dauer.");
          timer = {
            ...base,
            mode: preset.mode,
            targetAt: null,
            initialMs: seconds * 1000,
            valueMs: seconds * 1000,
            anchorAt: null,
          };
        }
        summary =
          `Timer für „${show.name}“ geladen` +
          (timer.mode === "target"
            ? ` · Zieluhrzeit ${clockTime(timer.targetAt!)} läuft`
            : timer.mode === "countdown"
              ? ` · Countdown ${formatClock(timer.initialMs)}`
              : " · Laufzeit") +
          (draft ? "" : " · Standardwerte (kein Entwurf im Paket)");
        break;
      }
      case "timer.start":
      case "timer.resume": {
        const t = needTimer();
        noTarget(t);
        if (t.anchorAt) throw new Refusal(409, "TIMER_STATE", "Der Timer läuft bereits.");
        if (cmd.type === "timer.start" && t.started)
          throw new Refusal(409, "TIMER_STATE", "Der Timer wurde bereits gestartet. Bitte fortsetzen oder zurücksetzen.");
        if (cmd.type === "timer.resume" && !t.started)
          throw new Refusal(409, "TIMER_STATE", "Der Timer wurde noch nicht gestartet.");
        timer = { ...t, started: true, anchorAt: now.toISOString() };
        summary = cmd.type === "timer.start" ? "Timer gestartet" : "Timer fortgesetzt";
        break;
      }
      case "timer.pause": {
        const t = needTimer();
        noTarget(t);
        if (!t.anchorAt) throw new Refusal(409, "TIMER_STATE", "Der Timer läuft nicht.");
        timer = store(t, { valueMs: clockValue(clock(t), clockMode(t), nowMs), anchorMs: null });
        summary = `Timer pausiert bei ${formatClock(timer.valueMs)}`;
        break;
      }
      case "timer.reset": {
        const t = needTimer();
        noTarget(t);
        timer = { ...t, valueMs: t.initialMs, anchorAt: null, started: false };
        summary = "Timer zurückgesetzt";
        break;
      }
      case "timer.adjust": {
        const t = needTimer();
        const delta = cmd.payload.deltaSeconds;
        timer = store(t, correctClock(clock(t), clockMode(t), nowMs, delta));
        if (timer.mode === "elapsed" && timer.valueMs < 0)
          timer = { ...timer, valueMs: 0 };
        if (timer.mode === "target")
          timer = {
            ...timer,
            targetAt: new Date(Date.parse(t.targetAt!) + delta * 1000).toISOString(),
          };
        summary = `Zeit korrigiert um ${delta > 0 ? "+" : "−"}${formatClock(Math.abs(delta) * 1000)}`;
        break;
      }
      case "timer.clear": {
        needTimer();
        timer = null;
        summary = "Timer ausgeblendet";
        break;
      }
      case "hint.show": {
        const p = cmd.payload;
        hint = {
          text: p.text,
          layout: p.layout,
          shownAt: now.toISOString(),
          expiresAt: p.expirySeconds
            ? new Date(nowMs + p.expirySeconds * 1000).toISOString()
            : null,
        };
        summary =
          `Hinweis „${p.text.length > 60 ? p.text.slice(0, 57) + "…" : p.text}“ angezeigt` +
          (p.layout === "replace" ? " anstelle des Timers" : "") +
          (p.expirySeconds ? ` · Ablauf ${p.expirySeconds} s` : "");
        break;
      }
      case "hint.hide": {
        if (!hint || (hint.expiresAt && Date.parse(hint.expiresAt) <= nowMs))
          throw new Refusal(409, "NO_HINT", "Es wird kein Hinweis angezeigt.");
        hint = null;
        summary = "Hinweis ausgeblendet";
        break;
      }
    }
    const next = revision + 1;
    this.db
      .prepare(
        "INSERT INTO live_monitors VALUES(?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET revision=excluded.revision,timer_json=excluded.timer_json,hint_json=excluded.hint_json,last_action_json=excluded.last_action_json",
      )
      .run(
        cmd.eventId,
        next,
        timer ? JSON.stringify(timer) : null,
        hint ? JSON.stringify(hint) : null,
        JSON.stringify({ type: cmd.type, by: actor.displayName, at: now.toISOString() }),
      );
    this.log(cmd.eventId, null, cmd.type, null, actor, summary);
    return { message: summary, runId: null, liveRevision: null, monitorRevision: next };
  }

  /** D009: complete activation or none; running output stays as it is. */
  private switchStand(
    cmd: Extract<LiveCommand, { type: "stand.activate" | "stand.rollback" }>,
    actor: LiveActor,
  ) {
    const stand = this.stand(cmd.eventId);
    if (stand.revision !== cmd.payload.expectedStandRevision)
      throw new Refusal(
        409,
        "STAND_REVISION",
        "Der aktive Datenstand wurde inzwischen geändert. Bitte Übersicht neu prüfen.",
      );
    let target: { packageId: string; headerSha: string };
    if (cmd.type === "stand.activate") {
      let m: { manifest: TransferManifest; headerHash: string };
      try {
        m = this.source.manifest(cmd.payload.packageId);
      } catch {
        throw new Refusal(404, "PACKAGE", "Paket nicht vorhanden.");
      }
      if (m.manifest.eventId !== cmd.eventId)
        throw new Refusal(404, "PACKAGE", "Paket gehört nicht zu dieser Veranstaltung.");
      if (stand.package_id === cmd.payload.packageId && stand.header_sha === m.headerHash)
        throw new Refusal(409, "STAND_SAME", "Dieser Datenstand ist bereits aktiv.");
      target = { packageId: cmd.payload.packageId, headerSha: m.headerHash };
    } else {
      if (!stand.previous_package_id || !stand.previous_header_sha)
        throw new Refusal(409, "NO_PREVIOUS", "Es gibt keinen vorherigen Datenstand.");
      target = { packageId: stand.previous_package_id, headerSha: stand.previous_header_sha };
    }
    const manifest = this.bound(target.packageId, target.headerSha);
    const runs = this.db
      .prepare("SELECT * FROM live_runs WHERE event_id=? AND status!='ended'")
      .all(cmd.eventId) as RunRow[];
    // Check all open runs first; any missing show refuses the whole switch.
    for (const r of runs)
      if (!manifest.shows.some((s) => s.id === r.show_id))
        throw new Refusal(
          409,
          "RUN_SHOW_MISSING",
          "Ein offener Durchlauf verwendet eine Show, die im neuen Stand fehlt. Durchlauf zuerst beenden.",
        );
    const now = this.now().toISOString();
    this.db
      .prepare(
        "INSERT INTO live_stands VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET revision=excluded.revision,package_id=excluded.package_id,header_sha=excluded.header_sha,activated_at=excluded.activated_at,activated_by=excluded.activated_by,previous_package_id=excluded.previous_package_id,previous_header_sha=excluded.previous_header_sha",
      )
      .run(
        cmd.eventId,
        stand.revision + 1,
        target.packageId,
        target.headerSha,
        now,
        actor.displayName,
        stand.package_id,
        stand.header_sha,
      );
    const label = cmd.type === "stand.activate" ? "aktiviert" : "zurückgekehrt zu";
    this.log(
      cmd.eventId,
      null,
      cmd.type,
      null,
      actor,
      `Datenstand ${label} Revision ${manifest.eventRevision}`,
    );
    for (const r of runs) {
      let old: TransferManifest;
      try {
        old = this.bound(r.package_id, r.header_sha);
      } catch {
        throw new Refusal(
          409,
          "RUN_STAND_MISSING",
          "Das Paket eines offenen Durchlaufs fehlt lokal oder wurde verändert. Diesen Durchlauf zuerst beenden.",
        );
      }
      const oldCues = this.cues(old, r.show_id),
        cues = this.cues(manifest, r.show_id);
      let blocked: BlockReason | null = r.next_blocked;
      let next = r.next_cue_id,
        atEnd = r.at_end;
      let guard = r.passed_guard;
      if (r.status === "running") {
        const at = r.position_cue_id
          ? oldCues.findIndex((c) => c.id === r.position_cue_id)
          : -1;
        if (at >= 0)
          guard = JSON.stringify([
            ...new Set([
              ...(r.passed_guard ? (JSON.parse(r.passed_guard) as string[]) : []),
              ...oldCues.slice(0, at + 1).map((c) => c.id),
            ]),
          ]);
        if (r.position_cue_id && !cues.some((c) => c.id === r.position_cue_id))
          blocked ??= "position_removed";
        if (next) {
          const before = this.fingerprint(old, r.show_id, next),
            after = this.fingerprint(manifest, r.show_id, next);
          const nextNow = cues.find((c) => c.id === next);
          if (!after || !nextNow?.enabled) blocked = "next_removed";
          else if (before !== after) blocked = "next_changed";
          else
            blocked ??= this.orderChange(oldCues, cues, r.position_cue_id, next);
        } else if (atEnd && r.position_cue_id) {
          // D009 6 / D012 10: only cues that are new behind the unchanged
          // position may follow "Ablaufende", and only after a conscious
          // confirmation. Reordered old cues never come back silently.
          const candidate = cues.some((c) => c.id === r.position_cue_id)
            ? this.following(cues, r.position_cue_id)
            : null;
          if (candidate && !oldCues.some((c) => c.id === candidate)) {
            next = candidate;
            atEnd = 0;
            blocked = "cues_inserted";
          }
        }
      }
      const n = this.touch(r, actor, cmd.type, {
        package_id: target.packageId,
        header_sha: target.headerSha,
        next_cue_id: next,
        next_blocked: blocked,
        at_end: atEnd,
        passed_guard: guard,
      });
      this.log(
        cmd.eventId,
        r.id,
        "stand.rebound",
        n.live_revision,
        actor,
        blocked
          ? "Neuer Datenstand · GO gesperrt, nächsten Einsatz bewusst bestätigen"
          : "Neuer Datenstand übernommen · laufende Ausgabe unverändert",
      );
    }
    return {
      message: `Datenstand ${label} Revision ${manifest.eventRevision}`,
      runId: null,
      liveRevision: null,
    };
  }
}

type MonitorCommand = Extract<LiveCommand, { expectedMonitorRevision: number }>;
const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

export function actionLabel(type: string) {
  return (
    {
      "stand.activate": "Aktivierung",
      "stand.rollback": "Rückkehr",
      "stand.rebound": "Standwechsel",
      "run.create": "Anlegen",
      "run.start": "Start",
      "cue.prepare": "Vorbereitung",
      "cue.go": "GO",
      "run.end": "Beenden",
      "timer.load": "Timer laden",
      "timer.start": "Timerstart",
      "timer.pause": "Timerpause",
      "timer.resume": "Timer fortsetzen",
      "timer.reset": "Timer zurücksetzen",
      "timer.adjust": "Zeitkorrektur",
      "timer.clear": "Timer ausblenden",
      "hint.show": "Hinweis",
      "hint.hide": "Hinweis ausblenden",
      "monitor.link.create": "Anzeige-Link",
      "monitor.link.revoke": "Linkwiderruf",
    }[type] ?? type
  );
}
