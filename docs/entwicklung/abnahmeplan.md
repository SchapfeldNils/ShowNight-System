# Abnahmeplan – agile Entwicklung ab Netcup

Stand: 9. Oktober 2026. Planung, keine bereits bestandenen Tests.
Die Prüfungen konkretisieren F01–F50/A01–A30 für die ersten Arbeitspakete. Ein Zwischenstand ist keine vollständige Veranstaltungsfreigabe.

## Reihenfolge und Ergebnisführung
S1: Netcup-fähiger Server und Browservorbereitung. S2: Windows-Agentengrundlage. S3: lokaler Server und eigene Ausgabe. S4: erster Showablauf mit zwei gleichberechtigten Regien.
Technische Tests in lokaler/CI-Umgebung sind von echten Netcup-/Windows-/Hardwareprüfungen zu unterscheiden.
Ergebnis pro Prüfung: Datum, Commit, Umgebung, Software-/Hardwarestand, Schritte, tatsächliches Ergebnis, Beleg, passed/failed/blocked/not_run und offene Grenzen. Eine Simulation erfüllt keinen realen Hardwarefall.
Freigaben pro Paket und offene Nachweise in docs/entwicklung/status.md führen, sobald die Implementierung beginnt.

## S1 – Server für Netcup
| ID | Schritte | Erwartetes Ergebnis | Bezug |
| --- | --- | --- | --- |
| S1-01 | Dokumentierten Entwicklungsstart und Compose-Start aus frischem Checkout ausführen | Build/Start reproduzierbar; benötigte Variablen erklärt; keine Standardgeheimnisse | F26/A17 |
| S1-02 | Leere PostgreSQL-Datenbank migrieren, Testdaten anlegen, App neustarten, Migration erneut ausführen | Daten bleiben; Migrationen versioniert und erneut aufrufbar | F01/F25 |
| S1-03 | Einmaligen Admin-Bootstrap und Login mit MFA testen; falsche/fehlende Codes verwenden | Kein administrativer Zugriff ohne erforderlichen zweiten Faktor; kein öffentliches Bootstrap nach Abschluss | F30/A18 |
| S1-04 | Zwei Events, zugeordnete Teams, Leitung und getrennte LIVE-Rechte anlegen; fremde IDs direkt aufrufen | Leitung kann eigene Eventinhalte bearbeiten, keine fremde Eventleckage, Team bearbeitet zugeordnete ganze Show | F05/F30/A18 |
| S1-05 | Veranstaltung nur mit Namen anlegen, Vorlagen auswählen, Team zuordnen | Übersicht öffnet; Datum/Ort später ergänzbar; abhängige fehlende Angaben angezeigt | F01/F29/D004 |
| S1-06 | Unabhängige Show anlegen und als Eventkopie übernehmen; Quelle ändern | Kopie bleibt unverändert bis bewusster Übernahme; keine Live-/Ergebnisdaten mitkopiert | F02/F11/D008 |
| S1-07 | Synthetisches Bild/Video hochladen; falsche Dateitypen, Pfadversuche und konfigurierte Größenlimits testen | Bytes sicher gespeichert, Zustand processing/ready/failed korrekt; unzulässige Datei nicht livebereit | F12/F28/A04 |
| S1-08 | Gleiches Textfeld mit gleicher Ausgangsrevision zweimal ändern | Erstes gültiges Schreiben gewinnt; zweite Fassung als Konflikt sichtbar, keine stille Überschreibung | F06/A05/D008 |
| S1-09 | Paket erstellen, Datei entfernen oder Prüfsumme verändern | Ungültiges Paket nicht aktivierbar; Manifest benennt Fehler | F25/A04 |
| S1-10 | Medien/DB sichern; in getrennte Testinstanz wiederherstellen | Objekte, Rechte, Dateireferenzen und Prüfsummen stimmen | F50/A17 |
| S1-11 | Datenbank stoppen, Health aufrufen, Logs prüfen | Readiness nicht bereit; keine Secrets/Passwörter/Ticketgeheimnisse in Logs | F26 |
| S1-12 | Auf tatsächlicher Netcup-Test-VM mit Domain/HTTPS bereitstellen | Zugriff und Persistenz nach Service-/VM-Neustart nachgewiesen; öffentliche DB-Ports geschlossen | F26/A17 |

S1-12 bleibt blocked, falls VM-/Domain-/Zugangsdaten fehlen. S1-01 bis S1-11 sind dennoch auszuarbeiten und lokal/CI zu prüfen. Keine Behauptung einer erfolgten Netcup-Installation aus einem Containerstart.

## S2 – Windows-Agenten
| ID | Schritte | Erwartetes Ergebnis | Bezug |
| --- | --- | --- | --- |
| S2-01 | Installierbaren/prototypisch startbaren Agenten auf Windows starten | Profil/Server konfigurierbar, kein Autoplay oder Shellremotezugriff | F26/A17 |
| S2-02 | Gerät paaren; Code erneut nutzen; Gerät widerrufen | Berechtigte Erstregistrierung; abgelaufener/verwendeter Code unwirksam; widerrufener Agent ohne Steuerzugriff | F26/F30 |
| S2-03 | dj/light/main-Profile sowie reale/simulierte Fähigkeiten melden | Browser zeigt Quelle und Grenzen korrekt; Simulation eindeutig | F23/F26 |
| S2-04 | Denselben dispatchId zweimal senden | Auftrag nur einmal angenommen; Wiederholung liefert Receipt; gleicher ID mit anderer Nutzlast abgelehnt | F16/A03 |
| S2-05 | Verbindung bei offenem Auftrag trennen, Agent neu verbinden | Livenessverlust sichtbar; alte Effekte nicht nachgespielt; unklarer Ausgang als unknown | F28/A03 |
| S2-06 | Reale VDJ-/Daslight-Anbindung am verfügbaren Notebook prüfen | Dokumentierte unterstützte Befehle/Rückmeldungen; fehlende Fähigkeit als unsupported; keine Syncgarantie aus Empfang | F14/F28/A08 |
| S2-07 | FLX4-Vorhören neben Virtual DJ und mehreren Browserfenstern prüfen | Ein Vorhörkanal pro Notebook; kein Übersprechen auf PA; Fehler führt nicht zum automatischen PA-Wechsel | F18/A02 |
| S2-08 | Device-/Benutzerrechte, falsche Autorität und falsche Protokollversion testen | Nicht berechtigte Aufträge abgewiesen, keine stille Ausführung | F30/A18 |

