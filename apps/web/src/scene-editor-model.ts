// Pure editor helpers for the browser scene editor (Issue #44, package 1).
// No schema change: everything here works on the existing SceneDefinition.
import type {
  SceneDefinition,
  SceneLayer,
} from "../../../packages/contracts/src/scene.js";
import type { MediaRecord } from "../../../packages/contracts/src/index.js";

export const IMAGE_MIMES = ["image/png", "image/jpeg"];
export const kindLabel: Record<SceneLayer["kind"], string> = {
  text: "Text",
  rectangle: "Rechteck",
  image: "Bild",
};
export const kindIcon: Record<SceneLayer["kind"], string> = {
  text: "T",
  rectangle: "▭",
  image: "▣",
};

const LIMIT = 8192;
const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v);

/** Next free automatic name, e.g. "Text 3". Renamed layers keep their name. */
export function autoName(layers: SceneLayer[], kind: SceneLayer["kind"]) {
  const base = kindLabel[kind];
  const used = new Set(layers.map((l) => l.name.trim()));
  let n = layers.filter((l) => l.kind === kind).length + 1;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export type Box = { x: number; y: number; width: number; height: number };

/** Box for a new layer: centred on the given point (or the scene) and inside the scene. */
export function placeBox(
  scene: Pick<SceneDefinition, "logicalWidth" | "logicalHeight">,
  kind: SceneLayer["kind"],
  center?: { x: number; y: number },
  aspect?: number,
): Box {
  const W = scene.logicalWidth,
    H = scene.logicalHeight;
  let width = round(W * (kind === "text" ? 0.5 : 0.4)),
    height = round(H * (kind === "text" ? 0.15 : 0.4));
  if (aspect && aspect > 0) {
    height = width / aspect;
    // Tall media: limit by the scene height and keep the aspect ratio.
    if (height > H) {
      height = H;
      width = H * aspect;
    }
    width = Math.max(1, round(width));
    height = Math.max(1, round(height));
  }
  width = clamp(width, 1, W);
  height = clamp(height, 1, H);
  const cx = center?.x ?? W / 2,
    cy = center?.y ?? H / 2;
  return {
    x: round(clamp(cx - width / 2, 0, W - width)),
    y: round(clamp(cy - height / 2, 0, H - height)),
    width,
    height,
  };
}

export function newLayer(
  scene: SceneDefinition,
  kind: SceneLayer["kind"],
  id: string,
  options: { mediaId?: string; center?: { x: number; y: number }; aspect?: number } = {},
): SceneLayer {
  const box = {
    id,
    name: autoName(scene.layers, kind),
    ...placeBox(scene, kind, options.center, options.aspect),
    opacity: 1,
    visible: true,
  };
  if (kind === "text")
    return {
      ...box,
      kind,
      text: "Neuer Text",
      fontSize: Math.max(6, Math.min(300, round(scene.logicalHeight / 15))),
      color: "#ffffff",
    };
  if (kind === "rectangle") return { ...box, kind, color: "#176b78" };
  if (!options.mediaId) throw new Error("Bildebene braucht ein Medium.");
  // D006 Punkt 8: first fit completely, cropping is a later choice.
  return { ...box, kind, mediaId: options.mediaId, fit: "contain" };
}

export function mediaAspect(m: MediaRecord | undefined) {
  const s = m?.analysis?.streams?.find((s) => s.width && s.height);
  return s?.width && s?.height ? s.width / s.height : undefined;
}

export const SNAP_DISTANCE = 12;
/** Snap a moving box to scene edges and centre lines. */
export function snapMove(
  box: Box,
  scene: Pick<SceneDefinition, "logicalWidth" | "logicalHeight">,
  distance = SNAP_DISTANCE,
): Box & { guidesX: number[]; guidesY: number[] } {
  const axis = (pos: number, size: number, total: number) => {
    const targets = [0, total / 2, total];
    let best: { pos: number; guide: number } | null = null,
      bestDist = distance + 1;
    for (const t of targets)
      for (const edge of [0, size / 2, size]) {
        const d = Math.abs(pos + edge - t);
        if (d <= distance && d < bestDist) {
          bestDist = d;
          best = { pos: t - edge, guide: t };
        }
      }
    return best;
  };
  const sx = axis(box.x, box.width, scene.logicalWidth),
    sy = axis(box.y, box.height, scene.logicalHeight);
  return {
    ...box,
    x: round(sx ? sx.pos : box.x),
    y: round(sy ? sy.pos : box.y),
    guidesX: sx ? [sx.guide] : [],
    guidesY: sy ? [sy.guide] : [],
  };
}

/** Snap the dragged bottom-right corner to scene edges and centre lines. */
export function snapResize(
  box: Box,
  scene: Pick<SceneDefinition, "logicalWidth" | "logicalHeight">,
  distance = SNAP_DISTANCE,
): Box & { guidesX: number[]; guidesY: number[] } {
  const axis = (end: number, total: number) => {
    for (const t of [total / 2, total])
      if (Math.abs(end - t) <= distance) return t;
    return null;
  };
  const gx = axis(box.x + box.width, scene.logicalWidth),
    gy = axis(box.y + box.height, scene.logicalHeight);
  return {
    ...box,
    width: gx !== null && gx - box.x >= 1 ? round(gx - box.x) : box.width,
    height: gy !== null && gy - box.y >= 1 ? round(gy - box.y) : box.height,
    guidesX: gx !== null && gx - box.x >= 1 ? [gx] : [],
    guidesY: gy !== null && gy - box.y >= 1 ? [gy] : [],
  };
}

/** Keep values inside the contract ranges so autosave never sends invalid data. */
export function clampBox(box: Box): Box {
  return {
    x: round(clamp(box.x, -LIMIT, LIMIT)),
    y: round(clamp(box.y, -LIMIT, LIMIT)),
    width: round(clamp(box.width, 1, LIMIT)),
    height: round(clamp(box.height, 1, LIMIT)),
  };
}

/** Move by whole pixels; width and height stay exactly as they are. */
export function nudge(box: Box, dx: number, dy: number): Box {
  return {
    x: round(clamp(box.x + dx, -LIMIT, LIMIT)),
    y: round(clamp(box.y + dy, -LIMIT, LIMIT)),
    width: box.width,
    height: box.height,
  };
}

/** Bounded undo/redo history of whole definitions. */
export type History = {
  past: SceneDefinition[];
  future: SceneDefinition[];
};
export const HISTORY_LIMIT = 100;
export const emptyHistory = (): History => ({ past: [], future: [] });
export function record(h: History, before: SceneDefinition): History {
  const past = [...h.past, before];
  return { past: past.slice(-HISTORY_LIMIT), future: [] };
}
export function undo(h: History, current: SceneDefinition) {
  if (!h.past.length) return null;
  return {
    value: h.past[h.past.length - 1],
    history: {
      past: h.past.slice(0, -1),
      future: [current, ...h.future].slice(0, HISTORY_LIMIT),
    },
  };
}
export function redo(h: History, current: SceneDefinition) {
  if (!h.future.length) return null;
  return {
    value: h.future[0],
    history: {
      past: [...h.past, current].slice(-HISTORY_LIMIT),
      future: h.future.slice(1),
    },
  };
}

export type SceneCheck = {
  level: "error" | "warning";
  layerId?: string;
  message: string;
};
/**
 * Browser check overview for the draft (D006 Punkt 10). It does not replace the
 * package/renderer validation; it only makes problems visible while editing.
 */
export function checkScene(
  scene: SceneDefinition,
  /** null while the media list is not loaded yet: no media verdicts then. */
  media: MediaRecord[] | null,
): SceneCheck[] {
  const out: SceneCheck[] = [];
  const name = scene.name.trim();
  if (!name || name.length > 200)
    out.push({
      level: "error",
      message:
        "Szenenname fehlt oder ist zu lang (1–200 Zeichen). Der Entwurf wird so nicht gespeichert.",
    });
  for (const l of scene.layers) {
    if (!l.name.trim() || l.name.trim().length > 200)
      out.push({
        level: "error",
        layerId: l.id,
        message: `Ebene ${scene.layers.indexOf(l) + 1}: Name fehlt oder ist zu lang (1–200 Zeichen). Der Entwurf wird so nicht gespeichert.`,
      });
    if (l.kind === "image" && media) {
      const m = media.find((m) => m.id === l.mediaId);
      if (!m)
        out.push({
          level: "error",
          layerId: l.id,
          message: `${l.name}: Medium fehlt oder ist für diese Show nicht verfügbar.`,
        });
      else if (m.status === "failed")
        out.push({
          level: "error",
          layerId: l.id,
          message: `${l.name}: Medium „${m.name}“ hat die Prüfung nicht bestanden.`,
        });
      else if (m.status !== "ready")
        out.push({
          level: "warning",
          layerId: l.id,
          message: `${l.name}: Medium „${m.name}“ wird noch geprüft.`,
        });
      else if (!IMAGE_MIMES.includes(m.mime))
        out.push({
          level: "error",
          layerId: l.id,
          message: `${l.name}: „${m.name}“ ist kein unterstütztes Bild (PNG/JPEG).`,
        });
    }
    if (
      l.visible &&
      (l.x >= scene.logicalWidth ||
        l.y >= scene.logicalHeight ||
        l.x + l.width <= 0 ||
        l.y + l.height <= 0)
    )
      out.push({
        level: "warning",
        layerId: l.id,
        message: `${l.name}: liegt vollständig außerhalb der sichtbaren Fläche.`,
      });
    if (l.visible && l.opacity === 0)
      out.push({
        level: "warning",
        layerId: l.id,
        message: `${l.name}: ist sichtbar geschaltet, aber vollständig transparent.`,
      });
    if (l.kind === "text" && !l.text.trim())
      out.push({
        level: "warning",
        layerId: l.id,
        message: `${l.name}: Text ist leer.`,
      });
  }
  return out;
}

export function moveLayer(
  scene: SceneDefinition,
  id: string,
  delta: 1 | -1,
): SceneDefinition {
  const i = scene.layers.findIndex((l) => l.id === id),
    j = i + delta;
  if (i < 0 || j < 0 || j >= scene.layers.length) return scene;
  const layers = [...scene.layers];
  [layers[i], layers[j]] = [layers[j], layers[i]];
  return { ...scene, layers };
}
