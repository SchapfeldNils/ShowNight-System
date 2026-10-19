import { z } from "zod";

// Q1a (D029): Fragenbibliothek und Quizrunden. Wertung und Livezustand folgen in Q1b.

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);

export const quizDifficulty = z.enum(["leicht", "mittel", "schwer"]);
export const quizChoice = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  text: required(300),
});

const common = {
  prompt: required(1000),
  explanation: text(1000).default(""),
  category: text(80).default(""),
  difficulty: quizDifficulty.default("mittel"),
  // Leinwandmedien (D029 Punkt 1) folgen in Q1c mit eigenem Schutz: allgemeine
  // Veranstaltungsmedien sind für alle Mitglieder lesbar und dürfen Quizinhalte nicht verraten.
  // Standard: Tablet zeigt nur Antwortfelder (D029 Punkt 5).
  tabletShowsPrompt: z.boolean().default(false),
};

export const quizQuestion = z
  .discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("choice"),
      ...common,
      choices: z.array(quizChoice).min(2).max(8),
      correct: z.array(z.string()).min(1).max(8),
    }),
    z.strictObject({
      type: z.literal("text"),
      ...common,
      // Erste Antwort ist die Musterlösung, weitere gelten als Schreibvarianten.
      answers: z.array(required(200)).min(1).max(20),
    }),
    z.strictObject({
      type: z.literal("estimate"),
      ...common,
      value: z.number().finite().min(-1e12).max(1e12),
      unit: text(20).default(""),
    }),
  ])
  .superRefine((q, context) => {
    if (q.type !== "choice") return;
    const ids = q.choices.map((c) => c.id);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        path: ["choices"],
        message: "Antwortkennungen müssen eindeutig sein.",
      });
    if (new Set(q.correct).size !== q.correct.length)
      context.addIssue({
        code: "custom",
        path: ["correct"],
        message: "Richtige Antworten doppelt angegeben.",
      });
    for (const [index, choice] of q.correct.entries())
      if (!ids.includes(choice))
        context.addIssue({
          code: "custom",
          path: ["correct", index],
          message: "Richtige Antwort gehört nicht zu den Antwortmöglichkeiten.",
        });
  });
export type QuizQuestion = z.infer<typeof quizQuestion>;

export const quizRoundSettings = z.strictObject({
  deadlineSeconds: z.int().min(5).max(600).default(30),
  confirmRequired: z.boolean().default(false),
  points: z.int().min(0).max(100).default(1),
});
export type QuizRoundSettings = z.infer<typeof quizRoundSettings>;
export const defaultQuizRoundSettings = quizRoundSettings.parse({});

export const quizLimits = {
  questionsPerLibrary: 500,
  roundsPerShow: 30,
  questionsPerRound: 50,
} as const;

export const quizLibraryCreate = z.strictObject({
  name: required(200),
  showId: z.uuid().nullable().default(null),
});
export const quizLibraryPatch = z.strictObject({
  expectedRevision: z.int().positive(),
  name: required(200),
});
export const quizQuestionCreate = z.strictObject({ question: quizQuestion });
export const quizQuestionUpdate = z.strictObject({
  expectedRevision: z.int().positive(),
  question: quizQuestion,
});
export const quizRoundCreate = z.strictObject({
  name: required(200),
  settings: quizRoundSettings.default(defaultQuizRoundSettings),
});
// Fragen werden als feste Stände übernommen. Bestehende Einträge behalten ihren
// Stand, bis "refresh" ausdrücklich die aktuelle Bibliotheksfassung übernimmt.
export const quizRoundUpdate = z.strictObject({
  expectedRevision: z.int().positive(),
  name: required(200),
  settings: quizRoundSettings,
  items: z
    .array(
      z.strictObject({
        questionId: z.uuid(),
        refresh: z.boolean().default(false),
      }),
    )
    .max(quizLimits.questionsPerRound)
    .refine(
      (items) => new Set(items.map((i) => i.questionId)).size === items.length,
      "Eine Frage kann nur einmal je Runde vorkommen.",
    ),
});

export type QuizLibrary = {
  id: string;
  eventId: string;
  showId: string | null;
  name: string;
  revision: number;
  questionCount: number;
};
export type QuizQuestionRecord = {
  id: string;
  libraryId: string;
  revision: number;
  archived: boolean;
  question: QuizQuestion;
};
export type QuizRoundItem = {
  questionId: string;
  libraryId: string;
  questionRevision: number;
  // Aktuelle Bibliotheksfassung, falls neuer als der feste Stand; null bei Gleichstand.
  newerRevision: number | null;
  archived: boolean;
  question: QuizQuestion;
};
export type QuizRound = {
  id: string;
  showId: string;
  name: string;
  sort: number;
  revision: number;
  settings: QuizRoundSettings;
  items: QuizRoundItem[];
};
export const quizRoundOrder = z.strictObject({
  expectedShowRevision: z.int().positive(),
  roundIds: z
    .array(z.uuid())
    .max(quizLimits.roundsPerShow)
    .refine((ids) => new Set(ids).size === ids.length, "Runden doppelt."),
});
