// Live-Bühnenmonitor (Issue #41, D024/P5): full-screen page of the local
// server that shows timer and hints only. The server clock is authoritative;
// the page measures its offset and counts on with the monotonic browser clock.
import { useEffect, useRef, useState } from "react";
import type { MonitorView } from "../../../packages/contracts/src/live.js";
import { clockValue, formatClock } from "../../web/src/timer-preview.js";

export type MonitorSource =
  | { kind: "session"; eventId: string }
  | { kind: "link"; token: string };

/** Estimated server time; the anchor moves with performance.now(). */
export type ServerClock = { serverMs: number; perfMs: number };
export const serverNow = (c: ServerClock) =>
  c.serverMs + (performance.now() - c.perfMs);

const STALE_MS = 3000;
const time = (ms: number) =>
  new Date(ms).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export function MonitorDisplay({
  view,
  now,
  compact = false,
}: {
  view: Pick<MonitorView, "timer" | "hint">;
  now: number;
  compact?: boolean;
}) {
  const t = view.timer;
  const hint =
    view.hint && (!view.hint.expiresAt || Date.parse(view.hint.expiresAt) > now)
      ? view.hint
      : null;
  const value = t
    ? clockValue(
        {
          valueMs: t.valueMs,
          anchorMs: t.anchorAt ? Date.parse(t.anchorAt) : null,
        },
        t.mode === "elapsed" ? "elapsed" : "countdown",
        now,
      )
    : 0;
  const counting = t && t.mode !== "elapsed";
  const overrun = !!counting && value < 0;
  const warning =
    !!counting && !overrun && value <= t!.warningSeconds * 1000;
  const replace = hint?.layout === "replace";
  return (
    <div
      className={"stage-monitor" + (compact ? " compact" : "")}
      style={
        t
          ? {
              color: overrun
                ? t.overrunColor
                : warning
                  ? t.warningColor
                  : t.normalColor,
            }
          : undefined
      }
    >
      {t && !replace && (
        <output className="stage-digits" aria-label="Timer">
          {formatClock(overrun && !t.showOverrun ? 0 : value)}
        </output>
      )}
      {hint && (
        <p className={replace ? "stage-hint stage-hint-large" : "stage-hint"}>
          {hint.text}
        </p>
      )}
      {!t && !hint && <p className="stage-empty">Kein Timer und kein Hinweis</p>}
      {t && (
        <p className="stage-status">
          {overrun
            ? "Überziehung"
            : t.mode === "target"
              ? "bis " +
                new Date(t.targetAt!).toLocaleTimeString("de-DE", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : !t.anchorAt
                ? t.started
                  ? "Pausiert"
                  : "Bereit"
                : warning
                  ? "Warnbereich"
                  : ""}
        </p>
      )}
    </div>
  );
}

export function MonitorPage({ source }: { source: MonitorSource }) {
  const [view, setView] = useState<MonitorView | null>(null),
    [clock, setClock] = useState<ServerClock | null>(null),
    [lastOk, setLastOk] = useState(0),
    [fatal, setFatal] = useState(""),
    [, tick] = useState(0);
  const reading = useRef(false);
  useEffect(() => {
    let stop = false;
    const url =
      source.kind === "session"
        ? "/api/local/monitor/" + source.eventId
        : "/api/local/monitor-display";
    const headers: Record<string, string> =
      source.kind === "link" ? { "X-Monitor-Link": source.token } : {};
    async function read() {
      if (reading.current) return;
      reading.current = true;
      const sent = performance.now();
      try {
        const r = await fetch(url, { headers, cache: "no-store" });
        const received = performance.now();
        const out = await r.json();
        if (stop) return;
        if (!r.ok) {
          // A revoked or expired link disconnects at once (P5).
          if (r.status === 401 || r.status === 403 || r.status === 404) {
            setFatal(
              out.error?.message ??
                (source.kind === "link"
                  ? "Anzeige-Link ungültig."
                  : "Bitte lokal anmelden."),
            );
            setView(null);
          }
          return;
        }
        if (out?.protocolVersion !== 1 || !("timer" in out)) return;
        setFatal("");
        setView(out as MonitorView);
        // Half the round trip: the answer was created around its middle.
        setClock({
          serverMs: Date.parse(out.serverTime),
          perfMs: sent + (received - sent) / 2,
        });
        setLastOk(Date.now());
      } catch {
        /* the next poll reconnects; the stale banner shows the gap */
      } finally {
        reading.current = false;
      }
    }
    void read();
    const poll = setInterval(read, 1000);
    const redraw = setInterval(() => tick((n) => n + 1), 200);
    return () => {
      stop = true;
      clearInterval(poll);
      clearInterval(redraw);
    };
  }, [source.kind === "session" ? source.eventId : source.token]);
  // Keep the screen on where the browser allows it.
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> };
    };
    const request = () =>
      nav.wakeLock
        ?.request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    void request();
    const again = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      void lock?.release().catch(() => {});
    };
  }, []);
  const stale = !!view && Date.now() - lastOk > STALE_MS;
  return (
    <div className="stage-page">
      {fatal ? (
        <div className="stage-monitor">
          <p className="stage-hint">{fatal}</p>
          {source.kind === "session" && (
            <p className="stage-status">
              <a href="/">Zur Anmeldung</a>
            </p>
          )}
        </div>
      ) : view && clock ? (
        <MonitorDisplay view={view} now={serverNow(clock)} />
      ) : (
        <div className="stage-monitor">
          <p className="stage-empty">Verbinde mit dem lokalen Server …</p>
        </div>
      )}
      {stale && (
        <p className="stage-offline" role="alert">
          Verbindung unterbrochen · letzter Stand {time(lastOk)} · verbinde neu …
        </p>
      )}
      <div className="stage-tools">
        <span>Bühnenmonitor im Browser · nur Timer und Hinweise</span>
        <button
          className="secondary"
          onClick={() =>
            document.fullscreenElement
              ? void document.exitFullscreen()
              : void document.documentElement.requestFullscreen().catch(() => {})
          }
        >
          Vollbild
        </button>
      </div>
    </div>
  );
}
