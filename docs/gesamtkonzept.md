# Gesamtkonzept für das
ShowNight Veranstaltungssystem

Version 2.0 | Stand 9. Oktober 2026
Vorbereitung Organisation Ticketverkauf und Livebetrieb

Das System bündelt die bisher über Excel, WhatsApp und Papier verteilte Vorbereitung mit einer eigenständigen Showregie. Es soll langfristig für die Jungschützen ShowNight und für andere Veranstaltungsformen wie Spieleabende nutzbar sein. Module können je Veranstaltung aktiviert werden.

Dieses Konzept enthält die bestätigten Entscheidungen der bisherigen Planung. Es beschreibt den vereinbarten Zielumfang, keine bereits vollständig entwickelte oder abgenommene Software. Die erste freigegebene Veranstaltungsfassung soll den vereinbarten Gesamtumfang einschließlich Installation, Dokumentation und realer Abnahme enthalten; interne Prototypen dürfen vorher einzelne Bereiche prüfen.

Die erste geplante ShowNight findet am 10. April 2027 statt. Bühnenproben beginnen ungefähr fünf Tage vorher, die Generalprobe am 9. April. Einzelshows werden bereits zuvor in kleinen Gruppen geprobt.

### Verbindliche Grundlagen

- Eigenständige Bildausgabe ohne OBS. Virtual DJ und Daslight bleiben auf den vorhandenen Techniknotebooks in Betrieb.

- Onlinevorbereitung auf einer Netcup VM; der lokale Windows Hauptrechner arbeitet mit vollständig bereitgestellten Daten ohne Internet.

- Zwei jederzeit gleichberechtigte Regieplätze ohne Übernahmeverfahren. Live- und technische Rechte werden getrennt von Inhaltsrechten vergeben.

- Umfangreicher Szeneneditor und flexible Showformate. Manuelles GO ist Standard, ausdrücklich eingerichtete Sequenzen sind möglich.

- Nur kostenlose zusätzliche Plugins und Komponenten. Vorhandene Virtual-DJ-/Daslight-Lizenzen und bestehende Hostingkosten sind davon getrennt.

- Finanzen bestehen aus einer einfachen Einnahmen- und Ausgabenliste. Komplexe Beschaffungs-, Freigabe-, Liefer- und private Erstattungsabläufe sind aus dem Umfang entfernt.

### Geltung und Änderungen

Version 2.0 ersetzt das bisherige Gesamtkonzept 1.7 und führt die Anforderungen zusammen. Funktionsspezifikation und technische Architektur werden ebenfalls auf Stand 2.0 aktualisiert. Die technische Entwicklungsgrundlage muss anhand der aufgeführten Prüfungen bestätigt werden.

## Inhaltsübersicht

1 Systemstruktur und Module

2 Benutzer Rollen und Zugriffsrechte

3 Zusammenarbeit Dateien und Veranstaltungsorganisation

4 Shows Ablauf und Grundbegriffe

5 Szeneneditor und Medienbibliothek

6 Live-Regie Eingriffe und Ausgaben

7 Bühnenmonitor Pausen und interne Kommunikation

8 Spiele Quiz Buzzer und Jury

9 Moderationskarten und Moderatorgeräte

10 Bühnenbau Requisiten Rollen und Kostüme

11 Ticketshop Saalplan und Reservierungen

12 Ticketzahlungen Karten und Stornierungen

13 Einlass Verkaufsauswertung und Zuständigkeit

14 Sponsoring Öffentlichkeit und einfache Finanzen

15 Proben Lernbetrieb und Bedienungsanleitung

16 Technikarchitektur Signalwege und Geräte

17 Synchronisation Sicherungen und Ausfälle

18 Einrichtung Abnahme und offene Prüfpunkte

19 Kostenlose Erweiterungen und Entwicklungshilfen

20 Quellen und Versionshinweise

## 1 Systemstruktur und Module

Gemeinsame Grundlagen sind Benutzer, Rechte, Veranstaltungen, Dateien, Aufgaben, Versionsstände und Protokolle. Fachmodule verwenden diese gemeinsamen Daten. Sie bilden keine voneinander unabhängigen Shops, Benutzerlisten oder Aufgabenverwaltungen. Ein Spieleabend kann wenige Module verwenden, eine ShowNight den gesamten benötigten Umfang.

| Modul | Aufgaben |
| --- | --- |
| Veranstaltung und Organisation | Grunddaten, Teams, Kalender, Aufgaben, Helfer und Schichten |
| Shows und Gestaltung | Eigenständige Shows, Ablauf, Szenen, Vorlagen und Medien |
| Live-Regie | GO, Vorschau, Liveausgabe, Eingriffe, Controller und Timer |
| Spiele und Jury | Quiz, Buzzer, allgemeine Punkteverwaltung und Jurywertungen |
| Moderation | A5-Karten, Druckstände und geschützte Tabletansicht |
| Bühne und Ausstattung | Bühnenplan, Umbauten, Requisiten, Besetzung und Kostüme |
| Tickets und Saalplan | Shop, Gruppenreservierungen, Zahlungen, Papierkarten und Einlass |
| Sponsoring und Öffentlichkeit | Kontakte, Leistungen, Werbeinhalte und öffentliche Eventseiten |
| Einnahmen und Ausgaben | Einfache Finanzübersicht, Belege, Saldo und Export |
| Technik und Betrieb | Geräteprofile, Synchronisation, Sicherungen, Installation und Diagnose |

### Zentrale Datenbeziehungen

Eine Veranstaltung verknüpft Shows, Teamzuordnungen, Termine und die aktivierten Module. Eine Show kann unabhängig von einer Veranstaltung vorbereitet werden. Ihre Übernahme erzeugt einen eigenständigen bearbeitbaren Veranstaltungsstand. Eine Show enthält optionale Abschnitte, Szenen und Einsätze. Requisiten, Rollen, Karten und Aufgaben können auf diese Inhalte verweisen.

Eine Bestellung enthält einzelne Tickets. Ein Ticket verweist auf einen festen Platz oder einen Bereich mit freier Platzwahl. Saalplanung gehört zum Ticketmodul. Spielteilnehmer und Teams können innerhalb einer Veranstaltung wiederverwendet werden, Antworten und Wertungen bleiben je Spiel getrennt.

### Bedienung und Navigation

Die Oberfläche bietet direkte Arbeitsbereiche und persönliche Schnellzugriffe. Verschachtelte Pflichtdialoge sollen vermieden werden. Eine rechteabhängige Gesamtsuche findet Shows, Medien, Aufgaben, Requisiten und weitere Inhalte. Die persönliche Startseite zeigt eigene Aufgaben, Termine, offene Rückmeldungen und zugewiesene Shows.

Ein dunkler ShowNight-Modus und ein heller Arbeitsmodus sind vorgesehen. Bediengrößen lassen sich je Ansicht für Maus oder Touch einstellen. Organisation, Texte, Uploads und Rückmeldungen funktionieren mobil; umfangreiche Szenen-, Saal- und Bühneneditoren werden für größere Bildschirme ausgelegt.

## 2 Benutzer Rollen und Zugriffsrechte

Benutzer können mehreren Teams und Rollen gleichzeitig angehören. Rechte gelten für den jeweiligen System-, Veranstaltungs- oder Showumfang. Die Verwaltung zeigt wirksame Rechte und deren Herkunft. Standardrollen sind Vorlagen; Admin und Leitung dürfen innerhalb ihres zulässigen Umfangs eigene Rollen erstellen und anpassen.

| Rolle | Verbindlicher Umfang |
| --- | --- |
| Administrator | Systemweite Benutzer- und Rechteverwaltung sowie technische Administration nach vergebenen Systemrechten. |
| Veranstaltungsleitung | Darf sämtliche Inhalte ihrer Veranstaltung sehen und bearbeiten, einschließlich geschützter Ablagen, Finanzdaten, Shows und Tickets. Mehrere gleichberechtigte Leitungen sind möglich. |
| Showteam | Bearbeitet die gesamte zugewiesene Show ohne zusätzliche Leitungsfreigabe. Andere Shows derselben Veranstaltung sind lesbar; Quizfragenpool und Lösungen bleiben gesondert geschützt. |
| Bühnenbau und Koordination | Aufgaben ergänzen, bearbeiten und übernehmen; Pläne, Bestand und Umbauten im zugeordneten Umfang pflegen. |
| Moderation | Zugeordnete Karten bearbeiten und exportieren; geschützte Tabletansicht, optional ausdrücklich erlaubte Showaktionen. |
| Regie und Technik | Livebedienung, Prüfungen und Gerätezuordnung über gesonderte Rechte; Inhaltsrechte allein verleihen diese Rechte nicht. |
| Verkauf und Einlass | Einzelrechte für Saalplan, Verkauf, Zahlung, Stornierung, Erstattung, Freikarten, manuellen Einlass und Wiedereintritt. |
| Sponsoring und Öffentlichkeitsarbeit | Sponsorendaten durch Leitung und Sponsoringteam; öffentliche Veröffentlichung durch Leitung und berechtigte Öffentlichkeitsarbeit. |

### Konten und Vertretungen

Admin und Veranstaltungsleitung können Benutzer anlegen und einladen. Die Leitung handelt nur innerhalb ihrer Veranstaltung. Teamleitungen legen keine neuen Konten an, können aber Vertretungen mit dafür vorgesehenen begrenzten Koordinationsrechten benennen. Benutzer setzen über einen zeitlich begrenzten Einladungslink ihr Passwort selbst.

Admin und Leitung benötigen eine zusätzliche Anmeldebestätigung online und im vorbereiteten lokalen Offlinebetrieb. Alle internen Veranstaltungskonten werden vorab lokal bereitgestellt. Admin und Leitung dürfen offline neue Veranstaltungskonten mit persönlich ausgegebenem Einrichtungszugang anlegen; später erfolgt der Abgleich. Lokale Sperren sind möglich. Ein gesonderter getesteter administrativer Wiederherstellungsweg gehört zur Einrichtung.

### Besondere Rechte und vertrauliche Daten

Livebedienung, technische Administration, Aktivierung neuer Livepakete und Übergehen von GO-Sperren sind eigene Rechte. Beide entsprechend berechtigten Regieplätze bleiben gleichberechtigt. Persönliche Verfügbarkeiten und Absagegründe sehen die zuständige Koordination und die vollständig berechtigte Veranstaltungsleitung. Finanzdaten sind für sonstige Benutzer eingeschränkt.

Andere Showteams lesen die allgemeine Showplanung, erhalten dadurch keinen Zugriff auf geschützte Fragenpools und Lösungen. Die Veranstaltungsleitung behält vollständigen Inhaltszugriff. Käufer verwenden Gastbestellungen mit geschütztem Bestelllink, Teilnehmer- und Jurygeräte eigene eingeschränkte Zugänge.

## 3 Zusammenarbeit Dateien und Veranstaltungsorganisation

### Gemeinsames Arbeiten

Mehrere Personen können gleichzeitig unterschiedliche Inhalte bearbeiten. Dieselbe Szene wird jeweils von einer Person bearbeitet; andere können mitsehen oder eine Kopie bearbeiten. Eine sichtbare Sperre endet nach Verbindungsverlust zeitgesteuert oder wird berechtigt nach Warnung gelöst. Nicht gespeicherte Änderungen sollen soweit möglich lokal gesichert werden.

Automatisches Speichern zeigt den gespeicherten Stand und Fehler an. Versionsverlauf und Papierkorb ermöglichen Wiederherstellung. Kommentarverläufe hängen direkt am Inhalt, unterstützen Erwähnungen und können geklärt oder wieder geöffnet werden. Freie Konzept- und Besprechungsnotizen besitzen Verlauf und Anhänge; daraus lassen sich Aufgaben ableiten.

### Ablagen und Hinweise

