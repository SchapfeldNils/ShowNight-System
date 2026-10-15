# Lokalen Server geordnet stoppen – Issue #32

15\. Oktober 2026 · [Issue #32](https://github.com/SchapfeldNils/ShowNight-System/issues/32) · Umsetzung Claude, Review Codex. Setupquellen 0.3.11.

## Bedienung

- **Server stoppen** im Startmenü (`Server-Stoppen.cmd`) oder die gleichnamige Schaltfläche in der Serveroberfläche beendet den lokalen Server dieser Installation geordnet. Das ursprüngliche Konsolenfenster muss dafür nicht im Vordergrund sein. Strg+C im Serverfenster bleibt möglich.
- Rückmeldungen: „Server geordnet beendet“, „Server läuft nicht“ (auch bei veraltetem Laufzustand eines früheren Starts) oder „Stopp nicht bestätigt … Nichts gewaltsam beendet“. Exitcode 0 bei beendet/läuft nicht, 2 bei nicht bestätigtem Stopp.
- **Einrichtungsstatus prüfen** zeigt zusätzlich „Dienst: läuft seit …“ oder „Dienst: gestoppt“. `status-json` enthält `service.state` (`running`, `stopped`, `stale`, `unreadable`).
- Danach ist ein erneuter Start wie gewohnt möglich. Profil, Konten, Schlüssel und Pakete bleiben unverändert.

## Update und Deinstallation

Setup und Deinstallation erkennen weiterhin eigene Prozesse am exakten Pfad von `node.exe` beziehungsweise `renderer\shownight-renderer.exe` im Installationsordner. Läuft ein solcher Prozess:

1. Rückfrage „Server jetzt beenden und fortfahren?“ (bei stiller Installation ohne Rückfrage). „Nein“ bricht ab; der Server läuft unverändert weiter. Damit wird eine laufende Probe oder Veranstaltung nicht ungefragt unterbrochen.
2. Geordneter Stopp über `main.js stop`, danach bis zu 10 Sekunden Warten auf das tatsächliche Ende aller eigenen Prozesse.
3. Erst dann werden Dateien ersetzt beziehungsweise entfernt. Gelingt der Stopp nicht oder gehört der Prozess nicht eindeutig zum lokalen Server dieser Installation (kein passender Laufzustand), wird nichts überschrieben und eine verständliche Meldung angezeigt.

Ein Server, der noch mit Version 0.3.10 oder älter gestartet wurde, besitzt den Steuerkanal nicht. Für dieses eine Update muss er manuell beendet werden.

## Technik

- Beim Start öffnet der Server nach dem HTTPS-Listener einen Steuerkanal ausschließlich auf `127.0.0.1` mit zufälligem Port und schreibt `run-state.json` (PID, Startzeit, Port, zufälliges 256-Bit-Token, Modus, Adresse) atomar in den privaten Datenordner `%LOCALAPPDATA%\ShowNight\local-server` (ACL: aktueller Benutzer und SYSTEM). Scheitert das Schreiben, wird der Kanal wieder geschlossen und der Server beendet.
- Loopback ist von anderen Rechnern nicht erreichbar, auch bei LAN-Einrichtung. Eine zunächst verwendete Windows Named Pipe wurde nach Review ersetzt, weil Node.js dafür weder `PIPE_REJECT_REMOTE_CLIENTS` noch eine eigene Zugriffsliste setzen kann. Gleichzeitige Verbindungen sind auf 8 begrenzt, jede Verbindung auf 3 Sekunden und 512 Byte.
- `stop` liest den Laufzustand, verbindet sich mit dem Port und sendet das Token. Der Server antwortet, schließt Steuerkanal, HTTPS-Server, Renderer und Datenbanken und beendet sich. Nach 8 Sekunden werden verbliebene Verbindungen geschlossen, spätestens nach weiteren 2 Sekunden endet der Prozess. `stop` wartet bis zu 20 Sekunden auf das Ende der PID.
- Es wird nie ein Prozess per PID beendet. Ein fremder Prozess, auch auf Port 3443, kennt weder Port noch Token und bleibt unberührt.
- Der Laufzustand wird nur entfernt, wenn PID, Port und Startzeit noch zum erwarteten Start gehören; ein zwischenzeitlicher neuer Start bleibt sichtbar.

## Prüfungen

- `tests/local-control.test.ts` (Linux und Windows): fehlgeschlagene Veröffentlichung hinterlässt keinen offenen Kanal, ersetzter Laufzustand bleibt erhalten; Start mit echtem Kindprozess, Laufzustand, geordneter Stopp mit Exitcode 0, entfernter Laufzustand, zweiter Stopp „läuft nicht“, erneuter Start; falsches Token beendet nichts; veralteter und unlesbarer Laufzustand; fremder Dienst ohne Laufzustand bleibt unberührt.
- `tests/offline-integration.ts` (Windows-CI): gepacktes `main.js run` mit echtem HTTPS-Listener, `status-json`/`status` zeigen „läuft“, `stop` beendet mit Exitcode 0, Listener ist frei, Status „gestoppt“, zweiter Stopp „läuft nicht“, Konten erhalten, erneuter Start und Stopp.
- `scripts/streaming-installer-test.mjs` (Windows-CI): Startmenüeintrag „Server stoppen“, `stop` ohne Server, Oberfläche mit gesperrter Stopp-Schaltfläche ohne laufenden Server, Update mit einem nicht zuordenbaren Prozess der eigenen Laufzeit wird abgebrochen, der Prozess bleibt unberührt und der Stoppversuch steht im Setup-Log.

## Grenzen

- Die CI-Installerprüfung startet keinen vollständig eingerichteten Server; das Update mit tatsächlich laufendem eigenem Server ist durch Steuerkanal- und Pakettests abgedeckt, nicht durch einen Installerlauf. Die tatsächliche Bedienprüfung auf dem Streaming-Rechner steht aus (#46).
- Einen Live-/Showbetrieb gibt es noch nicht. Der Schutz vor Unterbrechung einer laufenden Probe ist die Rückfrage im Setup; eine automatische Sperre während einer Show folgt mit dem Showablauf (#45) und dem Updateweg (#33).
- Claude konnte Windows nur über die CI prüfen.
