# Deployment: Portainer und vorhandener Nginx

Stand: 9. Oktober 2026. Bestätigte Umgebung D015/D016.

## Bekannt
- Ziel ist eine Netcup-VM mit Docker.
- Portainer wird auf dieser VM bereits verwendet.
- Vorhandener Nginx-Reverse-Proxy läuft als Docker-Container auf derselben VM.
- Vom Betreiber genannte Proxy-Adresse: https://proxy.familie-schapfeld.de.
- Öffentliche Systemadresse: https://eventmanagement.jungschuetzen-flueren.de.
- Keine bereits konfigurierte Route, Zertifikatsausstellung oder Installation des Systems behaupten.

Die genannte Proxy-Adresse identifiziert die vorhandene Proxy-Umgebung. Sie bestätigt nicht, dass Nginx Proxy Manager oder eine bestimmte andere Verwaltungsoberfläche eingesetzt wird. Tatsächliches Image/Produkt vor einer konkreten Anleitung prüfen. Nicht auf externe Adresse als Anwendungs-Upstream verweisen und keine Anmeldung annehmen.

## Vorgeschlagener Stack
| Dienst | Netzwerk | Veröffentlichung |
| --- | --- | --- |
| app | vorhandenes Proxy-Netz plus eigenes Backend-Netz | HTTP-Dienst nur innerhalb Docker; bestehender Proxy übernimmt öffentlichen Zugang |
| postgres | eigenes Backend-Netz | Keine öffentlichen Datenbankports |
| worker | eigenes Backend-Netz | Keine eingehenden öffentlichen Ports; ausgehender SMTP-Zugang erforderlich |
| vorhandener nginx | vorhandenes Proxy-Netz | Bereits bestehende öffentliche Ports/TLS-Verwaltung weiterverwenden |

app und worker nutzen denselben versionierten Anwendungscode, aber verschiedene Startbefehle. Worker und App teilen benötigten Medienspeicher; Datenbank hat eigenes dauerhaftes Volume. Worker blockiert keine HTTP-Anfragen durch Medienanalyse.

Das Backend-Netz ist ein getrenntes Docker-Bridge-Netz ohne veröffentlichte Dienstports. Nicht ungeprüft internal:true setzen, wenn dies den benötigten ausgehenden Mail-/Downloadverkehr verhindert. Sichern umfasst Datenbank und Medien; separate Container sind keine Sicherung.

## Proxy-Anschluss
1. Tatsächlichen Proxy-Container, dessen Docker-Netzwerke und Zertifikatsverwaltung erfassen.
2. Bereits verwendetes geeignetes Netzwerk als external network in den Systemstack aufnehmen; dessen tatsächlichen Namen über Variable PROXY_NETWORK_NAME konfigurieren.
3. Nur app zusätzlich an dieses Proxy-Netz anschließen. Eindeutigen Alias, beispielsweise shownight-app, verwenden; Kollisionen mit vorhandenen Stacks prüfen.
4. Nginx-Routing für eventmanagement.jungschuetzen-flueren.de auf diesen Alias und den tatsächlich konfigurierten internen HTTP-Port zeigen lassen.
5. TLS, WebSocket-Upgrade, Uploadgrenzen, passende Timeouts und vertrauenswürdige Proxyheader testen.
6. Bestehende Proxy-Dienste, Domains und Zertifikate unverändert erhalten. Kein zweiter Proxy-Stack für diese Anwendung.

localhost innerhalb des Nginx-Containers bezeichnet den Nginx-Container, nicht den app-Container. Der interne app-Dienst ist ein Docker-Netzwerkziel, nicht proxy.familie-schapfeld.de.

## Portainer-Bereitstellung durch Codex vorbereiten
- Versionierte Compose-Datei für einen Stack auf einer einzelnen Docker-VM.
- Keine Behauptung, dass Kubernetes/Swarm verwendet wird. Deploymentmodus vor echter Installation bestätigen.
- Dokumentierte Portainer-Stack-Anleitung und alternativ Docker-Compose-Start, soweit tatsächlich getestet.
- Reproduzierbare Image-Builds, konkrete Image-Versionen/Tags statt unkontrolliert latest.
- Keine build-only Vorlage, die nur durch unbelegte Portainer-Buildannahmen funktionieren soll. Beschreiben, wie Images gebaut und auf der VM bereitgestellt werden; Registryzugriff als Deploymentparameter behandeln.
- Beispieldatei ausschließlich mit Platzhaltern; reale Kennwörter über Server-/Stackkonfiguration.
- PUBLIC_BASE_URL, PROXY_NETWORK_NAME, DB-/Medienvolumes, interne Ports und SMTP-Werte dokumentieren.
- Health/Readiness, kontrollierte Migrationen, Restart-/Backup-/Restore-/Updateanleitung und sichere Rückkehr zum vorherigen Stand.
- Nicht bestehende Portainer-/Proxy-Stacks löschen oder rekonfigurieren, um das neue System zu starten.

