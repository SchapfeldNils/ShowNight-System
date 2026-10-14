# ShowNight-System

## Aktueller Lieferstand

15. Oktober 2026: Ein gemeinsamer Releasebranch `codex/online-visible-release` führt die bisher geprüften Online-, Agenten- und lokalen Entwicklungsstände zusammen. Nutzerpriorität: zuerst eine sichtbare, benutzbare Online-Version, danach weitere lokale Entwicklung. Kein neues Hintergrundpaket vor diesem Lieferpunkt.

Im geprüften gemeinsamen Kandidaten: gut erreichbares **Mein Konto / Abmelden** und eigene **Passwortänderung** einschließlich erneuter Anmeldung und unveränderter MFA. Der integrierte Stand ist unabhängig geprüft; alle vier neuen CI-Workflows einschließlich Schema4→6/Rückkehr und der sichtbaren Browserabläufe sind erfolgreich. Merge geeigneter geprüfter Entwicklungsstände ist durch den aktuellen Nutzerauftrag autorisiert; ein Produktivupdate ist damit noch nicht ausgeführt.

- [Aktueller Stand, Nachweise und Grenzen](docs/entwicklung/status.md)
- [Zusammenführung und Lieferkriterien](docs/entwicklung/online-konsolidierung.md)
- [Bedienablauf der Online-Version](docs/entwicklung/online-bedienablauf.md)
- [Offene Arbeit und nächste sichtbare Lieferungen](docs/entwicklung/issue-arbeitsliste.md)

Veranstaltungen, Shows, Teams/Rechte, Medien und Inhaltspakete haben bereits implementierte Vorbereitungsabläufe. **Ticketshop (F38–F43/A24–A27) und Stage Timer (F20/A10) sind noch nicht vollständig umgesetzt.** Sie bleiben Teil des vereinbarten Gesamtsystems. Bühnenausgabe und Geräte-/Hardwarefreigabe werden nicht durch einen Online-Softwaretest bestätigt. Keine echten Käuferdaten oder Geheimnisse im öffentlichen Repository.

## Entwicklung starten

Node 24 und die im Lockfile festgelegte pnpm-Version verwenden. Tatsächliche Befehle und private Ersteinrichtung: [S1-Start](docs/entwicklung/s1-start.md). `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build`; Datenbank-/Browser-/Agentenprüfungen siehe Paketbefehle und Status. Keine Produktivvariablen für lokale Tests verwenden.

<details>
<summary>Historische Entwicklungsstände und frühere Einzelpakete</summary>

Diese folgenden Angaben bleiben als historische Nachweise erhalten. Sie beschreiben ihre jeweiligen Einzelcommits, nicht automatisch den aktuellen gemeinsamen Kandidaten oder dessen tatsächliche Bereitstellung.

# ShowNight-System

