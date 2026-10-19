# Paketplan Q1 Quiz (Strang D)

Stand: 19\. Oktober 2026. Status: **Plan**, keine Umsetzung. Fachliche Grundlage: [D029](../planung/entscheidungen.md) (vom Betreiber in [#65](https://github.com/SchapfeldNils/ShowNight-System/issues/65#issuecomment-6268763501) bestätigt), F21, F22, A12, [anforderungen.md](../anforderungen.md) Kapitel 8. Ziel laut Gesamtplan (PR #63): Q1 bis KW45 gemergt. Verantwortlich Claude 2, Prüfung Codex 1.

## Grundsatz

Vorbereitet wird online (Netcup), gespielt wird auf dem lokalen Server, auch ohne Internet (A01). Lösungen verlassen die Vorbereitung nur im Offlinepaket für den lokalen Server und gehen nie an Teilnehmergeräte, Bühnenmonitor oder Leinwand, bevor die Regie sie bewusst veröffentlicht. Frist, Annahme und Punkte bestimmt allein der Server, nicht die Uhr des Tablets.

## Teilpakete

Drei Teil-PRs, jeweils eigener Branch `claude/q1…` und eigener Zuständigkeitskommentar-Nachtrag in #65.

| Teil | Inhalt | Läuft auf | Voraussetzung |
|---|---|---|---|
| Q1a Fragenbibliothek | Bibliotheken je Veranstaltung mit Kategorien und Schwierigkeit; Fragen Auswahl/Freitext/Schätzung mit Lösung, Schreibvarianten und der Einstellung je Frage, ob das Tablet zusätzlich den Fragetext zeigt (Standard nur Antwortfelder, D029 Punkt 5); Quizrunden einer Show mit fester Fragefolge, Frist (Standard 30 s), Bestätigungspflicht und Punkten; Show übernimmt festen Fragenstand (Revision). Rechte: Bearbeiten und Lösungen nur Showteam der Quizshow und Leitung. Ohne Leinwandmedien, damit keine Medienfreigabe an den Bibliotheksrechten vorbei entsteht. | Netcup-API, Web | Migration 011 reserviert |
| Q1b Lokaler Quizablauf | Quizstand im Offlinepaket (nächste freie Paketversion nach L1, voraussichtlich 4). Lösungen sind dort gesondert geschützt: Online-Manifest/-Download und lokale Paketroute liefern Fragen und Lösungen nur an Admin, Leitung und das Showteam der Quizshow; alle anderen Konten der Veranstaltung erhalten das Paket ohne Quizinhalt. Lokal: Teams anlegen, Beitritt per QR-/Beitrittscode, Bestätigung durch die Regie, Ersatzgerät übernimmt Teamzustand. Frage öffnen (Tablet zeigt den Fragetext nur bei gesetzter Einstellung), Frist, Abgabe ändern/bestätigen (bei Bestätigungspflicht zählt nur die bestätigte Abgabe), Tabletverlust: Zeit läuft weiter, Regie kann pausieren, verlängern, Frage wiederholen und stellvertretend erfassen. Wertung (Auswahl automatisch, Freitextvorschlag mit Regieentscheidung, Schätzung geringste Abweichung, bei gleicher Abweichung erhalten alle betroffenen Teams die Punkte, Gleichstand im Stand ergibt gemeinsamen Platz), Korrektur mit Pflichtgrund nach Abschluss, ungültig für alle oder einzelne Teams, getrennter Arbeits- und veröffentlichter Stand, Probenstand getrennt. Teilnehmerseite und Quizregie in der lokalen Weboberfläche. | Lokaler Server, local-web | Q1a, #56 gemergt, L1-Paketversion 3 gemergt |
| Q1c Leinwand und Bühnenmonitor | Geschützte Quizmedien je Frage (Bild, Audio, Video), sichtbar und abrufbar nur mit den Bibliotheksrechten aus Q1a und im Offlinepaket wie die Lösungen geschützt. Feste Standardansichten Frage, Antworten, Countdown, Auflösung, Runden- und Gesamtstand, nur nach Veröffentlichung. Kompakter Tablet-Ausfallhinweis (Teamname) auf dem Bühnenmonitor aus L1, verschwindet bei Wiederverbindung. Solange die echte Rendererausgabe (L2) fehlt, deutlich als Vorschau markiert. | Lokaler Server, local-web, Renderer | Q1b, L1 gemergt |

Veröffentlichen folgt D021 (globale Admins, `live`, `technik`), wie in D029 Punkt 7 festgelegt. Wer Fragen öffnen, Fristen ändern, pausieren und korrigieren darf, ist noch nicht entschieden; die Frage geht vor Beginn von Q1b gesammelt an den Betreiber (Vorschlag: ebenfalls wie GO). Konkurrierende Regiebefehle ordnet und dedupliziert der Server wie bei GO.

## Prüfungen (A12)

- Frist serverseitig: Abgabe nach Fristende wird abgewiesen, auch mit falscher Tablet-Uhr.
- Doppelte Abgabe (Wiederholung nach Verbindungsabbruch) wird nur einmal gewertet.
- Ersatztablet erhält Teamzustand und bisherige Abgabe der laufenden Frage.
- Tabletverlust: Zeit läuft weiter, Regie- und Monitorhinweis, Verschwinden bei Wiederverbindung; Pausieren, Verlängern, Wiederholen und stellvertretende Erfassung durch die Regie wirken serverseitig und werden protokolliert.
- Bestätigungspflicht: Ein bis Fristende nicht bestätigter Entwurf wird nicht gewertet; ohne Bestätigungspflicht zählt die letzte Abgabe vor Fristende.
- Schätzung: Teams mit gleicher geringster Abweichung erhalten alle die Punkte; gleiche Punktzahl ergibt gemeinsamen Platz.
- Tablet-Fragetext: ohne Einstellung enthalten Teilnehmerdaten nur Antwortfelder, mit Einstellung zusätzlich den Fragetext.
- Zwei Regien gleichzeitig: gleicher Befehl wird einmal ausgeführt, widersprüchliche geordnet.
- Lösung erscheint vor Veröffentlichung weder in Teilnehmer- noch Monitor- noch Leinwanddaten (Prüfung auf API- und WebSocket-Ebene, nicht nur UI).
- Rechte: Showteam fremder Shows und `mitglied` sehen keine Lösungen, auch nicht über Online-Manifest, Paketdownload oder lokale Paketroute.
- Korrektur abgeschlossener Wertung ohne Grund wird abgewiesen; veröffentlichter Stand ändert sich erst bei erneuter Veröffentlichung.
- Probenstand zurücksetzen verändert keine Fragen und Regeln.

Browser-Demos ersetzen keine Prüfung mit realen Tablets im Veranstaltungs-WLAN (O14, #46).

## Reservierungen (in #65)

- Online-Migration **011** (009 T1, 010 T2 laut Gesamtplan).
- `packages/contracts/src/quiz.ts` (neu) und Export in `packages/contracts/src/index.ts`.
- Offlinepaket: nächste freie Version nach L1 (Version 3), Erweiterung von `packages/contracts/src/transfer.ts` erst in Q1b, nach Abstimmung mit Strang C.

## Nicht in Q1

Abgestufte Punkte, Toleranz und Stichfrage; Zufallsfolge; Medien auf dem Tablet; getrennter Start von Frageanzeige und Antwortfreigabe; freie Leinwandgestaltung im Szeneneditor; Buzzer, Jury und allgemeine Punkteverwaltung (Q2); Moderatorgerät mit Quizansicht (Q3); Hardwareabnahme.