Dateien liegen in gemeinsamen und geschützten Bereichen. Interne Hinweise erscheinen im System und optional per E-Mail. Benutzer wählen sofortige Zustellung, Zusammenfassung oder ausschließlich In-App-Hinweise. Direkte Livewarnungen müssen auch ohne E-Mail sichtbar sein. Aufgaben können einstellbare Fristerinnerungen erhalten.

### Aufgaben und Helfer

Leitung, Showteams und Bühnenbau dürfen relevante Aufgaben anlegen. Teammitglieder können freie Aufgaben übernehmen; berechtigte Koordination weist zu und setzt Prioritäten. Status sind offen, in Arbeit, blockiert und erledigt, ergänzt durch Kommentare, Fotos und Hindernisse. Aufgaben können voneinander abhängen und einfache Unterchecklisten enthalten. Schritte mit eigenen Terminen oder Zuständigkeiten werden verknüpfte Aufgaben.

Erledigungsnachweise sind optional je Aufgabe einstellbar. Aufgabenlisten lassen sich als Vorlagen mit relativen Fristen zum Veranstaltungstag verwenden. Helfer melden sich auf Schichten oder werden zugewiesen und bestätigen Zusagen. Tauschanfragen entscheidet die Koordination. Personenzahl und Rollen beziehungsweise Einweisungsanforderungen sind je Schicht möglich. Persönliche und teambezogene Dienstpläne können als PDF ausgegeben werden.

### Termine und Ressourcen

Proben und Vorbereitungstermine verwalten Räume, Bühne, Technik sowie frei definierbare Ressourcen. Erforderliche und optionale Teilnehmer werden unterschieden; fehlende Zusagen und Konflikte erscheinen als Hinweise. Wesentliche Terminänderungen verlangen erneute Zusagen. Abgesagte Termine bleiben nachvollziehbar, geben Ressourcen frei und informieren Eingeladene.

Einzeltermine sind als Kalenderdatei exportierbar; ein geschütztes Abonnement ist vorgesehen. Dessen Aktualisierung hängt vom Kalenderprogramm ab. Abgeschlossene Veranstaltungen sind kontrolliert bearbeitbare Archive. Für neue Veranstaltungen werden gezielt Shows, Vorlagen, Saalplan, Aufgabenstrukturen und Zuordnungen übernommen; Verkäufe, Zahlungen und Einlass beginnen neu.

## 4 Shows Ablauf und Grundbegriffe

| Begriff | Bedeutung |
| --- | --- |
| Veranstaltung | Organisatorischer Rahmen mit Termin, Teams und aktivierten Modulen. |
| Show | Unabhängig vorbereitbare Darbietung oder Spiel mit eigenen Inhalten. |
| Abschnitt | Optionaler Teil einer Show, etwa ein Märchen; einzeln probbar. |
| Szene | Gestaltetes Bild mit Medien, Kameras, Texten und Grafikebenen. |
| Aktion | Ein ausdrücklicher Befehl, etwa Video starten oder Timer pausieren. |
| Einsatz | Vorbereitete Kombination von Szene und ausdrücklich zugeordneten Aktionen. |
| GO | Löst den nächsten vorbereiteten Einsatz aus; ändert nur dessen konfigurierte Ziele. |
| Eingriff | Spontane Bedienung außerhalb der geplanten Folge; verändert standardmäßig nicht die Ablaufposition. |
| Sequenz | Optionaler automatischer Ablauf ausdrücklich vorbereiteter Schritte. |
| Vorschau und LIVE | Isoliert vorbereiteter Inhalt beziehungsweise tatsächlich erzeugtes Publikumsbild. |

Shows erhalten erwartete Dauern und Regienotizen. Das Veranstaltungsschema berechnet geplante Zeiten aus Dauern und Pausen, erlaubt feste Startzeiten und manuelle Korrekturen. Live zeigt es Abweichung und Prognose, ohne automatisch zu wechseln oder abzubrechen. Abschnitte und Einsätze können deaktiviert statt gelöscht werden; GO überspringt sie. Einsatz- und Gesamtdauern sind manuell bearbeitbar, die berechnete Dauer wird getrennt angezeigt. Parallele Aktionen werden nicht einfach addiert.

### GO Sprünge und Folgeverhalten

Manuelles GO ist Standard. Gleichzeitige GO-Befehle für dieselbe Position lösen nur einen Einsatz aus. Ein Einsatz verändert Musik, Licht oder Timer nur durch ausdrückliche Aktionen. Ein Videoeinsatz lässt Virtual-DJ-Musik standardmäßig unverändert.

GO während eines Videos kann je Einsatz direkt wechseln, Bestätigung verlangen oder bis zum Ende gesperrt sein. Ein direkter Sprung kann nur die Position vorbereiten oder sofort auslösen; übersprungene Aktionen werden nicht nachgeholt. Automatisch konfigurierte Folgeeinsätze aktualisieren die Ablaufposition, damit GO sie nicht nochmals auslöst.

Nach normalem Videoende sind letztes Bild, Folgeinhalt, Wiederholung oder vorbereitete Folgeaktion wählbar. Ein unerwarteter Abbruch ist kein normales Videoende. Showübergänge legen ausdrücklich fest, was endet oder weiterläuft. Szenen können neu beginnen oder gehaltene Wiedergabestände fortsetzen.

### Wiederverwendung und Versionen

Vorlagen, Szenen und Aktionskombinationen sind showübergreifend nutzbar. Eigene Vorlagen dürfen Teams erstellen; gemeinsame Bereitstellung benötigt ein Teilrecht. Veranstaltungen übernehmen eigenständige Stände. Neue Versionen werden mit Änderungsübersicht bewusst übernommen, eigene Anpassungen und Konflikte bleiben sichtbar.

Geprüfte Showpakete enthalten Ablauf, Szenen und benötigte Medien. Gerätezuordnungen und Benutzerrechte werden am Ziel bewusst zugeordnet. Neue Veranstaltungen können parallel online vorbereitet werden; der Hauptrechner führt jeweils einen aktiven Liveablauf.

## 5 Szeneneditor und Medienbibliothek

### Gestaltung

Der Editor bietet Vorlagen als einfachen Einstieg und eine vollständige erweiterte Bearbeitung im selben Arbeitsbereich. Hintergründe, Bilder, Videos, mehrere Kameras, Texte, Formen, Linien und Verläufe werden in Ebenen gestaltet. Position, Größe, Drehung, Deckkraft, Reihenfolge, Gruppen, Sperren und Sichtbarkeit sind bearbeitbar. Undo/Redo, Zoom, genaue Werte, Raster, Hilfslinien und abschaltbares Einrasten unterstützen die Arbeit.

Texte erlauben abschnittsweise Schriftgrößen, Farben, Hervorhebungen, Absätze und Listen. Eigene Schriften werden zentral berechtigt bereitgestellt und in benötigte Pakete aufgenommen. Bilder, Videos und Kameras lassen sich einpassen, beschneiden, drehen, spiegeln sowie rechteckig oder rund maskieren. Originale werden nicht verändert.

Animationen nutzen Vorlagen und eine Zeitleiste mit Dauer, Verzögerung und Schlüsselpositionen. Start, Pause, Neustart und Prüfung eines Zeitpunkts sind möglich; Kameras zeigen ihr aktuelles Livebild. Farben und Textstile werden zentral gespeichert, Änderungen gezielt übernommen. Eine eigenständige Ausgabeebene kann Logos oder Spielstände über Szenenwechsel hinweg halten. Konturen, Schatten, Textausrichtung und mehrzeilige Texte sind vorgesehen. Animationen können beim Szenenstart oder durch spätere ausdrückliche Aktionen beginnen.

### Dynamische Daten

Elemente können feste Inhalte oder auswählbare Daten wie Teamname, Punkte und Timer verwenden. Beispieldaten testen lange Texte und hohe Werte ohne echte Spielstände zu ändern. Umbruch, Verkleinerung bis Mindestgröße oder Kürzung sind je Element einstellbar. Fehlende Daten verwenden einen festgelegten Ersatzwert, Ausblenden oder letzten gültigen Wert; die Regie erhält einen Hinweis.

### Import und Medienpflege

Die gemeinsame Bibliothek hat veranstaltungsweite, showeigene und gesondert berechtigte übergreifende Bereiche, Suche, Tags, Ordner und Verwendungsanzeige. JPG, PNG, SVG und unterstützte animierte Bilder sowie Audio und Video werden geprüft und gegebenenfalls in passende Abspielfassungen umgewandelt. Originale bleiben erhalten. Nicht erfolgreich geprüfte Medien bleiben für Liveeinsatz gesperrt.

Neue Medienfassungen ersetzen bestehende Szenen nicht ungefragt. Verwendungen behalten ihren Stand und erhalten einen Übernahmehinweis. Start und Ende können je Verwendung zugeschnitten werden. Untertiteldateien sind optional pro Videoverwendung vorgesehen; automatische Spracherkennung gehört nicht dazu. Bewusstes Aufräumen berücksichtigt Verwendungen und Versionen.

### Ton und Vorhören

Lautstärkeanalyse und automatische Normalisierung sind beim Import standardmäßig aktiv. Ein normalisierter Grundwert wird durch einsatzbezogenen Pegel, Stummschaltung und Fades ergänzt. Pegel, EQ und Limiter gehören zur Tonbearbeitung; Kompressor und komplexe Audioreparatur gehören nicht zum bestätigten Umfang. Original und bearbeitete Fassung lassen sich beim Vorhören vergleichen. Die Anpassung bleibt abschaltbar. Lautheit und Spitzen werden gespeichert; bei verändertem Ausschnitt muss die Analyse erneut auf Gültigkeit geprüft werden.

Publikumston und Vorhörton haben getrennte Gesamtregler, aktive Quellen zusätzliche Einzelregler. Vorschauton bleibt ausschließlich am konfigurierten Vorhörweg. Liveänderungen werden nur bewusst in die Vorbereitung übernommen. Normalisierung repariert weder eine schlechte Mischung noch bereits verzerrte Originale. Bei Ausfall des gewählten Vorhörgeräts wird stummgeschaltet und gewarnt, statt ungeprüft auf einen Publikumsausgang zu wechseln. Geräte- und Kanalwahl sind auf tatsächlich verfügbare Zugriffswege begrenzt.

### Präsentationen und Gestaltung von außen

PPTX und PDF werden soweit unterstützt als geprüfte Folienbilder importiert; vorbereitete Bilder dienen als Ersatzweg. Animationen werden als feste Videos übernommen oder im Szeneneditor nachgebaut. Vor, zurück und direkte Folienwahl sind möglich; einzelne Folien können Einsätzen zugeordnet werden. Originalgetreue native PowerPoint-Wiedergabe ist nicht zugesagt.

Canva bleibt Gestaltungsquelle. Exportierte Dateien werden in die Bibliothek aufgenommen, mit Quelllink und Version dokumentiert und vor Ort bereitgestellt. Eine API-Anbindung ist optional und muss hinsichtlich Zugriffs- und Tarifbedingungen geprüft werden. Sie ist keine Voraussetzung für den Veranstaltungsbetrieb.

## 6 Live-Regie Eingriffe und Ausgaben

### Mehrere gleichberechtigte Arbeitsplätze

Beide Regien bedienen jederzeit denselben Zustand ohne Übernahmeverfahren. Der Server verarbeitet gültige Befehle in eindeutiger Reihenfolge, schützt GO anhand der aktuellen Position und weist veraltete Befehle ab. Benutzer und letzte Aktion erscheinen kompakt; ein Verlauf enthält Details. Teilfehler lassen den Einsatz als ausgelöst stehen, fehlgeschlagene Einzelaktionen sind separat wiederholbar.

