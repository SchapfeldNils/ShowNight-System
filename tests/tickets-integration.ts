import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { fixture } from "./fixture.js";
import { hash, hashPassword, totp } from "../apps/api/src/security.js";
import { database, migrate } from "../apps/api/src/db.js";
import { defaultTicketSettings } from "../packages/contracts/src/tickets.js";

test(
  "S8-01 Ticketvorbereitung: PostgreSQL-Rechte, Modul, Revisionen und Kontingentbindung",
  { timeout: 180000 },
  async (t) => {
    const f = await fixture(55458),
      { db, app, cfg } = f;
    type Session = { cookie: string; csrf: string };
    const anonymous: Session = { cookie: "", csrf: "" };
    let admin: Session = anonymous;
    const req = (
      path: string,
      method = "GET",
      payload?: unknown,
      as = admin,
      extra = {},
    ) =>
      app.inject({
        url: "/api/v1" + path,
        method: method as any,
        headers: {
          origin: cfg.origin,
          cookie: as.cookie,
          "x-csrf-token": as.csrf,
          ...extra,
        },
        ...(payload === undefined ? {} : { payload: payload as any }),
      });
    const ok = async (
      path: string,
      method = "GET",
      payload?: unknown,
      as = admin,
    ) => {
      const r = await req(path, method, payload, as);
      assert.equal(r.statusCode, 200, r.body);
      return r.json();
    };
    const status = async (
      expected: number,
      path: string,
      method = "GET",
      payload?: unknown,
      as = admin,
    ) => {
      const r = await req(path, method, payload, as);
      assert.equal(r.statusCode, expected, method + " " + path + " " + r.body);
      return r.json();
    };
    /** Synthetisches Konto mit direkt angelegter Sitzung; MFA nur für Leitungstests gesetzt. */
    async function account(
      login: string,
      mfa: boolean,
      grants: [string, string][] = [],
    ) {
      const id = randomUUID();
      await db.query(
        "INSERT INTO users(id,login,display_name,password_hash) VALUES($1,$2,$2,$3)",
        [id, login, await hashPassword(randomBytes(20).toString("hex"))],
      );
      for (const [eventId, role] of grants)
        await db.query(
          "INSERT INTO grants(user_id,event_id,role) VALUES($1,$2,$3)",
          [id, eventId, role],
        );
      const raw = randomBytes(32).toString("hex"),
        csrf = randomBytes(20).toString("hex");
      await db.query(
        "INSERT INTO sessions(token_hash,user_id,csrf_token,mfa_verified,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 hour')",
        [hash(raw), id, csrf, mfa],
      );
      return { id, session: { cookie: "sn_session=" + raw, csrf } };
    }
    const count = async (table: string) =>
      Number((await db.query(`SELECT count(*) FROM ${table}`)).rows[0].count);
    const settings = {
      saleStartsAt: "2026-10-01T08:00:00.000Z",
      saleEndsAt: "2026-11-14T17:00:00.000Z",
      maxTicketsPerOrder: 8,
      admissionAt: "2026-11-14T17:00:00.000Z",
      startsAt: "2026-11-14T18:00:00.000Z",
    };
    let event: any, other: any, plain: any, saal: any, empore: any;
    try {
      const first = await ok(
        "/auth/login",
        "POST",
        { login: "admin", password: f.adminPassword },
        anonymous,
      );
      const verified = await req(
        "/auth/mfa/verify",
        "POST",
        { challenge: first.challenge, code: totp(first.secret) },
        anonymous,
      );
      assert.equal(verified.statusCode, 200);
      admin = {
        cookie: "sn_session=" + verified.cookies[0].value,
        csrf: verified.json().csrfToken,
      };

      await t.test("Standardstand ist leer und nur lesend", async () => {
        event = await ok("/events", "POST", {
          name: "Synthetische Ticketnacht",
        });
        other = await ok("/events", "POST", {
          name: "Synthetischer Zweitabend",
        });
        const overview = await ok(`/events/${event.id}/tickets`);
        assert.deepEqual(overview.settings, defaultTicketSettings);
        assert.deepEqual(overview.contingents, []);
        assert.deepEqual(overview.types, []);
        assert.deepEqual(
          overview.review.hints.map((h: any) => h.code),
          ["NO_ACTIVE_TYPE", "SALE_TIMES_MISSING"],
        );
        for (const table of [
          "ticket_settings",
          "ticket_contingents",
          "ticket_types",
        ])
          assert.equal(await count(table), 0);
      });

      await t.test("Sitzung, CSRF und Ursprung werden geprüft", async () => {
        const path = `/events/${event.id}/tickets/settings`;
        const body = { expectedRevision: 0, ...settings };
        await status(
          401,
          `/events/${event.id}/tickets`,
          "GET",
          undefined,
          anonymous,
        );
        assert.equal(
          (await req(path, "PUT", body, admin, { "x-csrf-token": "falsch" }))
            .statusCode,
          403,
        );
        assert.equal(
          (
            await req(path, "PUT", body, admin, {
              origin: "https://other.invalid",
            })
          ).statusCode,
          403,
        );
        assert.equal(await count("ticket_settings"), 0);
      });

      await t.test(
        "Nur Admin und Leitung (D019); Modul muss aktiv sein",
        async () => {
          const lead = await account("ticket-leitung", true, [
            [event.id, "leitung"],
          ]);
          const leadNoMfa = await account("ticket-leitung-ohne-mfa", false, [
            [event.id, "leitung"],
          ]);
          const otherLead = await account("ticket-fremdleitung", true, [
            [other.id, "leitung"],
          ]);
          const member = await account("ticket-mitglied", false, [
            [event.id, "mitglied"],
          ]);
          const live = await account("ticket-live", false, [
            [event.id, "live"],
          ]);
          const foreign = await account("ticket-fremd", false);
          const path = `/events/${event.id}/tickets`;
          const lead200 = await ok(path, "GET", undefined, lead.session);
          assert.equal(lead200.settings.revision, 0);
          await status(401, path, "GET", undefined, leadNoMfa.session);
          for (const reader of [member, live])
            await status(403, path, "GET", undefined, reader.session);
          for (const outsider of [otherLead, foreign])
            await status(404, path, "GET", undefined, outsider.session);
          await status(
            403,
            path + "/contingents",
            "POST",
            { name: "Mitglied", capacity: 10 },
            member.session,
          );
          const created = await ok(
            path + "/contingents",
            "POST",
            { name: "Leitungsprobe", capacity: 10 },
            lead.session,
          );
          const probe = created.contingents[0];
          await ok(
            `/ticket-contingents/${probe.id}?expectedRevision=${probe.revision}`,
            "DELETE",
            undefined,
            lead.session,
          );
          await status(
            403,
            path + "/settings",
            "PUT",
            { expectedRevision: 0, ...settings },
            live.session,
          );
          plain = await ok("/events", "POST", {
            name: "Synthetischer Abend ohne Tickets",
            template: "custom",
          });
          const disabled = await status(409, `/events/${plain.id}/tickets`);
          assert.equal(disabled.error.code, "MODULE_DISABLED");
          await status(409, `/events/${plain.id}/tickets/contingents`, "POST", {
            name: "Unzulässig",
            capacity: 1,
          });
          assert.equal(await count("ticket_contingents"), 0);
        },
      );

      await t.test(
        "Verkaufszeiten: Validierung, Revision und genau ein Gewinner",
        async () => {
          const path = `/events/${event.id}/tickets/settings`;
          for (const invalid of [
            { ...settings, saleEndsAt: settings.saleStartsAt },
            { ...settings, startsAt: "2026-11-14T16:00:00.000Z" },
            { ...settings, maxTicketsPerOrder: 0 },
            { ...settings, maxTicketsPerOrder: 101 },
            { ...settings, saleStartsAt: "bald" },
            { ...settings, published: true },
          ])
            await status(400, path, "PUT", { expectedRevision: 0, ...invalid });
          assert.equal(await count("ticket_settings"), 0);
          const saved = await ok(path, "PUT", {
            expectedRevision: 0,
            ...settings,
          });
          assert.deepEqual(saved.settings, { revision: 1, ...settings });
          const stale = await status(409, path, "PUT", {
            expectedRevision: 0,
            ...settings,
            maxTicketsPerOrder: 2,
          });
          assert.equal(stale.error.code, "REVISION_CONFLICT");
          assert.deepEqual(stale.error.details.current, saved.settings);
          const outcomes = await Promise.all(
            [3, 4].map((n) =>
              req(path, "PUT", {
                expectedRevision: 1,
                ...settings,
                maxTicketsPerOrder: n,
              }),
            ),
          );
          assert.deepEqual(
            outcomes.map((r) => r.statusCode).sort(),
            [200, 409],
          );
          const now = await ok(`/events/${event.id}/tickets`);
          assert.equal(now.settings.revision, 2);
          assert.equal(
            (
              await db.query(
                "SELECT count(*)::int AS n FROM revisions WHERE entity_type='ticket-settings' AND entity_id=$1",
                [event.id],
              )
            ).rows[0].n,
            2,
          );
        },
      );

      await t.test(
        "Kontingente: eindeutige Namen und Revisionsschutz",
        async () => {
          const path = `/events/${event.id}/tickets/contingents`;
          let o = await ok(path, "POST", { name: "Saal", capacity: 300 });
          o = await ok(path, "POST", { name: "Empore", capacity: 40, sort: 1 });
          [saal, empore] = o.contingents;
          assert.equal(saal.name, "Saal");
          assert.equal(empore.name, "Empore");
          const duplicate = await status(409, path, "POST", {
            name: "saal",
            capacity: 1,
          });
          assert.equal(duplicate.error.code, "ALREADY_EXISTS");
          for (const invalid of [
            { name: "", capacity: 1 },
            { name: "Negativ", capacity: -1 },
            { name: "Komma", capacity: 1.5 },
            { name: "Mehr", capacity: 1, seats: [] },
          ])
            await status(400, path, "POST", invalid);
          await status(409, `/ticket-contingents/${saal.id}`, "PATCH", {
            expectedRevision: 2,
            capacity: 280,
          });
          o = await ok(`/ticket-contingents/${saal.id}`, "PATCH", {
            expectedRevision: 1,
            capacity: 280,
          });
          saal = o.contingents.find((c: any) => c.id === saal.id);
          assert.deepEqual(
            {
              name: saal.name,
              capacity: saal.capacity,
              revision: saal.revision,
            },
            { name: "Saal", capacity: 280, revision: 2 },
          );
          await status(404, `/ticket-contingents/${randomUUID()}`, "PATCH", {
            expectedRevision: 1,
            capacity: 1,
          });
        },
      );

      await t.test(
        "Ticketarten: Kontingent derselben Veranstaltung, Prüfansicht, Löschschutz",
        async () => {
          const path = `/events/${event.id}/tickets/types`;
          const foreignContingent = (
            await ok(`/events/${other.id}/tickets/contingents`, "POST", {
              name: "Fremd",
              capacity: 5,
            })
          ).contingents[0];
          const invalid = await status(400, path, "POST", {
            contingentId: foreignContingent.id,
            name: "Fremdbezug",
            priceCents: 100,
          });
          assert.equal(invalid.error.code, "CONTINGENT_INVALID");
          for (const bad of [
            { contingentId: saal.id, name: "Komma", priceCents: 12.5 },
            { contingentId: saal.id, name: "Negativ", priceCents: -1 },
            {
              contingentId: saal.id,
              name: "Null",
              priceCents: 100,
              typeLimit: 0,
            },
          ])
            await status(400, path, "POST", bad);
          await ok(path, "POST", {
            contingentId: saal.id,
            name: "Normal",
            priceCents: 1500,
          });
          await ok(path, "POST", {
            contingentId: saal.id,
            name: "Ermäßigt",
            priceCents: 0,
            typeLimit: 400,
            discountHint: "Schüler und Studierende",
            requiresPurchaseConfirmation: true,
            requiresAdmissionProof: true,
            sort: 1,
          });
          let o = await ok(path, "POST", {
            contingentId: saal.id,
            name: "Alt",
            priceCents: 900,
            active: false,
            sort: 2,
          });
          assert.deepEqual(
            o.types.map((t: any) => [
              t.name,
              t.priceCents,
              t.typeLimit,
              t.active,
            ]),
            [
              ["Normal", 1500, null, true],
              ["Ermäßigt", 0, 400, true],
              ["Alt", 900, null, false],
            ],
          );
          assert.equal(o.review.totalCapacity, 320);
          assert.deepEqual(
            o.review.hints.map((h: any) => h.code),
            ["CONTINGENT_UNUSED", "TYPE_LIMIT_ABOVE_CAPACITY", "FREE_TICKET"],
          );
          const reduced = o.types[1];
          o = await ok(`/ticket-types/${reduced.id}`, "PATCH", {
            expectedRevision: 1,
            contingentId: empore.id,
            typeLimit: null,
            priceCents: 800,
          });
          const moved = o.types.find((t: any) => t.id === reduced.id);
          assert.deepEqual(
            [
              moved.contingentId,
              moved.typeLimit,
              moved.priceCents,
              moved.discountHint,
              moved.revision,
            ],
            [empore.id, null, 800, "Schüler und Studierende", 2],
          );
          assert.deepEqual(o.review.hints, []);
          await status(400, `/ticket-types/${reduced.id}`, "PATCH", {
            expectedRevision: 2,
            contingentId: foreignContingent.id,
          });
          const inUse = await status(
            409,
            `/ticket-contingents/${empore.id}?expectedRevision=${empore.revision}`,
            "DELETE",
          );
          assert.equal(inUse.error.code, "CONTINGENT_IN_USE");
          await status(
            409,
            `/ticket-types/${reduced.id}?expectedRevision=1`,
            "DELETE",
          );
          await status(
            400,
            `/ticket-types/${reduced.id}?expectedRevision=abc`,
            "DELETE",
          );
          o = await ok(
            `/ticket-types/${reduced.id}?expectedRevision=2`,
            "DELETE",
          );
          assert.equal(o.types.length, 2);
          o = await ok(
            `/ticket-contingents/${empore.id}?expectedRevision=${empore.revision}`,
            "DELETE",
          );
          assert.deepEqual(
            o.contingents.map((c: any) => c.name),
            ["Saal"],
          );
          const audit = (
            await db.query(
              "SELECT entity_type, count(*)::int AS n FROM revisions WHERE entity_type LIKE 'ticket-%' GROUP BY entity_type ORDER BY entity_type",
            )
          ).rows;
          assert.deepEqual(
            audit.map((r) => r.entity_type),
            ["ticket-contingent", "ticket-settings", "ticket-type"],
          );
        },
      );

      await t.test(
        "Erneute Migration und neue Verbindung erhalten den Stand",
        async () => {
          const before = await ok(`/events/${event.id}/tickets`);
          const connection = database(cfg.DATABASE_URL);
          try {
            await migrate(connection);
            await migrate(connection);
          } finally {
            await connection.end();
          }
          assert.deepEqual(await ok(`/events/${event.id}/tickets`), before);
          assert.equal(
            (await app.inject({ url: "/health/ready" })).json().schemaVersion,
            8,
          );
        },
      );
    } finally {
      await f.close();
    }
  },
);
