# Show Night – Technische Architektur

Version 2.0 · Entwicklungsgrundlage vom 9. Oktober 2026

## 1. Entscheidung

Wir entwickeln ein modulares Veranstaltungssystem mit lokaler Showplattform mit Browseroberfläche, zentralem Showserver, eigenem nativen Medienprozess und Geräteadaptern. Der Onlinebetrieb dient der Vorbereitung und kann nach bewusster Umschaltung Einlass und Organisation übernehmen. Vollständig bereitgestellter lokaler Betrieb benötigt kein Internet. Diese Auswahl ist die Grundlage für technische Prototypen, keine bereits bestandene Hardware- oder Integrationsabnahme.

| Baustein | Gewählte Grundlage | Aufgabe |
|---|---|---|
| Weboberfläche | React und TypeScript | Gemeinsame Verwaltung, Regie, Tabletquiz und Einrichtungsoberfläche |
| Grafischer Editor | Konva / react-konva | Interaktive Zeichenfläche, Auswahl, Verschieben und Skalieren; zusätzliche Editorfunktionen selbst entwickeln |
| Showserver | Node.js LTS, TypeScript, Fastify | API, Rechte, Ablauf, Quiz, Versionen, Synchronisation und Gerätekoordination |
| Lokale Datenhaltung | SQLite plus Medienverzeichnis | Bearbeitungsstände, Pakete, Durchläufe und Protokolle; Zugriff ausschließlich über Server |
| Online-Datenhaltung | PostgreSQL plus Medienverzeichnis | Mehrbenutzerbearbeitung und Projektverwaltung auf Netcup |
| Native Medienkomponente | C++ mit GStreamer | Videos, Kameras, Audio, Komposition, Medienzeit, Ausgabe und Vorschau |
| Grafikadapter der Medienkomponente | Skia | Text, Formen, Verläufe und grafische Ebenen; Integration in Medienkomposition selbst entwickeln |
| Vorschauübertragung | WebRTC | Tatsächlich gerenderte Vorschau-/Programmbilder und separater Vorschauton ins Notebook |
| Geräteagent | TypeScript/Node.js plus notwendige native Adapter | VirtualDJ, Daslight, APC, Gerätezuordnung und optional native Vorhöranbindung |
| Stream Deck | Eigener Adapter über offizielles SDK | Freie Belegung und Rückmeldung; Elgato-Software bleibt zuständig für das Gerät |
| Audioanalyse | FFmpeg als Hintergrundwerkzeug | Lautheit/Spitzen messen und geeignete Wiedergabeanpassung oder abgeleitete Audiodatei vorbereiten |

Node.js wird auf einer unterstützten LTS-Linie eingesetzt; konkrete Patchstände werden bei Einrichtung festgehalten. C++ ist auf den Medien-/Audiozugriff begrenzt. Oberfläche, Projektlogik und die meisten Adapter bleiben TypeScript. Das begrenzt die Zahl unterschiedlicher Laufzeiten, ohne Videoverarbeitung in die Browser-Regie zu verlagern.

Konva liefert keinen fertigen Szeneneditor. GStreamer liefert keine fertige OBS-Ersatzanwendung. Ebenenmodell, Animationen, Quellverwaltung, Ausgabefenster und Fehlerregeln müssen wir selbst umsetzen. Insbesondere die Verbindung Skia–GStreamer und die Gleichheit von Editor und Livebild sind frühe Nachweise.

## 2. Verteilung auf Rechner

### Netcup

Weboberfläche, Onlinevariante des Servers, PostgreSQL, Medienspeicher und Analyse-Aufgaben. HTTPS-Zugang und Benutzerverwaltung. Keine Livekamera-, Bühnen- oder Veranstaltungsaudioausgabe. Medienanalyse läuft in einem begrenzten Hintergrundprozess und blockiert nicht die gemeinsame Bearbeitung.

### Windows-Hauptrechner

Lokaler Server und SQLite, vollständiger Medienspeicher, Medienprozess im angemeldeten Desktopbetrieb sowie lokaler Start-/Statusdienst. Der Renderer benötigt Zugriff auf Grafik und Bildausgänge; er wird nicht als gewöhnlicher Hintergrunddienst ohne Desktopzugriff behandelt.

