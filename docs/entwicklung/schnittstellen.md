# Schnittstellen und Zustandsprotokoll – Entwicklungsstart

Stand: 9. Oktober 2026. Grundlage D003–D013, Architektur und Datenmodell.
Status: implementierbarer technischer Startentwurf. Fachliche Schutzregeln sind verbindlich; Route-/Feldnamen können begründet angepasst werden. Codex erzeugt daraus versionierte Code-Schemas, OpenAPI und Protokolltests.

## Systeme und Aufgaben
| Verbindung | Transport | Aufgabe |
| --- | --- | --- |
| Browser ↔ Netcup-API | HTTPS, authentifizierte WebSockets | Onlinevorbereitung, Rechte, Dateien, Entwürfe und Status |
| Browser ↔ lokaler Server | Lokales HTTPS/WSS nach Einrichtung | Zuständiger Livezustand, GO, Timer, Quiz und aktivierte Inhalte |
| Agent → gewählter Server | Vom Agenten aufgebaute authentifizierte WSS-Verbindung | Registrierung, Fähigkeiten, Heartbeat, Befehle und Status |
| Lokaler Server ↔ Renderer | Authentifiziertes lokales IPC | Medienvorbereitung, Bild-/Tonaktionen und reale Statusmeldungen |
| Renderer → Browser/Agent | WebRTC; Signalisierung über Steuerkanal | Tatsächlicher Programmausgabestream und getrennte persönliche Vorschau |
| Netcup ↔ lokaler Server | HTTPS, versionierte Pakete und Änderungsabgleich | Vorbereitung bereitstellen und später Inhalte/Betriebsdaten abgleichen |

Netcup erzeugt keine Live-HDMI-/Bühnenausgabe. Netzwerkvideo nicht als JSON über WebSockets transportieren. Ein Agent darf online verbundenen Diagnosebetrieb haben; echte Bühnenbefehle stammen beim Event vom zuständigen lokalen Server. Simulationsinstanzen dürfen keinen Zugriff auf reale Adapter erhalten.

## API-Versionierung und Authentifizierung
Präfix /api/v1. JSON-Eingaben und Ausgaben mit gemeinsamen Schemas validieren. Schemaänderungen migrationsfähig halten.
Browser-Sitzung per geschütztem HttpOnly-Cookie; HTTPS, CSRF-Schutz bei schreibenden Cookie-Requests, explizite Origin-Prüfung bei WebSockets. Agenten mit widerrufbarer Geräteidentität, nicht mit einem gemeinsamen fest eingebauten Kennwort.
Server ermittelt Benutzer und Rechte aus Authentifizierung. actorId im Befehl ist kein Nachweis einer Identität.
Geschützte Dateien nur über autorisierte Auslieferung; keine öffentlich durchsuchbaren Uploadverzeichnisse.
Admin/Leitung benötigen online MFA. Erstkonto durch einmaligen serverseitigen Bootstrap ohne Standardkennwort. Passwort-/MFA-Rücksetzweg dokumentieren; Tokens/Hashes nicht in Logs oder Demodaten.

## Vorbereitung: minimale REST-Routen
| Methode / Pfad | Eingabe / Antwort | Regel |
| --- | --- | --- |
| GET /health/live | Prozessstatus | Keine Geheimnisse; allein kein Beweis einer nutzbaren Datenbank |
| GET /health/ready | Abhängigkeiten/Migrationsstatus | Nicht ready bei fehlender Datenbank oder unvollständiger Migration |
| POST /api/v1/auth/login | Login, Kennwort; ggf. MFA-Challenge | Ratebegrenzung, generische Fehler |
| POST /api/v1/auth/mfa/verify | Challenge, Code | Sitzung erst nach erforderlicher zweiter Prüfung |
| POST /api/v1/auth/logout | Sitzung widerrufen | Authentifizierte Streams beenden |
| GET /api/v1/me | Benutzer, wirksame Rechte | Kein passwordHash/Secret |
| GET/POST /api/v1/events | Liste / name, optionale Angaben | Nur berechtigt sichtbare Events |
| GET/PATCH /api/v1/events/{id} | Objekt / expectedRevision, Änderungen | Konflikt statt Überschreiben |
| GET/POST /api/v1/teams | Teamobjekte | Rechte zum Team-/Kontenanlegen unterscheiden |
| POST /api/v1/events/{id}/teams | teamId | Berechtigte Eventzuordnung |
| GET/POST /api/v1/shows | Filter / unabhängige Show | Zugriff nach zugewiesenem Bereich |
| POST /api/v1/events/{id}/show-copies | sourceShowId, sourceRevision | Neue Kopie mit Herkunft; keine Lauf-/Verkaufsdaten kopieren |
| PATCH /api/v1/shows/{id} | expectedRevision, Änderungen | D005/D008 und Rechte |
| POST /api/v1/media/uploads | Name, Bereich, deklarierte Größe | Upload-Identität, Limits konfigurierbar |
| PUT /api/v1/media/uploads/{id}/content | Dateibytes | Größen-/Pfad-/Dateitypprüfung; kein Klartextpfad vom Client |
| POST /api/v1/media/uploads/{id}/complete | Erwartete Prüfsumme | Vollständigkeit, tatsächlicher Dateityp, Analyseauftrag |
| GET /api/v1/media/{id} | Metadaten und Verwendungen | ready/processing/failed sichtbar |
| GET /api/v1/media/{id}/content | Autorisierte Bytes | Range-Auslieferung für Medien; Zugriff prüfen |
| POST /api/v1/scenes/{id}/lease | Anforderung exklusive Bearbeitung | Holder/Expiry; Konflikt bei bestehender gültiger Sperre |
| PATCH /api/v1/scenes/{id} | expectedRevision, leaseToken, Definition | Schema/Rechte/Sperre prüfen; keine Liveaktivierung |
| POST /api/v1/events/{id}/packages | Bereich und gewünschte Revisionen | Manifest, gepinnte Fassungen, Prüfsummen |
| GET /api/v1/packages/{id}/manifest | Manifest/Dateiliste | Zugriff prüfen; Geheimnisse nicht ungeschützt enthalten |
| POST /api/v1/activations | commandId, Umfang, packageId, expectedLiveRevision | Nur lokal und berechtigt; vollständig prüfen und atomar aktivieren |

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

