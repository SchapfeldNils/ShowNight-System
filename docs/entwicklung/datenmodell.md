# Fachliches Datenmodell – erster Showablauf

Stand: 9. Oktober 2026. Fachliche Ableitung aus Gesamtkonzept und D004–D010. Keine fertige Datenbankspezifikation; technische Feldtypen, Migrationen und API-Schemas sind durch Codex zu erarbeiten und zu prüfen. Dieses Dokument deckt den ersten Showablauf ab, noch nicht das gesamte Ticket-/Organisations-/Spielmodell.

## Objekte und Beziehungen

| Objekt | Bedeutung | Beziehungen und Regeln |
| --- | --- | --- |
| Veranstaltung | Organisatorischer Rahmen | Module, Teams, Veranstaltungsshows und aktivierte Datenstände |
| Unabhängige Show | Außerhalb einer Veranstaltung vorbereitbar | Wird als Veranstaltungskopie aufgenommen; Updates bewusst übernehmen |
| Veranstaltungsshow | Eigener vorbereiteter Stand einer Show | Abschnitte, Einsätze, Szenen und mehrere getrennte Durchläufe |
| Abschnitt | Optionale Gruppierung im Ablauf | Aufklappbare Gruppe von Einsätzen |
| Einsatz | Ein manuell oder ausdrücklich automatisch ausgelöster Schritt | Reihenfolge, Auslösehinweis, optional Bildaktion, geordnete Aktionen und eigene Einstellungen |
| Szene | Zusammengesetzter Bildinhalt | Ebenen und Medienelemente; in mehreren Einsätzen nutzbar |
| Szenenverwendung | Beziehung Einsatz–Szene | Übergang, Videoendverhalten und andere erlaubte Einstellungen können Vorgaben überschreiben |
| Medienobjekt | Datei mit Original und bearbeiteten Fassungen | Verwendungen nachverfolgen; verwendete Medien vor Löschung schützen |
| Aktionsbaustein | Wiederverwendbare Kombination | Versionierte Fassung; bewusste Übernahme neuer Versionen |
| Aktion | Bild-, Ton-, Licht-, Timer- oder Ablaufwirkung | Geordnet, optional verzögert; Wiederbetätigung/Abbruch gemäß Fachregeln |
| Technikanforderung | Vorbereiteter Musik-/Lichtwunsch | Später konkreter Technikaktion zuordenbar, ohne eine bereits funktionierende Anbindung zu behaupten |
| Durchlauf | Probe oder Aufführung | Gehört zur Veranstaltungsshow, hat eigene Livezustände und Ergebnisse |
| Datenstand | Vorbereitete oder aktivierte Fassung | Prüfen, bewusst aktivieren, aktive Fassung nachvollziehen und bewusst zurückkehren |
| Livezustand | Laufender Betrieb eines Durchlaufs | Ablaufposition, markierter GO-Einsatz, laufende Ausgabe und unabhängige Zustände für Ton/Licht/Timer |

## Zentrale Invarianten
- Ein Einsatz braucht keine Szene. Ohne Bildaktion bleibt die laufende Bildausgabe bestehen.
- Vorschauauswahl ist kein GO und keine Datenaktivierung.
- GO verwendet den explizit markierten nächsten Einsatz; konkurrierende Befehle werden serverseitig geordnet und abgesichert.
- Laufende Ausgabe darf weiter auf einer älteren Szene beruhen, während eine neue vorbereitete Fassung aktiviert wurde.
- Neue Datenstände werden für den gewählten Umfang vollständig geprüft und atomar aktiviert. Keine Teilmischung bei Fehler.
- Showvorlage, Veranstaltungskopie und Durchlauf haben unterschiedliche Aufgaben; Probenpunkte und Livezustände dürfen nicht versehentlich in eine echte Aufführung übernommen werden.
- Wiederherstellung erstellt eine neue aktuelle Fassung und erhält den Verlauf.
- Rechte werden nicht durch Kopieren, Papierkorb, lokale Entwürfe oder ausgeblendete Module umgangen.
- Unbekannter technischer Zustand bleibt unbekannt; gesendet bedeutet nicht ausgeführt.

## Noch zu konkretisieren
- Verhalten der persönlichen Vorschau bei mehreren Fenstern desselben Benutzers noch konkretisieren. Persönliche Vorschau je Regie und gemeinsames GO-Ziel sind durch D011 bestätigt.
- Technische Speicherstruktur, Objektkennungen, Versionsfelder, Befehls- und Ereignisschemas.
- Modulübergreifende Beziehungen für Ticketing, Finanzen, Organisation und Spiele anhand der bestehenden Anforderungen.
- Genaue Regeln zu lokalen Entwürfen, Papierkorbfristen und Wiederherstellungskonflikten.
- Zustandsübergänge und Nachweise für laufende Szene während Aktivierung.

Codex darf technische Entwürfe nachvollziehbar ausarbeiten. Neue grundlegende Produktregeln bleiben abstimmungspflichtig.


## Zustandsaufteilung nach D011
- Gemeinsamer serverseitiger Zustand: aktive Fassung, Ablaufposition, markierter nächster GO-Einsatz, Publikumsausgabe und ausgeführte Aktionen.
- Persönlicher Regiezustand: ausgewählter Vorschauinhalt und dessen Prüfwiedergabe; fremdes GO überschreibt diesen nicht.
- Gerätebezogener Vorhörzustand: ein Kanal pro Notebook, neuer Vorhöraufruf ersetzt bisherigen; keine automatische Ausgabe auf Publikumskanal bei Fehler.
- Gemeinsames Vorbereiten ist ein ausdrücklicher Befehl mit Konflikterkennung. Erste gültige konkurrierende Änderung gilt, veraltete Gegenänderung wird abgewiesen und nicht automatisch wiederholt.
- Technische Zuordnung persönlicher Zustände zu Fenstern/Sitzungen und Geräteidentität muss im Schnittstellenentwurf konkretisiert werden.
