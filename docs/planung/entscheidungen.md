# Entscheidungsprotokoll

## D018 – Installationsanwendung für den Streaming-Rechner

- Status: bestätigt durch ausdrücklichen Betreiberauftrag; Umsetzung/Nachweise getrennt
- Datum: 14. Oktober 2026
- Vorgabe: Das Anwenderpaket für den Streaming-Rechner wird als Windows-Installationsanwendung bereitgestellt.
- Umsetzung: kostenlose Inno-Setup-EXE mit Server, eigener Node-Laufzeit und nach erfolgreichem nativen Build dem Renderer; deutsche Hinweise, Startmenü, datenerhaltende Deinstallation. Server-Vorabpaket ohne Renderer ausdrücklich gekennzeichnet.
- Grenzen: Kein vorweggenommener HDMI-/Streaming-/Hardwarebeleg. Bestehende Fachrechte, Livefreigabe und Ausfallregeln bleiben verbindlich. [Ablauf und tatsächliche Grenzen](../entwicklung/s3-streaming-installer.md).

## D001 – Dokumentationsstand 2.0

- Status: bestätigt als Ausgangsstand der bisherigen Planung
- Datum: 9. Oktober 2026
- Inhalt: Gesamtkonzept, Spezifikation und Architektur wurden zusammengeführt. Sie beschreiben Anforderungen und offene Nachweise, keine fertige Software.
- Grundlagen: [Gesamtkonzept](../gesamtkonzept.md), [Anforderungen](../anforderungen.md), [Architektur](../architektur.md).

## D002 – Planung in GitHub

- Status: bestätigt
- Datum: 9. Oktober 2026
- Auftrag: aktuelle Dokumentation im Repository ShowNight-System ablegen und anschließend die Planung dort dokumentieren.
- Umsetzung: Markdown als bearbeitbarer Dokumentationsstand; Word als datierter Export. Offene Fragen werden getrennt von bestätigten Entscheidungen geführt.

## D003 – Entwicklungsübergabe

- Status: bestätigt; ursprüngliche Startreihenfolge durch D013 präzisiert
- Datum: 9. Oktober 2026
- Antwort: alle zehn Optionen A bestätigt.
- Entscheidungen: [vollständige Antworten](entwicklungsuebergabe.md).
- Umsetzung: [Entwicklungsauftrag](../entwicklung/auftrag.md), [Arbeitspakete](../entwicklung/arbeitspakete.md) und AGENTS.md.
- Offene Bedienfragen zur Veranstaltung bleiben davon unberührt.

## D004 – Veranstaltung anlegen

- Status: bestätigt
- Datum: 9. Oktober 2026
- Antworten: 1A, 2A, 3A, 4A, 5A, 6A, 7C, 8A, 9A, 10A.
- Regeln: [bestätigte Runde](veranstaltung-anlegen.md); verbindlicher Bedienablauf in Gesamtkonzept und Anforderungen.
- Ergebnis: Name als einzige erste Pflichtangabe, Vorlagen und anpassbare Module, persönliche Übersicht, feste Seitenleiste und dauerhaft erreichbarer Veranstaltungswechsel.

## D005 – Show anlegen und vorbereiten

- Status: bestätigt
- Datum: 9. Oktober 2026
- Antworten: 1A bis 10A.
- Regeln: [vollständige Antworten](show-vorbereiten.md), verbindlicher Bedienablauf in Gesamtkonzept und Anforderungen.
- Ergebnis: direkte Arbeitsfläche, aufklappbare Abschnitte, frei einfügbare Einsätze, Vorlagen, Einsatzhinweise, zugewiesene Platzhalter und Team-Prüfübersicht.

## D006 – Bedienung des Szeneneditors

- Status: bestätigt
- Datum: 9. Oktober 2026
- Antworten: 1A bis 10A.
- Regeln: [vollständige Antworten](szeneneditor.md), verbindlicher Bedienablauf in Gesamtkonzept und Anforderungen.
- Ergebnis: eingebetteter Editor, direkte Werkzeuge, kontextbezogene Eigenschaften, automatische Entwurfsspeicherung, eigene Wiedergabeprüfung und sichtbare Medienfehler.

## D007 – Bedienung der Live-Regie

