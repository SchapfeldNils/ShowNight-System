import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id } from "../../../packages/contracts/src/index.js";
import {
  contingentCreate,
  contingentPatch,
  defaultTicketSettings,
  reviewTickets,
  ticketSettingsInput,
  ticketTypeCreate,
  ticketTypePatch,
  type TicketContingent,
  type TicketSettings,
  type TicketType,
} from "../../../packages/contracts/src/tickets.js";
import type { Actor } from "./auth.js";
import { remember } from "./content.js";
import { transaction, type DB, type Queryable } from "./db.js";
import { HttpError, missing } from "./errors.js";
import { eventAccess } from "./permissions.js";

// S8-01: nur Admin und Veranstaltungsleitung (D019). Kein Bestand, keine Bestellung, kein Verkauf.

const iso = (value: Date | null) => (value ? value.toISOString() : null);
const settingsDto = (row: any): TicketSettings =>
  row
    ? {
        revision: row.revision,
        saleStartsAt: iso(row.sale_starts_at),
        saleEndsAt: iso(row.sale_ends_at),
        maxTicketsPerOrder: row.max_tickets_per_order,
        admissionAt: iso(row.admission_at),
        startsAt: iso(row.starts_at),
      }
    : defaultTicketSettings;
const contingentDto = (row: any): TicketContingent => ({
  id: row.id,
  name: row.name,
  capacity: row.capacity,
  sort: row.sort,
  revision: row.revision,
});
const typeDto = (row: any): TicketType => ({
  id: row.id,
  contingentId: row.contingent_id,
  name: row.name,
  publicDescription: row.public_description,
  priceCents: row.price_cents,
  typeLimit: row.type_limit,
  discountHint: row.discount_hint,
  requiresPurchaseConfirmation: row.requires_purchase_confirmation,
  requiresAdmissionProof: row.requires_admission_proof,
  active: row.active,
  sort: row.sort,
  revision: row.revision,
});

function conflict(current: unknown): never {
  throw new HttpError(
    409,
    "REVISION_CONFLICT",
    "Eine andere Person hat diesen Stand geändert. Aktuellen Stand prüfen und erneut speichern.",
    { current },
  );
}

/** Sperrt die Veranstaltung, prüft Admin/Leitung und das aktivierte Ticketmodul. */
async function ticketAccess(c: Queryable, actor: Actor, eventId: string) {
  await c.query("SELECT id FROM events WHERE id=$1 FOR UPDATE", [eventId]);
  const event = await eventAccess(c, actor, eventId, true);
  if (!(event.modules as string[]).includes("tickets"))
    throw new HttpError(
      409,
      "MODULE_DISABLED",
      "Das Modul Tickets ist für diese Veranstaltung nicht aktiviert.",
    );
  return event;
}

async function overview(db: Queryable, eventId: string) {
  const [settings, contingents, types] = await Promise.all([
    db.query("SELECT * FROM ticket_settings WHERE event_id=$1", [eventId]),
    db.query(
      "SELECT * FROM ticket_contingents WHERE event_id=$1 ORDER BY sort, lower(name), id",
      [eventId],
    ),
    db.query(
      "SELECT * FROM ticket_types WHERE event_id=$1 ORDER BY sort, lower(name), id",
      [eventId],
    ),
  ]);
  const data = {
    settings: settingsDto(settings.rows[0]),
    contingents: contingents.rows.map(contingentDto),
    types: types.rows.map(typeDto),
  };
  return { ...data, review: reviewTickets(data) };
}

async function requireContingent(
  c: Queryable,
  eventId: string,
  contingentId: string,
) {
  const found = (
    await c.query(
      "SELECT 1 FROM ticket_contingents WHERE id=$1 AND event_id=$2",
      [contingentId, eventId],
    )
  ).rowCount;
  if (!found)
    throw new HttpError(
      400,
      "CONTINGENT_INVALID",
      "Das gewählte Kontingent gehört nicht zu dieser Veranstaltung.",
    );
}

async function eventOf(db: Queryable, table: string, rowId: string) {
  const row = (
    await db.query(`SELECT event_id FROM ${table} WHERE id=$1`, [rowId])
  ).rows[0];
  if (!row) missing();
  return row.event_id as string;
}

const expectedRevision = z.strictObject({
  expectedRevision: z.coerce.number().int().positive(),
});

