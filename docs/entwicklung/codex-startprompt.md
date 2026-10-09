# Startprompt für Codex

Arbeite im Repository https://github.com/SchapfeldNils/ShowNight-System.

Entwickle das ShowNight-System agil in prüfbaren Arbeitspaketen. Beginne jetzt mit Code, nicht mit einer weiteren allgemeinen Planungsrunde. Die erste Priorität ist der auf einer Netcup-VM betreibbare Online-Server. Danach folgt der Windows-Agent für die vorhandenen Rechner. Die lokale Medienausgabe und der durchgängige Showablauf folgen darauf.

## Zuerst lesen
- AGENTS.md
- docs/entwicklung/auftrag.md
- docs/entwicklung/arbeitspakete.md
- docs/entwicklung/datenmodell.md
- docs/entwicklung/schnittstellen.md
- docs/entwicklung/abnahmeplan.md
- docs/entwicklung/domain-email.md
- docs/architektur.md
- docs/anforderungen.md
- docs/planung/entscheidungen.md und docs/planung/offene-punkte.md

D013 legt die aktuelle Startreihenfolge fest. D004–D012 enthalten bestätigte Bedienregeln. Technische Startentwürfe sind begründbar anpassbar; Fachentscheidungen nicht still verändern.

## Bestätigte Bereitstellungsangaben D014
Öffentliche Systemadresse: https://eventmanagement.jungschuetzen-flueren.de. Mailpostfächer können bei Netcup bereitgestellt werden. Plane einen konfigurierbaren SMTP-Adapter mit Testmodus und dauerhafter Versandwarteschlange. Konkrete Postfächer, SMTP-Werte und Secrets sind noch offen. Keine reale DNS-/Postfachanlage oder Zustellung behaupten; reale Nachrichten erst mit passender Autorisierung und konfiguriertem Zielversand.

## Paket S1: Netcup-fähiger Server
1. Prüfe Repository und vorhandenen Code. Erstelle einen Arbeitsbranch.
2. Richte das gemeinsame Projekt für React/TypeScript, Node.js/TypeScript/Fastify, PostgreSQL und gemeinsame validierte Schemas ein. Halte Module getrennt; verwende kostenlose Komponenten mit dokumentierten Lizenzen.
3. Baue einen reproduzierbaren Entwicklungsstart und eine Netcup-fähige Containerbereitstellung: App/API, PostgreSQL, Hintergrundworker, Integration in den vorhandenen Nginx für HTTPS, persistenter Medienspeicher, konfigurierte Umgebungsvariablen, Health/Readiness, Migrationen sowie Sicherung/Wiederherstellung.
4. Implementiere Benutzer/Sitzungen, einmaligen Admin-Bootstrap, erforderliche MFA für Admin/Leitung und eventbezogene Rechte. Kein gemeinsames Standardkennwort, keine Secrets im Repository.
5. Liefere eine tatsächlich bedienbare Browsergrundlage: Veranstaltung nur mit Namen anlegen, Teams zuordnen, unabhängige Show vorbereiten und als Eventkopie aufnehmen, Medien sicher hochladen, Speicher-/Analysezustand anzeigen, Versionskonflikte behandeln und ein Paketmanifest erzeugen.
6. Erstelle synthetische Demo-Daten. Gerätekanal ausschließlich klar markiert simulieren, ohne echte Bühnenaktionen oder E-Mails.
7. Prüfe S1 gemäß Abnahmeplan. Dokumentiere reale Ergebnisse, nicht nur geplante Tests. Stelle Code und Anleitung in einem Pull Request bereit.

Noch unbekannte VM-Ausstattung, Betriebssystem, Domain, Mail-/SSH-Zugänge und Sicherungsziele sind Deploymentparameter. Erstelle konfigurierbare Vorlagen und einen genauen Installationsablauf. Falls Zielzugang fehlt, erledige trotzdem Implementierung und lokale/CI-Prüfungen. Behaupte keine erfolgte Netcup-Installation. Bei später autorisiertem Deployment keine bestehende VM neu installieren oder Dienste löschen, ohne diesen Umfang geklärt zu haben.

