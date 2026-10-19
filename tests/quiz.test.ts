import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  defaultQuizRoundSettings,
  quizQuestion,
  quizRoundUpdate,
} from "../packages/contracts/src/quiz.js";

test("Quizfragen: Typen, Vorgaben und Lösungsprüfung (D029)", () => {
  const choice = quizQuestion.parse({
    type: "choice",
    prompt: " Welche Antwort ist richtig? ",
    choices: [
      { id: "a", text: "Eins" },
      { id: "b", text: "Zwei" },
    ],
    correct: ["a"],
  });
  assert.equal(choice.prompt, "Welche Antwort ist richtig?");
  assert.equal(choice.difficulty, "mittel");
  assert.equal(choice.tabletShowsPrompt, false);
  assert.equal(choice.mediaId, null);
  assert.equal(
    quizQuestion.safeParse({ ...choice, correct: ["c"] }).success,
    false,
  );
  assert.equal(
    quizQuestion.safeParse({ ...choice, correct: ["a", "a"] }).success,
    false,
  );
  assert.equal(
    quizQuestion.safeParse({
      ...choice,
      choices: [...(choice as any).choices, { id: "a", text: "Doppelt" }],
    }).success,
    false,
  );
  assert.equal(
    quizQuestion.safeParse({
      ...choice,
      choices: [
        { id: "A", text: "x" },
        { id: "b", text: "y" },
      ],
    }).success,
    false,
  );
  const text = quizQuestion.parse({
    type: "text",
    prompt: "Name?",
    answers: ["Mustermann", "Musterman"],
  });
  assert.deepEqual(text.type === "text" && text.answers, [
    "Mustermann",
    "Musterman",
  ]);
  assert.equal(
    quizQuestion.safeParse({ type: "text", prompt: "Name?", answers: [] })
      .success,
    false,
  );
  const estimate = quizQuestion.parse({
    type: "estimate",
    prompt: "Wie viele?",
    value: 12.5,
  });
  assert.equal(estimate.type === "estimate" && estimate.unit, "");
  for (const value of [Infinity, Number.NaN, "12"])
    assert.equal(
      quizQuestion.safeParse({ type: "estimate", prompt: "x", value }).success,
      false,
    );
  // Typfremde Felder werden nicht still übernommen.
  assert.equal(quizQuestion.safeParse({ ...text, value: 1 }).success, false);
});

test("Quizrunden: Standardfrist 30 s, Grenzen und eindeutige Fragen", () => {
  assert.deepEqual(defaultQuizRoundSettings, {
    deadlineSeconds: 30,
    confirmRequired: false,
    points: 1,
  });
  const questionId = randomUUID();
  const base = {
    expectedRevision: 1,
    name: "Runde",
    settings: defaultQuizRoundSettings,
  };
  assert.equal(
    quizRoundUpdate.parse({ ...base, items: [{ questionId }] }).items[0]
      .refresh,
    false,
  );
  assert.equal(
    quizRoundUpdate.safeParse({
      ...base,
      items: [{ questionId }, { questionId, refresh: true }],
    }).success,
    false,
  );
  assert.equal(
    quizRoundUpdate.safeParse({
      ...base,
      items: Array.from({ length: 51 }, () => ({ questionId: randomUUID() })),
    }).success,
    false,
  );
});
