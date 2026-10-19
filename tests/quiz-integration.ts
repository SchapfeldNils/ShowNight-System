import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { fixture } from "./fixture.js";
import { hash, hashPassword, totp } from "../apps/api/src/security.js";
import { database, migrate } from "../apps/api/src/db.js";

// Q1a (D029): Fragenbibliothek und Quizrunden mit echter PostgreSQL-Instanz, nur synthetische Daten.
test(
  "Quiz Q1a: Bibliothek, Lösungsschutz, feste Fragestände und Revisionskonflikte",
  { timeout: 180000 },
  async (t) => {
    const f = await fixture(55461),
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
    const status = async (
      path: string,
      method: string,
      payload: unknown,
      as: Session,
    ) => (await req(path, method, payload, as)).statusCode;
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
      if (role === "leitung") {
        // Leitung braucht MFA; synthetische, bereits bestätigte Sitzung.
        const raw = randomBytes(32).toString("hex"),
          csrf = randomBytes(20).toString("hex");
        await db.query(
          "INSERT INTO sessions(token_hash,user_id,csrf_token,mfa_verified,expires_at) VALUES($1,$2,$3,true,now()+interval '1 hour')",
          [hash(raw), id, csrf],
        );
        return { id, session: { cookie: "sn_session=" + raw, csrf } };
      }
      const signed = await req(
        "/auth/login",
        "POST",
        { login, password },
        anonymous,
      );
      assert.equal(signed.statusCode, 200);
      return { id, session: session(signed) };
    }
    async function teamFor(eventId: string, showId: string, userId: string) {
      const tid = randomUUID();
      await db.query(
        "INSERT INTO teams(id,name,created_by) SELECT $1,$2,id FROM users WHERE login='admin'",
        [tid, "Quizteam " + tid.slice(0, 6)],
      );
      await db.query(
        "INSERT INTO event_teams(event_id,team_id) VALUES($1,$2)",
        [eventId, tid],
      );
      await db.query(
        "INSERT INTO team_members(team_id,user_id) VALUES($1,$2)",
        [tid, userId],
      );
      await db.query("INSERT INTO show_teams(show_id,team_id) VALUES($1,$2)", [
        showId,
        tid,
      ]);
    }
    const choice = {
      type: "choice",
      prompt: "Welche Farbe hat der synthetische Testvorhang?",
      choices: [
        { id: "a", text: "Rot" },
        { id: "b", text: "Blau" },
        { id: "c", text: "Grün" },
      ],
      correct: ["b"],
    };
    const textQuestion = {
      type: "text",
      prompt: "Wie heißt die synthetische Hauptfigur?",
      answers: ["Mustermann", "Musterman"],
      category: "Allgemein",
      difficulty: "leicht",
    };
    const estimate = {
      type: "estimate",
      prompt: "Wie viele synthetische Stühle stehen im Saal?",
      value: 280,
      unit: "Stühle",
    };
    let event: any, quizShow: any, otherShow: any, library: any;
    let team: any, otherTeam: any, lead: any, live: any, member: any;
    let foreign: any, q1: any, q2: any, q3: any, round: any;
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

      await t.test("Modul Spiele ist Voraussetzung", async () => {
        const custom = await ok("/events", "POST", {
          name: "Synthetischer Abend ohne Spiele",
          template: "custom",
        });
        const r = await req(`/events/${custom.id}/quiz`);
        assert.equal(r.statusCode, 409);
        assert.equal(r.json().error.code, "MODULE_DISABLED");
      });

      await t.test(
        "Rechte: Admin, Leitung und Showteam der Quizshow",
        async () => {
          event = await ok("/events", "POST", {
            name: "Synthetischer Quizabend",
            template: "spieleabend",
          });
          const template = await ok("/shows", "POST", { name: "Quizvorlage" });
          quizShow = await ok(`/events/${event.id}/show-copies`, "POST", {
            sourceShowId: template.id,
            sourceRevision: template.revision,
          });
          const template2 = await ok("/shows", "POST", { name: "Tanzvorlage" });
          otherShow = await ok(`/events/${event.id}/show-copies`, "POST", {
            sourceShowId: template2.id,
            sourceRevision: template2.revision,
          });
          team = await user("quiz-showteam");
          otherTeam = await user("quiz-fremdes-showteam");
          await teamFor(event.id, quizShow.id, team.id);
          await teamFor(event.id, otherShow.id, otherTeam.id);
          lead = await user("quiz-leitung", "leitung", event.id);
          live = await user("quiz-live", "live", event.id);
          member = await user("quiz-mitglied", "mitglied", event.id);
          foreign = await user("quiz-fremd");

          // Showteam legt Bibliothek nur für die eigene Quizshow an.
          assert.equal(
            await status(
              `/events/${event.id}/quiz/libraries`,
              "POST",
              { name: "Ohne Show" },
              team.session,
            ),
            403,
          );
          assert.equal(
            await status(
              `/events/${event.id}/quiz/libraries`,
              "POST",
              { name: "Fremde Show", showId: otherShow.id },
              team.session,
            ),
            403,
          );
          library = await ok(
            `/events/${event.id}/quiz/libraries`,
            "POST",
            { name: "Hauptquiz", showId: quizShow.id },
            team.session,
          );
          assert.equal(library.revision, 1);
          assert.equal(
            await status(
              `/events/${event.id}/quiz/libraries`,
              "POST",
              { name: "hauptquiz" },
              admin,
            ),
            409,
          );
          q1 = await ok(
            `/quiz-libraries/${library.id}/questions`,
            "POST",
            { question: choice },
            team.session,
          );
          assert.equal(q1.question.difficulty, "mittel");
          assert.equal(q1.question.tabletShowsPrompt, false);
          q2 = await ok(
            `/quiz-libraries/${library.id}/questions`,
            "POST",
            { question: textQuestion },
            lead.session,
          );
          q3 = await ok(`/quiz-libraries/${library.id}/questions`, "POST", {
            question: estimate,
          });

          for (const who of [team, lead]) {
            const detail = await ok(
              `/quiz-libraries/${library.id}`,
              "GET",
              undefined,
              who.session,
            );
            assert.equal(detail.questions.length, 3);
            assert.deepEqual(detail.questions[0].question.correct, ["b"]);
          }
          // Andere Showteams, LIVE, Mitglieder und Fremde sehen weder Bibliothek noch Lösung.
          for (const who of [otherTeam, live, member, foreign]) {
            assert.equal(
              await status(
                `/quiz-libraries/${library.id}`,
                "GET",
                undefined,
                who.session,
              ),
              404,
            );
            assert.equal(
              await status(
                `/quiz-questions/${q1.id}`,
                "PUT",
                { expectedRevision: 1, question: choice },
                who.session,
              ),
              404,
            );
            const body = JSON.stringify(
              (
                await req(
                  `/events/${event.id}/quiz`,
                  "GET",
                  undefined,
                  who.session,
                )
              ).json(),
            );
            assert.ok(!body.includes("Hauptquiz"), body);
            assert.ok(!body.includes("Mustermann"), body);
          }
          const overview = await ok(
            `/events/${event.id}/quiz`,
            "GET",
            undefined,
            team.session,
          );
          assert.equal(overview.canCreateUnassigned, false);
          assert.deepEqual(
            overview.shows.map((s: any) => s.id),
            [quizShow.id],
          );
          assert.equal(overview.libraries[0].questionCount, 3);
          // Show- und Ereignisdaten enthalten keine Quizlösungen.
          for (const path of [`/shows/${quizShow.id}`, `/events/${event.id}`])
            assert.ok(!(await req(path)).body.includes("Mustermann"));
          assert.equal(
            await status(
              `/quiz-libraries/${library.id}`,
              "GET",
              undefined,
              anonymous,
            ),
            401,
          );
          assert.equal(
            (
              await req(
                `/quiz-libraries/${library.id}/questions`,
                "POST",
                { question: choice },
                admin,
                { "x-csrf-token": "wrong" },
              )
            ).statusCode,
            403,
          );
        },
      );

      await t.test(
        "Ungültige Fragen und fremde Medien werden abgewiesen",
        async () => {
          const before = await ok(`/quiz-libraries/${library.id}`);
          for (const invalid of [
            { ...choice, correct: ["x"] },
            { ...choice, correct: [] },
            {
              ...choice,
              choices: [{ id: "a", text: "Nur eine" }],
              correct: ["a"],
            },
            {
              ...choice,
              choices: [
                { id: "a", text: "Eins" },
                { id: "a", text: "Zwei" },
              ],
              correct: ["a"],
            },
            { ...textQuestion, answers: [] },
            { ...estimate, value: "viele" },
            { ...estimate, value: Number.NaN },
            { ...choice, prompt: " " },
            { ...choice, difficulty: "extrem" },
            { ...choice, type: "buzzer" },
            { ...choice, live: true },
          ])
            assert.equal(
              await status(
                `/quiz-libraries/${library.id}/questions`,
                "POST",
                { question: invalid },
                admin,
              ),
              400,
            );
          // Leinwandmedien sind bis Q1c gesperrt: allgemeine Medien wären für alle Mitglieder lesbar.
          const mediaId = randomUUID();
          await db.query(
            "INSERT INTO media(id,event_id,created_by,name,blob_key,size_bytes,sha256,mime,status) SELECT $1::uuid,$2,id,'synthetisch.png',$1::text,1,'0','image/png','ready' FROM users WHERE login='admin'",
            [mediaId, event.id],
          );
          assert.equal(
            await status(
              `/quiz-libraries/${library.id}/questions`,
              "POST",
              { question: { ...choice, mediaId } },
              admin,
            ),
            400,
          );
          assert.deepEqual(await ok(`/quiz-libraries/${library.id}`), before);
        },
      );

      await t.test(
        "Zwei Bearbeiter einer Frage: genau ein Gewinner",
        async () => {
          const outcomes = await Promise.all([
            req(`/quiz-questions/${q1.id}`, "PUT", {
              expectedRevision: 1,
              question: { ...choice, prompt: "Fassung A" },
            }),
            req(
              `/quiz-questions/${q1.id}`,
              "PUT",
              {
                expectedRevision: 1,
                question: { ...choice, prompt: "Fassung B" },
              },
              team.session,
            ),
          ]);
          assert.deepEqual(
            outcomes.map((r) => r.statusCode).sort(),
            [200, 409],
          );
          const current = (
            await ok(`/quiz-libraries/${library.id}`)
          ).questions.find((q: any) => q.id === q1.id);
          assert.equal(current.revision, 2);
          assert.deepEqual(
            outcomes.find((r) => r.statusCode === 409)!.json().error.details
              .current,
            current,
          );
          q1 = current;
          assert.equal(
            (
              await db.query(
                "SELECT count(*)::int AS n FROM revisions WHERE entity_type='quiz-question' AND entity_id=$1",
                [q1.id],
              )
            ).rows[0].n,
            2,
          );
        },
      );

      await t.test(
        "Quizrunden: feste Stände, bewusstes Übernehmen, Lösungsschutz",
        async () => {
          const rounds = `/shows/${quizShow.id}/quiz-rounds`;
          const showBefore = (await ok(`/shows/${quizShow.id}`)).revision;
          const created = await ok(
            rounds,
            "POST",
            { name: "Runde 1" },
            team.session,
          );
          round = created.round;
          assert.deepEqual(round.settings, {
            deadlineSeconds: 30,
            confirmRequired: false,
            points: 1,
          });
          assert.equal(created.showRevision, showBefore + 1);
          const updated = await ok(
            `/quiz-rounds/${round.id}`,
            "PUT",
            {
              expectedRevision: 1,
              name: "Runde 1",
              settings: {
                deadlineSeconds: 45,
                confirmRequired: true,
                points: 2,
              },
              items: [
                { questionId: q3.id },
                { questionId: q1.id },
                { questionId: q2.id },
              ],
            },
            team.session,
          );
          round = updated.round;
          assert.deepEqual(
            round.items.map((i: any) => [i.questionId, i.questionRevision]),
            [
              [q3.id, 1],
              [q1.id, 2],
              [q2.id, 1],
            ],
          );
          // Bibliotheksänderung verändert den festen Stand nicht, meldet aber die neuere Fassung.
          const edited = await ok(`/quiz-questions/${q2.id}`, "PUT", {
            expectedRevision: 1,
            question: {
              ...textQuestion,
              answers: ["Mustermann", "Mustermann-Neu"],
            },
          });
          let view = (await ok(rounds, "GET", undefined, team.session))
            .rounds[0];
          const textItem = view.items.find((i: any) => i.questionId === q2.id);
          assert.equal(textItem.questionRevision, 1);
          assert.equal(textItem.newerRevision, 2);
          assert.deepEqual(textItem.question.answers, [
            "Mustermann",
            "Musterman",
          ]);
          round = (
            await ok(`/quiz-rounds/${round.id}`, "PUT", {
              expectedRevision: round.revision,
              name: round.name,
              settings: round.settings,
              items: round.items.map((i: any) => ({
                questionId: i.questionId,
                refresh: i.questionId === q2.id,
              })),
            })
          ).round;
          const refreshed = round.items.find(
            (i: any) => i.questionId === q2.id,
          );
          assert.equal(refreshed.questionRevision, edited.revision);
          assert.equal(refreshed.newerRevision, null);
          // Archivierte Frage bleibt als fester Stand nutzbar, kann aber nicht neu aufgenommen werden.
          await ok(`/quiz-questions/${q3.id}?expectedRevision=1`, "DELETE");
          view = (await ok(rounds)).rounds[0];
          assert.equal(view.items[0].archived, true);
          assert.equal(view.items[0].question.value, 280);
          assert.equal(
            (
              await req(`/quiz-rounds/${round.id}`, "PUT", {
                expectedRevision: round.revision,
                name: round.name,
                settings: round.settings,
                items: [{ questionId: q3.id, refresh: true }],
              })
            ).json().error.code,
            "QUESTION_INVALID",
          );
          // Lesen der Runden braucht Bearbeitungsrecht der Show, da sie Lösungen enthalten.
          for (const who of [otherTeam, live, member])
            assert.equal(
              await status(rounds, "GET", undefined, who.session),
              403,
            );
          assert.equal(
            await status(rounds, "GET", undefined, foreign.session),
            404,
          );
          for (const who of [otherTeam, live, member])
            assert.equal(
              await status(
                `/quiz-rounds/${round.id}`,
                "PUT",
                {
                  expectedRevision: round.revision,
                  name: "Übernahme",
                  settings: round.settings,
                  items: [],
                },
                who.session,
              ),
              403,
            );
          // Showteam der anderen Show darf keine Fragen in deren Runde aus fremder Bibliothek ziehen.
          const otherRound = (
            await ok(
              `/shows/${otherShow.id}/quiz-rounds`,
              "POST",
              { name: "Fremd" },
              otherTeam.session,
            )
          ).round;
          assert.equal(
            (
              await req(
                `/quiz-rounds/${otherRound.id}`,
                "PUT",
                {
                  expectedRevision: 1,
                  name: "Fremd",
                  settings: otherRound.settings,
                  items: [{ questionId: q1.id }],
                },
                otherTeam.session,
              )
            ).json().error.code,
            "QUESTION_INVALID",
          );
          for (const invalid of [
            { deadlineSeconds: 4, confirmRequired: false, points: 1 },
            { deadlineSeconds: 601, confirmRequired: false, points: 1 },
            { deadlineSeconds: 30, confirmRequired: false, points: -1 },
          ])
            assert.equal(
              await status(
                `/quiz-rounds/${round.id}`,
                "PUT",
                {
                  expectedRevision: round.revision,
                  name: round.name,
                  settings: invalid,
                  items: [],
                },
                admin,
              ),
              400,
            );
          assert.equal(
            await status(
              `/quiz-rounds/${round.id}`,
              "PUT",
              {
                expectedRevision: round.revision,
                name: round.name,
                settings: round.settings,
                items: [{ questionId: q1.id }, { questionId: q1.id }],
              },
              admin,
            ),
            400,
          );
          // Vorlagen ohne Veranstaltung haben keine Quizrunden.
          const template = await ok("/shows", "POST", {
            name: "Vorlage ohne Event",
          });
          assert.equal(
            (await req(`/shows/${template.id}/quiz-rounds`)).json().error.code,
            "QUIZ_NEEDS_EVENT",
          );
        },
      );

      await t.test(
        "Reihenfolge, Konflikte und Löschen der Runden",
        async () => {
          const rounds = `/shows/${quizShow.id}/quiz-rounds`;
          const second = (await ok(rounds, "POST", { name: "Runde 2" })).round;
          const { showRevision } = await ok(rounds);
          // Zwei Bearbeiter sortieren gleichzeitig vom selben Stand: genau einer gewinnt.
          const racing = await Promise.all(
            [
              [second.id, round.id],
              [round.id, second.id],
            ].map((roundIds, index) =>
              req(
                `${rounds}/order`,
                "PUT",
                { expectedShowRevision: showRevision, roundIds },
                index ? team.session : admin,
              ),
            ),
          );
          assert.deepEqual(racing.map((r) => r.statusCode).sort(), [200, 409]);
          const stale = racing.find((r) => r.statusCode === 409)!.json().error
            .details.current;
          const order = await ok(`${rounds}/order`, "PUT", {
            expectedShowRevision: stale.showRevision,
            roundIds: [second.id, round.id],
          });
          assert.deepEqual(
            order.rounds.map((r: any) => r.name),
            ["Runde 2", "Runde 1"],
          );
          const history = await db.query(
            "SELECT payload FROM revisions WHERE entity_type='quiz-round-order' AND entity_id=$1 ORDER BY revision",
            [quizShow.id],
          );
          assert.equal(history.rowCount, 2);
          assert.deepEqual(history.rows[1].payload.roundIds, [
            second.id,
            round.id,
          ]);
          assert.equal(
            (
              await req(`${rounds}/order`, "PUT", {
                expectedShowRevision: order.showRevision,
                roundIds: [second.id],
              })
            ).statusCode,
            409,
          );
          const concurrent = await Promise.all(
            ["A", "B"].map((name) =>
              req(`/quiz-rounds/${second.id}`, "PUT", {
                expectedRevision: 1,
                name,
                settings: second.settings,
                items: [],
              }),
            ),
          );
          assert.deepEqual(
            concurrent.map((r) => r.statusCode).sort(),
            [200, 409],
          );
          assert.equal(
            (
              await req(
                `/quiz-rounds/${second.id}?expectedRevision=1`,
                "DELETE",
              )
            ).statusCode,
            409,
          );
          await ok(`/quiz-rounds/${second.id}?expectedRevision=2`, "DELETE");
          assert.equal((await ok(rounds)).rounds.length, 1);
        },
      );

      await t.test(
        "Gelöschte Bibliothek: Runde behält festen Stand; Migration wiederholbar",
        async () => {
          const lib = await ok(`/quiz-libraries/${library.id}`);
          assert.equal(
            await status(
              `/quiz-libraries/${library.id}?expectedRevision=1`,
              "DELETE",
              undefined,
              otherTeam.session,
            ),
            404,
          );
          await ok(
            `/quiz-libraries/${library.id}`,
            "PATCH",
            { expectedRevision: lib.library.revision, name: "Hauptquiz 2026" },
            team.session,
          );
          // Konfliktantwort enthält den echten Stand einschließlich Fragenzahl.
          const stale = await req(`/quiz-libraries/${library.id}`, "PATCH", {
            expectedRevision: lib.library.revision,
            name: "Veraltet",
          });
          assert.equal(stale.statusCode, 409);
          assert.equal(
            stale.json().error.details.current.questionCount,
            lib.library.questionCount,
          );
          assert.ok(lib.library.questionCount > 0);
          assert.equal(
            (
              await req(
                `/quiz-libraries/${library.id}?expectedRevision=1`,
                "DELETE",
              )
            ).statusCode,
            409,
          );
          await ok(
            `/quiz-libraries/${library.id}?expectedRevision=2`,
            "DELETE",
          );
          const view = (await ok(`/shows/${quizShow.id}/quiz-rounds`))
            .rounds[0];
          assert.equal(view.items.length, 3);
          assert.ok(view.items.every((i: any) => i.archived));
          const connection = database(cfg.DATABASE_URL);
          try {
            await migrate(connection);
            assert.equal(
              (
                await connection.query(
                  "SELECT jsonb_array_length(items) AS n FROM quiz_rounds WHERE id=$1",
                  [round.id],
                )
              ).rows[0].n,
              3,
            );
          } finally {
            await connection.end();
          }
        },
      );
    } finally {
      await f.close();
    }
  },
);