Regiefenster können frei zusammengestellte Bereiche auf mehreren Monitoren zeigen. Persönliche Profile und gemeinsame Vorlagen sind speicherbar. Jedes Fenster ist bedienbar oder reine Anzeige. Das MSI bietet neben dem Notebookdisplay Anschlussmöglichkeiten für drei weitere Monitore; Fernseher und zusätzlicher Monitor sind verfügbar. Konkrete Ausgabewege werden geprüft.

### Vorschau und direkte Schaltung

Vorbereitung verändert LIVE nicht. Auswahl kann in Vorschau geprüft und übernommen oder ausdrücklich direkt geschaltet werden. Schnitt und konfigurierbare Überblendungen sind vorgesehen; Bild- und Tonübergang haben getrennte Regeln. Videoübernahme kann vom Anfang oder einer bewusst gewählten Vorschauposition erfolgen. Externe Aktionen werden nur ausgeführt, wenn sie ausdrücklich zugeordnet sind.

Die Programmansicht erhält einen Stream der tatsächlich erzeugten Ausgabe, keine unabhängige Nachbildung. Auflösung und Bildrate sind einstellbar; Leinwandausgabe hat Vorrang vor Vorschauqualität. Verzögerung und veraltete Bilder werden erkennbar. Der Stream bestätigt das erzeugte Bild, nicht die physische Funktion des Projektors.

### Standbild Blackout und mehrere Leinwände

Weitere Publikumsausgänge können dasselbe Programm oder unabhängige Szenen zeigen. Einsätze können mehrere Ausgänge ansprechen. Einpassen, Beschneiden und eigene Formatvarianten sind je Ausgabe wählbar. Die erste Abnahme prüft eine Leinwand und einen getrennten Bühnenmonitor, zusätzliche Ausgaben brauchen eigene Leistungstests.

Standbildhalten fixiert das Publikumsbild unabhängig vom Zeitlauf der Medien. GO ändert den laufenden Zustand dahinter, das Standbild bleibt bis zur Freigabe. Aufheben zeigt den aktuellen Zustand. Blackout verdeckt Szene, gehaltenes Bild und alle zusätzlichen Grafiken der betreffenden Ausgabe. Nach Aufheben erscheint der aktuelle Zustand oder das noch aktive Standbild. Ton und Timer sind unabhängig.

Die Regie kann tatsächliches Publikumsbild und dahinter laufende Szene prüfen. Manuelle Videosprünge werden bewusst ausgeführt; bei Musikbindung wird diese vorher bewusst gelöst. Übersprungene zeitbezogene Aktionen werden nicht nachgeholt und bereits ausgeführte Einmalaktionen bei Rücksprung nicht automatisch wiederholt.

### Aktionskombinationen und Unterbrechungen

Der Aktionseditor verwendet geordnete Einzelaktionen mit optionalen Verzögerungen. Bildschirmtasten, Tastenkürzel, Controller und ausdrücklich eingerichtete Ereignisse können auslösen. Umschaltaktionen zeigen einen verlässlich bekannten Zustand. Bestätigung, langes Drücken oder Tastenkombination sind pro empfindlicher Aktion konfigurierbar. Je Einzelaktion sind Lebensdauer und Wiederbetätigung einstellbar, beispielsweise ignorieren, neu starten oder umschalten. Kritische Pflichtvoraussetzungen sind vom bloßen Hinweis zu unterscheiden; fehlendes Licht darf einen sonst zulässigen Einsatz nicht pauschal verhindern.

Direkte Unterbrechungs- und Notfallprofile legen Bild, Ton, Licht, Timer und Ablauf getrennt fest. Ausstehende verzögerte Aktionen werden standardmäßig abgebrochen, ausdrücklich unabhängige können bleiben. Sequenzen können bei Eingriff stoppen, pausieren oder weiterlaufen. Fortsetzung bietet passende bewusste Wege: gehaltene Szene, Neustart oder Sprung. Externe Einmalaktionen werden nicht ungefragt wiederholt.

Spontane Einblendungen ändern standardmäßig nicht die Ablaufposition. Eine Rückkehraktion bietet vorherigen Bildzustand oder einen geplanten Einsatz. Szeneneigene Medien und Animationen können beim Verlassen stoppen, ihren Stand halten oder gezielt weiterlaufen, ohne ungefragten Publikumston.

## 7 Bühnenmonitor Pausen und interne Kommunikation

### Timer und Regiehinweise

Der zur Bühne gerichtete separate Monitor zeigt ausschließlich Timer und Regiehinweise, keine Quizfragen, Lösungen oder Liedtexte. Countdown, Laufzeit und Zieluhrzeit sind möglich. Überziehung, Warnfarben und großflächige Hinweise sind konfigurierbar. Start, Pause, Fortsetzen, Reset und Zeitkorrektur sind manuell oder ausdrücklich an Einsätze gebunden.

Ein neuer Timer kann je Aktion ersetzen, Vorgabe ändern oder Bestätigung verlangen. Hinweise erscheinen neben dem Timer oder übernehmen die Anzeige; der Zeitlauf wird separat festgelegt. Schnelltextvorlagen und freie Eingabe sind möglich. Hinweise werden bewusst ausgeblendet; optionaler Ablauf ist einstellbar.

### Pausen und Playlists

Pausen beginnen erst mit GO, typischerweise 15 Minuten, individuell anpassbar. Der Bühnenmonitor zeigt den Pausencountdown und Überziehung. Die Regie startet die nächste Show bewusst. Sponsorenvideo als Schleife oder Bild-/Videoplaylist dient als Standardausgabe.

Playlistreihenfolge, Bilddauer, Videoausschnitt, Übergang und Ton sind je Eintrag einstellbar. Pausen- und Sponsorenvideos sind standardmäßig stumm; Musik startet manuell in Virtual DJ. Neue Playliststände werden bewusst am Übergang oder ausdrücklich sofort übernommen.

### Nachrichten und Bereitschaft

Die Regie sendet Hinweise gezielt an Bühnenmonitor, Moderatorgeräte oder Teams. Wichtige Hinweise können aktive Lesebestätigung verlangen; Zustellung und Bestätigung sind unterscheidbar. Moderation sendet Schnellmeldungen und freien Text zurück, ohne dadurch automatisch den Ablauf zu ändern.

Showteam, Bühnenbau und Technik melden Bereitschaft getrennt durch zugewiesene Verantwortliche. Wesentliche Änderungen markieren betroffene Meldungen als erneut zu prüfen. Einsätze können fehlende Bereitschaft anzeigen, warnen oder GO sperren. Ein eigenes Recht erlaubt bewusstes protokolliertes Übergehen.

## 8 Spiele Quiz Buzzer und Jury

### Teilnehmer und Antwortregeln

Einzelpersonen und Teams sind möglich, ein Team verwendet ein gemeinsames Gerät. Gestellte und geeignete private Handys oder Tablets werden unterstützt. Bis zehn Teilnehmergeräte bilden das erste Prüfziel, Moderator- und Jurygeräte kommen hinzu. QR- oder Beitrittscode führt zur Teilnahme, die Regie bestätigt Zuordnung und kann Ersatzgeräte verbinden.

Fragetypen umfassen Auswahl, Text und numerische Schätzung, ergänzt durch Bilder, Audio und Video. Tabletinhalt ist je Frage wählbar: nur Antwortfelder oder zusätzliche Frage und Medien. Frageanzeige und Antwortfreigabe starten gemeinsam oder getrennt. Ändern bis Fristende und verbindliches Bestätigen sind einstellbar. Nur bestätigte Abgaben gelten als durchgegangen.

Bei Tabletverlust läuft die Zeit zunächst weiter. Die Regie erhält Warnung, der Bühnenmonitor einen kompakten Hinweis mit Teamname, der bei Wiederverbindung verschwindet. Die Regie kann pausieren, verlängern, wiederholen oder stellvertretend erfassen. Lösungen und Ergebnisse erscheinen erst durch ausdrücklich berechtigte Veröffentlichung.

### Wertung und Korrektur

Regeln sind je Runde flexibel, manuell oder automatisch. Freitext nutzt Vorschläge anhand richtiger Antworten und Schreibvarianten mit manueller Entscheidung. Schätzfragen unterstützen geringste Abweichung, Toleranz und abgestufte Punkte. Rundengleichstände verwenden gemeinsame Platzierung oder Stichfrage.

Die Regie kann Fragen erneut öffnen, Fristen ändern, Antworten und Punkte korrigieren sowie Fragen oder Antworten für alle oder einzelne Teilnehmer ungültig erklären. Arbeitsstände und veröffentlichte Wertungen sind getrennt. Normale manuelle Vergaben brauchen optional einen Grund, Korrekturen abgeschlossener Wertungen verpflichtend.

Fragen werden unabhängig in geschützten Bibliotheken vorbereitet, mit Kategorien und Schwierigkeit. Shows übernehmen feste Stände; ein Teilrecht erlaubt Freigabe. Feste oder zufällige Fragefolgen sind möglich und protokolliert. Antwortauflösung, Rundenstand, Gesamtstand und Gewinneransicht sind frei gestaltbar und werden bewusst veröffentlicht.

### Allgemeine Spiele und Buzzer

Eine allgemeine Punkteverwaltung unterstützt beliebige Spiele mit Teilnehmern, Teams und Runden. Optionale Gesamtwertungen übernehmen ausgewählte Spielpunkte nach festgelegter Gewichtung. Teamwechsel werden protokolliert, abgeschlossene Wertungen nicht rückwirkend automatisch verschoben.

Tablet-Buzzer sind Bestandteil, Hardwareadapter bleiben vorbereitet für später. Der Server bestimmt die Reihenfolge gültig eingegangener Signale. Nur erster Treffer oder vollständige Reihenfolge, Sperren und Reset sind wählbar. Fehlstarts werden je Runde ignoriert oder mit ausdrücklich konfigurierter Folge erfasst. Netzwerkbasierte Reihenfolge beweist keine identische physische Reaktionsmessung aller Geräte.

### Jury

Jury-Tablets unterstützen Punkte, Kategorien, Gewichtung sowie Ja/Nein oder X. Ein Auftritt erhält Teilnehmer, Titel und eigene Runde. Signale können je Show sofort wirken oder Regiefreigabe brauchen. Wertungsänderungen und gegenseitige Einsicht sind je Runde einstellbar. Fehlende Wertungen erzeugen Warnung; die Regie entscheidet über Warten oder dokumentierten Abschluss. X-Anzeigen werden manuell oder beim bewusst begonnenen nächsten Auftritt zurückgesetzt.

## 9 Moderationskarten und Moderatorgeräte

### Karten erstellen und drucken

Moderationskarten haben DIN A5 Querformat mit 210 × 148 mm und werden direkt als A5 ausgegeben. Eine A4-Ausschießfunktion ist nicht Bestandteil der gewählten Moderationsausgabe. Stichpunkte und vollständige Texte sind kombinierbar. Jeder Kartensatz hat eine eigene einheitliche und individuell gestaltbare Rückseite.

Showteam, zugeordnete Moderation und Leitung bearbeiten die Karten. Gemeinsame und persönliche Sätze sind möglich. Zuordnung zu Show, Abschnitt und Einsatz erzeugt Änderungshinweise, überschreibt aber keine formulierten Texte. Kartenreihenfolge, wählbare Kopf-/Fußzeilen, Show, Abschnitt, Sprecher und Nummer helfen bei Orientierung. Sprechwechsel können abschnittsweise markiert werden.

Textüberlauf wird auf Folgekarten verteilt beziehungsweise vorgeschlagen, manuelle Umbrüche sind möglich. Die Schrift darf eine festgelegte Mindestgröße nicht unterschreiten. PDF-Exporte halten einen festen Stand; spätere Änderungen zeigen, welche Karten ersetzt werden müssen. Ganz-, Show- und einzelne Exporte unterstützen die Druckvorbereitung.

### Moderatoransicht