- Status: bestätigt
- Datum: 9. Oktober 2026
- Antworten: 1A bis 10A.
- Regeln: [vollständige Antworten](live-regie.md), verbindlicher Bedienablauf in Gesamtkonzept und Anforderungen.
- Ergebnis: Vorschauauswahl getrennt von GO, eigener Direktbefehl, einmalige Übergangswahl, Übernahmesperre während des Übergangs, direkte zusätzliche Ansichten und sichtbare Eingriffe/Fehler.

## D008 – Daten, Versionen und Zusammenarbeit

- Status: bestätigt
- Datum: 9. Oktober 2026
- Antworten: 1A bis 10A.
- Regeln: [vollständige Antworten](daten-versionen.md), verbindliche Fachregeln in Gesamtkonzept und Anforderungen.
- Ergebnis: Veranstaltungskopien, bewusste Vorlagenupdates, Löschschutz, Papierkorb, explizite Textkonflikte, Wiederherstellungsentwürfe und nachvollziehbare Versionierung.

## D009 – Liveaktivierung vorbereiteter Datenstände

- Status: bestätigt
- Datum: 9. Oktober 2026
- Antworten: 1A bis 10A.
- Regeln: [vollständige Antworten](liveaktivierung.md), verbindliche Fachregeln in Gesamtkonzept und Anforderungen.
- Ergebnis: geprüfte vollständige Aktivierung, laufende Ausgabe bleibt, veraltete Vorbereitung wird markiert, bewusste GO-Zielbestätigung bei Löschung/Verschiebung, atomare Rückkehr.

## D010 – Szenen, Einsätze, Aktionen und Durchläufe

- Status: bestätigt
- Datum: 9. Oktober 2026
- Antworten: 1A bis 10A.
- Regeln: [vollständige Antworten](zuordnungen.md), Fachregeln in Gesamtkonzept und Anforderungen.
- Ableitung: [fachliches Datenmodell für den ersten Ablauf](../entwicklung/datenmodell.md).
- Ergebnis: wiederverwendbare Szenen, Einstellungen je Einsatz, reine Aktionseinsätze, versionierte Bausteine und getrennte Durchläufe.

## D011 – Persönliche Vorschau und gemeinsamer Showablauf

- Status: bestätigt
- Datum: 9. Oktober 2026
- Antworten: 1A bis 10A.
- Regeln: [vollständige Antworten](vorschau-gemeinsam.md); Fachregeln in Gesamtkonzept, Anforderungen und Datenmodell.
- Ergebnis: persönliche Vorschau, gemeinsames GO-Ziel, explizite Vorbereitung, erste gültige konkurrierende Änderung, gemeinsamer Vorhörkanal je Notebook.

## D012 – Durchläufe starten, wechseln und beenden

- Status: bestätigt
- Datum: 9. Oktober 2026
- Antworten: 1A bis 10A (Groß-/Kleinschreibung ohne Bedeutung).
- Regeln: [vollständige Antworten](durchlaeufe.md), Fachregeln in Gesamtkonzept, Anforderungen und Datenmodell.
- Ergebnis: bewusster Start ohne ersten GO, isolierte Simulationsprobe, expliziter Showwechsel, vorbereitete Wechsel-/Abschlussaktionen und erhaltene Durchlaufhistorie.

## D013 – Agiler Start: Netcup-Server vor Windows-Agenten

- Status: bestätigt durch ausdrücklichen Auftrag
- Datum: 9. Oktober 2026
- Auftrag: drei technische Übergabedokumente vorbereiten und Startprompt erstellen; Entwicklung mit Netcup-Server beginnen, danach Agent für die Rechner.
- Reihenfolge: S1 Online-Server, S2 Windows-Agenten, S3 lokaler Server/Medienausgabe, S4 vollständiger Showablauf.
- D003 bleibt hinsichtlich Gesamtumfang, PR-Arbeit, Simulation, Design und Fertigkriterien bestehen. Nur die anfängliche Reihenfolge wird präzisiert.
- Dokumente: [Datenmodell](../entwicklung/datenmodell.md), [Schnittstellen](../entwicklung/schnittstellen.md), [Abnahmeplan](../entwicklung/abnahmeplan.md), [Startprompt](../entwicklung/codex-startprompt.md).
- Technische Schemas/Bezeichner sind abgeleitete Implementierungsvorschläge, keine zusätzlich bestätigten Produktregeln.

## D014 – Systemdomain und Mailanbieter

