# ShowNight-System

Aktueller weiterer Baustein S3-02: [lokaler HTTPS-Server mit Offlinekonten und MFA](docs/entwicklung/s3-lokalserver.md), [Arbeitspaket #8](https://github.com/SchapfeldNils/ShowNight-System/issues/8), Branch codex/s3-local-server. Verschlüsselter, signierter Anmeldestand für einen vorbereiteten Rechner, lesende Paketansicht, lokale Konten und Sperren. Windows-ZIP ohne npm beim Anwender. Softwareprüfungen sind dokumentiert; LAN, Onlineabgleich, Renderer und Livebetrieb bleiben offen. Keine Produktivinstallation; Netcup bleibt beim geprüften S2-Stand. Der folgende S3-01-Absatz beschreibt den eigenständigen vorherigen Teilstand.

S3-01 auf `codex/s3-local-packages`: [Vorbereitungsstände mit Medien herunterladen und lokal in SQLite prüfen](docs/entwicklung/s3-paketablage.md), [Arbeitspaket #6](https://github.com/SchapfeldNils/ShowNight-System/issues/6), [Entwurfs-PR #7](https://github.com/SchapfeldNils/ShowNight-System/pull/7). Portable Windows-Paketablage ohne Internetzugriff; Import aktiviert keine Ausgabe. Noch kein lokaler Mehrbenutzerserver, Offlinekonto-/MFA-Verfahren oder Renderer. Dieser S3-Stand ist noch nicht produktiv installiert.

S2-Agentprototyp auf eigenem Arbeitsbranch: [Windows-Agent starten, paaren und diagnostizieren](docs/entwicklung/s2-agent.md). Online-Server am 10. Oktober 2026 nach Betreiberfreigabe auf S2/Schema 2 aktualisiert; DJ-Rechner gepaart und echte WSS-Diagnose bestätigt. Agent 0.2.1 meldet laufende VirtualDJ-Leseprüfungen mit frischem Serverstatus; echter Authfehler und Erholung bei bestehender Verbindung geprüft. [Aktualisierung und Nachweise](docs/entwicklung/s2-virtualdj-update.md). Steuerungs-/Daslight-/Controller-/FLX4-Abnahmen bleiben offen. Keine Bühnensteuerung oder Veranstaltungsfreigabe.

Modulares Veranstaltungssystem für die Jungschützen ShowNight und weitere Veranstaltungsformen.

**Projektstatus:** S1-Onlinevorbereitung und S2-Agentgrundlage auf Arbeitsbranches, Netcup bereitgestellt und geprüft. Vollständige Veranstaltungs-/Hardwarefreigabe bleibt ausstehend. [Aktuelle Prüfergebnisse und Grenzen](docs/entwicklung/status.md), [Netcup-Zielabnahme](docs/entwicklung/netcup-abnahme.md), [S2-Update und Sicherungsnachweise](docs/entwicklung/s2-netcup-update.md).

## Software starten

React/TypeScript, Fastify/TypeScript, PostgreSQL und separater Worker liegen gemeinsam im Repository. [Lokaler Start und Bedienablauf](docs/entwicklung/s1-start.md), [Container/Portainer/Nginx-Installation](docs/entwicklung/deployment.md), [implementierte API](docs/entwicklung/s1-api.md), [Lizenzen](docs/entwicklung/lizenzen.md), [Entwicklungsprotokoll](docs/entwicklung/protokoll.md).

```sh
pnpm install --frozen-lockfile
pnpm local:setup
pnpm local:db
# In weiterem Terminal: db:migrate, persönlicher admin:bootstrap, demo:seed,
# build und dev; separater Worker mit pnpm worker. Details im Startdokument.
```

MFA ist für Admin/Leitung verpflichtend. Keine Standardkennwörter. Demo und Gerätediagnose sind als Simulation gekennzeichnet. Mailwarteschlange arbeitet standardmäßig im Testmodus. Originale ShowNight-Designquellen fehlen; Oberfläche ist vorläufig.

## Dokumentation

- [Gesamtkonzept 2.0](docs/gesamtkonzept.md)
- [Funktions- und Betriebsspezifikation](docs/anforderungen.md) – 50 Anforderungsbereiche und 30 Abnahmefälle
- [Technische Architektur](docs/architektur.md)
- [Offene Entscheidungen und technische Prüfungen](docs/planung/offene-punkte.md)
- [Bestätigter Bedienablauf: Veranstaltung anlegen](docs/planung/veranstaltung-anlegen.md)
- [Entscheidungsprotokoll](docs/planung/entscheidungen.md)
- [Word-Export des Gesamtkonzepts 2.0](docs/exports/Gesamtkonzept-2.0.docx)

## Entwicklung vorbereiten

- [Entwicklungsauftrag für Codex](docs/entwicklung/auftrag.md)
- [Arbeitsregeln](AGENTS.md)
- [Arbeitspakete](docs/entwicklung/arbeitspakete.md)
- [Datenmodell mit technischem Startentwurf](docs/entwicklung/datenmodell.md)
- [Schnittstellen und Zustandsprotokoll](docs/entwicklung/schnittstellen.md)
- [Abnahmeplan für Server, Agenten und ersten Showablauf](docs/entwicklung/abnahmeplan.md)
- [Startprompt für Codex](docs/entwicklung/codex-startprompt.md)
- [Bestätigte Entwicklungsentscheidungen](docs/planung/entwicklungsuebergabe.md)

Entwicklungsarbeit erfolgt über Arbeitsbranches und Pull Requests. S1: `feat/s1-online-server`, [GitHub-Arbeitspaket #1](https://github.com/SchapfeldNils/ShowNight-System/issues/1). Kein automatischer Merge. Die weiterführenden Fachkapitel beschreiben weiterhin den Zielumfang.

## Onlineadresse

**https://eventmanagement.jungschuetzen-flueren.de** (D014). S1 nach ausdrücklicher Betreiberfreigabe am 9. Oktober 2026 bereitgestellt, HTTPS/IPv4/IPv6/MFA/Upload/WSS und Backup/isolierter Restore geprüft. Mailadapter konfiguriert, Versand weiterhin ausgeschaltet. [Zielabnahme](docs/entwicklung/netcup-abnahme.md), [Domain und E-Mail-Konfiguration](docs/entwicklung/domain-email.md).

## Aktuelle Startreihenfolge

**Netcup-fähiger Server → Windows-Agenten → lokaler Server/Medienausgabe → durchgängiger Showablauf.** D013 präzisiert die frühere Reihenfolge. Die Entwicklungsübergabe liegt vor; tatsächlich implementierte und getestete Funktionen werden erst während Entwicklung dokumentiert. Fehlende Zielzugänge sind offene Deploymentnachweise.

## Verbindliche Grundlagen

- Eigene Bildausgabe ohne OBS; Virtual DJ und Daslight bleiben auf den Techniknotebooks.
- Onlinevorbereitung und vollständig vorbereiteter lokaler Windows-Betrieb ohne Internet.
- Gleichberechtigte Regieplätze ohne Übernahmeverfahren.
- Manuelles GO als Standard; ausdrücklich konfigurierte Sequenzen möglich.
- Modulare Organisation, Shows, Szenen, Spiele, Moderationskarten, Bühnenbau, Ticketshop und Einlass.
- Einfache Einnahmen- und Ausgabenverwaltung.
- Nur kostenlose zusätzliche Komponenten; vorhandene Lizenzen, Hosting und Hardware bleiben separate Voraussetzungen.

## Planung in diesem Repository

Markdown-Dateien unter `docs/` sind ab diesem Stand die führende Planungsdokumentation. Der Word-Export ist ein fester Stand vom 9. Oktober 2026 und wird bei Änderungen nicht automatisch aktualisiert.

Neue Fragen und Vorschläge werden zunächst als **offen** festgehalten. Erst ausdrücklich bestätigte Antworten werden als Entscheidungen in das Protokoll und die betroffenen Fachkapitel übernommen. Ungeprüfte technische Ansätze bleiben als Nachweise offen. Die bisherigen F- und A-Kennungen bleiben erhalten.

Änderungen erhalten nachvollziehbare Git-Commits. GitHub Issues können später für einzelne Aufgaben genutzt werden; Fragen und Entscheidungen bleiben auch in den Dokumenten auffindbar.

**Hinweis:** Das Repository ist öffentlich. Keine Zugangsdaten, echten Käuferdaten, Ticketcodes oder internen personenbezogenen Listen einchecken.
