# ShowNight-System

Modulares Veranstaltungssystem für die Jungschützen ShowNight und weitere Veranstaltungsformen.

**Projektstatus:** Planung. Die Dokumentation beschreibt den Zielumfang; sie bestätigt keine bereits implementierte oder abgenommene Software.

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

Entwicklungsarbeit erfolgt künftig über Arbeitsbranches und Pull Requests. Die initiale Dokumentationsablage und diese Planungsaktualisierung liegen auf main. Es wurde noch keine Software implementiert.

## Geplante Onlineadresse

**https://eventmanagement.jungschuetzen-flueren.de** (D014). Die Adresse ist festgelegt; eine bereits erfolgte Bereitstellung ist damit nicht bestätigt. [Domain und E-Mail-Konfiguration](docs/entwicklung/domain-email.md).

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