Eine geschützte digitale Ansicht ergänzt Papierkarten für alle Showarten. Sie zeigt Karten, aktuelle Ablaufposition, Timer und Regiehinweise; Quiz zeigt zusätzlich entsprechend erlaubte Fragen, Lösungserklärung, Abgabestatus und Punkte. Die Moderation blättert selbst und kann bewusst zur aktuellen Regieposition wechseln.

Bedienrechte sind je Show einstellbar. Lösungssichtbarkeit ist je Frage, Einsicht in Teamantworten je Runde wählbar. Teilnehmer dürfen diese Ansicht nicht erhalten. Rückmeldungen gehen intern an die Regie. Bei Verbindungsverlust bleiben geladene Karten lesbar; Livewerte werden als veraltet gekennzeichnet, Aktionen gesperrt. Das tatsächliche Moderatorgerät wird noch organisiert.

## 10 Bühnenbau Requisiten Rollen und Kostüme

### Bühnenbauer-Team und Arbeitsschritte

Das eigene Bühnenbauer-Team erhält eine Aufgabenübersicht und darf Tätigkeiten ergänzen. Leitung, Shows und Bühnenbau melden Bedarfe; Selbstübernahme und berechtigte Zuweisung sind möglich. Aufbau, Showumbau und Abbau werden als eigene Schritte mit Zuständigkeit, erwarteter Dauer und Ablaufbezug geführt.

Änderungen an eingeplanten Bedarfen werden sofort gespeichert, markiert und Betroffenen gemeldet; Gesehen-Bestätigung ist möglich. Bereitschaft wird bei wesentlichen Änderungen neu geprüft. Mobile Rückmeldungen, Fotos und druckbare Checklisten unterstützen die Durchführung.

### Grafischer Bühnenplan

Ein maßstäblicher 2D-Editor zeigt Maße, Positionen und Beschriftungen. Eine 3D-Ansicht ist nicht Bestandteil. Ein Grundplan erhält Varianten je Abschnitt oder Einsatz. Requisiten, Aufbauten, Technik, Personenpositionen und Wege sind darstellbar. Objekte verweisen auf gemeinsame Bestands- und Aufgabendaten. Variantenvergleich hebt hinzugefügte, entfernte und verschobene Objekte hervor; die Koordination ergänzt Umbauaufgaben.

Pläne und Checklisten stehen mobil und als PDF mit Stand zur Verfügung. Eine gezeichnete Anordnung ersetzt keine Prüfung des tatsächlichen Aufbaus vor Ort.

### Bestand und Leihgaben

Requisiten werden veranstaltungsweit und für mehrere Shows zugeordnet. Anzahl, Foto, Standort, Zuständigkeit, Einsatzbedarf und mögliche Überschneidungen sind dokumentierbar. Eigener Bestand, Spende und Leihgabe sind unterscheidbar. Herkunft, Abholung, Transport, Zustand und Rückgabe werden organisatorisch erfasst, ohne komplexes Beschaffungsmodul.

Einzelstücke erhalten Kennungen, gleichartige Dinge können Mengenbestände mit Teilzuordnungen bilden. Drucketiketten enthalten Name und Kennung, keinen QR-Code. Fotos können mobil direkt aufgenommen oder ausgewählt werden.

### Mitwirkende und Kostüme

Mitwirkende brauchen kein Benutzerkonto, können aber mit einem vorhandenen verknüpft werden. Rollen haben Haupt- und Ersatzbesetzungen mit bewusst aktiver Zuordnung. Ein Ausfall hebt betroffene Rollen, Proben und Auftritte hervor. Überschneidungen und knappe Wechselzeiten erzeugen Warnungen.

Kostüme bilden einen gemeinsamen wiederverwendbaren Bestand mit Größen, Fotos, Zustand, Standort, Ausleihe und Rückgabe. Sets fassen mehrere Teile für eine Rolle als Checkliste zusammen. Teams sehen ihre eigenen bevorstehenden Einsätze, Zeitabweichungen und Hinweise ohne automatische Livebedienrechte.

## 11 Ticketshop Saalplan und Reservierungen

### Verkauf und Käuferzugang

Der Shop wird selbst entwickelt. Käufer bestellen ohne Konto und erhalten einen geschützten Bestelllink. Verkaufsteam und Kunden können Gruppenbuchungen anlegen; unverbindliche befristete Reservierungen ohne Kauf legt nur das Verkaufsteam an. Interner Vorverkauf und Abendkasse sind Bestandteil.

Ticketarten, Preise und Kontingente sind je Veranstaltung frei definierbar. Gemeinsame geeignete Plätze und zusätzliche Ticketartenlimits verhindern doppelte Bestandszählung. Verkaufsbeginn, Ende und Bestelllimit sind einstellbar, interne Ausnahmen berechtigt möglich. Einlass- und Veranstaltungsbeginn sind getrennte Angaben.

### Grafischer Saalplan

Der Browsereditor unterstützt runde und rechteckige Tische, Sitzreihen, einzelne Sitze, Bühne und gesperrte Bereiche. Größen, Drehung und Sitze sind bearbeitbar. Kennungen werden automatisch nach Richtung oder manuell vergeben und auf Eindeutigkeit geprüft. Vorlagen sind wiederverwendbar.

Platzmerkmale und Hinweise können intern oder öffentlich sein. Der öffentliche Plan zeigt Bühne, Bereiche und ausgewählte Wege, keine internen Aufbauinformationen. Käufer wählen auf Karte, über zusätzliche Liste oder erhalten automatische Vorschläge. Fehlen zusammenhängende Plätze, werden Alternativen vor Buchung bewusst bestätigt.

Lückenregeln können je Bereich aus, Hinweis oder verbindlich sein; interne Ausnahmen benötigen Rechte. Vor Veröffentlichung werden Kennungen, Kapazitäten, unzugeordnete Plätze und auffällige Überschneidungen geprüft. Neutraler Aufbauplan und rechteabhängige Bestandsansicht sind mit Datum druckbar. Eine Käufervorschau testet Regeln und Preise ohne echten Bestand zu blockieren.

### Reservierungen und Gruppen

Während der Bestellung werden Plätze befristet mit sichtbarem Countdown gehalten. Bereiche unterstützen feste Plätze oder freie Platzwahl, exklusive Gruppe oder mehrere Gruppen, Mindest- und Höchstgröße. Gruppen haben internen Namen und Ansprechpartner und kaufen über eine gemeinsame Bestellung. Nicht gekaufte Restkontingente können teilweise oder vollständig freigegeben werden.

Interne Reservierungen erhalten Frist und werden bei Ablauf als überfällig zur Entscheidung markiert. Weitere Kontingente können mit Zweck und Zuständigkeit zurückgehalten werden. Bestandsansichten unterscheiden frei, im Bestellvorgang, reserviert, verkauft, gesperrt, Gruppenzuordnung und Papierkartenvorrat. Knappheitswarnungen sind einstellbar.

Unbelegte Planbereiche sind anpassbar. Änderungen an verkauften Plätzen erfolgen nur über dokumentierte Umbuchung und aktualisierte Tickets. Ermäßigungsvoraussetzungen können Hinweis und Bestätigung beim Kauf verlangen; Einlass kann eine gesonderte Nachweisbestätigung erfordern.

## 12 Ticketzahlungen Karten und Stornierungen

### Zahlungen und Fristen

Zahlungsarten sind Überweisung und Barzahlung; ein Onlinezahlungsdienst ist nicht vorgesehen. Überweisungen erhalten eindeutige Bestellreferenz und werden manuell bestätigt. Standardfrist in Tagen, spätester Zahlungstermin und einzelne Verlängerungen sind einstellbar. Überfällige unbezahlte Bestellungen entscheidet das Verkaufsteam, nicht automatische Stornierung.

Teilzahlungen und gemischte Zahlungseingänge sind erfassbar. Standard ist Ticketausgabe nach vollständiger Bestellung; ein Sonderrecht erlaubt ausdrückliche Zahlungszuordnung und Ausgabe einzelner bezahlter Karten. Überzahlungen und Zahlungen zu stornierten Bestellungen werden Klärfälle. Barzahlungen werden Kasse und Benutzer zugeordnet; Anfangsbestand, erwarteter und gezählter Abschluss sind möglich. Zahlungsbelege sind druckbar oder per E-Mail ausgebbar.

### Ticket und Papierverkauf

Jede Person erhält eine eigene Karte mit eindeutiger Kennung und QR-Code. Die sichtbare Nummer besteht aus Eventkennung und laufender Nummer, etwa SN27-00123. Personalisierte und nicht personalisierte Karten sind je Veranstaltung möglich. Die Nummer allein ersetzt nicht die Gültigkeitsprüfung.

Anpassbare Vorlagen zeigen Event, Datum, Einlass-/Startzeit, Ort, Ticketart, Platz oder Bereich, Nummer und QR-Code; Name nur bei Personalisierung. Pflichtfelder bleiben geschützt. PDF-Formate unterstützen A4 und Einzelkarten; das Einzelkartenformat bestimmt die Vorlage.

Gültige Karten kommen nach Zahlungsbestätigung per E-Mail und geschütztem Downloadlink. Bestellbestätigung, Zahlungsinformationen und einstellbare Erinnerungen sind automatisch. Versandfehler werden sichtbar; korrigierte Zustelladresse, erneuter Versand und Druck sind möglich. Käufer korrigieren freigegebene Kontaktdaten, E-Mail-Änderungen werden gesondert bestätigt. Verlorene Bestelllinks können an die hinterlegte Adresse neu angefordert werden.

Papierkarten werden nach Buchung gedruckt oder vorab als Vorrat erstellt. Ihr Bestand ist bis Verkauf oder dokumentierter Entwertung blockiert. Ausgabe an Person oder Verkaufsstelle, Verkauf, Rückgabe und Verlust werden erfasst. Papier und PDF verweisen auf dasselbe Ticket. Ersatztickets erhalten neue Kennung und entwerten die alte Karte.

### Änderungen Erstattungen und Sonderfälle

Platz- und Ticketartwechsel sind mit Verlauf und Preisunterschieden möglich. Käufer erhalten Änderungsnachricht und gegebenenfalls neue Karten. Stornierungsanfragen betreffen gesamte Bestellungen oder einzelne Tickets und werden berechtigt entschieden. Genehmigung entwertet sofort und gibt Plätze frei; tatsächliche Rückzahlung bleibt separat offen und wird außerhalb der Anwendung vorgenommen und bestätigt.

Freikarten und Gästelistenplätze benötigen eigene Rechte, normale Nummern, QR und Platzbindung. Wartelisten werden vom Verkaufsteam betreut. Veranstaltungsabsage hat geführte Übersicht zum Schließen, Informieren und Nachverfolgen der Erstattungen. Bei Verschiebung entscheidet die Leitung bewusst, ob bestehende Karten gültig bleiben oder ersetzt werden.

## 13 Einlass Verkaufsauswertung und Zuständigkeit

### Scan-Web-App

Mehrere Handys und Tablets scannen parallel per Kamera. Android und iPhone/iPad gehören zum Prüfziel. Der zentrale zuständige Server entscheidet über gültige Karten und protokolliert Einlass. Bereits verwendete Karten erzeugen Warnung; nur berechtigte Benutzer erlauben Wiedereintritt.

Bei unlesbarem QR helfen Ticketnummer und eingeschränkte Bestellsuche. Manueller Einlass benötigt ein Sonderrecht. Die Scanansicht zeigt Gültigkeit, Event, Ticketart, Platz/Bereich und optional Besuchername, keine unnötigen Finanzdetails. Erforderliche Nachweise werden vor Einlass bestätigt.

### Online und lokaler Betrieb

