import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { id } from "../../../packages/contracts/src/index.js";
import {
  quizLibraryCreate,
  quizLibraryPatch,
  quizLimits,
  quizQuestion,
  quizQuestionCreate,
  quizQuestionUpdate,
  quizRoundCreate,
  quizRoundOrder,
  quizRoundSettings,
  quizRoundUpdate,
  type QuizLibrary,
  type QuizQuestionRecord,
  type QuizRound,
  type QuizRoundItem,
} from "../../../packages/contracts/src/quiz.js";
import { actor, type Actor } from "./auth.js";
import { remember } from "./content.js";
import { transaction, type DB, type Queryable } from "./db.js";
import { HttpError, forbidden, missing } from "./errors.js";
import { eventAccess, showAccess } from "./permissions.js";

// Q1a (D029 Punkt 7): Fragen und Lösungen sehen und bearbeiten nur Admin,
// Leitung und das zugeordnete Showteam der Quizshow. Alle anderen erhalten 404,
// damit weder Bibliotheken noch Lösungen erkennbar werden.

function conflict(current: unknown): never {
  throw new HttpError(
    409,
    "REVISION_CONFLICT",
    "Eine andere Person hat diesen Stand geändert. Aktuellen Stand prüfen und erneut speichern.",
    { current },
  );
}

/** Lädt Sitzung, Konto und MFA nach dem Sperren neu; Rechte können inzwischen widerrufen sein. */
async function fresh(c: Queryable, req: FastifyRequest) {
  const current = await actor(c, req.cookies.sn_session);
  if (!current)
    throw new HttpError(401, "AUTH_FAILED", "Anmeldung nicht mehr gültig.");
  return current;
}

async function quizEvent(c: Queryable, user: Actor, eventId: string) {
  const event = await eventAccess(c, user, eventId);
  if (!(event.modules as string[]).includes("spiele"))
    throw new HttpError(
      409,
      "MODULE_DISABLED",
      "Das Modul Spiele ist für diese Veranstaltung nicht aktiviert.",
    );
  return event;
}

async function assigned(c: Queryable, user: Actor, showId: string) {
  return !!(
    await c.query(
      "SELECT 1 FROM show_teams st JOIN team_members tm ON tm.team_id=st.team_id WHERE st.show_id=$1 AND tm.user_id=$2",
      [showId, user.id],
    )
  ).rowCount;
}

/** Bibliothek mit Bearbeitungsrecht laden; ohne Recht 404 statt 403. */
async function libraryState(c: Queryable, lib: any) {
  const n = (
    await c.query(
      "SELECT count(*) AS n FROM quiz_questions WHERE library_id=$1 AND NOT archived",
      [lib.id],
    )
  ).rows[0].n;
  return libraryDto({ ...lib, question_count: n });
}

async function libraryAccess(
  c: Queryable,
  user: Actor,
  libraryId: string,
  lock = false,
) {
  const lib = (
    await c.query(
      "SELECT * FROM quiz_libraries WHERE id=$1" + (lock ? " FOR UPDATE" : ""),
      [libraryId],
    )
  ).rows[0];
  if (!lib) missing();
  let event;
  try {
    event = await quizEvent(c, user, lib.event_id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 403) missing();
    throw e;
  }
  if (
    !user.admin &&
    !event.lead &&
    !(lib.show_id && (await assigned(c, user, lib.show_id)))
  )
    missing();
  return lib;
}

async function questionAccess(
  c: Queryable,
  user: Actor,
  questionId: string,
  lock = false,
) {
  if (lock) {
    // Erst die Bibliothek, dann die Frage sperren (wie beim Löschen der Bibliothek):
    // sonst speichert eine Änderung, die das laufende Löschen gleich wieder entfernt.
    const libraryId = (
      await c.query("SELECT library_id FROM quiz_questions WHERE id=$1", [
        questionId,
      ])
    ).rows[0]?.library_id;
    if (
      !libraryId ||
      !(
        await c.query("SELECT 1 FROM quiz_libraries WHERE id=$1 FOR SHARE", [
          libraryId,
        ])
      ).rowCount
    )
      missing();
  }
  const q = (
    await c.query(
      "SELECT * FROM quiz_questions WHERE id=$1" + (lock ? " FOR UPDATE" : ""),
      [questionId],
    )
  ).rows[0];
  if (!q) missing();
  const lib = await libraryAccess(c, user, q.library_id);
  return { q, lib };
}