## Noch zu erfassen
Proxy-Image/Produkt und Containername; tatsächlicher Proxy-Netzwerkname; Portainer-Deploymentmodus; VM-System/Ressourcen; Domain-DNS und TLS-Zustand; Zugriff und Sicherungsziel; SMTP-Postfachdaten.
Fehlende Angaben sind kein Blocker für Code und konfigurierbare Stackvorlagen. Reale Bereitstellung bleibt ein gesondert nachzuweisender Schritt.

## Abnahme
Vorhandene Webseiten nach Anschluss weiter erreichbar; Systemadresse per HTTPS erreichbar; Login/API/Uploads/WebSockets funktionieren; app/postgres/worker nach Neustart mit persistenten Daten; keine öffentliche Datenbank; SMTP nur nach konfiguriertem Test; Backup/Restore in separater Testumgebung. Ergebnisse im Abnahmeplan S1 dokumentieren.

## Implementierte S1-Dateien und Installationsablauf

### Tatsächliche Bestandsaufnahme vom 9. Oktober 2026

Betreiber hat den Portainer-Zielendpoint bestätigt. Authentifiziert geprüft: Ubuntu 24.04.3 LTS, ARM64/aarch64, 6 CPUs, 8 GiB RAM, 512 GiB Datenträger; Docker 29.1.5, Compose 5.0.1, Portainer 2.45.2 und **Nginx Proxy Manager 2.13.6**. Das bestehende Proxy-Netz und die genaue Proxy-IP sind ermittelt; private Operator-Konfiguration enthält die tatsächlichen Werte. Bestehende Nginx-Konfiguration besteht `nginx -t`. SSH-Schlüssel im bestehenden Administrationskonto ergänzt, bestehende Schlüssel erhalten und gesichert; strikte Hostschlüsselprüfung und SSH-Anmeldung erfolgreich. Keine VM-/Proxy-Neuinstallation und kein ShowNight-Stack gestartet.

A/AAAA der geplanten Systemdomain existieren bereits, zeigen jedoch auf ein anderes Ziel als die bestätigte VM. Im bestehenden Proxy Manager gibt es noch keinen Host für die Systemdomain. DNS-Zielkorrektur, eigener Proxy-Host/HTTPS und externe Sicherung sind Freischaltungsschritte; vorhandene MX-/andere Domains erhalten. Konkrete Zugangsdaten, private Schlüssel und vollständiges Infrastrukturinventar bleiben außerhalb Git.

### Geprüfte Images aus GitHub Actions

[Lauf 37963484169](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/37963484169) zu Codecommit `94ca03ed9ed7207b9cb71ac039e081da9ee12996` hat native AMD64- und ARM64-Prüfungen vollständig bestanden. Artefakte `shownight-image-arm64` und `shownight-image-amd64` enthalten gzip-komprimiertes Dockerarchiv und `image-info.txt` mit Image-ID/Architektur/FFmpegstand. Sie bleiben sieben Tage verfügbar. Für die tatsächlich geprüfte VM **ARM64** verwenden; keine AMD64-Datei auf ARM als geprüft ausgeben.

Artefakt entpacken, `image-info.txt` mit gewünschtem Commit/Architektur vergleichen, Archiv über eigenen autorisierten Weg übertragen und laden:

```sh
docker load -i shownight-arm64.tar.gz
```

Der importierte Tag lautet `shownight:94ca03ed9ed7207b9cb71ac039e081da9ee12996-arm64`. Bei späterem Workflow statt dieses Tags den tatsächlichen geprüften Artefakttag verwenden. App, Worker und Datenbank sowie Migration/Backup/Restore wurden im CI-Stack getestet; dies ersetzt den Zielnachweis S1-12 nicht.

