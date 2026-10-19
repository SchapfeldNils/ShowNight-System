# Gesamtplan: Software für den 10\. April 2027 bis 31\. Dezember 2026

Stand: 19\. Oktober 2026. Status: **Plan**, Betreiberentscheidungen im Claude-Chat vom selben Tag (D028); direkte Bestätigung in PR #63 erbeten. Detailplan der ersten Ticket- und Livepakete: [implementierungsplan-codex.md](implementierungsplan-codex.md).

## Ziel

Bis 31\. Dezember 2026 ist alles als Software umgesetzt, gemergt und auf Netcup bzw. im Windows-Setup verfügbar, was die erste Veranstaltung am 10\. April 2027 und der Kartenverkauf ab Anfang Januar 2027 brauchen. Der Betreiber hat dafür alle Live-Bereiche (Bild, Kameras, Ton/Musik, Licht), Quiz, Jury/Buzzer, Moderation, Controller sowie die Organisationsmodule ausgewählt.

Januar bis März 2027: Hardware- und Showabnahme (#46), Proben, Korrekturen. Ausbaustufen, die über den **Kern** hinausgehen, folgen nach dem 10\. April oder vorher, falls Zeit bleibt.

**Grenzen, die kein Tempo aufhebt:** Reale Geräteabnahmen (O01–O09, O14) brauchen den Aufbau vor Ort. Geräteadapter werden nur nach offizieller Dokumentation gebaut; was ohne Hardware nicht prüfbar ist, bleibt als offen gekennzeichnet. Echter Mailversand, öffentlicher Verkauf und Produktivupdates brauchen weiterhin eigene Freigaben.

## Vier parallele Stränge

Betreiberentscheidung: 2 Claude- und 2 Codex-Sitzungen, Prüfung immer über Kreuz (Claude ↔ Codex). Der Prüfer mergt nach D026.

| Strang | Sitzung | Prüft | Issue(s) |
|---|---|---|---|
| A Tickets, danach Sponsoren/Finanzen | Codex 1 | Claude 2 | #43, #66 |
| B Geräte und Kameras (Windows) | Codex 2 | Claude 1 | #64 |
| C Live: Monitor, Showablauf, Video, Ausgabe, Editor | Claude 1 | Codex 2 | #41, #45, #44 |
| D Quiz, Jury, Moderation, Organisation | Claude 2 | Codex 1 | #65, #66 |

Jede Sitzung bearbeitet ihre Pakete nacheinander und prüft die Pakete eines anderen Strangs. Ein Paket hat genau einen Verantwortlichen; Zuständigkeitskommentar vor Beginn wie bisher.

## Wochenplan

Kalenderwochen 2026: KW43 beginnt am 19\. Oktober, KW53 am 28\. Dezember. „bis KW“ = gemergt bis Ende dieser Woche.

| bis KW | A (Codex 1) | B (Codex 2) | C (Claude 1) | D (Claude 2) |
|---|---|---|---|---|
| 44 | – (Merges #49/#61, Schema-7-Update) | G1 Ton/Musik Start | L1 Bühnenmonitor | Q1 Quiz Start |
| 45 | T1 Saalplan (C1) | G1 Ton/Musik | L2 Showablauf 2 Start | Q1 Quiz |
| 46 | T2 Shop-Vorschau (C2) | – | – | Q2 Jury/Buzzer |
| 47 | T3 Zahlung (C5) | G2 Licht | L2 Showablauf 2 | Q3 Moderation |
| 48 | T4 Tickets PDF/QR, Mail (C6) | – | L3 Videoebenen (C4) | O1 Helfer |
| 49 | T5 Gruppen (C7) | G3 Controller | L4 Ausgabezustände, Fehler | – |
| 50 | T6 Storno/Umbuchung Kern | – | – | O2 Aufgaben, Kalender |
| 51 | T7 Einlass offline (C8) | G4 Kameras | L5 Editor-Kern | O3 Bühne, Requisiten |
| 52 | O4 Sponsoren, Finanzen | G5 Rückfall | L6 Handbuch, Rollenblätter | Puffer |
| 53 | Puffer, öffentlicher Start vorbereitet | Puffer | Puffer | Puffer |

Netcup-Updates jeweils nach T3/T4 (Verkaufsfähigkeit) und zum Jahresende; Windows-Setup mit Renderer nach L2, L3, G1–G4.

## Pakete: Kern bis 31.12.

**Strang A – Tickets** (Details T1/T2 im Implementierungsplan, Entscheidungen D022/D025):
- T1–T5, T7 wie C1, C2, C5–C8 im Implementierungsplan.
- T6 Storno Kern (F42): Anfrage, Genehmigung mit sofortiger Entwertung, externe Rückzahlung bestätigen, Umbuchung auf anderen Platz. Ausbau: Teilstorno-Sonderfälle, Ersatzkarten.
- O4 Sponsoren/Finanzen Kern (F45/F46): Sponsorenkontakte und Leistungen intern, Logos für Pausenausgabe, Einnahmen/Ausgaben mit Saldo und Export, bestätigte Ticketzahlungen einmal übernehmen.

**Strang B – Geräte** (#64): G1 Virtual DJ (Ton/Musik-Aktionen, Einspielerton, Vorhören; F13 Normalisierung beim Import), G2 Daslight-Szenen, G3 Stream Deck/APC (GO, Seiten, globale Tasten), G4 Kameras als Ebene mit Ersatzbild (F27), G5 Rückfallbetrieb Kern (F48). Je Adapter: Fähigkeiten aus offizieller Dokumentation, sichtbare Simulation, Prüfstand ohne Hardware, reale Abnahme in #46.

**Strang C – Live:** L1 = C3. L2 Showablauf 2: Einsätze mit kombinierten Aktionen (Bild, Timer, Ton, Licht über Agenten), echte Rendererausgabe statt Simulation, Pausen mit Sponsorenschleife (F19), Proben je Abschnitt (F24), Videoende-Folgen (A09). L3 = C4 plus native VP8-Wiedergabe. L4 Standbild/Blackout (F47), Bereitschaftsprüfung und Ersatzverhalten (F28). L5 Editor-Kern: Vorlagen, Sperren, Gruppen, Textausrichtung, Konturen (F08/F09/F11 Kern). L6 Handbuch und Rollenblätter (F49 Kern).

**Strang D – Spiele und Organisation** (#65, #66): Q1 Quiz (F21/F22 Kern), Q2 Punkte, Jury-Tablets, Tablet-Buzzer (F44), Q3 Moderationskarten A5 und Moderatorgerät (F34/F35), O1 Helferschichten (F31), O2 Aufgaben und Kalender/Proben (F32/F33), O3 Bühnenplan mit dem Saalplan-Editor, Requisiten und Kostüme (F36/F37).

**Ausbau nach dem 10\. April** (sofern nicht vorher Zeit bleibt): Animationen mit Schlüsselpositionen (F10), Farbverläufe und eigene Schriften (F09), verknüpfte Vorlagen (F11), Präsentationsimport (F50), Teilzahlungen und Freikartenregeln (F40), Kalenderabonnement, Bühnenplanvarianten mit Vergleich, Hardware-Buzzer, mehrere unabhängige Leinwände (F47), Onlineausfall-Aktivierung über die Kernfunktion hinaus.

## Was der Betreiber liefern muss

| bis | Angabe | für |
|---|---|---|
| 26\. Oktober | Bestätigungen in #43, #41, #44, #53, #63, #3; Merges #61, #49, #56 freigeben | Start aller Stränge |
| 2\. November | Gerätemodelle und Versionen: Virtual DJ, Mischpult/Routing (O04), Daslight-Interface (O05), Stream Deck- und APC-Modell (O06), Kameras und Capture (O03), Beamer-Auflösung (O02) | Strang B |
| 2\. November | Quizformate und Wertungsregeln für den Abend, Juryablauf | Q1, Q2 |
| 30\. November | Mailabsender für Bestellungen bestätigen, einmal echte Zustellung prüfen | T4 |
| 15\. Dezember | O11: Vereinsname, Anschrift, Vertretung, Datenschutzerklärung, Verkaufsbedingungen | öffentlicher Start |
| laufend, täglich | Gesammelte Bestätigungen und Produktfragen in den Issues | alle |

## Tempo-Regeln

- Kleine PRs (ein Paket, bei Bedarf Teil-PRs), Prüfung innerhalb eines Arbeitstags.
- Produktfragen gesammelt einmal täglich an den Betreiber; ohne Antwort mit dem dokumentierten Vorschlag weiterarbeiten, wenn die Entscheidung umkehrbar ist, sonst das Teilstück zurückstellen.
- Jeder Strang hält nur seine eigenen Dateien; gemeinsame Verträge (`packages/contracts`) und Migrationsnummern werden im Issue reserviert, bevor sie geändert werden. Reservierte Migrationen: 009 T1, 010 T2, danach in der Reihenfolge der Zuständigkeitskommentare.
- Status in `docs/entwicklung/status.md` nur nach Merge ergänzen, um Konflikte zu vermeiden.

## Risiken

- **Hardware:** Ohne Modellangaben bis Anfang November bleiben Adapter generisch; ohne Aufbau vor Ort keine Abnahme.
- **Prüflast:** Jede Sitzung prüft einen anderen Strang. Staut sich die Prüfung, hat sie Vorrang vor neuer Umsetzung.
- **Unklare Produktdetails:** Quiz, Jury und Organisation haben noch keine eigene Planungsrunde; deren Fragen kommen gesammelt zu Beginn der Pakete.
- **Netcup:** mehrere Schemaänderungen bis Jahresende; jedes Update braucht eine Freigabe und einen Rückfallweg.

## Startprompts

Gemeinsamer Vorspann für jede Sitzung:

```
Arbeite im Repository https://github.com/SchapfeldNils/ShowNight-System. Lies AGENTS.md,
docs/entwicklung/zusammenarbeit.md, docs/entwicklung/gesamtplan-2026.md und
docs/entwicklung/implementierungsplan-codex.md. Prüfe den echten GitHub-Stand.
Arbeite nur an deinem Strang, setze vor jedem Paket den Zuständigkeitskommentar,
übergib mit SHA und CI-Links, prüfe zusätzlich die PRs des dir zugewiesenen Strangs
und merge sie nach D026. Keine Produktivupdates, echten Mails oder Geräteaktionen ohne Freigabe.
```

- **Codex 1:** „Dein Strang ist A (Tickets, danach O4). Beginne mit T1, sobald #43 bestätigt und #49/#61 gemergt sind. Du prüfst Strang D.“
- **Codex 2:** „Dein Strang ist B (Geräte, #64). Beginne mit G1. Du prüfst Strang C.“
- **Claude 1:** „Dein Strang ist C (Live). Beginne mit L1 (#41), sobald #56 gemergt ist. Du prüfst Strang B.“
- **Claude 2:** „Dein Strang ist D (#65, #66). Beginne mit Q1. Du prüfst Strang A.“
