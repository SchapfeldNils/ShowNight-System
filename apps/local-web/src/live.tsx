// Showablauf Paket 1 (Issue #45, D007/D009/D011/D012, D021). Simulation only:
// no renderer take, no device, audio or HDMI output.
import { useEffect, useRef, useState } from "react";
import { SceneSketch } from "../../web/src/scenes.js";
import type { TransferManifest } from "../../../packages/contracts/src/transfer.js";
import type {
  LiveCommandResult,
  LiveCue,
  LiveEvent,
  LiveRun,
  LiveSnapshot,
} from "../../../packages/contracts/src/live.js";
import { MonitorControl } from "./monitor-control.js";
import type { ServerClock } from "./monitor.js";

type Pkg = { id: string; eventId: string; name: string; eventRevision: number };
type Me = { id: string; csrfToken: string; admin: boolean };
type Snapshot = LiveSnapshot & { history: LiveEvent[] };
type Api = <T>(path: string, body?: unknown) => Promise<T>;

const blockText = {
  next_changed:
    "Der nächste Einsatz wurde im neuen Datenstand geändert. GO ist gesperrt, bis er bewusst neu vorbereitet ist.",
  next_removed:
    "Der nächste Einsatz fehlt im neuen Datenstand oder ist deaktiviert. Bitte einen Einsatz bewusst vorbereiten.",
  next_moved:
    "Die Reihenfolge bis zum nächsten Einsatz hat sich geändert (verschoben, entfernt oder aktiviert/deaktiviert). GO ist gesperrt, bis der nächste Einsatz bewusst bestätigt ist.",
  cues_inserted:
    "Im neuen Datenstand wurden Einsätze vor dem nächsten Einsatz bzw. nach dem Ablaufende ergänzt. GO ist gesperrt, bis der nächste Einsatz bewusst bestätigt ist.",
  position_removed:
    "Der zuletzt ausgelöste Einsatz fehlt im neuen Datenstand. GO ist gesperrt, bis der nächste Einsatz bewusst bestätigt ist.",
};
const GO_LOCK_MS = 1000;
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export function LiveDirection({
  me,
  packages,
  api,
}: {
  me: Me;
  packages: Pkg[];
  api: Api;
}) {
  const events = [...new Map(packages.map((p) => [p.eventId, p])).values()];
  const [eventId, setEventId] = useState(events[0]?.eventId ?? "");
  const [snap, setSnap] = useState<Snapshot | null>(null),
    [runId, setRunId] = useState(""),
    [preview, setPreview] = useState<string | null>(null),
    [notice, setNotice] = useState<{ text: string; kind: "ok" | "error" } | null>(null),
    [foreign, setForeign] = useState<LiveEvent | null>(null),
    [busy, setBusy] = useState(false),
    [standPkg, setStandPkg] = useState(""),
    [confirmStand, setConfirmStand] = useState<"activate" | "rollback" | null>(null),
    [newShow, setNewShow] = useState(""),
    [newKind, setNewKind] = useState<"probe" | "auffuehrung">("probe");
  const [clock, setClock] = useState<ServerClock | null>(null);
  const [manifests, setManifests] = useState<Record<string, TransferManifest>>({});
  const requested = useRef(new Set<string>());
  const cursor = useRef<{ epoch: string; sequence: number } | null>(null);
  // GO safety: the target shown at the moment of pressing is sent, and GO is
  // briefly locked after the shared target changed, so a near-simultaneous
  // press of the other director cannot advance a second cue unnoticed.
  const armed = useRef<{ runId: string; cueId: string; rev: number } | null>(null);
  const [goLockedUntil, setGoLockedUntil] = useState(0);
  const lastTarget = useRef("");
  const meRef = useRef(me);
  meRef.current = me;

  const currentEvent = useRef(eventId);
  currentEvent.current = eventId;
  // A failed read is retried by the poll below (reading only; commands are
  // never resent). Without a cursor the poll reads a full snapshot again.
  const readFailed = useRef(false),
    readError = useRef(""),
    reading = useRef(false);
  const failRead = (e: unknown) => {
    readFailed.current = true;
    readError.current =
      (e as Error).message + " Ansicht wird automatisch erneut gelesen.";
    setNotice({ text: readError.current, kind: "error" });
  };
  async function load(id = eventId) {
    if (!id) return;
    const sent = performance.now();
    const s = await api<Snapshot>("/live/" + id);
    const received = performance.now();
    // Never render a malformed answer (e.g. an error body or older server).
    if (s?.protocolVersion !== 1 || !s.stand || !Array.isArray(s.runs) || !Array.isArray(s.history))
      throw new Error("Showablauf auf diesem Server nicht verfügbar.");
    // Late answers (other event, or older than what is shown) are discarded.
    const c = cursor.current;
    if (
      currentEvent.current !== id ||
      (c && c.epoch === s.authorityEpoch && s.sequence < c.sequence)
    )
      return;
    cursor.current = { epoch: s.authorityEpoch, sequence: s.sequence };
    setSnap(s);
    if (s.serverTime)
      setClock({ serverMs: Date.parse(s.serverTime), perfMs: sent + (received - sent) / 2 });
    // Recovered after a failed read: remove the reading error (command
    // results are separate notices and stay untouched).
    if (readFailed.current) {
      readFailed.current = false;
      setNotice((n) => (n?.kind === "error" && n.text === readError.current ? null : n));
    }
    for (const pid of new Set([
      s.stand.packageId,
      ...s.runs.map((r) => r.packageId),
      ...s.runs.map((r) => r.output?.packageId),
    ]))
      if (pid && !requested.current.has(pid)) {
        requested.current.add(pid);
        void api<TransferManifest>("/packages/" + pid)
          .then((m) => setManifests((all) => ({ ...all, [pid]: m })))
          .catch(() => requested.current.delete(pid));
      }
  }
  useEffect(() => {
    setSnap(null);
    cursor.current = null;
    void load().catch(failRead);
    // Short polling with epoch/sequence; a gap or restart loads a snapshot.
    const timer = setInterval(async () => {
      const c = cursor.current;
      if (!eventId || reading.current) return;
      if (!c) {
        reading.current = true;
        try {
          await load(eventId);
        } catch (e) {
          if (!readFailed.current) failRead(e);
        } finally {
          reading.current = false;
        }
        return;
      }
      try {
        const out = await api<{
          epoch: string;
          snapshotRequired: boolean;
          events: LiveEvent[];
        }>(`/live/${eventId}/events?epoch=${c.epoch}&after=${c.sequence}`);
        const mine = out.events.filter((e) => e.actorId !== meRef.current.id);
        if (mine.length) setForeign(mine[mine.length - 1]);
        if (out.snapshotRequired || out.events.length) await load(eventId);
      } catch {
        /* the next tick retries reading; commands are never resent */
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [eventId]);
  useEffect(() => {
    if (!foreign) return;
    const t = setTimeout(() => setForeign(null), 8000);
    return () => clearTimeout(t);
  }, [foreign]);

  async function send(
    type: string,
    payload: object,
    run?: LiveRun,
    monitorRevision?: number,
  ): Promise<LiveCommandResult | null> {
    setBusy(true);
    setNotice(null);
    const body = {
      protocolVersion: 1,
      commandId: crypto.randomUUID(),
      eventId,
      type,
      payload,
      ...(run ? { runId: run.id, expectedLiveRevision: run.liveRevision } : {}),
      ...(monitorRevision !== undefined ? { expectedMonitorRevision: monitorRevision } : {}),
    };
    try {
      const r = await fetch("/api/local/live/commands", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": me.csrfToken,
        },
        body: JSON.stringify(body),
      });
      const out = await r.json();
      const result = out as LiveCommandResult;
      if (typeof result.accepted !== "boolean")
        throw new Error(out.error?.message ?? "Befehl abgelehnt.");
      setNotice({ text: result.message, kind: result.accepted ? "ok" : "error" });
      return result;
    } catch (e) {
      // Unknown outcome: reload the state, never resend automatically.
      setNotice({
        text:
          (e as Error).message +
          " Ergebnis unbekannt – Zustand wird neu geladen, Befehl nicht wiederholt.",
        kind: "error",
      });
      return null;
    } finally {
      await load().catch(() => {});
      setBusy(false);
    }
  }

  const eventPackages = packages.filter((p) => p.eventId === eventId);
  const stand = snap?.stand;
  const standManifest = stand?.packageId ? manifests[stand.packageId] : undefined;
  // The shown (and GO-operated) run never changes implicitly (D012 4): the
  // first available run is pinned once; afterwards only the selection counts.
  useEffect(() => {
    if (!runId && snap?.runs.length) setRunId(snap.runs[0].id);
  }, [runId, snap]);
  useEffect(() => setRunId(""), [eventId]);
  const run = snap?.runs.find((r) => r.id === runId);
  const runManifest = run ? manifests[run.packageId] : undefined;
  const cue = (id: string | null | undefined): LiveCue | undefined =>
    run?.cues.find((c) => c.id === id);
  const sceneOf = (m: TransferManifest | undefined, id: string | null | undefined) =>
    id ? m?.scenes?.find((s) => s.id === id)?.definition : undefined;
  const previewCue = cue(preview);
  const nextCue = cue(run?.nextCueId);
  const operate = !!snap?.rights.operate;
  const running = run?.status === "running";
  const openRuns = snap?.runs.filter((r) => r.status !== "ended") ?? [];
  const target = eventPackages.find((p) => p.id === standPkg);
  const goKey = run ? `${run.id}:${run.nextCueId}:${run.positionCueId}` : "";
  useEffect(() => {
    const changed = lastTarget.current !== "" && goKey !== lastTarget.current;
    lastTarget.current = goKey;
    if (!changed) return;
    setGoLockedUntil(Date.now() + GO_LOCK_MS);
    const t = setTimeout(() => setGoLockedUntil(0), GO_LOCK_MS);
    return () => clearTimeout(t);
  }, [goKey]);

  return (
    <section className="live" aria-labelledby="live-title">
      <h2 id="live-title">Showablauf</h2>
      <p className="live-simulation" role="note">
        SIMULATION · GO ändert nur den Ablaufzustand auf diesem Server. Keine
        Bild-, Ton-, Licht- oder Geräteausgabe.
      </p>
      {events.length > 1 && (
        <label>
          Veranstaltung
          <select aria-label="Veranstaltung" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {events.map((p) => (
              <option key={p.eventId} value={p.eventId}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!events.length && <p>Keine vorbereitete Veranstaltung verfügbar.</p>}
      {notice && (
        <p role={notice.kind === "error" ? "alert" : "status"} className={"live-" + notice.kind}>
          {notice.text}
        </p>
      )}
      {foreign && (
        <p className="live-foreign" role="status">
          {foreign.actorName}: {foreign.summary} · {time(foreign.at)}
        </p>
      )}
      {snap && (
        <>
          <article aria-label="Aktiver Datenstand">
            <h3>Aktiver Datenstand</h3>
            {stand?.packageId ? (
              <p>
                Revision {stand.eventRevision ?? "?"} · aktiviert{" "}
                {stand.activatedAt && new Date(stand.activatedAt).toLocaleString("de-DE")} durch{" "}
                {stand.activatedBy}
              </p>
            ) : (
              <p>Noch kein Datenstand aktiv.</p>
            )}
            {snap.rights.activate && (
              <div className="live-stand">
                <label>
                  Paket für Aktivierung
                  <select
                    aria-label="Paket für Aktivierung"
                    value={standPkg}
                    onChange={(e) => {
                      setStandPkg(e.target.value);
                      setConfirmStand(null);
                    }}
                  >
                    <option value="">Paket wählen</option>
                    {eventPackages.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.id === stand?.packageId}>
                        Revision {p.eventRevision}
                        {p.id === stand?.packageId ? " · aktiv" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="secondary"
                  disabled={!target || busy}
                  onClick={() => setConfirmStand("activate")}
                >
                  Aktivierung vorbereiten
                </button>
                {stand?.previousPackageId && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setConfirmStand("rollback")}
                  >
                    Zum vorherigen Stand zurückkehren
                  </button>
                )}
              </div>
            )}
            {confirmStand && (
              <div className="live-confirm" role="group" aria-label="Aktivierung bestätigen">
                <p>
                  {confirmStand === "activate"
                    ? `Revision ${target?.eventRevision} vollständig prüfen und aktivieren.`
                    : `Zurück zu Revision ${stand?.previousEventRevision ?? "?"}.`}{" "}
                  Betroffene offene Durchläufe: {openRuns.length}. Laufende
                  Ausgaben bleiben unverändert; ein geänderter nächster Einsatz
                  sperrt GO bis zur bewussten Bestätigung. Musik wird nicht
                  automatisch gestartet.
                </p>
                <button
                  disabled={busy}
                  onClick={async () => {
                    const r =
                      confirmStand === "activate"
                        ? await send("stand.activate", {
                            packageId: standPkg,
                            expectedStandRevision: stand?.revision ?? 0,
                          })
                        : await send("stand.rollback", {
                            expectedStandRevision: stand?.revision ?? 0,
                          });
                    if (r?.accepted) setConfirmStand(null);
                  }}
                >
                  {confirmStand === "activate" ? "Jetzt aktivieren" : "Jetzt zurückkehren"}
                </button>
                <button className="secondary" onClick={() => setConfirmStand(null)}>
                  Abbrechen
                </button>
              </div>
            )}
          </article>
          <article aria-label="Durchläufe">
            <h3>Durchläufe</h3>
            {snap.runs.length > 0 && (
              <label>
                Durchlauf
                <select aria-label="Durchlauf" value={runId} onChange={(e) => setRunId(e.target.value)}>
                  {snap.runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.showName} · {r.kind === "probe" ? "Probe" : "Aufführung"} ·{" "}
                      {{ prepared: "vorbereitet", running: "läuft", ended: "beendet" }[r.status]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {operate && standManifest && (
              <div className="live-stand">
                <label>
                  Show
                  <select aria-label="Show" value={newShow} onChange={(e) => setNewShow(e.target.value)}>
                    <option value="">Show wählen</option>
                    {standManifest.shows.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Art
                  <select
                    aria-label="Art des Durchlaufs"
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value as "probe" | "auffuehrung")}
                  >
                    <option value="probe">Probe</option>
                    <option value="auffuehrung">Aufführung</option>
                  </select>
                </label>
                <button
                  className="secondary"
                  disabled={!newShow || busy}
                  onClick={async () => {
                    const r = await send("run.create", { showId: newShow, kind: newKind });
                    if (r?.accepted && r.runId) setRunId(r.runId);
                  }}
                >
                  Durchlauf anlegen
                </button>
              </div>
            )}
          </article>
          {run && (
            <article aria-label="Regie" className="live-run">
              <h3>
                {run.showName} · {run.kind === "probe" ? "Probe" : "Aufführung"}
              </h3>
              <p>
                Status: {{ prepared: "vorbereitet", running: "läuft", ended: "beendet" }[run.status]} ·
                Datenstand Revision {run.eventRevision} · Liverevision {run.liveRevision}
                {run.lastAction &&
                  ` · zuletzt ${run.lastAction.by}, ${time(run.lastAction.at)}`}
              </p>
              <div className="live-panels">
                <div className="live-panel" aria-label="Publikumsausgabe (Simulation)" role="region">
                  <h4>Publikumsausgabe (Simulation)</h4>
                  {run.output ? (
                    <>
                      <p className="live-big">{run.output.name}</p>
                      <p className="muted">
                        GO durch {run.output.takenBy} · {time(run.output.takenAt)} · Stand
                        Revision {run.output.eventRevision}
                      </p>
                      {sceneOf(manifests[run.output.packageId], run.output.sceneId) && (
                        <SceneSketch
                          definition={sceneOf(manifests[run.output.packageId], run.output.sceneId)!}
                        />
                      )}
                    </>
                  ) : (
                    <p className="muted">Noch keine Ausgabe in diesem Durchlauf.</p>
                  )}
                </div>
                <div className="live-panel" aria-label="Meine Vorschau" role="region">
                  <h4>Meine Vorschau</h4>
                  {previewCue ? (
                    <>
                      <p className="live-big">{previewCue.name}</p>
                      <p className="muted">{previewCue.triggerHint}</p>
                      {sceneOf(runManifest, previewCue.sceneId) && (
                        <SceneSketch definition={sceneOf(runManifest, previewCue.sceneId)!} />
                      )}
                      {operate && running && (
                        <button
                          className="secondary"
                          disabled={busy || !previewCue.enabled || previewCue.id === run.nextCueId && !run.nextBlocked}
                          onClick={() => void send("cue.prepare", { cueId: previewCue.id }, run)}
                        >
                          Als nächsten Einsatz vorbereiten
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="muted">
                      Einsatz in der Liste anklicken. Die Vorschau ist persönlich und
                      ändert weder Ausgabe noch den nächsten Einsatz.
                    </p>
                  )}
                </div>
                <div className="live-panel live-next" aria-label="Nächster Einsatz – gemeinsam" role="region">
                  <h4>Nächster Einsatz – gemeinsam</h4>
                  {run.atEnd && running ? (
                    <p className="live-big">Ablaufende</p>
                  ) : nextCue ? (
                    <p className="live-big">{nextCue.name}</p>
                  ) : (
                    <p className="muted">Kein nächster Einsatz markiert.</p>
                  )}
                  {run.nextBlocked && (
                    <p role="alert">{blockText[run.nextBlocked]}</p>
                  )}
                  {operate && running && nextCue && (
                    <button
                      className="live-go"
                      disabled={busy || !!run.nextBlocked || goLockedUntil > Date.now()}
                      onPointerDown={() => {
                        armed.current = { runId: run.id, cueId: nextCue.id, rev: run.liveRevision };
                      }}
                      onPointerLeave={() => {
                        armed.current = null;
                      }}
                      onPointerCancel={() => {
                        armed.current = null;
                      }}
                      onClick={() => {
                        const a =
                          armed.current?.runId === run.id
                            ? armed.current
                            : { runId: run.id, cueId: nextCue.id, rev: run.liveRevision };
                        armed.current = null;
                        void send(
                          "cue.go",
                          { expectedNextCueId: a.cueId },
                          { ...run, liveRevision: a.rev },
                        );
                      }}
                    >
                      {goLockedUntil > Date.now()
                        ? `GO-Ziel geändert · ${nextCue.name}`
                        : `GO · ${nextCue.name}`}
                    </button>
                  )}
                </div>
              </div>
              <h4>Ablauf</h4>
              <ol className="live-cues">
                {run.cues.map((c) => (
                  <li
                    key={c.id}
                    className={[
                      c.enabled ? "" : "disabled",
                      c.id === run.output?.cueId ? "on-air" : "",
                      c.id === run.nextCueId ? "next" : "",
                    ].join(" ")}
                  >
                    <button
                      className="secondary"
                      aria-pressed={c.id === preview}
                      onClick={() => setPreview(c.id)}
                    >
                      {c.name}
                    </button>
                    <span className="live-tags">
                      {c.id === run.positionCueId && <span>Ausgabe</span>}
                      {c.id === run.nextCueId && <span>Nächster</span>}
                      {!c.enabled && <span>deaktiviert</span>}
                      {c.sceneName && <span>Szene: {c.sceneName}</span>}
                    </span>
                  </li>
                ))}
              </ol>
              {operate && run.status === "prepared" && (
                <>
                  <button disabled={busy} onClick={() => void send("run.start", {}, run)}>
                    Durchlauf starten
                  </button>
                  {previewCue?.enabled && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void send("run.start", { startCueId: previewCue.id }, run)}
                    >
                      Ab „{previewCue.name}“ starten
                    </button>
                  )}
                  <p className="muted">
                    Der Start bereitet den ersten Einsatz nur vor; ausgelöst wird
                    er mit GO.
                  </p>
                </>
              )}
              {operate && run.status !== "ended" && (
                <details>
                  <summary>Durchlauf beenden</summary>
                  <p>
                    Beenden schließt den Verlauf ab. Die (simulierte) Ausgabe
                    bleibt unverändert, weil noch keine Abschlussaktion festgelegt
                    ist.
                  </p>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void send("run.end", {}, run)}
                  >
                    Durchlauf jetzt beenden
                  </button>
                </details>
              )}
            </article>
          )}
          {snap.monitor && clock && (
            <MonitorControl
              eventId={eventId}
              snap={snap}
              clock={clock}
              manifest={standManifest}
              busy={busy}
              send={(type, payload, rev) => send(type, payload, undefined, rev)}
              api={api}
            />
          )}
          <article aria-label="Verlauf">
            <h3>Verlauf</h3>
            <ol className="live-history">
              {[...snap.history].reverse().map((e) => (
                <li key={e.sequence}>
                  {time(e.at)} · {e.actorName}: {e.summary}
                </li>
              ))}
            </ol>
          </article>
        </>
      )}
    </section>
  );
}