Der Medienprozess besitzt getrennte Programmausgabe und vorbereitete Vorschau. Programmbild und Bühnenmonitor laufen in getrennten Ausgabefenstern. Der Programmausgabestream wird aus dem fertigen Bild erzeugt; die Browserregie baut das Livebild nicht unabhängig nach.

Ein Schließen der Browserregie beendet weder Server noch Renderer. Bei Serververlust soll der Renderer bereits laufende Medien weiterführen können; neue Aktionen und zentrale Timer-/Quizsteuerung sind dann eingeschränkt und werden nicht als funktionsfähig ausgegeben. Ein Rendererabsturz kann die Leinwandausgabe unterbrechen. Prozesstrennung ersetzt keinen Ersatzhauptrechner.

### Steuerungsnotebooks

Browserregie und lokaler Geräteagent. Auf Nils’ Notebook bleiben VirtualDJ Pro und DDJ-FLX4. Der APC wird vom Geräteagenten verwaltet; Doppelzuordnungen mit VirtualDJ werden vermieden. Daslight und Lichtinterface bleiben am Notebook des Kollegen. Anschlussort und Modell des Stream Decks werden bei Einrichtung erfasst.

Beide Regieplätze sind jederzeit gleichberechtigt; es gibt kein Übernahmeverfahren. Mehrere frei konfigurierte Fenster zeigen denselben Serverzustand und sind bedienbar oder reine Anzeige. Sie führen keine konkurrierenden GO-Listen.

### Tablets

Teilnehmer-, Moderator-, Jury- und Einlassansichten im Browser über eigenes Veranstaltungs-WLAN. Ein Team verwendet ein Tablet. Serverbestätigung bestimmt, ob eine Abgabe eingegangen ist. Die Antwortfrist ist serverseitig maßgeblich; eine Tablet-Uhr entscheidet nicht über Annahme und Punkte.

## 3. Daten und Kommunikation

Die Anwendung verwendet ein versioniertes Szenen-/Showformat. Medien werden mit stabilen Kennungen und Inhaltsprüfsummen referenziert. Pakete enthalten konkrete Versionen von Szenen, Gruppen, Schriften und Medien; keine zur Laufzeit unkontrolliert wechselnden Vorlagen.

HTTP dient Bearbeitung, Uploads, Paketübertragung und Abfragen. WebSockets übertragen laufende Zustände und Bedienbefehle. WebRTC transportiert Vorschauvideo und Vorhörton. Lokale Verbindung zwischen Server und Medienprozess erfolgt über einen ausschließlich lokalen Steuerkanal; Videoframes werden nicht als JSON durch den Showserver geleitet.

Jeder Befehl erhält Kennung, Sitzung und erwartete Ablaufversion. Der Server prüft Berechtigung und Zustand. Bereits bearbeitete Befehle werden nicht wiederholt; zwei GO-Befehle für dieselbe Ablaufposition können nicht zwei Schritte auslösen. Rückmeldungen unterscheiden angenommen, gestartet, beendet, fehlgeschlagen und extern unbestätigt.

Zeitkritische Medienabläufe werden vorbereitet und auf der Medienzeit ausgeführt. WebSocket-Zustandsübertragung allein ist keine Bild-/Musiksynchronisation. Framegenaue Animationen gehören in den Renderer; Verwaltungs- und Quizlogik gehören in den Server. Videoend-Ereignisse enthalten eine Wiedergabekennung, damit veraltete Ereignisse keinen neuen Einsatz verändern.

Es gibt keine direkte Replikation zwischen SQLite und PostgreSQL. Online-/Offlineabgleich erfolgt auf Projektebene mit Ausgangsrevision, Änderungen und Konfliktanzeige. Lokale Datenbankdateien werden nicht als gemeinsam beschreibbare Netzwerkdatei verwendet.

## 4. Editor und Rendering