Vor Übergabe wird der öffentliche Onlineverkauf geschlossen und der Bestand vollständig abgeglichen. Abendkasse und Einlass arbeiten anschließend verbindlich lokal. Ohne Internet ist der vorbereitete lokale Betrieb möglich. Ein einzelnes Gerät ohne erreichbaren zuständigen Server bestätigt keinen automatischen Einlass; Wechsel auf verbundenes Gerät oder dokumentierter Ersatzweg ist nötig.

Laufende Betriebsdaten werden bei Verbindung zusätzlich online und auf einen zweiten vorhandenen Rechner übertragen. Sicherungsstand und Lücken sind sichtbar. Bei Hauptrechnerausfall kann ein berechtigter Benutzer den Online-Server bewusst für Einlass und Organisation aktivieren. Physische Bild-, Ton- und Lichtausgabe bleibt von vorhandener lokaler Technik abhängig. Unklarer letzter Einlassstand erzeugt Warnung und berechtigte Entscheidung.

Sind Hauptrechner und Internet gleichzeitig ausgefallen, dienen bereitgestellte Liste und manuelles Protokoll als Einlassersatz. Der öffentliche Shop öffnet im Ersatzbetrieb nicht automatisch. Rückwechsel erfolgt bewusst nach Abgleich, damit keine widersprüchlichen aktiven Bestände entstehen. Online-Ersatz für laufende Spiele ist nicht Bestandteil der gewählten Übernahme; bei einem Spielserverwechsel wird pausiert und der Stand geprüft.

### Auswertung

Verkauf, Zahlungseingänge, offene Beträge, Erstattungen, Auslastung und Einlasszahlen sind auswertbar. CSV und druckbare Exporte berücksichtigen Benutzerrechte. Einlasszahl beschreibt erfasste Eintritte beziehungsweise eindeutige Tickets, ohne vollständiges Auschecken keine verlässliche aktuelle Saalbelegung.

## 14 Sponsoring Öffentlichkeit und einfache Finanzen

### Sponsoring

Leitung und Sponsoringteam verwalten Kontakte, Zusagen und Leistungen. Andere Teams erhalten freigegebene Werbeinhalte. Ein Sponsorenportal oder Uploadlink ist nicht vorgesehen, Einpflege erfolgt intern. Geld-, Sach- und Dienstleistungen bleiben unterscheidbar; eine Zusage ist kein bestätigter Zahlungseingang.

Werbeplätze können als wiederverwendbare Angebote mit Kapazität und Zuordnung geführt werden. Helle, dunkle und weitere Logovarianten sind nach Verwendung auswählbar. Ausgegebene Sponsorinhalte werden protokolliert; der Nachweis der erzeugten Wiedergabe ersetzt nicht die Prüfung tatsächlicher Leinwandsichtbarkeit.

### Öffentliche Seiten

Eine gemeinsame Veranstaltungsübersicht verweist auf eigene Eventseiten mit Infos, Programm, Sponsoren und Ticketzugang. Jede Show besitzt separate öffentliche Beschreibung und freigegebene Bilder; Regienotizen, Einsatzdetails und Lösungen bleiben intern. Entwürfe werden mit Vorschau bewusst veröffentlicht, durch Leitung oder berechtigte Öffentlichkeitsarbeit.

Kontaktangaben werden angezeigt, ein Kontaktformular ist nicht vorgesehen. Vergangene Seiten können je Event als Rückblick erhalten, ausgeblendet oder offline genommen werden. Gemeinsame Webadresse und optional administrativ zugeordnete vorhandene Domains sind möglich.

### Finanzen bleiben einfach

Die Finanzverwaltung besteht ausschließlich aus Einnahmen und Ausgaben mit Datum, Betrag, Kategorie, Beschreibung und optionalem Beleg. Gesamtsummen, Saldo, Suche und Export sind vorgesehen. Korrekturen behalten vorherigen Stand, Benutzer und Zeitpunkt. Zugang folgt Finanzrechten; die Leitung sieht und bearbeitet alles ihrer Veranstaltung.

Bestätigte Ticketzahlungen und tatsächlich bestätigte Erstattungen werden aus dem Ticketmodul übernommen und nicht nochmals manuell gezählt. Andere Einnahmen, auch Sponsorzahlungen, und Ausgaben werden einfach eingetragen. Sachzusagen erhöhen nicht automatisch Geldeinnahmen. Die bestehende Buchhaltung bleibt außerhalb des Systems. Eine genehmigte, aber noch nicht ausgezahlte Erstattung zählt nicht als erfolgte Rückzahlung. Übernommene Zahlungsvorgänge werden anhand ihrer Kennung nur einmal berücksichtigt.

Ausdrücklich entfallen: Teilbudgets, Beschaffung vom Bedarf bis Lieferung, Angebotsvergleich, Einkaufsfreigaben, Mehrkostenfreigaben, Teillieferungen, private Auslagenerstattungsprozesse und eine vollständige Buchhaltung. Materialbedarfe bleiben normale Aufgaben und Bestandsangaben. Ticketzahlung, Kassenabschluss und Ticket-Erstattung bleiben ausschließlich im dafür erforderlichen Ticketmodul.

## 15 Proben Lernbetrieb und Bedienungsanleitung

### Proben

Ein Einsatz, Abschnitt, eine Show oder ein vollständiger Abend kann geprobt werden. Vorbereitete Ausgangszustände stellen Bild, Timer und ausdrücklich gewählte externe Aktionen her; vergangene Einmalaktionen werden nicht nachträglich abgespielt. Eine Startübersicht zeigt je Ausgabe echt oder simuliert und erlaubt bewusste Auswahl.

Der Vorbereitungseditor simuliert Bild, Animation und Vorhörton. Externe Licht- und Musikaktionen werden dort nicht ausgeführt, sondern nur im ausdrücklich gewählten Probenbetrieb. Quizproben haben getrennte Teilnehmer-, Antwort- und Punktestände. Reset verändert keine vorbereiteten Fragen und Regeln.

Notizen, Probleme und Aufgaben werden Probe und betreffendem Inhalt zugeordnet. Agenda, Notizen, offene Aufgaben und verwendeter Stand sind als PDF-Protokoll exportierbar. Der Generalprobenstand wird festgehalten; Änderungen danach sind sichtbar und erneut prüfbar.

### Vollständige bebilderte Anleitung

Eine ausführliche Anleitung gehört zur vollständigen Auslieferung. Sie enthält Installation und Einrichtung, Organisation und Rechte, sämtliche Fachmodule, Vorbereitung, Livebedienung, Verkauf und Einlass sowie Synchronisation, Sicherungen und Fehlerhilfe. Schritte erklären Ausgangslage, Bedienhandlung und erwartetes Ergebnis.

Bilder sind echte Screenshots der jeweiligen Softwareversion mit markierten Bedienelementen. Nicht fertiggestellte Ansichten werden nicht als reale Bedienung ausgegeben. Das Handbuch ist durchsuchbar in der Anwendung, lokal ohne Internet und als PDF verfügbar. Hilfebuttons öffnen passende Kapitel, kurze Erklärungen ergänzen zentrale Elemente.

Druckbare Schnellanleitungen je Rolle ergänzen das Gesamthandbuch. Eine Beispielveranstaltung mit Shows, Medien, Quiz und Testtickets enthält Übungsaufgaben. Reale Ausgaben und E-Mails sind darin standardmäßig deaktiviert. Version und Aktualisierung der Dokumentation gehören zur Softwarepflege.

## 16 Technikarchitektur Signalwege und Geräte

### Entwicklungsgrundlage

Vorgesehen sind React und TypeScript für die Browseroberfläche, Konva für grafische Editorflächen sowie eine gemeinsame Node.js-/TypeScript-API, beispielsweise Fastify. Der Onlinebetrieb verwendet PostgreSQL, lokal ist SQLite vorgesehen. Fachmodule teilen Rechte, Identitäten und Datenmodelle; sie werden als klar getrennte Bereiche eines gemeinsamen Systems entwickelt.

Eine getrennte native Windows-Medienkomponente auf Basis von C++ und GStreamer mit geeigneter Grafikkomposition, beispielsweise Skia, ist die Entwicklungsgrundlage für Kamera, Video und Audio. WebRTC ist für die Programmansicht vorgesehen. FFmpeg unterstützt Analyse und Aufbereitung. Die Kombination und benötigten Codecs sind durch Prototyp und Lizenzprüfung zu bestätigen.

Der Server verwaltet Zustand und Befehle, die Medienkomponente rendert. Eine zentrale Ereignisfolge und eindeutige Befehlskennungen schützen vor doppelter Ausführung. Vorbereitungspakete und laufender Zustand bleiben getrennt. Die Architektur behauptet keine bereits nachgewiesene Leistungs- oder Synchronitätsgarantie.

### Physische Aufteilung

| Arbeitsplatz | Aufgabe und Signalweg |
| --- | --- |
| Windows Hauptrechner | Server, Rendering, Kameras, eigene Medien und Effektton. Direkter HDMI-Weg zum Projektor; separate Ausgabe zum Bühnenmonitor. Eigener Ton zum Digitalmischpult. |
| MSI Steuerungsnotebook | i7, 32 GB RAM, RTX 3070, 2 TB. Virtual DJ Pro, DDJ-FLX4 per USB, APC Mini MK2 und Browserregie. FLX4-Master zum Mischpult, Kopfhörervorhören über Controller vorgesehen. |
| Lichtnotebook | Daslight 5, Lichtinterface und Browserregie. Interface ist noch exakt zu klären: Daslight Go oder genanntes Cameo Pro DVC. |
| Netcup VM | Onlinevorbereitung, Dateien und synchronisierte Daten; bewusst aktivierbarer Ersatz für Einlass und Organisation. |
| Tablets und Handys | Teilnahme, Jury, Moderation, Einlass und organisatorische Rückmeldungen je Rolle. |

Mikrofone gehen weiterhin an das Mischpult. Virtual-DJ-Musik und Ton des Hauptrechners erhalten getrennte Wege. Kameraton ist standardmäßig stumm. Der frei konfigurierbare Vorhörweg soll möglichst den FLX4 nutzen; gleichzeitiger Zugriff neben Virtual DJ ist noch praktisch zu prüfen und nicht zugesagt.

### Controller und Anbindungen

APC Mini MK2 nutzt 64 RGB-Pads und neun Fader. MIDI Learn, Banken, beschriftete Liveübersicht, LED-Zustände und Faderübernahme sind vorgesehen. Profile wechseln manuell oder optional mit Shows. Doppelbelegung mit Virtual DJ wird verhindert. Das vorhandene Stream Deck erhält eine eigene kostenlose SDK-Anbindung; Modell bleibt offen. Tastenkürzel dürfen Texteingaben nicht unbeabsichtigt auslösen.

Lokale Windows-Agenten verbinden Controller und Programmschnittstellen mit dem Server. Virtual-DJ-Netzwerksteuerung und Daslight-OSC werden an den tatsächlichen Versionen geprüft. Teams formulieren Musik-/Lichtwünsche, Lichttechnik stellt Bausteine bereit; Tontechnik ordnet Titel, Dateien und Aktionen zu. Status unterscheiden gesendet, bestätigt, fehlgeschlagen und unbekannt. Kameras erhalten Namen, Spiegelung, Zuschnitt und Helligkeits-/Farbeinstellungen sowie Ersatzquellen. Wiederanschluss soll ohne vollständigen Neustart der Anwendung möglich sein.

Für die Onlinevorbereitung werden Windows, macOS und Linux im Browser vorgesehen. Live-Regie prüft zuerst Chrome und Edge unter Windows. Raspberry Pi und andere Agentplattformen bleiben spätere separat zu prüfende Optionen. Das eigene Techniknetz verbindet Hauptrechner und Notebooks möglichst per Kabel; eigene WLAN-Zugänge versorgen Mobilgeräte getrennt von Besucherzugängen.

## 17 Synchronisation Sicherungen und Ausfälle

