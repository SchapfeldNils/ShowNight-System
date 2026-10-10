# Schnittstellen und Zustandsprotokoll – Entwicklungsstart

S3-03 (10. Oktober 2026) ergänzt den nachfolgend dokumentierten S3-02-Loopback-Weg um `init-lan <JSON-Datei>` und `network-check`. Striktes JSON Version 1 mit einer privaten IPv4-Adresse, Grenze 4096 Byte. Neue Profile binden ausdrücklich diese Schnittstelle auf Port 3443, HTTPS-IP-SAN und exakter Origin/Host. Falscher Host: 421; API-Origin/CSRF/MFA/Rechte bleiben unverändert. Diagnose zeigt keine Geheimnisse und prüft keine fremden Geräte. Bestehende Loopback-Profile bleiben lesbar; kein Profilwechsel, neue Netzwerk-/Agent-Autorität oder Live-Protokoll. [Start und offene echte LAN-Abnahme](s3-lan.md).

S2-Prototyp verwendet die tatsächlich implementierten Version-1-Verträge in `packages/contracts/src/agent.ts`. Geräteverwaltung unter `/api/v1/devices` mit bestehenden Admin-/MFA-/CSRF-Regeln, gesonderte native Einmalpaarung `/api/agent/v1/pair`, Bearer-WSS `/api/agent/v1/ws`. Online-Allowlist ausschließlich Diagnose/No-op, keine unten geplanten Liveaktionen. HELLO/WELCOME, 5-Sekunden-Heartbeat, 15-Sekunden-Liveness, Verbindungs-Epoch, Widerruf und dauerhaft deduplizierte Dispatch-ID: [Agentanleitung](s2-agent.md). Ab Agent 0.2.1 optionale aktuelle Fähigkeiten im Heartbeat und begrenzte lokale VirtualDJ-Lesediagnose; Server ergänzt Empfangszeit/Freshness, keine SQL-Migration. [Konkreter Vertrag](s2-virtualdj-diagnose.md). S2 ist noch kein Nachweis der folgenden lokalen Live- und Hardwareverträge.

Stand: 9. Oktober 2026. Grundlage D003–D013, Architektur und Datenmodell.
Status: implementierbarer technischer Startentwurf. Fachliche Schutzregeln sind verbindlich; Route-/Feldnamen können begründet angepasst werden. Codex erzeugt daraus versionierte Code-Schemas, OpenAPI und Protokolltests.

S1 besitzt jetzt einen implementierten Teilvertrag: [s1-api.md](s1-api.md). Gemeinsame Zod-Schemas in `packages/contracts/src/index.ts`, Kern-OpenAPI unter authentifiziertem `/api/v1/openapi.json`. Direkter begrenzter Multipartupload und ersetzbare Vorbereitungs-WebSocket-Snapshots sind technische S1-Vereinfachungen. Die unten beschriebenen Live-/Agent-/Aktivierungsverträge sind noch Ziel für S2–S4; sie werden online nicht als funktionierende Ausgänge angeboten. Prüfergebnisse: [status.md](status.md).

## Systeme und Aufgaben

| Verbindung                 | Transport                                              | Aufgabe                                                                |
| -------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Browser ↔ Netcup-API      | HTTPS, authentifizierte WebSockets                     | Onlinevorbereitung, Rechte, Dateien, Entwürfe und Status               |
| Browser ↔ lokaler Server  | Lokales HTTPS/WSS nach Einrichtung                     | Zuständiger Livezustand, GO, Timer, Quiz und aktivierte Inhalte        |
| Agent → gewählter Server   | Vom Agenten aufgebaute authentifizierte WSS-Verbindung | Registrierung, Fähigkeiten, Heartbeat, Befehle und Status              |
| Lokaler Server ↔ Renderer | Authentifiziertes lokales IPC                          | Medienvorbereitung, Bild-/Tonaktionen und reale Statusmeldungen        |
| Renderer → Browser/Agent   | WebRTC; Signalisierung über Steuerkanal                | Tatsächlicher Programmausgabestream und getrennte persönliche Vorschau |
| Netcup ↔ lokaler Server   | HTTPS, versionierte Pakete und Änderungsabgleich       | Vorbereitung bereitstellen und später Inhalte/Betriebsdaten abgleichen |

