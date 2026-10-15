import test from "node:test";
import assert from "node:assert/strict";
import {
  initialClock,
  clockValue,
  resumeClock,
  pauseClock,
  correctClock,
  formatClock,
} from "../apps/web/src/timer-preview.js";

test("Persönlicher Countdown: Pause hält, Fortsetzen zählt nur laufende Zeit, Überziehung bleibt negativ", () => {
  const initial = Object.freeze(initialClock("countdown", 10));
  assert.equal(clockValue(initial, "countdown", 123456), 10000);
  const running = resumeClock(initial, 1000);
  assert.equal(clockValue(running, "countdown", 1500), 9500);
  assert.equal(
    resumeClock(running, 2000),
    running,
    "Erneutes Fortsetzen darf die Zeitbasis nicht verschieben",
  );
  const paused = pauseClock(running, "countdown", 4000);
  assert.equal(clockValue(paused, "countdown", 999999), 7000);
  const resumed = resumeClock(paused, 9000);
  assert.equal(clockValue(resumed, "countdown", 10000), 6000);
  assert.equal(clockValue(resumed, "countdown", 17000), -1000);
  assert.equal(formatClock(clockValue(resumed, "countdown", 17000)), "−00:01");
  assert.deepEqual(initial, { valueMs: 10000, anchorMs: null });
});

test("Zeitkorrektur erhält Lauf-/Pausenzustand und berücksichtigt bereits verstrichene Zeit", () => {
  const running = resumeClock(initialClock("countdown", 10), 1000);
  const extended = correctClock(running, "countdown", 3000, 30);
  assert.equal(clockValue(extended, "countdown", 5000), 36000);
  const reduced = correctClock(extended, "countdown", 5000, -30);
  assert.equal(clockValue(reduced, "countdown", 5000), 6000);
  assert.equal(clockValue(reduced, "countdown", 6000), 5000);
  const paused = pauseClock(reduced, "countdown", 6000);
  const changed = correctClock(paused, "countdown", 100000, -30);
  assert.equal(changed.anchorMs, null);
  assert.equal(clockValue(changed, "countdown", 999999), -25000);
  assert.equal(correctClock(paused, "countdown", 0, 1e9).valueMs, 86400000);
  assert.equal(correctClock(paused, "countdown", 0, -1e9).valueMs, -86400000);
});

test("Laufzeit und zwei persönliche Uhren bleiben unabhängig; Rücksetzen erzeugt einen frischen Zustand", () => {
  const first = resumeClock(initialClock("elapsed", 999), 2000);
  const second = initialClock("elapsed", 999);
  assert.equal(clockValue(first, "elapsed", 5500), 3500);
  assert.equal(clockValue(second, "elapsed", 5500), 0);
  const paused = pauseClock(first, "elapsed", 5500);
  const resumed = resumeClock(paused, 999000);
  assert.equal(clockValue(resumed, "elapsed", 1000000), 4500);
  assert.deepEqual(initialClock("elapsed", 999), {
    valueMs: 0,
    anchorMs: null,
  });
  assert.equal(
    clockValue(first, "elapsed", 1000),
    0,
    "Eine rückläufige Zeitquelle darf keine negative Laufzeit erzeugen",
  );
  assert.equal(clockValue(second, "elapsed", 1000000), 0);
});

test("Timerformat: Millisekunden, Stunden und negatives Vorzeichen bleiben lesbar", () => {
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(1), "00:01");
  assert.equal(formatClock(59999), "01:00");
  assert.equal(formatClock(3600000), "01:00:00");
  assert.equal(formatClock(86400000), "24:00:00");
  assert.equal(formatClock(-1), "−00:01");
  assert.equal(formatClock(-3661000), "−01:01:01");
});