### Zeit und Musik

Lippensynchrone Livekamerabilder und musikgenaue Videos und Lichteffekte werden am vollständigen Aufbau geprüft. Bildaufnahme, Capture, Rendering, Projektor, Mischpult und Audiowege tragen zur Verzögerung bei. Gleichzeitig gesendete Befehle beweisen keine dauerhafte Kopplung. Exakte Zielgrenzen und zulässige Schwankungen werden vor Abnahme vereinbart.

Gesangsnummern sind feste Titel ohne notwendige Tempoänderung. Dekorative Videoloops überwiegen, musikgebundene Videos können vorkommen. Diese erhalten Titel, Startpunkt und einstellbaren Versatz. Bei verlorener Positionskopplung läuft das Video ab letzter Position normal weiter. Erneute Kopplung erfolgt bewusst. Musikersatz auf dem Hauptrechner wird manuell gestartet und geprobt, ohne nahtlose Übernahme zu versprechen.

Technikprofile halten Testaufbau, beobachteten oder gemessenen Versatz und Korrekturen fest. Hardwareänderungen markieren erneuten Prüfbedarf. Licht lässt sich weiterhin manuell bedienen; Funktionen ohne verlässliche externe Rückmeldung bleiben unbekannt. Pro Toninhalt ist ein Wiedergabeweg festgelegt, damit keine unbeabsichtigte Doppelwiedergabe entsteht.

### Sicherungen und Wiederanlauf

Automatische und manuelle Sicherungen, Sicherung vor wichtigen Änderungen und geprüfte externe Datenträgerkopie sind vorgesehen. Laufende Betriebsdaten werden zusätzlich auf einen zweiten vorhandenen Rechner und bei Verbindung online übertragen. Der Sicherungsstand ist sichtbar; eine Zusatzkopie ist kein automatisch aktiver Ersatzserver.

Nach Neustart lädt der Hauptrechner den gespeicherten Ablaufstand und zeigt zunächst einen sicheren Hintergrund. Musik und Einsätze starten erst bewusst. Beim Ausfall eines Regiefensters läuft der Hauptrechner weiter. Nach Wiederverbindung wird aktueller Zustand geladen, unbestätigte alte Befehle nicht nachgeholt. Dasselbe gilt für wiederverbundene Controller, Virtual DJ und Daslight.

Quellen können Ersatzbild, alternative Quelle oder neutralen Hintergrund erhalten. Controllerverlust erzeugt Warnung, Browser und Tastatur bleiben nutzbar. Ein Notbetrieb über das MSI hält priorisierte Videos, Bilder, bereitgestellte Ersatzmusik und Ablauf-PDF in üblichen Formaten vor. Physische Bild-/Tonumschaltung und Belastung neben Virtual DJ müssen geprobt werden.

### Online und lokal abgleichen

Pakete enthalten alle benötigten Eventdaten und Medien, Schriften sowie vorbereitete Konten. Download erfolgt geprüft mit Vollständigkeit und Prüfsummen. Aktivierung braucht eigenes Betriebsrecht und erfolgt bewusst; laufender Stand ändert sich nicht durch bloßes Speichern. Originalpakete und vorheriger Stand bleiben für Rückkehr verfügbar.

Lokale Inhaltsänderungen werden abgeglichen, Konflikte von Leitung oder zuständigen Bearbeitern entschieden. Betriebsdaten werden nach Wiederverbindung automatisch mit Statusübersicht übertragen. Unklare Zustände werden nicht still überschrieben. Ersatzaktivierung und Rückwechsel verwenden eine eindeutige Zuständigkeit für den verbindlichen Bestand.

## 18 Einrichtung Abnahme und offene Prüfpunkte

### Installation und Betrieb

Ein Windows-Installer richtet Hauptrechner und benötigte Agenten ein. Der Einrichtungsassistent verbindet Server, Ausgänge und Geräte. Wiederverwendbare Technikprofile trennen Hardware von Showinhalten. Fehlende Geräte werden konkret gemeldet und Ersatzgeräte zugeordnet. Autostart ist je Profil möglich, stets mit sicherem Anfangszustand. Neue Veranstaltungen können durch kurzen Assistenten oder direkte Bearbeitung angelegt werden. Bereichsbezogene Vollständigkeitsprüfungen sperren nur die abhängige Funktion. Excel-/CSV-Listen für Aufgaben, Requisiten, Mitwirkende und Quizfragen erhalten Spaltenzuordnung, Vorschau und Fehlerprüfung. Importierte Quizfragen werden als prüfbedürftig markiert; zuständige Bearbeiter bestätigen Inhalte ohne zusätzliche Leitungsfreigabe. Vorhandene Ablauf- und Moderationsdokumente bleiben als Anhänge, Texte werden gezielt übernommen.

Vor Probe und Veranstaltung prüft ein geführter Ablauf Medien, Ausgänge, Clients und Anbindungen. Tatsächliches Bild, Ton und Licht bestätigt ein Benutzer zusätzlich. Diagnosepakete enthalten Versionen, Geräte und Fehler, keine Zugangsdaten oder Ticket-QR-Geheimnisse; personenbezogene Angaben werden soweit möglich entfernt. Updates werden bewusst installiert; die Veranstaltung verwendet einen dokumentierten getesteten Stand.

### Verbindliche erste Prüfziele

- Bis 300 Besucher, bis zehn gleichzeitig arbeitende interne Benutzer und bis zehn Teilnehmergeräte; Moderator- und Jurygeräte zusätzlich.

- Full HD als Basis, eine Leinwand und separater Bühnenmonitor gleichzeitig. Höhere Auflösungen und zusätzliche unabhängige Ausgaben sind gesondert zu prüfen.

- Mindestens eine reale Kamera mit tatsächlichem Anschluss, Ausgabe und gemessener Verzögerung.

- Offlinebetrieb nach vollständiger Bereitstellung, inklusive Konten und zusätzlicher Anmeldung für Admin/Leitung.

- Zwei gleichberechtigte Regieplätze, mehrere Ansichten, konkurrierendes GO und bewusste Eingriffe.

- Mediennormalisierung, Vorhörtrennung, FLX4-Zugriff, Controllerzustände und Wiederanschluss neben den Programmen.

- Getrennter Ticket-Testbetrieb mit ungültigen Testcodes für echten Einlass; Prüfung von Gruppen, Papierbestand, Teilzahlungen, Stornierung und mehrfachen Scans.

- Ausfallsituationen inklusive Hauptrechner, Internet, Einzelgerät und Übertragungslücke sowie bewusster Online-Ersatz und Rückwechsel.

- Vollständiger realer Gesamttest vor Freigabe und technische Netzprobe vor der Generalprobe; Generalprobenstand und spätere Änderungen nachvollziehbar.

### Noch offene Bestandsangaben und technische Nachweise

- Hauptrechner existiert noch nicht. Er wird aus privat verfügbaren beziehungsweise organisierten Mitteln bereitgestellt; ein Vereinsbudget für den Rechner ist nicht vorgesehen.

- Projektor ist noch nicht festgelegt. Direkter HDMI-Bildweg ist bestätigt, Auflösung, Betriebsmodus und Verzögerung am konkreten Gerät fehlen.

- Digitalmischpult ist bestätigt; Modell, Routing und verfügbare Verzögerungsfunktionen müssen erhoben werden.

- Lichtnotebook-Leistung und genaues Daslight-/Cameo-Interface bleiben offen. Verwendete Softwarestände werden vor Tests dokumentiert.

- Kameramodelle, Anzahl, Capture und Anschlussart sind offen. Moderatorgerät wird organisiert; konkrete private/gestellte Mobilgeräte werden getestet.

- Stream-Deck-Modell, installierte Browser-/Treiberstände, FLX4-Vorhörweg und tatsächliche Port-/Bildschirmzuordnung fehlen noch.

- Netcup-VM-Dimensionierung, Domain-/E-Mail-Einrichtung und Sicherungsziele werden im Installationsplan festgelegt. Bestehende Konten oder Tarife werden nicht vorausgesetzt.

- Die gewählten Softwarekomponenten, Schnittstellenrückmeldungen, Importtreue und erreichbare Synchronität benötigen praktische Prototypnachweise.

- Vor öffentlichem Ticketbetrieb sind Veranstalterangaben, Verkaufstexte und erforderliche Datenschutz-/Vertragsangaben gesondert zu vervollständigen; dieses Konzept liefert dafür keine rechtliche Prüfung.

Weitere Detailentscheidungen entstehen aus den konkreten Bedienabläufen und realen Tests. Sie werden als offene Punkte dokumentiert, nicht durch ungeprüfte Erfolgszusagen ersetzt. Neue Wünsche nach diesem Stand werden als Änderung erfasst, damit Umfang und Abnahme nachvollziehbar bleiben.

## 19 Kostenlose Erweiterungen und Entwicklungshilfen

Kostenlose zusätzliche Komponenten werden bevorzugt als eigene Adapter und Module integriert. Externe Plugins sind keine Voraussetzung für den Veranstaltungsbetrieb. Gebührenpflichtige Zusatzfunktionen werden nicht stillschweigend Teil der Lösung. Vorhandene Softwarelizenzen, Hosting und tatsächliche Hardware bleiben getrennte Voraussetzungen.

Figma kann Oberflächenentwürfe und Komponenten unterstützen, Canva liefert bestehende Gestaltungen über Dateien. Git-Versionsverwaltung, Browserprüfungen etwa mit Playwright und automatisierte Prüfungen unterstützen die Entwicklung. Aktuelle Verfügbarkeit, Kontozugriff und kostenlose Nutzung müssen für konkrete externe Dienste überprüft werden; dieses Kapitel bestätigt keine aktive Verbindung oder ein bestimmtes Kontingent.

Dokument-, PDF- und Bildwerkzeuge unterstützen Konzept, Drucklayouts und Handbuch. Für präzise Systemzeichnungen werden nachvollziehbare Diagramme verwendet; Handbuchbilder entstehen aus der tatsächlichen Software. Projektspezifische Entwicklungsanweisungen können Anforderungen, Schnittstellen, Testabläufe und Gestaltung dokumentieren. Sie ersetzen keine implementierten Produktfunktionen.

## 20 Quellen und Versionshinweise

Die folgenden Verweise stammen aus dem bisherigen Konzept und bleiben als technische Ausgangsquellen erhalten. Ihr dokumentierter Prüfstand ist historisch; aktuelle Versionen, Tarife und konkreter Zugriff wurden für diese redaktionelle Zusammenführung nicht neu verifiziert. Herstellerdokumentation belegt keine bereits funktionierende Integration unseres Systems.

[1] VirtualDJ Network Control Plugin

HTTP Steuerung und Abfragen; Voraussetzungen VirtualDJ 2023 oder neuer und Pro Lizenz.

[2] Daslight 5 User Manual Abschnitt OSC mapping

OSC Eingang und Ausgang, Adressierung und Zuordnung von Softwarefunktionen. Eine vollständige Szenenabfrage oder garantierte Synchronisationspräzision wird daraus nicht abgeleitet.

[3] Akai APC mini mk2 Communications Protocol Version 1.0

Geräteaufbau und MIDI Kommunikation einschließlich LED Farben und Leuchtverhalten.

[4] GStreamer Clocks and synchronization

Gemeinsame Zeitbasis, Zeitstempel und Umgang mit der Verzögerung von Medienströmen.

[5] Playwright Best Practices

Offizielle Dokumentation zu Browserprüfungen. Playwright wird unter der Apache License 2.0 bereitgestellt.

Playwright Lizenz

[6] GitHub Plans

Kostenloser Tarif mit privaten Repositories; gegenüber Bezahlplänen eingeschränkter Funktionsumfang.

[7] GitHub Actions Billing

Kostenlose Kontingente und mögliche Gebühren bei Überschreitung.

