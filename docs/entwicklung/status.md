# Entwicklungsstatus

Stand: 9. Oktober 2026. Paket S1, Arbeitsbranch `feat/s1-online-server`, [Issue #1](https://github.com/SchapfeldNils/ShowNight-System/issues/1), [PR #2](https://github.com/SchapfeldNils/ShowNight-System/pull/2). S1 ist ein Entwicklungszwischenstand; erste Veranstaltungsfreigabe bleibt F01–F50/A01–A30.

## Implementiert

Gemeinsamer React/TypeScript-Webkern, Fastify/TypeScript-API, PostgreSQL-Migration, validierte Zod-Verträge, sicherer Session-/MFA-/Einrichtungsablauf, eventbezogene Rollen und Team-/Showrechte. Name genügt für Eventanlage; Vorlagen, Datum/Ort und Module ergänzbar. Unabhängige Shows, geordnete Einsätze, Notizen, Medienreferenzen und eigenständige Eventkopien mit Herkunft. Revisionskonflikte in Transaktionen, sichtbarer Vergleich im Browser. Originaluploads, Worker-Prüfung, geschützte Byte-Ranges, Paketmanifest mit erneutem Hashvergleich. Persistente Mailwarteschlange und konfigurierbarer SMTP-/Testadapter. Health/Readiness und authentifizierte Rechte-Snapshots über WebSocket.

Versionierte Container-/Portainer-Vorlage: app auf vorhandenem externem Proxy-Netz plus Backend, PostgreSQL/Worker nur Backend, keine veröffentlichten DB-Ports; persistent benannte Volumes. Nginx-Locationvorlage für bestehende TLS-Verwaltung. Backup/Restore in leeren isolierten Stack, Migrations-/Update-/Recoveryanleitung. [Start](s1-start.md), [API](s1-api.md), [Deployment](deployment.md), [Lizenzen](lizenzen.md).

## Getestet

Umgebung lokal: Windows x64, Node 24.19.0, pnpm 11.25.0, echte native PostgreSQL-17.9-Instanz; Restoreclients PostgreSQL 17.11. Installierte npm-Versionen: Lockfile. Browser: Playwright Chromium 156.0.8078.4, Desktop und 390 px Breite. Tests verwenden ausschließlich synthetische Daten, zufällige Kontogeheimnisse und eigene Datenbanken auf Port 55433/55434.

| Fall | Tatsächliches lokales Ergebnis | Status / Grenze |
| --- | --- | --- |
| S1-01 F26/A17 | install, local:setup/local:db, typecheck, Build und Browserstart durchgeführt | Lokaler Start passed; Docker auf diesem Host nicht vorhanden, Containerprüfung in Actions passed für e719418 |
| S1-02 F01/F25 | Leere PostgreSQL-DB migriert, wiederholte Migration/Demo, tatsächlicher DB-Neustart und persistente Daten geprüft | passed |
| S1-03 F30/A18 | Bootstrap erneut verweigert, keine Sitzung vor MFA, falscher Code abgewiesen, TOTP-Replay blockiert, Recovery-Code verbraucht | passed |
| S1-04 F05/F30/A18 | Zwei Events, eigenes Team, ganze zugeordnete Show, Leitung ohne System-/LIVE-Recht; direkte fremde IDs und alte Sitzung nach Leitungsrolle abgewiesen | passed im implementierten S1-Rechteumfang; freie Rollen/Offlineverfahren folgen |
| S1-05 F01/F29/D004 | Name allein, Vorlage und Team, spätere optionale Angaben; Browser öffnet Übersicht | passed; Aufgaben-/Kalender-/persönliche Übersichtsprofile später |
| S1-06 F02/F11/D008 | Show unabhängig erstellt, kopiert, Quelle geändert; Kopie bleibt eigenständig mit Herkunft | passed; bewusster Updatevergleich bestehender Kopien später |
| S1-07 F12/F28/A04 | Synthetisches PNG/MP4, Bytehash und Range; falscher MIME, Pfad, Größenlimit und beschädigte Datei getestet | passed; enger Formatumfang, vollständige Dekodierung maximal 60 s, keine Renderer-/Lautheitsfreigabe |
| S1-08 F06/A05/D008 | Zwei gleichzeitige PATCH mit gleicher Revision: genau ein 200, ein 409; beide Texte im Browserkonflikt sichtbar | passed; S1 speichert Texte ausdrücklich, vollständiger Editor/Autosave später |
| S1-09 F25/A04 | Manifest gepinnt, gleiche Dateigröße mit verändertem Hash und entfernte Datei → invalid, Onlineaktivierung verweigert | passed für S1-Manifest; Offlinekonto-/Schriften-/Rendererpaket erst S3 |
| S1-10 F50/A17 | pg_dump/pg_restore in getrennte leere DB, Objekte/Rechte/Versionen und Medienbytes/-hashes verglichen | passed lokal; Container-Backupskripte in Actions passed für e719418 |
| S1-11 F26 | PostgreSQL tatsächlich gestoppt: live 200, ready 503; Antwort ohne DB-Kennwort | passed; Sicherheitslogs enthalten nur Code/Status/Korrelation, keine Requestbodies |
| S1-12 F26/A17 | Kein Netcup-Zugang/Deployment erfolgt | blocked: Zielzugang, Proxy-Netz, DNS/TLS und Backupziel fehlen |

`pnpm test`: 3/3 bestanden. `pnpm test:integration`: letzter abgeschlossener Lauf 13/13 bestanden, einschließlich Auth/Origin, rechtegefiltertem WebSocket-Snapshot und Verbindungsende bei Sitzungswiderruf. `pnpm test:browser`: 1/1 vollständiger Ablauf bestanden. `pnpm audit --prod`: keine bekannten Schwachstellen im zuletzt geprüften Stand. `pnpm typecheck` nach letzten Schemaänderungen bestanden. GitHub Actions für Commit `e719418`: [Lauf 37962102339](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/37962102339) erfolgreich, einschließlich Linux-Integration/Browser, Audit und vollständigem Container-Build/Start/Migration/Worker/Backup/isoliertem Restore/Readiness. Nachfolgende Rechtekorrektur erneut lokal 13/13 geprüft; deren Actions-Lauf wird im PR dokumentiert. Keine Hardwareprüfung aus Browserscreenshots ableiten.

SMTP: tatsächliche lokale Konfiguration außerhalb OneDrive/Git, Windows-ACL für Benutzer/SYSTEM. `scripts/smtp-check.ts`: TLS und SMTP-Authentifizierung erfolgreich; **keine Nachricht versendet**. Absenderfreigabe/Zustellung nicht nachgewiesen. Secrets/Adressen werden nicht in öffentliches Protokoll übernommen. Versand bleibt deaktiviert.

## Simuliert

Diagnoseprofile dj/light/main sind fest als S1-Simulation gekennzeichnet. Virtual DJ, Daslight, APC Mini MK2, Stream Deck und FLX4-Fähigkeiten sind unknown; HDMI online unsupported. Keine Gerätekommunikation, keine echten Bühnenaktionen. Mail-Testaufträge werden dauerhaft gespeichert, businessKey dedupliziert, vom Worker simulated; unterbrochene SMTP-Übergabe unknown getestet. Kein delivered-Status ohne Nachweis.

## Blockiert

S1-12: tatsächlicher Netcup-Zugang/VMparameter/Proxyroute fehlen. Kein DNS, Zertifikat, Postfach oder Systemstack angelegt. Bestehender Proxy/Portainer unverändert. Keine erfundenen Container-/Netzwerknamen. Reale Gerätesoftware/Hardware und Synchronitätsmessungen bleiben separate S2/S3/S4-Nachweise.

## Offen und nächstes Paket

S2: Windows-Agent mit Paarung, widerrufbarer Identität, Profilen, Heartbeats, Fähigkeiten, Diagnose, Dispatch-Idempotenz und sicherer Wiederverbindung. Noch keine reale API-/Gerätenachweise; offizielle Dokumentation und tatsächliche Softwareversionen am vorhandenen Notebook erheben. Danach S3 SQLite/Windows-Renderer/Offlinekonten und vollständige Medienpakete, S4 GO/persönliche Vorschau/Livezustände. Kein OBS.

Innerhalb der weiteren Vorbereitungsentwicklung: Szenen/Abschnitte, Autosave/Entwürfe, Papierkorb/Löschschutz, bewusste Vorlagenupdates, Medienvarianten/Lautheit, volle API-/Schemas/Undo und persönliche Übersichten. Neue Fachmodule erhalten eigene vollständige Modelle; keine leeren Ticket-/Quiz-/Finanztabellen als fertig deklarieren. Originalgestaltung fehlt weiterhin. Vollständige Installation, Handbuch, reale Last-/Hardware-/Ausfallabnahme und F01–F50/A01–A30 bleiben der erste Veranstaltungsfreigabescope.
