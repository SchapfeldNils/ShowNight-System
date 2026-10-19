// Bedienung Live-Bühnenmonitor in der Regieansicht (Issue #41, D024/P5).
// Rights as GO; every command carries the shown monitor revision and is
// never resent automatically.
import { useEffect, useState } from "react";
import type { TransferManifest } from "../../../packages/contracts/src/transfer.js";
import type {
  LiveCommandResult,
  LiveSnapshot,
  MonitorLink,
} from "../../../packages/contracts/src/live.js";
import { MonitorDisplay, serverNow, type ServerClock } from "./monitor.js";

type Api = <T>(path: string, body?: unknown) => Promise<T>;
type Send = (
  type: string,
  payload: object,
  monitorRevision: number,
) => Promise<LiveCommandResult | null>;

const quickTexts = [
  "Noch 2 Minuten",
  "Bitte zum Ende kommen",
  "Kurze Unterbrechung",
];

export function MonitorControl({
  eventId,
  snap,
  clock,
  manifest,
  busy,
  send,
  api,
}: {
  eventId: string;
  snap: LiveSnapshot;
  clock: ServerClock;
  manifest: TransferManifest | undefined;
  busy: boolean;
  send: Send;
  api: Api;
}) {
  const m = snap.monitor;
  const t = m.timer;
  const operate = snap.rights.operate;
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  const [showId, setShowId] = useState(""),
    [kind, setKind] = useState<"draft" | "duration" | "target">("draft"),
    [minutes, setMinutes] = useState(15),
    [target, setTarget] = useState(""),
    [confirmReplace, setConfirmReplace] = useState(false);
  const [text, setText] = useState(""),
    [layout, setLayout] = useState<"alongside" | "replace">("alongside"),
    [expiry, setExpiry] = useState<number | null>(null);
  const [links, setLinks] = useState<MonitorLink[]>([]),
    [label, setLabel] = useState(""),
    [hours, setHours] = useState<number | null>(12),
    [created, setCreated] = useState<{ label: string; url: string } | null>(null),
    [linkError, setLinkError] = useState("");
  const draft = manifest?.timers?.find((d) => d.showId === showId);
  // The show's draft prefills the hint editor (stage timer preparation).
  useEffect(() => {
    if (!draft) return;
    if (draft.preset.hintText) setText(draft.preset.hintText);
    setLayout(draft.preset.hintLayout);
    setExpiry(draft.preset.hintExpirySeconds);
  }, [showId, draft?.revision]);
  const loadLinks = () =>
    api<MonitorLink[]>(`/live/${eventId}/monitor-links`)
      .then(setLinks)
      .catch((e: Error) => setLinkError(e.message));
  useEffect(() => {
    setCreated(null);
    setLinks([]);
    if (operate) void loadLinks();
  }, [eventId, operate]);

  const cmd = (type: string, payload: object = {}) => send(type, payload, m.revision);
  const running = !!t?.anchorAt;
  async function load() {
    const targetMs = (() => {
      if (kind !== "target" || !/^\d{2}:\d{2}$/.test(target)) return null;
      // Target time of day on the local server's date; past times mean tomorrow.
      const [h, min] = target.split(":").map(Number);
      const d = new Date(serverNow(clock));
      d.setHours(h, min, 0, 0);
      if (d.getTime() <= serverNow(clock)) d.setDate(d.getDate() + 1);
      return d.getTime();
    })();
    const r = await cmd("timer.load", {
      showId,
      ...(kind === "duration" ? { durationSeconds: Math.round(minutes * 60) } : {}),
      ...(targetMs ? { targetAt: new Date(targetMs).toISOString() } : {}),
    });
    if (r?.accepted) setConfirmReplace(false);
  }
  return (
    <article aria-label="Bühnenmonitor" className="live-monitor">
      <h3>Bühnenmonitor</h3>
      <p className="muted">
        Zeigt nur Timer und Hinweise. Die Zeit führt dieser Server; alle Regien
        und Monitorseiten sehen denselben Stand.{" "}
        <a href={`#/monitor/${eventId}`} target="_blank" rel="noopener">
          Monitorseite öffnen
        </a>
      </p>
      <div className="live-panel" role="region" aria-label="Monitorvorschau">
        <MonitorDisplay view={m} now={serverNow(clock)} compact />
        {m.lastAction && (
          <p className="muted">
            Monitorrevision {m.revision} · zuletzt {m.lastAction.by}
          </p>
        )}
      </div>
      {operate && (
        <>
          <h4>Timer</h4>
          {t && (
            <p className="muted">
              Geladen: „{t.showName}“ ·{" "}
              {{ countdown: "Countdown", elapsed: "Laufzeit", target: "Zieluhrzeit" }[t.mode]}
              {t.draftRevision === null ? " · Standardwerte" : ` · Entwurf Revision ${t.draftRevision}`}
            </p>
          )}
          <div className="live-stand">
            <label>
              Show
              <select aria-label="Show für Timer" value={showId} onChange={(e) => setShowId(e.target.value)}>
                <option value="">Show wählen</option>
                {manifest?.shows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Vorgabe
              <select
                aria-label="Timervorgabe"
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                <option value="draft">
                  {draft
                    ? draft.preset.mode === "countdown"
                      ? `Entwurf: Countdown ${Math.round(draft.preset.durationSeconds / 60)} min`
                      : "Entwurf: Laufzeit"
                    : "Entwurf bzw. Standardwerte"}
                </option>
                <option value="duration" disabled={draft?.preset.mode === "elapsed"}>
                  Countdown mit eigener Dauer
                </option>
                <option value="target">Zieluhrzeit</option>
              </select>
            </label>
            {kind === "duration" && (
              <label>
                Minuten
                <input
                  aria-label="Dauer in Minuten"
                  type="number"
                  min={1}
                  max={1440}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.valueAsNumber)}
                />
              </label>
            )}
            {kind === "target" && (
              <label>
                Uhrzeit
                <input
                  aria-label="Zieluhrzeit"
                  type="time"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </label>
            )}
            <button
              className="secondary"
              disabled={
                busy ||
                !showId ||
                (kind === "target" && !target) ||
                (kind === "duration" && !(minutes >= 1))
              }
              onClick={() => (t ? setConfirmReplace(true) : void load())}
            >
              Timer laden
            </button>
          </div>
          {confirmReplace && (
            <div className="live-confirm" role="group" aria-label="Timer ersetzen">
              <p>
                Der geladene Timer „{t?.showName}“{running ? " läuft und" : ""} wird
                auf allen Monitoren ersetzt.
              </p>
              <button disabled={busy} onClick={() => void load()}>
                Timer ersetzen
              </button>
              <button className="secondary" onClick={() => setConfirmReplace(false)}>
                Abbrechen
              </button>
            </div>
          )}
          {t && (
            <div className="timer-actions">
              {t.mode !== "target" &&
                (running ? (
                  <button disabled={busy} onClick={() => void cmd("timer.pause")}>
                    Pause
                  </button>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => void cmd(t.started ? "timer.resume" : "timer.start")}
                  >
                    {t.started ? "Fortsetzen" : "Start"}
                  </button>
                ))}
              {[-60, -30, 30, 60].map((d) => (
                <button
                  key={d}
                  className="secondary"
                  disabled={busy}
                  onClick={() => void cmd("timer.adjust", { deltaSeconds: d })}
                >
                  {d > 0 ? "+" : "−"}
                  {Math.abs(d)} s
                </button>
              ))}
              {t.mode !== "target" && (
                <button className="secondary" disabled={busy} onClick={() => void cmd("timer.reset")}>
                  Zurücksetzen
                </button>
              )}
              <button className="secondary" disabled={busy} onClick={() => void cmd("timer.clear")}>
                Timer ausblenden
              </button>
            </div>
          )}
          <h4>Hinweis</h4>
          <label>
            Hinweistext
            <textarea
              aria-label="Hinweistext"
              maxLength={1000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="timer-actions">
            <span>Schnelltexte:</span>
            {quickTexts.map((q) => (
              <button key={q} className="secondary" onClick={() => setText(q)}>
                {q}
              </button>
            ))}
          </div>
          <div className="live-stand">
            <label>
              Anzeige
              <select
                aria-label="Hinweisanzeige"
                value={layout}
                onChange={(e) => setLayout(e.target.value as typeof layout)}
              >
                <option value="alongside">Neben dem Timer</option>
                <option value="replace">Anstelle des Timers</option>
              </select>
            </label>
            <label>
              Ablauf in Sekunden
              <input
                aria-label="Hinweisablauf in Sekunden"
                type="number"
                min={1}
                max={3600}
                placeholder="Leer: bewusst ausblenden"
                value={expiry ?? ""}
                onChange={(e) =>
                  setExpiry(e.target.value === "" ? null : e.target.valueAsNumber)
                }
              />
            </label>
            <button
              disabled={
                busy ||
                !text.trim() ||
                (expiry !== null && !(expiry >= 1 && expiry <= 3600))
              }
              onClick={() =>
                void cmd("hint.show", {
                  text: text.trim(),
                  layout,
                  expirySeconds: expiry === null ? null : Math.round(expiry),
                })
              }
            >
              {m.hint ? "Hinweis ersetzen" : "Hinweis anzeigen"}
            </button>
            {m.hint && (
              <button className="secondary" disabled={busy} onClick={() => void cmd("hint.hide")}>
                Hinweis ausblenden
              </button>
            )}
          </div>
          <details>
            <summary>Anzeige-Links für Tablets</summary>
            <p className="muted">
              Ein Anzeige-Link öffnet nur Timer und Hinweise, ohne Anmeldung,
              und gilt nur im lokalen Netz. Wer den Link hat, kann mitlesen;
              nicht mehr benötigte Links widerrufen.
            </p>
            {linkError && <p role="alert">{linkError}</p>}
            <div className="live-stand">
              <label>
                Bezeichnung
                <input
                  aria-label="Bezeichnung des Anzeige-Links"
                  maxLength={80}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <label>
                Gültig
                <select
                  aria-label="Gültigkeit"
                  value={hours ?? ""}
                  onChange={(e) => setHours(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="12">12 Stunden</option>
                  <option value="48">2 Tage</option>
                  <option value="168">7 Tage</option>
                  <option value="">bis zum Widerruf</option>
                </select>
              </label>
              <button
                className="secondary"
                disabled={!label.trim()}
                onClick={async () => {
                  setLinkError("");
                  try {
                    const out = await api<MonitorLink & { token: string }>(
                      `/live/${eventId}/monitor-links`,
                      { label: label.trim(), validHours: hours },
                    );
                    setCreated({
                      label: out.label,
                      url: `${location.origin}/#/anzeige/${out.token}`,
                    });
                    setLabel("");
                    await loadLinks();
                  } catch (e) {
                    setLinkError((e as Error).message);
                  }
                }}
              >
                Anzeige-Link erstellen
              </button>
            </div>
            {created && (
              <div className="live-confirm" role="group" aria-label="Neuer Anzeige-Link">
                <p>
                  Link „{created.label}“ wird nur jetzt angezeigt. Auf dem Tablet
                  öffnen oder kopieren:
                </p>
                <code className="monitor-link">{created.url}</code>
                <button
                  className="secondary"
                  onClick={() => void navigator.clipboard?.writeText(created.url).catch(() => {})}
                >
                  Kopieren
                </button>
                <button className="secondary" onClick={() => setCreated(null)}>
                  Ausblenden
                </button>
              </div>
            )}
            <ul aria-label="Aktive Anzeige-Links">
              {links.map((l) => (
                <li key={l.id}>
                  {l.label} · erstellt von {l.createdBy} ·{" "}
                  {l.expiresAt
                    ? "gültig bis " + new Date(l.expiresAt).toLocaleString("de-DE")
                    : "bis zum Widerruf"}{" "}
                  <button
                    className="secondary"
                    onClick={async () => {
                      setLinkError("");
                      try {
                        await api(`/live/${eventId}/monitor-links/${l.id}/revoke`, {});
                        await loadLinks();
                      } catch (e) {
                        setLinkError((e as Error).message);
                      }
                    }}
                  >
                    Widerrufen
                  </button>
                </li>
              ))}
              {!links.length && <li className="muted">Keine aktiven Anzeige-Links.</li>}
            </ul>
          </details>
        </>
      )}
    </article>
  );
}
