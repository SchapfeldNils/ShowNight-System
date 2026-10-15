# Netcup-Produktivupdate: Stage Timer, Ticketvorbereitung und Softwareupdates (Schema 6 → 8)

Vorbereitet von Claude am 15\. Oktober 2026 auf Betreiberauftrag („Deployment auf Netcup für Codex dokumentieren und vorbereiten“). **Ausführung durch Codex** (Zugriff auf Portainer/VM und den Windows-Betriebsordner), **nur nach ausdrücklicher Betreiberfreigabe des konkreten Commits und Wartungsfensters**. Dieses Dokument ist eine Anleitung, kein Protokoll.

Grundlage ist der am 15. Oktober tatsächlich durchgeführte Ablauf in [online-produktivupdate.md](online-produktivupdate.md) (Schema 4 → 6) und die allgemeine [Deploymentanleitung](deployment.md). Wo dieses Dokument nichts sagt, gelten diese.

## Ausgangsstand (vor Ausführung erneut lesend bestätigen)

- Produktiv: Runtime `f232483` (Merge PR #38), Datenbankschema 6, Portainer-Stack 23 auf Endpoint 3, ARM64, Volumes `shownight-online-f232-20261015-database` und `shownight-online-f232-20261015-media`, Kontomailversand aktiv, Demo aus.
- Nicht auf diesen Stand vertrauen: vor jedem Schritt öffentliche Readiness (`/health/ready` → `schemaVersion`) und Portainer-Stack lesend prüfen.

## Was mit diesem Update wirksam wird

| Änderung | Quelle | Wirkung online |
| --- | --- | --- |
| Stage-Timer-Vorbereitung | PR #42 (in `main`) | Migration 007 `timer_preparations`, Bühnenmonitor-Entwurf je Show |
| Ticketshop S8-01 | PR #49 (offen) | Migration 008 `ticket_settings`, `ticket_contingents`, `ticket_types`; Bereich „Tickets“ für Admin/Leitung |
| Softwareupdates Streaming-Rechner | PR #52 (offen, baut auf #51) | Routen `/updates/v1/windows-x64/…` (öffentlich lesend) und `/api/v1/software-updates` (Admin/MFA); Adminbereich in „Diagnose“; neue Ablage `MEDIA_ROOT/software-updates/` |
| Wiederherstellung | PR #52 | `deploy/restore.sh` erlaubt die neue Updateablage im Medienarchiv |
| Lokaler Server stoppen | PR #51 (offen) | **keine** Wirkung online; betrifft nur das Windows-Setup |

Keine neuen Umgebungsvariablen, keine neuen Volumes, keine Proxyänderung. `MAX_UPLOAD_BYTES` (100 MB) und Nginx `client_max_body_size 101m` reichen für das Setup (ca. 30 MB).

## 0. Voraussetzungen und Zielcommit festlegen

1. Betreiber merged #49, #51 und #52 (in dieser Reihenfolge: #51 vor #52; #52 wird vorher ausdrücklich auf `main` umgestellt). Erst dann ist der vollständige Umfang in `main`.
   - Variante „nur Stage Timer jetzt“: Zielcommit ist der aktuelle `main` mit Schema 7. Dann gelten alle Schritte mit Zielschema 7; Ticket- und Updatefunktionen folgen in einem zweiten Wartungsfenster. Empfehlung: ein Fenster nach allen Merges.
2. Zielcommit = konkreter Merge-Commit auf `main` (kein bewegliches `main`). Betreiberfreigabe nennt genau diesen Commit, das ARM64-Image und das Wartungsfenster.
3. CI am Zielcommit vollständig grün:
   - „S1 checks“ läuft bei Push auf `main` automatisch und erzeugt das Image-Artefakt `shownight-image-arm64`.
   - **Netcup-Rehearsal am Zielcommit manuell starten** (`netcup-release.yml` per `workflow_dispatch` auf `main`): prüft Schema 6 → 8 und Rückkehr mit der Produktionsbasis `f232483`. Ergebnisse früherer PR-Heads gelten nicht für den Merge-Commit.
4. Ergebnisse (Run-IDs, Artefakt-SHA256, Image-ID/Konfigurationsdigest) im Issue festhalten.

## 1. Image beschaffen und prüfen (lesend, ohne Änderung)

1. Artefakt `shownight-image-arm64` des S1-Laufs am Zielcommit herunterladen (Aufbewahrung 7 Tage; danach S1 am Zielcommit erneut starten und dieses Ergebnis verwenden); ZIP-SHA256 gegen GitHub prüfen; `image-info.txt` muss Zielcommit und `arm64` nennen.
2. Archiv über den bisher genutzten autorisierten Weg auf die VM übertragen, dort SHA256 erneut prüfen, `docker load`.
3. Wie am 15.10.: Konfigurationsdigest und alle RootFS-Schichten mit dem CI-Archiv vergleichen (containerd zeigt ggf. den Manifestdigest).
4. Altes Produktionsimage `shownight:f232483…-arm64` bleibt unverändert vorhanden.

## 2. Wartungsfenster: Sicherung

Erst ab hier ändert sich etwas. Betreiber informieren; während des Fensters keine Bearbeitung durch Nutzer.

1. Wirksamen privaten Stackstand (Portainer-Environment inkl. **Original-MFA-Schlüssel**, SMTP-Werte, Volumes, Proxyalias) privat sichern. Nichts davon ins Repository.
2. App **und** Worker gemeinsam stoppen (kein alter Worker parallel).
3. Konsistente Sicherung mit den Skripten **aus dem Zielcommit** (`deploy/backup-run.sh`, `scripts/backup-vault.mjs`), verschlüsselt mit dem separaten Sicherungskennwort.
4. Verschlüsselte Kopie in den Betreiberordner `C:\Users\nilss\AppData\Local\ShowNight\backups\netcup` übertragen, Hash vergleichen, dort tatsächlich entschlüsseln und bytegleich prüfen.

## 3. Isolierte Probe auf echten Daten

1. Sicherung in **neue** leere Volumes wiederherstellen (eigener Stackname, eindeutiger Alias, kein Proxy/Hostport, `MAIL_DELIVERY_ENABLED=false`, Original-MFA-Schlüssel) mit `deploy/restore.sh` **aus dem Zielcommit** (nötig, damit spätere Archive mit Updateablage wiederherstellbar sind).
2. Mit dem **alten** Image starten: Schema 6, Tabellen- und Medienbestand mit der Produktion vergleichen.
3. Mit dem **neuen** Image `migrate` zweimal ausführen: Versionen `1,2,3,4,5,6,7,8`, keine Fehler, Bestandsvergleich erneut gleich (neue Tabellen leer).
4. Neues Image in der isolierten Kopie starten und prüfen:
   - `/health/ready` → `schemaVersion: 8`
   - Anmeldung mit MFA (eigenes Betreiberkonto oder synthetisches Prüfkonto, kein Reset bestehender Konten)
   - `GET /api/v1/shows/<id>/timer-preparation` → Standardentwurf
   - `GET /api/v1/events/<id>/tickets` (Veranstaltung mit Modul `tickets`) → leerer Stand mit Hinweisen
   - `GET /updates/v1/windows-x64/latest.json` → 404 (noch nichts veröffentlicht)
   - Worker verarbeitet keine Mails (Versand in der Kopie aus)
5. Isolierte Dienste stoppen.

## 4. Umschalten

Wie am 15.10. auf die geprüften Volumes der Probe **oder** – einfacher und gleichwertig, wenn Schritt 3 bestanden ist – auf die ursprünglichen Volumes mit Migration:

- **Empfohlen (wie 15.10.):** Stack 23 auf die in Schritt 3 migrierten neuen Volumes und das neue Image umstellen. Ursprüngliche Volumes bleiben als Rückweg unverändert.
- SMTP-/Mailwerte und Proxyalias exakt aus dem gesicherten Stackstand übernehmen; `MAIL_DELIVERY_ENABLED` wie bisher.
- App und Worker starten; öffentlich `/health/ready` → Schema 8.

## 5. Nachprüfung im Livebetrieb

- Browser: Anmeldung, Veranstaltung öffnen, Navigationspunkt „Tickets“ sichtbar (nur Admin/Leitung, Modul aktiv); Show öffnen, Bühnenmonitor-Entwurf sichtbar; „Diagnose“ zeigt „Softwareupdates · Streaming-Rechner“.
- Keine Testdaten in der Produktion anlegen, außer der Betreiber wünscht es ausdrücklich.
- Worker-Log ohne Fehler; keine unerwarteten Mails.
- Nichts unter „Softwareupdates“ veröffentlichen (siehe 7).

## 6. Rückweg

Neues Image stoppen, Stack 23 mit **altem Image `f232483` und den ursprünglichen Volumes** starten. Keine SQL-Rückmigration. Daten, die nach dem Umschalten online eingegeben wurden, gehen dabei verloren; deshalb Rückweg nur unmittelbar nach dem Umschalten oder nach Betreiberentscheidung.

## 7. Nicht Teil dieses Updates

- **Erstes Softwareupdate veröffentlichen:** eigener Schritt nach Betreiberfreigabe. Der Streaming-Rechner läuft mit 0.3.8 und kennt den Updateweg noch nicht; 0.3.12 (oder neuer) muss dort **einmalig manuell** installiert werden. Erst danach lohnt das Veröffentlichen im Adminbereich. Ein laufender Server aus 0.3.10 oder älter muss dafür einmal manuell beendet werden.
- Keine Aktionen auf dem DJ-/Streaming-Rechner, keine Geräteausgabe, keine Mails an echte Nutzer zu Testzwecken.
- Regelmäßiger Sicherungsbetrieb (#3) bleibt offen.

## 8. Dokumentation danach (durch Codex)

- Neues Protokoll `docs/entwicklung/online-produktivupdate-schema8.md` nach Muster des 15.10. plus maschinenlesbarer Nachweis unter `nachweise/`.
- `docs/entwicklung/status.md` Abschnitt „Aktuell“ und README-Statustabelle ersetzen (Produktiv: Zielcommit, Schema 8).
- Issue mit aktuellem Commit, tatsächlich Geprüftem, Grenzen und Rückweg-Status abschließen.
