# S2 Windows-Agent: Verbindung und Diagnose

Stand: 10. Oktober 2026. Prototyp 0.2.1, [Issue #4](https://github.com/SchapfeldNils/ShowNight-System/issues/4). Abhängig vom S1-Branch/PR #2. Keine Veranstaltungsfreigabe, kein vollständiger Windows-Installer. Der Online-Agent führt ausschließlich Diagnose und ausdrücklich markierte Tests ohne Gerätewirkung aus. S3 stellt später die lokale Livezuständigkeit bereit; diese wird hier nicht vorgetäuscht.

## Start auf Windows

Für Betreiber: `shownight-agent-windows-x64.zip` vollständig in einen lokalen Ordner außerhalb OneDrive entpacken. Das Paket enthält die kostenlose offizielle Node-24.19.0-x64-Laufzeit, Anleitung und Lizenztexte; kein npm/Compiler notwendig. Windows x64 und bestehender Benutzeraccount sind Voraussetzungen. Kein Windowsdienst und kein automatischer Start.

1. Administration öffnet **Diagnose → Windows-Agenten**, gibt Gerätename und Profil DJ/Licht/Hauptrechner ein und erstellt einen Paarungscode. Code gilt fünf Minuten und nur einmal. Das Geräteprofil verleiht keine Benutzerrechte.
2. Auf dem gewünschten Notebook `Einrichten.cmd` öffnen. Vollständige Serveradresse und Code lokal eingeben. Nur HTTPS; HTTP ist für Loopback-Entwicklertests erlaubt. Der Server muss den S2-Stand mit Migration 2 haben; Netcup wurde am 10. Oktober nach Betreiberfreigabe auf diesen Stand aktualisiert.
3. `Start.cmd` öffnen. Sichtbare Meldung „Verbunden · ausschließlich Diagnose“ abwarten. In der Technikoberfläche Verbindung prüfen; der Empfang und das Diagnoseergebnis sind getrennte Zustände.
4. Fenster mit Strg+C beenden. Reale Ausgaben werden dabei weder gestartet noch verändert. Serverstatus wird bei Abbruch offline; bei ausbleibendem Heartbeat spätestens nach 15 Sekunden nicht verbunden.

Paarung und Befehlsanlage/Widerruf benötigen bestehende MFA-gesicherte Systemadministration; normale Veranstaltungsrollen können keine globalen Geräte anlegen. Widerruf sperrt Credential sofort und beendet die bekannte Verbindung. Netzabbrüche verbinden mit begrenztem Backoff erneut; Protokoll-/Identitätsablehnung benötigt bewusste Fehlerbehebung. Keine automatische Serverumschaltung und kein Replay alter Aufträge.

Vorübergehender Dienst-/Datenbankausfall beendet den Socket mit 1011 und erlaubt begrenzte Wiederverbindung. Protokollverletzung/Widerruf verwendet 1008 beziehungsweise HTTP 401/403 und sperrt automatische Wiederaufnahme. Der Unterschied ist gegen einen tatsächlich gestoppten und wieder gestarteten PostgreSQL-Testserver geprüft; unklare Aufträge bleiben nicht wiederholbar.

## Lokale Ablage und Fehlerhilfe

`%LOCALAPPDATA%/ShowNight/agent`: `identity.dpapi` (Windows DPAPI/CurrentUser, Server/Profil/ID/Secret verschlüsselt), `receipts.sqlite` (dauerhafte Empfangskennungen/Ergebnisse) und während Laufzeit `running.lock`. Ordner-ACL nur aktueller Windows-Benutzer und SYSTEM. Private Identität weder in Git/OneDrive kopieren noch in Diagnosepakete aufnehmen. DPAPI ist an den Windows-Benutzer gebunden, kein portables Schlüsselbackup.

Bei Neustart erhalten unvollständige Journalzeilen `unknown`; eine gleiche Kennung wird nicht erneut ausgeführt. Gleiche Kennung mit anderem Inhalt oder anderer Zuständigkeit wird abgewiesen. Journalgrenze 10000 Aufträge: weitere Annahme gesperrt, keine automatische Löschung alter Kennungen. Kapazitätserweiterung/Wartung vor breiter Nutzung offen.

Sperrdatei nach hartem Prozessabbruch: im Task-Manager prüfen, dass dieser Agent tatsächlich beendet ist; erst danach ausschließlich `running.lock` aus dem Agentordner entfernen. Journal nicht löschen, um Aufträge „noch einmal“ auszulösen. Für neue Paarung alte Geräteidentität im Server bewusst widerrufen, den beendeten lokalen Agentordner als privaten Stand sichern und erst anschließend einen neuen leeren Agentordner verwenden. Bestehende Identität wird nicht überschrieben.

Bei falscher Adresse/abgelaufenem Code oder fehlendem S2-Server entsteht keine funktionsfähige Paarung. Bei konsumiertem Code und anschließendem Ablagefehler das neue Gerät serverseitig widerrufen und neuen Code anlegen. Ein Verbindungsstatus oder `completed` der Diagnose bestätigt weder Hardware noch physische Wiedergabe.

## Protokoll und Grenzen

Paarung: `POST /api/agent/v1/pair`, Body `{code, protocolVersion:1}` ohne Browser-Origin/Cookie, Begrenzung fünf Versuche pro Minute. SHA256 des Einmalcodes und Gerätecredentials im Server; Credential nur bei erfolgreicher Paarung einmal zurückgeben. Gerätesocket: `/api/agent/v1/ws`, Bearer ausschließlich im Authorization-Header, keine Tokens in URLs. Browser-/Geräteauthentifizierung sind getrennt; kein Credential im Browser.

HELLO meldet ID, Profil, Version und höchstens zwölf begrenzte Fähigkeiten. WELCOME enthält Verbindungs-Epoch und ausschließlich `online-diagnostics`. Heartbeat alle fünf Sekunden. Neue Verbindung ersetzt alte Verbindung mit Datenbankfence; Widerruf und Receipts prüfen dieselbe Gerätezeile. Es gibt keine Offline-Auftragswarteschlange.

Allowlist: `diagnostics.ping` (reale Software-Verbindungsdiagnose) und `simulator.noop` (keine Gerätewirkung). Beide enthalten leere Parameter; keine URLs, Skripte, Shell, Wiedergabe-, OSC-, MIDI- oder HDMI-Befehle. Vor Ausführung speichert der Agent Empfang dauerhaft. Serverzustände `sent`, `accepted`, `completed`, `failed`, `unknown`; Verbindungsverlust macht offene Aufträge unbekannt. Doppelanlage dedupliziert pro Dispatch-ID, Konflikt 409. Geräte-UI aktualisiert alle fünf Sekunden und zeigt bei HTTP-Fehler veraltete Werte ungeprüft.

Online-Node/SQLite-Agent und gerätespezifische Identität sind ein technischer Startentwurf. Lokale Liveautorität, kontrollierte Tokenrotation, systemübergreifende Offlineidentität und native Renderer-/Audio-/Controlleradapter bleiben weitere Arbeit. Kein frei erfundener Hardwarestatus: nicht eingerichtete Geräte melden unbekannt.

## VirtualDJ, Daslight und Controller

Auf dem Betreiberrechner wurden VirtualDJ 2025 (Registry 8.5.8741.0), Daslight 5 (Registry-Installerversion 1.0.0.0, tatsächlicher Programmbuild ungeprüft) und Stream Deck 7.4.2.22730 gefunden. PnP-Abfrage anhand FLX4/APC/Stream-Deck/Daslight-Namen fand aktuell keine passenden angeschlossenen Geräte; dies ist kein vollständiger Treibernachweis. Dieser Rechner ist als DJ bestätigt; Licht-/Hauptrechner, Interface, Gerätmodelle und Routing bleiben zu bestätigen.

[Offizielles VirtualDJ Network Control Plugin](https://virtualdj.com/wiki/NetworkControlPlugin) benötigt VirtualDJ 2023+ und vorhandene Pro-Lizenz. Plugin unter Config/Extensions/Effects/Other installieren, Port und Authentifizierungsstring lokal konfigurieren. Pro-Lizenz laut Betreiber vorhanden, echte Plugin-Leseantwort am 10. Oktober bestätigt. `VirtualDJ-Pruefen.cmd` fragt ausschließlich am Loopback per POST `/query` mit dem dokumentierten `get_clock` ab; Auth nur im Header, keine Weiterleitungen, Timeout/Antwortgrenze. Automatisierter Vertragstest verwendet einen klar bezeichneten HTTP-Testserver; zusätzlicher realer Nachweis unten. Musikposition/-steuerung und PA-Ausgabe/Abhörweg bleiben offen.

[Daslight 5](https://www.daslight.com/en/daslight5) bietet OSC/MIDI; tatsächliche lokale Zuordnungen/Interface und Rückmeldungen müssen am konkreten Aufbau geprüft werden. Deshalb noch kein aktiver Daslight-Adapter und keine erfundenen OSC-Adressen. [Stream-Deck-SDK](https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/) setzt aktuell Node 24+, Stream Deck 7.1+ und ein Gerät voraus; SDK-Plugin/MIDI-Learn/APC-LEDs noch nicht implementiert. Vorhörweg mit FLX4 neben VirtualDJ, mehrere Regiefenster und tatsächliche PA-Trennung brauchen Hardwareabnahme S2-06/S2-07; kein Browser-/HTTP-Test ersetzt diese.

## Entwicklerbefehle

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
pnpm test:agents
pnpm test:browser
pnpm agent:package
```

`agent:package` auf Windows: offizielle Laufzeit herunterladen, festgelegten SHA256 gegen [Herstellerdatei](https://nodejs.org/download/release/v24.19.0/SHASUMS256.txt) prüfen, portable ZIP mit Lizenzen erstellen. npm-Pakete ws/Zod sind MIT; Node enthält eigene MIT-/Drittlizenztexte. Keine zusätzliche kostenpflichtige Komponente. Kein signierter ShowNight-Installer; Windows-Freigabe und vollständiger Einrichtungsassistent bleiben offen.

Migration 2 ergänzt ausschließlich Agenttabellen und erhält Migration 1 unverändert. Upgrade explizit mit vorhandenem Migrations-CLI und vorheriger Sicherung; keine automatische Produktionsmigration. Datenbank mit Schema 1 ist für den S2-Build nicht ready. Produktiver Netcup-Stack nach Betreiberfreigabe mit geprüftem Backup/isoliertem Restore am 10. Oktober auf S2/Schema 2 aktualisiert.

Rollback nach Migration 2 benötigt den passenden gesicherten Schema-1-Datenbestand in isolierten Volumes gemäß Restoreanleitung; der bisherige S1-Build akzeptiert Schema 2 nicht. Nicht allein das Image zurückwechseln oder den Migrationseintrag löschen. Produktiver Upgrade und isolierte Wiederherstellung tatsächlich bestanden; kein produktiver Rückwechsel erforderlich oder ausgeführt.

## Reale DJ-Leseabfrage am 10. Oktober 2026

Betreiber bestätigt diesen Windows-Rechner als DJ-Rechner und vorhandene Pro-Lizenz; FLX4 ausdrücklich nicht angeschlossen. VirtualDJ tatsächlich gestartet, Network Control durch Betreiber installiert und mit lokalem Port/Authentifizierungsstring eingerichtet. Adapter gegen echte lokale Plugininstanz geprüft: POST `/query`, ausschließlich `get_clock`, nicht leere Antwort; falscher Authentifizierungsstring ergibt 401. Die Ablehnung musste wegen der vom Node-Fetch-Parser nicht akzeptierten Plugin-Fehlerantwort zusätzlich als begrenzte rohe HTTP-Antwort ausgewertet werden. Gültige Abfrage anschließend erneut erfolgreich. Port gehört laut Betriebssystem dem VirtualDJ-Prozess. Keine `/execute`-Abfrage, keine Wiedergabe-/Tonaktion.

Private Daten ausschließlich in `%LOCALAPPDATA%/ShowNight/secrets/virtualdj.env`; Zugangsdaten nicht in Screenshots/Logs/Git. Der Adapter ruft nur Loopback auf. Das Plugin selbst lauscht laut Betriebssystem auf IPv4 `0.0.0.0`; es wurde keine eingehende Firewallfreigabe angelegt. Begrenzung eingehender Erreichbarkeit für den Dauerbetrieb bleibt zu prüfen. Ein erfolgreicher Uhrenquery belegt weder Deck-/Musikposition noch Drift, Wiedergabe oder FLX4-/PA-Trennung. Dieser Nachweis ersetzt nicht die weiterhin offenen S2-06/S2-07-Gesamtfälle.

[Netcup-Update mit tatsächlich bestandenem Upgrade/Restore und Zielprüfungen](s2-netcup-update.md).

## Tatsächliche DJ-Paarung am 10. Oktober 2026

Betreiber hat nach eigener Admin-/MFA-Anmeldung den DJ-Einmalcode lokal bereitgestellt. Geprüfte portable Windows-ZIP `26edc1d` außerhalb OneDrive entpackt; Paarung über deren gebündelten CLI, Profil `dj`, vollständige System-HTTPS-Adresse. DPAPI-Roundtrip und Ordner-ACL Benutzer/SYSTEM bestätigt. Agent 0.2.0 tatsächlich per WSS verbunden; Diagnose `completed`/`agent-roundtrip` sowohl über Server-API als auch im lokalen SQLite-Journal bestätigt. Eigenes synthetisches Diagnosekonto und dessen Server-Diagnosezeile danach entfernt; echte DJ-Identität erhalten. Der lokale Journalnachweis bleibt erhalten. Kein Betreiber-MFA-Reset oder Übernehmen seines Faktors.

Windows-Resolver lieferte bei der Prüfung weiterhin das alte Webhostingziel. Deshalb vorläufig ausschließlich für diese Agentenprozesse die bestätigte VM-IP als DNS-Lookup vorgegeben; HTTPS-Hostname, gespeicherte Serveradresse und volle TLS-Prüfung unverändert. Keine Änderung an Windows-/Router-DNS, Hostsdatei oder Serverumschaltung. Private lokale Start-/Stopphilfe und Hinweise unter `%LOCALAPPDATA%/ShowNight/runtime`; `Start.cmd` benötigt normale korrekte DNS-Auflösung. Dauerbetrieb ohne diese Diagnosehilfe noch zu bestätigen. Kein Autostart/Windowsdienst eingerichtet. Die echte Plugin-Leseabfrage bleibt ein separater Nachweis und erweitert nicht automatisch die gemeldeten Agentfähigkeiten um Gerätesteuerung.

## Laufende VirtualDJ-Lesediagnose ab Agent 0.2.1

Am 10. Oktober produktiv auf Runtime `a8b062f`/Agent 0.2.1 aktualisiert: gleiche Paarung/Journal, frischer Schema-2-Restore geprüft, reale aktuelle Leseberichte und Authfehler/Erholung bei gleicher WSS-Epoch bestätigt. [Tatsächlicher Updateablauf](s2-virtualdj-update.md). Private Bedienhilfe unter `%LOCALAPPDATA%/ShowNight/runtime/DJ-Betriebshinweise.md`; kein Dienst/Autostart.

Die eingerichtete DJ-Instanz prüft bei HELLO und Heartbeats ausschließlich `get_clock` mit begrenzter Zeit/Antwortgröße. In der Geräteansicht werden Leseprüfung und Steuerungsfähigkeiten getrennt, Fehler/Erholung und veraltete Berichte sichtbar. Lokale Datei `%LOCALAPPDATA%/ShowNight/secrets/virtualdj.env` wird nur im DJ-Profil gelesen; keine Zugangsdaten oder Rohantwort an Server übertragen. Neuer Serververtrag vor Agentupdate notwendig; bestehende 0.2.0-Agenten bleiben kompatibel. [Einrichtung, Protokoll, Nachweise und Grenzen](s2-virtualdj-diagnose.md).
