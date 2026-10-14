import { useEffect, useRef, useState } from "react";
import {
  sceneDefinition,
  type SceneDefinition,
  type SceneLayer,
  type SceneRecord,
} from "../../../packages/contracts/src/scene.js";
import type { MediaRecord } from "../../../packages/contracts/src/index.js";

function SceneImage({
  layer,
  source,
}: {
  layer: Extract<SceneLayer, { kind: "image" }>;
  source: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  return failed ? (
    <>
      <rect width={layer.width} height={layer.height} fill="#5a2533" />
      <text x="8" y="30" fill="#ffffff" fontSize="24">
        Medium nicht verfügbar
      </text>
    </>
  ) : (
    <image
      href={source}
      width={layer.width}
      height={layer.height}
      preserveAspectRatio={
        layer.fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"
      }
      onError={() => setFailed(true)}
    />
  );
}

export function SceneSketch({
  definition,
  mediaUrl,
}: {
  definition: SceneDefinition;
  mediaUrl?: (id: string) => string;
}) {
  return (
    <svg
      className="scene-sketch"
      viewBox={`0 0 ${definition.logicalWidth} ${definition.logicalHeight}`}
      role="img"
      aria-label="Gestaltungsentwurf im Browser"
    >
      <rect
        width={definition.logicalWidth}
        height={definition.logicalHeight}
        fill={definition.background}
      />
      {definition.layers
        .filter((l) => l.visible)
        .map((l) => (
          <svg
            key={l.id}
            x={l.x}
            y={l.y}
            width={l.width}
            height={l.height}
            opacity={l.opacity}
            viewBox={`0 0 ${l.width} ${l.height}`}
            overflow="hidden"
          >
            {l.kind === "rectangle" ? (
              <rect width={l.width} height={l.height} fill={l.color} />
            ) : l.kind === "text" ? (
              <text
                x="0"
                y={l.fontSize}
                fill={l.color}
                fontSize={l.fontSize}
                fontFamily="Arial"
              >
                {l.text.split("\n").map((line, i) => (
                  <tspan key={i} x="0" dy={i ? l.fontSize * 1.2 : 0}>
                    {line}
                  </tspan>
                ))}
              </text>
            ) : mediaUrl ? (
              <SceneImage layer={l} source={mediaUrl(l.mediaId)} />
            ) : (
              <>
                <rect width={l.width} height={l.height} fill="#334155" />
                <text x="8" y="30" fill="#ffffff" fontSize="24">
                  Bildebene
                </text>
              </>
            )}
          </svg>
        ))}
    </svg>
  );
}
type Saved = SceneRecord & {
  previousShowRevision: number;
  showRevision: number;
};
type Lease = { scene: SceneRecord; leaseToken: string; expiresAt: string };
type Api = <T = any>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;
export function SceneDrafts({
  showId,
  ownerId,
  canEdit,
  media,
  api,
  onScenes,
  onSaved,
  onEditing,
}: {
  showId: string;
  ownerId: string;
  canEdit: boolean;
  media: MediaRecord[];
  api: Api;
  onScenes: (scenes: SceneRecord[]) => void;
  onSaved: (before: number, after: number) => void;
  onEditing: (editing: boolean) => void;
}) {
  const [scenes, setScenes] = useState<SceneRecord[]>([]),
    [selected, setSelected] = useState<SceneRecord | null>(null);
  const [draft, setDraft] = useState<SceneDefinition | null>(null),
    [lease, setLease] = useState<Lease | null>(null);
  const [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [blocked, setBlocked] = useState(false),
    [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<SceneDefinition | null>(null);
  const current = useRef({ api, onScenes, onSaved, onEditing });
  current.current = { api, onScenes, onSaved, onEditing };
  const held = useRef<Lease | null>(null),
    saving = useRef(false),
    revision = useRef(0),
    alive = useRef(true);
  const saved = useRef("");
  const key = (id: string) => `shownight.scene-draft.${ownerId}.${id}`;
  const load = async () => {
    const next = await current.current.api<SceneRecord[]>(
      `/shows/${showId}/scenes`,
    );
    if (alive.current) {
      setScenes(next);
      current.current.onScenes(next);
    }
    return next;
  };
  useEffect(() => {
    alive.current = true;
    void load().catch((e) => setError(e.message));
    return () => {
      alive.current = false;
      const owned = held.current;
      held.current = null;
      if (owned)
        void current.current
          .api(`/scenes/${owned.scene.id}/lease`, "DELETE", {
            leaseToken: owned.leaseToken,
          })
          .catch(() => {});
    };
  }, [showId]);
  useEffect(() => {
    if (!lease || blocked) return;
    const timer = setInterval(() => {
      void current.current
        .api(`/scenes/${lease.scene.id}/lease`, "PATCH", {
          leaseToken: lease.leaseToken,
        })
        .catch((e) => {
          if (alive.current) {
            setBlocked(true);
            setError(e.message);
            setStatus("Sperre nicht bestätigt · Entwurf lokal behalten");
          }
        });
    }, 20000);
    return () => clearInterval(timer);
  }, [lease, blocked]);
  useEffect(() => {
    if (!draft || !lease || blocked || saved.current === JSON.stringify(draft))
      return;
    const timer = setTimeout(() => {
      void persist(draft, lease);
    }, 1200);
    return () => clearTimeout(timer);
  }, [draft, lease, blocked, busy]);
  async function persist(value: SceneDefinition, active: Lease) {
    if (saving.current || held.current !== active) return;
    const valid = sceneDefinition.safeParse(value);
    if (!valid.success) {
      setError(
        "Ungültige Szenenwerte. Bitte Name, Ebenen und Zahlenbereiche prüfen.",
      );
      return;
    }
    saving.current = true;
    setBusy(true);
    setStatus("Wird gespeichert …");
    setError("");
    try {
      const next = await current.current.api<Saved>(
        `/scenes/${active.scene.id}`,
        "PATCH",
        {
          expectedRevision: revision.current,
          leaseToken: active.leaseToken,
          definition: valid.data,
        },
      );
      revision.current = next.revision;
      saved.current = JSON.stringify(value);
      current.current.onSaved(next.previousShowRevision, next.showRevision);
      if (alive.current) {
        setSelected(next);
        setStatus(`Server gespeichert · Szenenrevision ${next.revision}`);
        await load();
      }
      // Keep the recovery copy until the editor is explicitly closed. A newer
      // edit may have arrived during this request; never delete that draft.
      return true;
    } catch (e) {
      if (alive.current) {
        setBlocked(true);
        setError((e as Error).message);
        setStatus(
          "Speicherung nicht bestätigt · keine automatische Wiederholung",
        );
      }
      return false;
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function change(next: SceneDefinition) {
    setDraft(next);
    setError("");
    setStatus("Entwurf geändert · automatische Speicherung folgt");
    if (selected)
      try {
        localStorage.setItem(key(selected.id), JSON.stringify(next));
      } catch {
        setError(
          "Browserentwurf konnte nicht gesichert werden. Arbeitsfläche geöffnet lassen.",
        );
      }
  }
  function view(s: SceneRecord) {
    setSelected(s);
    setDraft(s.definition);
    setError("");
    setStatus(`Serverstand · Szenenrevision ${s.revision}`);
    setRecovery(null);
    // Read only after an authorized scene list was returned for this user.
    if (canEdit)
      try {
        const raw = localStorage.getItem(key(s.id));
        const parsed = raw ? sceneDefinition.safeParse(JSON.parse(raw)) : null;
        if (
          parsed?.success &&
          JSON.stringify(parsed.data) !== JSON.stringify(s.definition)
        )
          setRecovery(parsed.data);
      } catch {
        /* Invalid local drafts never become server content. */
      }
  }
  async function acquire() {
    if (!selected || held.current || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await current.current.api<Lease>(
        `/scenes/${selected.id}/lease`,
        "POST",
        {},
      );
      if (!alive.current) {
        await current.current.api(`/scenes/${selected.id}/lease`, "DELETE", {
          leaseToken: next.leaseToken,
        });
        return;
      }
      held.current = next;
      revision.current = next.scene.revision;
      saved.current = JSON.stringify(next.scene.definition);
      setRecovery(null);
      try {
        const raw = localStorage.getItem(key(next.scene.id));
        const parsed = raw ? sceneDefinition.safeParse(JSON.parse(raw)) : null;
        if (parsed?.success && JSON.stringify(parsed.data) !== saved.current)
          setRecovery(parsed.data);
      } catch {
        /* Recovery remains untrusted until validated. */
      }
      setSelected(next.scene);
      setDraft(next.scene.definition);
      setLease(next);
      setBlocked(false);
      current.current.onEditing(true);
      setStatus(
        "Exklusive Bearbeitung · Entwürfe werden automatisch gespeichert",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function finish() {
    if (!lease || saving.current) return;
    if (!blocked && draft && JSON.stringify(draft) !== saved.current) {
      if (!(await persist(draft, lease))) return;
    }
    setBusy(true);
    try {
      await current.current.api(`/scenes/${lease.scene.id}/lease`, "DELETE", {
        leaseToken: lease.leaseToken,
      });
      if (
        !blocked &&
        localStorage.getItem(key(lease.scene.id)) === saved.current
      )
        localStorage.removeItem(key(lease.scene.id));
      setStatus(
        blocked
          ? "Bearbeitung beendet · lokalen Entwurf vor erneutem Laden vergleichen"
          : "Gespeichert · Bearbeitung freigegeben",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      held.current = null;
      setLease(null);
      setBusy(false);
      current.current.onEditing(false);
    }
  }
  const update = (id: string, patch: Partial<SceneLayer>) =>
    draft &&
    change({
      ...draft,
      layers: draft.layers.map((l) =>
        l.id === id ? ({ ...l, ...patch } as SceneLayer) : l,
      ),
    });
  const editing = !!lease && !blocked;
  return (
    <section className="scene-drafts">
      <h3>Szenenentwürfe</h3>
      <p className="muted">
        Erste Gestaltung mit Text, Rechteck und Bild · Browserentwurf, keine
        native Rendererprüfung und keine Liveausgabe. Ebenen werden von unten
        nach oben gezeichnet.
      </p>
      <div className="inline">
        <label>
          Szene ansehen
          <select
            value={selected?.id ?? ""}
            disabled={!!lease || busy}
            onChange={(e) => {
              const s = scenes.find((s) => s.id === e.target.value);
              if (s) view(s);
            }}
          >
            <option value="">Szene wählen</option>
            {scenes.map((s) => (
              <option value={s.id} key={s.id}>
                {s.definition.name}
              </option>
            ))}
          </select>
        </label>
        {canEdit && (
          <button
            className="secondary"
            disabled={!!lease || busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const next = await current.current.api<Saved>(
                  `/shows/${showId}/scenes`,
                  "POST",
                  { name: "Neue Szene" },
                );
                current.current.onSaved(
                  next.previousShowRevision,
                  next.showRevision,
                );
                await load();
                view(next);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Szene anlegen
          </button>
        )}
      </div>
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {selected && draft && (
        <>
          <p>
            Verwendungen werden bei der Szenenzuordnung am Einsatz angezeigt.
            Änderungen betreffen alle Einsätze mit derselben Szene.
          </p>
          <SceneSketch
            definition={draft}
            mediaUrl={(id) =>
              `/api/v1/media/${id}/content?state=${media.find((m) => m.id === id)?.status ?? "unknown"}`
            }
          />
          {canEdit && !lease && (
            <button disabled={busy} onClick={() => void acquire()}>
              Szene bearbeiten
            </button>
          )}
          {lease && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void finish()}
            >
              {blocked
                ? "Bearbeitung beenden · Entwurf behalten"
                : "Speichern und freigeben"}
            </button>
          )}
          {recovery && editing && (
            <button
              className="secondary"
              onClick={() => {
                change(recovery);
                setRecovery(null);
              }}
            >
              Lokalen Entwurf übernehmen
            </button>
          )}
          {recovery && (
            <details>
              <summary>Lokalen Entwurf vergleichen</summary>
              <p className="warning">
                Abweichender lokaler Entwurf: {recovery.name}. Die obere
                Gestaltung zeigt den Serverstand. Eine bewusste Übernahme wird
                mit gültiger Sperre automatisch gespeichert.
              </p>
              <SceneSketch
                definition={recovery}
                mediaUrl={(id) => `/api/v1/media/${id}/content`}
              />
            </details>
          )}
          <fieldset disabled={!editing || busy}>
            <legend>Szeneneigenschaften</legend>
            <label>
              Szenenname
              <input
                value={draft.name}
                maxLength={200}
                onChange={(e) => change({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              Hintergrund
              <input
                type="color"
                value={draft.background}
                onChange={(e) =>
                  change({ ...draft, background: e.target.value })
                }
              />
            </label>
            <div className="inline">
              {(["text", "rectangle", "image"] as const).map((kind) => (
                <button
                  key={kind}
                  className="secondary"
                  disabled={
                    draft.layers.length >= 64 ||
                    (kind === "image" &&
                      !media.some((m) =>
                        ["image/png", "image/jpeg"].includes(m.mime),
                      ))
                  }
                  onClick={() => {
                    const box = {
                      id: crypto.randomUUID(),
                      name:
                        kind === "text"
                          ? "Text"
                          : kind === "rectangle"
                            ? "Rechteck"
                            : "Bild",
                      x: 80,
                      y: 80,
                      width: 800,
                      height: 300,
                      opacity: 1,
                      visible: true,
                    };
                    const layer: SceneLayer =
                      kind === "text"
                        ? {
                            ...box,
                            kind,
                            text: "Neuer Text",
                            fontSize: 72,
                            color: "#ffffff",
                          }
                        : kind === "rectangle"
                          ? { ...box, kind, color: "#176b78" }
                          : {
                              ...box,
                              kind,
                              mediaId: media.find((m) =>
                                ["image/png", "image/jpeg"].includes(m.mime),
                              )!.id,
                              fit: "contain",
                            };
                    change({ ...draft, layers: [...draft.layers, layer] });
                  }}
                >
                  {kind === "text"
                    ? "Text hinzufügen"
                    : kind === "rectangle"
                      ? "Rechteck hinzufügen"
                      : "Bild hinzufügen"}
                </button>
              ))}
            </div>
            {draft.layers.map((l, i) => (
              <fieldset key={l.id}>
                <legend>
                  Ebene {i + 1} · {l.name}
                </legend>
                <label>
                  Ebenenname
                  <input
                    value={l.name}
                    onChange={(e) => update(l.id, { name: e.target.value })}
                  />
                </label>
                <div className="scene-properties">
                  {(["x", "y", "width", "height", "opacity"] as const).map(
                    (p) => (
                      <label key={p}>
                        {
                          {
                            x: "X",
                            y: "Y",
                            width: "Breite",
                            height: "Höhe",
                            opacity: "Deckkraft",
                          }[p]
                        }
                        <input
                          type="number"
                          value={l[p]}
                          step={p === "opacity" ? 0.05 : 1}
                          min={
                            p === "opacity"
                              ? 0
                              : p === "width" || p === "height"
                                ? 1
                                : -8192
                          }
                          max={p === "opacity" ? 1 : 8192}
                          onChange={(e) =>
                            update(l.id, { [p]: Number(e.target.value) })
                          }
                        />
                      </label>
                    ),
                  )}
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={l.visible}
                    onChange={(e) =>
                      update(l.id, { visible: e.target.checked })
                    }
                  />
                  Sichtbar
                </label>
                {l.kind === "text" && (
                  <>
                    <label htmlFor={"scene-text-" + l.id}>Ebenentext</label>
                    <textarea
                      id={"scene-text-" + l.id}
                      value={l.text}
                      maxLength={2000}
                      onChange={(e) => update(l.id, { text: e.target.value })}
                    />
                    <label>
                      Schriftgröße
                      <input
                        type="number"
                        min="6"
                        max="300"
                        value={l.fontSize}
                        onChange={(e) =>
                          update(l.id, { fontSize: Number(e.target.value) })
                        }
                      />
                    </label>
                  </>
                )}
                {l.kind !== "image" && (
                  <label>
                    Ebenenfarbe
                    <input
                      type="color"
                      value={l.color}
                      onChange={(e) => update(l.id, { color: e.target.value })}
                    />
                  </label>
                )}
                {l.kind === "image" && (
                  <>
                    <label>
                      Ebenenbild
                      <select
                        value={l.mediaId}
                        onChange={(e) =>
                          update(l.id, { mediaId: e.target.value })
                        }
                      >
                        <option value={l.mediaId}>
                          {media.find((m) => m.id === l.mediaId)?.name ??
                            "Medium fehlt oder nicht verfügbar"}
                        </option>
                        {media
                          .filter(
                            (m) =>
                              m.id !== l.mediaId &&
                              ["image/png", "image/jpeg"].includes(m.mime),
                          )
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} · {m.status}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Bildanpassung
                      <select
                        value={l.fit}
                        onChange={(e) =>
                          update(l.id, {
                            fit: e.target.value as "contain" | "cover",
                          })
                        }
                      >
                        <option value="contain">Vollständig einpassen</option>
                        <option value="cover">Bildfüllend beschneiden</option>
                      </select>
                    </label>
                  </>
                )}
                <button
                  className="secondary"
                  disabled={i === 0}
                  onClick={() => {
                    const layers = [...draft.layers];
                    [layers[i - 1], layers[i]] = [layers[i], layers[i - 1]];
                    change({ ...draft, layers });
                  }}
                >
                  Ebene nach unten
                </button>
                <button
                  className="secondary"
                  disabled={i === draft.layers.length - 1}
                  onClick={() => {
                    const layers = [...draft.layers];
                    [layers[i + 1], layers[i]] = [layers[i], layers[i + 1]];
                    change({ ...draft, layers });
                  }}
                >
                  Ebene nach oben
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    change({
                      ...draft,
                      layers: draft.layers.filter((next) => next.id !== l.id),
                    })
                  }
                >
                  Ebene entfernen
                </button>
              </fieldset>
            ))}
          </fieldset>
        </>
      )}
    </section>
  );
}
