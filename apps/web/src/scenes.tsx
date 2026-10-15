import { useEffect, useRef, useState } from "react";
import {
  sceneDefinition,
  type SceneDefinition,
  type SceneRecord,
} from "../../../packages/contracts/src/scene.js";
import type { MediaRecord } from "../../../packages/contracts/src/index.js";
import { SceneSketch } from "./scene-sketch.js";
import { SceneEditor, type EditorActions } from "./scene-editor.js";
import {
  emptyHistory,
  record,
  redo,
  undo,
  type History,
} from "./scene-editor-model.js";

export { SceneSketch };


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
  mediaLoaded = true,
  api,
  onScenes,
  onSaved,
  onEditing,
}: {
  showId: string;
  ownerId: string;
  canEdit: boolean;
  media: MediaRecord[];
  mediaLoaded?: boolean;
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
  const [history, setHistory] = useState<History>(emptyHistory),
    [layerId, setLayerId] = useState<string | null>(null);
  const lastEdit = useRef<{ key?: string; at: number }>({ at: 0 });
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
    setHistory(emptyHistory());
    setLayerId(s.definition.layers.at(-1)?.id ?? null);
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
      setHistory(emptyHistory());
      setLayerId((id) =>
        next.scene.definition.layers.some((l) => l.id === id)
          ? id
          : (next.scene.definition.layers.at(-1)?.id ?? null),
      );
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
      setHistory(emptyHistory());
      setBusy(false);
      current.current.onEditing(false);
    }
  }
  const editing = !!lease && !blocked;
  const actions: EditorActions = {
    edit(next, key) {
      if (!draft || !editing) return;
      const now = Date.now(),
        last = lastEdit.current;
      if (!key || key !== last.key || now - last.at > 1000)
        setHistory((h) => record(h, draft));
      lastEdit.current = { key, at: now };
      change(next);
    },
    live(next) {
      if (editing) change(next);
    },
    commit(before, next) {
      if (!editing) return;
      lastEdit.current = { at: 0 };
      setHistory((h) => record(h, before));
      change(next);
    },
    undo() {
      if (!draft || !editing) return;
      const step = undo(history, draft);
      if (!step) return;
      lastEdit.current = { at: 0 };
      setHistory(step.history);
      change(step.value);
      setStatus("Rückgängig gemacht · automatische Speicherung folgt");
    },
    redo() {
      if (!draft || !editing) return;
      const step = redo(history, draft);
      if (!step) return;
      lastEdit.current = { at: 0 };
      setHistory(step.history);
      change(step.value);
      setStatus("Wiederholt · automatische Speicherung folgt");
    },
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
  const mediaUrl = (id: string) =>
    `/api/v1/media/${id}/content?state=${media.find((m) => m.id === id)?.status ?? "unknown"}`;
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
                actions.edit(recovery);
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
          <fieldset disabled={!editing || busy} className="scene-meta">
            <legend>Szeneneigenschaften</legend>
            <label>
              Szenenname
              <input
                value={draft.name}
                maxLength={200}
                onChange={(e) =>
                  actions.edit({ ...draft, name: e.target.value }, "scene-name")
                }
              />
            </label>
            <label>
              Hintergrund
              <input
                type="color"
                value={draft.background}
                onChange={(e) =>
                  actions.edit(
                    { ...draft, background: e.target.value },
                    "scene-background",
                  )
                }
              />
            </label>
            <span className="muted">
              Logische Größe {draft.logicalWidth} × {draft.logicalHeight}
            </span>
          </fieldset>
          <SceneEditor
            draft={draft}
            editing={editing}
            busy={busy}
            media={media}
            mediaUrl={mediaUrl}
            selectedId={layerId}
            onSelect={setLayerId}
            actions={actions}
            mediaLoaded={mediaLoaded}
            notice={{ status, error, blocked }}
          />
        </>
      )}
    </section>
  );
}
