import { useEffect, useState } from "react";
import {
  defaultQuizRoundSettings,
  quizQuestion,
  type QuizLibrary,
  type QuizQuestion,
  type QuizQuestionRecord,
  type QuizRound,
  type QuizRoundSettings,
} from "../../../packages/contracts/src/quiz.js";

// Q1a: Vorbereitung der Fragen und Runden. Gespielt wird erst mit Q1b auf dem lokalen Server.

type Api = <T = any>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;
type Overview = {
  canCreateUnassigned: boolean;
  libraries: QuizLibrary[];
  shows: { id: string; name: string }[];
};

const typeLabel = {
  choice: "Auswahl",
  text: "Freitext",
  estimate: "Schätzung",
} as const;
const letters = "abcdefgh";

function solution(q: QuizQuestion) {
  if (q.type === "choice")
    return q.choices
      .filter((c) => q.correct.includes(c.id))
      .map((c) => c.text)
      .join(", ");
  if (q.type === "text") return q.answers.join(" / ");
  return `${q.value}${q.unit ? " " + q.unit : ""}`;
}

function emptyQuestion(type: QuizQuestion["type"]): any {
  const common = {
    prompt: "",
    explanation: "",
    category: "",
    difficulty: "mittel",
    tabletShowsPrompt: false,
  };
  if (type === "choice")
    return {
      ...common,
      type,
      choices: [
        { id: "a", text: "" },
        { id: "b", text: "" },
      ],
      correct: [],
    };
  if (type === "text") return { ...common, type, answers: [""] };
  return { ...common, type, value: 0, unit: "" };
}