/** Quizrunden enthalten Lösungen: auch Lesen braucht Bearbeitungsrecht der Show. */
async function roundShowAccess(c: Queryable, user: Actor, showId: string) {
  const show = await showAccess(c, user, showId, true);
  if (!show.event_id)
    throw new HttpError(
      409,
      "QUIZ_NEEDS_EVENT",
      "Quizrunden gibt es nur in Shows einer Veranstaltung.",
    );
  await quizEvent(c, user, show.event_id);
  return show;
}

const libraryDto = (row: any): QuizLibrary => ({
  id: row.id,
  eventId: row.event_id,
  showId: row.show_id,
  name: row.name,
  revision: row.revision,
  questionCount: Number(row.question_count ?? 0),
});
const questionDto = (row: any): QuizQuestionRecord => ({
  id: row.id,
  libraryId: row.library_id,
  revision: row.revision,
  archived: row.archived,
  question: quizQuestion.parse(row.content),
});

async function roundDto(c: Queryable, row: any): Promise<QuizRound> {
  const stored = row.items as any[];
  const current = new Map(
    (
      await c.query(
        "SELECT id,revision,archived FROM quiz_questions WHERE id = ANY($1::uuid[])",
        [stored.map((i) => i.questionId)],
      )
    ).rows.map((r) => [r.id, r]),
  );
  const items: QuizRoundItem[] = stored.map((i) => {
    const now = current.get(i.questionId);
    return {
      questionId: i.questionId,
      libraryId: i.libraryId,
      questionRevision: i.questionRevision,
      deadlineSeconds: i.deadlineSeconds ?? null,
      newerRevision:
        now && now.revision > i.questionRevision ? now.revision : null,
      // Gelöschte Bibliothek zählt wie archiviert; der feste Stand bleibt nutzbar.
      archived: !now || now.archived,
      question: quizQuestion.parse(i.question),
    };
  });
  return {
    id: row.id,
    showId: row.show_id,
    name: row.name,
    sort: row.sort,
    revision: row.revision,
    settings: quizRoundSettings.parse(row.settings),
    items,
  };
}

async function rounds(c: Queryable, showId: string) {
  const rows = (
    await c.query(
      "SELECT * FROM quiz_rounds WHERE show_id=$1 ORDER BY sort, created_at, id",
      [showId],
    )
  ).rows;
  return Promise.all(rows.map((r) => roundDto(c, r)));
}

/** Runden gehören zur Show: jede Änderung erhöht Show-Revision und Historie wie beim Timerentwurf. */
async function touchShow(c: Queryable, showId: string, userId: string) {
  const show = (
    await c.query(
      "UPDATE shows SET revision=revision+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING *",
      [showId, userId],
    )
  ).rows[0];
  await remember(c, "show", show, userId);
  return show.revision as number;
}

const expectedRevision = z.strictObject({
  expectedRevision: z.coerce.number().int().positive(),
});

