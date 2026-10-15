// Interactive browser scene editor (Issue #44, package 1). Works on the
// existing SceneDefinition; saving, leases and recovery stay in SceneDrafts.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type {
  SceneDefinition,
  SceneLayer,
} from "../../../packages/contracts/src/scene.js";
import type { MediaRecord } from "../../../packages/contracts/src/index.js";
import { SceneSketch } from "./scenes.js";
import {
  IMAGE_MIMES,
  checkScene,
  clampBox,
  kindIcon,
  kindLabel,
  mediaAspect,
  moveLayer,
  newLayer,
  nudge,
  snapMove,
  snapResize,
  type Box,
} from "./scene-editor-model.js";

export const MEDIA_DRAG_TYPE = "application/x-shownight-media";

type Drag = {
  mode: "move" | "resize";
  id: string;
  pointerId: number;
  start: { x: number; y: number };
  box: Box;
  before: SceneDefinition;
  latest: SceneDefinition;
  moved: boolean;
};

export type EditorActions = {
  /** Change with an undo step; equal keys within a short time share one step. */
  edit: (next: SceneDefinition, key?: string) => void;
  /** Intermediate change during a drag, without an undo step. */
  live: (next: SceneDefinition) => void;
  /** Finish a drag: one undo step back to `before`. */
  commit: (before: SceneDefinition, next: SceneDefinition) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

const statusText = (m: MediaRecord) =>
  m.status === "ready"
    ? "bereit"
    : m.status === "processing"
      ? "wird geprüft"
      : "Prüfung fehlgeschlagen";

export function SceneEditor({
  draft,
  editing,
  busy,
  media,
  mediaUrl,
  selectedId,
  onSelect,
  actions,
  newId = () => crypto.randomUUID(),
}: {
  draft: SceneDefinition;
  editing: boolean;
  busy: boolean;
  media: MediaRecord[];
  mediaUrl: (id: string) => string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  actions: EditorActions;
  newId?: () => string;
}) {
  const [snap, setSnap] = useState(true),
    [showLayers, setShowLayers] = useState(true),
    [showProps, setShowProps] = useState(true),
    [large, setLarge] = useState(false),
    [guides, setGuides] = useState<{ x: number[]; y: number[] }>({
      x: [],
      y: [],
    });
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<Drag | null>(null);
  const selected = draft.layers.find((l) => l.id === selectedId) ?? null;
  const images = media.filter(
    (m) => IMAGE_MIMES.includes(m.mime) && m.status !== "failed",
  );
  const known = new Set(media.map((m) => m.id));
  const checks = checkScene(draft, media);
  const full = draft.layers.length >= 64;
  const handle =
    Math.max(draft.logicalWidth, draft.logicalHeight) / (large ? 120 : 80);

  function point(clientX: number, clientY: number) {
    const el = svg.current,
      m = el?.getScreenCTM();
    if (!el || !m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  const withLayer = (
    scene: SceneDefinition,
    id: string,
    patch: Partial<SceneLayer>,
  ): SceneDefinition => ({
    ...scene,
    layers: scene.layers.map((l) =>
      l.id === id ? ({ ...l, ...patch } as SceneLayer) : l,
    ),
  });
  const update = (id: string, patch: Partial<SceneLayer>, key?: string) =>
    actions.edit(withLayer(draft, id, patch), key);
  function add(
    kind: SceneLayer["kind"],
    options: { mediaId?: string; center?: { x: number; y: number } } = {},
  ) {
    if (!editing || full) return;
    const mediaId =
      kind === "image"
        ? (options.mediaId ??
          (images.find((m) => m.status === "ready") ?? images[0])?.id)
        : undefined;
    if (kind === "image" && !mediaId) return;
    const layer = newLayer(draft, kind, newId(), {
      mediaId,
      center: options.center,
      aspect: mediaAspect(media.find((m) => m.id === mediaId)),
    });
    actions.edit({ ...draft, layers: [...draft.layers, layer] });
    onSelect(layer.id);
  }
  function remove(id: string) {
    actions.edit({ ...draft, layers: draft.layers.filter((l) => l.id !== id) });
    onSelect(null);
  }

  function startDrag(
    e: PointerEvent<SVGElement>,
    layer: SceneLayer,
    mode: Drag["mode"],
  ) {
    e.stopPropagation();
    onSelect(layer.id);
    if (!editing || e.button !== 0) return;
    const p = point(e.clientX, e.clientY);
    if (!p) return;
    svg.current?.setPointerCapture?.(e.pointerId);
    drag.current = {
      mode,
      id: layer.id,
      pointerId: e.pointerId,
      start: p,
      box: { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
      before: draft,
      latest: draft,
      moved: false,
    };
  }
  function moveDrag(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const p = point(e.clientX, e.clientY);
    if (!p) return;
    const dx = p.x - d.start.x,
      dy = p.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) < handle / 6) return;
    d.moved = true;
    const useSnap = snap && !e.altKey;
    let box: Box;
    let lines = { x: [] as number[], y: [] as number[] };
    if (d.mode === "move") {
      box = { ...d.box, x: d.box.x + dx, y: d.box.y + dy };
      if (useSnap) {
        const s = snapMove(box, draft);
        box = s;
        lines = { x: s.guidesX, y: s.guidesY };
      }
    } else {
      let width = Math.max(1, d.box.width + dx),
        height = Math.max(1, d.box.height + dy);
      if (e.shiftKey) height = Math.max(1, (width * d.box.height) / d.box.width);
      box = { ...d.box, width, height };
      if (useSnap && !e.shiftKey) {
        const s = snapResize(box, draft);
        box = s;
        lines = { x: s.guidesX, y: s.guidesY };
      }
    }
    const next = withLayer(d.before, d.id, clampBox(box));
    d.latest = next;
    setGuides(lines);
    actions.live(next);
  }
  function endDrag(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    setGuides({ x: [], y: [] });
    svg.current?.releasePointerCapture?.(e.pointerId);
    if (d.moved) actions.commit(d.before, d.latest);
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    const mod = e.ctrlKey || e.metaKey,
      k = e.key.toLowerCase();
    if (mod && k === "z" && !e.shiftKey) {
      e.preventDefault();
      if (editing) actions.undo();
      return;
    }
    if (mod && (k === "y" || (k === "z" && e.shiftKey))) {
      e.preventDefault();
      if (editing) actions.redo();
      return;
    }
    if (e.key === "Escape") {
      if (large) setLarge(false);
      else onSelect(null);
      return;
    }
    if (!selected || !editing) return;
    const step = e.shiftKey ? 10 : 1;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (delta[e.key]) {
      e.preventDefault();
      update(
        selected.id,
        nudge(selected, delta[e.key][0], delta[e.key][1]),
        "nudge:" + selected.id,
      );
    } else if (
      (e.key === "Delete" || e.key === "Backspace") &&
      target.tagName !== "BUTTON"
    ) {
      e.preventDefault();
      remove(selected.id);
    }
  }

  const visible = draft.layers.filter((l) => l.visible);
  return (
    <div
      className={
        "scene-editor" +
        (large ? " scene-editor-large" : "") +
        (showLayers ? "" : " no-layers") +
        (showProps ? "" : " no-props")
      }
      tabIndex={-1}
      onKeyDown={onKey}
    >
      <div className="scene-toolbar" role="toolbar" aria-label="Szenenwerkzeuge">
        <fieldset disabled={!editing || busy} className="toolbar-group">
          <legend className="sr-only">Inhalte hinzufügen</legend>
          {(["text", "rectangle", "image"] as const).map((kind) => (
            <button
              key={kind}
              className="secondary"
              disabled={full || (kind === "image" && !images.length)}
              onClick={() => add(kind)}
            >
              {kindLabel[kind]} hinzufügen
            </button>
          ))}
        </fieldset>
        <span className="toolbar-group">
          <button
            className="secondary"
            disabled={!editing || !actions.canUndo}
            title="Strg+Z"
            onClick={actions.undo}
          >
            Rückgängig
          </button>
          <button
            className="secondary"
            disabled={!editing || !actions.canRedo}
            title="Strg+Y"
            onClick={actions.redo}
          >
            Wiederholen
          </button>
          <label className="toolbar-check">
            <input
              type="checkbox"
              checked={snap}
              onChange={(e) => setSnap(e.target.checked)}
            />
            Einrasten
          </label>
        </span>
        <span className="toolbar-group">
          <button
            className="secondary"
            aria-pressed={showLayers}
            onClick={() => setShowLayers(!showLayers)}
          >
            Ebenenliste
          </button>
          <button
            className="secondary"
            aria-pressed={showProps}
            onClick={() => setShowProps(!showProps)}
          >
            Eigenschaftenleiste
          </button>
          <button
            className="secondary"
            aria-pressed={large}
            onClick={() => setLarge(!large)}
          >
            {large ? "Große Arbeitsfläche verlassen" : "Große Arbeitsfläche"}
          </button>
        </span>
      </div>
      {showLayers && (
        <aside className="scene-layers" role="complementary" aria-label="Ebenen">
          <h4>Ebenen</h4>
          {!draft.layers.length && <p className="muted">Noch keine Ebenen.</p>}
          <ol>
            {[...draft.layers].reverse().map((l) => {
              const i = draft.layers.indexOf(l);
              return (
                <li key={l.id} className={l.id === selectedId ? "active" : ""}>
                  <button
                    className="layer-select"
                    aria-pressed={l.id === selectedId}
                    onClick={() => onSelect(l.id)}
                  >
                    <span className="layer-icon" aria-hidden="true">
                      {l.kind === "image" && known.has(l.mediaId) ? (
                        <img src={mediaUrl(l.mediaId)} alt="" />
                      ) : l.kind === "image" ? (
                        "!"
                      ) : l.kind === "rectangle" ? (
                        <span
                          className="layer-swatch"
                          style={{ background: l.color }}
                        />
                      ) : (
                        kindIcon[l.kind]
                      )}
                    </span>
                    <span className={l.visible ? "" : "layer-hidden"}>
                      {l.name}
                    </span>
                  </button>
                  <input
                    type="checkbox"
                    aria-label={`Sichtbar: ${l.name}`}
                    title="Sichtbar"
                    checked={l.visible}
                    disabled={!editing || busy}
                    onChange={(e) => update(l.id, { visible: e.target.checked })}
                  />
                  <button
                    className="secondary icon"
                    aria-label={`${l.name} weiter nach vorn`}
                    title="Weiter nach vorn"
                    disabled={!editing || busy || i === draft.layers.length - 1}
                    onClick={() => actions.edit(moveLayer(draft, l.id, 1))}
                  >
                    ▲
                  </button>
                  <button
                    className="secondary icon"
                    aria-label={`${l.name} weiter nach hinten`}
                    title="Weiter nach hinten"
                    disabled={!editing || busy || i === 0}
                    onClick={() => actions.edit(moveLayer(draft, l.id, -1))}
                  >
                    ▼
                  </button>
                </li>
              );
            })}
          </ol>
          <h4>Bilder aus der Medienbibliothek</h4>
          <p className="muted">
            Auf die Arbeitsfläche ziehen oder anklicken. Nur PNG/JPEG dieser
            Show bzw. Veranstaltung.
          </p>
          {!images.length && <p className="muted">Keine Bilder vorhanden.</p>}
          <ul className="scene-media">
            {images.map((m) => (
              <li key={m.id}>
                <button
                  className="secondary"
                  draggable={editing && !full}
                  disabled={!editing || busy || full}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(MEDIA_DRAG_TYPE, m.id);
                    e.dataTransfer.setData("text/plain", m.name);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => add("image", { mediaId: m.id })}
                >
                  <img src={mediaUrl(m.id)} alt="" />
                  <span>
                    {m.name} · {statusText(m)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
      <div
        className="scene-stage"
        tabIndex={0}
        aria-label="Arbeitsfläche der Szene. Pfeiltasten verschieben die gewählte Ebene, Umschalt in 10er-Schritten."
        onDragOver={(e) => {
          if (editing && e.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(e) => {
          const id = e.dataTransfer.getData(MEDIA_DRAG_TYPE);
          if (!editing || !id) return;
          e.preventDefault();
          const p = point(e.clientX, e.clientY);
          add("image", { mediaId: id, center: p ?? undefined });
        }}
      >
        <SceneSketch
          definition={draft}
          mediaUrl={mediaUrl}
          missing={(id) => !known.has(id)}
          svgRef={svg}
          svgProps={{
            onPointerDown: (e) => {
              if (e.target === svg.current || e.target === svg.current?.firstChild)
                onSelect(null);
            },
            onPointerMove: moveDrag,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            className:
              "scene-sketch" + (editing ? " scene-sketch-editable" : ""),
          }}
        >
          {visible.map((l) => (
            <rect
              key={l.id}
              className="scene-hit"
              data-layer={l.name}
              x={l.x}
              y={l.y}
              width={l.width}
              height={l.height}
              fill="transparent"
              onPointerDown={(e) => startDrag(e, l, "move")}
            />
          ))}
          {selected && (
            <g className="scene-selection" pointerEvents="none">
              <rect
                x={selected.x}
                y={selected.y}
                width={selected.width}
                height={selected.height}
                fill="none"
                stroke="#cded84"
                strokeWidth={2}
                strokeDasharray={selected.visible ? undefined : "6 4"}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
          {selected && editing && selected.visible && (
            <rect
              className="scene-handle"
              aria-label="Größe ändern"
              x={selected.x + selected.width - handle / 2}
              y={selected.y + selected.height - handle / 2}
              width={handle}
              height={handle}
              fill="#cded84"
              stroke="#16200d"
              vectorEffect="non-scaling-stroke"
              onPointerDown={(e) => startDrag(e, selected, "resize")}
            />
          )}
          {guides.x.map((x) => (
            <line
              key={"gx" + x}
              x1={x}
              x2={x}
              y1={0}
              y2={draft.logicalHeight}
              stroke="#ff4fd8"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          ))}
          {guides.y.map((y) => (
            <line
              key={"gy" + y}
              y1={y}
              y2={y}
              x1={0}
              x2={draft.logicalWidth}
              stroke="#ff4fd8"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          ))}
        </SceneSketch>
        <section className="scene-checks" aria-label="Prüfübersicht der Szene">
          <h4>
            Prüfübersicht ·{" "}
            {checks.filter((c) => c.level === "error").length} Fehler,{" "}
            {checks.filter((c) => c.level === "warning").length} Hinweise
          </h4>
          {checks.length ? (
            <ul>
              {checks.map((c, i) => (
                <li key={i} className={c.level}>
                  <button
                    className="link"
                    onClick={() => c.layerId && onSelect(c.layerId)}
                  >
                    {c.level === "error" ? "Fehler" : "Hinweis"}: {c.message}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Keine Auffälligkeiten im Browserentwurf.</p>
          )}
          <p className="muted">
            Browserprüfung während der Gestaltung. Paketprüfung, Renderer und
            Ersatzregeln der echten Ausgabe bleiben maßgeblich.
          </p>
        </section>
      </div>
      {showProps && (
        <aside
          className="scene-inspector"
          role="complementary"
          aria-label="Eigenschaften"
        >
          {selected ? (
            <LayerProperties
              key={selected.id}
              layer={selected}
              index={draft.layers.indexOf(selected)}
              count={draft.layers.length}
              scene={draft}
              disabled={!editing || busy}
              media={media}
              images={images}
              update={update}
              edit={actions.edit}
              remove={remove}
              duplicate={() => {
                if (full) return;
                const copy = {
                  ...selected,
                  id: newId(),
                  name: `${selected.name} Kopie`.slice(0, 200),
                  x: Math.min(8192, selected.x + 20),
                  y: Math.min(8192, selected.y + 20),
                } as SceneLayer;
                const layers = [...draft.layers];
                layers.splice(draft.layers.indexOf(selected) + 1, 0, copy);
                actions.edit({ ...draft, layers });
                onSelect(copy.id);
              }}
            />
          ) : (
            <p className="muted">
              Ebene auf der Arbeitsfläche oder in der Ebenenliste wählen, um
              ihre Eigenschaften zu bearbeiten.
            </p>
          )}
        </aside>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onValue: (v: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          if (e.target.value === "") return;
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onValue(Math.min(max, Math.max(min, v)));
        }}
      />
    </label>
  );
}

function LayerProperties({
  layer: l,
  index,
  count,
  scene,
  disabled,
  media,
  images,
  update,
  edit,
  remove,
  duplicate,
}: {
  layer: SceneLayer;
  index: number;
  count: number;
  scene: SceneDefinition;
  disabled: boolean;
  media: MediaRecord[];
  images: MediaRecord[];
  update: (id: string, patch: Partial<SceneLayer>, key?: string) => void;
  edit: (next: SceneDefinition, key?: string) => void;
  remove: (id: string) => void;
  duplicate: () => void;
}) {
  const key = (field: string) => `${field}:${l.id}`;
  return (
    <fieldset disabled={disabled}>
      <legend>
        {kindLabel[l.kind]} · Ebene {index + 1} von {count}
      </legend>
      <label>
        Ebenenname
        <input
          value={l.name}
          maxLength={200}
          onChange={(e) => update(l.id, { name: e.target.value }, key("name"))}
        />
      </label>
      {l.kind === "text" && (
        <>
          <label htmlFor={"scene-text-" + l.id}>Ebenentext</label>
          <textarea
            id={"scene-text-" + l.id}
            value={l.text}
            maxLength={2000}
            onChange={(e) => update(l.id, { text: e.target.value }, key("text"))}
          />
          <NumberField
            label="Schriftgröße"
            value={l.fontSize}
            min={6}
            max={300}
            onValue={(fontSize) => update(l.id, { fontSize }, key("font"))}
          />
        </>
      )}
      {l.kind !== "image" && (
        <label>
          Ebenenfarbe
          <input
            type="color"
            value={l.color}
            onChange={(e) =>
              update(l.id, { color: e.target.value }, key("color"))
            }
          />
        </label>
      )}
      {l.kind === "image" && (
        <>
          {!media.some((m) => m.id === l.mediaId) && (
            <p className="error">
              Medium fehlt oder ist für diese Show nicht verfügbar. Bitte ein
              vorhandenes Bild wählen.
            </p>
          )}
          <label>
            Ebenenbild
            <select
              aria-label="Ebenenbild"
              value={l.mediaId}
              onChange={(e) => update(l.id, { mediaId: e.target.value })}
            >
              <option value={l.mediaId}>
                {media.find((m) => m.id === l.mediaId)?.name ??
                  "Medium fehlt oder nicht verfügbar"}
              </option>
              {images
                .filter((m) => m.id !== l.mediaId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {statusText(m)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Bildanpassung
            <select
              aria-label="Bildanpassung"
              value={l.fit}
              onChange={(e) =>
                update(l.id, { fit: e.target.value as "contain" | "cover" })
              }
            >
              <option value="contain">Vollständig einpassen</option>
              <option value="cover">Bildfüllend beschneiden</option>
            </select>
          </label>
        </>
      )}
      <div className="scene-properties">
        <NumberField
          label="X"
          value={l.x}
          min={-8192}
          max={8192}
          onValue={(x) => update(l.id, { x }, key("x"))}
        />
        <NumberField
          label="Y"
          value={l.y}
          min={-8192}
          max={8192}
          onValue={(y) => update(l.id, { y }, key("y"))}
        />
        <NumberField
          label="Breite"
          value={l.width}
          min={1}
          max={8192}
          onValue={(width) => update(l.id, { width }, key("width"))}
        />
        <NumberField
          label="Höhe"
          value={l.height}
          min={1}
          max={8192}
          onValue={(height) => update(l.id, { height }, key("height"))}
        />
      </div>
      <div className="inline">
        <button
          className="secondary"
          onClick={() =>
            update(l.id, {
              x: Math.round((scene.logicalWidth - l.width) / 2),
              y: Math.round((scene.logicalHeight - l.height) / 2),
            })
          }
        >
          Zentrieren
        </button>
        <button
          className="secondary"
          onClick={() =>
            update(l.id, {
              x: 0,
              y: 0,
              width: scene.logicalWidth,
              height: scene.logicalHeight,
            })
          }
        >
          Szenenfüllend
        </button>
        <button className="secondary" onClick={() => remove(l.id)}>
          Ebene entfernen
        </button>
      </div>
      <details>
        <summary>Weitere Einstellungen</summary>
        <NumberField
          label="Deckkraft"
          value={l.opacity}
          min={0}
          max={1}
          step={0.05}
          onValue={(opacity) => update(l.id, { opacity }, key("opacity"))}
        />
        <label>
          <input
            type="checkbox"
            checked={l.visible}
            onChange={(e) => update(l.id, { visible: e.target.checked })}
          />
          Sichtbar
        </label>
        <div className="inline">
          <button
            className="secondary"
            disabled={index === 0}
            onClick={() => edit(moveLayer(scene, l.id, -1))}
          >
            Ebene nach unten
          </button>
          <button
            className="secondary"
            disabled={index === count - 1}
            onClick={() => edit(moveLayer(scene, l.id, 1))}
          >
            Ebene nach oben
          </button>
          <button
            className="secondary"
            disabled={count >= 64}
            onClick={duplicate}
          >
            Ebene duplizieren
          </button>
        </div>
      </details>
    </fieldset>
  );
}