Ein gemeinsames Schema beschreibt Ebenen, Koordinaten, Schriften, Farben, Zuschnitt, Animationen und Datenbindungen. Der Editor verwendet eine logische Szenengröße, unabhängig vom Browserzoom. Der Renderer löst dieselbe Szene gegen den aktiven Showstand und seine Datenwerte auf.

Konva stellt die Bearbeitungsfläche dar; Skia erzeugt die grafischen Ebenen der Liveausgabe. Unterschiedliche Text-/Schattendarstellung ist ein reales Integrationsrisiko. Vor Ausbau des Editors wird eine Vergleichsszene mit eigenen Schriften, mehrzeiligem Text, Verläufen, Transparenz und Animationen geprüft. Die gerenderte Ausgabe bleibt die verbindliche Wiedergabevorschau. Online muss ohne laufenden Hauptrechner eine Bearbeitungsvorschau verfügbar bleiben; genaue Ausgabeprüfung kann über serverseitige Renderjobs ergänzt werden.

GStreamer übernimmt Medienquellen und Komposition. Unter Windows wird der Direct3D11-Weg zuerst getestet. Grafikebenen werden nach Möglichkeit zwischengespeichert; unveränderte Texte und Formen dürfen nicht unnötig pro Frame neu erzeugt werden. Skia-Grafiken können zunächst als Texturen/Bildflächen eingebunden werden. Direkter GPU-Austausch, notwendige Kopien und aufwendige Animationen werden gemessen, nicht pauschal als performant vorausgesetzt.

## 5. Tonwege und Vorhören

Der Hauptrechner erzeugt Video-/Effektton zum Mischpult. VirtualDJ erzeugt Musik über seinen vorhandenen Tonweg. Die Showsoftware steuert nur zugeordnete Wiedergabeaktionen; Mikrofonmischung bleibt am Mischpult.

Vorschauton wird separat an das jeweilige Notebook übertragen. Im Browser sind nur verfügbare, erlaubte Ausgabegeräte wählbar. Beliebige Mehrkanal- oder ASIO-Routen folgen daraus nicht. Für nicht ausreichend zugängliche Ausgänge sieht der Geräteagent einen nativen Audioadapter vor.

Der FLX4-Kopfhörerweg bei laufendem VirtualDJ ist ein technischer Prüfpunkt: verfügbare Treiberwege, Ausgangskanäle und gleichzeitige Gerätezugriffe testen. Falls der native Adapter diesen Weg nicht ohne neue kostenpflichtige Abhängigkeit zuverlässig bereitstellen kann, wird die Einschränkung ausdrücklich dokumentiert; ein anderer Ausgang ist nicht stillschweigend gleichwertiger Ersatz für den gewünschten Controllerweg.

Die Importanalyse speichert gemessene Lautheit und Spitzen. Reine sichere Verstärkung kann als Wiedergabeparameter angewendet werden. Wenn zusätzliche Begrenzung nötig ist, kann ein abgeleitetes Audioasset vorbereitet werden; Original und Synchronität mit Video bleiben erhalten. Zielpegel und Begrenzungsparameter werden nach Hör-/Messvergleich festgelegt.

## 6. Externe Adapter

- VirtualDJ: Network Control als erster dokumentierter Befehls-/Abfrageweg, vom Agenten lokal angesprochen. Unterstützte Positionswerte und Aktualisierungsgenauigkeit am tatsächlichen Build prüfen. HTTP-Abfragen sind noch keine garantierte präzise Medienuhr; gegebenenfalls ist ein zusätzlicher SDK-Adapter erforderlich.
- Daslight: OSC-Zuordnung für benannte Start-/Stopp-/Parameteraktionen. Keine automatische vollständige Szenenübernahme versprechen. Manuelle Lichtübernahme wird im eigenen Zustand berücksichtigt; unbestätigte externe Zustände bleiben unbestätigt.
- APC: Agent mit MIDI-Eingang, LED-Ausgang, globalen Tasten, Seiten und Faderübernahme. Gerätefeedback folgt bestätigtem Showzustand.
- Stream Deck: eigenes Plugin/Adapter über Elgatos SDK, das mit unserem Agenten/Server kommuniziert. Keine gekaufte Drittanbieter-Steuerung notwendig. Profilwechsel darf keine laufenden Medien stoppen.

