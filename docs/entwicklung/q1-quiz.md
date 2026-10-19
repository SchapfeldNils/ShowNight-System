# Paketplan Q1 Quiz (Strang D)

Stand: 19\. Oktober 2026. Status: **Plan**, keine Umsetzung. Fachliche Grundlage: [D029](../planung/entscheidungen.md) (vom Betreiber in [#65](https://github.com/SchapfeldNils/ShowNight-System/issues/65#issuecomment-6268763501) bestätigt), F21, F22, A12, [anforderungen.md](../anforderungen.md) Kapitel 8. Ziel laut Gesamtplan (PR #63): Q1 bis KW45 gemergt. Verantwortlich Claude 2, Prüfung Codex 1.

## Grundsatz

Vorbereitet wird online (Netcup), gespielt wird auf dem lokalen Server, auch ohne Internet (A01). Lösungen verlassen die Vorbereitung nur im Offlinepaket für den lokalen Server und gehen nie an Teilnehmergeräte, Bühnenmonitor oder Leinwand, bevor die Regie sie bewusst veröffentlicht. Frist, Annahme und Punkte bestimmt allein der Server, nicht die Uhr des Tablets.

## Teilpakete

Drei Teil-PRs, jeweils eigener Branch `claude/q1…` und eigener Zuständigkeitskommentar-Nachtrag in #65.

| Teil | Inhalt | Läuft auf | Voraussetzung |
|---|---|---|---|
| Q1a Fragenbibliothek | Bibliotheken je Veranstaltung mit Kategorien und Schwierigkeit; Fragen Auswahl/Freitext/Schätzung mit Lösung, Schreibvarianten und der Einstellung je Frage, ob das Tablet zusätzlich den Fragetext zeigt (Standard nur Antwortfelder, D029 Punkt 5); Quizrunden einer Show mit fester Fragefolge, Frist der Runde (Standard 30 s) und optional eigener Frist je Frage (D029 Punkt 3), Bestätigungspflicht und Punkten; Show übernimmt festen Fragenstand (Revision). Rechte: Bearbeiten und Lösungen nur Showteam der Quizshow und Leitung. Eine Bibliothek gehört optional einer Quizshow: dann sehen sie Leitung, Admin und deren Showteam, ohne Quizshow nur Leitung und Admin. Fragen aus der Bibliothek kann eine andere Show nur übernehmen, wenn ihr Bearbeiter die Bibliothek sehen darf; die Runde enthält danach einen festen Stand samt Lösung, den das Showteam dieser Show sieht. Ohne Leinwandmedien, damit keine Medienfreigabe an den Bibliotheksrechten vorbei entsteht. | Netcup-API, Web | Migration 011 reserviert |
| Q1b Lokaler Quizablauf | Quizstand im Offlinepaket (nächste freie Paketversion nach L1, voraussichtlich 4). Lösungen sind dort gesondert geschützt: Online-Manifest/-Download und lokale Paketroute liefern Fragen und Lösungen nur an Admin, Leitung und das Showteam der Quizshow; alle anderen Konten der Veranstaltung erhalten das Paket ohne Quizinhalt. Lokal: Teams anlegen, Beitritt per QR-/Beitrittscode, Bestätigung durch die Regie, Ersatzgerät übernimmt Teamzustand in einem atomaren Schritt, der die Bindung des alten Geräts widerruft (ein Gerät je Team). Frage öffnen ist ein einziger serverseitiger Übergang: Antwortfreigabe, Fristbeginn und Leinwandzustand Frage mit Countdown entstehen in derselben Revision (D029 Punkt 3; Tablet zeigt den Fragetext nur bei gesetzter Einstellung). Frist, Abgabe ändern/bestätigen (bei Bestätigungspflicht zählt nur die bestätigte Abgabe), Tabletverlust: Zeit läuft weiter, Regie kann pausieren, verlängern, Frage wiederholen und stellvertretend erfassen. Wertung (Auswahl automatisch, Freitextvorschlag mit Regieentscheidung, Schätzung geringste Abweichung, bei gleicher Abweichung erhalten alle betroffenen Teams die Punkte, Gleichstand im Stand ergibt gemeinsamen Platz), Korrektur mit Pflichtgrund nach Abschluss, ungültig für alle oder einzelne Teams, getrennter Arbeits- und veröffentlichter Stand, Probenstand getrennt. Teilnehmerseite und Quizregie in der lokalen Weboberfläche. | Lokaler Server, local-web | Q1a, #56 gemergt, L1-Paketversion 3 gemergt |
| Q1c Leinwand und Bühnenmonitor | Geschützte Quizmedien je Frage (Bild, Audio, Video), sichtbar und abrufbar nur mit den Bibliotheksrechten aus Q1a, über einen eigenen Quizmedienweg: die allgemeinen Medienlisten und -downloads online (`apps/api/src/media.ts`) und lokal liefern sie nicht aus, im Offlinepaket sind sie wie die Lösungen geschützt. Feste Standardansichten: Frage, Antworten und Countdown erscheinen mit dem Öffnen der Frage aus Q1b, das zugleich ihre Veröffentlichung ist (D029 Punkte 3 und 6); Auflösung, Runden-, Gesamtstand und Gewinneransicht nur nach Veröffentlichung. Das Medium der geöffneten Frage wird auf der Leinwand angezeigt (Bild) beziehungsweise mit dem Öffnen gestartet (Audio, Video). Medienreferenz und Dateiinhalt hängen an der übernommenen Fragerevision; ein späterer Austausch in der Bibliothek ändert vorbereitete Runden erst nach bewusstem Übernehmen. Der Bühnenmonitor zeigt nie Quizfragen oder Lösungen, auch nach Veröffentlichung nur Timer und den kompakten Tablet-Ausfallhinweis (Teamname) aus L1, der bei Wiederverbindung verschwindet. Solange die echte Rendererausgabe (L2) fehlt, deutlich als Vorschau markiert. | Lokaler Server, local-web, Renderer | Q1b, L1 gemergt |

Veröffentlichen folgt D021 (globale Admins, `live`, `technik`), wie in D029 Punkt 7 festgelegt. Für alle übrigen Quizbefehle ist noch nicht entschieden, wer sie ausführen darf: Teams anlegen und bestätigen, Ersatzgerät übernehmen, Frage öffnen, Frist ändern, pausieren, wiederholen, stellvertretend antworten, Freitext bewerten, Antworten ungültig erklären und Korrekturen. Die Frage liegt beim Betreiber (Vorschlag: alle wie GO); Q1b beginnt erst mit der Antwort. Ebenfalls beim Betreiber liegt, wer Fragenstände für eine Show freigeben darf (anforderungen.md Kapitel 8: „ein Teilrecht erlaubt Freigabe“); Q1a setzt bis dahin Übernehmen durch die Bearbeiter der Runde mit Freigeben gleich. Offen ist außerdem, wie Quizshows ohne Veranstaltung (F02) Fragen vorbereiten: Q1a verlangt für Quizrunden eine Veranstaltung (`QUIZ_NEEDS_EVENT`), weil Bibliotheken und Leitungsrechte an der Veranstaltung hängen. Die Frage geht mit der Rechtefrage an den Betreiber; bis dahin bleibt das eine dokumentierte Grenze von Q1a. Konkurrierende Regiebefehle ordnet und dedupliziert der Server wie bei GO.

## Prüfungen (A12)

- Frist serverseitig: Abgabe nach Fristende wird abgewiesen, auch mit falscher Tablet-Uhr.
- Doppelte Abgabe (Wiederholung nach Verbindungsabbruch) wird nur einmal gewertet.
- Ersatztablet erhält Teamzustand und bisherige Abgabe der laufenden Frage; das alte Gerät kann danach weder ändern noch bestätigen, auch wenn es wieder online kommt.
- Beitritt: Vor der Bestätigung durch die Regie kann ein Gerät weder antworten noch den Teamzustand lesen; danach beides.
- Zehn Teams: automatisierter Mehrclient-Test mit zehn Teilnehmerverbindungen für Beitritt, gleichzeitige Abgaben und Wiederverbindung (D029 Punkt 2). Offen bleibt nur die Prüfung mit realen Geräten und WLAN.
- Frage öffnen: Antwortfreigabe, Fristbeginn und Leinwandzustand werden gemeinsam sichtbar; vorher nimmt der Server keine Abgabe an.
- Tabletverlust: Zeit läuft weiter, Regie- und Monitorhinweis, Verschwinden bei Wiederverbindung; Pausieren, Verlängern, Wiederholen und stellvertretende Erfassung durch die Regie wirken serverseitig und werden protokolliert.
- Bestätigungspflicht: Ein bis Fristende nicht bestätigter Entwurf wird nicht gewertet; ohne Bestätigungspflicht zählt die letzte Abgabe vor Fristende.
- Schätzung: Teams mit gleicher geringster Abweichung erhalten alle die Punkte; gleiche Punktzahl ergibt gemeinsamen Platz.
- Tablet-Fragetext: ohne Einstellung enthalten Teilnehmerdaten nur Antwortfelder, mit Einstellung zusätzlich den Fragetext.
- Zwei Regien gleichzeitig: gleicher Befehl wird einmal ausgeführt, widersprüchliche geordnet.
- Lösung erscheint vor Veröffentlichung weder in Teilnehmer- noch Leinwanddaten (Prüfung auf API- und WebSocket-Ebene, nicht nur UI). Bühnenmonitordaten enthalten weder vor noch nach Veröffentlichung Fragen oder Lösungen.
- Rechte: Showteam fremder Shows und `mitglied` sehen keine Lösungen, auch nicht über Online-Manifest, Paketdownload, lokale Paketroute oder die allgemeinen Medienwege (online und lokal).
- Korrektur abgeschlossener Wertung ohne Grund wird abgewiesen; eine Korrektur mit Grund berechnet Wertung und Platzierung neu; veröffentlichter Stand ändert sich erst bei erneuter Veröffentlichung.
- Ungültig für ein einzelnes Team betrifft nur dieses Team, ungültig für alle alle Teams.
- Veröffentlichen: globale Admins, `live` und `technik` dürfen, Leitung allein, Showteam und `mitglied` nicht.
- Probenstand: Zurücksetzen leert Probeantworten und -punkte, lässt Fragen und Regeln unverändert, und der Probenlauf verändert weder Aufführungsstand noch veröffentlichte Anzeigen.
- Ohne Internet: vollständiger Quizablauf mit importiertem Paket bei gesperrtem Online-Endpunkt (Beitritt, Medien, Abgabe, Wertung, Veröffentlichung).
- Quizmedien: Bild, Audio und Video der geöffneten Frage werden auf der Leinwandvorschau angezeigt bzw. gestartet; ein Medienaustausch nach Übernahme ändert die Runde nicht.
- Frist je Frage: eine Runde mit unterschiedlichen Fristen wendet je Frage die eigene an.

Browser-Demos ersetzen keine Prüfung mit realen Tablets im Veranstaltungs-WLAN (O14, #46).

## Reservierungen (in #65)

- Online-Migration **011** (009 T1, 010 T2 laut Gesamtplan).
- `packages/contracts/src/quiz.ts` (neu) und Export in `packages/contracts/src/index.ts`.
- Offlinepaket: nächste freie Version nach L1 (Version 3), Erweiterung von `packages/contracts/src/transfer.ts` erst in Q1b, nach Abstimmung mit Strang C.

## Nicht in Q1

Abgestufte Punkte, Toleranz und Stichfrage; Zufallsfolge; Medien auf dem Tablet; getrennter Start von Frageanzeige und Antwortfreigabe; freie Leinwandgestaltung im Szeneneditor; Buzzer, Jury und allgemeine Punkteverwaltung (Q2); Moderatorgerät mit Quizansicht (Q3); Hardwareabnahme.
