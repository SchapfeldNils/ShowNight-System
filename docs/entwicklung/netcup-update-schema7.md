# Netcup-Produktivupdate: Stage-Timer-Vorbereitung und Szeneneditor (Schema 6 → 7)

Stand: 15\. Oktober 2026. Status: **Anleitung, kein Protokoll.** Diese Anleitung hat Claude vorbereitet und gegen die tatsächlichen Skripte auf `main` geprüft. Codex übernimmt die technische Vorbereitung, Sicherung, Restore-Probe und Umschaltung. Die produktive Umschaltung braucht eine **ausdrückliche Betreiberfreigabe** für Zielcommit, Image und Wartungsfenster. Keine parallelen Deploymentaktionen.

Grundlage: der am 15. Oktober durchgeführte Ablauf Schema 4 → 6 ([online-produktivupdate.md](online-produktivupdate.md)) und die [Deploymentanleitung](deployment.md). Geprüfte Skripte: `deploy/backup.sh`, `deploy/backup-run.sh`, `deploy/restore.sh`, `deploy/compose.yaml`, `scripts/backup-vault.mjs`, `tests/netcup-upgrade-smoke.sh`, `.github/workflows/netcup-release.yml`. Zwischen Produktion `f232483` und `main` `0834409` sind diese Dateien unverändert; einzige neue Migration ist `007_timer_preparation.sql` (neue leere Tabelle `timer_preparations`).

## Umfang

