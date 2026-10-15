# Netcup-Produktivupdate: Stage-Timer-Vorbereitung und Szeneneditor (Schema 6 → 7)

Stand: 15\. Oktober 2026. Status: **Anleitung, kein Protokoll.**
- **Erstellung:** Claude hat die Anleitung vorbereitet und gegen die tatsächlichen Skripte auf `main` geprüft; zusätzlich hat ein unabhängiger Subagent sie gegengeprüft.
- **Ausführung:** Codex übernimmt technische Vorbereitung, Sicherung, Restore-Probe und Umschaltung. Keine parallelen Deploymentaktionen.
- **Freigabe:** Die produktive Umschaltung braucht eine **ausdrückliche Betreiberfreigabe** für Zielcommit, Image und Wartungsfenster.

**Grundlage:** der am 15. Oktober durchgeführte Ablauf Schema 4 → 6 ([online-produktivupdate.md](online-produktivupdate.md)) und die [Deploymentanleitung](deployment.md).

**Geprüfte Dateien:** `deploy/backup.sh`, `deploy/backup-run.sh`, `deploy/restore.sh`, `deploy/compose.yaml`, `scripts/backup-vault.mjs`, `apps/api/src/worker.ts`, `apps/api/src/auth.ts`, `apps/api/src/cli.ts`, `tests/netcup-upgrade-smoke.sh`, `.github/workflows/netcup-release.yml`, `.github/workflows/s1.yml`.

**Unterschiede zwischen Produktion `f232483` und `main` `0834409`:**
- Unverändert sind `deploy/*` und `scripts/backup-vault.mjs`.
- Geändert sind Rehearsal-Workflow und -Smoke-Test sowie die Anwendung.
- Einzige neue Migration ist `007_timer_preparation.sql` (neue leere Tabelle `timer_preparations`).

## Umfang