| Befehl | Zweck | Wesentliche Prüfung |
| --- | --- | --- |
| run.start | Durchlauf starten | Ausgangszustand, Mode/Rechte; kein erster GO |
| cue.prepare | Gemeinsames nächstes Ziel setzen | Cue-Version, erwartete Live-Revision; erste gültige Änderung gewinnt |
| cue.go | Markierten Einsatz auslösen | Gemeinsames Ziel und Revision; konkurrierende GO auf demselben Ziel nur einmal |
| cue.direct | Geplanten Einsatz direkt auslösen | Ziel/Version, Ablaufposition bewusst aktualisieren |
| overlay.show | Spontanen Inhalt ausgeben | Ablaufposition behalten |
| interruption.apply | Unterbrechungsprofil | Definierte Einzelwirkungen; auch während Überblendung erreichbar |
| output.freeze / blackout | Ausgabezustand verändern | Ton/Timer unverändert, sofern keine explizite Aktion |
| timer.control | Start/Pause/Fortsetzen/Korrektur | Timeridentität und erlaubte Zustandsänderung |
| action.retry | Fehlgeschlagene Einzelaktion erneut versuchen | Explizite neue Ausführung, keine anderen Aktionen wiederholen |
| run.switch / complete | Showwechsel / Abschluss | D012, Wechsel-/Abschlussprofil und laufende Aktionen |
| stand.activate / rollback | Datenstand ändern | D009; keine vergangenen Einmalaktionen ausführen |

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
Lokale Nachrichten: prepareScene, takeScene, mediaControl, outputControl, queryState. Rückmeldung mit playbackId und gepinnter Szenenversion.
Videoend-Ereignisse müssen zur aktuellen playbackId passen und dürfen Folgeaktionen nur einmal auslösen. Stop/Fehler ist kein normaler Medienabschluss.
Verwaltung und Renderer teilen die Szenenschemas, aber keine Frameübertragung per JSON. HDMI-Ausgabe erhält Vorrang vor Remote-Vorschau. Framegenaue/zeitkritische Abläufe folgen Medienzeit im Renderer; WebSocket-Uhr und HTTP-Polling beweisen keine Musik-/Lippensynchronität.

## Pakete und Liveaktivierung
Manifest: schemaVersion, eventId, baseRevisions, objectVersions, files mit Prüfsummen/Größen und fonts. Download in Staging, prüfen, dann lokale Aktivierung atomar.
Der Renderer darf alte laufende Szene gepinnt behalten; shared GO target bei betroffenen Änderungen stale/needs_confirmation. Fehler belassen alten Stand; Direktaufrufe umgehen keinen Versions-/Rechteschutz.
Lokale Offlinekonten und MFA benötigen geschützte Übernahme und geprüfte Sperr-/Recovery-Regeln. Nicht sämtliche Cloud-Secrets oder sessions kopieren.
Livezuständigkeit bleibt vor Ort. Online-Ersatz für Einlass/Organisation und kontrollierter Rückwechsel gehören in spätere Pakete, nicht in einen automatischen DNS-/Agent-Failover.

## Netcup zuerst, danach Agenten
Erster Sprint implementiert Auth/Rechte, PostgreSQL, Event/Show/Medienvorbereitung, Uploads, Health, Paketmanifest und einen deutlich simulierten Gerätekanal. Livebefehle als getestete gemeinsame Verträge vorbereiten, ohne reale Ausgabe zu behaupten.
Danach Agentengrundlage unter Windows, Paarung, Heartbeats, Capability-/Diagnoseanzeige, Simulation und mindestens ein überprüfter realer Adapter. Anschließend lokalen Server/SQLite und Renderer anbinden.
