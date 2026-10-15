import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  sceneDefinition,
  type SceneDefinition,
} from "../packages/contracts/src/scene.js";
import type { MediaRecord } from "../packages/contracts/src/index.js";
import {
  HISTORY_LIMIT,
  autoName,
  checkScene,
  clampBox,
  emptyHistory,
  moveLayer,
  newLayer,
  nudge,
  placeBox,
  record,
  redo,
  snapMove,
  snapResize,
  undo,
} from "../apps/web/src/scene-editor-model.js";

const scene = (): SceneDefinition => ({
  name: "Synthetische Szene",
  logicalWidth: 1920,
  logicalHeight: 1080,
  background: "#000000",
  layers: [],
});
const media = (
  over: Partial<MediaRecord> & Pick<MediaRecord, "id">,
): MediaRecord => ({
  eventId: null,
  showId: null,
  name: "synthetisch.png",
  status: "ready",
  sizeBytes: 10,
  sha256: "a".repeat(64),
  mime: "image/png",
  analysis: {
    streams: [{ codec_type: "video", width: 400, height: 100 }],
    audioAnalysis: "",
  },
  error: null,
  ...over,
});

test("Szeneneditor: automatische Namen bleiben eindeutig und umbenannte Ebenen bleiben erhalten", () => {
  let s = scene();
  for (let i = 0; i < 3; i++)
    s = { ...s, layers: [...s.layers, newLayer(s, "text", randomUUID())] };
  assert.deepEqual(
    s.layers.map((l) => l.name),
    ["Text 1", "Text 2", "Text 3"],
  );
  s = {
    ...s,
    layers: s.layers.filter((l) => l.name !== "Text 1"),
  };
  // Freed numbers are not reused while a higher number exists.
  assert.equal(autoName(s.layers, "text"), "Text 4");
  s.layers[0] = { ...s.layers[0], name: "Begrüßung" };
  assert.equal(autoName(s.layers, "rectangle"), "Rechteck 1");
  assert.equal(s.layers[0].name, "Begrüßung");
});

test("Szeneneditor: neue Ebenen liegen innerhalb der Szene und sind gültige Szenenwerte", () => {
  const mediaId = randomUUID();
  let s = scene();
  for (const kind of ["text", "rectangle", "image"] as const)
    s = {
      ...s,
      layers: [
        ...s.layers,
        newLayer(s, kind, randomUUID(), { mediaId, aspect: 4 }),
      ],
    };
  assert.equal(sceneDefinition.safeParse(s).success, true);
  for (const l of s.layers) {
    assert.ok(l.x >= 0 && l.y >= 0);
    assert.ok(l.x + l.width <= 1920 && l.y + l.height <= 1080);
  }
  const image = s.layers[2];
  assert.equal(image.kind === "image" && image.fit, "contain");
  assert.equal(image.width / image.height, 4);
  // Drop near the corner stays inside the visible area.
  const dropped = placeBox(s, "image", { x: 1910, y: 1075 });
  assert.equal(dropped.x + dropped.width, 1920);
  assert.equal(dropped.y + dropped.height, 1080);
  assert.throws(() => newLayer(s, "image", randomUUID()));
});

test("Szeneneditor: Einrasten an Rand und Mitte, sonst unverändert", () => {
  const s = scene();
  const left = snapMove({ x: 7, y: 300, width: 200, height: 100 }, s);
  assert.equal(left.x, 0);
  assert.deepEqual(left.guidesX, [0]);
  assert.equal(left.y, 300);
  assert.deepEqual(left.guidesY, []);
  const centre = snapMove({ x: 855, y: 485, width: 200, height: 100 }, s);
  assert.equal(centre.x + 100, 960);
  assert.equal(centre.y + 50, 540);
  const free = snapMove({ x: 300, y: 300, width: 200, height: 100 }, s);
  assert.deepEqual([free.x, free.y], [300, 300]);
  const right = snapResize({ x: 1000, y: 0, width: 915, height: 50 }, s);
  assert.equal(right.x + right.width, 1920);
  assert.equal(right.height, 50);
});

test("Szeneneditor: Werte bleiben in den Vertragsgrenzen", () => {
  assert.deepEqual(
    clampBox({ x: -9000.4, y: 9000, width: 0.2, height: 9999 }),
    { x: -8192, y: 8192, width: 1, height: 8192 },
  );
  assert.deepEqual(nudge({ x: 8190, y: 0, width: 5, height: 5 }, 10, -1), {
    x: 8192,
    y: -1,
    width: 5,
    height: 5,
  });
});

