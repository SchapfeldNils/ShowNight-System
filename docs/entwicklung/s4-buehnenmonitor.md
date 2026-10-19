# Live-Bühnenmonitor (L1, Issue #41)

19\. Oktober 2026 · [Issue #41](https://github.com/SchapfeldNils/ShowNight-System/issues/41) · Strang C (Claude 1), Prüfung Codex 2 · baut auf dem Showablauf Paket 1 ([#56](https://github.com/SchapfeldNils/ShowNight-System/pull/56), [s4-showablauf.md](s4-showablauf.md)) auf. Grundlage D024 und P5, vom Betreiber in #41 bestätigt ([Kommentar 6268617272](https://github.com/SchapfeldNils/ShowNight-System/issues/41#issuecomment-6268617272)). Status: **Entwurf-PR, nicht gemergt, nicht abgenommen.**

Der Bühnenmonitor ist eine Vollbildseite des lokalen Servers für einen Rechner oder ein Tablet am Bühnenmonitor. Er zeigt ausschließlich Timer und Regiehinweise (F20). Bedienen dürfen Admins sowie die Rollen `live` und `technik`, wie GO (D021/D024). Keine Ausgabe über den nativen Renderer, kein Ton, keine Geräteaktion.

## Bedienung

**Regieansicht** (lokale Weboberfläche, Abschnitt Showablauf → Bühnenmonitor):

- Show wählen und **Timer laden**. Vorgabe ist der Timerentwurf der Show aus dem aktiven Datenstand (Countdown oder Laufzeit mit Dauer, Warnschwelle, Farben, Überziehung). Ohne Entwurf gelten sichtbar gekennzeichnete Standardwerte. Alternativ Countdown mit eigener Dauer oder **Zieluhrzeit** (nächstes Auftreten der Uhrzeit nach Serverzeit, höchstens 24 Stunden).
- Ein geladener Timer wird nur nach Rückfrage ersetzt („Timer ersetzen“).
- **Start**, **Pause**, **Fortsetzen**, **Zurücksetzen**, Korrektur um ±30/±60 Sekunden, **Timer ausblenden**. Eine Zieluhrzeit läuft sofort und unabhängig; Pause und Zurücksetzen sind dort gesperrt, eine Korrektur verschiebt die Zieluhrzeit.
- **Hinweis**: Freitext oder Schnelltext, neben dem Timer oder anstelle des Timers, optionaler Ablauf in Sekunden. Der Hinweistext des Entwurfs wird beim Wählen der Show vorbelegt. Ohne Ablauf bleibt der Hinweis bis zum bewussten Ausblenden. Der Ablauf ist unabhängig von einer Timerpause.
- **Monitorseite öffnen** öffnet `#/monitor/<Veranstaltung>` in einem neuen Fenster (lokale Anmeldung erforderlich).
- **Anzeige-Links für Tablets**: Bezeichnung und Gültigkeit (12 Stunden, 2 Tage, 7 Tage oder bis zum Widerruf) wählen, Link erstellen. Der Link wird nur einmal angezeigt. Aktive Links sind mit Ersteller und Ablauf gelistet und können widerrufen werden.

**Monitorseite** (`#/monitor/<Veranstaltung>` angemeldet oder `#/anzeige/<Token>` über Anzeige-Link): große Timerziffern in Normal-, Warn- und Überziehungsfarbe, Hinweis neben oder anstelle des Timers, Schaltfläche **Vollbild**, Bildschirm wach halten über die Wake-Lock-Schnittstelle, wo der Browser sie anbietet. Fehlt die Verbindung länger als 3 Sekunden, erscheint oben eine kompakte Meldung „Verbindung unterbrochen · letzter Stand HH:MM:SS“; der Timer zählt mit dem letzten Stand weiter, die Seite verbindet sich selbstständig neu. Ein widerrufener oder abgelaufener Link trennt die Anzeige beim nächsten Abruf (spätestens nach etwa einer Sekunde) und zeigt nur noch die Meldung.

## Vertrag

- **Paketversion 3** (`packages/contracts/src/index.ts`, `transfer.ts`): optionale Szenen und Timerentwürfe `timers: [{showId, revision, preset}]`. Der Export (`POST /api/v1/events/:id/packages`) wählt 3, sobald Timerentwürfe der Veranstaltung existieren (Migration 007), sonst wie bisher 2 mit Szenen bzw. 1. Version 1 und 2 bleiben unverändert gültig; Timerentwürfe in Version 1/2 und Version 3 ohne Timer werden abgewiesen. Ein lokaler Server älterer Version nimmt Version-3-Pakete nicht an.
- **Livebefehle** (`POST /api/local/live/commands`, Envelope wie GO mit `commandId`, Idempotenz und gespeicherten Ablehnungen): `timer.load {showId, durationSeconds?, targetAt?}`, `timer.start`, `timer.pause`, `timer.resume`, `timer.reset`, `timer.adjust {deltaSeconds ±1…3600}`, `timer.clear`, `hint.show {text, layout, expirySeconds|null}`, `hint.hide`. Statt `runId`/`expectedLiveRevision` tragen sie `expectedMonitorRevision`.
- **Eigene Monitorrevision je Veranstaltung** (Umsetzungsdetail): Timer und Hinweise gehören zum Abend, nicht zu einem Durchlauf. Mit der Liverevision eines Durchlaufs würde ein Timerbefehl ein gleichzeitiges GO der anderen Regie als Revisionskonflikt abweisen. Konkurrierende Timerbefehle derselben Revision: genau einer gilt, der andere erhält `MONITOR_REVISION` mit letzter Aktion und Bearbeiter.
- **Zeit**: Die Uhr des lokalen Servers ist maßgeblich. Gespeichert werden Wert, Anker (Serverzeit) und Modus; Anzeigen messen den Versatz zur Serverzeit (halbe Antwortzeit) und zählen mit `performance.now()` weiter. Die Rechnung ist dieselbe wie in der persönlichen Probe (`apps/web/src/timer-preview.ts`).
- **Lesen**: `GET /api/local/live/:eventId` enthält zusätzlich `monitor` und `serverTime`. `GET /api/local/monitor/:eventId` (angemeldet, Veranstaltungszugang) und `GET /api/local/monitor-display` (Kopfzeile `X-Monitor-Link`) liefern nur `{protocolVersion, simulated, serverTime, revision, timer, hint}`; ein abgelaufener Hinweis wird nicht ausgeliefert.
- **Anzeige-Links** (P5): `GET/POST /api/local/live/:eventId/monitor-links` (`{label, validHours|null}`), `POST …/monitor-links/:id/revoke`, nur mit Bedienrecht. Token 32 Zufallsbytes (base64url), gespeichert nur als SHA-256-Hash. Der Token steht im URL-Fragment und wird nur als Kopfzeile gesendet, nie als Pfad oder Abfrage. Gültig nur für Anfragen aus Loopback oder privaten IPv4-Netzen, nur für die Monitorabfrage; keine Sitzung, keine Befehle, keine anderen Daten. Höchstens 20 aktive Links je Veranstaltung. Erstellen und Widerruf erscheinen im Verlauf (ohne Token).
- **Speicher**: `live.sqlite` Version 3 mit `live_monitors` (Revision, Timer, Hinweis, letzte Aktion je Veranstaltung) und `live_monitor_links`. Ältere Dateien werden ergänzt, neuere Versionen abgewiesen. Ein Neustart verliert den Zustand nicht; ein laufender Timer zählt nach Serverzeit weiter.

## Prüfungen

- `tests/live-monitor.test.ts` (in `pnpm test`): Paketvertrag Version 1–3, Rechte, Zeitrechnung (Start/Pause/Fortsetzen/Korrektur/Überziehung/Reset), Laufzeit nie unter null, Zieluhrzeit, Hinweisablauf trotz Timerpause, konkurrierender Timerstart genau einmal, commandId-Wiederholung, GO-Revision unberührt, Neustart mit gespeichertem Zustand, Anzeige-Link (Hash, Widerruf, Ablauf, fremde Veranstaltung), Netzprüfung.
- `tests/live-engine.test.ts`: Schemaergänzung bis Version 3, neuere Version abgewiesen.
- `tests/timer-integration.ts` (`pnpm test:timers`, PostgreSQL): Export als Version 3 mit Entwurf, Version 1 ohne Entwurf.
- `tests/monitor-browser.ts` (CI S1, Chromium mit synthetischer API): Anzeige nach Serveruhr trotz Uhrversatz von einer Stunde, Weiterzählen, nur GET mit Token in der Kopfzeile, Warn-/Überziehungsfarbe, Hinweis neben/anstelle, Ablauf ohne neuen Abruf, Tabletgröße ohne waagerechtes Scrollen, Ausfallmeldung und Erholung, Widerruf trennt, Regieansicht sendet `expectedMonitorRevision`, Rückfrage vor Ersetzen, Hinweisnutzlast, Link einmalig, keine automatische Wiederholung.

Lokal in der Claude-Umgebung ausgeführt (Node 22): Typprüfung, Build, `live-monitor` 9/9, `live-engine` 10/10, `monitor-browser` 6/6, `server-overview-browser` 9/9. **Nicht lokal ausgeführt:** PostgreSQL-Tests (`pnpm test:timers`), `pnpm test:offline`. Maßgeblich ist die CI. Das sind Software- und Browserprüfungen, keine Bühnen- oder Tabletabnahme.

## Grenzen

- Keine Ausgabe über den nativen Renderer-Ausgang, kein Timer auf Netcup, keine Bindung an Einsätze (L2), kein Pausencountdown mit Sponsorenausgabe (A10 vollständig), keine Tabletausfallmeldung aus dem Quiz (F22), keine Lesebestätigung von Hinweisen.
- Die Serverzeit ist die Wanduhr des Windows-Rechners. Eine Uhrumstellung während eines laufenden Timers verschiebt ihn; nach Neustart zählt er mit der Wanduhr weiter.
- Abruf jede Sekunde statt Push; Widerruf und Änderungen erreichen Anzeigen mit bis zu etwa einer Sekunde Verzögerung.
- Wer einen Anzeige-Link besitzt, kann im lokalen Netz Timer und Hinweise mitlesen, bis er widerrufen ist oder abläuft.
- Gestaltung vorläufig auf Basis der Stage-Timer-Vorbereitung; Lesbarkeit auf dem echten Bühnenmonitor und auf Tablets ist in #46 abzunehmen.