- Status: bestätigt
- Datum: 9. Oktober 2026
- Systemdomain: eventmanagement.jungschuetzen-flueren.de.
- Mail: benötigte Postfächer können bei Netcup angelegt werden; konkrete Adressen und SMTP-Zugang noch offen.
- Umsetzung: [Domain-/Mailkonfiguration](../entwicklung/domain-email.md) und ergänzter Codex-Startprompt.
- Nicht bestätigt: bereits erfolgte DNS-/Postfachanlage, Testdomain, öffentliche Shopadresse oder erfolgreiche Zustellung.

## D015 – Vorhandenen Nginx verwenden

- Status: vorhandener Nginx durch Benutzer bestätigt
- Datum: 9. Oktober 2026
- Folge: Bestehenden Reverse Proxy integrieren; keinen zusätzlichen Proxy als Voraussetzung aufbauen.
- Standort/Betriebsart durch D016 geklärt: Docker auf derselben VM. Offen bleiben Upstream-/Netzwerkparameter, Zertifikatsverwaltung und Route für die Systemdomain.
- Containeraufteilung Anwendung/PostgreSQL/Worker bleibt technischer Startvorschlag; kein Fachmodul-Microservice-Zwang.

## D016 – Nginx-Container auf derselben VM und Portainer

- Status: bestätigt
- Datum: 9. Oktober 2026
- Umgebung: Nginx als Docker-Container auf derselben Netcup-VM, Portainer vorhanden.
- Genannte Proxy-Adresse: proxy.familie-schapfeld.de.
- Folge: vorhandenes Proxy-Netz verwenden; Anwendung über internen Docker-Upstream anbinden. Keine neue Proxyinstallation.
- Offen: tatsächliches Proxy-Produkt/Image, Container-/Netzwerkname, Portainer-Deploymentmodus und neue Domainroute.
- Anleitung: [Deployment](../entwicklung/deployment.md).

## D017 – Softwarearbeiten fortsetzen, Funktionstests später nachholen

- Status: bestätigt durch ausdrücklichen Betreiberauftrag
- Datum: 10. Oktober 2026
- Auftrag: „weitermachen mit den Themen, die wir schon bearbeiten können“; Funktionstests können nachgeholt werden.
- Folge: Vorbereitbare Softwarepakete weiterentwickeln, ohne auf derzeit fehlende Geräte oder weitere Testrechner zu warten. Technische Build-/Integrationsprüfungen begleiten die Implementierung; spätere Bedien-/Geräte-/Hardwarefunktionstests bleiben ausdrücklich offen.
- D013-Reihenfolge und vollständiger F01–F50-/A01–A30-Umfang bleiben bestehen. Keine Veranstaltungsfreigabe und keine als fertig bezeichnete reale Ausgabe ohne Nachweis. Die frühere pauschale Entwicklungssperre vor Gerätenachweisen aus den Arbeitspaketen wird durch diesen Auftrag präzisiert.
- Erster weiterer Baustein: S3-01 Inhaltspakete mit lokaler SQLite-Ablage. Kein neues Rechte-/Ausfallmodell, keine Liveaktivierung und keine Ablösung des geplanten Windows-Renderers durch Browserausgabe.
- Dokumente: [Arbeitspakete](../entwicklung/arbeitspakete.md), [Paketablage](../entwicklung/s3-paketablage.md), [Status](../entwicklung/status.md).

## Weitere Entscheidungen nach D017

### Native Szenenkomposition – technische Konkretisierung, 14. Oktober 2026

Status: Umsetzungsteil des fortgesetzten Betreiberauftrags, keine neue Fachentscheidung. Bestehende Szenendefinition und Manifest v2 werden im vorhandenen nativen Prozess als stumme 640×360-Softwarediagnose komponiert. Gehashter privater Snapshot bis 1 MiB statt erweiterter IPC-Nachricht, explizite WIC-PNG-/JPEG-Decoder und begrenzte Bildbudgets. Globale Admin-Diagnose bleibt von persönlichen Vorschauen, Liveaktivierung, Show-GO und Geräteausgabe getrennt. Keine Rechte-/Ausfalländerung; [Bedienung und Grenzen](../entwicklung/s3-native-szenen.md).

### S3-06 – technische Konkretisierung, 14. Oktober 2026

