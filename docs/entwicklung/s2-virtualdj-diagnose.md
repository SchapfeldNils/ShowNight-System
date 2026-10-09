# S2: laufende VirtualDJ-Lesediagnose

Stand: 10. Oktober 2026. Agent 0.2.1 auf dem S2-Arbeitsbranch/PR #5. Ergänzung von S2-03/S2-06, F14/F23/F28; kein vollständiger Steuerungs-, Hardware- oder Synchronitätsnachweis. Produktiv zunächst weiterhin Runtime `26edc1d`/Agent 0.2.0; neuer Stand erst nach CI und dokumentierter Aktualisierung.

## Benutzbarer Ablauf

1. VirtualDJ 2023+ mit vorhandener Pro-Lizenz und aktivem [Network Control](https://virtualdj.com/wiki/NetworkControlPlugin). Port und Authentifizierungsstring lokal konfigurieren. Am DJ-Rechner Werte außerhalb Git/OneDrive in `%LOCALAPPDATA%/ShowNight/secrets/virtualdj.env` hinterlegen: `VDJ_PORT` und `VDJ_AUTH`. Kein Standardkennwort; keine Werte im Chat oder öffentlichen Protokoll.
2. Server mit aktuellem S2-Vertrag zuerst bereitstellen, danach Agent 0.2.1 starten. Bestehende DPAPI-Geräteidentität/Serveradresse und SQLite-Journal bleiben erhalten; keine erneute Paarung. Alte Agenten 0.2.0 bleiben am neuen Server kompatibel. Neuer Agent ist mit dem früheren Serververtrag nicht kompatibel.
3. Unter **Diagnose → Windows-Agenten** erscheint **VirtualDJ-Leseabfrage**: verfügbar nach bestätigter nicht leerer `get_clock`-Antwort, **Leseprüfung nicht bestätigt** bei konfiguriertem aber fehlerhaftem Zugriff, unbekannt bei fehlender Einrichtung. Beobachtungszeitpunkt separat angezeigt. Musiksteuerung, Daslight/Controller und HDMI/Publikumston haben eigene ungeprüfte beziehungsweise online nicht unterstützte Fähigkeiten.
4. Pluginverlust wird beim nächsten Prüfversuch als Fehler gemeldet; nach Erholung neu geprüft. Gerät bleibt bei begrenztem Pluginfehler verbunden. Nach Agentverlust/HTTP-Fehler oder veraltetem Bericht wird alter Status als **Letzte Meldung – aktuell ungeprüft** gezeigt.

Nur DJ-Profile lesen die optionale Datei; Licht-/Hauptprofile greifen darauf nicht zu. Dateiänderung wird beim nächsten Versuch gelesen. Fehlende Datei oder beide leeren Werte bedeuten nicht eingerichtet; teilweise/ungültige oder zu große Konfiguration bedeutet Prüfung nicht bestätigt. Keine geheime Konfiguration in Geräteidentität oder Cloud übernehmen.

## Technischer Vertrag und Grenzen

Allowlist weiterhin ausschließlich `diagnostics.ping` und `simulator.noop`. Lokale Prüfung ist eine automatische lesende Beobachtung und kein zusätzlicher Cloud-Steuerbefehl. Ausschließlich POST an `http://127.0.0.1:<konfigurierter Port>/query`, feste Nutzlast `get_clock`, Bearer im Header, keine Weiterleitungen. Drei Sekunden Gesamtgrenze auch bei offenem Antwortbody, höchstens 1024 Antwortbytes. Erneute Verbindung kann keine überlappenden Pluginabfragen starten.

Prüfung vor HELLO und im Fünf-Sekunden-Heartbeat; keine überlappenden Heartbeatprüfungen. Pluginantwort kann Heartbeat um höchstens dessen Abfragezeit verzögern. Nach begrenztem Fehler läuft Gerätekanal weiter; Livenessgrenze bleibt 15 Sekunden. Receiptverarbeitung wartet nicht auf Pluginabfrage. Bisherige Epoch-/Rechte-/Widerrufs-/Deduplizierungsregeln bleiben wirksam.

Version-1-Vertrag akzeptiert HELLO-Versionen 0.2.0/0.2.1; Heartbeat hat optional `capabilities`. Fähigkeit kann `observedAt` als Agentbeobachtungszeit melden. Server stempelt Bericht zusätzlich mit eigenem `reportedAt`; API berechnet `current` aus tatsächlicher Verbindung und weniger als 15 Sekunden altem Empfang. Clientzeitstempel oder Heartbeat ohne neuen Bericht hält alte Pluginbeobachtung nicht aktuell. Keine SQL-Schemaänderung; vorhandene JSON-Fähigkeitsspalte genutzt.

Übertragen werden nur Fähigkeitsname, Quelle, Verfügbarkeit und Beobachtungszeit. Port, Authentifizierungsstring, Rohantwort/Uhrtext, Fehlertext, Titel, Dateipfade oder Deckwerte werden nicht übertragen. Status ist ein Software-Lesenachweis eines eingerichteten lokalen Endpunkts; kein PA-, Play/Pause-, Deckpositions-, Drift- oder Synchronitätsbeleg. Tatsächliche Musik-/Lichtaktionen bleiben dem späteren lokalen Livebetrieb vorbehalten.

## Tatsächliche Nachweise

Erste Abfrage in diesem Arbeitsabschnitt nicht bestätigt. Betreiber hat Plugin aktiviert und erneuten Test beauftragt; gültiger `get_clock` danach bestätigt. Neue lokale Fähigkeitsfunktion meldet gegen dieselbe echte Plugininstanz `available`, ohne Zugangsdaten/Rohantwort im Bericht. FLX4 weiterhin nicht angeschlossen; nur DJ-Rechner verfügbar. Plugin lauscht auf 0.0.0.0; eingehende Erreichbarkeit für Dauerbetrieb bleibt zu begrenzen.

Automatisierte HTTP-Vertragstests sind synthetisch: fehlende/ungültige Einrichtung, Profiltrennung, authentifizierte feste Abfrage, gemeinsame Anfrage statt Überlappung, Erfolg/Fehler/Erholung, keine Secrets/Rohantwort im Bericht, Redirect-/Größen-/Antwortbody-Zeitgrenze. PostgreSQL-/Socketprüfung prüft Heartbeataktualisierung, Fehler/Erholung bei gleicher Epoch und veralteten Bericht trotz Verbindung. Browserprüfung zeigt Zustände mit ausdrücklich bezeichneter Vertragstestfähigkeit, Mobilansicht und ungeprüften Status nach Widerruf. Kein Ersatz für reale Pluginverlust-/Erholungsprüfung am Ziel.

Build/Test/Paket: Befehle in [Agentanleitung](s2-agent.md). Weitere tatsächliche lokale/CI-/Zielergebnisse und Produktionsrevisionen in [Status](status.md)/[Protokoll](protokoll.md); nicht aus Implementierung als bestanden ableiten.
