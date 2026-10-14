import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Actor } from "./auth.js";
import { transaction, type DB, type Queryable } from "./db.js";
import { showAccess, mediaAccess } from "./permissions.js";
import { HttpError, missing } from "./errors.js";
import { hash, token } from "./security.js";
import { remember } from "./content.js";
import { id } from "../../../packages/contracts/src/index.js";
import {
  sceneCreate,
  sceneLeaseRequest,
  scenePatch,
  sceneLease,
  sceneRecord,
  sceneMediaIds,
  type SceneDefinition,
} from "../../../packages/contracts/src/scene.js";

export const sceneDto = (s: any) =>
  sceneRecord.parse({
    id: s.id,
    showId: s.show_id,
    revision: s.revision,
    definition: s.definition,
  });
const locked = () =>
  new HttpError(
    409,
    "SCENE_LOCKED",
    "Szene wird bereits bearbeitet. Nach Freigabe oder Ablauf erneut öffnen.",
  );
async function touchShow(c: Queryable, showId: string, user: Actor) {
  const row = (
    await c.query(
      "UPDATE shows SET revision=revision+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING *",
      [showId, user.id],
    )
  ).rows[0];
  await remember(c, "show", row, user.id);
  return { previousShowRevision: row.revision - 1, showRevision: row.revision };
}
async function refreshActor(c: Queryable, user: Actor) {
  const identity = (
    await c.query(
      "SELECT u.admin,s.mfa_verified FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.user_id=$2 AND s.expires_at>clock_timestamp() AND u.enabled",
      [user.sessionHash, user.id],
    )
  ).rows[0];
  if (
    !identity ||
    ((identity.admin ||
      (
        await c.query(
          "SELECT 1 FROM grants WHERE user_id=$1 AND role='leitung' LIMIT 1",
          [user.id],
        )
      ).rowCount) &&
      !identity.mfa_verified)
  )
    throw new HttpError(401, "AUTH_FAILED", "Anmeldung nicht mehr gültig.");
  user.admin = identity.admin;
}
async function checkedScene(c: Queryable, user: Actor, sceneId: string) {
  // All scene mutations lock the parent first, including copies and cue edits.
  const found = (
    await c.query("SELECT show_id FROM scenes WHERE id=$1", [sceneId])
  ).rows[0];
  if (!found) missing();
  await c.query("SELECT id FROM shows WHERE id=$1 FOR UPDATE", [found.show_id]);
  await refreshActor(c, user);
  await showAccess(c, user, found.show_id, true);
  return (
    await c.query("SELECT * FROM scenes WHERE id=$1 FOR UPDATE", [sceneId])
  ).rows[0];
}
async function requireLease(
  c: Queryable,
  user: Actor,
  sceneId: string,
  raw: string,
) {
  const r = await c.query(
    "SELECT 1 FROM scene_leases WHERE scene_id=$1 AND session_hash=$2 AND token_hash=$3 AND expires_at>clock_timestamp() FOR UPDATE",
    [sceneId, user.sessionHash, hash(raw)],
  );
  if (!r.rowCount)
    throw new HttpError(
      409,
      "SCENE_LEASE_LOST",
      "Bearbeitungssperre abgelaufen oder nicht mehr gültig. Entwurf bleibt im Browser; erneut öffnen und vergleichen.",
    );
}
export async function validateSceneMedia(
  c: Queryable,
  user: Actor,
  show: any,
  definition: SceneDefinition,
) {
  for (const mediaId of new Set(sceneMediaIds(definition))) {
    const m = await mediaAccess(c, user, mediaId);
    if (!["image/png", "image/jpeg"].includes(m.mime))
      throw new HttpError(
        400,
        "SCENE_MEDIA_TYPE",
        "Bildebenen benötigen PNG oder JPEG.",
      );
    if (
      !(
        await c.query(
          "SELECT 1 FROM show_media WHERE show_id=$1 AND media_id=$2 UNION ALL SELECT 1 FROM media WHERE id=$2 AND event_id=$3",
          [show.id, mediaId, show.event_id],
        )
      ).rowCount
    )
      throw new HttpError(
        400,
        "MEDIA_SCOPE",
        "Szenenmedien müssen zur Show oder Veranstaltung gehören.",
      );
  }
}
export function sceneRoutes(app: FastifyInstance, db: DB) {
  app.get("/api/v1/shows/:id/scenes", async (req) => {
    const showId = id.parse((req.params as any).id);
    await showAccess(db, req.actor, showId);
    return (
      await db.query(
        "SELECT * FROM scenes WHERE show_id=$1 ORDER BY created_at,id",
        [showId],
      )
    ).rows.map(sceneDto);
  });
  app.post("/api/v1/shows/:id/scenes", async (req) => {
    const showId = id.parse((req.params as any).id),
      input = sceneCreate.parse(req.body);
    return transaction(db, async (c) => {
      await c.query("SELECT id FROM shows WHERE id=$1 FOR UPDATE", [showId]);
      await refreshActor(c, req.actor);
      await showAccess(c, req.actor, showId, true);
      if (
        Number(
          (
            await c.query("SELECT count(*) FROM scenes WHERE show_id=$1", [
              showId,
            ])
          ).rows[0].count,
        ) >= 200
      )
        throw new HttpError(
          409,
          "SCENE_LIMIT",
          "Dieser Vorbereitungsstand erlaubt höchstens 200 Szenen je Show.",
        );
      const definition = {
        name: input.name,
        logicalWidth: 1920,
        logicalHeight: 1080,
        background: "#000000",
        layers: [],
      };
      const row = (
        await c.query(
          "INSERT INTO scenes(id,show_id,definition,created_by,updated_by) VALUES($1,$2,$3,$4,$4) RETURNING *",
          [randomUUID(), showId, JSON.stringify(definition), req.actor.id],
        )
      ).rows[0];
      await remember(c, "scene", row, req.actor.id);
      const revisions = await touchShow(c, showId, req.actor);
      return { ...sceneDto(row), ...revisions };
    });
  });
  app.post("/api/v1/scenes/:id/lease", async (req) => {
    sceneLeaseRequest.parse(req.body ?? {});
    const sceneId = id.parse((req.params as any).id);
    return transaction(db, async (c) => {
      const row = await checkedScene(c, req.actor, sceneId),
        raw = token();
      const r = await c.query(
        "INSERT INTO scene_leases(scene_id,session_hash,token_hash,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '90 seconds') ON CONFLICT(scene_id) DO UPDATE SET session_hash=EXCLUDED.session_hash,token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at WHERE scene_leases.expires_at<=clock_timestamp() RETURNING expires_at",
        [sceneId, req.actor.sessionHash, hash(raw)],
      );
      if (!r.rowCount) throw locked();
      return {
        scene: sceneDto(row),
        leaseToken: raw,
        expiresAt: r.rows[0].expires_at,
      };
    });
  });
  app.patch("/api/v1/scenes/:id/lease", async (req) => {
    const sceneId = id.parse((req.params as any).id),
      input = sceneLease.parse(req.body);
    return transaction(db, async (c) => {
      await checkedScene(c, req.actor, sceneId);
      await requireLease(c, req.actor, sceneId, input.leaseToken);
      const r = await c.query(
        "UPDATE scene_leases SET expires_at=clock_timestamp()+interval '90 seconds' WHERE scene_id=$1 RETURNING expires_at",
        [sceneId],
      );
      return { expiresAt: r.rows[0].expires_at };
    });
  });
  app.delete("/api/v1/scenes/:id/lease", async (req) => {
    const sceneId = id.parse((req.params as any).id),
      input = sceneLease.parse(req.body);
    return transaction(db, async (c) => {
      await checkedScene(c, req.actor, sceneId);
      await requireLease(c, req.actor, sceneId, input.leaseToken);
      await c.query("DELETE FROM scene_leases WHERE scene_id=$1", [sceneId]);
      return { released: true };
    });
  });
  app.patch("/api/v1/scenes/:id", async (req) => {
    const sceneId = id.parse((req.params as any).id),
      input = scenePatch.parse(req.body);
    return transaction(db, async (c) => {
      const current = await checkedScene(c, req.actor, sceneId);
      await requireLease(c, req.actor, sceneId, input.leaseToken);
      if (current.revision !== input.expectedRevision)
        throw new HttpError(
          409,
          "REVISION_CONFLICT",
          "Szene wurde geändert. Eigenen Entwurf erhalten und mit dem Serverstand vergleichen.",
          { current: sceneDto(current) },
        );
      const show = await showAccess(c, req.actor, current.show_id, true);
      await validateSceneMedia(c, req.actor, show, input.definition);
      await refreshActor(c, req.actor);
      await showAccess(c, req.actor, current.show_id, true);
      await requireLease(c, req.actor, sceneId, input.leaseToken);
      const row = (
        await c.query(
          "UPDATE scenes SET definition=$2,revision=revision+1,updated_by=$3,updated_at=now() WHERE id=$1 RETURNING *",
          [sceneId, JSON.stringify(input.definition), req.actor.id],
        )
      ).rows[0];
      await remember(c, "scene", row, req.actor.id);
      const revisions = await touchShow(c, current.show_id, req.actor);
      return { ...sceneDto(row), ...revisions };
    });
  });
}
