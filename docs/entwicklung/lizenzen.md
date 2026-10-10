# Kostenlose Komponenten und Lizenzen – S1/S2/S3-01

S3-01 verwendet bestehendes Zod (MIT) und SQLite aus der offiziellen Node-Laufzeit. Keine zusätzliche npm-Abhängigkeit. Portable Windows-Paketablage enthält dieselbe SHA256-geprüfte Node-24.19.0-Laufzeit inklusive vollständigem Node-/Drittlizenztext und Zod-Lizenz. Kein FFmpeg-/Rendererbuild in dieser ZIP; dessen Auslieferungs-/Codecprüfung bleibt offen. [Paketablage](s3-paketablage.md).

S2-Agent: direkte Laufzeitabhängigkeit `ws` (MIT) und bereits verwendetes Zod (MIT), installierte Versionen im Lockfile/Inventar. Portable Windows-x64-ZIP enthält den offiziellen Node-24.19.0-Build, dessen vollständigen Lizenztext einschließlich Drittlizenzen sowie ws-/Zod-Lizenzdateien. Hersteller-ZIP gegen festgelegten SHA256 geprüft; keine kostenpflichtige zusätzliche Komponente. Vorhandene VirtualDJ-Pro-/Daslight-/Hardwarevoraussetzungen sind getrennt und noch kein Praxisnachweis. Einzelheiten: [Agentanleitung](s2-agent.md).

Stand: 9. Oktober 2026. Aufgelöste npm-Versionen stehen in `pnpm-lock.yaml`. `pnpm licenses:inventory` erfasst installierte Paketmetadaten in [dependency-licenses.json](dependency-licenses.json); das Actions-Artefakt enthält den tatsächlichen Linux-Stand. Betriebssystemabhängige native Pakete unterscheiden sich. Die Bestandsliste ersetzt nicht Lizenztexte/Notice-Dateien im ausgelieferten Image.

| Komponente | Lizenz / Einsatz |
| --- | --- |
| React, Fastify und Plugins, Zod, pg, Vite, esbuild, tsx | MIT; kostenlose Kern-/Buildkomponenten |
| Node.js | MIT mit Drittanbieterhinweisen des offiziellen Node-Images |
| TypeScript, Playwright | Apache-2.0 |
| Nodemailer | MIT-0 |
| PostgreSQL / native Entwicklungsdatenbank | PostgreSQL License; embedded-postgres Wrapper MIT |
| FFmpeg/FFprobe | Container: Debian-Paket mit dessen tatsächlicher LGPL/GPL-Konfiguration; Entwicklung: ffmpeg-static GPL-3.0-or-later, ffprobe-static npm-Metadaten MIT, ausführbare FFprobe-Datei hat separate FFmpeg-Buildlizenz |
| Einige transitive Dateisystempakete | BlueOak-1.0.0; weitere ISC/BSD/0BSD in Bestandsliste |
| parse-cache-control | BSD laut `licenses` und beigelegtem LICENSE; keine fehlende Lizenz als Freigabe interpretieren |

FFmpeg wird als separater Prozess gestartet, nicht in einen proprietären Renderer gelinkt. Für tatsächliche Imageweitergabe Debian-Copyrightdateien unter `/usr/share/doc`, `ffmpeg -version`, `ffprobe -version`, Buildkonfigurationen und Bezugsquellen erhalten. Statische Testbinaries werden nicht in das Produktionsimage kopiert; die Produktionsstufe enthält ausschließlich Produktions-npm-Pakete und das Debian-Medienpaket. Keine gekauften Plugins als Voraussetzung. Vollständiges Auslieferungs-/Codecverzeichnis für die Windows-Fassung folgt mit S2/S3.

Primärquellen: [Node-Releases](https://nodejs.org/en/about/previous-releases), [Fastify](https://github.com/fastify/fastify/blob/main/LICENSE), [Zod](https://github.com/colinhacks/zod/blob/main/LICENSE), [PostgreSQL](https://www.postgresql.org/about/licence/), [FFmpeg-Lizenzierung](https://ffmpeg.org/legal.html), [embedded-postgres](https://github.com/leinelissen/embedded-postgres), [EDB-Binärarchive](https://www.enterprisedb.com/download-postgresql-binaries). Lizenz- und Betriebsannahmen gelten für die genannten Builds, nicht pauschal für sämtliche Erweiterungen. Hosting, Domain, Postfach und vorhandene Virtual-DJ-/Daslight-Lizenzen bleiben externe Voraussetzungen.
