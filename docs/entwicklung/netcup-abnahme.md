# S1-Zielabnahme auf Netcup

Stand: 9. Oktober 2026, nach ausdrücklicher Betreiberfreigabe zur Ausführung des vorbereiteten Freischaltungsplans. S1 ist ein Entwicklungszwischenstand für Onlinevorbereitung, keine Veranstaltungs-/Hardwarefreigabe.

## Bereitgestellter Stand

System: https://eventmanagement.jungschuetzen-flueren.de. Neuer Portainer-Stack `shownight` mit App, PostgreSQL und Worker; Ubuntu 24.04.3 LTS auf ARM64, Docker 29.1.5, Compose 5.0.1, Portainer 2.45.2. Vorhandener Nginx Proxy Manager 2.13.6 übernimmt HTTPS und WebSockets. Die bisherigen sechs Proxy-Hosts blieben im API-Vergleich unverändert. Keine VM-/Proxy-Neuinstallation.

Ausgeliefertes Image: `shownight:94ca03ed9ed7207b9cb71ac039e081da9ee12996-arm64` aus [Actions 37963484169](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/37963484169). Archiv-SHA256 vor und nach SSH-Übertragung identisch. Docker 29 mit containerd meldet den OCI-Manifestdigest als Image-ID, der CI-Export den Konfigurationsdigest; deshalb zusätzlich Konfigurations-SHA256 und sämtliche RootFS-Layer mit dem CI-Archiv verglichen: identisch. Kein Neubau auf dem Zielserver.

Migration 1 und einmaliger Admin-Bootstrap ausgeführt. Eigene DB-/Medienvolumes und Backendnetz; nur App zusätzlich im bestehenden Proxy-Netz. Keine App-, Worker- oder Datenbankports am Host veröffentlicht. Private Konfiguration auf der VM administrativ lesbar, Kontowerte und Schlüssel außerhalb des öffentlichen Repositorys.

A/AAAA der Systemsubdomain zeigten bei der Freischaltung bereits auf die bestätigte VM. Es wurde daher keine DNS-Zone erneut gespeichert. Netcup-Ansicht und öffentlicher Resolver bestätigen beide Zieladressen; öffentlicher IPv6-Zugriff funktioniert. Einzelne rekursive Resolver können das vorherige Webhostingziel mit TTL 86400 zwischenspeichern. Zieltests mit expliziter IP verwendeten weiterhin den richtigen HTTPS-Hostnamen und vollständige Zertifikatsprüfung. Chrome öffnet die tatsächliche ShowNight-Seite bereits über die normale Systemadresse.

Neuer Proxy-Host ausschließlich für die Systemsubdomain, bestehendes Proxyprodukt und dessen Zertifikatsverwaltung. Produktspezifische Advanced-Vorlage, interne Dockerauflösung, WebSockets und Force SSL aktiviert. Let's-Encrypt-Zertifikat ausgestellt, bei der Prüfung bis 7. Januar 2027 gültig. `nginx -t` erfolgreich. Portainer, Proxyverwaltung und bestehende Nextcloud-Seite nach Anschluss weiter erreichbar.

## Tatsächlich geprüfte Zielabläufe