Musikgebundene Wiedergabe wird erst nach Positions-/Driftmessung freigegeben. Hintergrundvideo läuft bei Kopplungsverlust ab letzter Position normal weiter; erneute Kopplung erfolgt bewusst. Ein manueller Videosprung löst die Kopplung bewusst und holt keine vergangenen Aktionen nach. Livekamera-Lippensynchronität benötigt Messung der ganzen Kamera-/Audio-/Projektorkette.

## 7. Betrieb und Lieferung

Online und lokal teilen das Datenmodell und wesentliche Serverlogik, haben aber unterschiedliche Betriebsaufgaben. Anmeldung/Rechte sowie Gerätepaare werden eingerichtet; Befehle externer Programme sind nicht offen aus dem Internet zugänglich. Unterstützte Browser, HTTPS-Zugang und Audioberechtigungen werden konkret getestet.

Auf Veranstaltungsrechnern werden Laufzeiten über das Installationspaket mitgeliefert oder gezielt geprüft. Nils muss dort nicht Compiler oder npm bedienen. Netcup erhält ein wiederholbares Linux-Deployment, Windows ein Start-/Statusprogramm mit Assistent und Diagnose. Updates während laufender Shows werden nicht automatisch installiert. Sicherungen erfassen Daten, Medien, Einstellungen und externe Abhängigkeiten.

Kostenlose Nutzung ist die Auswahlbedingung für die Bausteine. Lizenzhinweise und tatsächlich ausgelieferte Codec-/SDK-Builds werden für das Installationspaket erfasst. Eine kostenlose Bibliothek bedeutet nicht automatisch, dass jede beliebige Kombination ihrer Erweiterungen gleich lizenziert ist.

## 8. Erstes technisches Prüfpaket

| Reihenfolge | Nachweis | Konsequenz bei Fehlschlag |
|---|---|---|
| 1 | GStreamer: Video mit Ton, getrenntes Timerfenster, lokale Darstellung | Ausgabeweg korrigieren, bevor umfangreicher Editor gebaut wird |
| 2 | Grafikadapter: Text/Shape/Animation über Video, eigenes Fontasset | Integrations- und Darstellungsweg überarbeiten |
| 3 | Getrennte Vorschau und Programmausgabe, Übernehmen, Videoendfolge | Wiedergabezustände und Routing korrigieren |
| 4 | WebRTC mit Video und separatem Vorschauton | Streamqualität, zusätzliche Latenz und Ausgaberechte klären |
| 5 | FLX4 gleichzeitig mit VirtualDJ, Vorhören und PA-Trennung | Native Audioanbindung testen; Einschränkung offen ausweisen |
| 6 | VirtualDJ-Befehle und Wiedergabeposition; Daslight-OSC | Adapter oder zusätzliche SDK-Anbindung anpassen |
| 7 | APC/Stream Deck, Wiederverbindung und parallele GO-Bedienung | Befehl-/Feedbackmodell korrigieren |
| 8 | Offlinepaket, Konflikt, Wiederherstellung und Last auf Zielhardware | Paket-/Hardwareprofil vor Veranstaltungsabnahme korrigieren |

Zum Einstieg dient das MSI-Notebook als Server, Renderer und Steuerungsrechner. Notebookdisplay: VirtualDJ; externe Anzeige: Browserregie; Fernseher: Leinwand; weiterer Monitor: Bühnenanzeige. Dieser Einrechnertest belegt nicht die spätere Netzwerk- oder Hauptrechnerleistung.

## Ergänzungen für das Gesamtsystem 2.0

### Module und gemeinsame Grundlage

Die Fachmodule Organisation, Shows/Medien, Live, Spiele/Jury, Moderation, Bühne/Bestand, Ticketshop einschließlich Saalplan und Einlass, Sponsoring/Öffentlichkeit sowie einfache Finanzen nutzen gemeinsame Benutzer-, Rechte-, Datei-, Aufgaben- und Versionsdienste. Die erste Umsetzung bleibt ein modular gegliedertes gemeinsames Backend; zusätzliche Microservices sind keine Voraussetzung.

