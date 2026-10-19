import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { fixture } from "./fixture.js";
import { hash, hashPassword, totp } from "../apps/api/src/security.js";
import { defaultTimerPreparation } from "../packages/contracts/src/timer.js";
import { transferManifest } from "../packages/contracts/src/transfer.js";
import { migrate, database } from "../apps/api/src/db.js";

test(
  "Timerentwürfe: PostgreSQL-Rechte, Revisionskonkurrenz, Persistenz und unabhängige Kopie",
  { timeout: 180000 },
  async (t) => {
    const f = await fixture(55455),
      { db, app, cfg } = f;
    type Session = { cookie: string; csrf: string };
    const anonymous = { cookie: "", csrf: "" };
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
    const session = (r: any): Session => ({
      cookie: "sn_session=" + r.cookies[0].value,
      csrf: r.json().csrfToken,
    });
    async function user(login: string, role?: string, eventId?: string) {
      const id = randomUUID(),
        password = randomBytes(20).toString("hex");
      await db.query(
        "INSERT INTO users(id,login,display_name,password_hash) VALUES($1,$2,$2,$3)",
        [id, login, await hashPassword(password)],
      );
      if (role)
        await db.query(
          "INSERT INTO grants(user_id,event_id,role) VALUES($1,$2,$3)",
          [id, eventId, role],
        );
      const signed = await req(
        "/auth/login",
        "POST",
        { login, password },
        anonymous,
      );
      assert.equal(signed.statusCode, 200);
      return { id, session: session(signed) };
    }
    const path = (id: string) => `/shows/${id}/timer-preparation`;
    const preset = {
      ...defaultTimerPreparation,
      durationSeconds: 90,
      hintText: "Synthetischer Regiehinweis",
    };
    let source: any, event: any, copy: any, team: any;
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
      admin = session(verified);
      await t.test(
        "Default ist lesend; Speichern erhöht nur Entwurf/Showhistorie, keine Laufzeit",
        async () => {
          source = await ok("/shows", "POST", {
            name: "Synthetische Timervorlage",
          });
          assert.deepEqual(await ok(path(source.id)), {
            revision: 0,
            preset: defaultTimerPreparation,
          });
          assert.equal(
            (await db.query("SELECT 1 FROM timer_preparations")).rowCount,
            0,
          );
          const result = await ok(path(source.id), "PUT", {
            expectedRevision: 0,
            preset,
          });
          assert.deepEqual(result, {
            revision: 1,
            preset,
            previousShowRevision: source.revision,
            showRevision: source.revision + 1,
          });
          assert.equal(
            (await ok(`/shows/${source.id}`)).revision,
            source.revision + 1,
          );
          assert.equal(
            (
              await db.query(
                "SELECT 1 FROM revisions WHERE entity_type='timer-preparation' AND entity_id=$1",
                [source.id],
              )
            ).rowCount,
            1,
          );
          assert.equal(
            (await req(path(source.id), "GET", undefined, anonymous))
              .statusCode,
            401,
          );
          assert.equal(
            (
              await req(
                path(source.id),
                "PUT",
                { expectedRevision: 1, preset },
                admin,
                { "x-csrf-token": "wrong" },
              )
            ).statusCode,
            403,
          );
          assert.equal(
            (
              await req(
                path(source.id),
                "PUT",
                { expectedRevision: 1, preset },
                admin,
                { origin: "https://other.invalid" },
              )
            ).statusCode,
            403,
          );
          const raw = randomBytes(32).toString("hex"),
            csrf = randomBytes(20).toString("hex");
          await db.query(
            "INSERT INTO sessions(token_hash,user_id,csrf_token,mfa_verified,expires_at) SELECT $1,id,$2,false,now()+interval '1 hour' FROM users WHERE login='admin'",
            [hash(raw), csrf],
          );
          assert.equal(
            (
              await req(
                path(source.id),
                "PUT",
                { expectedRevision: 1, preset },
                { cookie: "sn_session=" + raw, csrf },
              )
            ).statusCode,
            401,
          );
        },
      );
      await t.test(
        "Showteam darf vorbereiten, LIVE allein nicht; fremde Events bleiben verborgen",
        async () => {
          event = await ok("/events", "POST", {
            name: "Synthetischer Timerabend",
          });
          const current = await ok(`/shows/${source.id}`);
          copy = await ok(`/events/${event.id}/show-copies`, "POST", {
            sourceShowId: source.id,
            sourceRevision: current.revision,
          });
          team = await user("timer-showteam");
          const tid = randomUUID();
          await db.query(
            "INSERT INTO teams(id,name,created_by) SELECT $1,'Timerteam',id FROM users WHERE login='admin'",
            [tid],
          );
          await db.query(
            "INSERT INTO event_teams(event_id,team_id) VALUES($1,$2)",
            [event.id, tid],
          );
          await db.query(
            "INSERT INTO team_members(team_id,user_id) VALUES($1,$2)",
            [tid, team.id],
          );
          await db.query(
            "INSERT INTO show_teams(show_id,team_id) VALUES($1,$2)",
            [copy.id, tid],
          );
          const live = await user("timer-live", "live", event.id);
          const member = await user("timer-reader", "mitglied", event.id);
          const foreign = await user("timer-foreign");
          assert.deepEqual(
            await ok(path(copy.id), "GET", undefined, team.session),
            { revision: 1, preset },
          );
          for (const reader of [live, member]) {
            assert.equal(
              (await req(path(copy.id), "GET", undefined, reader.session))
                .statusCode,
              200,
            );
            assert.equal(
              (
                await req(
                  path(copy.id),
                  "PUT",
                  { expectedRevision: 1, preset },
                  reader.session,
                )
              ).statusCode,
              403,
            );
          }
          for (const method of ["GET", "PUT"])
            assert.equal(
              (
                await req(
                  path(copy.id),
                  method,
                  method === "PUT"
                    ? { expectedRevision: 1, preset }
                    : undefined,
                  foreign.session,
                )
              ).statusCode,
              404,
            );
        },
      );
      await t.test(
        "Ungültige Eingaben verändern weder Timer noch Showrevision",
        async () => {
          const before = await ok(path(copy.id)),
            showBefore = await ok(`/shows/${copy.id}`);
          for (const invalid of [
            { ...preset, durationSeconds: 0 },
            { ...preset, durationSeconds: 86401 },
            { ...preset, durationSeconds: 1.5 },
            { ...preset, warningSeconds: -1 },
            { ...preset, normalColor: "red" },
            { ...preset, hintText: "x".repeat(1001) },
            { ...preset, hintExpirySeconds: 0 },
            { ...preset, mode: "target" },
            { ...preset, live: true },
          ])
            assert.equal(
              (
                await req(path(copy.id), "PUT", {
                  expectedRevision: 1,
                  preset: invalid,
                })
              ).statusCode,
              400,
            );
          assert.deepEqual(await ok(path(copy.id)), before);
          assert.equal(
            (await ok(`/shows/${copy.id}`)).revision,
            showBefore.revision,
          );
        },
      );
      await t.test(
        "Zwei Bearbeiter: genau ein Gewinner, unverlierbarer Konfliktstand",
        async () => {
          const before = (await ok(`/shows/${copy.id}`)).revision;
          const outcomes = await Promise.all([
            req(path(copy.id), "PUT", {
              expectedRevision: 1,
              preset: { ...preset, hintText: "Fassung A" },
            }),
            req(
              path(copy.id),
              "PUT",
              {
                expectedRevision: 1,
                preset: { ...preset, hintText: "Fassung B" },
              },
              team.session,
            ),
          ]);
          assert.deepEqual(
            outcomes.map((r) => r.statusCode).sort(),
            [200, 409],
          );
          const current = await ok(path(copy.id));
          assert.equal(current.revision, 2);
          assert.deepEqual(
            outcomes.find((r) => r.statusCode === 409)!.json().error.details
              .current,
            current,
          );
          assert.equal((await ok(`/shows/${copy.id}`)).revision, before + 1);
          assert.equal(
            (await req(path(copy.id), "PUT", { expectedRevision: 0, preset }))
              .statusCode,
            409,
          );
        },
      );
      await t.test(
        "Datenbank-Wiederverbindung und erneute Migration erhalten unabhängige Kopien",
        async () => {
          const before = await ok(path(copy.id));
          const connection = database(cfg.DATABASE_URL);
          try {
            await migrate(connection);
            assert.deepEqual(
              (
                await connection.query(
                  "SELECT revision,preset FROM timer_preparations WHERE show_id=$1",
                  [copy.id],
                )
              ).rows[0],
              before,
            );
          } finally {
            await connection.end();
          }
          const sourceState = await ok(path(source.id));
          const saved = await ok(path(source.id), "PUT", {
            expectedRevision: sourceState.revision,
            preset: {
              ...preset,
              mode: "elapsed",
              durationSeconds: 0,
              hintLayout: "replace",
              hintExpirySeconds: 5,
            },
          });
          assert.equal(saved.revision, 2);
          assert.deepEqual(await ok(path(copy.id)), before);
          const empty = await ok("/shows", "POST", { name: "Ohne Timer" });
          const emptyCopy = await ok(
            `/events/${event.id}/show-copies`,
            "POST",
            { sourceShowId: empty.id, sourceRevision: empty.revision },
          );
          assert.deepEqual(await ok(path(emptyCopy.id)), {
            revision: 0,
            preset: defaultTimerPreparation,
          });
        },
      );
      await t.test(
        "Paketversion 3 überträgt Timerentwürfe; ohne Entwurf bleibt Version 1 (#41)",
        async () => {
          const draft = await ok(path(copy.id));
          const m = await ok(`/events/${event.id}/packages`, "POST", {});
          assert.equal(m.schemaVersion, 3);
          assert.equal(m.scenes, undefined, "Version 3 ohne Szenen");
          assert.deepEqual(m.timers, [
            { showId: copy.id, revision: draft.revision, preset: draft.preset },
          ]);
          assert.ok(
            transferManifest.safeParse({ ...m, status: "valid", errors: [] }).success,
          );
          const plain = await ok("/events", "POST", {
            name: "Synthetischer Abend ohne Timer",
          });
          const none = await ok(`/events/${plain.id}/packages`, "POST", {});
          assert.equal(none.schemaVersion, 1);
          assert.equal(none.timers, undefined);
        },
      );
    } finally {
      await f.close();
    }
  },
);