### Besonderheit des bestätigten Nginx Proxy Managers

Neuen Proxy Host nur für die Systemdomain vorbereiten: Scheme `http`, Forward Hostname `shownight-app`, Port `3000`, WebSockets aktiv. `deploy/nginx-proxy-manager-advanced.conf.template` in **Advanced** dieses Hosts verwenden, Alias gegebenenfalls angleichen. Die Vorlage definiert einen eigenen Root-Locationblock; NPM 2.13.6 erkennt ihn und lässt seinen Standardblock weg. Die generische `nginx-location.conf.template` samt http-map nicht ungeprüft in dieses Feld kopieren. Zertifikat und Force SSL ausschließlich über den vorhandenen Manager. Keine globale Proxydatei ändern und keine fremden Proxy-Hosts ersetzen. Nach Speichern Nginxprüfung und reale HTTP/HTTPS/WSS-/Uploadprüfung durchführen.

Verhalten anhand [NPM-Konfigurationslogik 2.13.6](https://github.com/NginxProxyManager/nginx-proxy-manager/blob/v2.13.6/backend/internal/nginx.js) und [offizieller Anleitung](https://nginxproxymanager.com/advanced-config/) überprüft; neue Route bisher nicht angewendet.

Beide gelieferten Vorlagen am vorhandenen NPM-Nginx mit separaten temporären Konfigurationen erfolgreich durch `nginx -t` geprüft. Dies prüft Syntax und Direktiven im tatsächlichen Proxyprodukt; HTTPS, WebSocketroute und Uploadpfad zur neuen App sind erst nach freigegebener Bereitstellung am Ziel nachweisbar.

`Dockerfile`, `deploy/compose.yaml`, `deploy/.env.production.example`, `deploy/nginx-location.conf.template`, `deploy/backup.sh` und `deploy/restore.sh` sind jetzt vorhanden. Die Vorlage startet **app, postgres, worker**, keinen Proxy. Tatsächliche Prüfergebnisse stehen in [status.md](status.md); ein erfolgreicher CI-Containerstart ist kein Netcup-Nachweis. Lokaler Entwicklungsstart: [s1-start.md](s1-start.md).

### 1. Vorhandene Umgebung erfassen

Mit autorisiertem Zielzugang ausschließlich zunächst lesen: `docker ps`, `docker network ls`, `docker inspect PROXY_CONTAINER` und die tatsächliche Nginx-Konfiguration/Mounts. `PROXY_CONTAINER` durch den erhobenen Namen ersetzen. OS, CPU-Architektur, Datenträger/Backupziel, Docker/Compose-Version, Portainer-Modus, Proxy-Image/Produkt, externen Netzwerknamen und Zertifikatsverwaltung festhalten. `proxy.familie-schapfeld.de` ist die Betreiberadresse, kein Upstream und kein Beleg für Nginx Proxy Manager.

Keine bestehenden Stacks, Netzwerke, Webseiten oder Zertifikate löschen. Nicht ungeprüft ein neues Netzwerk erzeugen; vorhandenes passendes Proxy-Netz über `PROXY_NETWORK_NAME` verwenden. Swarm/Kubernetes sind mit der Einzel-VM-Compose-Datei nicht zugesagt. Keine VM-Neuinstallation.

### 2. Versioniertes Image bauen und bereitstellen

Auf einem autorisierten Linux-Docker-Buildsystem oder der VM, passend zur erhobenen Architektur:

```sh
git checkout COMMIT_SHA
docker build -t shownight:COMMIT_SHA .
docker image inspect shownight:COMMIT_SHA
```

`COMMIT_SHA` immer durch den geprüften tatsächlichen Commit ersetzen. Dockerfile verwendet Node 24.19.0, Produktionspakete aus Lockfile, FFmpeg/FFprobe aus Debian und unprivilegierten node-Benutzer. Image-ID, Basisimage-Digest und `ffmpeg -version`/`ffprobe -version` zum ausgelieferten Image protokollieren; Debian-Paketquellen bleiben zeitabhängig. Kein Anspruch auf bitidentischen Neubau ohne eingefrorene OS-Paketquellen. Das fertig geprüfte Image unverändert nach Tag/Hash ausliefern.

Falls auf anderer Maschine gebaut, ohne Registry:

```sh
docker save -o shownight-COMMIT_SHA.tar shownight:COMMIT_SHA
# Über den autorisierten eigenen Übertragungsweg auf die VM übertragen.
docker load -i shownight-COMMIT_SHA.tar
```

Alternativ in eine **vorher festgelegte** erreichbare Registry pushen und deren versionierten Tag/Digest in `SHOWNIGHT_IMAGE` setzen. Registry/Authentifizierung ist Deploymentparameter. Es wurde hier kein Image in eine Registry veröffentlicht. Portainer muss dieses Image auf dem tatsächlich verwendeten Endpoint sehen können; keine automatische Portainer-Buildfunktion voraussetzen.

### 3. Private Stackkonfiguration und Migration

`deploy/.env.production.example` in einen ausschließlich administrativ lesbaren Pfad außerhalb des öffentlichen Checkout kopieren. Beispielpfad `/opt/shownight/private/stack.env`, Modus 600. Eigene zufällige 64-stellige Hexwerte für POSTGRES_PASSWORD und MFA_ENCRYPTION_KEY erzeugen, niemals die Platzhalter übernehmen. Hexwert für DB vermeidet URL-Encodingprobleme im Compose-Connectionstring. MFA-Schlüssel verschlüsselt getrennt sichern und bei Wiederherstellung unverändert verwenden. Tatsächliche volumen-/aliasbezogene Namenskollisionen vorher prüfen.

```sh
docker compose --env-file /opt/shownight/private/stack.env -f deploy/compose.yaml config --quiet
docker compose --env-file /opt/shownight/private/stack.env -f deploy/compose.yaml up -d --wait postgres
docker compose --env-file /opt/shownight/private/stack.env -f deploy/compose.yaml run --rm app node dist/api/cli.js migrate
```

Kein Appstart mit automatischer Produktionsmigration. Einmaligen Bootstrap über **eigene private Environmentdatei** mit BOOTSTRAP_LOGIN, BOOTSTRAP_NAME und persönlichem BOOTSTRAP_PASSWORD durchführen, mindestens zwölf Zeichen. Nicht als Commandline-Literal oder in Logs/PRs:

```sh
docker compose --env-file /opt/shownight/private/stack.env -f deploy/compose.yaml run --rm --env-from-file /opt/shownight/private/bootstrap.env app node dist/api/cli.js bootstrap
```

`--env-from-file` benötigt eine Compose-Version, die diese Option unterstützt. Falls vorhandenem Compose diese fehlt: `docker run --rm --env-file` mit **beiden** privaten Dateien, korrektem Backend-Netz und dem versionierten Image verwenden; die bootstrap.env muss dort auch DATABASE_URL und MFA_ENCRYPTION_KEY bereitstellen. Alternativ BOOTSTRAP-Variablen im privaten Operator-Shell-Environment exportieren und `compose run --rm -e BOOTSTRAP_LOGIN -e BOOTSTRAP_NAME -e BOOTSTRAP_PASSWORD app ...` verwenden; Werte nicht in Shellhistory eintragen. Danach private Bootstrapdatei aus aktivem Einsatz nehmen und Umgebungsvariablen entfernen. Kein Standardkennwort, kein Bootstrap-Endpunkt.

```sh
docker compose --env-file /opt/shownight/private/stack.env -f deploy/compose.yaml up -d --wait app worker
docker compose --env-file /opt/shownight/private/stack.env -f deploy/compose.yaml exec -T app node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>console.log(r.status))"
```

App auf Backend plus externem Proxy-Netz, DB/Worker nur Backend. Keine veröffentlichten Datenbank-/Appports. Worker kann ausgehend SMTP erreichen. Medienvolume durch App beschreibbar, Worker liest Originale. DB-/Medienvolumes explizit benennen und persistent lassen.

### 4. Portainer auf dem vorhandenen Endpoint

Unter **Stacks → Add stack** einen neuen eindeutigen Systemstack auswählen; `deploy/compose.yaml` als Web-Editor-Inhalt oder Git-Compose-Pfad verwenden. Die erhobenen Environmentwerte privat im Stack hinterlegen; keine Secrets in Git oder Screenshot. SHOWNIGHT_IMAGE auf den zuvor auf diesen Endpoint geladenen Image-Tag/Digest setzen, PROXY_NETWORK_NAME auf das bestehende Netz. Erst Migration/Bootstrap wie oben mit identischer Stack-/Volume-/Netzkonfiguration durchführen. Beim Deploy vorhandene Volumes verwenden und fremde Stacks erhalten. Portainer-UI/Version und Endpointmodus am Ziel prüfen; die Schritte behaupten keine bereits erfolgte Anmeldung.

### 5. Bestehenden Nginx ergänzen

DNS für `eventmanagement.jungschuetzen-flueren.de` auf erhobenes VM-Ziel; Zertifikat über **bestehendes** Verfahren erstellen/einbinden. Die vorhandene HTTPS-VHost-Konfiguration ergänzen, Locationvorlage einbinden. map-Zeile einmal im vorhandenen `http`-Kontext; Upstreamalias `shownight-app:3000` oder den konfigurierten Alias verwenden. Dockerresolver 127.0.0.11 erlaubt Wiederauflösung nach App-Neustart. `localhost` im Proxycontainer wäre der Proxy selbst.

Vor Reload Kopie der **betroffenen** Proxydatei sichern, `nginx -t` im vorhandenen Container prüfen, danach nur geprüfte Konfiguration reloaden. TLS-Pfade/Verfahren nicht durch erfundene Defaults ersetzen. Bei vorgeschalteter weiterer Proxyebene Headervertrauen anhand dieser tatsächlichen Kette anpassen. Vorlage überschreibt an der Edge X-Forwarded-For mit remote_addr; App vertraut nur explizit konfigurierten Proxy-IP/CIDR, kein pauschales `trustProxy=true`.

Browserlogin/MFA, Session-Cookie Secure, Upload nahe Größenlimit, API-Konflikt und WSS-Snapshots prüfen. Nginx body-Limit 101 MiB berücksichtigt Multipart-Overhead beim API-Limit 100 MiB; abweichende Limits auf beiden Seiten abstimmen. Timeouts, WebSocket-Upgrade, VM-/Service-Neustart, andere bestehende Domains und nicht veröffentlichte DB-Ports real prüfen. Protokoll S1-12 ausfüllen.

### 6. Sicherung und isolierte Wiederherstellung

Wartungsfenster ankündigen. Backupskript stoppt **nur diesen Stack** (app/worker), dumpft DB und archiviert Medien, erstellt SHA256SUMS und startet app/worker bei Verlassen erneut. Ein neuer, noch nicht vorhandener Sicherungsordner ist erforderlich:

```sh
sh deploy/backup.sh /opt/shownight/private/stack.env /EXTERNAL_BACKUP_TARGET/shownight-2026-10-09
```

Externes Ziel ist offen; eine zusätzliche Datei auf derselben VM allein ist kein externer Schutz. Private Konfiguration/MFA-Schlüssel getrennt verschlüsselt sichern. Keine automatisierte externe Sicherungszustellung behaupten.

Wiederherstellung ausschließlich in **separaten Teststack mit neuen leeren DB-/Medienvolumes**; eigener Stackname, eindeutiger Proxyalias, Original-MFA-Schlüssel und MAIL_DELIVERY_ENABLED=false. Vorher SHA256SUMS prüfen. Skript verweigert nicht leere Datenbank/Medien und ungewöhnliche Archivpfade:

```sh
RESTORE_CONFIRM=EMPTY_ISOLATED_STACK sh deploy/restore.sh /opt/shownight/private/restore.env /EXTERNAL_BACKUP_TARGET/shownight-2026-10-09
```

Migration prüfen, Testinstanz starten, Benutzer/MFA/Eventrechte/Shows/Dateireferenzen und alle Manifestprüfsummen vergleichen. Zuletzt erst bewusst über realen Umschaltplan produktive Wiederherstellung vornehmen. Die Skripte überschreiben keine bestehende Produktivdatenbank und entfernen keine Volumes.

### 7. Update und Rückkehr

Vor Update Backup und isolierten Restore nachweisen. Geprüften neuen Image-Tag setzen, Dienste des eigenen Stacks stoppen, Migration bewusst ausführen, app/worker starten und Readiness/Browserfluss prüfen. In S1 existiert nur Migration 1; keine unbelegte Downmigration. Bei unverändertem Schema früheres Image starten; nach zukünftigen inkompatiblen Migrationen isolierte DB-/Medienwiederherstellung und bewusstes Umschalten statt blindem Image-Rollback. Während späteren Liveveranstaltungen keine automatischen Updates.