Als Software geprüft: [native Komposition vorbereiteter Paket-v2-Szenen](docs/entwicklung/s3-native-szenen.md), [PR #30](https://github.com/SchapfeldNils/ShowNight-System/pull/30). Text/Rechteck/PNG-/JPEG-Bild als stumme Softwarediagnose, vollständige CI und unabhängiger Review samt Korrekturprüfung bestanden. Setup 0.3.10 mit Renderer bereitgestellt, nicht installiert. Keine Veranstaltungsfreigabe oder Betreiberaktualisierung. Folgende Angaben beschreiben frühere Teilstände.

Aktuelles Korrekturpaket: [lokale Technikrollenvergabe nur durch Admin](docs/entwicklung/s3-offline-kontenrechte.md), F05/F30/A18, Issue #27. Setupquellen 0.3.9; laufende Installationen werden durch die Entwicklung nicht aktualisiert.

S3-08: [lokale Serverübersicht und lesendes Windows-Inventar](docs/entwicklung/s3-serveruebersicht.md), [PR #25](https://github.com/SchapfeldNils/ShowNight-System/pull/25). Windows-Startoberfläche, sichtbare Datenpfade und MFA-geschützte Systemübersicht als Software implementiert; erkannte Geräte bleiben von nutzbarer Ausgabe getrennt. Setupquellen 0.3.8; tatsächlichen CI-/Auslieferungsstand in der Anleitung beachten. Die folgenden Absätze dokumentieren frühere Teilstände.

15. Oktober 2026: [Netcup-Releasekandidat und isolierte Updateprüfung](docs/entwicklung/netcup-release-preflight.md) zu Issue #36 in Arbeit. Vollständige Basis PR #35 plus Worker-Korrektur PR #34; realer Netcup-Bestand lesend bestätigt (ARM64, Schema 4, Mail aus). Rehearsal-CI 38649908680 AMD64/ARM64 und vollständige S1-CI 38649908576 Windows/AMD64/ARM64 erfolgreich. Kein Update/Merge. Frühere Hinweise zur fehlenden Workerintegration unten sind durch diese bewusste Integration im neuen Branch überholt; frühere Nachweise gelten weiterhin nur für ihre exakten Runtimecommits.

15. Oktober 2026: Netcup hat Vorrang. [Sicherungshärtung](docs/entwicklung/netcup-backup-haertung.md) auf eigenem Folgebranch zu PR #22: atomare Archivveröffentlichung und Prüfung der geöffneten Kennwortdatei vor Wartung implementiert, neue Vaultregression 6/6 lokal bestanden, unabhängiger Codereview ohne Befund; S1-CI 38648600570 vollständig erfolgreich auf Windows/AMD64/ARM64 einschließlich echtem verschlüsseltem Containerrestore. Kein produktiver Sicherungsjob/Update. Die getrennte Worker-Korrektur PR #34 ist vollständig geprüft, aber in dieser älteren Basis nicht enthalten. PR #2 ist gemergt und Issue #1 geschlossen; ältere Tabellen unten historisch einordnen.

S3-06: [Szenenentwürfe, Sperren und Paketübertragung](docs/entwicklung/s3-szenenentwuerfe.md) als Software umgesetzt und geprüft, [PR #18](https://github.com/SchapfeldNils/ShowNight-System/pull/18). Setup 0.3.6 mit lesender Szenenansicht und bestehender nativer Einzelmedien-Diagnose bereitgestellt; [Nachweise/Prüfsummen](docs/entwicklung/nachweise/s3-szenenentwuerfe.json). Native Szenenkomposition, vollständiger Editor und Showbetrieb bleiben offen. Kein Merge oder Produktivupdate. Die folgenden Absätze beschreiben frühere Teilstände.

S3-05: [Paketmedien in der nativen Softwarediagnose](docs/entwicklung/s3-paketmedien.md) implementiert und als Software geprüft. Setup 0.3.5 mit direktem Paketimport; [Nachweise und Prüfsummen](docs/entwicklung/nachweise/s3-paketmedien.json), [PR #16](https://github.com/SchapfeldNils/ShowNight-System/pull/16). Vollständige Szenen, Show-GO und Geräteausgabe bleiben offen. Die folgenden Absätze dokumentieren frühere Teilstände.

Streaming-Rechner: [Windows-Setup-Anwendung, Installation und Grenzen](docs/entwicklung/s3-streaming-installer.md). Server-Vorabpaket und Renderer-Diagnosepaket getrennt; tatsächlichen Build-/Prüfstand beachten.

Setup mit nativer Renderer-Grundlage erfolgreich gebaut und geprüft: [Nachweise](docs/entwicklung/nachweise/s3-renderer.json). Softwarediagnose mit synthetischen Assets; tatsächliche HDMI-/Ton-/Streaming-/Showfunktion bleibt offen.

S3-04 auf codex/s3-renderer-foundation: [native Windows-Renderer-Grundlage](docs/entwicklung/s3-renderer.md), [Issue #12](https://github.com/SchapfeldNils/ShowNight-System/issues/12). Separater C++-/GStreamer-/Skia-Prozess, lokaler Steuerkanal und getrennte synthetische Diagnosebilder. Native Windows-Build-/Prüfnachweise werden am PR geführt; kein Hardwarebeleg und kein Produktivupdate. Die folgenden Absätze dokumentieren vorherige Teilstände.

S3-03-Review: [Entwurfs-PR #11](https://github.com/SchapfeldNils/ShowNight-System/pull/11), Runtime `44d19c6`, [aktuelle Windows-/AMD64-/ARM64-Prüfungen und Artefakte](https://github.com/SchapfeldNils/ShowNight-System/pull/11/checks). Kein Merge und kein Produktivupdate.

Aktueller weiterer Baustein S3-03: [gezielte LAN-Einrichtung des lokalen HTTPS-Vorbereitungsservers](docs/entwicklung/s3-lan.md), [Arbeitspaket #10](https://github.com/SchapfeldNils/ShowNight-System/issues/10), Branch `codex/s3-lan-setup`, abhängig von S3-02. Optionale Neueinrichtung auf einer privaten IPv4-Schnittstelle mit passendem Zertifikat und lokaler Diagnose. Loopback bleibt Standard; reale Mehrgeräte-/Internettrennungsabnahme, Renderer und Livebetrieb bleiben offen. Keine automatische Firewall-/Zertifikatsinstallation und kein Netcup-Update. Die folgenden S3-02-/S3-01-Absätze beschreiben die vorherigen Teilstände.

S3-02-Review: [Entwurfs-PR #9](https://github.com/SchapfeldNils/ShowNight-System/pull/9), Runtime 7ab7b8b, [aktuelle Prüfungen und Windows-Artefakte](https://github.com/SchapfeldNils/ShowNight-System/pull/9/checks). Nicht gemergt und nicht auf Netcup installiert.

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

</details>
