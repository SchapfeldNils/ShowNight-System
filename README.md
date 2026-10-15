# ShowNight-System

Modulares Veranstaltungssystem für die Jungschützen ShowNight und weitere Veranstaltungsformen: Onlinevorbereitung im Browser, Windows-Agenten für die Techniknotebooks und ein lokaler Offline-Betrieb mit eigener Bildausgabe für den Veranstaltungsabend.

**Online:** <https://eventmanagement.jungschuetzen-flueren.de> (D014)

## Aktueller Stand – 15. Oktober 2026

| Bereich | Stand |
| --- | --- |
| Online-Server (Netcup) | **In Betrieb** mit Runtime `f232483`, Datenbankschema 6 ([PR #38](https://github.com/SchapfeldNils/ShowNight-System/pull/38) gemergt, Produktivupdate laut [PR #39](https://github.com/SchapfeldNils/ShowNight-System/pull/39) durchgeführt). |
| Veranstaltungen, Shows, Teams/Rechte, Medien, Inhaltspakete | Vorbereitungsabläufe online nutzbar. |
| Konto, Abmelden, Passwort ändern, Passwort per E-Mail zurücksetzen | Online nutzbar. Mailversand aktiv, SMTP-Anmeldung geprüft; echte Zustellung wartet noch auf die persönliche Adressbestätigung. |
| Stage Timer (F20/A10) | Teilgrundlage „Timer und Hinweise vorbereiten“ in [PR #42](https://github.com/SchapfeldNils/ShowNight-System/pull/42), **nicht gemergt**. Live-Bühnenanzeige offen. |
| Ticketshop (F38–F43/A24–A27) | **Offen**, [Issue #43](https://github.com/SchapfeldNils/ShowNight-System/issues/43). |
| Windows-Agent (S2) | Code in `main`. Lesende VirtualDJ-Diagnose real bestätigt; Steuerung, Daslight, Controller offen ([#46](https://github.com/SchapfeldNils/ShowNight-System/issues/46)). |
| Lokaler Server, LAN, Renderer, Szenen (S3) | Code in `main`, als Software geprüft. Setup 0.3.8 lokal installiert. Keine Hardware-, HDMI-, Ton- oder Showabnahme ([#46](https://github.com/SchapfeldNils/ShowNight-System/issues/46)); Showablauf mit GO offen ([#45](https://github.com/SchapfeldNils/ShowNight-System/issues/45)). |
| Regelmäßige Sicherung | Verschlüsselte Sicherung und Restore als Software vorhanden; regelmäßiger Betrieb mit unabhängigem Ziel offen ([Issue #3](https://github.com/SchapfeldNils/ShowNight-System/issues/3)). |

Software-, CI- und Browserprüfungen ersetzen keine Abnahme mit echter Bühnentechnik. Eine Veranstaltungsfreigabe gibt es noch nicht.

Details und Nachweise: [Entwicklungsstatus](docs/entwicklung/status.md) · [Offene Arbeit](docs/entwicklung/issue-arbeitsliste.md) · [Bedienablauf online](docs/entwicklung/online-bedienablauf.md) · [Produktivupdate Schema 6](docs/entwicklung/online-produktivupdate.md) · [Frühere Statusmeldungen](docs/entwicklung/historie.md)

## Entwicklung starten

Node 24 und die im Lockfile festgelegte pnpm-Version verwenden. React/TypeScript, Fastify/TypeScript, PostgreSQL und ein separater Worker liegen gemeinsam im Repository (`apps/`, `packages/`).

```sh
pnpm install --frozen-lockfile
pnpm local:setup
pnpm local:db
# In weiterem Terminal: db:migrate, persönlicher admin:bootstrap, demo:seed,
# build und dev; separater Worker mit pnpm worker.
pnpm typecheck && pnpm test && pnpm build
```

Vollständige Anleitung: [S1-Start](docs/entwicklung/s1-start.md). Keine Produktivvariablen für lokale Tests verwenden.

MFA ist für Admin/Leitung verpflichtend, es gibt keine Standardkennwörter. Demo und Gerätediagnose sind als Simulation gekennzeichnet; die Mailwarteschlange arbeitet lokal standardmäßig im Testmodus. Originale ShowNight-Designquellen fehlen, die Oberfläche ist vorläufig.

Weitere Betriebsdokumente: [Container/Portainer/Nginx](docs/entwicklung/deployment.md) · [API](docs/entwicklung/s1-api.md) · [Domain und E-Mail](docs/entwicklung/domain-email.md) · [Lizenzen](docs/entwicklung/lizenzen.md) · [Entwicklungsprotokoll](docs/entwicklung/protokoll.md)

## Dokumentation

**Fachlich**
- [Gesamtkonzept 2.0](docs/gesamtkonzept.md)
- [Funktions- und Betriebsspezifikation](docs/anforderungen.md) – 50 Anforderungsbereiche (F01–F50) und 30 Abnahmefälle (A01–A30)
- [Technische Architektur](docs/architektur.md)
- [Entscheidungsprotokoll](docs/planung/entscheidungen.md) · [Offene Punkte](docs/planung/offene-punkte.md)
- [Bestätigter Bedienablauf: Veranstaltung anlegen](docs/planung/veranstaltung-anlegen.md)
- [Word-Export des Gesamtkonzepts 2.0](docs/exports/Gesamtkonzept-2.0.docx) (fester Stand vom 9. Oktober 2026, wird nicht automatisch aktualisiert)

**Entwicklung**
- [Arbeitsregeln für Codex](AGENTS.md) · [Entwicklungsauftrag](docs/entwicklung/auftrag.md) · [Startprompt](docs/entwicklung/codex-startprompt.md)
- [Arbeitspakete](docs/entwicklung/arbeitspakete.md) · [Datenmodell](docs/entwicklung/datenmodell.md) · [Schnittstellen](docs/entwicklung/schnittstellen.md)
- [Abnahmeplan](docs/entwicklung/abnahmeplan.md) · [Bestätigte Entwicklungsentscheidungen](docs/planung/entwicklungsuebergabe.md)

## Verbindliche Grundlagen

- Eigene Bildausgabe ohne OBS; Virtual DJ und Daslight bleiben auf den Techniknotebooks.
- Onlinevorbereitung und vollständig vorbereiteter lokaler Windows-Betrieb ohne Internet.
- Gleichberechtigte Regieplätze ohne Übernahmeverfahren.
- Manuelles GO als Standard; ausdrücklich konfigurierte Sequenzen möglich.
- Modulare Organisation, Shows, Szenen, Spiele, Moderationskarten, Bühnenbau, Ticketshop und Einlass.
- Einfache Einnahmen- und Ausgabenverwaltung.
- Nur kostenlose zusätzliche Komponenten; vorhandene Lizenzen, Hosting und Hardware bleiben separate Voraussetzungen.

Reihenfolge laut D013: Netcup-Server → Windows-Agenten → lokaler Server/Medienausgabe → durchgängiger Showablauf. Seit 15. Oktober 2026 gilt zusätzlich die Betreiberpriorität: zuerst sichtbare, benutzbare Online-Funktionen (Stage-Timer-Vorbereitung, Ticketshop), danach weitere lokale Entwicklung.

## Arbeitsweise

Markdown unter `docs/` ist die führende Dokumentation. Neue Fragen werden zunächst als **offen** festgehalten; erst ausdrücklich bestätigte Antworten werden Entscheidungen. F- und A-Kennungen bleiben erhalten. Entwicklung erfolgt über Arbeitsbranches und Pull Requests, ohne automatischen Merge.

**Hinweis:** Das Repository ist öffentlich. Keine Zugangsdaten, echten Käuferdaten, Ticketcodes oder internen personenbezogenen Listen einchecken.