| Mit diesem Update | Nicht enthalten |
|---|---|
| Stage-Timer-Vorbereitung (PR #42, Migration 7) | Ticketvorbereitung (#49, Migration 8) |
| Szeneneditor Paket 1 (PR #55, nur Weboberfläche, keine Migration) | Softwareupdates Streaming-Rechner (#51/#52) |
| CI-Änderungen #57 (keine Laufzeitwirkung) | Showablauf (#56, nur lokaler Server) |

Keine neuen Umgebungsvariablen, Volumes oder Proxyänderungen im Zielzustand.

## 0. Voraussetzungen (alles lesend, keine Änderung)

1. **Zielcommit festlegen.** Vorschlag: `0834409abfbda494841ad4c47d79153cd8f0f3f6` (Merge #55, `main` am 15.10. 17:00). Wenn `main` sich vorher bewegt, gilt nur ein ausdrücklich neu benannter Commit.
2. **Rehearsal genau am Zielcommit:** Lauf von `netcup-release.yml` per `workflow_dispatch` (Lauf `38759884920` läuft bereits mit `head_sha` = `0834409…`). Prüfen:
   - `head_sha` des Laufs ist exakt der Zielcommit. Ein Dispatch auf `main` testet den Kopf zum Zeitpunkt des Starts.
   - Beide Jobs „Schema 6 to 7 and return“ (amd64/arm64) sind `success`.
   - `result.json` aus `netcup-release-proof-arm64` enthält `targetSchema: 7`, `rollbackSchema: 6`, `checks.target/rollback: true` und `candidateCommit` = Zielcommit.
3. **Image = genau das geprüfte Rehearsal-Image.** Artefakt `netcup-release-candidate-arm64` dieses Laufs verwenden (`shownight-arm64.tar.gz`, `.sha256`, `image-info.txt`), **nicht** das separat gebaute S1-Artefakt `shownight-image-arm64`. Prüfen:
   - ZIP-SHA256 gegen GitHub und Archiv-SHA256 gegen die `.sha256`-Datei
   - `image-info.txt` nennt `linux/arm64` und eine Image-ID
   - Artefakte verfallen nach 7 Tagen; danach Rehearsal am Zielcommit erneut starten
4. **Tatsächlichen Produktionsstand lesen:**
   - öffentliche Readiness `schemaVersion: 6`
   - Portainer-Stack 23 auf Endpoint 3: Image `f232483…-arm64`, Volumes (erwartet `shownight-online-f232-20261015-database`/`-media`), Proxyalias, `MAIL_DELIVERY_ENABLED`, Projektname (`STACK_NAME`)
   - freier Platz (`df -h`, `docker system df`): mindestens doppelte Datenbank- und Mediengröße plus Archiv
5. **Private `stack.env` für die Skripte** (Modus 600, außerhalb Git). Sie muss den laufenden Stack 23 exakt abbilden: gleicher Projektname, gleiches altes Image, gleiche Volumes, gleicher Proxyname/-alias, Original-`MFA_ENCRYPTION_KEY`, `POSTGRES_PASSWORD` und SMTP-Werte. **Pflichtprüfung, sonst kein `backup.sh`:**
   - `docker compose --env-file stack.env -f deploy/compose.yaml config --hash app,worker` muss mit dem Label `com.docker.compose.config-hash` der laufenden Container `app`/`worker` von Stack 23 übereinstimmen.
   - Grund: `backup.sh` startet App/Worker am Ende mit `compose up -d --wait app worker`. Bei abweichender Konfiguration würde Compose die Container mit anderer Konfiguration **neu erzeugen** statt sie nur zu starten.
6. **Wartungssperre vorbereiten:** Den bestehenden Advanced-Block des NPM-Proxy-Hosts privat sichern und eine Sperrvariante bereithalten, die für `location /` nur `return 503;` liefert. Das ist eine reversible NPM-Änderung und betrifft nur diesen Proxy-Host. Sie sperrt auch Windows-Agenten.
7. **Betreiberfreigabe** in Issue #54 mit Zielcommit, Image-ID/Archiv-SHA256 und Wartungsfenster.

## Durchgängiger Schreibstillstand – Grundsatz

`deploy/backup.sh` verlangt **laufende** App und Worker. Es stoppt beide selbst und startet sie per `EXIT`-Trap wieder (`compose up -d --wait app worker`). App und Worker dürfen deshalb vorher **nicht** gestoppt werden: Dann bricht das Skript ab („App und Worker müssen vor Sicherung laufen“). Nach der Sicherung laufen sie wieder und könnten schreiben.

Daraus folgt: Ab Schritt 1 bis zum Ende der Umschaltung (Schritt 5) darf **niemand** schreiben.
- **Nutzer und Agenten:** die NPM-Sperre (503) blockiert sie.
- **Worker:** Er schreibt nur, wenn Aufträge offen sind oder abgelaufene Sitzungen bereinigt werden. Deshalb wird die Warteschlange vor der Sicherung als leer geprüft.
- **Nachweis:** Der Datenfingerabdruck in Schritt 3 belegt, dass zwischen Dump und endgültigem Stopp nichts geändert wurde.

Weicht der Fingerabdruck ab, wird der Klon verworfen und die Sicherung wiederholt (Schritt 2 erneut, Sperre bleibt aktiv).

## 1. Wartungsfenster beginnen: Schreibsperre

1. Betreiber informieren. NPM-Sperrvariante aktivieren; öffentlich prüfen, dass die Domain 503 liefert.
2. Intern prüfen, dass App und Worker laufen und gesund sind (`compose ps`).
3. Warteschlange leer, intern über `compose exec -T postgres psql -U shownight -d shownight -Atc …`:
   - `SELECT count(*) FROM media WHERE status='processing'` → 0
   - `SELECT count(*) FROM mail_jobs WHERE status IN ('queued','sending')` → 0
   - Sonst warten oder mit dem Betreiber klären. Keine Aufträge löschen oder umsetzen.

## 2. Frische, unabhängige Sicherung mit den unveränderten Skripten

1. Separates Sicherungskennwort als Datei (Modus 400/600, eigener Benutzer, kein Symlink) und ein **bestehendes** Archivverzeichnis bereitstellen.
2. `sh deploy/backup-run.sh /pfad/stack.env /pfad/archiv /pfad/kennwort`
   - **Nicht** vorher App/Worker stoppen.
   - Das Skript sperrt parallele Läufe (`flock`), stoppt App/Worker, erstellt `database.dump`, `media.tar` und `SHA256SUMS`, startet App/Worker wieder und versiegelt alles mit der privaten `stack.env` zu genau einer `.snbackup`-Datei.
   - Endet es mit „Wiederanlauf von App/Worker nicht bestätigt“, bleibt die Sperre aktiv; Betreiberaktion erforderlich.
3. **Sofort danach App und Worker von Stack 23 stoppen** (`compose stop app worker` mit derselben `stack.env` oder in Portainer). Postgres läuft weiter. Ab jetzt schreibt auch der Worker nicht mehr. Die Sperre bleibt aktiv.
4. Produktions-Fingerabdruck **jetzt** erstellen (siehe Anhang A), mit Uhrzeit privat speichern.
5. Unabhängige Kopie:
   - `.snbackup` auf den Windows-Betriebsordner `C:\Users\nilss\AppData\Local\ShowNight\backups\netcup` übertragen und SHA256 auf beiden Seiten vergleichen.
   - Dort tatsächlich mit `node scripts/backup-vault.mjs open <archiv> <neuer Ordner>` (Kennwort über Standardeingabe) entschlüsseln.
   - `sha256sum -c SHA256SUMS` prüfen; `stack.env` im Archiv muss der verwendeten entsprechen.

## 3. Restore- und Migrationsprobe auf echten Daten (isoliert)

1. Auf der VM das Archiv in einen neuen privaten Ordner öffnen (`backup-vault.mjs open`).
2. Klon-Umgebung `clone.env` aus `stack.env` ableiten. Geändert werden:
   - `STACK_NAME` → neu, eindeutig
   - `DB_VOLUME_NAME` und `MEDIA_VOLUME_NAME` → neu, z. B. `shownight-online-0834409-<datum>-database` bzw. `-media`; vorher sicherstellen, dass sie nicht existieren
   - `PROXY_NETWORK_NAME` → eigenes, vorher angelegtes internes Netz ohne NPM
   - `PROXY_APP_ALIAS` → eindeutig
   - `MAIL_DELIVERY_ENABLED=false`, SMTP-Werte leer
   - `SHOWNIGHT_IMAGE` → altes Image `f232483…`

   **Unverändert** bleiben `POSTGRES_PASSWORD` (damit Stack 23 die Volumes später ohne Passwortänderung übernehmen kann) und der Original-`MFA_ENCRYPTION_KEY`.
3. `RESTORE_CONFIRM=EMPTY_ISOLATED_STACK sh deploy/restore.sh /pfad/clone.env /pfad/geoeffnet`. Das Skript prüft Prüfsummen, leere Ziel-DB und leeres Medienvolume sowie die Medien-Dateinamen.
4. Mit dem **alten** Image (nur Postgres und `compose run`, kein Worker): Migrationsliste `1,…,6`. Fingerabdruck des Klons (Anhang A) **identisch** zum Produktions-Fingerabdruck aus 2.4.
   - **Abweichung → Abbruch:** Klon mit `compose down --volumes` **nur für `clone.env`** entfernen. Danach wieder mit Schritt 2 beginnen; dazu App/Worker von Stack 23 bei aktiver Sperre starten, weil `backup.sh` sie laufend erwartet.
5. `clone.env` auf das neue Image umstellen. `compose run --rm app node dist/api/cli.js migrate` **zweimal** ausführen; erwartet ist `1,2,3,4,5,6,7`.
   - Fingerabdruck erneut: alle Tabellen außer `schema_migrations` und `timer_preparations` unverändert, `timer_preparations` leer.
   - `mail_jobs.delivery_mode`-Default ist `'test'`, bestehende Aufträge sind unverändert.
6. Nur die App des Klons starten (`compose up -d --wait app`, kein Worker) und intern prüfen:
   - `/health/ready` liefert Schema 7.
   - Anmeldung mit MFA über einen internen Tunnel/Port-Forward (kein öffentlicher Proxy) mit einem Betreiberkonto; kein Passwort-/MFA-Reset.
   - `GET /api/v1/shows/<id>/timer-preparation` liefert den Standardentwurf.
   - Die Szenenansicht lädt.
   - Keine Testdaten anlegen.
7. Klon stoppen und Container entfernen, **Volumes behalten**: `compose down` ohne `--volumes`; die Volumes haben feste Namen.

## 4. Umschaltung

1. Stack 23 in Portainer bearbeiten. Nur ändern:
   - `SHOWNIGHT_IMAGE` → geprüftes neues Image
   - `DB_VOLUME_NAME`/`MEDIA_VOLUME_NAME` → die migrierten Klon-Volumes

   Alles andere bleibt, insbesondere MFA-Schlüssel, `POSTGRES_PASSWORD`, SMTP, Proxyalias und `MAIL_DELIVERY_ENABLED`. Beim Redeploy **keine** Option zum Entfernen von Volumes oder „Prune“ wählen.
   Compose kann melden, dass die Volumes von einem anderen Projekt (dem Klon) angelegt wurden. Das ist bei diesem Vorgehen zu erwarten. Wichtig ist nur, dass keine **neuen** leeren Volumes entstehen: Nach dem Deploy die gemounteten Volumenamen per `docker inspect` prüfen.
2. Prüfen, dass weder alte noch Klon-Container parallel laufen. Danach Stack 23 deployen (Postgres, App, Worker).
3. Intern prüfen, **vor** dem Aufheben der Sperre:
   - `/health/ready` liefert Schema 7.
   - Fingerabdruck wie nach 3.5.
   - Worker-Log ohne Fehler.
   - Die Original-Volumes sind unverändert vorhanden und an keinen Container gebunden.
4. NPM-Sperre aufheben (gesicherten Advanced-Block wiederherstellen). Öffentlich: Readiness 200 mit Schema 7. Im Browser: Anmeldung, Show öffnen, Bereich Bühnenmonitor-Entwurf und Szenenentwürfe sichtbar; keine Testdaten anlegen.

## 5. Rückweg

- **Vor Aufheben der Sperre** (keine neuen Daten):
  - Stack 23 wieder auf altes Image `f232483…` und Original-Volumes setzen und deployen.
  - Sperre aufheben.
  - Keine SQL-Rückmigration.
- **Nach Aufheben der Sperre:**
  - Neue Online-Eingaben gingen bei Rückkehr auf die Original-Volumes verloren. Deshalb nur nach Betreiberentscheidung.
  - Vorher Sperre setzen und eine weitere Sicherung des neuen Stands erstellen (Schritte 1–2 gegen den neuen Stand).
- **Original-Volumes und altes Image** bleiben bis zur ausdrücklichen Betreiberfreigabe erhalten. Kein `docker volume prune`, kein `docker image prune`.

## 6. Dokumentation danach (Codex)

- Protokoll `docs/entwicklung/online-produktivupdate-schema7.md` nach Muster des 15.10. mit Run-ID, Image-ID, Archivhashes (ohne Geheimnisse), Fingerabdruckvergleich (nur Ergebnis), Uhrzeiten von Sperre/Umschaltung und Rückweg-Status.
- `status.md` „Aktuell“ und README-Statustabelle ersetzen (Produktiv: Zielcommit, Schema 7).
- Issue #54 aktualisieren; Schema-8-Folgeupdate bleibt offen.

## Anhang A: Datenfingerabdruck

Er belegt, dass Produktion nach dem Dump unverändert blieb und der Klon dieselben Daten enthält. Ausgabe nur privat speichern; sie enthält keine Inhalte, nur Zählwerte und Hashes.

```sh
# compose = docker compose --env-file <env> -f deploy/compose.yaml
fingerprint() {
  for t in $(compose exec -T postgres psql -U shownight -d shownight -Atc \
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"); do
    case "$t" in sessions|challenges|invitations) continue ;; esac
    printf '%s ' "$t"
    compose exec -T postgres psql -U shownight -d shownight -Atc \
      "SELECT count(*)||' '||md5(coalesce(string_agg(x::text, E'\n' ORDER BY x::text),'')) FROM public.\"$t\" x"
  done
  compose run --rm --no-deps --entrypoint sh app -c \
    'cd /data/media && find . -type f -exec sha256sum {} + | sort | sha256sum'
}
```

`sessions`, `challenges` und `invitations` sind ausgenommen, weil der Worker abgelaufene Einträge zeitgesteuert löscht; neue Einträge sind durch die Sperre ausgeschlossen. Die Abfrage liest nur.

## Spätere Erweiterung auf Schema 8

Ticketvorbereitung (#49), Server stoppen (#51) und Softwareupdates (#52) folgen in einem eigenen Fenster mit identischem Ablauf. Abweichungen:
- Ausgangsschema 7
- Rehearsal-Workflow auf `7 → 8`
- neue Medienablage `software-updates/`, für die `deploy/restore.sh` aus #52 nötig ist
- kein Veröffentlichen eines Softwareupdates im selben Schritt

Diese Punkte werden bei Bedarf als eigene Anleitung ergänzt.

## Offene Punkte

- Betreiberfreigabe für Zielcommit, Image und Wartungsfenster
- Ergebnis von Rehearsal-Lauf `38759884920` am exakten Zielcommit
- tatsächliche Übereinstimmung der Compose-Config-Hashes (Schritt 0.5)
- konkrete NPM-Sperrvariante am realen Proxy-Host
