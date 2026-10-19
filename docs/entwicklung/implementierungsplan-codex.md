# Implementierungsplan für Codex: Ticketshop S8-02, Live-Bühnenmonitor, Videoebenen

Stand: 19\. Oktober 2026, überarbeitet nach Codex-Review 5571293868. Status: **Plan**, vom Betreiber im Claude-Chat angefragt; keine umgesetzte Software. Erstellt von Claude anhand von `main` (`0834409`) und der offenen PRs #49, #56 und #61.

Grundlage: [D022–D024](../planung/entscheidungen.md) (PR #61, Bestätigung in #43, #41 und #44 erbeten), [ticketshop-s8-02.md](../planung/ticketshop-s8-02.md), Kapitel 11–13 und F20/F38–F40/A10/A24 in [anforderungen.md](../anforderungen.md), [zusammenarbeit.md](zusammenarbeit.md).

## 0 Zuständigkeit und Voraussetzungen

**Abweichung vom Standard (zusammenarbeit.md Abschnitt 2):** Für die Pakete C1–C4 implementiert Codex, Claude übernimmt Review und Nachprüfung. Diese Abweichung wird vom Betreiber im jeweiligen Issue bestätigt. Erst danach setzt Codex den Zuständigkeitskommentar (Vorlage in Abschnitt 6).

| Paket | Issue | Branch (Vorschlag) | Basis | Migration | Startbedingung |
|---|---|---|---|---|---|
| C1 Rolle „Verkauf“ und Saalplan | #43 | `codex/s8-02a-saalplan` | `main` nach Merge von #49 und #61 | 009 | D022 in #43 bestätigt |
| C2 Gastshop-Vorschau, Holds, Bestellungen | #43 | `codex/s8-02b-gastshop` | `main` nach Merge von C1 | 010 | C1 gemergt |
| C3 Live-Bühnenmonitor | #41 | `codex/issue-41-buehnenmonitor` | `main` nach Merge von #56 | keine online | D024 in #41 bestätigt |
| C4 Szeneneditor: Videoebenen | #44 | `codex/issue-44-videoebenen` | `main` | keine (Szenen-JSON) | D023 in #44 bestätigt |

**Reihenfolge (Vorschlag):** C1 → C2 → C3 → C4. Begründung: Betreiberpriorität „zuerst sichtbare Online-Funktionen“; C2 baut direkt auf C1 auf. C3 und C4 berühren den Ticketcode nicht und können nach Betreiberentscheidung vorgezogen oder parallel von Claude implementiert werden (dann reviewt Codex). Keine zwei Verantwortlichen für dasselbe Paket.

**Empfohlene Merge-Reihenfolge der offenen PRs vor C1:** #60 und #58 (CI) → #61 (Entscheidungen, inklusive dieses Plans) → #49 (S8-01, Migration 008) → #56 (Showablauf) → #62, #53/#59 (Betrieb) → #51/#52 nach Codex-Review. Merges entscheidet der Betreiber.

**Netcup:** Kein Paket enthält ein Produktivupdate. #54 deckt Schema 8 ab; C1/C2 bringen Schema 9 und 10 und brauchen später ein eigenes Update-Issue mit eigener Freigabe.

## 1 Paket C1: Rolle „Verkauf“ und grafischer Saalplan

### Ziel

Admins, Veranstaltungsleitung und die neue Veranstaltungsrolle „Verkauf“ zeichnen je Veranstaltung einen Saalplan, prüfen ihn und geben ihn für die Käufervorschau (C2) frei. Kein Verkauf, keine Holds, keine öffentliche Seite.

### Rolle „Verkauf“

- Migration 009 erweitert die `CHECK`-Bedingung von `grants.role` um `verkauf` (Constraint ersetzen, bestehende Zeilen unverändert). Vertrag `packages/contracts/src/index.ts` (Rollen-Enum), Rollenauswahl in `apps/web/src/main.tsx` (Rollenliste um Zeile 2080) mit Anzeigename „Verkauf“.
- Neue Prüfung `salesAccess(db, user, eventId)` in `apps/api/src/permissions.ts`: Admin, `leitung` oder `verkauf`. **Fallstricke:**
  - `eventAccess` wertet jede Zeile in `grants` als Mitgliedschaft. Ausdrücklich testen, dass `verkauf` allein keine Show-Bearbeitung, keinen Paketexport, keine Szenen- oder Timerrechte und keine Liverechte gibt.
  - `apps/api/src/offline.ts` übernimmt Rollen aus `grants` unverändert ins Offlinepaket; `offlineRole` kennt `verkauf` nicht. Ohne Anpassung würde ein einziger Verkauf-Grant den Paketexport der Veranstaltung scheitern lassen. Nach P7 (Betreiberzustimmung im Claude-Chat) wird die Rolle bis zum Einlass-/Abendkassenpaket **bewusst nicht übertragen**: `verkauf` vor der Prüfung `!roles.length && !team && !u.admin` herausfiltern. Benutzer, deren einzige Rolle `verkauf` ist, fehlen dadurch im Offlinepaket; das wird in der Paketdoku genannt und getestet. In jedem Fall Regressionstest für den Paketexport mit Verkauf-Grant.
  - MFA: Vorschlag P1 (Abschnitt 7) – `verkauf` verlangt MFA wie die Leitung, weil Käuferdaten verarbeitet werden.
- S8-01-Routen (`ticketAccess` in `apps/api/src/tickets.ts`) nach Vorschlag P2 ebenfalls für `verkauf` öffnen.

### Datenmodell (Migration 009)

- `seat_plans`: genau ein Plan je Veranstaltung; `definition jsonb` (validiert über Vertrag), `revision`, `published_revision`, `published_at`, `created_by/updated_by`. Speichern mit `expectedRevision` wie beim Timerentwurf (kein stilles Überschreiben, Konflikt 409, eigene Eingaben bleiben sichtbar).
- Wiederverwendung ohne neuen Rechtebereich: „Plan aus anderer Veranstaltung übernehmen“ kopiert die Definition einer Quellveranstaltung in den Zielplan. Erforderlich ist `salesAccess` auf **beiden** Veranstaltungen. Eine veranstaltungsübergreifende Vorlagenbibliothek mit eigenem Rechtebereich folgt später (P8, Betreiberzustimmung im Claude-Chat) und ist nicht Teil von C1.
- `ticket_areas` und `ticket_seats` als **materialisierte Bestandszeilen**, erzeugt beim Freigeben: Bereich (Art „feste Plätze“ oder „freie Platzwahl“, Kontingent aus S8-01, Kapazität bei freier Platzwahl, Lückenregel `aus|hinweis|verbindlich`), Platz (stabile UUID aus der Definition, Kennung, Bereich, aktiv). Eindeutigkeit `(event_id, lower(label))`. C2 referenziert diese Zeilen per Fremdschlüssel.
- Schutz belegter Plätze (A24): Freigeben einer neuen Revision darf Plätze mit Holds oder Bestellungen weder löschen noch umbenennen noch deaktivieren. Diese Prüfung entsteht **in C2** zusammen mit Migration 010, weil es vorher keine Holds und Bestellungen gibt. C1 hält Platz-UUIDs über Revisionen stabil, damit C2 darauf aufbauen kann.

### Vertrag `packages/contracts/src/seat-plan.ts`

- Elemente: runder Tisch (Sitzanzahl, Radius), rechteckiger Tisch (Sitze je Seite), Sitzreihe (Anzahl, Abstand), Einzelsitz, Bühne, gesperrter Bereich, Bereichsgrenze. Je Element Position, Größe, Drehung, Bereich, öffentlicher und interner Hinweis.
- Grenzen festlegen und testen, Vorschlag: höchstens 1000 Elemente, 5000 Sitze, Definition höchstens 1 MB, Koordinaten im festen logischen Raster.
- Kennungen automatisch nach Richtung (Reihen A–Z, Platz 1…n links→rechts oder rechts→links) oder manuell.

### Prüfung vor Freigabe (reine Funktion, Server und Browser gemeinsam)

Fehler: doppelte oder leere Kennungen, Sitze ohne Bereich, Bereich ohne Kontingent, Summe fester Plätze plus Kapazität freier Bereiche größer als das Kontingent. Hinweise: auffällige Überschneidungen (Rechtecktest nach Drehung), fehlende Bühne, leere Bereiche. Freigabe nur ohne Fehler.

### API

`GET/PUT /api/v1/events/:id/seat-plan`, `POST /api/v1/events/:id/seat-plan/check`, `POST /api/v1/events/:id/seat-plan/publish` (mit `expectedRevision`), `POST /api/v1/events/:id/seat-plan/copy-from/:sourceEventId` (nur ohne vorhandene Freigabe des Ziels oder mit `expectedRevision`). Alle Routen sind veranstaltungsbezogen und prüfen `salesAccess`, die Kopierroute auf Quelle und Ziel. Protokoll wie bei bestehenden Revisionen.

### Browser

Eigener Bereich „Saalplan“ in der Veranstaltung, eigene Module (`apps/web/src/seat-plan*.tsx`, reine Logik in `seat-plan-model.ts`). Bedienmuster des Szeneneditors wiederverwenden (SVG, Ziehen, Einrasten, Rückgängig mit 100 Schritten); gemeinsame Hilfen nur verschieben, wenn die Szeneneditortests unverändert grün bleiben. Prüfübersicht mit Klick auf das betroffene Element, Liste aller Plätze, Druckansicht „Aufbauplan“ mit Datum ohne Bestandsangaben. Mobile Breite ohne horizontales Scrollen.

### Nicht in C1

Holds, Bestellungen und der Schutz belegter Plätze (C2), Käuferansicht, Vorlagenbibliothek mit eigenem Rechtebereich (P8), Gruppen, interne Reservierungen, Papierkontingente, automatische Platzvorschläge, Bestandsdruck, Offlineübertragung des Plans.

### Prüfungen

Unit: Vertrag, Kennungsvergabe, Prüffunktion, Drehung/Überschneidung. API-Integration (CI mit PostgreSQL): Rechte je Rolle inklusive `live`, `technik`, `mitglied` verboten, MFA, Revisionskonflikt, Freigabe mit Fehlern abgelehnt, stabile Platz-UUIDs über Revisionen, Kopieren nur mit Recht auf Quelle und Ziel, Offlineexport mit Verkauf-Grant nach P7. Browser (eigener Port/Datenbank wie `scene-editor.spec.ts`): Tisch und Reihe anlegen, Kennungen, Fehler beheben, freigeben, Neuladen zeigt Serverstand.

## 2 Paket C2: Gastshop als Käufervorschau, Holds und Bestellungen

### Ziel

Das Team testet den vollständigen Käuferweg: Plätze auf Karte oder Liste wählen, 15 Minuten halten, Daten eingeben, optional Postversand, Bestellung mit Zahlungsreferenz und Bestelllink. Nichts davon ist öffentlich, kein echter Mailversand.

### Vorschaubestand (Vorschlag P4)

Anforderung Kapitel 11 verlangt eine Käufervorschau, die keinen echten Bestand blockiert; D022 macht die Vorschau zum einzigen Zugang. Lösung: derselbe Code mit einem Modus `vorschau|echt`. Vorschau-Holds und -Bestellungen liegen in einem getrennten Bestand (Modus Teil jedes Eindeutigkeitsschlüssels), blockieren sich gegenseitig, aber nie echten Bestand, und lassen sich mit „Vorschau zurücksetzen“ löschen. Für den Modus `echt` gibt es in C2 **keine Route**; er wird nur auf Service-Ebene getestet.

### Datenmodell (Migration 010)

- `shop_settings`: Postversand an/aus, `shipping_fee_cents` je Bestellung (Vorschlag P3). Haltezeit fest 15 Minuten als Konstante. Keine Spalte für „öffentlich“.
- `ticket_holds` (Modus, Sitzungsschlüssel als Hash, `expires_at` serverseitig) und `seat_claims` mit `UNIQUE(event_id, mode, seat_id)` als datenbankseitiger Doppelbuchungsschutz. Jeder Claim gehört entweder einem Hold oder einer Bestellung (`hold_id` oder `order_id`, genau eines gesetzt). Abgelaufene Claims im selben Vorgang vor dem Einfügen entfernen, zusätzlich Aufräumen im Worker.
- **Bestellen als eine gesperrte Transaktion:** Der Abschluss sperrt den Hold der eigenen Sitzung (`FOR UPDATE`), prüft, dass er noch nicht abgelaufen ist, legt die Bestellung an und überträgt jeden Claim im selben Vorgang vom Hold auf die Bestellung. Abgelaufen heißt abgelehnt, auch wenn der Platz noch frei wirkt. Bereichskapazität bei freier Platzwahl wird dabei unter derselben Kontingentsperre erneut geprüft.
- Schutz belegter Plätze bei der Planfreigabe (aus C1 hierher verschoben): Freigabe einer Revision, die Plätze mit Claims löscht, umbenennt oder deaktiviert, wird abgelehnt.
- Freie Platzwahl, Kontingente und Ticketartenlimits: Kontingentzeile mit `SELECT … FOR UPDATE` sperren, aktive Holds plus Bestellungen zählen, gegen Kapazität, Typlimit und `max_tickets_per_order` prüfen.
- `orders` (Modus, Referenz ohne Personenbezug, z. B. `SN-XXXX-XXXX`, Status `offen`, Name, E-Mail, Telefon, Versandart `digital|post`, Anschrift nur bei Post und dann Pflicht, Versandgebühr und Summe als Momentaufnahme, Hash des Bestelllink-Tokens) und `order_items` (Ticketart, Platz oder Bereich, Preis als Momentaufnahme).

### Ablauf und Regeln

- Vorschau unter eigener Route, nur angemeldet mit `salesAccess`, dauerhaft sichtbares Band „Käufervorschau – keine echte Bestellung“.
- Platzwahl auf Karte und über eine zugängliche Liste (Tastatur, Bildschirmleser), Ticketart je Platz, Hinweise und Bestätigungen aus S8-01 (`requires_purchase_confirmation`).
- Lückenregel als reine Funktion: bei `verbindlich` Ablehnung, wenn in einer Reihe ein einzelner freier Platz zwischen belegten Plätzen oder am Rand entstünde; bei `hinweis` bewusste Bestätigung.
- Countdown aus `expires_at` des Servers, nicht aus lokaler Zählung; nach Ablauf klarer Hinweis und Freigabe.
- Missbrauchsschutz: `rateLimit` je Route (vorhandene `trustProxy`-Konfiguration nutzen), höchstens ein aktiver Hold je Shop-Sitzung, Bestelllimit aus S8-01, unsichtbares Fallenfeld (befüllt → allgemeine Ablehnung ohne Begründung). Kein Captcha, keine externen Dienste.
- Bestellbestätigung: `mail_jobs` immer mit `delivery_mode='test'`, unabhängig von `MAIL_DELIVERY_ENABLED` (in Produktion `true`). Fachschlüssel `order:<id>:confirmation`. Inhalt mit Bestelllink und Zahlungsreferenz.
- Teamansicht: Bestellliste, Detail, Bestandsansicht je Platz (frei, im Bestellvorgang, bestellt/offen, gesperrt), Vorschau zurücksetzen.
- Datenschutz: Käuferdaten nur in der Datenbank, nicht in Logs (Pino-`redact`), nicht in Fehlermeldungen, Testdaten ausschließlich synthetisch.

### Nicht in C2

Öffentlicher Link (O11 und Betreiberfreigabe), echter Mailversand, Zahlungsbestätigung und Fristen (F40), Tickets/QR/PDF, Druck und Versand, Storno/Umbuchung, Gruppen und interne Reservierungen (F39), automatische Platzvorschläge, Abendkasse, Offlineverkauf.

### Prüfungen

A24-Nebenläufigkeit gegen echtes PostgreSQL: viele gleichzeitige Holds auf denselben Platz → genau einer gelingt; Wettlauf um die letzte Kapazität eines Bereichs mit freier Platzwahl; Ablauf und erneute Verfügbarkeit; Vorschaubestand berührt echten Bestand nicht; Freigabe einer Planrevision, die einen gehaltenen oder bestellten Platz entfernt, wird abgelehnt; Wettlauf zwischen Ablauf und Bestellabschluss (abgelaufener Hold wird nicht zur Bestellung, ein anderer Käufer erhält den Platz genau einmal). Außerdem: Lückenregel, Fallenfeld, Anfragelimit, Pflichtfelder und Postanschrift, Gebühr und Summe, falscher Bestelllink → 404, Mailjob bleibt `test` auch bei `MAIL_DELIVERY_ENABLED=true`, Rechte je Rolle. Browser: vollständiger Vorschauweg mobil und am Desktop, Countdown, Ablauf.

## 3 Paket C3: Live-Bühnenmonitor (D024)

### Ziel

Timer und Regiehinweise laufen im lokalen Livezustand und erscheinen auf einer Vollbildseite des lokalen Servers für Rechner oder Tablet am Bühnenmonitor. Bedienen dürfen Admins, `live` und `technik` (wie GO, `operateRoles` aus #56).

### Umfang

1. **Paketübertragung:** Timerentwürfe (Migration 007, `stage-timer-vorbereitung.md`) werden bisher nicht in Offlinepakete übernommen. Heute wählt `apps/api/src/packages.ts` Version 1 ohne Szenen und Version 2 mit Szenen, und Version 2 verlangt mindestens eine Szene. Ein optionales Feld in Version 2 reicht deshalb nicht für Shows mit Timer, aber ohne Szene. Neue **Paketversion 3** mit optionalen Szenen und optionalen Timerentwürfen; der Export wählt 3, sobald Timer vorhanden sind, sonst wie bisher. Der lokale Server nimmt 1–3 an. Regressionstests: Timer ohne Szenen, Timer mit Szenen, alte Pakete 1 und 2 unverändert.
2. **Lokaler Livezustand** (`apps/local/src/live.ts`, `packages/contracts/src/live.ts`): neue Befehle `timer.load`, `timer.start`, `timer.pause`, `timer.resume`, `timer.reset`, `timer.adjust` (±Sekunden), `hint.show`, `hint.hide` mit `commandId`, `expectedLiveRevision` und Idempotenz wie bei GO. Serverzeit maßgeblich: Zustand speichert Anker und Restzeit, Anzeigen rechnen mit gemessenem Uhrversatz. Zustand in SQLite, damit ein Neustart ihn nicht verliert. Hinweisablauf unabhängig von Timerpause (Regel aus der Vorbereitung). Countdown, Laufzeit und Zieluhrzeit, Überziehung, Warnfarben.
3. **Monitorseite** (`apps/local-web`): nur Timer und Hinweise, große Schrift, Vollbildschaltfläche, Bildschirm-Wachhaltung wo verfügbar, automatisches Wiederverbinden. Bei Verbindungsverlust kompakte Ausfallmeldung mit Zeitpunkt des letzten Stands (F20) statt stillem Einfrieren.
4. **Bedienung** in der Liveansicht aus #56: Timersteuerung und Hinweise mit Schnelltexten.

### Nicht in C3

Ausgabe über den nativen Renderer, Timer auf Netcup, Bindung an Einsätze (F14, Showablauf Paket 2), Pausencountdown mit Sponsorenausgabe (A10 vollständig), Hardware- und Bühnenabnahme (#46).

### Prüfungen

Unit für Zeitrechnung (Pause, Fortsetzen, Korrektur, Überziehung, Zieluhrzeit, Hinweisablauf), Rechte, Idempotenz, Revisionskonflikte, Neustart mit gespeichertem Zustand, Paketimport mit und ohne Timer. Browser: Monitor in Tablet- und Monitorgröße, Wiederverbinden, Ausfallmeldung. Ergebnisse als Software-/Browserprüfung kennzeichnen, nicht als Bühnenabnahme.

## 4 Paket C4: Szeneneditor – Videoebenen (D023)

### Ziel

Videos aus der Medienbibliothek als Ebene platzieren und im Editor mit Abspielen, Pause und Zeitleiste prüfen (D006 Punkt 7), ohne Publikumsausgabe.

### Umfang

- **Vertrag** `packages/contracts/src/scene.ts`: neue Ebenenart `video` mit `mediaId`, `fit` und `endBehavior: "letztes-bild" | "wiederholen"`. „Folgeinhalt“ und „Folgeaktion“ (Anforderungen Abschnitt Videoende, A09) kommen mit dem Showablauf und Einsatzüberschreibung (Vorschlag P6). `sceneMediaIds` um Videos erweitern.
- **Alle Verbraucher der Ebenenarten anpassen** (sonst bricht die Prüfung still): `apps/api/src/scenes.ts` (Medienbindung, nur Videoformate zulassen), `apps/api/src/content.ts`, `apps/api/src/packages.ts` (Videomedien ins Paket), `apps/local/src/server.ts` und `apps/local/src/renderer-scene.ts`, `packages/contracts/src/renderer-scene.ts` (Snapshot kennt nur PNG/JPEG und verlangt exakte Bindung), `apps/renderer/src/package_scene.h`.
- **Renderer:** Videoebenen werden in C4 nicht nativ zusammengesetzt. `prepare-scene` lehnt Szenen mit Videoebene ausdrücklich mit deutscher Meldung ab („Videoebenen werden von der nativen Ausgabe noch nicht unterstützt“), statt sie wegzulassen. Native Wiedergabe ist ein eigenes Folgepaket.
- **Editor:** Werkzeug „Video“, Ziehen aus der Medienleiste, Miniatur in der Ebenenliste. SVG kann Video nicht direkt abspielen: Wiedergabe über ein HTML-`<video>` (z. B. `foreignObject` oder deckungsgleiche HTML-Schicht) – Auswahl, Ziehen und Skalieren müssen unverändert funktionieren. Gemeinsame Szenenuhr: Abspielen, Pause, Zeitleiste mit Springen, aktuelle Zeit und Dauer (`analysis.duration`). Wiedergabezustand gehört nicht zur Definition, nicht in Rückgängig/Wiederholen und nicht ins Autospeichern. Am Ende `letztes-bild` hält, `wiederholen` beginnt neu.
- **Ton:** standardmäßig stumm; Einschalten gilt nur als persönliches Vorhören auf diesem Gerät und ist so beschriftet.
- **Prüfübersicht:** Video fehlt, in Prüfung oder fehlgeschlagen wie bei Bildern; Hinweis, wenn das Video nicht VP8-WebM ist (derzeit einziges Format des nativen Renderers); Hinweis, dass die native Ausgabe Videoebenen noch nicht zeigt.

### Nicht in C4

Native Videowiedergabe, Ton zur Publikumsausgabe, Zuschneiden (Ein-/Auspunkt), Animationen, Vorlagen, Drehung, Sperren, Gruppen (folgen nach D023).

### Prüfungen

Vertrag und Modell (neue Ebene, Prüfübersicht, Medienbindung), API (Video an Bildebene und Bild an Videoebene abgelehnt), Paketexport mit Videoebene, Rendererablehnung, Browser mit synthetischem kurzem WebM: einfügen, verschieben, Abspielen/Pause/Springen, Endverhalten beider Varianten, Neuladen zeigt gespeicherte Definition. Bestehende `scene-editor`-Tests bleiben grün.

## 5 Gemeinsame Regeln für alle Pakete

- Vor Beginn AGENTS.md, zusammenarbeit.md und echten GitHub-Stand lesen; Zuständigkeitskommentar im Issue.
- Je Paket ein Branch, ein PR, nicht auf `main`, kein eigener Merge.
- Dokumentation: eigene Paketdatei unter `docs/entwicklung/`, `status.md` beginnt mit „Aktuell“, `datenmodell.md` und `schnittstellen.md` für neue Tabellen und Routen, `issue-arbeitsliste.md` nach GitHub-Abgleich. Datumszeilen escapen (`19\. Oktober`).
- Nur synthetische Daten, auch in Screenshots und Testfixtures. Keine Geheimnisse.
- Alle Workflows am PR-Commit grün; zusätzlich lokale Windows-Prüfungen von Codex mit Befehlen und Ergebnissen im PR. Grüne CI ist keine Abnahme.
- Übergabe an Claude zum Review mit exaktem SHA, CI-Links, geprüft/nicht geprüft und offenen Punkten. Claude prüft unabhängig; Befunde bleiben offen bis zur Nachprüfung.

## 6 Vorlage Zuständigkeitskommentar

```
Zuständigkeit: Codex implementiert <Paket>, Review durch Claude (Betreiberbestätigung: <Link>).
Branch: codex/<…> auf main <SHA>, PR folgt.
Bereiche: <Dateien/Module>.
Ausdrücklich nicht enthalten: <Liste aus diesem Plan>.
```

## 7 Offene Betreiberpunkte

Die Umsetzung beginnt mit den markierten Vorschlägen nur, wenn der Betreiber sie im Issue bestätigt; sonst bleibt der betroffene Teil offen. Eine Zustimmung im Claude-Chat ist hier festgehalten, ersetzt aber nicht die direkte Bestätigung im Issue (zusammenarbeit.md Abschnitt 7).

| Nr. | Frage | Vorschlag | Issue |
|---|---|---|---|
| P1 | MFA für die Rolle „Verkauf“? | Ja, wie Leitung (Käuferdaten) | #43 |
| P2 | Darf „Verkauf“ auch Ticketarten, Preise und Kontingente aus S8-01 bearbeiten? | Ja, als „Shop-Einstellungen“ laut D022 | #43 |
| P3 | Versandgebühr: Höhe, je Bestellung oder je Karte? | Einstellbar je Veranstaltung, Betrag je Bestellung; ohne Betrag kein Postversand anbietbar | #43 |
| P4 | Vorschau mit getrenntem Vorschaubestand, löschbar? | Ja (Abschnitt 2) | #43 |
| P5 | Wer darf die Monitorseite ansehen: nur angemeldete Teammitglieder oder zusätzlich ein widerrufbarer Anzeige-Link für Tablets? | Zunächst Anmeldung mit beliebiger Veranstaltungsrolle; Anzeige-Link erst nach Bestätigung | #41 |
| P6 | Videoende „Folgeinhalt/Folgeaktion“ erst mit Showablauf Paket 2? | Ja; C4 nur „letztes Bild“ und „Wiederholen“ | #44 |
| P7 | Rolle „Verkauf“ im Offlinepaket: übertragen (Offlinevertrag versioniert erweitern) oder bis zum Einlass-/Abendkassenpaket bewusst weglassen? | **Zugestimmt** (Claude-Chat, 19\. Oktober 2026): weglassen, weil S8-02 keinen Offlineverkauf hat; Folge (reine Verkaufsbenutzer fehlen offline) dokumentieren | #43 |
| P8 | Saalplan-Vorlagen veranstaltungsübergreifend mit eigenem Rechtebereich (z. B. nur Admins)? | **Zugestimmt** (Claude-Chat, 19\. Oktober 2026): zunächst nur Kopieren zwischen Veranstaltungen mit Recht auf beide; Vorlagenbibliothek später | #43 |
| O11 | Veranstalter-, Datenschutz- und Vertragsangaben | Voraussetzung für jeden öffentlichen Link | #43 |