Netcup erzeugt keine Live-HDMI-/Bühnenausgabe. Netzwerkvideo nicht als JSON über WebSockets transportieren. Ein Agent darf online verbundenen Diagnosebetrieb haben; echte Bühnenbefehle stammen beim Event vom zuständigen lokalen Server. Simulationsinstanzen dürfen keinen Zugriff auf reale Adapter erhalten.

## API-Versionierung und Authentifizierung

Präfix /api/v1. JSON-Eingaben und Ausgaben mit gemeinsamen Schemas validieren. Schemaänderungen migrationsfähig halten.
Browser-Sitzung per geschütztem HttpOnly-Cookie; HTTPS, CSRF-Schutz bei schreibenden Cookie-Requests, explizite Origin-Prüfung bei WebSockets. Agenten mit widerrufbarer Geräteidentität, nicht mit einem gemeinsamen fest eingebauten Kennwort.
Server ermittelt Benutzer und Rechte aus Authentifizierung. actorId im Befehl ist kein Nachweis einer Identität.
Geschützte Dateien nur über autorisierte Auslieferung; keine öffentlich durchsuchbaren Uploadverzeichnisse.
Admin/Leitung benötigen online MFA. Erstkonto durch einmaligen serverseitigen Bootstrap ohne Standardkennwort. Passwort-/MFA-Rücksetzweg dokumentieren; Tokens/Hashes nicht in Logs oder Demodaten.

## Vorbereitung: minimale REST-Routen

| Methode / Pfad                           | Eingabe / Antwort                                  | Regel                                                              |
| ---------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| GET /health/live                         | Prozessstatus                                      | Keine Geheimnisse; allein kein Beweis einer nutzbaren Datenbank    |
| GET /health/ready                        | Abhängigkeiten/Migrationsstatus                    | Nicht ready bei fehlender Datenbank oder unvollständiger Migration |
| POST /api/v1/auth/login                  | Login, Kennwort; ggf. MFA-Challenge                | Ratebegrenzung, generische Fehler                                  |
| POST /api/v1/auth/mfa/verify             | Challenge, Code                                    | Sitzung erst nach erforderlicher zweiter Prüfung                   |
| POST /api/v1/auth/logout                 | Sitzung widerrufen                                 | Authentifizierte Streams beenden                                   |
| GET /api/v1/me                           | Benutzer, wirksame Rechte                          | Kein passwordHash/Secret                                           |
| GET/POST /api/v1/events                  | Liste / name, optionale Angaben                    | Nur berechtigt sichtbare Events                                    |
| GET/PATCH /api/v1/events/{id}            | Objekt / expectedRevision, Änderungen              | Konflikt statt Überschreiben                                       |
| GET/POST /api/v1/teams                   | Teamobjekte                                        | Rechte zum Team-/Kontenanlegen unterscheiden                       |
| POST /api/v1/events/{id}/teams           | teamId                                             | Berechtigte Eventzuordnung                                         |
| GET/POST /api/v1/shows                   | Filter / unabhängige Show                          | Zugriff nach zugewiesenem Bereich                                  |
| POST /api/v1/events/{id}/show-copies     | sourceShowId, sourceRevision                       | Neue Kopie mit Herkunft; keine Lauf-/Verkaufsdaten kopieren        |
| PATCH /api/v1/shows/{id}                 | expectedRevision, Änderungen                       | D005/D008 und Rechte                                               |
| POST /api/v1/media/uploads               | Name, Bereich, deklarierte Größe                   | Upload-Identität, Limits konfigurierbar                            |
| PUT /api/v1/media/uploads/{id}/content   | Dateibytes                                         | Größen-/Pfad-/Dateitypprüfung; kein Klartextpfad vom Client        |
| POST /api/v1/media/uploads/{id}/complete | Erwartete Prüfsumme                                | Vollständigkeit, tatsächlicher Dateityp, Analyseauftrag            |
| GET /api/v1/media/{id}                   | Metadaten und Verwendungen                         | ready/processing/failed sichtbar                                   |
| GET /api/v1/media/{id}/content           | Autorisierte Bytes                                 | Range-Auslieferung für Medien; Zugriff prüfen                      |
| POST /api/v1/scenes/{id}/lease           | Anforderung exklusive Bearbeitung                  | Holder/Expiry; Konflikt bei bestehender gültiger Sperre            |
| PATCH /api/v1/scenes/{id}                | expectedRevision, leaseToken, Definition           | Schema/Rechte/Sperre prüfen; keine Liveaktivierung                 |
| POST /api/v1/events/{id}/packages        | Bereich und gewünschte Revisionen                  | Manifest, gepinnte Fassungen, Prüfsummen                           |
| GET /api/v1/packages/{id}/manifest       | Manifest/Dateiliste                                | Zugriff prüfen; Geheimnisse nicht ungeschützt enthalten            |
| POST /api/v1/activations                 | commandId, Umfang, packageId, expectedLiveRevision | Nur lokal und berechtigt; vollständig prüfen und atomar aktivieren |

