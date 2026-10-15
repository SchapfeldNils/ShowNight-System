/** Personal rehearsal only. Never a shared or authoritative live timer. */
export type PreviewMode = "countdown" | "elapsed";
export type PreviewClock = { valueMs: number; anchorMs: number | null };
export function initialClock(mode: PreviewMode, seconds: number): PreviewClock {
  return { valueMs: mode === "countdown" ? seconds * 1000 : 0, anchorMs: null };
}
export function clockValue(
  clock: PreviewClock,
  mode: PreviewMode,
  now: number,
) {
  const elapsed =
    clock.anchorMs === null ? 0 : Math.max(0, now - clock.anchorMs);
  return clock.valueMs + (mode === "countdown" ? -elapsed : elapsed);
}
export function resumeClock(clock: PreviewClock, now: number): PreviewClock {
  return clock.anchorMs === null ? { ...clock, anchorMs: now } : clock;
}
export function pauseClock(
  clock: PreviewClock,
  mode: PreviewMode,
  now: number,
): PreviewClock {
  return { valueMs: clockValue(clock, mode, now), anchorMs: null };
}
export function correctClock(
  clock: PreviewClock,
  mode: PreviewMode,
  now: number,
  deltaSeconds: number,
): PreviewClock {
  return {
    valueMs: Math.max(
      -86400000,
      Math.min(86400000, clockValue(clock, mode, now) + deltaSeconds * 1000),
    ),
    anchorMs: clock.anchorMs === null ? null : now,
  };
}
export function formatClock(milliseconds: number) {
  const s = Math.ceil(Math.abs(milliseconds) / 1000);
  const h = Math.floor(s / 3600),
    m = Math.floor(s / 60) % 60;
  return (
    (milliseconds < 0 ? "−" : "") +
    (h ? String(h).padStart(2, "0") + ":" : "") +
    String(m).padStart(2, "0") +
    ":" +
    String(s % 60).padStart(2, "0")
  );
}