export function QuizPreparation({
  eventId,
  api,
}: {
  eventId: string;
  api: Api;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [libraryId, setLibraryId] = useState("");
  const [showId, setShowId] = useState("");
  const [error, setError] = useState("");
  const [name, setName] = useState(""),
    [owner, setOwner] = useState("");
  async function load() {
    try {
      const o = await api<Overview>(`/events/${eventId}/quiz`);
      setOverview(o);
      setOwner((current) =>
        current || o.canCreateUnassigned ? current : (o.shows[0]?.id ?? ""),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [eventId]);
  if (!overview)
    return (
      <section className="card">
        <h2>Quiz</h2>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : (
          <p className="muted">Wird geladen …</p>
        )}
      </section>
    );
  const canCreate = overview.canCreateUnassigned || overview.shows.length > 0;
  return (
    <>
      <section className="card quiz">
        <h2>Quiz: Fragenbibliotheken</h2>
        <p className="muted">
          Fragen und Lösungen sehen nur Administration, Leitung und das
          zugeordnete Showteam der Quizshow. Gespielt wird später auf dem
          lokalen Server; hier entsteht nur die Vorbereitung.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {overview.libraries.length === 0 && (
          <p className="muted">Noch keine Bibliothek sichtbar.</p>
        )}
        <ul className="quiz-list">
          {overview.libraries.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className={libraryId === l.id ? "nav active" : "nav"}
                onClick={() => setLibraryId(l.id)}
              >
                {l.name} · {l.questionCount} Fragen
                {l.showId
                  ? " · " +
                    (overview.shows.find((s) => s.id === l.showId)?.name ??
                      "Quizshow")
                  : ""}
              </button>
            </li>
          ))}
        </ul>
        {canCreate && (
          <form
            className="inline"
            onSubmit={(e) => {
              e.preventDefault();
              void api<QuizLibrary>(
                `/events/${eventId}/quiz/libraries`,
                "POST",
                {
                  name,
                  showId: owner || null,
                },
              )
                .then((created) => {
                  setName("");
                  setLibraryId(created.id);
                  return load();
                })
                .catch((e: Error) => setError(e.message));
            }}
          >
            <label>
              Neue Bibliothek
              <input
                value={name}
                maxLength={200}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Quizshow
              <select
                aria-label="Quizshow"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              >
                {overview.canCreateUnassigned && (
                  <option value="">Keiner Show zugeordnet</option>
                )}
                {overview.shows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button>Bibliothek anlegen</button>
          </form>
        )}
      </section>
      {libraryId && (
        <LibraryEditor
          key={libraryId}
          libraryId={libraryId}
          api={api}
          onChanged={load}
          onDeleted={() => {
            setLibraryId("");
            void load();
          }}
        />
      )}
      <section className="card quiz">
        <h2>Quizrunden je Show</h2>
        {overview.shows.length === 0 ? (
          <p className="muted">Keine Show mit Bearbeitungsrecht.</p>
        ) : (
          <label>
            Show
            <select
              aria-label="Show"
              value={showId}
              onChange={(e) => setShowId(e.target.value)}
            >
              <option value="">Show wählen</option>
              {overview.shows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
      {showId && (
        <RoundsEditor
          key={showId}
          showId={showId}
          libraries={overview.libraries}
          api={api}
        />
      )}
    </>
  );
}

function LibraryEditor({
  libraryId,
  api,
  onChanged,
  onDeleted,
}: {
  libraryId: string;
  api: Api;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [data, setData] = useState<{
    library: QuizLibrary;
    questions: QuizQuestionRecord[];
  } | null>(null);
  const [editing, setEditing] = useState<QuizQuestionRecord | "new" | null>(
    null,
  );
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [rename, setRename] = useState("");
  async function load() {
    try {
      const d = await api<typeof data>(`/quiz-libraries/${libraryId}`);
      setData(d);
      setRename(d!.library.name);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [libraryId]);
  // Liefert true nur bei Erfolg; bei Fehlern (z. B. Revisionskonflikt) bleibt der Entwurf offen.
  const act = (work: () => Promise<unknown>, done: string) =>
    work()
      .then(async () => {
        setError("");
        setNotice(done);
        await load();
        onChanged();
        return true;
      })
      .catch((e: Error) => {
        setError(e.message);
        void load();
        return false;
      });
  if (!data)
    return (
      <section className="card">
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : (
          <p className="muted">Bibliothek wird geladen …</p>
        )}
      </section>
    );
  const active = data.questions.filter((q) => !q.archived),
    archived = data.questions.filter((q) => q.archived);
  return (
    <section
      className="card quiz"
      aria-label={"Bibliothek " + data.library.name}
    >
      <h2>{data.library.name}</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          void act(
            () =>
              api(`/quiz-libraries/${libraryId}`, "PATCH", {
                expectedRevision: data.library.revision,
                name: rename,
              }),
            "Bibliothek umbenannt.",
          );
        }}
      >
        <label>
          Name
          <input
            value={rename}
            maxLength={200}
            required
            onChange={(e) => setRename(e.target.value)}
          />
        </label>
        <button>Umbenennen</button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (
              confirm(
                "Bibliothek löschen? Quizrunden behalten ihre festen Fragestände.",
              )
            )
              void api(
                `/quiz-libraries/${libraryId}?expectedRevision=${data.library.revision}`,
                "DELETE",
              )
                .then(onDeleted)
                .catch((e: Error) => setError(e.message));
          }}
        >
          Bibliothek löschen
        </button>
      </form>
      <ol className="quiz-questions">
        {active.map((q) => (
          <li key={q.id}>
            <div>
              <strong>{q.question.prompt}</strong>
              <span className="badge">{typeLabel[q.question.type]}</span>
              {q.question.category && (
                <span className="badge">{q.question.category}</span>
              )}
              <span className="badge">{q.question.difficulty}</span>
            </div>
            <p className="muted">
              Lösung: {solution(q.question)} · Fassung {q.revision}
            </p>
            <div className="quiz-actions">
              <button type="button" onClick={() => setEditing(q)}>
                Bearbeiten
              </button>
              <button
                type="button"
                onClick={() =>
                  void act(
                    () =>
                      api(
                        `/quiz-questions/${q.id}?expectedRevision=${q.revision}`,
                        "DELETE",
                      ),
                    "Frage archiviert.",
                  )
                }
              >
                Archivieren
              </button>
            </div>
          </li>
        ))}
      </ol>
      {archived.length > 0 && (
        <details>
          <summary>Archiviert ({archived.length})</summary>
          <ul>
            {archived.map((q) => (
              <li key={q.id} className="muted">
                {q.question.prompt}
              </li>
            ))}
          </ul>
        </details>
      )}
      {editing ? (
        <QuestionForm
          key={editing === "new" ? "new" : editing.id + editing.revision}
          initial={editing === "new" ? null : editing.question}
          onCancel={() => setEditing(null)}
          onSave={(question) =>
            act(
              () =>
                editing === "new"
                  ? api(`/quiz-libraries/${libraryId}/questions`, "POST", {
                      question,
                    })
                  : api(`/quiz-questions/${editing.id}`, "PUT", {
                      expectedRevision: editing.revision,
                      question,
                    }),
              "Frage gespeichert.",
            ).then((saved) => {
              if (saved) setEditing(null);
            })
          }
        />
      ) : (
        <button type="button" onClick={() => setEditing("new")}>
          Neue Frage
        </button>
      )}
    </section>
  );
}

function QuestionForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: QuizQuestion | null;
  onSave: (q: QuizQuestion) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<any>(initial ?? emptyQuestion("choice"));
  const [error, setError] = useState("");
  const patch = (values: any) => setDraft((d: any) => ({ ...d, ...values }));
  return (
    <form
      className="quiz-form"
      aria-label="Frage bearbeiten"
      onSubmit={(e) => {
        e.preventDefault();
        const candidate =
          draft.type === "text"
            ? {
                ...draft,
                answers: draft.answers
                  .map((a: string) => a.trim())
                  .filter(Boolean),
              }
            : draft;
        const r = quizQuestion.safeParse(candidate);
        if (!r.success) {
          setError(
            "Bitte prüfen: Fragetext, bei Auswahl mindestens zwei Antworten und eine richtige, bei Freitext eine Antwort, bei Schätzung ein Zahlenwert.",
          );
          return;
        }
        setError("");
        void onSave(r.data);
      }}
    >
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="grid">
        <label>
          Fragetyp
          <select
            aria-label="Fragetyp"
            value={draft.type}
            disabled={!!initial}
            onChange={(e) =>
              setDraft({
                ...emptyQuestion(e.target.value as QuizQuestion["type"]),
                prompt: draft.prompt,
              })
            }
          >
            <option value="choice">Auswahl</option>
            <option value="text">Freitext</option>
            <option value="estimate">Schätzung</option>
          </select>
        </label>
        <label>
          Schwierigkeit
          <select
            aria-label="Schwierigkeit"
            value={draft.difficulty}
            onChange={(e) => patch({ difficulty: e.target.value })}
          >
            <option value="leicht">leicht</option>
            <option value="mittel">mittel</option>
            <option value="schwer">schwer</option>
          </select>
        </label>
        <label>
          Kategorie
          <input
            value={draft.category}
            maxLength={80}
            onChange={(e) => patch({ category: e.target.value })}
          />
        </label>
      </div>
      <label>
        Frage
        <textarea
          value={draft.prompt}
          maxLength={1000}
          required
          onChange={(e) => patch({ prompt: e.target.value })}
        />
      </label>
      {draft.type === "choice" && (
        <fieldset>
          <legend>Antwortmöglichkeiten (richtige ankreuzen)</legend>
          {draft.choices.map((c: any, index: number) => (
            <div className="inline" key={c.id}>
              <input
                type="checkbox"
                aria-label={`Antwort ${c.id.toUpperCase()} ist richtig`}
                checked={draft.correct.includes(c.id)}
                onChange={(e) =>
                  patch({
                    correct: e.target.checked
                      ? [...draft.correct, c.id]
                      : draft.correct.filter((x: string) => x !== c.id),
                  })
                }
              />
              <input
                aria-label={`Antwort ${c.id.toUpperCase()}`}
                value={c.text}
                maxLength={300}
                onChange={(e) =>
                  patch({
                    choices: draft.choices.map((x: any, i: number) =>
                      i === index ? { ...x, text: e.target.value } : x,
                    ),
                  })
                }
              />
              {draft.choices.length > 2 && (
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      choices: draft.choices.filter(
                        (_: any, i: number) => i !== index,
                      ),
                      correct: draft.correct.filter((x: string) => x !== c.id),
                    })
                  }
                >
                  Entfernen
                </button>
              )}
            </div>
          ))}
          {draft.choices.length < 8 && (
            <button
              type="button"
              onClick={() => {
                const free = [...letters].find(
                  (l) => !draft.choices.some((c: any) => c.id === l),
                )!;
                patch({ choices: [...draft.choices, { id: free, text: "" }] });
              }}
            >
              Antwort hinzufügen
            </button>
          )}
        </fieldset>
      )}
      {draft.type === "text" && (
        <label>
          Richtige Antworten und Schreibvarianten (eine je Zeile, erste ist die
          Musterlösung)
          <textarea
            value={draft.answers.join("\n")}
            onChange={(e) => patch({ answers: e.target.value.split("\n") })}
          />
        </label>
      )}
      {draft.type === "estimate" && (
        <div className="grid">
          <label>
            Richtiger Wert
            <input
              type="number"
              step="any"
              value={Number.isFinite(draft.value) ? draft.value : ""}
              onChange={(e) => patch({ value: e.target.valueAsNumber })}
            />
          </label>
          <label>
            Einheit
            <input
              value={draft.unit}
              maxLength={20}
              onChange={(e) => patch({ unit: e.target.value })}
            />
          </label>
        </div>
      )}
      <label>
        Lösungserklärung (für Moderation und Auflösung)
        <textarea
          value={draft.explanation}
          maxLength={1000}
          onChange={(e) => patch({ explanation: e.target.value })}
        />
      </label>
      <label className="quiz-check">
        <input
          type="checkbox"
          checked={draft.tabletShowsPrompt}
          onChange={(e) => patch({ tabletShowsPrompt: e.target.checked })}
        />
        Fragetext zusätzlich auf dem Tablet zeigen
      </label>
      <div className="quiz-actions">
        <button>Frage speichern</button>
        <button type="button" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function RoundsEditor({
  showId,
  libraries,
  api,
}: {
  showId: string;
  libraries: QuizLibrary[];
  api: Api;
}) {
  const [rounds, setRounds] = useState<QuizRound[] | null>(null);
  const [showRevision, setShowRevision] = useState(0);
  const [pool, setPool] = useState<QuizQuestionRecord[]>([]);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  async function load() {
    try {
      const data = await api<{ rounds: QuizRound[]; showRevision: number }>(
        `/shows/${showId}/quiz-rounds`,
      );
      setRounds(data.rounds);
      setShowRevision(data.showRevision);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    Promise.all(
      libraries.map((l) =>
        api<{ questions: QuizQuestionRecord[] }>(`/quiz-libraries/${l.id}`),
      ),
    )
      .then((all) =>
        setPool(all.flatMap((d) => d.questions.filter((q) => !q.archived))),
      )
      .catch(() => setPool([]));
  }, [showId, libraries]);
  const act = (work: () => Promise<unknown>, done: string) =>
    work()
      .then(() => {
        setError("");
        setNotice(done);
      })
      .catch((e: Error) => setError(e.message))
      .finally(load);
  if (!rounds)
    return (
      <section className="card">
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : (
          <p className="muted">Runden werden geladen …</p>
        )}
      </section>
    );
  const move = (index: number, delta: number) => {
    const ids = rounds.map((r) => r.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void act(
      () =>
        api(`/shows/${showId}/quiz-rounds/order`, "PUT", {
          expectedShowRevision: showRevision,
          roundIds: ids,
        }),
      "Reihenfolge gespeichert.",
    );
  };
  return (
    <section className="card quiz" aria-label="Quizrunden">
      <h2>Quizrunden</h2>
      <p className="muted">
        Runden übernehmen feste Fragestände. Spätere Änderungen in der
        Bibliothek gelten erst nach „Neue Fassung übernehmen“. Feste Fragefolge;
        Frage und Antwortfreigabe starten gemeinsam.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      {rounds.map((r, index) => (
        <RoundCard
          key={r.id + r.revision}
          round={r}
          pool={pool}
          first={index === 0}
          last={index === rounds.length - 1}
          onMove={(delta) => move(index, delta)}
          onSave={(body) =>
            act(
              () => api(`/quiz-rounds/${r.id}`, "PUT", body),
              "Runde gespeichert.",
            )
          }
          onDelete={() =>
            act(
              () =>
                api(
                  `/quiz-rounds/${r.id}?expectedRevision=${r.revision}`,
                  "DELETE",
                ),
              "Runde gelöscht.",
            )
          }
        />
      ))}
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          void act(
            () =>
              api(`/shows/${showId}/quiz-rounds`, "POST", {
                name,
                settings: defaultQuizRoundSettings,
              }),
            "Runde angelegt.",
          ).then(() => setName(""));
        }}
      >
        <label>
          Neue Runde
          <input
            value={name}
            maxLength={200}
            required
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button>Runde anlegen</button>
      </form>
    </section>
  );
}