export function quizRoutes(app: FastifyInstance, db: DB) {
  app.get("/api/v1/events/:id/quiz", async (req) => {
    const eventId = id.parse((req.params as any).id);
    return transaction(db, async (c) => {
      const event = await quizEvent(c, req.actor, eventId);
      const all = req.actor.admin || event.lead;
      const libraries = (
        await c.query(
          `SELECT l.*, (SELECT count(*) FROM quiz_questions q WHERE q.library_id=l.id AND NOT q.archived) AS question_count
           FROM quiz_libraries l WHERE l.event_id=$1 AND ($2 OR l.show_id IN
             (SELECT st.show_id FROM show_teams st JOIN team_members tm ON tm.team_id=st.team_id WHERE tm.user_id=$3))
           ORDER BY lower(l.name), l.id`,
          [eventId, all, req.actor.id],
        )
      ).rows.map(libraryDto);
      const shows = (
        await c.query(
          `SELECT s.id, s.name FROM shows s WHERE s.event_id=$1 AND ($2 OR EXISTS
             (SELECT 1 FROM show_teams st JOIN team_members tm ON tm.team_id=st.team_id WHERE st.show_id=s.id AND tm.user_id=$3))
           ORDER BY lower(s.name), s.id`,
          [eventId, all, req.actor.id],
        )
      ).rows;
      return { canCreateUnassigned: all, libraries, shows };
    });
  });

  app.post("/api/v1/events/:id/quiz/libraries", async (req) => {
    const eventId = id.parse((req.params as any).id),
      input = quizLibraryCreate.parse(req.body);
    return transaction(db, async (c) => {
      await c.query("SELECT id FROM events WHERE id=$1 FOR UPDATE", [eventId]);
      const user = await fresh(c, req);
      const event = await quizEvent(c, user, eventId);
      if (input.showId) {
        const show = (
          await c.query("SELECT event_id FROM shows WHERE id=$1", [
            input.showId,
          ])
        ).rows[0];
        if (!show || show.event_id !== eventId)
          throw new HttpError(
            400,
            "SHOW_INVALID",
            "Die Quizshow gehört nicht zu dieser Veranstaltung.",
          );
        if (
          !user.admin &&
          !event.lead &&
          !(await assigned(c, user, input.showId))
        )
          forbidden();
      } else if (!user.admin && !event.lead) forbidden();
      const row = (
        await c.query(
          "INSERT INTO quiz_libraries(id,event_id,show_id,name,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5) RETURNING *",
          [randomUUID(), eventId, input.showId, input.name, user.id],
        )
      ).rows[0];
      await remember(c, "quiz-library", row, user.id);
      return libraryDto(row);
    });
  });

  app.get("/api/v1/quiz-libraries/:id", async (req) => {
    const libraryId = id.parse((req.params as any).id);
    return transaction(db, async (c) => {
      const lib = await libraryAccess(c, req.actor, libraryId);
      const questions = (
        await c.query(
          "SELECT * FROM quiz_questions WHERE library_id=$1 ORDER BY archived, sort, created_at, id",
          [libraryId],
        )
      ).rows.map(questionDto);
      return {
        library: libraryDto({
          ...lib,
          question_count: questions.filter((q) => !q.archived).length,
        }),
        questions,
      };
    });
  });

  app.patch("/api/v1/quiz-libraries/:id", async (req) => {
    const libraryId = id.parse((req.params as any).id),
      input = quizLibraryPatch.parse(req.body);
    return transaction(db, async (c) => {
      const user = await fresh(c, req);
      const lib = await libraryAccess(c, user, libraryId, true);
      if (lib.revision !== input.expectedRevision)
        conflict(await libraryState(c, lib));
      const row = (
        await c.query(
          "UPDATE quiz_libraries SET name=$2,revision=revision+1,updated_by=$3,updated_at=now() WHERE id=$1 RETURNING *",
          [libraryId, input.name, user.id],
        )
      ).rows[0];
      await remember(c, "quiz-library", row, user.id);
      return libraryDto(row);
    });
  });

  app.delete("/api/v1/quiz-libraries/:id", async (req) => {
    const libraryId = id.parse((req.params as any).id),
      input = expectedRevision.parse(req.query);
    return transaction(db, async (c) => {
      const user = await fresh(c, req);
      const lib = await libraryAccess(c, user, libraryId, true);
      if (lib.revision !== input.expectedRevision)
        conflict(await libraryState(c, lib));
      // Quizrunden behalten ihre festen Stände; sie zeigen die Fragen danach als archiviert.
      await remember(
        c,
        "quiz-library",
        { ...lib, revision: lib.revision + 1, deleted: true },
        user.id,
      );
      await c.query("DELETE FROM quiz_libraries WHERE id=$1", [libraryId]);
      return { deleted: true };
    });
  });

  app.post("/api/v1/quiz-libraries/:id/questions", async (req) => {
    const libraryId = id.parse((req.params as any).id),
      input = quizQuestionCreate.parse(req.body);
    return transaction(db, async (c) => {
      const user = await fresh(c, req);
      await libraryAccess(c, user, libraryId, true);
      const count = Number(
        (
          await c.query(
            "SELECT count(*) AS n, COALESCE(max(sort),0) AS sort FROM quiz_questions WHERE library_id=$1",
            [libraryId],
          )
        ).rows[0].n,
      );
      if (count >= quizLimits.questionsPerLibrary)
        throw new HttpError(
          409,
          "LIMIT",
          `Höchstens ${quizLimits.questionsPerLibrary} Fragen je Bibliothek.`,
        );
      const row = (
        await c.query(
          "INSERT INTO quiz_questions(id,library_id,content,sort,created_by,updated_by) VALUES($1,$2,$3,(SELECT COALESCE(max(sort),0)+1 FROM quiz_questions WHERE library_id=$2),$4,$4) RETURNING *",
          [randomUUID(), libraryId, JSON.stringify(input.question), user.id],
        )
      ).rows[0];
      await remember(c, "quiz-question", row, user.id);
      return questionDto(row);
    });
  });

  app.put("/api/v1/quiz-questions/:id", async (req) => {
    const questionId = id.parse((req.params as any).id),
      input = quizQuestionUpdate.parse(req.body);
    return transaction(db, async (c) => {
      const user = await fresh(c, req);
      const { q } = await questionAccess(c, user, questionId, true);
      if (q.revision !== input.expectedRevision) conflict(questionDto(q));
      if (q.archived)
        throw new HttpError(
          409,
          "QUESTION_ARCHIVED",
          "Archivierte Fragen können nicht mehr geändert werden.",
        );
      const row = (
        await c.query(
          "UPDATE quiz_questions SET content=$2,revision=revision+1,updated_by=$3,updated_at=now() WHERE id=$1 RETURNING *",
          [questionId, JSON.stringify(input.question), user.id],
        )
      ).rows[0];
      await remember(c, "quiz-question", row, user.id);
      return questionDto(row);
    });
  });

  // Archivieren statt Löschen: feste Stände in Runden und die Historie bleiben nachvollziehbar.
  app.delete("/api/v1/quiz-questions/:id", async (req) => {
    const questionId = id.parse((req.params as any).id),
      input = expectedRevision.parse(req.query);
    return transaction(db, async (c) => {
      const user = await fresh(c, req);
      const { q } = await questionAccess(c, user, questionId, true);
      if (q.revision !== input.expectedRevision) conflict(questionDto(q));
      const row = (
        await c.query(
          "UPDATE quiz_questions SET archived=true,revision=revision+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING *",
          [questionId, user.id],
        )
      ).rows[0];
      await remember(c, "quiz-question", row, user.id);
      return questionDto(row);
    });
  });

  app.get("/api/v1/shows/:id/quiz-rounds", async (req) => {
    const showId = id.parse((req.params as any).id);
    return transaction(db, async (c) => {
      const show = await roundShowAccess(c, req.actor, showId);
      return { showRevision: show.revision, rounds: await rounds(c, showId) };
    });
  });

  app.post("/api/v1/shows/:id/quiz-rounds", async (req) => {
    const showId = id.parse((req.params as any).id),
      input = quizRoundCreate.parse(req.body);
    return transaction(db, async (c) => {
      await c.query("SELECT id FROM shows WHERE id=$1 FOR UPDATE", [showId]);
      const user = await fresh(c, req);
      await roundShowAccess(c, user, showId);
      const count = Number(
        (
          await c.query(
            "SELECT count(*) AS n FROM quiz_rounds WHERE show_id=$1",
            [showId],
          )
        ).rows[0].n,
      );
      if (count >= quizLimits.roundsPerShow)
        throw new HttpError(
          409,
          "LIMIT",
          `Höchstens ${quizLimits.roundsPerShow} Quizrunden je Show.`,
        );
      const row = (
        await c.query(
          "INSERT INTO quiz_rounds(id,show_id,name,sort,settings,created_by,updated_by) VALUES($1,$2,$3,(SELECT COALESCE(max(sort),0)+1 FROM quiz_rounds WHERE show_id=$2),$4,$5,$5) RETURNING *",
          [
            randomUUID(),
            showId,
            input.name,
            JSON.stringify(input.settings),
            user.id,
          ],
        )
      ).rows[0];
      await remember(c, "quiz-round", row, user.id);
      const showRevision = await touchShow(c, showId, user.id);
      return { round: await roundDto(c, row), showRevision };
    });
  });

  app.put("/api/v1/quiz-rounds/:id", async (req) => {
    const roundId = id.parse((req.params as any).id),
      input = quizRoundUpdate.parse(req.body);
    return transaction(db, async (c) => {
      const showId = (
        await c.query("SELECT show_id FROM quiz_rounds WHERE id=$1", [roundId])
      ).rows[0]?.show_id;
      if (!showId) missing();
      await c.query("SELECT id FROM shows WHERE id=$1 FOR UPDATE", [showId]);
      const user = await fresh(c, req);
      const show = await roundShowAccess(c, user, showId);
      const previous = (
        await c.query("SELECT * FROM quiz_rounds WHERE id=$1 FOR UPDATE", [
          roundId,
        ])
      ).rows[0];
      if (!previous || previous.show_id !== showId) missing();
      if (previous.revision !== input.expectedRevision)
        conflict(await roundDto(c, previous));
      const kept = new Map(
        (previous.items as any[]).map((i) => [i.questionId, i]),
      );
      const items = [];
      for (const item of input.items) {
        const existing = kept.get(item.questionId);
        if (existing && !item.refresh) {
          items.push({ ...existing, deadlineSeconds: item.deadlineSeconds });
          continue;
        }
        // Neue oder aufgefrischte Fragen: nur aus erlaubten Bibliotheken derselben Veranstaltung.
        let found;
        try {
          found = await questionAccess(c, user, item.questionId);
        } catch (e) {
          if (e instanceof HttpError && e.status === 404)
            throw new HttpError(
              400,
              "QUESTION_INVALID",
              "Eine gewählte Frage ist nicht verfügbar.",
            );
          throw e;
        }
        if (found.lib.event_id !== show.event_id || found.q.archived)
          throw new HttpError(
            400,
            "QUESTION_INVALID",
            "Eine gewählte Frage ist nicht verfügbar.",
          );
        items.push({
          questionId: found.q.id,
          libraryId: found.lib.id,
          questionRevision: found.q.revision,
          deadlineSeconds: item.deadlineSeconds,
          question: quizQuestion.parse(found.q.content),
        });
      }
      const row = (
        await c.query(
          "UPDATE quiz_rounds SET name=$2,settings=$3,items=$4,revision=revision+1,updated_by=$5,updated_at=now() WHERE id=$1 RETURNING *",
          [
            roundId,
            input.name,
            JSON.stringify(input.settings),
            JSON.stringify(items),
            user.id,
          ],
        )
      ).rows[0];
      await remember(c, "quiz-round", row, user.id);
      const showRevision = await touchShow(c, showId, user.id);
      return { round: await roundDto(c, row), showRevision };
    });
  });

  app.delete("/api/v1/quiz-rounds/:id", async (req) => {
    const roundId = id.parse((req.params as any).id),
      input = expectedRevision.parse(req.query);
    return transaction(db, async (c) => {
      const showId = (
        await c.query("SELECT show_id FROM quiz_rounds WHERE id=$1", [roundId])
      ).rows[0]?.show_id;
      if (!showId) missing();
      await c.query("SELECT id FROM shows WHERE id=$1 FOR UPDATE", [showId]);
      const user = await fresh(c, req);
      await roundShowAccess(c, user, showId);
      const previous = (
        await c.query("SELECT * FROM quiz_rounds WHERE id=$1 FOR UPDATE", [
          roundId,
        ])
      ).rows[0];
      if (!previous) missing();
      if (previous.revision !== input.expectedRevision)
        conflict(await roundDto(c, previous));
      await remember(
        c,
        "quiz-round",
        { ...previous, revision: previous.revision + 1, deleted: true },
        user.id,
      );
      await c.query("DELETE FROM quiz_rounds WHERE id=$1", [roundId]);
      return {
        deleted: true,
        showRevision: await touchShow(c, showId, user.id),
      };
    });
  });

  app.put("/api/v1/shows/:id/quiz-rounds/order", async (req) => {
    const showId = id.parse((req.params as any).id),
      input = quizRoundOrder.parse(req.body);
    return transaction(db, async (c) => {
      await c.query("SELECT id FROM shows WHERE id=$1 FOR UPDATE", [showId]);
      const user = await fresh(c, req);
      const show = await roundShowAccess(c, user, showId);
      const existing = (
        await c.query("SELECT id FROM quiz_rounds WHERE show_id=$1", [showId])
      ).rows.map((r) => r.id as string);
      // Veraltete Reihenfolge (andere Änderung an der Show dazwischen) überschreibt nichts.
      if (
        show.revision !== input.expectedShowRevision ||
        existing.length !== input.roundIds.length ||
        existing.some((r) => !input.roundIds.includes(r))
      )
        conflict({
          showRevision: show.revision,
          rounds: await rounds(c, showId),
        });
      for (const [index, roundId] of input.roundIds.entries())
        await c.query("UPDATE quiz_rounds SET sort=$2 WHERE id=$1", [
          roundId,
          index + 1,
        ]);
      const showRevision = await touchShow(c, showId, user.id);
      await remember(
        c,
        "quiz-round-order",
        { id: showId, revision: showRevision, roundIds: input.roundIds },
        user.id,
      );
      return { rounds: await rounds(c, showId), showRevision };
    });
  });
}