Nicht vorhandene Hardware blockiert nur ihren realen Nachweis, nicht die Protokollimplementierung. Keine fiktiven API-Aufrufe als fertige Integration deklarieren.

## S3/S4 – lokaler Server und erster Showablauf
| ID | Schritte | Erwartetes Ergebnis | Bezug |
| --- | --- | --- | --- |
| L-01 | Vorbereitung vollständig lokal bereitstellen; Internet trennen, lokal anmelden | Eigener lokaler Server/SQLite und vorbereitete Rechte funktionieren; Cloud nicht Livevoraussetzung | F25/F26/A01 |
| L-02 | Zwei Regien verschiedene Szenen vorsehen lassen, gemeinsam nächsten Cue vorbereiten | Persönliche Vorschauen unabhängig; gemeinsames Ziel gleich; kein Publikumston bei Vorbereitung | F16/F17/A02/A19/D011 |
| L-03 | Zwei unterschiedliche cue.prepare mit gleicher erwarteter Revision senden | Erste gültige Änderung gilt, Gegenänderung erhält Konflikt und wird nicht nachgeholt | F16/A03/D011 |
| L-04 | Zwei GO-Befehle auf dasselbe Ziel gleichzeitig sowie identischen Befehl mehrfach senden | Ein Einsatz, ein logischer Fortschritt; keine doppelte externe Ausführung aus Transportwiederholung | F16/A03 |
| L-05 | GO während einer Überblendung, danach Unterbrechung betätigen | Weitere Übernahme gesperrt ohne Warteschlange; Unterbrechung erreichbar | F14/F16/D007 |
| L-06 | Szene/Video live ändern und Stand aktivieren; neue Szene bewusst aufrufen | Alte laufende Szene bleibt, Vorschau ggf. stale; neuer Aufruf verwendet neue Fassung | F25/A04/D009 |
| L-07 | Aktives GO-Ziel verschieben/löschen und aktivieren | GO braucht bewusste Zielbestätigung | F16/F25/D009 |
| L-08 | Unvollständige Aktivierung bzw. kontrollierten Transaktionsfehler testen | Bisheriger Stand bleibt vollständig; keine Teilmischung | F25/A04 |
| L-09 | Einen reinen Timer-/Lichteinsatz, spontanes Overlay und geplanten Direktcue auslösen | Reiner Aktionseinsatz hält Bild; Overlay hält Position; Direktcue aktualisiert Position | F14/F16/D010/D011 |
| L-10 | Durchlauf starten, am Abschnitt einsteigen, letzten Cue auslösen und abschließen | Kein erster Auto-GO; keine vergangenen Effekte; Ablaufende/Abschluss/Ausgabe getrennt | F24/A11/D012 |
| L-11 | Parallel zur Aufführung eine Simulationsprobe ausführen | Getrennte Ergebnisse; keine reale Gerätewirkung aus Simulation | F24/A11 |
| L-12 | Regiefenster/Agent/Server während Dispatch ausfallen lassen | Renderer/Status nach dokumentiertem Ersatzverhalten; keine blinde Wiederholung unbestätigter Aktionen | F28/A03/A08 |
| L-13 | Reale Full-HD-Leinwand plus Bühnenmonitor und tatsächlichen Programmausgabestream prüfen | HDMI und Timer getrennt; Stream stammt aus gerenderter Ausgabe; Browserpreview kein Hardwarebeweis | F17/F20/F47/A10/A19 |
| L-14 | Kamera/Ton und Musik/Video mit tatsächlichem Routing unter Last messen | Gemessene Grenzen gegen vorher vereinbarte Zielwerte dokumentiert | F27/A15 |

A15-Zielwerte, Kameras, Capture, FLX4-Routing und Hauptrechner bleiben offen. Ohne reale Messung keine Aussage „lippensynchron“, „exakt musiklaufend“ oder „hochperformant“.

## Gesamtscope und spätere Freigabe
A01–A30 bleiben erhalten. S1/S2/L-Prüfungen ersetzen nicht die vollständigen Editor-, Quiz-, Ticket-, Bühnen-, Moderations-, Finanz- und Organisationsprüfungen. Für die komplette Veranstaltungsfreigabe müssen alle vereinbarten Module sowie Installation, Offlinekonten/MFA, Handbuch, Sicherungen und Rückfallwege am realen Aufbau geprüft sein.
Browser-/API-Tests soweit sinnvoll automatisieren; Plattform-/Hardwareprüfungen mit nachvollziehbarem Protokoll. Keine Tests, die ausschließlich dieselbe Implementierung nachbilden, statt Verhalten zu prüfen.
