# S8-01: Ticketarten, Preise, Kontingente und Verkaufszeiten vorbereiten

Spezifikation vom 15\. Oktober 2026 für das erste Ticketshop-Paket aus [Issue #43](https://github.com/SchapfeldNils/ShowNight-System/issues/43). Teilgrundlage F38/A24. Rechteentscheidung: [D019](../planung/entscheidungen.md#d019--ticketshop-s8-01-bearbeitung-durch-admin-und-leitung). Umsetzung durch Codex auf eigenem Branch und PR; dieses Dokument ist noch **keine** Umsetzung.

## Ziel

Admin und Veranstaltungsleitung können für eine Veranstaltung mit aktiviertem Modul `tickets` im Browser vorbereiten, was später verkauft wird: Verkaufszeiten, Ticketarten mit Preisen und gemeinsame Kontingente. Eine Prüfansicht zeigt, ob die Vorbereitung in sich stimmig ist. Es wird **nichts verkauft, reserviert oder veröffentlicht**.

## Fachregeln (aus docs/anforderungen.md Kapitel 11)

- Ticketarten, Preise und Kontingente sind je Veranstaltung frei definierbar.
- Gemeinsame Kontingente plus zusätzliche Ticketartenlimits verhindern doppelte Bestandszählung: Mehrere Ticketarten (z. B. „Normal“, „Ermäßigt“) ziehen aus demselben Kontingent; eine Ticketart kann zusätzlich ein eigenes Höchstlimit haben.
- Verkaufsbeginn, Verkaufsende und Bestelllimit (Tickets je Bestellung) sind einstellbar.
- Einlass und Veranstaltungsbeginn sind getrennte Angaben.
- Ermäßigungsvoraussetzungen können einen Hinweis und eine Bestätigung beim Kauf verlangen; der Einlass kann eine gesonderte Nachweisprüfung verlangen. In diesem Paket nur als Einstellung speichern.
- Zahlungsarten sind ausschließlich Überweisung und bar. In diesem Paket keine Zahlungsfunktion.

## Rechte (D019)

- Lesen und Bearbeiten: Systemadmin und Veranstaltungsleitung (`eventAccess(..., true)`), mit der bestehenden MFA-Pflicht.
- Alle anderen Rollen der Veranstaltung erhalten für diese Routen 403 bzw. wie bisher 404, wenn sie die Veranstaltung nicht sehen. Preise und Kontingente gelten als Finanz-/Ticketdaten der Leitung.
- Einzelrechte „Verkauf und Einlass“ (Kapitel 2) werden **nicht** in diesem Paket eingeführt. Das ist ein eigenes, vorher abzustimmendes Paket.
- Ist das Modul `tickets` an der Veranstaltung nicht aktiviert: 409 mit verständlicher deutscher Meldung, keine Daten anlegen.

## Datenmodell (Startvorschlag, begründet anpassbar)

Nächste freie Migrationsnummer nach dem aktuellen `main` verwenden (nach Merge von PR #42 also `008`).

- `ticket_settings` – genau ein Datensatz je Veranstaltung: `event_id` (PK, FK events, ON DELETE CASCADE), `sale_starts_at`, `sale_ends_at` (timestamptz, optional), `max_tickets_per_order` (int ≥ 1), `admission_at`, `starts_at` (timestamptz, optional), `revision`, Ersteller/Bearbeiter/Zeitstempel.
- `ticket_contingents` – `id`, `event_id`, `name`, `capacity` (int ≥ 0), `sort`, `revision`, Ersteller/Bearbeiter/Zeitstempel. Name je Veranstaltung eindeutig.
- `ticket_types` – `id`, `event_id`, `contingent_id` (FK, gleiche Veranstaltung), `name`, `public_description`, `price_cents` (int ≥ 0, Währung fest EUR), `type_limit` (int ≥ 1, optional), `discount_hint` (Text, optional), `requires_purchase_confirmation`, `requires_admission_proof` (bool), `active`, `sort`, `revision`, Ersteller/Bearbeiter/Zeitstempel. Name je Veranstaltung eindeutig.

Preise ausschließlich als ganze Cent speichern und rechnen, nie als Gleitkommazahl. Alle Zeiten als timestamptz speichern und in der Oberfläche in `Europe/Berlin` anzeigen und eingeben.

Validierung serverseitig: Verkaufsende nach Verkaufsbeginn, Veranstaltungsbeginn nicht vor Einlass, Kontingent gehört zur Veranstaltung der Ticketart. Ein Kontingent mit zugeordneten Ticketarten kann nicht gelöscht werden (409 mit Hinweis).

## API

Wie bestehende Routen unter `/api/v1`, mit Origin-/CSRF-Prüfung, Revisionskonflikten (409 mit aktuellem Stand, kein stilles Überschreiben) und Protokollierung über `remember()` in `revisions`.

- `GET /api/v1/events/:id/tickets` – Einstellungen, Kontingente, Ticketarten und Prüfergebnis in einer Antwort.
- `PUT /api/v1/events/:id/tickets/settings` – mit `expectedRevision`.
- `POST /api/v1/events/:id/tickets/contingents`, `PATCH /api/v1/ticket-contingents/:id`, `DELETE /api/v1/ticket-contingents/:id`.
- `POST /api/v1/events/:id/tickets/types`, `PATCH /api/v1/ticket-types/:id`, `DELETE /api/v1/ticket-types/:id`.
- Verträge mit zod in `packages/contracts/src/tickets.ts`, strikt (`strictObject`).

## Prüfansicht („Vorbereitung prüfen“)

Reine Berechnung aus den gespeicherten Daten, als eigene getestete Funktion:

- Je Kontingent: Kapazität, zugeordnete aktive Ticketarten, Summe ihrer Einzellimits.
- Hinweise (nicht blockierend): Kontingent ohne Ticketart; Ticketart-Limit größer als Kontingentkapazität; keine aktive Ticketart; Verkaufszeiten fehlen; Verkaufsende nach Veranstaltungsbeginn; Preis 0 € (bewusst Freikarte?).
- Klar beschriftet als Vorbereitungsprüfung, **keine** Veröffentlichung und kein Bestand.

## Oberfläche

- Neuer Bereich **Tickets** in der Veranstaltung, nur sichtbar für Admin/Leitung und nur bei aktiviertem Modul.
- Drei Abschnitte: Verkaufszeiten, Kontingente, Ticketarten; darunter die Prüfansicht.
- Deutsche Texte, Preise im Format „12,50 €“, Eingabe mit Komma. Mobil bei 390 px ohne horizontalen Überlauf.
- Sichtbarer Hinweis: „Vorbereitung – es findet noch kein Verkauf statt.“

## Kopieren

Gibt es beim Fertigstellen dieses Pakets einen Veranstaltungs-Kopierablauf, werden Einstellungen, Kontingente und Ticketarten mit neuen Kennungen mitkopiert. Gibt es keinen, nicht neu einführen.

## Ausdrücklich nicht in diesem Paket

Saalplan und Plätze, Holds, Bestellungen, Gastshop, Gruppen, Reservierungen, Zahlungen, Tickets/QR/PDF, Mails, Storno, Einlass, Offlinepakete, öffentliche Seiten, Einzelrechte Verkauf/Einlass, Produktivupdate. O11 (Veranstalter-, Datenschutz- und Vertragsangaben) bleibt offen und blockiert spätere öffentliche Verkaufsfreigabe, nicht dieses Paket.

## Nachweise

- Unit-Tests: Preisformat/-parser, Prüfansicht, Zeitvalidierung.
- PostgreSQL-Integration (eigener Befehl, z. B. `pnpm test:tickets`, in `s1.yml` aufnehmen): Rechte (Admin, Leitung, Mitglied, fremder Benutzer, ohne MFA), Modul aus, Revisionskonflikt, Kontingent mit Ticketarten nicht löschbar, Kontingent fremder Veranstaltung abgelehnt, Revisionsprotokoll.
- Browser (Playwright): Leitung legt Verkaufszeiten, zwei Kontingente und drei Ticketarten an, Prüfansicht zeigt erwartete Hinweise, Neuladen erhält alles; Mobilansicht ohne Überlauf.
- Upgrade-Rehearsal auf die neue Schemaversion anheben.
- Dokumentation: dieses Dokument um tatsächlichen Stand und Grenzen ergänzen, `status.md` Abschnitt „Aktuell“, `issue-arbeitsliste.md`, Datenmodell und Schnittstellen.
- Nur synthetische Demodaten.

## Startprompt für Codex

> Setze S8-01 aus `docs/entwicklung/s8-01-ticketvorbereitung.md` um (Issue #43, Entscheidung D019). Lies vorher AGENTS.md. Arbeite auf einem eigenen Branch ab aktuellem `main`, öffne einen PR und merge nicht selbst. Halte dich an den Umfang; alles unter „Ausdrücklich nicht in diesem Paket“ bleibt draußen. Rechte nur Admin und Veranstaltungsleitung, keine neuen Einzelrechte. Führe Typprüfung, Unit-, Integrations- und Browsertests lokal aus und dokumentiere tatsächliche Ergebnisse und Grenzen. Kein Produktivupdate.
