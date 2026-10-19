# Q1a Fragenbibliothek und Quizrunden

Stand: 19\. Oktober 2026. Teil 1 von Q1 laut [Paketplan](q1-quiz.md) (PR #67), fachliche Grundlage [D029](../planung/entscheidungen.md) (bestätigt in [#65](https://github.com/SchapfeldNils/ShowNight-System/issues/65#issuecomment-6268763501)). Verantwortlich Claude 2, Prüfung Codex 1.

## Was es kann

- **Bibliotheken** je Veranstaltung, optional einer Quizshow zugeordnet. Anlegen ohne Quizshow nur Admin und Leitung; das Showteam legt Bibliotheken für die eigene Quizshow an.
- **Fragen** vom Typ Auswahl (2–8 Antworten, mindestens eine richtig), Freitext (Musterlösung plus Schreibvarianten) und Schätzung (Zahlenwert, Einheit). Dazu Lösungserklärung, Kategorie, Schwierigkeit, optionales Leinwandmedium (bereites Bild, Audio oder Video derselben Veranstaltung) und die Wahl, ob das Tablet zusätzlich den Fragetext zeigt (Standard: nur Antwortfelder).
- **Archivieren** statt Löschen. Gelöschte Bibliotheken und archivierte Fragen bleiben in Runden als fester Stand erhalten.
- **Quizrunden** je Show mit fester Fragefolge, Frist (5–600 s, Standard 30 s), verbindlichem Bestätigen (Standard aus) und Punkten je richtiger Antwort (Standard 1). Eine Runde übernimmt den aktuellen Stand einer Frage als feste Fassung. Spätere Änderungen in der Bibliothek erscheinen als „Neue Fassung“ und gelten erst nach bewusstem Übernehmen.
- **Rechte (D029 Punkt 7):** Bibliothek, Lösungen und Runden sehen und bearbeiten nur Admin, Leitung und das Showteam der zugeordneten Quizshow. Andere Showteams, `live`, `technik` und `mitglied` erhalten 404 bzw. 403 und keine Lösungsdaten. Das Modul „Spiele“ muss aktiv sein.
- Gleichzeitiges Bearbeiten: genau ein Gewinner, der andere erhält 409 mit aktuellem Stand.

Bedienung: Veranstaltung wählen → „Quiz“ → Bibliothek anlegen → „Neue Frage“ → unter „Quizrunden je Show“ Show wählen → Runde anlegen → Frage hinzufügen → „Runde speichern“.

## Start und Prüfung

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test            # enthält tests/quiz.test.ts (Vertrag)
pnpm test:quiz       # PostgreSQL-Integration: Rechte, Lösungsschutz, feste Stände, Konflikte
pnpm build && pnpm exec playwright test tests/browser/quiz.spec.ts
```

## Bekannte Grenzen

- Nur Vorbereitung auf dem Onlineserver. Kein Offlinepaket, keine Teilnehmer, keine Tablets, keine Frist im Ablauf, keine Wertung oder Veröffentlichung: das folgt in Q1b und Q1c.
- Showkopie übernimmt Quizrunden noch nicht.
- Zufallsfolge, abgestufte Punkte, Toleranz und Stichfrage sind nach D029 nicht Teil von Q1.
- Schemastand: Migration 011 kommt vor 008–010 (reserviert für S8-01, T1, T2). Die API meldet deshalb vorübergehend Schemastand 11; die Migrationen laufen lückentolerant. Die Netcup-Smoke-Prüfung erwartet 1–7 und 11.
- Vorläufige Gestaltung; originale ShowNight-Designquellen fehlen.
- Browserprüfung ersetzt keine Prüfung mit realen Geräten.