| Prüfung | Ergebnis |
| --- | --- |
| HTTPS über IPv4 und IPv6, vollständige Zertifikatsprüfung | 200; kein Abschalten der TLS-Prüfung |
| HTTP-Aufruf | 301 auf dieselbe HTTPS-Systemadresse |
| Health/Readiness | 200, Schema 1 |
| Unangemeldeter Zugriff auf Event-API | 401 |
| Erstkonto-Anmeldung | Kennwort akzeptiert; MFA-Einrichtung erforderlich, noch keine Sitzung |
| Separates synthetisches Abnahmekonto | MFA eingerichtet und Anmeldung geprüft; Secure/HttpOnly/SameSite=Strict |
| Eventname, unabhängige Show, eigene Eventkopie | Erfolgreich über HTTPS-API |
| Veraltete Revision und falscher CSRF-Token | 409 bzw. 403 |
| Synthetisches PNG, Workeranalyse, geschützter Download | ready; Original-SHA256 identisch |
| Gepinntes Paketmanifest | valid; Liveaktivierung weiterhin nicht unterstützt |
| WSS durch vorhandenen Proxy | Authentifizierter Snapshot empfangen |
| App-/Worker-Neustart | Danach ready; bestehende Daten/Sitzungen bleiben persistent |
| Eigene Datenbank gestoppt und erneut gestartet | Readiness 503, anschließend wieder 200 |
| Dokumentiertes Backupskript am Ziel | DB-Dump und Medienarchiv mit SHA256; nur eigene App/Worker angehalten und wieder gestartet |
| Restore in separate neue leere Volumes | Alle 18 Tabellen vor Anmeldung identisch; Migration geprüft |
| Anmeldung und Medien im Restore | MFA/Recovery, Eventrechte, Manifest und Datei-SHA256 erfolgreich |
| Externe Kopie auf Betreiberrechner | Dump/Medien und beide SHA256 geprüft, außerhalb OneDrive/Git, Windows-ACL Benutzer/SYSTEM |
| SMTP im tatsächlichen VM-Worker | Verbindung, TLS und Authentifizierung erfolgreich; keine Nachricht versendet |

Abnahme nutzte ausschließlich synthetische Daten und ein eigenes temporäres Konto. Danach diese Daten und dieses Konto gezielt entfernt; Teststack und dessen eigene Restorevolumes entfernt. Bereinigter Startstand: ein Erstkonto, keine Veranstaltungen oder Medien. Zusätzliche externe Sicherung dieses Startstands mit geprüften SHA256 erstellt.

SMTP-Werte sind privat im Worker-/Stack-Environment hinterlegt. `MAIL_MODE=test`, `MAIL_DELIVERY_ENABLED=false`, `DEMO_ENABLED=false`. Keine Fachmail, Absenderfreigabe, SMTP-Annahme einer Nachricht oder Zustellung behauptet.

## Erstzugang und Sicherung

Betreiber erhält den Erstzugang ausschließlich über die bereits vorbereitete private lokale Datei `%LOCALAPPDATA%/ShowNight/secrets/server-admin.env`. Erstkonto `admin`; beim ersten Login Authenticator einrichten und Recoverycodes sicher aufbewahren. Das Betreiberkonto wurde nicht automatisch mit einem agentenseitig verwalteten zweiten Faktor eingerichtet.

Externe erste Sicherungen: `%LOCALAPPDATA%/ShowNight/backups/s1-target-20261009` mit synthetischen Abnahmedaten und `initial-clean-20261009` mit bereinigtem Startstand. DB-Dump und Medienarchiv enthalten keine SMTP-/MFA-Konfigurationsschlüssel. Diese sind separat in `private-config.dpapi` mit Windows-DPAPI/CurrentUser verschlüsselt. Entschlüsselung benötigt das zugehörige Windows-Benutzerprofil; das ist keine unabhängige portable Schlüsselkopie. Bei Restore den ursprünglichen MFA-Schlüssel verwenden, siehe [Deployment](deployment.md).

Regelmäßige Sicherungen, Aufbewahrung und ein vom Betreiberrechner unabhängiges verschlüsseltes Sicherungs-/Schlüsselziel sind noch festzulegen. Es ist kein automatischer externer Backupjob eingerichtet. Das ist eine offene Betriebsaufgabe; der erste externe Backup-/Restore-Nachweis wurde tatsächlich erbracht.

## Grenzen

Zielprüfung ergänzt die native AMD64-/ARM64-CI und den lokalen Chromium-Ablauf. PNG-Upload wurde am Proxy geprüft; ein Upload nahe 100 MiB, Lasttests und kompletter VM-Neustart wurden hier nicht ausgeführt. S1-Editor-/Offline-/Renderer-/Fachmodulgrenzen und fehlende Originalgestaltung bleiben in [Status](status.md) erhalten. Keine Geräte-/Bühnen-/Synchronitätsprüfung aus dem Netcup-Betrieb ableiten.
