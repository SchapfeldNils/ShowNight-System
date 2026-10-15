import { useEffect, useRef, useState } from "react";
import {
  timerPreparation,
  defaultTimerPreparation,
  type TimerPreparation,
} from "../../../packages/contracts/src/timer.js";
import {
  clockValue,
  correctClock,
  formatClock,
  initialClock,
  pauseClock,
  resumeClock,
  type PreviewClock,
} from "./timer-preview.js";

type Record = {
  revision: number;
  preset: TimerPreparation;
  previousShowRevision?: number;
  showRevision?: number;
};
export function TimerPreparationEditor({
  showId,
  canEdit,
  api,
  onSaved,
}: {
  showId: string;
  canEdit: boolean;
  api: <T = any>(path: string, method?: string, body?: unknown) => Promise<T>;
  onSaved: (before: number, after: number) => void;
}) {
  const [preset, setPreset] = useState<TimerPreparation>(
    defaultTimerPreparation,
  );
  const [stored, setStored] = useState<Record | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [probe, setProbe] = useState<TimerPreparation | null>(null);
  const [clock, setClock] = useState<PreviewClock>(
    initialClock("countdown", 900),
  );
  const [hintAt, setHintAt] = useState<number | null>(null),
    [now, setNow] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    api<Record>(`/shows/${showId}/timer-preparation`)
      .then((record) => {
        if (!cancelled) {
          setStored(record);
          setPreset(record.preset);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      alive.current = false;
    };
  }, [showId]);
  useEffect(() => {
    if (!probe) return;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [probe]);
  function patch(values: Partial<TimerPreparation>) {
    setPreset((p) => ({ ...p, ...values }));
    setNotice("");
  }
  function parsed(): TimerPreparation | null {
    const r = timerPreparation.safeParse(preset);
    if (!r.success) {
      setError(
        "Bitte gültige Timerwerte eingeben: Dauer und Warnung bis 86400 Sekunden, Hinweisablauf 1–3600 Sekunden und höchstens 1000 Textzeichen.",
      );
      return null;
    }
    setError("");
    return r.data;
  }
  async function save() {
    const value = parsed();
    if (!value || !stored) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await api<Record>(
        `/shows/${showId}/timer-preparation`,
        "PUT",
        { expectedRevision: stored.revision, preset: value },
      );
      if (!alive.current) return;
      setStored(result);
      setConflict(false);
      setNotice(
        "Monitorentwurf gespeichert. Die persönliche Probe bleibt unabhängig.",
      );
      if (
        result.previousShowRevision !== undefined &&
        result.showRevision !== undefined
      )
        onSaved(result.previousShowRevision, result.showRevision);
    } catch (e) {
      if (!alive.current) return;
      const err = e as Error & { status?: number };
      setError(err.message);
      if (err.status === 409) setConflict(true);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    try {
      const record = await api<Record>(`/shows/${showId}/timer-preparation`);
      if (!alive.current) return;
      setStored(record);
      setPreset(record.preset);
      setError("");
      setConflict(false);
      setNotice(
        "Gespeicherter Entwurf geladen. Eigene ungespeicherte Änderungen wurden verworfen.",
      );
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function start() {
    const value = parsed();
    if (!value) return;
    const at = performance.now();
    setProbe(value);
    setClock(resumeClock(initialClock(value.mode, value.durationSeconds), at));
    setNow(at);
    setHintAt(null);
  }
  const value = probe ? clockValue(clock, probe.mode, now) : 0;
  const overrun = probe?.mode === "countdown" && value < 0;
  const warning =
    probe?.mode === "countdown" &&
    value >= 0 &&
    value <= probe.warningSeconds * 1000;
  const hintVisible =
    !!probe?.hintText &&
    hintAt !== null &&
    (probe.hintExpirySeconds === null ||
      now - hintAt < probe.hintExpirySeconds * 1000);
  const replace = hintVisible && probe?.hintLayout === "replace";
  return (
    <section
      className="timer-preparation"
      aria-label="Bühnenmonitor vorbereiten"
    >
      <h3>Stage Timer · Bühnenmonitor vorbereiten</h3>
      <p>
        Gespeicherter Showentwurf mit persönlicher, stummer Browserprobe. Keine
        Bühnenausgabe, keine GO-Aktion. Timerentwürfe sind noch nicht im
        Offline-Inhaltspaket enthalten.
      </p>
      <p className="muted">
        Zieluhrzeit, gemeinsame lokale Regiesteuerung und Gerätezuordnung folgen
        separat.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <fieldset disabled={!stored || busy || !canEdit}>
        <legend>
          Monitorentwurf{" "}
          {stored ? `· Revision ${stored.revision}` : "· wird geladen"}
        </legend>
        <div className="timer-fields">
          <label>
            Timerart
            <select
              value={preset.mode}
              onChange={(e) =>
                patch({ mode: e.target.value as TimerPreparation["mode"] })
              }
            >
              <option value="countdown">Countdown</option>
              <option value="elapsed">Laufzeit</option>
            </select>
          </label>
          <label>
            Dauer in Sekunden
            <input
              type="number"
              min={preset.mode === "countdown" ? 1 : 0}
              max={86400}
              step={1}
              value={
                Number.isNaN(preset.durationSeconds)
                  ? ""
                  : preset.durationSeconds
              }
              onChange={(e) =>
                patch({ durationSeconds: e.target.valueAsNumber })
              }
            />
          </label>
          <label>
            Warnung ab Sekunden
            <input
              type="number"
              min={0}
              max={86400}
              step={1}
              value={
                Number.isNaN(preset.warningSeconds) ? "" : preset.warningSeconds
              }
              onChange={(e) =>
                patch({ warningSeconds: e.target.valueAsNumber })
              }
            />
          </label>
          <label>
            Normale Farbe
            <input
              type="color"
              value={preset.normalColor}
              onChange={(e) => patch({ normalColor: e.target.value })}
            />
          </label>
          <label>
            Warnfarbe
            <input
              type="color"
              value={preset.warningColor}
              onChange={(e) => patch({ warningColor: e.target.value })}
            />
          </label>
          <label>
            Überziehungsfarbe
            <input
              type="color"
              value={preset.overrunColor}
              onChange={(e) => patch({ overrunColor: e.target.value })}
            />
          </label>
        </div>
        <label>
          <input
            type="checkbox"
            checked={preset.showOverrun}
            onChange={(e) => patch({ showOverrun: e.target.checked })}
          />
          Überziehung anzeigen
        </label>
        <label>
          Hinweistext
          <textarea
            maxLength={1000}
            value={preset.hintText}
            onChange={(e) => patch({ hintText: e.target.value })}
          />
        </label>
        <div className="timer-actions">
          <span>Schnelltexte:</span>
          {[
            "Noch 2 Minuten",
            "Bitte zum Ende kommen",
            "Kurze Unterbrechung",
          ].map((text) => (
            <button
              type="button"
              className="secondary"
              key={text}
              onClick={() => patch({ hintText: text })}
            >
              {text}
            </button>
          ))}
        </div>
        <div className="timer-fields">
          <label>
            Hinweisanzeige
            <select
              value={preset.hintLayout}
              onChange={(e) =>
                patch({
                  hintLayout: e.target.value as TimerPreparation["hintLayout"],
                })
              }
            >
              <option value="alongside">Neben dem Timer</option>
              <option value="replace">Anstelle des Timers</option>
            </select>
          </label>
          <label>
            Hinweisablauf in Sekunden
            <input
              type="number"
              min={1}
              max={3600}
              step={1}
              placeholder="Leer: bewusst ausblenden"
              value={
                preset.hintExpirySeconds === null ||
                Number.isNaN(preset.hintExpirySeconds)
                  ? ""
                  : preset.hintExpirySeconds
              }
              onChange={(e) =>
                patch({
                  hintExpirySeconds:
                    e.target.value === "" ? null : e.target.valueAsNumber,
                })
              }
            />
          </label>
        </div>
        <button type="button" onClick={() => void save()} disabled={conflict}>
          Monitorentwurf speichern
        </button>
      </fieldset>
      {conflict && (
        <p>
          Jemand hat den Entwurf inzwischen geändert. Deine Eingaben bleiben
          sichtbar. Vor dem erneuten Bearbeiten den gespeicherten Stand bewusst
          laden.
        </p>
      )}
      {stored && (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void reload()}
        >
          Gespeicherten Monitorentwurf laden und eigene Änderungen verwerfen
        </button>
      )}
      {!canEdit && (
        <p>
          Du kannst den gespeicherten Entwurf ansehen und persönlich erproben.
          Speichern erfordert Showbearbeitungsrechte.
        </p>
      )}
      <div className="timer-actions">
        <button type="button" disabled={!stored || busy} onClick={start}>
          Vorschau starten
        </button>
      </div>
      {probe && (
        <>
          <section
            className="timer-monitor"
            aria-label="Persönliche Bühnenmonitorprobe"
            style={{
              color: overrun
                ? probe.overrunColor
                : warning
                  ? probe.warningColor
                  : probe.normalColor,
            }}
          >
            <p className="timer-simulation">
              PERSÖNLICHE BROWSERPROBE · KEINE LIVEAUSGABE
            </p>
            {!replace && (
              <output
                data-testid="timer-value"
                className="timer-digits"
                aria-label="Probenzeit"
              >
                {formatClock(!probe.showOverrun && value < 0 ? 0 : value)}
              </output>
            )}
            {hintVisible && (
              <p
                className={
                  replace ? "timer-hint timer-hint-large" : "timer-hint"
                }
              >
                {probe.hintText}
              </p>
            )}
            <p>
              {overrun ? "Überziehung" : warning ? "Warnbereich" : ""} ·{" "}
              {clock.anchorMs === null ? "Pausiert" : "Läuft"}
            </p>
          </section>
          <p className="muted">
            Die Probe nutzt die Werte vom letzten Start. Änderungen am Entwurf
            erst mit erneutem Start übernehmen. Hinweiswechsel lässt die Zeit
            unverändert weiterlaufen. Schließen/Neuladen beendet nur diese
            persönliche Probe.
          </p>
          <div className="timer-actions">
            <button
              type="button"
              disabled={clock.anchorMs === null}
              onClick={() => {
                const at = performance.now();
                setClock(pauseClock(clock, probe.mode, at));
                setNow(at);
              }}
            >
              Vorschau pausieren
            </button>
            <button
              type="button"
              disabled={clock.anchorMs !== null}
              onClick={() => {
                const at = performance.now();
                setClock(resumeClock(clock, at));
                setNow(at);
              }}
            >
              Vorschau fortsetzen
            </button>
            <button
              type="button"
              onClick={() => {
                setClock(initialClock(probe.mode, probe.durationSeconds));
                setNow(performance.now());
                setHintAt(null);
              }}
            >
              Vorschau zurücksetzen
            </button>
            {[30, -30].map((delta) => (
              <button
                type="button"
                key={delta}
                onClick={() => {
                  const at = performance.now();
                  setClock(correctClock(clock, probe.mode, at, delta));
                  setNow(at);
                }}
              >
                Zeitkorrektur {delta > 0 ? "+30" : "−30"} Sekunden
              </button>
            ))}
            <button
              type="button"
              disabled={!probe.hintText}
              onClick={() => {
                const at = performance.now();
                setHintAt(at);
                setNow(at);
              }}
            >
              Hinweis anzeigen
            </button>
            <button
              type="button"
              disabled={!hintVisible}
              onClick={() => setHintAt(null)}
            >
              Hinweis ausblenden
            </button>
          </div>
        </>
      )}
    </section>
  );
}