test("Szeneneditor: Rückgängig/Wiederholen ist begrenzt und verwirft Zukunft nach neuer Änderung", () => {
  const states = Array.from({ length: 4 }, (_, i) => ({
    ...scene(),
    name: "Stand " + i,
  }));
  let h = emptyHistory();
  h = record(h, states[0]);
  h = record(h, states[1]);
  const back = undo(h, states[2])!;
  assert.equal(back.value.name, "Stand 1");
  const forward = redo(back.history, back.value)!;
  assert.equal(forward.value.name, "Stand 2");
  const branched = record(back.history, back.value);
  assert.equal(branched.future.length, 0);
  assert.equal(undo(emptyHistory(), states[0]), null);
  assert.equal(redo(emptyHistory(), states[0]), null);
  let long = emptyHistory();
  for (let i = 0; i < HISTORY_LIMIT + 20; i++)
    long = record(long, { ...scene(), name: "S" + i });
  assert.equal(long.past.length, HISTORY_LIMIT);
  assert.equal(long.past[0].name, "S20");
});

test("Szeneneditor: Prüfübersicht meldet fehlende, ungeprüfte und unsichtbare Inhalte", () => {
  const ok = randomUUID(),
    pending = randomUUID(),
    failed = randomUUID(),
    gone = randomUUID();
  let s = scene();
  for (const mediaId of [ok, pending, failed, gone])
    s = {
      ...s,
      layers: [...s.layers, newLayer(s, "image", randomUUID(), { mediaId })],
    };
  const text = newLayer(s, "text", randomUUID());
  s = {
    ...s,
    layers: [
      ...s.layers,
      { ...text, text: "  ", x: 5000 } as typeof text,
      { ...newLayer(s, "rectangle", randomUUID()), opacity: 0 },
    ],
  };
  const list = [
    media({ id: ok }),
    media({ id: pending, status: "processing" }),
    media({ id: failed, status: "failed" }),
  ];
  const checks = checkScene(s, list);
  const levels = (id: string) =>
    checks.filter((c) => c.layerId === id).map((c) => c.level);
  assert.deepEqual(levels(s.layers[0].id), []);
  assert.deepEqual(levels(s.layers[1].id), ["warning"]);
  assert.deepEqual(levels(s.layers[2].id), ["error"]);
  assert.deepEqual(levels(s.layers[3].id), ["error"]);
  assert.match(
    checks.find((c) => c.layerId === s.layers[3].id)!.message,
    /Medium fehlt/,
  );
  assert.deepEqual(levels(s.layers[4].id), ["warning", "warning"]);
  assert.deepEqual(levels(s.layers[5].id), ["warning"]);
  // Hidden layers outside the area are intentional and not reported.
  const hidden = {
    ...s,
    layers: [{ ...s.layers[4], visible: false, text: "x" }],
  };
  assert.deepEqual(checkScene(hidden, list), []);
});

test("Szeneneditor: Reihenfolge ändern bleibt in den Grenzen", () => {
  let s = scene();
  for (const kind of ["text", "rectangle"] as const)
    s = { ...s, layers: [...s.layers, newLayer(s, kind, randomUUID())] };
  const [a, b] = s.layers;
  assert.deepEqual(
    moveLayer(s, a.id, 1).layers.map((l) => l.id),
    [b.id, a.id],
  );
  assert.equal(moveLayer(s, b.id, 1), s);
  assert.equal(moveLayer(s, a.id, -1), s);
  assert.equal(moveLayer(s, "fehlt", 1), s);
});

test("Szeneneditor: hohe Bilder behalten ihr Seitenverhältnis, Pfeiltasten ändern keine Größe", () => {
  const tall = placeBox(scene(), "image", undefined, 0.25);
  assert.deepEqual([tall.width, tall.height], [270, 1080]);
  assert.deepEqual(nudge({ x: 1.5, y: 2, width: 100.5, height: 50.4 }, 1, 0), {
    x: 3,
    y: 2,
    width: 100.5,
    height: 50.4,
  });
});

test("Szeneneditor: Prüfübersicht meldet ungültige Namen und wartet auf die Medienliste", () => {
  let s = { ...scene(), name: "   " };
  s = {
    ...s,
    layers: [
      { ...newLayer(s, "rectangle", randomUUID()), name: " " },
      newLayer(s, "image", randomUUID(), { mediaId: randomUUID() }),
    ],
  };
  assert.equal(sceneDefinition.safeParse(s).success, false);
  const checks = checkScene(s, null);
  assert.deepEqual(
    checks.map((c) => [c.level, c.layerId ?? null]),
    [
      ["error", null],
      ["error", s.layers[0].id],
    ],
  );
  // Once loaded, the unknown medium is reported as missing.
  assert.equal(
    checkScene(s, []).filter((c) => c.layerId === s.layers[1].id).length,
    1,
  );
});
