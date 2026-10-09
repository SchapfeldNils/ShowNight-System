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
