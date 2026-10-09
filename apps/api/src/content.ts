import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  eventCreate,
  eventPatch,
  showCreate,
  showPatch,
  showCopy,
  id,
  name,
  grantInput,
  userCreate,
  moduleKeys,
  eventRecord,
  showRecord,
} from "../../../packages/contracts/src/index.js";
import type { Config } from "./config.js";
import type { Actor } from "./auth.js";
import { transaction, type DB, type Queryable } from "./db.js";
import { eventAccess, showAccess, mediaAccess } from "./permissions.js";
import { HttpError, forbidden } from "./errors.js";
import { token, hash } from "./security.js";
export const eventDto = (e: any, user: Actor) =>
  eventRecord.parse({
    id: e.id,
    name: e.name,
    date: e.date,
    location: e.location,
    modules: e.modules,
    revision: e.revision,
    role: user.admin ? "admin" : e.lead ? "leitung" : "mitglied",
    canEdit: user.admin || !!e.lead,
  });
export async function showDto(db: Queryable, s: any) {
  return showRecord.parse({
    id: s.id,
    eventId: s.event_id,
    name: s.name,
    description: s.description,
    cues: s.cues,
    revision: s.revision,
    sourceShowId: s.source_show_id,
    sourceRevision: s.source_revision,
    canEdit: !!s.canEdit,
    teamIds: (
      await db.query("SELECT team_id FROM show_teams WHERE show_id=$1", [s.id])
    ).rows.map((r) => r.team_id),
  });
}
export async function remember(
  db: Queryable,
  type: string,
  row: any,
  actorId: string,
) {
  await db.query(
    "INSERT INTO revisions(entity_type,entity_id,revision,payload,actor_id) VALUES($1,$2,$3,$4,$5)",
    [type, row.id, row.revision, JSON.stringify(row), actorId],
  );
}
function conflict(current: unknown): never {
  throw new HttpError(
    409,
    "REVISION_CONFLICT",
    "Eine andere Person hat diesen Stand geändert. Bitte Fassungen vergleichen.",
    { current },
  );
}
export async function visibleEvents(db: Queryable, user: Actor) {
  const rows = (
    await db.query(
      `SELECT e.*,EXISTS(SELECT 1 FROM grants g WHERE g.event_id=e.id AND g.user_id=$1 AND g.role='leitung') AS lead FROM events e WHERE $2 OR EXISTS(SELECT 1 FROM grants g WHERE g.event_id=e.id AND g.user_id=$1) OR EXISTS(SELECT 1 FROM event_teams et JOIN team_members tm ON tm.team_id=et.team_id WHERE et.event_id=e.id AND tm.user_id=$1) ORDER BY e.created_at DESC`,
      [user.id, user.admin],
    )
  ).rows;
  return rows.map((e) => eventDto(e, user));
}
export function contentRoutes(app: FastifyInstance, db: DB, cfg: Config) {
  app.get("/api/v1/events", (req) => visibleEvents(db, req.actor));
  app.post("/api/v1/events", async (req) => {
    // Event creation grants Leitung, so require a verified second factor before entering that role.
    if (!req.actor.mfaVerified)
      throw new HttpError(
        403,
        "MFA_REQUIRED",
        "Veranstaltungsleitung benötigt MFA. Bitte Administration kontaktieren.",
      );
    const input = eventCreate.parse(req.body);
    return transaction(db, async (c) => {
      const modules =
        input.template === "shownight"
          ? [...moduleKeys]
          : input.template === "spieleabend"
            ? ["organisation", "shows", "spiele", "technik"]
            : ["organisation"];
      const e = (
        await c.query(
          "INSERT INTO events(id,name,modules,created_by,updated_by) VALUES($1,$2,$3,$4,$4) RETURNING *",
          [randomUUID(), input.name, JSON.stringify(modules), req.actor.id],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO grants(event_id,user_id,role) VALUES($1,$2,'leitung')",
        [e.id, req.actor.id],
      );
      await remember(c, "event", e, req.actor.id);
      return eventDto({ ...e, lead: true }, req.actor);
    });
  });
  app.get("/api/v1/events/:id", async (req) =>
    eventDto(
      await eventAccess(db, req.actor, id.parse((req.params as any).id)),
      req.actor,
    ),
  );
  app.patch("/api/v1/events/:id", async (req) => {
    const eventId = id.parse((req.params as any).id),
      input = eventPatch.parse(req.body);
    return transaction(db, async (c) => {
      await c.query("SELECT id FROM events WHERE id=$1 FOR UPDATE", [eventId]);
      const current = await eventAccess(c, req.actor, eventId, true);
      if (current.revision !== input.expectedRevision)
        conflict(eventDto(current, req.actor));
      const e = (
        await c.query(
          "UPDATE events SET name=$2,date=$3,location=$4,modules=$5,revision=revision+1,updated_by=$6,updated_at=now() WHERE id=$1 RETURNING *",
          [
            eventId,
            input.name ?? current.name,
            input.date === undefined ? current.date : input.date,
            input.location ?? current.location,
            JSON.stringify(input.modules ?? current.modules),
            req.actor.id,
          ],
        )
      ).rows[0];
      await remember(c, "event", e, req.actor.id);
      return eventDto({ ...e, lead: current.lead }, req.actor);
    });
  });
  app.get("/api/v1/events/:id/grants", async (req) => {
    const eventId = id.parse((req.params as any).id);
    await eventAccess(db, req.actor, eventId, true);
    return (
      await db.query(
        'SELECT g.user_id AS "userId",u.display_name AS "displayName",u.login,g.role FROM grants g JOIN users u ON u.id=g.user_id WHERE g.event_id=$1',
        [eventId],
      )
    ).rows;
  });
  app.post("/api/v1/events/:id/grants", async (req) => {
    const eventId = id.parse((req.params as any).id),
      input = grantInput.parse(req.body);
    await eventAccess(db, req.actor, eventId, true);
    if (!req.actor.admin && input.role === "technik") forbidden();
    // Leitung cannot discover or attach arbitrary global users; existing event membership is required.
    if (
      !req.actor.admin &&
      !(
        await db.query(
          "SELECT 1 FROM grants WHERE event_id=$1 AND user_id=$2",
          [eventId, input.userId],
        )
      ).rowCount
    )
      forbidden();
    await db.query(
      "INSERT INTO grants(event_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [eventId, input.userId, input.role],
    );
    return { granted: true };
  });
  app.delete("/api/v1/events/:id/grants/:userId/:role", async (req) => {
    const p = z
      .object({ id, userId: id, role: grantInput.shape.role })
      .parse(req.params);
    await eventAccess(db, req.actor, p.id, true);
    if (!req.actor.admin && (p.role === "technik" || p.userId === req.actor.id))
      forbidden();
    await db.query(
      "DELETE FROM grants WHERE event_id=$1 AND user_id=$2 AND role=$3",
      [p.id, p.userId, p.role],
    );
    return { revoked: true };
  });
  app.get("/api/v1/users", async (req) => {
    if (!req.actor.admin) forbidden();
    return (
      await db.query(
        'SELECT id,login,display_name AS "displayName",enabled,admin,mfa_secret IS NOT NULL AS "mfaEnabled" FROM users ORDER BY login',
      )
    ).rows;
  });
  app.post("/api/v1/events/:id/users", async (req) => {
    const eventId = id.parse((req.params as any).id),
      input = userCreate.parse(req.body);
    await eventAccess(db, req.actor, eventId, true);
    const invitation = token(),
      userId = randomUUID();
    await transaction(db, async (c) => {
      await c.query(
        "INSERT INTO users(id,login,display_name) VALUES($1,$2,$3)",
        [userId, input.login, input.displayName],
      );
      await c.query(
        "INSERT INTO grants(event_id,user_id,role) VALUES($1,$2,'mitglied')",
        [eventId, userId],
      );
      await c.query(
        "INSERT INTO invitations(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '24 hours')",
        [hash(invitation), userId],
      );
    });
    return {
      id: userId,
      invitationUrl: cfg.PUBLIC_BASE_URL + "/#einladung=" + invitation,
      delivery: "manual",
      message: "Einmaliger Einrichtungslink. Keine E-Mail versendet.",
    };
  });
  app.get("/api/v1/teams", async (req) => {
    return (
      await db.query(
        `SELECT DISTINCT t.id,t.name FROM teams t LEFT JOIN event_teams et ON et.team_id=t.id LEFT JOIN grants g ON g.event_id=et.event_id AND g.user_id=$1 LEFT JOIN team_members tm ON tm.team_id=t.id AND tm.user_id=$1 WHERE $2 OR t.created_by=$1 OR g.user_id IS NOT NULL OR tm.user_id IS NOT NULL ORDER BY t.name`,
        [req.actor.id, req.actor.admin],
      )
    ).rows;
  });
  app.post("/api/v1/events/:id/teams", async (req) => {
    const eventId = id.parse((req.params as any).id),
      input = z
        .union([z.strictObject({ teamId: id }), z.strictObject({ name })])
        .parse(req.body);
    await eventAccess(db, req.actor, eventId, true);
    return transaction(db, async (c) => {
      let teamId: string;
      if ("name" in input) {
        teamId = randomUUID();
        await c.query(
          "INSERT INTO teams(id,name,created_by) VALUES($1,$2,$3)",
          [teamId, input.name, req.actor.id],
        );
      } else {
        teamId = input.teamId;
        if (
          !req.actor.admin &&
          !(
            await c.query("SELECT 1 FROM teams WHERE id=$1 AND created_by=$2", [
              teamId,
              req.actor.id,
            ])
          ).rowCount
        )
          forbidden();
      }
      await c.query(
        "INSERT INTO event_teams(event_id,team_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [eventId, teamId],
      );
      return { id: teamId };
    });
  });
  app.get("/api/v1/events/:id/teams", async (req) => {
    const eventId = id.parse((req.params as any).id);
    await eventAccess(db, req.actor, eventId);
    return (
      await db.query(
        "SELECT t.id,t.name,COALESCE((SELECT jsonb_agg(user_id) FROM team_members WHERE team_id=t.id),'[]') AS \"userIds\" FROM teams t JOIN event_teams et ON et.team_id=t.id WHERE et.event_id=$1",
        [eventId],
      )
    ).rows;
  });
  app.post("/api/v1/events/:id/teams/:teamId/members", async (req) => {
    const p = z.object({ id, teamId: id }).parse(req.params),
      input = z.strictObject({ userId: id }).parse(req.body);
    await eventAccess(db, req.actor, p.id, true);
    if (
      !(
        await db.query(
          "SELECT 1 FROM event_teams WHERE event_id=$1 AND team_id=$2",
          [p.id, p.teamId],
        )
      ).rowCount
    )
      forbidden();
    if (
      !req.actor.admin &&
      (!(
        await db.query("SELECT 1 FROM teams WHERE id=$1 AND created_by=$2", [
          p.teamId,
          req.actor.id,
        ])
      ).rowCount ||
        !(
          await db.query(
            "SELECT 1 FROM grants WHERE event_id=$1 AND user_id=$2",
            [p.id, input.userId],
          )
        ).rowCount)
    )
      forbidden();
    await db.query(
      "INSERT INTO team_members(team_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [p.teamId, input.userId],
    );
    return { added: true };
  });
  app.get("/api/v1/shows", async (req) => {
    const q = z.object({ eventId: id.optional() }).parse(req.query);
    if (q.eventId) await eventAccess(db, req.actor, q.eventId);
    const candidates = (
      await db.query(
        "SELECT id FROM shows WHERE ($1::uuid IS NULL AND event_id IS NULL) OR event_id=$1 ORDER BY created_at",
        [q.eventId ?? null],
      )
    ).rows;
    const visible = [];
    for (const s of candidates) {
      try {
        visible.push(await showDto(db, await showAccess(db, req.actor, s.id)));
      } catch (e) {
        if (!(e instanceof HttpError && [403, 404].includes(e.status))) throw e;
      }
    }
    return visible;
  });
  app.get("/api/v1/shows/:id", async (req) =>
    showDto(
      db,
      await showAccess(db, req.actor, id.parse((req.params as any).id)),
    ),
  );
  app.post("/api/v1/shows", async (req) => {
    const input = showCreate.parse(req.body);
    return transaction(db, async (c) => {
      const s = (
        await c.query(
          "INSERT INTO shows(id,name,description,created_by,updated_by) VALUES($1,$2,$3,$4,$4) RETURNING *",
          [randomUUID(), input.name, input.description, req.actor.id],
        )
      ).rows[0];
      await remember(c, "show", s, req.actor.id);
      return showDto(c, { ...s, canEdit: true });
    });
  });
  app.patch("/api/v1/shows/:id", async (req) => {
    const showId = id.parse((req.params as any).id),
      input = showPatch.parse(req.body);
    return transaction(db, async (c) => {
      await c.query("SELECT id FROM shows WHERE id=$1 FOR UPDATE", [showId]);
      const current = await showAccess(c, req.actor, showId, true);
      if (current.revision !== input.expectedRevision)
        conflict(await showDto(c, current));
      if (input.cues) {
        if (new Set(input.cues.map((c) => c.id)).size !== input.cues.length)
          throw new HttpError(
            400,
            "DUPLICATE_CUE",
            "Einsatzkennungen müssen eindeutig sein.",
          );
        for (const mediaId of new Set(
          input.cues.flatMap((cue) => cue.mediaIds),
        )) {
          await mediaAccess(c, req.actor, mediaId);
          if (
            !(
              await c.query(
                "SELECT 1 FROM show_media WHERE show_id=$1 AND media_id=$2 UNION ALL SELECT 1 FROM media WHERE id=$2 AND event_id=$3",
                [showId, mediaId, current.event_id],
              )
            ).rowCount
          )
            throw new HttpError(
              400,
              "MEDIA_SCOPE",
              "Medien müssen zum Show- oder Veranstaltungsbereich gehören.",
            );
        }
      }
      const s = (
        await c.query(
          "UPDATE shows SET name=$2,description=$3,cues=$4,revision=revision+1,updated_by=$5,updated_at=now() WHERE id=$1 RETURNING *",
          [
            showId,
            input.name ?? current.name,
            input.description ?? current.description,
            JSON.stringify(input.cues ?? current.cues),
            req.actor.id,
          ],
        )
      ).rows[0];
      await remember(c, "show", s, req.actor.id);
      return showDto(c, { ...s, canEdit: true });
    });
  });
  app.post("/api/v1/events/:id/show-copies", async (req) => {
    const eventId = id.parse((req.params as any).id),
      input = showCopy.parse(req.body);
    return transaction(db, async (c) => {
      await eventAccess(c, req.actor, eventId, true);
      await c.query("SELECT id FROM shows WHERE id=$1 FOR SHARE", [
        input.sourceShowId,
      ]);
      const source = await showAccess(c, req.actor, input.sourceShowId);
      if (source.revision !== input.sourceRevision)
        conflict(await showDto(c, source));
      const copiedCues = source.cues.map((cue: any) => ({
        ...cue,
        id: randomUUID(),
      }));
      const s = (
        await c.query(
          "INSERT INTO shows(id,event_id,name,description,cues,source_show_id,source_revision,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *",
          [
            randomUUID(),
            eventId,
            source.name,
            source.description,
            JSON.stringify(copiedCues),
            source.id,
            source.revision,
            req.actor.id,
          ],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO show_media(show_id,media_id) SELECT $1,media_id FROM show_media WHERE show_id=$2",
        [s.id, source.id],
      );
      for (const mediaId of new Set<string>(
        source.cues.flatMap((cue: any) => cue.mediaIds),
      )) {
        await mediaAccess(c, req.actor, mediaId);
        await c.query(
          "INSERT INTO show_media(show_id,media_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [s.id, mediaId],
        );
      }
      await remember(c, "show", s, req.actor.id);
      return showDto(c, { ...s, canEdit: true });
    });
  });
  app.post("/api/v1/shows/:id/teams", async (req) => {
    const showId = id.parse((req.params as any).id),
      input = z.strictObject({ teamId: id }).parse(req.body);
    const s = await showAccess(db, req.actor, showId, true);
    if (s.event_id) {
      await eventAccess(db, req.actor, s.event_id, true);
      if (
        !(
          await db.query(
            "SELECT 1 FROM event_teams WHERE event_id=$1 AND team_id=$2",
            [s.event_id, input.teamId],
          )
        ).rowCount
      )
        forbidden();
    } else if (
      !req.actor.admin &&
      !(
        await db.query("SELECT 1 FROM teams WHERE id=$1 AND created_by=$2", [
          input.teamId,
          req.actor.id,
        ])
      ).rowCount
    )
      forbidden();
    await db.query(
      "INSERT INTO show_teams(show_id,team_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [showId, input.teamId],
    );
    return { assigned: true };
  });
  app.get("/api/v1/shows/:id/history", async (req) => {
    const showId = id.parse((req.params as any).id);
    await showAccess(db, req.actor, showId);
    return (
      await db.query(
        "SELECT revision,payload,created_at AS \"createdAt\" FROM revisions WHERE entity_type='show' AND entity_id=$1 ORDER BY revision DESC",
        [showId],
      )
    ).rows;
  });
}