[8] Figma MCP Rate limits and access

Zugriff und Aufrufgrenzen nach Tarif und Sitztyp. Die Quellen [5] bis [8] wurden am 9. Oktober 2026 geprüft.

[9] Microsoft Windows 11 System Requirements

[10] Ubuntu 24 04 LTS Release Notes

[11] GStreamer Download und Windows Pakete

Ergänzende Plattformquellen geprüft am 9. Oktober 2026. Die Hardwarewerte im Konzept sind eigene Planungsannahmen und keine Herstelleranforderungen oder Leistungszusagen.

[12] Canva REST APIs

[13] Canva Download und kostenpflichtige Inhalte

[14] Canva Autofill und Tarifanforderungen

### Ticketshop Referenzen

Die bisher genannten Referenzen sind shownight.jungschuetzen-flueren.de und shownight2026.jungschuetzen-flueren.de. Die Seiten waren bei den bisherigen Abrufversuchen nicht zugänglich. Aus ihrem nicht gelesenen Inhalt werden keine Funktionen oder Gestaltungsvorgaben abgeleitet.

### Änderung gegenüber Version 1 7

Neu zusammengeführt sind modulare Veranstaltungsorganisation, erweiterte Rollenrechte, Bühneneditor, Helfer und Proben, Moderationskarten und Tabletansicht, Ticketshop mit Saalplan und Einlass, Sponsoring, Öffentlichkeit, vereinfachte Finanzen und die zahlreichen Detailregeln der Regie. Übernahmeverfahren zwischen Regieplätzen, reine Quiz-Auswahlbeschränkung und ein fehlendes Moderator-Tablet sind überholt. Komplexe Kosten- und Beschaffungsprozesse wurden auf ausdrücklichen Wunsch entfernt.

## Erhaltene Quellenlinks

- <https://virtualdj.com/wiki/NetworkControlPlugin.html>
- <https://eu-litterature.n-g.co/Release/daslight_5_manual_en.pdf>
- <https://cdn.inmusicbrands.com/akai/attachments/APC%20mini%20mk2%20-%20Communication%20Protocol%20-%20v1.0.pdf>
- <https://gstreamer.freedesktop.org/documentation/application-development/advanced/clocks.html>
- <https://playwright.dev/docs/best-practices>
- <https://github.com/microsoft/playwright/blob/main/LICENSE>
- <https://docs.github.com/en/get-started/learning-about-github/githubs-plans>
- <https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions>
- <https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/>
- <https://support.microsoft.com/en-us/windows/experience/compatibility/windows-11-system-requirements>
- <https://documentation.ubuntu.com/release-notes/24.04/>
- <https://gstreamer.freedesktop.org/download/>
- <https://www.canva.dev/docs/apps/rest-apis/>
- <https://www.canva.com/help/download-or-purchase/>
- <https://www.canva.dev/docs/apps/rest-apis/autofill-guide/>
- <https://shownight.jungschuetzen-flueren.de/?woo-share=DkEKu2xn3JrZjSI6jgjuCxjzP7fhBjvP>
- <https://shownight2026.jungschuetzen-flueren.de/>


## Verbindlicher Bedienablauf: Veranstaltung anlegen (D004)
Bestätigt am 9. Oktober 2026: 1A, 2A, 3A, 4A, 5A, 6A, 7C, 8A, 9A, 10A.

1. Zum Anlegen ist nur der Name Pflicht. Datum und Ort können später ergänzt werden; fehlende funktionsabhängige Angaben werden vor deren Verwendung geprüft.
2. Module über Vorlagen ShowNight, Spieleabend oder Eigene Veranstaltung auswählen und danach frei anpassen.
3. Nach dem Anlegen die Veranstaltungsübersicht mit Aufgaben und Einrichtungsstatus öffnen.
4. Die Übersicht ist persönlich einstellbar; Aufgaben, Termine und Probleme sind der Startinhalt. Rechte gelten auch für angepasste Ansichten.
5. Ein deaktiviertes Modul behält seine Inhalte und wird ausgeblendet. Vorher Abhängigkeiten anzeigen; konkrete Behandlung laufender abhängiger Funktionen ist vor deren Implementierung zu klären. Ausblenden ist keine Rechteänderung.
6. Beim Kopieren Inhalte auswählen; Verkäufe, Zahlungen und Livezustände zurücksetzen. Betriebsdaten der Quelle bleiben unverändert.
7. Bestehende Teams auswählen oder direkt neue Teams anlegen; Rechte dabei sichtbar. Dies ersetzt nicht die bestehenden Berechtigungen zum Anlegen von Benutzerkonten.
8. Fehlende Angaben im betroffenen Bereich und zusätzlich in einer zentralen Prüfliste zeigen.
9. Module über eine feste Seitenleiste direkt erreichen.
10. Veranstaltungswechsel dauerhaft erreichbar halten; offene Bearbeitungen berücksichtigen und die Liveveranstaltung eindeutig kennzeichnen. Ein Navigationswechsel allein löst keine Ausgabe oder Aktivierung aus.

Details zu Vorlageninhalten, persönlicher Anpassung und Modulabhängigkeiten bleiben konkrete Implementierungs-/Planungsaufgaben. Diese Bedienregeln sind bestätigt, keine bereits implementierten Funktionen.


## Verbindlicher Bedienablauf: Show anlegen und vorbereiten (D005)
Bestätigt am 9. Oktober 2026: 1A bis 10A.

1. Beim Anlegen einer Show ist nur der Name Pflicht.
2. Danach öffnet die Show-Arbeitsfläche mit Ablauf und direkt erreichbaren Inhalten.
3. Die Arbeitsfläche zeigt den Ablauf links, den ausgewählten Inhalt mittig und Eigenschaften rechts.
4. Einsätze können direkt zwischen bestehenden Einsätzen oder am Ende hinzugefügt werden.
5. Beim Hinzufügen stehen ein leerer Einsatz oder Vorlagen zur Auswahl, etwa Video, Szene, Präsentation oder Aktionskombination.
6. Abschnitte erscheinen als aufklappbare Gruppen im gemeinsamen Ablauf.
7. Jeder Einsatz erhält ein eigenes Feld „Einsatz bei …“ zur Beschreibung des Auslösemoments, beispielsweise eines gesprochenen Satzes. Das Feld ist ein Regiehinweis und keine automatische Spracherkennung.
8. Fehlende Inhalte können als Platzhalter mit Beschreibung und zuständiger Person geführt werden.
9. Die Reihenfolge kann durch Ziehen oder zusätzliche Verschieben-Schaltflächen verändert werden.
10. Eine Prüfübersicht zeigt Medien, Einsatzhinweise und offene Aufgaben. Das Team meldet selbst „vorbereitet“; keine zusätzliche Inhaltsfreigabe durch die Leitung. Bestehende getrennte Bereitschaftsmeldungen von Team, Bühnenbau und Technik bleiben erhalten.

Shows bleiben unabhängig von Veranstaltungen vorbereitbar. Zugeordnete Teams dürfen die ganze Show bearbeiten. Änderungen an live verwendeten Abläufen bleiben an die bestehenden Versions-/Aktivierungsregeln gebunden; diese Bedienentscheidungen aktivieren keine Änderungen automatisch.


## Verbindliche Bedienung: Szeneneditor (D006)
Bestätigt am 9. Oktober 2026: 1A bis 10A.

1. Der Szeneneditor öffnet direkt aus der Show-Arbeitsfläche. Bereiche können für mehr Bearbeitungsfläche ausgeblendet werden.
2. Neue Szenen beginnen wahlweise leer oder aus einer Vorlage.
3. Inhalte lassen sich über eine sichtbare Werkzeugleiste und durch Ziehen aus der Medienbibliothek hinzufügen.
4. Die Eigenschaftenleiste zeigt die zum ausgewählten Element passenden Einstellungen.
5. Häufige Einstellungen sind direkt sichtbar, weitere aufklappbar. Der umfangreiche Funktionsumfang bleibt verfügbar.
6. Änderungen werden automatisch als Entwurf gespeichert; der Speicherstatus ist sichtbar. Entwurfsspeicherung aktiviert keine Änderung im Livebetrieb.
7. Animationen und Videos lassen sich im Editor mit Abspielen, Pause und Zeitleiste prüfen, ohne Publikumsausgabe. Die bestehende Trennung von Vorhör- und Publikumston gilt.
8. Medien mit abweichendem Seitenverhältnis werden zunächst vollständig sichtbar eingepasst. Bildfüllendes Zuschneiden ist anschließend wählbar.
9. Ebenen erhalten automatische, frei umbenennbare Namen sowie passende Symbole beziehungsweise Miniaturen.
10. Fehlende Medien erscheinen als deutliche Platzhalter im Editor und als sichtbare Fehler in der Prüfübersicht. Für die echte Ausgabe gelten die bestehenden Validierungs- und Ersatzregeln.

Die bestehenden Regeln zu Szenensperren bei gleichzeitiger Bearbeitung, Medienversionen und bewusster Liveaktivierung bleiben verbindlich. Konkrete Speicherintervalle und technische Wiederherstellung bei Verbindungsverlust sind Implementierungsdetails, die vor Umsetzung dokumentiert und geprüft werden müssen.


## Verbindliche Bedienung: Live-Regie (D007)
Bestätigt am 9. Oktober 2026: 1A bis 10A.

1. Das Standardlayout zeigt Publikumsausgabe, Vorschau, Ablauf und Aktionsbuttons gleichzeitig. Frei verteilbare Ansichten und persönliche Layouts bleiben möglich.
2. Anklicken eines Einsatzes wählt diesen zur Vorschau aus; die Auslösung erfolgt separat. Bloßes Anklicken verändert weder Publikumsausgabe noch den GO-Zielpunkt.
3. GO wirkt auf den deutlich markierten nächsten Einsatz. Ein anderer Einsatz muss separat und bewusst als Ausführungsziel vorbereitet werden. Das bestehende serverseitige Ordnen und Absichern konkurrierender Befehle gilt.
4. Direkte Ausgabe ohne vorherige Vorschau erfolgt über einen eigenen klar erkennbaren Direkt-Button oder entsprechend belegten Controller-Befehl.
5. Für spontane Übernahme ist eine sichtbare Übergangsauswahl mit Dauer verfügbar. Einsatzvorgaben können für die einzelne Übernahme überschrieben werden.
6. Während eines Übergangs wird der Fortschritt angezeigt. Weitere Übernahmen sind bis zum Ende gesperrt; Unterbrechungsaktionen bleiben erreichbar. Eine gesperrte Betätigung wird nicht automatisch zur späteren Ausführung vorgemerkt.
7. Zusätzliche Regieansichten lassen sich direkt über „Ansicht öffnen“ öffnen und auf den gewünschten Monitor verschieben.
8. Ausgabefehler bleiben am betroffenen Ausgang und in der zentralen Statusanzeige sichtbar, solange sie bestehen.
9. Eingriffe der anderen Regie erscheinen kurz mit Benutzer, Aktion und Zeitpunkt; Details bleiben im Verlauf.
10. Controller-GO ist nach einer Betätigung erst nach Loslassen erneut auslösbar. Doppelte Übertragungen derselben Betätigung werden ignoriert. Dies ergänzt die serverseitige Absicherung und ersetzt sie nicht.

Die Sperre betrifft weitere Bildübernahmen während des Übergangs, nicht pauschal unabhängige Musik-, Licht-, Timer- oder Unterbrechungsaktionen. Zwei berechtigte Regien bleiben jederzeit gleichberechtigt. Technische Rückmeldungen und tatsächliche Ausgabe müssen geprüft werden; Simulation gilt nicht als reale Bestätigung.


## Verbindliche Daten- und Versionsregeln (D008)
Bestätigt am 9. Oktober 2026: 1A bis 10A.

