# Offene Punkte
Stand: 9. Oktober 2026. Grundlage: Gesamtkonzept 2.0, Kapitel 18.

Der Funktionsumfang ist weitgehend beschrieben. Die folgenden Punkte sind noch nicht entschieden oder praktisch nachgewiesen. Eine Anforderung ist kein bestandener Test.

| Kennung | Bereich | Noch zu klären | Nachweis |
| --- | --- | --- | --- |
| O01 | Hauptrechner | Privat organisierte Hardware, Anschlüsse und Leistung | Test mit realer Medienlast |
| O02 | Projektor | Modell, Auflösung, Modus und Verzögerung | Direkter HDMI-Aufbau |
| O03 | Kameras | Modelle, Anzahl, Anschluss und Capture | Reale Kamera mit gemessener Gesamtlatenz |
| O04 | Ton | Mischpultmodell, Routing, Delay-Möglichkeiten | Getrennte Ausgabe und Synchronität |
| O05 | Licht | Notebook-Leistung und genaues Daslight-/Cameo-Interface | Szenensteuerung und Rückmeldungen |
| O06 | Controller | Stream-Deck-Modell, FLX4-Vorhörzugriff, MIDI-Belegung | Gleichzeitiger Betrieb mit Virtual DJ |
| O07 | Bildschirme | Tatsächliche Portzuordnung, mehrere Regiefenster | Leinwand, Bühnenmonitor und Regie gleichzeitig |
| O08 | Synchronisation | Messbare Zielwerte und zulässige Schwankungen | Livekamera/Ton und musikgebundene Videos am Gesamtaufbau |
| O09 | Schnittstellen | Virtual DJ, Daslight, Medienkomponenten und Importtreue | Praktische Prototypen; keine unbelegten Garantien |
| O10 | Onlinebetrieb | VM, Domains, E-Mail und Sicherungsziele | Installation und Zustellung prüfen |
| O11 | Ticketbetrieb | Veranstalter-, Verkaufs-, Datenschutz- und Vertragsangaben | Vor öffentlicher Verkaufsfreigabe vervollständigen |
| O12 | Bedienung | Konkrete Ansichten und Arbeitsabläufe | Bedienbarer Prototyp und Teamtest |
| O13 | Auslieferung | Installer, bebildertes Handbuch und Gesamtabnahme | Reale Tests einschließlich Ausfällen |
| O14 | Mobilgeräte | Moderatorgerät und konkrete Teilnehmer-/Jury-/Einlassgeräte | Browser- und Netztests |

## Aktueller Übergabestand
D004–D012 bestätigen Veranstaltungserstellung, Showvorbereitung, Editor, Live-Regie, Versionen, Aktivierung, Zuordnungen, persönliche Vorschau und Durchläufe.
Die drei technischen Startdokumente und der Codex-Prompt sind vorbereitet:
[Datenmodell](../entwicklung/datenmodell.md), [Schnittstellen](../entwicklung/schnittstellen.md), [Abnahmeplan](../entwicklung/abnahmeplan.md), [Startprompt](../entwicklung/codex-startprompt.md).

D013: zuerst Netcup-Server, dann Windows-Agenten. Code-Schemas/Migrationen und Nachweise werden agil umgesetzt. Keine pauschale weitere Fragenrunde ist Voraussetzung für S1.

## Offen für echtes Zieldeployment
VM-Betriebssystem, Ressourcen/Architektur, Domain/DNS, autorisierter Zugang, vorhandene Dienste/Ports, Mail und externes Sicherungsziel. Keine dieser Angaben ist als bereits vorhanden oder geprüft bestätigt.
Technische Hardware-/Synchronitätsnachweise O01–O14 bleiben bestehen. Weitere Produktfragen gezielt anhand der Implementierung klären.
