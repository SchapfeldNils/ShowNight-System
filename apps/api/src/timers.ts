import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id } from "../../../packages/contracts/src/index.js";
import {
  timerPreparation,
  defaultTimerPreparation,
} from "../../../packages/contracts/src/timer.js";
import { actor } from "./auth.js";
import { showAccess } from "./permissions.js";
import { transaction, type DB } from "./db.js";
import { remember } from "./content.js";
import { HttpError } from "./errors.js";

const input = z.strictObject({
  expectedRevision: z.int().min(0),
  preset: timerPreparation,
});
const dto = (row: any) =>
  row
    ? { revision: row.revision, preset: timerPreparation.parse(row.preset) }
    : { revision: 0, preset: defaultTimerPreparation };

export function timerRoutes(app: FastifyInstance, db: DB) {
  app.get("/api/v1/shows/:id/timer-preparation", async (req) => {
    const showId = id.parse((req.params as any).id);
    await showAccess(db, req.actor, showId);
    return dto(
      (
        await db.query("SELECT * FROM timer_preparations WHERE show_id=$1", [
          showId,
        ])
      ).rows[0],
    );
  });
  app.put("/api/v1/shows/:id/timer-preparation", async (req) => {
    const showId = id.parse((req.params as any).id),
      body = input.parse(req.body);
    return transaction(db, async (c) => {
      await c.query("SELECT id FROM shows WHERE id=$1 FOR UPDATE", [showId]);
      const current = await actor(c, req.cookies.sn_session);
      if (!current)
        throw new HttpError(401, "AUTH_FAILED", "Anmeldung nicht mehr gültig.");
      await showAccess(c, current, showId, true);
      const previous = (
        await c.query("SELECT * FROM timer_preparations WHERE show_id=$1", [
          showId,
        ])
      ).rows[0];
      if ((previous?.revision ?? 0) !== body.expectedRevision)
        throw new HttpError(
          409,
          "REVISION_CONFLICT",
          "Timerentwurf wurde geändert. Eigenen Entwurf mit dem aktuellen Stand vergleichen.",
          { current: dto(previous) },
        );
      const row = (
        await c.query(
          "INSERT INTO timer_preparations(show_id,revision,preset,created_by,updated_by) VALUES($1,1,$2,$3,$3) ON CONFLICT(show_id) DO UPDATE SET revision=timer_preparations.revision+1,preset=EXCLUDED.preset,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING *",
          [showId, JSON.stringify(body.preset), current.id],
        )
      ).rows[0];
      await remember(
        c,
        "timer-preparation",
        { ...row, id: showId },
        current.id,
      );
      const show = (
        await c.query(
          "UPDATE shows SET revision=revision+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING *",
          [showId, current.id],
        )
      ).rows[0];
      await remember(c, "show", show, current.id);
      return {
        ...dto(row),
        previousShowRevision: show.revision - 1,
        showRevision: show.revision,
      };
    });
  });
}