export function ticketRoutes(app: FastifyInstance, db: DB) {
  app.get("/api/v1/events/:id/tickets", async (req) => {
    const eventId = id.parse((req.params as any).id);
    return transaction(db, async (c) => {
      await ticketAccess(c, req.actor, eventId);
      return overview(c, eventId);
    });
  });

  app.put("/api/v1/events/:id/tickets/settings", async (req) => {
    const eventId = id.parse((req.params as any).id),
      input = ticketSettingsInput.parse(req.body);
    return transaction(db, async (c) => {
      await ticketAccess(c, req.actor, eventId);
      const previous = (
        await c.query("SELECT * FROM ticket_settings WHERE event_id=$1", [
          eventId,
        ])
      ).rows[0];
      if ((previous?.revision ?? 0) !== input.expectedRevision)
        conflict(settingsDto(previous));
      const row = (
        await c.query(
          `INSERT INTO ticket_settings(event_id,sale_starts_at,sale_ends_at,max_tickets_per_order,admission_at,starts_at,created_by,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$7)
          ON CONFLICT(event_id) DO UPDATE SET sale_starts_at=EXCLUDED.sale_starts_at,sale_ends_at=EXCLUDED.sale_ends_at,
          max_tickets_per_order=EXCLUDED.max_tickets_per_order,admission_at=EXCLUDED.admission_at,starts_at=EXCLUDED.starts_at,
          revision=ticket_settings.revision+1,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING *`,
          [
            eventId,
            input.saleStartsAt,
            input.saleEndsAt,
            input.maxTicketsPerOrder,
            input.admissionAt,
            input.startsAt,
            req.actor.id,
          ],
        )
      ).rows[0];
      await remember(
        c,
        "ticket-settings",
        { ...row, id: eventId },
        req.actor.id,
      );
      return overview(c, eventId);
    });
  });

  app.post("/api/v1/events/:id/tickets/contingents", async (req) => {
    const eventId = id.parse((req.params as any).id),
      input = contingentCreate.parse(req.body);
    return transaction(db, async (c) => {
      await ticketAccess(c, req.actor, eventId);
      const row = (
        await c.query(
          "INSERT INTO ticket_contingents(id,event_id,name,capacity,sort,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING *",
          [
            randomUUID(),
            eventId,
            input.name,
            input.capacity,
            input.sort,
            req.actor.id,
          ],
        )
      ).rows[0];
      await remember(c, "ticket-contingent", row, req.actor.id);
      return overview(c, eventId);
    });
  });

  app.patch("/api/v1/ticket-contingents/:id", async (req) => {
    const contingentId = id.parse((req.params as any).id),
      input = contingentPatch.parse(req.body);
    const eventId = await eventOf(db, "ticket_contingents", contingentId);
    return transaction(db, async (c) => {
      await ticketAccess(c, req.actor, eventId);
      const current = (
        await c.query(
          "SELECT * FROM ticket_contingents WHERE id=$1 AND event_id=$2 FOR UPDATE",
          [contingentId, eventId],
        )
      ).rows[0];
      if (!current) missing();
      if (current.revision !== input.expectedRevision)
        conflict(contingentDto(current));
      const row = (
        await c.query(
          "UPDATE ticket_contingents SET name=$2,capacity=$3,sort=$4,revision=revision+1,updated_by=$5,updated_at=now() WHERE id=$1 RETURNING *",
          [
            contingentId,
            input.name ?? current.name,
            input.capacity ?? current.capacity,
            input.sort ?? current.sort,
            req.actor.id,
          ],
        )
      ).rows[0];
      await remember(c, "ticket-contingent", row, req.actor.id);
      return overview(c, eventId);
    });
  });

  app.delete("/api/v1/ticket-contingents/:id", async (req) => {
    const contingentId = id.parse((req.params as any).id),
      { expectedRevision: expected } = expectedRevision.parse(req.query);
    const eventId = await eventOf(db, "ticket_contingents", contingentId);
    return transaction(db, async (c) => {
      await ticketAccess(c, req.actor, eventId);
      const current = (
        await c.query(
          "SELECT * FROM ticket_contingents WHERE id=$1 AND event_id=$2 FOR UPDATE",
          [contingentId, eventId],
        )
      ).rows[0];
      if (!current) missing();
      if (current.revision !== expected) conflict(contingentDto(current));
      const used = (
        await c.query(
          "SELECT count(*)::int AS count FROM ticket_types WHERE contingent_id=$1",
          [contingentId],
        )
      ).rows[0].count as number;
      if (used)
        throw new HttpError(
          409,
          "CONTINGENT_IN_USE",
          `Das Kontingent wird von ${used} Ticketart${used === 1 ? "" : "en"} verwendet. Diese zuerst einem anderen Kontingent zuordnen oder löschen.`,
        );
      await c.query("DELETE FROM ticket_contingents WHERE id=$1", [
        contingentId,
      ]);
      await remember(
        c,
        "ticket-contingent",
        { ...current, revision: current.revision + 1, deleted: true },
        req.actor.id,
      );
      return overview(c, eventId);
    });
  });

  app.post("/api/v1/events/:id/tickets/types", async (req) => {
    const eventId = id.parse((req.params as any).id),
      input = ticketTypeCreate.parse(req.body);
    return transaction(db, async (c) => {
      await ticketAccess(c, req.actor, eventId);
      await requireContingent(c, eventId, input.contingentId);
      const row = (
        await c.query(
          `INSERT INTO ticket_types(id,event_id,contingent_id,name,public_description,price_cents,type_limit,discount_hint,
          requires_purchase_confirmation,requires_admission_proof,active,sort,created_by,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING *`,
          [
            randomUUID(),
            eventId,
            input.contingentId,
            input.name,
            input.publicDescription,
            input.priceCents,
            input.typeLimit,
            input.discountHint,
            input.requiresPurchaseConfirmation,
            input.requiresAdmissionProof,
            input.active,
            input.sort,
            req.actor.id,
          ],
        )
      ).rows[0];
      await remember(c, "ticket-type", row, req.actor.id);
      return overview(c, eventId);
    });
  });

  app.patch("/api/v1/ticket-types/:id", async (req) => {
    const typeId = id.parse((req.params as any).id),
      input = ticketTypePatch.parse(req.body);
    const eventId = await eventOf(db, "ticket_types", typeId);
    return transaction(db, async (c) => {
      await ticketAccess(c, req.actor, eventId);
      const current = (
        await c.query(
          "SELECT * FROM ticket_types WHERE id=$1 AND event_id=$2 FOR UPDATE",
          [typeId, eventId],
        )
      ).rows[0];
      if (!current) missing();
      if (current.revision !== input.expectedRevision)
        conflict(typeDto(current));
      if (input.contingentId)
        await requireContingent(c, eventId, input.contingentId);
      const pick = <K extends keyof typeof input>(key: K, column: string) =>
        input[key] === undefined ? current[column] : input[key];
      const row = (
        await c.query(
          `UPDATE ticket_types SET contingent_id=$2,name=$3,public_description=$4,price_cents=$5,type_limit=$6,discount_hint=$7,
          requires_purchase_confirmation=$8,requires_admission_proof=$9,active=$10,sort=$11,
          revision=revision+1,updated_by=$12,updated_at=now() WHERE id=$1 RETURNING *`,
          [
            typeId,
            pick("contingentId", "contingent_id"),
            pick("name", "name"),
            pick("publicDescription", "public_description"),
            pick("priceCents", "price_cents"),
            pick("typeLimit", "type_limit"),
            pick("discountHint", "discount_hint"),
            pick(
              "requiresPurchaseConfirmation",
              "requires_purchase_confirmation",
            ),
            pick("requiresAdmissionProof", "requires_admission_proof"),
            pick("active", "active"),
            pick("sort", "sort"),
            req.actor.id,
          ],
        )
      ).rows[0];
      await remember(c, "ticket-type", row, req.actor.id);
      return overview(c, eventId);
    });
  });

  app.delete("/api/v1/ticket-types/:id", async (req) => {
    const typeId = id.parse((req.params as any).id),
      { expectedRevision: expected } = expectedRevision.parse(req.query);
    const eventId = await eventOf(db, "ticket_types", typeId);
    return transaction(db, async (c) => {
      await ticketAccess(c, req.actor, eventId);
      const current = (
        await c.query(
          "SELECT * FROM ticket_types WHERE id=$1 AND event_id=$2 FOR UPDATE",
          [typeId, eventId],
        )
      ).rows[0];
      if (!current) missing();
      if (current.revision !== expected) conflict(typeDto(current));
      await c.query("DELETE FROM ticket_types WHERE id=$1", [typeId]);
      await remember(
        c,
        "ticket-type",
        { ...current, revision: current.revision + 1, deleted: true },
        req.actor.id,
      );
      return overview(c, eventId);
    });
  });
}
