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