Userverwaltung, Einladungen und Rollenverwaltung nach bestehenden Fachregeln ergänzen. Online-Synchronisation ist nicht öffentliches Schreiben beliebiger Objektpakete. Agent-, Medien- und Renderer-Daten nur über dafür vorgesehenen Vertrauensbereich.

## Fehlerformat

error: { code, message, correlationId, details? }. Menschenlesbare Meldung deutsch, stabile technische Codes.
HTTP: 400/422 für ungültige Eingabe, 401/403 für Auth/Rechte, 404 für fehlend bzw. nicht offenzulegende Ressource, 409 für Revisions-/Zustandskonflikt, 413 für Dateigröße. Keine internen Pfade oder Secrets.
409 liefert erlaubte Konfliktinformationen und aktuelle Revision; UI erhält beide Textfassungen und bietet bewusste Entscheidung. Keine automatische Wiederholung einer fachlichen Änderung auf neuer Revision.

## Livebefehle

Envelope:

```json
{
  "protocolVersion": 1,
  "commandId": "uuid",
  "sessionId": "authenticated-session",
  "authorityId": "local-server",
  "authorityEpoch": 1,
  "eventId": "uuid",
  "runId": "uuid",
  "expectedLiveRevision": 23,
  "type": "cue.go",
  "payload": { "expectedNextCueId": "uuid" }
}
```

Zeitstempel eines Clients entscheiden nicht über Reihenfolge. commandId bleibt bei Transportwiederholung identisch. Andere Nutzlast mit derselben Kennung wird abgelehnt.

| Befehl                    | Zweck                                         | Wesentliche Prüfung                                                            |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| run.start                 | Durchlauf starten                             | Ausgangszustand, Mode/Rechte; kein erster GO                                   |
| cue.prepare               | Gemeinsames nächstes Ziel setzen              | Cue-Version, erwartete Live-Revision; erste gültige Änderung gewinnt           |
| cue.go                    | Markierten Einsatz auslösen                   | Gemeinsames Ziel und Revision; konkurrierende GO auf demselben Ziel nur einmal |
| cue.direct                | Geplanten Einsatz direkt auslösen             | Ziel/Version, Ablaufposition bewusst aktualisieren                             |
| overlay.show              | Spontanen Inhalt ausgeben                     | Ablaufposition behalten                                                        |
| interruption.apply        | Unterbrechungsprofil                          | Definierte Einzelwirkungen; auch während Überblendung erreichbar               |
| output.freeze / blackout  | Ausgabezustand verändern                      | Ton/Timer unverändert, sofern keine explizite Aktion                           |
| timer.control             | Start/Pause/Fortsetzen/Korrektur              | Timeridentität und erlaubte Zustandsänderung                                   |
| action.retry              | Fehlgeschlagene Einzelaktion erneut versuchen | Explizite neue Ausführung, keine anderen Aktionen wiederholen                  |
| run.switch / complete     | Showwechsel / Abschluss                       | D012, Wechsel-/Abschlussprofil und laufende Aktionen                           |
| stand.activate / rollback | Datenstand ändern                             | D009; keine vergangenen Einmalaktionen ausführen                               |

Vorschauauswahl ist persönlich und kein cue.prepare. Persönliche Wiedergabe erhält previewSessionId; Vorhöraufträge enthalten agentDeviceId für den gemeinsamen Vorhörkanal dieses Notebooks.

## Idempotenz und konkurrierende Befehle