Rechte werden auf System-, Event- und Showumfang geprüft. Die Veranstaltungsleitung darf alle Eventinhalte sehen/bearbeiten; technische Administration, LIVE, Paketaktivierung und GO-Sperrenübergehen bleiben eigene Rechte. Rollen können kombiniert werden. Andere Showteams lesen Planung, nicht geschützte Fragenpools/Lösungen. Admin und Leitung erhalten verpflichtende zusätzliche Anmeldung auch lokal mit vorbereitetem Offlineverfahren.

### Zusätzliche Datenobjekte

- Teams, Mitgliedschaften, Rollen, Einladungen, Sperren und Vertretungen.
- Aufgaben mit Abhängigkeiten, Checklisten und Fristen; Schichten und Zusagen; Termine, Ressourcen und Probenagenden.
- Bühnenplan/Variante/Objekt mit Requisiten- und Aufgabenreferenz; Einzel-/Mengenbestand, Leihe, Kostümset und Rollenbesetzung.
- Moderationskartensatz, Satzrückseite, Sprecherabschnitt, feste Druckversion und Änderungsvergleich.
- Saalplan/Bereich/Tisch/Reihe/Platz, Platzmerkmale, Kontingente, Bestell-Hold und Gruppenreservierung.
- Bestellung, individuelles Ticket, Zahlung, Ticketersatz, Stornierungsanfrage, Erstattung, Kasse und Einlassereignis.
- Sponsoren, Leistungszusagen, Werbeplätze/Assets und protokollierte Ausgabe; öffentliche Entwurfs-/Veröffentlichungsstände.
- Einfache Einnahmen/Ausgaben mit optionalem Beleg; automatisch übernommene Ticketvorgänge werden anhand ihrer Kennung dedupliziert.

### Verbindlicher Ticketbestand und Rückfallweg

Onlineverkauf wird vor Übergabe geschlossen. Nach geprüftem Abgleich führt der lokale Server verbindlich Abendkasse und Einlass. Parallele Scans und Platzvergabe benötigen atomare Zustandsprüfung. Einlassgeräte bestätigen ohne zuständigen Server keinen Einlass.

Laufende Betriebsereignisse werden bei Verbindung online und auf einen zweiten vorhandenen Rechner kopiert. Bestätigter Sicherungsstand und fehlende Abschnitte müssen sichtbar sein. Eine Kopie ist kein zweiter gleichzeitig aktiver Bestand. Online-Ersatz wird bewusst für Einlass und Organisation aktiviert, nicht automatisch für Spiele oder physische Ausgabe. Übertragungslücken erzeugen Warnung und berechtigte Entscheidung. Bei Hauptrechner- plus Internetausfall gilt Liste/manuelles Protokoll. Rückwechsel benötigt Abgleich und eindeutige Zuständigkeit; öffentlicher Shop bleibt geschlossen.

### Rendererzustände und Medien

Ausgabezustände haben klare Reihenfolge: Blackout verdeckt alle Bildschichten; sonst kann ein gehaltenes Standbild die dahinter laufende Komposition ersetzen. GO verändert diese laufende Komposition, hebt Standbild aber nicht auf. Freigabe zeigt aktuellen Zustand. Browserprogrammansicht enthält tatsächliche Ausgabe; eine zusätzliche Ansicht zeigt die dahinter laufende Szene. Ton und Timer werden separat behandelt.

Weitere Publikumsausgänge können gemeinsam oder unabhängig sein; zuerst werden Full HD, eine Leinwand und ein Bühnenmonitor geprüft. Persistente Grafikebenen, Textdaten mit Ersatz-/Überlaufregeln, Zeitleisten, eigene Schriften und Medienmasken verwenden ein gemeinsames Schema. Import erzeugt geprüfte Abspielfassungen und bewahrt Originale. PPTX/PDF-Folien werden mit Ersatzweg geprüft, komplexe Animationen als Videos oder neue Szenen übernommen.