## Paket S2: Windows-Agent, erst nach nutzbarer S1-Grundlage
Ein konfigurierbarer Agent mit Profilen dj/light/main, Gerätepaarung, widerrufbarer Identität, Heartbeats, Fähigkeiten, Diagnose, idempotenten Befehlen und sicherer Wiederverbindung. Adapter für Virtual DJ, Daslight, APC Mini MK2, Stream Deck und Vorhören vorbereitet modular aufbauen. Reale Schnittstellen anhand offizieller Dokumentation und vorhandener Software prüfen; unbekannte Fähigkeiten ausdrücklich unsupported/unknown melden. Keine erfundenen APIs.
Erste Agenten können den Netcup-Server zum Pairing/Diagnosetest verwenden. Der Veranstaltungsbetrieb steuert reale Ausgaben später vom lokalen Server, ohne Internetabhängigkeit.

## Danach
S3: denselben Serverkern lokal unter Windows mit SQLite und vollständigen Medienpaketen betreiben; nativen Medienprozess und HDMI-Ausgabe vorbereiten.
S4: Veranstaltung → Show → Szene → persönliche Vorschau → gemeinsames nächstes GO-Ziel → GO → eigene Publikumsausgabe. Zwei jederzeit gleichberechtigte Regien, keine Regieübernahme. Vorschau und Publikumston getrennt.

Der Netcup-Server dient Vorbereitung und Verwaltung, nicht Live-HDMI-/Kameraausgabe. OBS ist ausgeschlossen. Virtual DJ und Daslight bleiben auf den Notebooks. Musik-/Lippensynchronität und FLX4-Vorhören sind reale technische Nachweise, keine bloßen Softwareversprechen.

## Arbeitsweise und Lieferung
- Ein Branch/Pull Request je zusammenhängendem Paket. Keine automatischen Merges.
- Kleine reversible Implementierungsdetails selbst entscheiden und dokumentieren. Nur grundlegende Produktentscheidungen oder größere Architekturänderungen zurückfragen.
- Aktualisiere docs/entwicklung/status.md mit Implementiert/Getestet/Simuliert/Blockiert/Offen sowie Startbefehlen, Prüfergebnissen und nächstem Paket.
- Halte Anforderungen, Verträge und tatsächlichen Code konsistent; erhalte F-/A-Kennungen.
- Verwende deutsche UI-Texte und vorhandene ShowNight-Designquellen. Fehlende Originaldateien offen markieren; temporäre Gestaltung nicht als finales Design ausgeben.
- Erste Veranstaltungsfreigabe bleibt der vollständige vereinbarte Scope. S1/S2 sind Entwicklungszwischenstände.
- Ergebnis je Paket: nutzbarer Ablauf, passende Tests, dokumentierter Start/Installation, bekannte Grenzen und PR-Link.

Beginne mit S1 und führe dessen autorisierte Arbeit bis zu einem überprüfbaren Ergebnis aus.


## Vorhandener Nginx (D015)
Nginx-Reverse-Proxy ist bereits vorhanden. Keinen zusätzlichen Proxycontainer oder neue konkurrierende TLS-Verwaltung installieren. Erstelle passende Nginx-Konfigurationsvorlage und Anleitung für die Systemdomain. Nginx-Standort/Betriebsart zunächst als Deploymentparameter behandeln; Host-, Container- oder externen Proxy nicht ungeprüft gleichsetzen. Bestehende Dienste/Zertifikate erhalten. WebSockets, Uploads, Timeouts und vertrauenswürdige Proxyheader prüfen; Datenbank nicht öffentlich exponieren. Vorgeschlagene Compose-Dienste: Anwendung, PostgreSQL und Worker mit dauerhaften Speicherbereichen.