Status: Umsetzungsteil des fortgesetzten Betreiberauftrags, keine neue Fachentscheidung. Erste Szenenentwürfe speichern Text/Rechteck/Bild getrennt von Livezuständen. Exklusive Lease je Szene/Sitzung (90 Sekunden, Heartbeat 20 Sekunden), eigene Revision, ausdrückliche lokale Entwurfswiederherstellung und versionierte Paketübertragung konkretisieren D006/D008/D010. Browser-SVG ist nur Entwurfsdarstellung; Konva und nativer Renderer bleiben Ziel. Keine geänderte Regie-, Rechte-, Aktivierungs- oder Ausfallregel. [Vertrag/Grenzen](../entwicklung/s3-szenenentwuerfe.md).

### S3-04 – technischer Umsetzungsteil, 14. Oktober 2026

Status: Betreiber beauftragt Renderer-Grundlage trotz fehlendem Testclient; umfangreiche Funktionstests später. Architektur bleibt C++/GStreamer/Skia. Erstes Paket verwendet einen isolierten stummen Offscreen-Diagnoseweg und lokale Prozessanbindung; Full HD/Direct3D11/HDMI/WebRTC/Ton/Regie-/Ausfallabnahme bleiben Ziele mit offenen Nachweisen. Keine bestätigten Fachrechte oder Ersatzregeln durch einen Prototyp ändern. [Anleitung](../entwicklung/s3-renderer.md), [Status](../entwicklung/status.md).

### S3-03 – technische Umsetzung, 10. Oktober 2026

Status: technische Konkretisierung des beauftragten lokalen Servers nach D017, keine neue Fachentscheidung. Opt-in LAN-Neueinrichtung mit bestimmter privater IPv4-Adresse und passendem HTTPS-IP-Zertifikat; Loopback bleibt Standard. Clientvertrauen/Firewall werden gezielt manuell eingerichtet. Keine zusätzlichen Fachrechte, Regieübernahme, Wildcard, Liveautoritätsumschaltung oder Änderungen am vorgesehenen Ausfallverhalten. Bestehende Profilumstellung und echte Mehrgeräte-/Hardwareabnahme bleiben offen. [Anleitung](../entwicklung/s3-lan.md), [Nachweise](../entwicklung/status.md).

### S3-02 – technische Umsetzung, 10. Oktober 2026

Status: Umsetzung im ausdrücklich beauftragten Arbeitspaket; keine neue Fachentscheidung. F30 verlangt vorbereitete interne Konten, MFA für Admin/Leitung, lokale Sperren, persönliche Offlineeinrichtung und gesonderte administrative Recovery. S3-02 konkretisiert dies mit einem separat signierten und zielverschlüsselten Kontenstand, CurrentUser-DPAPI und Loopback-HTTPS. Gemeinsame Quellidentitäten und vorhandene Veranstaltungsrollen bleiben erhalten. Lokale Änderungen werden vorgemerkt; Onlineabgleich und LAN bleiben offen. [Anleitung](../entwicklung/s3-lokalserver.md), [Status](../entwicklung/status.md).
Neue Empfehlungen bleiben offen bis zur Bestätigung.

Für neue Einträge: Kennung, Datum, Status, Entscheidung, betroffene Dokumente und gegebenenfalls ersetzte Entscheidung festhalten.


## PR-Bug-Korrekturen – technische Umsetzung, 14. Oktober 2026

Status: ausdrücklich beauftragte Fehlerbehebung, keine neue Fachentscheidung. Bestehende gleichberechtigte Leitungsrechte, MFA-Pflicht und Rechtewiderruf werden durchgesetzt; Einladungsrecovery setzt keine eingerichteten Kennwörter zurück. Mailversandart dauerhaft gespeichert; neue Migration 5 vermeidet Kollision mit bestehender Szenenmigration 4. Alle offenen PRs erhalten Nachprüfung ihrer aktuellen Softwarestände; unbelegte Hardware-/Dauerbetriebs-/Zustellfälle bleiben offen. Kein autonomer PR-Merge oder Produktivupdate. [Nachweise](../entwicklung/pr-bug-abnahme.md).

## S3-08 – lokale Übersicht, technische Umsetzung, 14. Oktober 2026

Status: ausdrücklich beauftragt, keine neue Fachentscheidung. Bestehende lokale Weboberfläche um MFA-geschützte Systemübersicht ergänzen, vorgeschalteter kleiner Windows-PowerShell-/Forms-Launcher für vorhandene Startbefehle und Datenpfade. Read-only DisplayConfig/CoreAudio-Inventar ist keine Ausgabezuordnung oder Hardwarefreigabe. Kein neues Desktopframework, keine geänderten Rechte/Regie-/Ausfallregeln. Fehlende Kameras/Streams/physische Ausgabe bleiben offen. [Ablauf und Nachweise](../entwicklung/s3-serveruebersicht.md).