Audioanalyse ist standardmäßig aktiv und abschaltbar. Grundwert plus Einsatzpegel, EQ und Limiter sind vorgesehen, kein Kompressor als Pflichtfunktion. Publikum und Vorhören sind getrennt. Vorhörgeräteausfall führt zu Mute/Hinweis. Die FLX4-Anbindung neben Virtual DJ bleibt ein praktischer Nachweis. Liveanpassungen werden nur bewusst in Vorbereitung gespeichert.

### Betrieb und Abnahme

Windows ist die erste Agent-/Rendererplattform, Livebrowser Chrome und Edge. Vorbereitung soll auf Windows/macOS/Linux nutzbar sein, Einlass auf Android und iPhone/iPad. Installer und Assistent liefern dokumentierte Geräteprofile, Offlinekonten, Pflicht-Anmeldebestätigung, technische Vorabprüfung und geschützte Diagnose.

Prüfziel sind bis 300 Besucher, zehn interne Parallelbearbeiter und zehn Teilnehmergeräte plus Moderation/Jury. Mindestens eine reale Kamera und die vollständige Synchronitätskette werden getestet. Noch fehlen Hauptrechner, Projektor, genaue Kamera-/Interface-/Mixer-/Stream-Deck-Angaben. Das Mixergerät ist digital, Bildweg direkt HDMI. Diese Angaben ersetzen keine Leistungsabnahme.

Sicherungen laufen automatisch und manuell, zusätzlich externe geprüfte Kopie. Neustart zeigt sicheren Hintergrund, keine ungefragten Starts. Notbetrieb auf MSI hält priorisierte Medien/Ersatzmusik/Ablauf-PDF vor; tatsächliche Umschaltung wird geprobt. Handbuch in App/offline/PDF, echte Screenshots und rollenbezogene Kurzblätter gehören zur vollständigen Abnahme.

### Abgrenzung Finanzen

Nur Einnahmen/Ausgaben, Beleg, Summen, Saldo und Export. Kein Beschaffungs-, Freigabe-, Liefer- oder privater Erstattungsworkflow. Ticketkasse, Ticketzahlung und Ticket-Erstattungsstatus bleiben Fachfunktionen des Ticketmoduls; genehmigtes Storno ist noch keine tatsächlich ausgezahlte Erstattung.

## 9. Technische Ausgangsquellen

Die Quellen belegen Eigenschaften der Bausteine. Die konkrete Eignung für unsere Kombination ist eine Entwicklungsentscheidung und muss getestet werden. Historischer Prüfstand: 9. Oktober 2026. Die Links wurden für diese redaktionelle Aktualisierung nicht erneut verifiziert.