1. Autorität, Auth, Rechte, Schema und Gültigkeit prüfen.
2. Vorhandene commandId mit gleichem Request zurückgeben, ohne neue Ausführung.
3. Erwartete Revision und GO-Ziel unter Transaktion/Sperre prüfen.
4. Zustandsänderung, Receipt, Ausführungseinträge und ausgehenden Auftrag atomar speichern.
5. Status an Clients verteilen; Adapterausführung getrennt bestätigen.
6. Bei Absturz nach Dispatch ohne bestätigtes Ergebnis: extern unknown. Nicht blind wiederholen. Keine behauptete Exactly-once-Garantie für externe Geräte.
   GO verändert gezielt Livezustandsrevision; unabhängige Heartbeats nicht als GO-Konflikt zählen. Für Prioritätsaktionen nur die relevanten Zustandsbedingungen prüfen: eine Unterbrechung darf nicht durch laufenden Übergang pauschal blockiert werden. Veraltete/doppelte Unterbrechung nicht unkontrolliert wiederholen.

## Ereignisse und Wiederverbindung

Event: protocolVersion, authorityId, authorityEpoch, sequence, type, eventId, runId?, liveRevision?, correlationId?, payload.
Typen: snapshot, live.changed, cue.prepared, command.result, action.status, stand.activated, preview.stale, device.status, media.status, conflict.
Abonnements nach Benutzerrechten filtern; weder fremde Eventinhalte noch geschützte Lösungen durchsenden.
Client meldet letzte epoch/sequence; Server liefert fehlende Ereignisse oder vollständigen Snapshot bei Lücke/Neustart. Persönliche Vorschau bleibt getrennt. Unbestätigte alte Bedienbefehle nicht automatisch erneut senden. Receipt-Abfrage darf den Zustand klären, startet aber keine neue Aktion.
Zustandsänderung und Ereignisauslieferung dürfen keine widersprüchlichen Revisionen erzeugen; Serverneustart kennzeichnet neue Transportepoch.

## Agentenprotokoll

Erst Registrierung/Paarung, dann HELLO mit deviceId, protocolVersion, agentVersion, profile und capabilities. Kurzlebiger Pairing-Code, berechtigte Bestätigung, widerrufbare Geräteidentität. Cloud und lokaler Server haben ausdrücklich konfigurierte Vertrauensbeziehungen; kein unkontrolliertes automatisches Umschalten.

- heartbeat: liveness, adapterstatus, beobachtete Ausgänge, lastSeen.
- dispatch: dispatchId, commandId, adapter, action, playbackId?, parameters, authorityEpoch, simulated.
- status: dispatchId, accepted/running/completed/failed/unknown, evidence, observedAt.
- HELLO/CAPABILITIES darf simulated Adapter nicht als reale Betriebsbereitschaft darstellen.
- Nur freigegebene Aktionsarten und erlaubte Parameter; keine frei ausführbaren Shellbefehle über Netzwerk.
- HTTP-/OSC-Zieladressen für VDJ/Daslight aus lokaler autorisierter Konfiguration; keine beliebigen Client-URLs als Ausführungsziel.
- Native APIs und externe Plugins anhand tatsächlicher Versionen verifizieren; fehlende API als unsupported melden, nicht erfinden.
- Reconnect verwirft alte nicht bestätigte Steueraufträge; Status abgleichen, keine automatischen GO-/Musik-Neustarts.
- Anwendungsstart beginnt sicher und stumm hinsichtlich neuer Musik-/Showaktionen.

## Renderer und Medienzeit

### Implementierter lokaler Vorbereitungsdienst S3-02

Online Admin/MFA: GET /api/v1/offline/trust liefert den öffentlichen Ed25519-Vertrauensschlüssel; POST /api/v1/offline/exports erhält eine öffentliche Zielanfrage und 1–20 gültige Paketkennungen. Ergebnis ist ein signierter, an dieses lokale RSA-Ziel verschlüsselter Anmeldestand. Strikte Verträge in packages/contracts/src/offline.ts; begrenzter AES-GCM-/RSA-OAEP-SHA256-Transport in packages/transfer/src/offline.ts. Öffentliche Inhaltspakete sind davon getrennt.

Lokal: /api/local/auth/login, /auth/mfa/verify, /auth/invitation, /auth/logout, /me, /packages, /packages/:id, /packages/:id/media/:mediaId, /events/:eventId/users, /events/:eventId/users/:userId/block und /users/:userId/block. Alle Schreibanfragen erfordern exakten Origin, geschützte zusätzlich CSRF. Sichere lokale Sessioncookies; jede geschützte Anfrage prüft aktuelle Identität, MFA und Rechte. Leitung verwaltet nur eigene Veranstaltungen. Globale Admins haben wie online Systemzugriff; sie lassen sich nur global lokal sperren, nicht mit einer wirkungslosen Veranstaltungssperre.

