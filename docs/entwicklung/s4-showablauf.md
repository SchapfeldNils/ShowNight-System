# Showablauf – Paket 1: Liveaktivierung, Durchläufe und GO als Simulation (Issue #45)

Stand: 15\. Oktober 2026. Status: als Pull Request in Umsetzung, nicht gemergt, nicht produktiv und nicht auf Windows-Hardware abgenommen.

Grundlage: [live-regie.md](../planung/live-regie.md) (D007), [liveaktivierung.md](../planung/liveaktivierung.md) (D009), [durchlaeufe.md](../planung/durchlaeufe.md) (D010–D012), Schnittstellen „Livebefehle“ in [schnittstellen.md](schnittstellen.md) und D021 in [entscheidungen.md](../planung/entscheidungen.md). D021 ist vom Betreiber im Claude-Chat gewählt; die direkte Bestätigung in Issue #45 steht noch aus.

Verantwortlich: Claude (Umsetzung), Review: Codex.

## Was GO in diesem Paket bewirkt

GO ändert **nur den serverseitigen Ablaufzustand des lokalen Servers** und schreibt ihn in den Verlauf. Es gibt keinen Renderer-Take und keine Bild-, Ton-, Licht-, Geräte- oder HDMI-Ausgabe. Die Oberfläche zeigt das dauerhaft als „SIMULATION“; die Publikumsausgabe erscheint als „Publikumsausgabe (Simulation)“.

## Umfang

| Bereich | Umsetzung |
|---|---|
| Liveaktivierung (D009) | Technik oder Admin aktiviert ein importiertes Paket der Veranstaltung. Vorher werden alle Dateien vollständig geprüft; danach werden Sitzung, Sperre und Rolle erneut gelesen. Der Wechsel erfolgt atomar oder gar nicht, geschützt durch die Standrevision. Die Rückkehr zum vorherigen Stand geht in einem Schritt. |
| Laufende Durchläufe beim Standwechsel | Die laufende (simulierte) Ausgabe bleibt eingefroren. Ist der nächste Einsatz geändert, entfernt oder verschoben, wird GO gesperrt, bis er bewusst neu vorbereitet ist. Fehlt eine Show eines offenen Durchlaufs im neuen Stand, wird der ganze Wechsel abgelehnt. Neue Einsätze hinter der Position gehören zum weiteren Ablauf. |
| Durchläufe (D010–D012) | Probe oder Aufführung je Show anlegen. Der Start bereitet nur den ersten (oder einen gewählten) Einsatz vor und löst ihn nicht aus. Es läuft höchstens eine Aufführung je Veranstaltung. „Beenden“ schließt den Verlauf ohne pauschalen Stopp; die Ausgabe bleibt, weil noch keine Abschlussaktion festgelegt ist. Nach dem letzten Einsatz erscheint „Ablaufende“. |
| Gleichberechtigte Regie (D007) | Keine Übernahme. Es gibt ein gemeinsames GO-Ziel („Nächster Einsatz – gemeinsam“, erste gültige Änderung gewinnt) und eine persönliche „Meine Vorschau“, die nichts auslöst. `cue.go` trägt `expectedLiveRevision` und `expectedNextCueId`. Bei einem konkurrierenden GO auf denselben Stand wird genau eines ausgeführt; das andere bekommt eine Ablehnung mit dem Namen des Auslösers. Nach einer Zieländerung ist GO in der Oberfläche eine Sekunde gesperrt. |
| Befehle | Ein einheitlicher Umschlag mit `protocolVersion`, `commandId`, `eventId` und `type`. Die gleiche `commandId` liefert das gespeicherte Ergebnis zurück, eine andere Nutzlast unter derselben `commandId` wird abgelehnt (`COMMAND_REUSED`). Auch Ablehnungen werden gespeichert, damit eine späte Wiederholung nicht auf geändertem Zustand wirkt. Die Oberfläche wiederholt Befehle nie automatisch. |
| Zustand und Wiederverbindung | Ereignisse tragen eine fortlaufende Sequenz und eine Epoch je Serverstart. Bei neuer Epoch, Lücke oder mehr als 200 fehlenden Ereignissen lädt der Client einen Snapshot. Eingriffe der anderen Regie werden mit Person, Aktion und Uhrzeit angezeigt. |
| Speicherung | `live.sqlite` neben der Paketablage (WAL, `synchronous=FULL`). Durchläufe sind an Paket-ID und Manifest-Hash gebunden; ein veränderter Datenstand wird erkannt (`STAND_CHANGED`). |

## Rechte (D021)

| Aktion | Berechtigt |
|---|---|
| Ansehen | alle Personen mit Zugang zur Veranstaltung |
| Durchlauf anlegen, starten, beenden; nächsten Einsatz vorbereiten; GO | globale Admins, Rollen `live` und `technik` |
| Datenstand aktivieren, zum vorherigen Stand zurückkehren | globale Admins, Rolle `technik` |

Leitung oder Inhaltsrechte allein genügen nicht.

## Schnittstellen

- `GET /api/local/live/:eventId`: Snapshot mit Epoch, Sequenz, Rechten, Stand, Durchläufen und den letzten 30 Verlaufseinträgen
- `GET /api/local/live/:eventId/events?epoch=&after=`: fehlende Ereignisse oder `snapshotRequired`
- `POST /api/local/live/commands`: `stand.activate`, `stand.rollback`, `run.create`, `run.start`, `cue.prepare`, `cue.go`, `run.end` (Vertrag `packages/contracts/src/live.ts`). Es gelten die bestehenden lokalen Sitzungs-, CSRF- und Origin-Prüfungen.

## Nicht enthalten

Folgende Punkte sind ausdrücklich nicht umgesetzt: Renderer-Take und Geräte-, Ton- oder HDMI-Ausgabe, Übergänge/Überblendung, Direkt-, Overlay- und Unterbrechungsbefehle, Timer, Controller (APC/Stream Deck), Wechselprofile, Push per WebSocket (Paket 1 fragt einmal pro Sekunde ab), Abschlussaktionen beim Beenden, Online-Server.

## Prüfungen

- `tests/live-engine.test.ts` (Teil von `pnpm test`):
  - Rechte nach D021
  - Aktivierung nur vollständig geprüfter Pakete, mit Standrevision
  - Start ohne GO; gemeinsames Ziel
  - konkurrierendes GO genau einmal; `commandId`-Wiederholung und -Missbrauch
  - Ablaufende
  - Standwechsel mit eingefrorener Ausgabe, GO-Sperre und Rückkehr, ohne Teilaktivierung
  - Sequenz, neue Epoch nach Neustart, dauerhafter Zustand
- `tests/offline-integration.ts` (`pnpm test:offline`): echter lokaler HTTPS-Server mit Snapshot, Aktivierung, Ereignissen, Validierung, CSRF, Rechten für Mitglied, Leitung und Admin, fremder Veranstaltung

In der Claude-Umgebung liefen die Engine-Tests (5/5) mit Node 22 und einer Zod-Kopie sowie eine Chromium-Probe der Regieansicht gegen eine nachgebaute API. Maßgeblich sind die CI-Läufe am PR-Commit.

## Bekannte Grenzen

- Simulation: Kein Nachweis über Bühnenausgabe, Latenz oder Verhalten unter Last. Die Hardware- und Showabnahme gehört zu #46.
- Die gleichzeitige Bedienung zweier Regieplätze ist nur als Software geprüft (zwei Befehle auf denselben Stand), nicht mit echten Geräten im Saalnetz.
- Ereignisabfrage per Polling (1 s); Push folgt mit der Rendereranbindung.