1. Eine unabhängig vorbereitete Show wird als eigene Veranstaltungskopie aufgenommen. Spätere Änderungen der Vorlage werden bewusst übernommen, nicht automatisch.
2. Änderungen gemeinsam verwendeter Szenenvorlagen werden angezeigt; Übernahme ist je Verwendung bewusst auswählbar.
3. Verwendete Medien können nicht gelöscht werden. Das System zeigt die betroffenen Verwendungen.
4. Shows und Szenen werden zunächst in einen wiederherstellbaren Papierkorb verschoben. Eine Papierkorbaktion hebt Verwendungs-/Live-Schutzregeln nicht auf. Aufbewahrungsdauer und endgültige Löschung bleiben zu konkretisieren.
5. Wenn zwei Personen dasselbe gemeinsam bearbeitbare Textfeld ändern, wird ein Konflikt angezeigt und beide Fassungen bleiben zur Auswahl erhalten. Die bestehende exklusive Szenenbearbeitung bleibt unverändert.
6. Bei Verbindungsverlust werden ungespeicherte Änderungen lokal als Wiederherstellungsentwurf gehalten und später abgeglichen. Ein lokaler Entwurf ist keine bestätigte Serverspeicherung. Er ersetzt keine Offline-Livefreigabe und umgeht weder Rechteprüfung noch Szenensperren.
7. Die Änderungshistorie besteht aus automatischem Verlauf und benennbaren Ständen, beispielsweise „Generalprobe“.
8. Ein älterer Stand wird bei Wiederherstellung als neue aktuelle Fassung übernommen. Der bisherige Verlauf bleibt erhalten; eine Wiederherstellung aktiviert nicht automatisch den Livebestand.
9. Beim Vergleich werden geänderte Inhalte hervorgehoben; für Szenen gibt es zusätzlich eine Bildvorschau.
10. Inhaltsänderungen während einer laufenden Veranstaltung werden als Entwurf gespeichert. Übernahme in den Livebestand erfolgt ausschließlich durch ausdrückliche berechtigte Aktion.

Die Regeln präzisieren vorhandene Versionierung, bewusste Aktivierung und Konfliktbehandlung. Technische Datenschemata und Protokolle sind daraus abzuleiten. Konkrete Speicherintervalle, Papierkorbfristen und der sichere Ablauf einer Aktivierung während laufender Ausgabe sind noch zu spezifizieren; vorhandene Liveinhalte werden nicht durch bloßes Speichern ausgetauscht.


## Verbindliche Regeln: Aktivierung vorbereiteter Datenstände (D009)
Bestätigt am 9. Oktober 2026: 1A bis 10A.

1. Vor einer Liveaktivierung zeigt eine Übersicht Änderungen und betroffene Shows, Medien und Einsätze.
2. Eine Aktivierung ist wahlweise für eine einzelne Show oder für den gesamten Veranstaltungsstand möglich. Erforderliche Abhängigkeiten müssen in beiden Fällen geprüft sein.
3. Änderungen an der gerade ausgegebenen Szene ersetzen die laufende Ausgabe nicht. Die neue Fassung wird erst bei bewusster erneuter Übernahme verwendet.
4. Wenn sich der Inhalt eines bereits vorbereiteten Einsatzes ändert, wird dessen Vorschau als veraltet markiert. Erneutes Vorbereiten ist erforderlich, bevor dieser geänderte Einsatz ausgelöst wird.
5. Ein neuer Stand darf erst aktiviert werden, wenn alle für den gewählten Aktivierungsumfang benötigten Dateien vollständig lokal vorhanden und geprüft sind.
6. Neu hinzugefügte Einsätze hinter der aktuellen Ablaufposition werden in den kommenden Ablauf aufgenommen, ohne sofort auszulösen.
7. Wird der markierte nächste Einsatz gelöscht oder verschoben, bleibt GO bis zur bewussten Bestätigung des neuen nächsten Einsatzes gesperrt.
8. Beide gleichberechtigten Regien erhalten denselben aktiven Stand und einen sichtbaren Änderungshinweis.
9. Scheitert die Aktivierung, bleibt der bisherige aktive Stand erhalten. Fehler werden angezeigt; keine teilweise aktivierte Mischung erfolgreicher und fehlgeschlagener Änderungen.
10. Eine bewusste Rückkehraktion ermöglicht den vorherigen aktiven Stand. Die betroffene Ablaufposition wird geprüft; Musik wird nicht automatisch neu gestartet.

Datenaktivierung und GO sind getrennte Handlungen. Aktivierung ändert die verbindliche vorbereitete Fassung, GO löst einen Einsatz aus. Eine Aktivierung oder Rückkehr darf vergangene Einmalaktionen nicht automatisch nachholen. Unabhängige Unterbrechungsaktionen bleiben erreichbar. Die atomare Aktivierung mit weiterlaufender alter Szene ist technisch im Zustandsmodell und anhand konkurrierender Regieaktionen nachzuweisen.


## Verbindliche Zuordnungen: Szenen, Einsätze und Durchläufe (D010)
Bestätigt am 9. Oktober 2026: 1A bis 10A.

1. Dieselbe Szene darf in mehreren Einsätzen verwendet werden; Einstellungen können je Einsatz verschieden sein.
2. Übergang und Verhalten nach Videoende haben Vorgaben in der Szene und können je Einsatz überschrieben werden.
3. Ein Einsatz darf ausschließlich Licht, Ton oder Timer steuern. Ohne Bildaktion bleibt die bestehende Bildausgabe erhalten.
4. Mehrere Aktionen werden direkt am Einsatz als geordnete Liste mit Verzögerungen bearbeitet.
5. Gespeicherte Aktionskombinationen werden als versionierte Bausteine verwendet. Spätere Änderungen werden bewusst übernommen.
6. Dieselbe Veranstaltungsshow kann mehrfach aufgeführt werden. Durchläufe haben getrennte Livezustände.
7. Proben und echte Aufführungen sind eigenständige gekennzeichnete Durchläufe mit getrennten Ergebnissen und Historie.
8. Beim Ändern einer mehrfach verwendeten Szene werden alle Verwendungen angezeigt. Gemeinsame Änderung oder eigene Variante sind wählbar.
9. Beim Duplizieren eines Einsatzes werden Einstellungen kopiert, zunächst dieselbe Szene verwendet; eine eigene Variante bleibt möglich.
10. Musik- und Lichtwünsche können vor Festlegung der Technik als benannte Anforderungen hinterlegt und später konkreten Technikaktionen zugeordnet werden.

Die Showaufnahme als Veranstaltungskopie (D008) und die Mehrfachaufführung dieser Kopie als getrennte Durchläufe sind unterschiedliche Beziehungen. Szeneneinstellungen je Einsatz ersetzen keine gemeinsame Änderung der Szene. Vorlagen-/Bausteinänderungen und Szenenänderungen bleiben an bewusste Versionsübernahme und Liveaktivierung gebunden.


## Verbindliche Regeln: persönliche Vorschau und gemeinsamer Ablauf (D011)
Bestätigt am 9. Oktober 2026: 1A bis 10A.

1. Jede Regie kann unabhängig Inhalte in einer eigenen Vorschau prüfen, ohne die Vorschau der anderen Regie zu ändern.
2. Der markierte nächste GO-Einsatz ist gemeinsam. Beide Regien sehen und bedienen dasselbe Ausführungsziel.
3. Eine persönliche Vorschau wird durch die ausdrückliche Aktion „Als nächsten Einsatz vorbereiten“ zum gemeinsamen GO-Ziel. Bloße Vorschauauswahl ändert dieses Ziel nicht.
4. Bei konkurrierender Vorbereitung unterschiedlicher GO-Ziele gilt die erste gültige Änderung. Die andere erhält einen Konflikthinweis und kann bewusst neu vorbereiten; keine stille Überschreibung.
5. Eine Änderung des gemeinsamen GO-Ziels erscheint sofort bei der anderen Regie, ergänzt um einen kurzen Benutzerhinweis.
6. Ein Direktaufruf eines geplanten Einsatzes aktualisiert die Ablaufposition. Eine spontane Einblendung lässt sie bestehen. Diese Aufrufarten müssen eindeutig unterscheidbar sein.
7. Nach GO der anderen Regie bleibt die persönliche Vorschau bestehen. Publikumsausgabe und gemeinsame Ablaufposition aktualisieren sich.
8. Mehrere Regiefenster auf demselben Notebook teilen einen Vorhörkanal. Ein neuer Vorhöraufruf ersetzt den bisherigen. Das verfügbare tatsächliche Vorhörgerät bleibt konfigurierbar und ist technisch zu prüfen.
9. Vorbereiten des GO-Ziels startet keinen Publikumston. Ton beginnt erst durch die vorgesehene Auslösung.
10. Die Oberfläche verwendet klare Beschriftungen „Meine Vorschau“ und „Nächster Einsatz – gemeinsam“. Die Unterscheidung erfolgt nicht ausschließlich durch Farben.

Diese Regeln ändern nicht die Gleichberechtigung der Regien. Konflikterkennung ist eine zustandsbezogene Absicherung, keine Bedienhoheit. Serverzustand und lokaler Vorschau-/Vorhörzustand sind technisch zu trennen. Keine nachträgliche Ausführung abgewiesener Befehle.


## Verbindliche Durchlaufregeln: Start, Wechsel und Abschluss (D012)
Bestätigt am 9. Oktober 2026: 1A bis 10A.

1. Eine Probe oder Aufführung beginnt durch Auswahl beziehungsweise Neuanlage eines Durchlaufs, Technikprüfung und bewussten Start.
2. Der Durchlaufstart löst den ersten Einsatz nicht aus. Er wird vorbereitet und separat mit GO ausgelöst.
3. Während einer laufenden Aufführung ist eine getrennte simulierte Probe derselben Show möglich, ohne Zugriff auf die verwendeten Liveausgänge.
4. Der nächste Showdurchlauf kann vorbereitet werden; der Wechsel erfolgt anschließend ausdrücklich. Auswahl allein wechselt keinen aktiven Durchlauf.
5. Beim Wechsel zeigt eine Übersicht noch laufende Aktionen der bisherigen Show. Vorbereitete Wechselregeln legen fest, was gestoppt oder weitergeführt wird.
6. „Durchlauf beenden“ schließt Ergebnisse und Verlauf ab. Bild-/Ton-/Licht-/Timer-Ausgabe wird durch eine ausdrücklich festgelegte Abschlussaktion gesteuert, nicht durch einen undokumentierten pauschalen Stopp.
7. Abgeschlossene Durchläufe erlauben ergänzende Notizen und begründete Korrekturen. Frühere Ausführungen bleiben unverändert protokolliert; Ergänzungen und Korrekturen werden nachvollziehbar angehängt.
8. Eine Probenwiederholung erstellt einen neuen Durchlauf mit denselben vorbereiteten Inhalten und zurückgesetzten Probenzuständen. Der bisherige Verlauf bleibt erhalten.
9. Als Startposition sind ganze Show, Abschnitt oder einzelner Einsatz wählbar. Der dafür erforderliche Ausgangszustand wird vorher geprüft; vergangene Einmalaktionen werden nicht automatisch nachgeholt.
10. Nach dem letzten Einsatz erscheint deutlich „Ablaufende“. Der Durchlauf endet erst ausdrücklich oder durch eine konfigurierte Abschlussaktion.

Die reguläre Pause beginnt weiterhin mit ihrem eigenen GO. Ein Simulationsdurchlauf kann keine Liveausgänge oder externen Programme ansteuern. „Durchlauf abgeschlossen“ und „Ausgabe gestoppt“ sind unterschiedliche Zustände; weiterlaufende Inhalte müssen weiterhin sichtbar und bedienbar bleiben. Rechte für Ergänzungen und Korrekturen gelten auch nach Abschluss.