Das Windows-Startwerkzeug bindet ausschließlich 127.0.0.1:3443 mit HTTPS. Lesende Weboberfläche prüft Sitzungen alle drei Sekunden erneut. Mediendownload prüft Dateilänge/Hash und verwendet denselben geöffneten Dateideskriptor zur Auslieferung. Keine Medienverzeichnisfreigabe, kein Autoplay und keine Vorschau-/Publikumstonbehauptung. Liveaktivierung bleibt 409.

CLI: init erzeugt DPAPI-geschützte Einrichtung, öffentliche Zielanfrage, PFX/CER und getrennten Recovery-Schlüssel. trust pinnt den ausdrücklich übertragenen Serverschlüssel; import-auth prüft Signatur/Ziel/Folge/Paketbestand; run startet HTTPS; recover verarbeitet ausschließlich eine lokale Recoverydatei. [Genaue Bedienung, Quellrefresh und Grenzen](s3-lokalserver.md). Onlineabgleich, LAN, WSS-Livezustände und Renderer bleiben Ziel.
Lokale Nachrichten: prepareScene, takeScene, mediaControl, outputControl, queryState. Rückmeldung mit playbackId und gepinnter Szenenversion.
Videoend-Ereignisse müssen zur aktuellen playbackId passen und dürfen Folgeaktionen nur einmal auslösen. Stop/Fehler ist kein normaler Medienabschluss.
Verwaltung und Renderer teilen die Szenenschemas, aber keine Frameübertragung per JSON. HDMI-Ausgabe erhält Vorrang vor Remote-Vorschau. Framegenaue/zeitkritische Abläufe folgen Medienzeit im Renderer; WebSocket-Uhr und HTTP-Polling beweisen keine Musik-/Lippensynchronität.

## Pakete und Liveaktivierung

Manifest: schemaVersion, eventId, baseRevisions, objectVersions, files mit Prüfsummen/Größen und fonts. Download in Staging, prüfen, dann lokale Aktivierung atomar.
Der Renderer darf alte laufende Szene gepinnt behalten; shared GO target bei betroffenen Änderungen stale/needs_confirmation. Fehler belassen alten Stand; Direktaufrufe umgehen keinen Versions-/Rechteschutz.
Lokale Offlinekonten und MFA benötigen geschützte Übernahme und geprüfte Sperr-/Recovery-Regeln. Nicht sämtliche Cloud-Secrets oder sessions kopieren.
Livezuständigkeit bleibt vor Ort. Online-Ersatz für Einlass/Organisation und kontrollierter Rückwechsel gehören in spätere Pakete, nicht in einen automatischen DNS-/Agent-Failover.

## Implementierte Paketübertragung S3-01

GET `/api/v1/packages/:id/download`: Rechteprüfung wie Manifest plus jede Originaldatei, Download als versioniertes `.snpkg` mit eingefrorenem Inhalt. Strikter gemeinsamer Vertrag `packages/contracts/src/transfer.ts`; Streamingformat `packages/transfer/src/archive.ts`. Länge und SHA256 für Manifest/alle Dateien, lokale vollständige Prüfung vor SQLite-Veröffentlichung. Import ist keine Aktivierung; keine Renderer-/GO-Nachricht wird erzeugt. Format und Grenzen verbindlich für diesen Prototyp in [s3-paketablage.md](s3-paketablage.md). Keine Cloud-Secrets/Benutzer-/Sitzungsfelder, keine Netzwerknachladung im Importer. Vollständiges Offlinekonto-/MFA- und Rendererpaket weiterhin offen.

## Netcup zuerst, danach Agenten – ursprüngliche Reihenfolge

Erster Sprint implementiert Auth/Rechte, PostgreSQL, Event/Show/Medienvorbereitung, Uploads, Health, Paketmanifest und einen deutlich simulierten Gerätekanal. Livebefehle als getestete gemeinsame Verträge vorbereiten, ohne reale Ausgabe zu behaupten.
Danach Agentengrundlage unter Windows, Paarung, Heartbeats, Capability-/Diagnoseanzeige, Simulation und mindestens ein überprüfter realer Adapter. Anschließend lokalen Server/SQLite und Renderer anbinden.
