-- Q1a (D029): Quizvorbereitung online. Kein Livezustand, keine Teilnehmer, keine Wertung.
CREATE TABLE quiz_libraries (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- Zugeordnete Quizshow: deren Showteam darf bearbeiten und Lösungen sehen.
  show_id uuid REFERENCES shows(id) ON DELETE SET NULL,
  name text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX quiz_libraries_name ON quiz_libraries(event_id, lower(name));
CREATE INDEX quiz_libraries_show ON quiz_libraries(show_id);
CREATE TABLE quiz_questions (
  id uuid PRIMARY KEY,
  library_id uuid NOT NULL REFERENCES quiz_libraries(id) ON DELETE CASCADE,
  -- Frage einschließlich Lösung, geprüft durch packages/contracts/src/quiz.ts.
  content jsonb NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quiz_questions_library ON quiz_questions(library_id, sort);
CREATE TABLE quiz_rounds (
  id uuid PRIMARY KEY,
  show_id uuid NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  settings jsonb NOT NULL,
  -- Feste Fragestände: [{questionId, libraryId, questionRevision, question}].
  items jsonb NOT NULL DEFAULT '[]',
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quiz_rounds_show ON quiz_rounds(show_id, sort);
INSERT INTO schema_migrations(version) VALUES (11);