## Online-Kontowiederherstellung – 15. Oktober 2026

Status: ausdrücklich bestätigt. Nutzer beauftragt E-Mail-Passwortreset mit gestalteter Mail; auf Rückfrage erhält jedes Konto eine eigene bestätigte E-Mail-Adresse, auch bei reinem Benutzernamen. Bestätigung bleibt Voraussetzung für Wiederherstellung. MFA und Rollen bleiben erhalten. Geeignete Entwicklungsstände sollen zu einer sichtbaren Online-Version zusammengeführt/mergt werden; weitere lokale Fachentwicklung folgt danach. Ticketshop und Stage Timer bleiben offen und im Gesamtumfang. Keine Produktionsbereitstellung oder echte E-Mail durch die Softwareprüfungen.

## D022 – Ticketshop S8-02: Saalplan, Gastshop und Reservierung

- Status: vom Betreiber am 19\. Oktober 2026 im Claude-Chat beantwortet; direkte Bestätigung in [Issue #43](https://github.com/SchapfeldNils/ShowNight-System/issues/43) erbeten.
- Entscheidung: S8-02 umfasst Saalplan-Editor und Gastshop; Shop zunächst nur als Käufervorschau, öffentlicher Link erst nach O11 und Betreiberfreigabe je Veranstaltung; Haltezeit 15 Minuten; Missbrauchsschutz über Limits und Fallenfeld ohne Captcha; Pflichtdaten Name, E-Mail, Telefon; optional Postversand mit Pflichtanschrift und einstellbarer Versandgebühr; neue Veranstaltungsrolle „Verkauf“ zusätzlich zu Admin und Leitung; Bestellmails nur Testmodus bis zur Freigabe.
- Betroffen: [ticketshop-s8-02.md](ticketshop-s8-02.md), [anforderungen.md](../anforderungen.md) Kapitel 11–13.
- Nachtrag 19\. Oktober 2026 (Claude-Chat, direkte Bestätigung in #43 erbeten): Die Rolle „Verkauf“ wird bis zum Einlass-/Abendkassenpaket nicht ins Offlinepaket übertragen (P7). Saalpläne werden zunächst nur zwischen Veranstaltungen kopiert, mit Recht auf beide; eine veranstaltungsübergreifende Vorlagenbibliothek folgt später (P8). Ebenfalls im Claude-Chat beantwortet: „Verkauf“ ohne MFA-Pflicht (P1), „Verkauf“ bearbeitet auch Ticketarten, Preise, Kontingente und Verkaufszeiten (P2), Versandgebühr pauschal je Bestellung (P3), Vorschau mit getrenntem, löschbarem Testbestand (P4). Weitere Einzelheiten (Claude-Chat, 19\. Oktober 2026): Lückenregel neuer Bereiche standardmäßig „Hinweis“; Reihen ab Bühne mit 1, 2, …, Plätze von links in Blickrichtung zur Bühne; Bereiche mit freier Platzwahl gehören dazu; Postversand nur innerhalb Deutschlands; Käufervorschau nur für Admin, Leitung und Verkauf; Käuferdaten werden 6 Monate nach der Veranstaltung anonymisiert; Bestelllink gültig bis 30 Tage nach der Veranstaltung.

## D023 – Szeneneditor Paket 2: zuerst Videoebenen

- Status: vom Betreiber am 19\. Oktober 2026 im Claude-Chat beantwortet; direkte Bestätigung in [Issue #44](https://github.com/SchapfeldNils/ShowNight-System/issues/44) erbeten.
- Entscheidung: Das nächste Editorpaket bringt Videoebenen aus der Medienbibliothek mit Abspielen, Pause und Zeitleiste im Editor (D006 Punkt 7) sowie dem bereits festgelegten Verhalten am Videoende. Vorlagen sowie Drehung, Sperren und Gruppen folgen danach. Keine Publikumsausgabe aus dem Editor.
- Betroffen: [szeneneditor.md](szeneneditor.md), Szenenvertrag und Renderer.
- Nachtrag 19\. Oktober 2026 (Claude-Chat, direkte Bestätigung in #44 erbeten): Am Videoende zunächst nur „letztes Bild“ oder „Wiederholen“; „Folgeinhalt“ und „Folgeaktion“ kommen mit Showablauf Paket 2 (P6).

## D024 – Live-Bühnenmonitor: Browser-Vollbild, Bedienrecht wie GO

- Status: vom Betreiber am 19\. Oktober 2026 im Claude-Chat beantwortet; direkte Bestätigung in [Issue #41](https://github.com/SchapfeldNils/ShowNight-System/issues/41) erbeten.
- Entscheidung: Der Live-Bühnenmonitor zeigt Timer und Hinweise zuerst auf einer eigenen Vollbildseite des lokalen Servers (Rechner oder Tablet am Bühnenmonitor), nicht über den nativen Renderer-Ausgang. Bedienen dürfen globale Admins sowie die Rollen Live und Technik, wie GO in D021.
- Betroffen: [s4-showablauf.md](../entwicklung/s4-showablauf.md) (nach Merge von #56), [stage-timer-vorbereitung.md](../entwicklung/stage-timer-vorbereitung.md).
- Nachtrag 19\. Oktober 2026 (Claude-Chat, direkte Bestätigung in #41 erbeten): Die Monitorseite ist für angemeldete Teammitglieder und zusätzlich über einen widerrufbaren, nur lesenden Anzeige-Link erreichbar, den Admins, Live und Technik erzeugen (P5).

## D025 – Zeitplan und Pflichtumfang bis zur ersten Veranstaltung

- Status: vom Betreiber am 19\. Oktober 2026 im Claude-Chat beantwortet; direkte Bestätigung in [Issue #43](https://github.com/SchapfeldNils/ShowNight-System/issues/43) erbeten.
- Entscheidung: Erste Veranstaltung am 10\. April 2027, öffentlicher Kartenverkauf ab Anfang Januar 2027. Zum Verkaufsstart zwingend: Überweisung mit manueller Bestätigung (Standardfrist 7 Tage, keine automatische Stornierung), Tickets als ein PDF je Bestellung mit einem QR je Karte per E-Mail, Gruppenbuchungen. Interner Verkauf durch das Team ist zum Januar nicht zwingend. Papierkarten bei Postversand druckt und verschickt das Verkaufsteam. Einlass per QR-Scan mit Smartphone/Tablet über den lokalen Server. Veranstalter ist der Verein (e. V.); O11-Angaben folgen vom Betreiber.
- Zuständigkeit: Codex implementiert die Ticketlinie, Claude prüft; Claude implementiert parallel Bühnenmonitor (C3) und Videoebenen (C4), Codex prüft.
- Betroffen: [implementierungsplan-codex.md](../entwicklung/implementierungsplan-codex.md) Abschnitt 8.

## D026 – Merge durch den unabhängigen Prüfer

- Status: vom Betreiber am 19\. Oktober 2026 im Claude-Chat beantwortet; direkte Bestätigung in [PR #63](https://github.com/SchapfeldNils/ShowNight-System/pull/63) erbeten.
- Entscheidung: Der Agent, der einen PR unabhängig geprüft und nicht selbst implementiert hat, darf ihn mergen, wenn die CI am geprüften Commit vollständig grün ist und keine Befunde offen sind. Gilt für Code- und Dokumentations-PRs, nie für Produktivupdates oder echte Geräteaktionen.
- Betroffen: [zusammenarbeit.md](../entwicklung/zusammenarbeit.md) Abschnitt 7, [AGENTS.md](../../AGENTS.md).

## D027 – Betrieb: Schema-7-Update und Sicherungsziel

- Status: vom Betreiber am 19\. Oktober 2026 im Claude-Chat beantwortet; direkte Bestätigung in [PR #53](https://github.com/SchapfeldNils/ShowNight-System/pull/53) und [Issue #3](https://github.com/SchapfeldNils/ShowNight-System/issues/3) erbeten.
- Entscheidung: Codex führt das Netcup-Update auf Schema 7 nach Merge von #53 und #59 gemäß Anleitung durch. Die verschlüsselte externe Sicherung geht auf einen Netcup Storage Space; Aufbewahrung 7 tägliche, 4 wöchentliche und 3 monatliche Archive.
- Betroffen: [netcup-update-schema7.md](../entwicklung/netcup-update-schema7.md) (nach Merge von #53), [backup-betrieb.md](../entwicklung/backup-betrieb.md).