function RoundCard({
  round,
  pool,
  first,
  last,
  onMove,
  onSave,
  onDelete,
}: {
  round: QuizRound;
  pool: QuizQuestionRecord[];
  first: boolean;
  last: boolean;
  onMove: (delta: number) => void;
  onSave: (body: unknown) => Promise<unknown>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(round.name);
  const [settings, setSettings] = useState<QuizRoundSettings>(round.settings);
  const [items, setItems] = useState(
    round.items.map((i) => ({ ...i, refresh: false })),
  );
  const [pick, setPick] = useState("");
  const available = pool.filter(
    (q) => !items.some((i) => i.questionId === q.id),
  );
  const swap = (index: number, delta: number) =>
    setItems((list) => {
      const next = [...list];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  return (
    <article className="quiz-round" aria-label={"Runde " + round.name}>
      <div className="grid">
        <label>
          Rundenname
          <input
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Antwortfrist der Runde (Sekunden)
          <input
            type="number"
            min={5}
            max={600}
            value={settings.deadlineSeconds}
            onChange={(e) =>
              setSettings({
                ...settings,
                deadlineSeconds: e.target.valueAsNumber,
              })
            }
          />
        </label>
        <label>
          Punkte je richtiger Antwort
          <input
            type="number"
            min={0}
            max={100}
            value={settings.points}
            onChange={(e) =>
              setSettings({ ...settings, points: e.target.valueAsNumber })
            }
          />
        </label>
        <label className="quiz-check">
          <input
            type="checkbox"
            checked={settings.confirmRequired}
            onChange={(e) =>
              setSettings({ ...settings, confirmRequired: e.target.checked })
            }
          />
          Verbindliches Bestätigen verlangen
        </label>
      </div>
      <ol className="quiz-questions">
        {items.map((item, index) => (
          <li key={item.questionId}>
            <div>
              <strong>{item.question.prompt}</strong>
              <span className="badge">{typeLabel[item.question.type]}</span>
              <span className="badge">Fassung {item.questionRevision}</span>
              {item.archived && <span className="badge">archiviert</span>}
            </div>
            <p className="muted">Lösung: {solution(item.question)}</p>
            <label>
              Eigene Frist (Sekunden, leer = Runde)
              <input
                type="number"
                min={5}
                max={600}
                aria-label={"Frist für " + item.question.prompt}
                value={item.deadlineSeconds ?? ""}
                onChange={(e) =>
                  setItems((list) =>
                    list.map((x, i) =>
                      i === index
                        ? {
                            ...x,
                            deadlineSeconds: Number.isNaN(
                              e.target.valueAsNumber,
                            )
                              ? null
                              : e.target.valueAsNumber,
                          }
                        : x,
                    ),
                  )
                }
              />
            </label>
            <div className="quiz-actions">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => swap(index, -1)}
              >
                Nach oben
              </button>
              <button
                type="button"
                disabled={index === items.length - 1}
                onClick={() => swap(index, 1)}
              >
                Nach unten
              </button>
              {item.newerRevision && !item.archived && (
                <label className="quiz-check">
                  <input
                    type="checkbox"
                    checked={item.refresh}
                    onChange={(e) =>
                      setItems((list) =>
                        list.map((x, i) =>
                          i === index ? { ...x, refresh: e.target.checked } : x,
                        ),
                      )
                    }
                  />
                  Neue Fassung {item.newerRevision} übernehmen
                </label>
              )}
              <button
                type="button"
                onClick={() =>
                  setItems((list) => list.filter((_, i) => i !== index))
                }
              >
                Aus Runde entfernen
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="inline">
        <label>
          Frage hinzufügen
          <select
            aria-label="Frage hinzufügen"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">Frage wählen</option>
            {available.map((q) => (
              <option key={q.id} value={q.id}>
                {typeLabel[q.question.type]}: {q.question.prompt}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!pick}
          onClick={() => {
            const q = pool.find((x) => x.id === pick)!;
            setItems((list) => [
              ...list,
              {
                questionId: q.id,
                libraryId: q.libraryId,
                questionRevision: q.revision,
                deadlineSeconds: null,
                newerRevision: null,
                archived: false,
                question: q.question,
                refresh: false,
              },
            ]);
            setPick("");
          }}
        >
          Hinzufügen
        </button>
      </div>
      <div className="quiz-actions">
        <button
          type="button"
          onClick={() =>
            void onSave({
              expectedRevision: round.revision,
              name,
              settings,
              items: items.map((i) => ({
                questionId: i.questionId,
                refresh: i.refresh,
                deadlineSeconds: i.deadlineSeconds,
              })),
            })
          }
        >
          Runde speichern
        </button>
        <button type="button" disabled={first} onClick={() => onMove(-1)}>
          Runde nach oben
        </button>
        <button type="button" disabled={last} onClick={() => onMove(1)}>
          Runde nach unten
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (confirm(`Runde „${round.name}“ löschen?`)) onDelete();
          }}
        >
          Runde löschen
        </button>
      </div>
    </article>
  );
}
