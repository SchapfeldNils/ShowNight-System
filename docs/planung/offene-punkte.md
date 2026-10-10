# Offene Punkte

S3-03 (10. Oktober 2026) ergänzt nach D017 die vorbereitbare LAN-Neueinrichtung mit gezielter IPv4-/HTTPS-Konfiguration und Diagnose. Reale Mehrgeräte-/Firewall-/Clientvertrauens-/Internettrennungsprüfung, bestehende Profilumstellung, Zertifikatserneuerung und mobile Clientinstallation bleiben offen. O01–O14 und Gesamtfreigabe unverändert. Nachfolgende S3-02-Absätze beschreiben den früheren Loopback-Stand. [Vertrag und Grenzen](../entwicklung/s3-lan.md).
Stand: 10. Oktober 2026. Grundlage: Gesamtkonzept 2.0, Kapitel 18.

Der Funktionsumfang ist weitgehend beschrieben. Die folgenden Punkte sind noch nicht entschieden oder praktisch nachgewiesen. Eine Anforderung ist kein bestandener Test.

S3-02 (10. Oktober 2026) ergänzt nach D017 den lokalen Loopback-HTTPS-Server, vorbereitete Offlinekonten/MFA und lokale Konto-/Sperr-/Recoveryverfahren mit synthetischen Softwareprüfungen. Der nachfolgende S3-01-Satz beschreibt den früheren isolierten Paketstand. Offen bleiben Mehrgeräte-LAN, realer Betrieb nach Internettrennung, vollständiger Veranstaltungsumfang, Onlineabgleich, Renderer, Aktivierung und sämtliche Geräteausgaben. [Aktueller Stand](../entwicklung/s3-lokalserver.md).

D017 (10. Oktober 2026): Betreiber erlaubt weitere vorbereitbare Softwarearbeiten und spätere Funktionstests. S3-01 ergänzt Inhaltspaketdownload und lokale SQLite-Prüfung; lokaler Mehrbenutzerserver, Offlinekonten/MFA, vollständiges Veranstaltungs-/Rendererpaket, Aktivierung und echte Ausgaben bleiben offen. [Stand und Grenzen](../entwicklung/s3-paketablage.md). Bestehende Geräte-/Betriebsfragen werden dadurch nicht als geklärt markiert.

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

## Stand des Zieldeployments
VM/Architektur, autorisierter Zugang, bestehende Dienste, öffentliche Systemdomain/TLS, S1-Vorbereitung und S2-Agentgrundlage tatsächlich geprüft und bereitgestellt. DJ-Rechner bestätigt, echte WSS-Diagnose und laufende VirtualDJ-Leseberichte einschließlich Authfehler/Erholung bei Agent 0.2.1 bestanden. [S1-Zielnachweise](../entwicklung/netcup-abnahme.md), [S2-Update](../entwicklung/s2-netcup-update.md), [aktuelle Lesediagnose](../entwicklung/s2-virtualdj-update.md). Regelmäßiges unabhängiges Backup-/Schlüsselziel, dauerhafter normaler Windows-DNS-Zugriff, Mailzustellung und reale Geräte-/Ton-/Synchronitätsabnahme bleiben offen.
Technische Hardware-/Synchronitätsnachweise O01–O14 bleiben bestehen. Weitere Produktfragen gezielt anhand der Implementierung klären.


## Konkretisierung D014
Systemdomain festgelegt: eventmanagement.jungschuetzen-flueren.de. Öffentliche DNS-Ziele/TLS und VM-Zugang bestätigt. SMTP privat eingerichtet, TLS/Authentifizierung lokal und im VM-Worker erfolgreich; keine Nachricht versendet, Absenderfreigabe/Zustellung offen. Lokaler Windows-Resolver liefert noch vorheriges Webhostingziel. Siehe [Domain/E-Mail](../entwicklung/domain-email.md) und aktuelle Zielnachweise oben.