| Mit diesem Update | Nicht enthalten |
|---|---|
| Stage-Timer-Vorbereitung (PR #42, Migration 7) | Ticketvorbereitung (#49, Migration 8) |
| Szeneneditor Paket 1 (PR #55, nur Weboberfläche, keine Migration) | Softwareupdates Streaming-Rechner (#51/#52) |
| CI-Änderungen #57 (keine Laufzeitwirkung) | Showablauf (#56, nur lokaler Server) |

Keine neuen Umgebungsvariablen, Volumes oder Proxyänderungen im Zielzustand.

## 0. Voraussetzungen (alles lesend, keine Änderung)

1. **Zielcommit festlegen.** Vorschlag: `0834409abfbda494841ad4c47d79153cd8f0f3f6` (Merge #55). Bewegt sich `main` vorher, gilt nur ein ausdrücklich neu benannter Commit.
2. **Rehearsal genau am Zielcommit:** Lauf `38759884920` von `netcup-release.yml` (`workflow_dispatch`, `head_sha` `0834409…`) ist laut GitHub abgeschlossen, beide Jobs `success`. Noch zu prüfen: `result.json` aus `netcup-release-proof-arm64` enthält:
   - `candidateCommit` = Zielcommit
   - `targetSchema: 7`, `rollbackSchema: 6`
   - `checks.target` und `checks.rollback` = `true`

   Bei anderem Zielcommit den Lauf neu starten. Ein Dispatch auf `main` testet den Kopf zum Startzeitpunkt, daher `head_sha` immer prüfen.
3. **Image = genau das geprüfte Rehearsal-Image.** Artefakt `netcup-release-candidate-arm64` dieses Laufs verwenden. Es enthält `shownight-arm64.tar.gz`, `.sha256` und `image-info.txt` (eine Zeile `<Config-ID> linux/arm64`).
   - Das S1-Artefakt `shownight-image-arm64` am selben Commit **nicht** laden: Es ist ein separater Build mit demselben Tag `shownight:<sha>-arm64` und würde den Tag still überschreiben.
   - ZIP-SHA256 gegen GitHub und Archiv-SHA256 gegen die `.sha256`-Datei prüfen.
   - Artefakte verfallen nach 7 Tagen; danach Rehearsal am Zielcommit erneut starten.
4. **Image auf die VM laden und vergleichen:** Archiv über den bisherigen autorisierten Weg übertragen, dann `sha256sum -c shownight-arm64.tar.gz.sha256 && docker load -i shownight-arm64.tar.gz`.
   - Wie am 15.10. Konfigurationsdigest und **alle RootFS-Schichten** mit dem Archiv vergleichen. Der containerd-Imagestore zeigt ggf. die Manifest-ID statt der Config-ID aus `image-info.txt`.
   - Das alte Image `f232483…-arm64` bleibt unverändert.
5. **Tatsächlichen Produktionsstand lesen:**
   - öffentliche Readiness `schemaVersion: 6`
   - Portainer-Stack 23 auf Endpoint 3: Image, Volumes (erwartet `shownight-online-f232-20261015-database`/`-media`), Proxyalias, `MAIL_DELIVERY_ENABLED`, Compose-Projektname
6. **Platz:** zusätzlich zu den Originalvolumes etwa **4 × (Dump + Medien)** frei, und zwar auch im Dateisystem von `${TMPDIR:-/tmp}`. Grund: Staging und Archiv liegen beim Versiegeln gleichzeitig vor, `open` erzeugt `.payload` und entpackte Dateien, dazu kommen die Klon-Volumes. Prüfen mit `df -h`, `docker system df`.
7. **Werkzeuge und Checkout auf der VM:**
   - `command -v docker node flock sha256sum` müssen alle vorhanden sein.
   - Checkout des Repositorys **am Zielcommit** für `deploy/` und `scripts/`; diese Dateien sind identisch zu `f232483`.
   - Alle Befehle als **derselbe Benutzer**, der Docker aufruft und Eigentümer der Kennwortdatei ist.
8. **Private `stack.env`** (Modus 600, außerhalb Git) bildet Stack 23 exakt ab: Compose-Projektname (`STACK_NAME`), altes Image, Volumes, Proxyname/-alias, Original-`MFA_ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, SMTP-Werte. **Pflichtprüfung, sonst kein `backup.sh`:**
   - `docker compose --env-file stack.env -f deploy/compose.yaml config --hash postgres,app,worker` stimmt für **alle drei** Dienste mit dem Label `com.docker.compose.config-hash` der laufenden Container überein.
   - `docker inspect -f '{{range .Mounts}}{{.Name}} {{end}}'` für den Postgres- und den App-Container zeigt genau `DB_VOLUME_NAME` bzw. `MEDIA_VOLUME_NAME`.
   - Grund: Der Trap von `backup.sh` führt `compose up -d --wait app worker` aus und gleicht dabei auch die Abhängigkeit `postgres` an. Bei falschem Volume-Namen würde Postgres auf einem neuen leeren Volume neu erzeugt.
9. **Sicherungskennwort:** separate Datei, 20–256 Zeichen, Modus 400 oder 600, eigener Benutzer, kein Symlink. `backup-vault.mjs` prüft die Länge erst beim Versiegeln, also nach der Unterbrechung.
10. **Wartungssperre vorbereiten:** Den bestehenden Advanced-Block des NPM-Proxy-Hosts privat sichern und eine Sperrvariante bereithalten, die für `location /` nur `return 503;` liefert. Die Änderung ist reversibel und betrifft nur diesen Proxy-Host.
11. **Betreiberfreigabe** in Issue #54 mit Zielcommit, Image (Archiv-SHA256, Config-ID) und Wartungsfenster.

## Durchgängiger Schreibstillstand – Grundsatz

`deploy/backup.sh` verlangt **laufende** App und Worker, stoppt beide selbst und startet sie per `EXIT`-Trap wieder.
- App und Worker deshalb vorher **nicht** stoppen, sonst bricht das Skript ab („App und Worker müssen vor Sicherung laufen“).
- Nach der Sicherung laufen sie wieder und könnten schreiben.

Daher gilt von Schritt 1 bis zum Ende der Umschaltung (Schritt 4) ein Schreibstillstand:
- **Nutzer:** Die NPM-Sperre beantwortet neue Anfragen mit 503.
- **Windows-Agenten:** Bereits offene Verbindungen enden mit dem Stopp durch `backup.sh`; Wiederverbindungen erhalten 503.
- **Worker:** Er schreibt außer bei offenen Aufträgen nur zeitgesteuert in `sessions`, `challenges` und `invitations` (Löschen abgelaufener Einträge, `worker.ts`). Offene Aufträge werden vor der Sicherung als leer geprüft.
- **Nachweis:** Der Fingerabdruck (Anhang A) belegt, dass die Produktion nach dem endgültigen Stopp dem Dump entspricht. Weicht er ab, wird der Klon verworfen und die Sicherung wiederholt.

## 1. Wartungsfenster beginnen: Schreibsperre

1. Betreiber informieren. NPM-Sperrvariante aktivieren; öffentlich prüfen, dass die Domain 503 liefert.
2. Intern prüfen, dass App und Worker laufen und gesund sind (`compose ps`).
3. Warteschlange intern über `compose exec -T postgres psql -U shownight -d shownight -Atc …` prüfen:
   - `SELECT count(*) FROM media WHERE status='processing'` muss 0 sein.
   - `SELECT count(*) FROM mail_jobs WHERE status IN ('queued','sending')` muss 0 sein.

   Sonst warten oder mit dem Betreiber klären. Keine Aufträge löschen oder umsetzen.

## 2. Frische, unabhängige Sicherung mit den unveränderten Skripten

1. `sh deploy/backup-run.sh /pfad/stack.env /pfad/archiv /pfad/kennwort` ausführen. Das Archivverzeichnis muss existieren; **vorher nicht** App/Worker stoppen.
   - Ablauf im Skript: `flock`, Stopp App/Worker, `database.dump` + `media.tar` + `SHA256SUMS`, Neustart, Versiegeln mitsamt `stack.env` zu genau einer `.snbackup`-Datei.
   - Meldet es „Wiederanlauf von App/Worker nicht bestätigt“, **existiert keine Sicherung**: Das Skript endet mit Fehler, versiegelt nicht und löscht das Staging. Die Sperre bleibt aktiv; nach Behebung Schritt 2 vollständig wiederholen.
2. **Sofort danach** App und Worker von Stack 23 stoppen (`compose stop app worker` mit derselben `stack.env` oder in Portainer). Postgres läuft weiter, die Sperre bleibt.
3. Produktions-Fingerabdruck **jetzt** erstellen (Anhang A) und mit Uhrzeit privat speichern.
4. Unabhängige Kopie:
   - `.snbackup` nach `%LOCALAPPDATA%\ShowNight\backups\netcup` auf dem Windows-Betriebsrechner übertragen und SHA256 auf beiden Seiten vergleichen.
   - Dort mit `node scripts/backup-vault.mjs open <archiv> <neuer privater Ordner>` tatsächlich entschlüsseln (Kennwort über Standardeingabe).
   - `SHA256SUMS` prüfen und die enthaltene `stack.env` mit der verwendeten vergleichen.

## 3. Restore- und Migrationsprobe auf echten Daten (isoliert)

1. Auf der VM das Archiv in einen neuen privaten Ordner öffnen (`backup-vault.mjs open`).
2. Eigenes Netz für den Klon anlegen: `docker network create shownight-clone-<datum>`. Dann `clone.env` aus `stack.env` ableiten.
   - **Ändern:**
     - `STACK_NAME` → neu und eindeutig
     - `DB_VOLUME_NAME` und `MEDIA_VOLUME_NAME` → neu, z. B. `shownight-online-0834409-<datum>-database` bzw. `-media`; vorher prüfen, dass sie nicht existieren
     - `PROXY_NETWORK_NAME` → `shownight-clone-<datum>`
     - `PROXY_APP_ALIAS` → eindeutig
     - `MAIL_DELIVERY_ENABLED=false`, SMTP-Werte leer
     - `PUBLIC_BASE_URL=http://127.0.0.1:18080`, damit die Ursprungsprüfung bei der Tunnel-Anmeldung passt; reine Laufzeitkonfiguration, keine Daten
     - `SHOWNIGHT_IMAGE` → altes Image `f232483…`
   - **Unverändert:**
     - `POSTGRES_PASSWORD`: Das Rollenkennwort entsteht beim Initialisieren des neuen Volumes, und Stack 23 übernimmt das Volume später ohne Passwortänderung.
     - Original-`MFA_ENCRYPTION_KEY`
3. `RESTORE_CONFIRM=EMPTY_ISOLATED_STACK sh deploy/restore.sh /pfad/clone.env /pfad/geoeffnet`. Das Skript prüft Prüfsummen, leere Ziel-DB und leeres Medienvolume sowie die Medien-Dateinamen.
4. Altes Image, nur Postgres und `compose run`, kein Worker:
   - Migrationsliste mit `psql -Atc "SELECT string_agg(version::text,',' ORDER BY version) FROM schema_migrations"` muss `1,2,3,4,5,6` ergeben. Die Ausgabe von `cli.js migrate` belegt das nicht.
   - Klon-Fingerabdruck **identisch** zum Produktions-Fingerabdruck aus 2.3.
   - **Abweichung → Abbruch:**
     1. Klon mit `compose down --volumes` **nur mit `clone.env`** entfernen.
     2. App/Worker von Stack 23 bei aktiver Sperre starten, weil `backup.sh` laufende Dienste verlangt.
     3. Ab Schritt 1.3 neu beginnen.
5. `clone.env` auf das neue Image umstellen und `compose run --rm app node dist/api/cli.js migrate` **zweimal** ausführen.
   - Migrationsliste `1,2,3,4,5,6,7`.
   - Fingerabdruck: alle Tabellen außer `schema_migrations` und `timer_preparations` unverändert, `timer_preparations` leer.
6. Nur die App des Klons starten (`compose up -d --wait app`, kein Worker) und intern prüfen:
   - `/health/ready` liefert Schema 7.
   - Anmeldung mit MFA über `ssh -L 18080:<Backend-IP des Klon-App-Containers>:3000 …` mit einem Betreiberkonto; kein Passwort-/MFA-Reset.
   - `GET /api/v1/shows/<id>/timer-preparation` liefert den Standardentwurf; die Szenenansicht lädt.
   - Keine Inhalte anlegen.
   - **Hinweis:** Die Anmeldung verändert `users.mfa_counter` (bei einem Wiederherstellungscode auch `recovery_hashes`) und legt Sitzung/Challenge an.
7. **Referenz-Fingerabdruck für Schritt 4** nach der Anmeldung erstellen. Dann den Klon stoppen und Container entfernen, **Volumes behalten** (`compose down` ohne `--volumes`; die Volumes haben feste Namen). Klon-Netz mit `docker network rm shownight-clone-<datum>` entfernen.

## 4. Umschaltung

1. **Vor** dem Bearbeiten: `docker ps -a --filter volume=<Klon-DB-Volume>` und `--filter volume=<Klon-Medienvolume>` müssen leer sein.
2. Stack 23 in Portainer bearbeiten. Nur ändern:
   - `SHOWNIGHT_IMAGE` → geprüftes neues Image
   - `DB_VOLUME_NAME`/`MEDIA_VOLUME_NAME` → die migrierten Klon-Volumes

   Alles andere bleibt: MFA-Schlüssel, `POSTGRES_PASSWORD`, SMTP, Proxyalias, `PUBLIC_BASE_URL`, `MAIL_DELIVERY_ENABLED`.
   - **Mit dem Speichern wird sofort deployt.** Keine Option zum Entfernen von Volumes oder „Prune“ wählen.
   - Compose kann melden, dass die Volumes von einem anderen Projekt angelegt wurden. Danach per `docker inspect` prüfen, dass die gemounteten Volumes genau die Klon-Volumes sind und keine neuen leeren entstanden.
3. Intern prüfen, **vor** dem Aufheben der Sperre:
   - `/health/ready` liefert Schema 7.
   - Fingerabdruck gleich der Referenz aus 3.7.
   - Worker-Log ohne Fehler.
   - Die Originalvolumes sind unverändert vorhanden und an keinen Container gebunden.
4. **Private `stack.env` nachführen:** `SHOWNIGHT_IMAGE`, `DB_VOLUME_NAME`, `MEDIA_VOLUME_NAME` auf den neuen Stand setzen und die Hash-/Mount-Prüfung aus 0.8 gegen die neuen Container wiederholen. Sonst würde eine spätere Sicherung per `backup-run.sh` die Produktion auf alte Volumes und das alte Image zurücksetzen.
5. NPM-Sperre aufheben, also den gesicherten Advanced-Block wiederherstellen.
   - Öffentlich: Readiness 200 mit Schema 7.
   - Browser: Anmeldung, Show öffnen, Bühnenmonitor-Entwurf und Szenenentwürfe sichtbar. Keine Testdaten anlegen.

## 5. Rückweg

- **Vor dem Aufheben der Sperre** (keine neuen Daten): Stack 23 wieder auf altes Image `f232483…` und Originalvolumes setzen, deployen, die private `stack.env` entsprechend zurücksetzen, Sperre aufheben. Keine SQL-Rückmigration.
- **Nach dem Aufheben der Sperre:** Neue Online-Eingaben gingen bei Rückkehr auf die Originalvolumes verloren, deshalb nur nach Betreiberentscheidung. Vorher Sperre setzen und eine Sicherung des neuen Stands erstellen (Schritte 0.8, 1, 2 gegen den neuen Stand).
- **Aufbewahrung:** Originalvolumes und altes Image bleiben bis zur ausdrücklichen Betreiberfreigabe erhalten. Kein `docker volume prune`, kein `docker image prune`.
- **Projektlabel:** Nach der Umschaltung tragen die Produktionsvolumes das Projektlabel des Klons. `clone.env` deshalb nach erfolgreicher Umschaltung löschen und **nie** wieder `compose down --volumes` damit ausführen.

## 6. Aufräumen und Dokumentation (Codex)

- **Klartext löschen:** Geöffnete Sicherungsordner auf VM und Windows sowie `clone.env` enthalten `stack.env` (MFA-Schlüssel, DB- und SMTP-Kennwort) und den Dump im Klartext. Nach Abschluss löschen; nur das verschlüsselte `.snbackup` bleibt.
- **Protokoll** `docs/entwicklung/online-produktivupdate-schema7.md` nach Muster des 15.10. mit:
  - Run-ID, Config-ID, Archivhashes (ohne Geheimnisse)
  - Ergebnis des Fingerabdruckvergleichs
  - Uhrzeiten von Sperre und Umschaltung
  - Status des Rückwegs
- **Status:** `status.md` „Aktuell“ und README-Statustabelle ersetzen (Produktiv: Zielcommit, Schema 7). Issue #54 aktualisieren; das Schema-8-Folgeupdate bleibt offen.

## Anhang A: Datenfingerabdruck

Der Fingerabdruck enthält nur Zählwerte und Hashes, keine Inhalte; nur privat speichern.

```sh
set -eu
# compose = docker compose --env-file <env> -f deploy/compose.yaml
sql() { compose exec -T postgres psql -v ON_ERROR_STOP=1 -U shownight -d shownight -Atc "$1"; }
fingerprint() {
  for t in $(sql "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"); do
    case "$t" in sessions|challenges|invitations) continue ;; esac
    printf '%s %s\n' "$t" "$(sql "SELECT count(*)||' '||md5(coalesce(string_agg(x::text, E'\n' ORDER BY x::text),'')) FROM public.\"$t\" x")"
  done
  sql "SELECT sequencename||' '||coalesce(last_value::text,'null') FROM pg_sequences WHERE schemaname='public' ORDER BY 1"
  compose run --rm --no-deps --entrypoint sh app -c \
    'cd /data/media && find . -type f -exec sha256sum {} + | sort | sha256sum'
}
```

- **Ausgenommene Tabellen:** `sessions`, `challenges` und `invitations`, weil der Worker abgelaufene Einträge zeitgesteuert löscht. Neue Einträge schließt die Sperre aus.
- **Fehlerfall:** Bricht eine Abfrage ab, etwa wegen der 1-GB-Grenze von `string_agg` bei sehr großen Tabellen, endet die Funktion mit Fehler. Dann den Vergleich für diese Tabelle mit Hash je Zeile und `sum` durchführen, aber nicht überspringen.

## Spätere Erweiterung auf Schema 8

Ticketvorbereitung (#49), Server stoppen (#51) und Softwareupdates (#52) folgen in einem eigenen Fenster mit gleichem Ablauf. Abweichungen:
- Ausgangsschema 7
- Rehearsal-Workflow auf 7 → 8
- neue Medienablage `software-updates/`, für die `deploy/restore.sh` aus #52 nötig ist
- kein Veröffentlichen eines Softwareupdates im selben Schritt

## Offene Punkte

- Betreiberfreigabe für Zielcommit, Image und Wartungsfenster
- `result.json` und Artefakte von Lauf `38759884920` prüfen, Image auf der VM laden und Schichten vergleichen
- tatsächliche Übereinstimmung der Compose-Config-Hashes und Mounts (0.8)
- konkrete NPM-Sperrvariante am realen Proxy-Host
- Werkzeuge, Platz und Checkout auf der VM (0.6, 0.7)
