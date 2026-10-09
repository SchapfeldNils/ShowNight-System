# Entwicklungsauftrag für Codex

Stand: 9. Oktober 2026. Aktuelle Reihenfolge: D013. Bedienregeln: D004–D012.

## Ziel und Umfang
Modulares ShowNight-Veranstaltungssystem gemäß Gesamtkonzept und F01–F50 entwickeln. Erste vollständige Veranstaltungsfreigabe enthält sämtliche vereinbarten Module, Installation, Dokumentation und reale Abnahme. Agile Zwischenstände sind keine fertige Veranstaltungsfassung.

## Jetzt beginnen
**S1: Server für Netcup. Danach S2: Windows-Agenten.** Anschließend S3 lokaler Windows-Server/Medienausgabe und S4 durchgängiger Showablauf.
Die frühere direkte Startbeschreibung „sofort vollständiger Showablauf“ wird durch D013 in diese Reihenfolge eingeordnet. Technische Risikoprototypen bleiben früh vorgesehen.

S1 liefert gemeinsamen API-/Webkern, PostgreSQL, Benutzer/Rechte/MFA, Event/Show/Medienvorbereitung, Konfliktschutz, Paketmanifest, Demo, Health, konfigurierbares Deployment und Sicherung/Wiederherstellung.
S2 liefert Geräteidentität/Paarung, Agentprofile, Diagnose, Fähigkeiten, Heartbeats und sichere Befehle. Reale VDJ-/Daslight-/Vorhörwege prüfen; unbekannte Hardware blockiert nur die entsprechenden realen Nachweise.
S3/S4 führen vollständigen lokalen Offlinebetrieb und eigene Bildausgabe ein. Netcup gibt keine HDMI-/Bühnenbilder aus.

## Arbeitsgrundlage
- [AGENTS.md](../../AGENTS.md): Entwicklung je Branch/PR, keine selbständigen Merges.
- [Datenmodell](datenmodell.md): gemeinsame Entitäten, Felder und Zustände als technischer Startentwurf.
- [Schnittstellen](schnittstellen.md): Transport, Auth, CRUD, Befehle, Ereignisse, Agenten und Pakete.
- [Abnahmeplan](abnahmeplan.md): S1/S2/L-Prüfungen mit erwarteten Ergebnissen.
- [Arbeitspakete](arbeitspakete.md): Reihenfolge und Umfang.
- [Startprompt](codex-startprompt.md): direkt nutzbarer Codex-Auftrag.

Architektur bleibt Ausgangsbasis: React/TypeScript, Fastify/Node.js, Online-PostgreSQL und lokales SQLite, getrennte Windows-Medienkomponente. Reversible technische Details begründet anpassen, grundlegende Produkt-/Architekturänderungen abstimmen.
Nur kostenlose zusätzliche Komponenten; deutsche UI, bestehende ShowNight-Originalgestaltung soweit vorhanden. Simulation deutlich markieren; keine behauptete reale Synchronität ohne Messung.

## Definition of Done
Nutzbarer Ablauf, passende Prüfungen, nachvollziehbare Start-/Installationsanleitung, aktualisierte Dokumentation und bekannte Grenzen. Tatsächlich getestete Plattformen und technische Rückmeldungen benennen. Fehlender Netcup-Zugang bedeutet kein Deploymentnachweis; fehlende Windows-Hardware bedeutet keine Geräteabnahme.
Status im Zuge der Implementierung in docs/entwicklung/status.md führen. Vorhandene F-/A-Kennungen erhalten und Tests zuordnen.


## Vorhandener Reverse Proxy – D015
Am 9. Oktober 2026 wurde bestätigt: Ein Nginx-Reverse-Proxy ist bereits vorhanden. Diesen für eventmanagement.jungschuetzen-flueren.de verwenden; keinen zusätzlichen Reverse-Proxy-Container oder zweite TLS-Verwaltung als Voraussetzung installieren.
Für die vorgeschlagene Compose-Bereitstellung verbleiben Anwendung, PostgreSQL und Hintergrundworker. Fachmodule bleiben im modularen Anwendungskern, statt je einen eigenen Container zu erhalten. Diese Containeraufteilung ist ein technischer Startvorschlag.
Offen: Läuft Nginx direkt auf der Ziel-VM, in einem Container oder auf einem separaten Rechner? Anschluss an die App passend dazu konfigurieren. Loopback-Publishing funktioniert nur bei Nginx auf demselben Host; bei Container-Nginx gemeinsame Netzwerkverbindung oder ein passend abgesichertes erreichbares Ziel wählen. Datenbank nicht öffentlich bereitstellen.
Codex soll eine einbindbare VHost-/Location-Vorlage und Integrationsanleitung liefern. Vorhandene Konfigurationen, Domains und Zertifikate erhalten; WebSockets, Uploadgrößen, Timeouts und vertrauenswürdige Proxyheader anhand des tatsächlichen Aufbaus prüfen. Die bloße Existenz von Nginx bestätigt keine fertige TLS-/Domain-Konfiguration für das neue System.