- [Konva und Lizenz](https://konvajs.org/docs/about.html): MIT; [React-Anbindung](https://konvajs.org/docs/react/index.html).
- [Node.js Releasepolitik](https://nodejs.org/en/about/previous-releases): unterstützte LTS-Linie verwenden.
- [Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/) und [Lizenz](https://github.com/fastify/fastify/blob/main/LICENSE).
- [SQLite-Einsatzbereiche](https://www.sqlite.org/whentouse.html), [SQLite Copyright](https://sqlite.org/copyright.html), [PostgreSQL-Lizenz](https://www.postgresql.org/about/licence/).
- [GStreamer-Komposition unter Direct3D11](https://gstreamer.freedesktop.org/documentation/d3d11/d3d11compositor.html), [Medienzeit](https://gstreamer.freedesktop.org/documentation/gstreamer/gstclock.html), [Windows-Audio](https://gstreamer.freedesktop.org/documentation/wasapi2/wasapi2sink.html), [Lizenz](https://gstreamer.freedesktop.org/documentation/frequently-asked-questions/licensing.html).
- [Skia Dokumentation](https://skia.org/docs/) und [Grafikfunktionen](https://skia.org/docs/user/).
- [GStreamer WebRTC](https://gstreamer.freedesktop.org/documentation/webrtclib/index.html).
- [Audio Output Devices API](https://www.w3.org/TR/audio-output/): Berechtigungen und Auswahl von Ausgabegeräten; keine Zusage beliebiger nativer Kanäle.
- [VirtualDJ Network Control](https://virtualdj.com/wiki/NetworkControlPlugin): HTTP-Steuerung/Abfragen, VirtualDJ 2023+ und Pro.
- [Daslight 5](https://www.daslight.com/en/daslight5): OSC-Mapping und Interface-/Lizenzabhängigkeiten.
- [Stream Deck SDK](https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/), [SDK-Repository](https://github.com/elgatosf/streamdeck): eigene Adapterentwicklung.
- [FFmpeg Filter](https://ffmpeg.org/ffmpeg-filters.html): loudnorm und ebur128 als Analyse-/Verarbeitungsbausteine.


## Aktuelle Entwicklungsreihenfolge – D013
Am 9. Oktober 2026 wurde ausdrücklich festgelegt: zuerst Netcup-fähiger Online-Server, danach Windows-Agenten, dann lokaler Windows-Server/Medienausgabe und erster vollständiger Showablauf. Technische Prototypen der Geräte-/Renderingwege bleiben früh erforderlich. Die bestehende Online-/Offlineverteilung und Architektur ändern sich dadurch nicht.
Die konkretisierten technischen Startentwürfe stehen in [Datenmodell](entwicklung/datenmodell.md), [Schnittstellen](entwicklung/schnittstellen.md) und [Abnahmeplan](entwicklung/abnahmeplan.md). Code-Schemas/Migrationen und tatsächlich verifizierte Komponentenstände entstehen während Implementierung.


## Vorhandener Reverse Proxy – D015
Am 9. Oktober 2026 wurde bestätigt: Ein Nginx-Reverse-Proxy ist bereits vorhanden. Diesen für eventmanagement.jungschuetzen-flueren.de verwenden; keinen zusätzlichen Reverse-Proxy-Container oder zweite TLS-Verwaltung als Voraussetzung installieren.
Für die vorgeschlagene Compose-Bereitstellung verbleiben Anwendung, PostgreSQL und Hintergrundworker. Fachmodule bleiben im modularen Anwendungskern, statt je einen eigenen Container zu erhalten. Diese Containeraufteilung ist ein technischer Startvorschlag.
Durch D016 geklärt: Nginx läuft in Docker auf derselben VM; Portainer vorhanden. Anschluss über vorhandenes Docker-Proxy-Netz konfigurieren. Loopback-Publishing funktioniert nur bei Nginx auf demselben Host; bei Container-Nginx gemeinsame Netzwerkverbindung oder ein passend abgesichertes erreichbares Ziel wählen. Datenbank nicht öffentlich bereitstellen.
Codex soll eine einbindbare VHost-/Location-Vorlage und Integrationsanleitung liefern. Vorhandene Konfigurationen, Domains und Zertifikate erhalten; WebSockets, Uploadgrößen, Timeouts und vertrauenswürdige Proxyheader anhand des tatsächlichen Aufbaus prüfen. Die bloße Existenz von Nginx bestätigt keine fertige TLS-/Domain-Konfiguration für das neue System.


## Softwarefortsetzung und erster lokaler Baustein – D017/S3-01

Am 10. Oktober 2026 erlaubt der Betreiber weitere vorbereitbare Softwarearbeiten bei späteren Funktionstests. S3-01 überträgt eingefrorene S1-Inhalte/Originalmedien in eine lokale SQLite-Paketablage. Portable Windows-CLI, keine direkte Datenbankreplikation und keine Netzwerkdienste beim Import. Paketaufbewahrung, Offlineanmeldung und Liveaktivierung bleiben getrennte Schritte. Kein Windows-Renderer-/HDMI-/Ton-/Hardwarebeleg; bestehender C++/GStreamer/Skia-Zielentwurf bleibt bestehen. [Ablauf, Format und Grenzen](entwicklung/s3-paketablage.md).

## Vorhandene Docker-/Portainer-Umgebung – D016 (Betriebsentwurf)
Genannte Proxy-Adresse: https://proxy.familie-schapfeld.de. app erhält Anschluss an externes Proxy-Netz und eigenes Backend-Netz; DB und Worker erhalten keine öffentlichen Dienstports. Proxyprodukt, tatsächliche Netzwerknamen und Portainer-Modus vor Deployment erheben. Vollständige Vorgaben: [Deployment](entwicklung/deployment.md).
