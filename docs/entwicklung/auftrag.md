# Entwicklungsauftrag für Codex

Stand: 9. Oktober 2026. Entwicklungsrichtung durch Nils bestätigt; siehe [Antworten](../planung/entwicklungsuebergabe.md).

## Ziel
Implementiere das modulare ShowNight-System gemäß [Gesamtkonzept](../gesamtkonzept.md) und [Anforderungen](../anforderungen.md). Die vollständige erste Veranstaltungsfassung umfasst sämtliche vereinbarten Module, Installation, Dokumentation und reale Abnahme. Zwischenstände dienen Entwicklung und Prüfung und sind keine fertige Veranstaltungsfassung.

## Erster Auftrag
Starte mit Projektgrundlage und einem durchgängig nutzbaren Ablauf:
Veranstaltung anlegen → Show zuordnen → Szene mit Medien gestalten → getrennte Vorschau → manuelles GO → eigene Bildausgabe ohne OBS.

Lege die gemeinsamen Grundlagen für Benutzer, eventbezogene Rechte, Speicherung und serverseitigen Livezustand an. Der erste Ablauf soll zwei gleichberechtigte Regiefenster unterstützen. Technische Prototypen für Windows-Ausgabe, Virtual DJ, Daslight und Vorhören haben früh Vorrang vor breiter Verwaltungsentwicklung.

## Arbeitsrahmen
- Lies AGENTS.md. Liefere Arbeitsbranch und Pull Request je Arbeitspaket.
- Architektur 2.0 ist Ausgangsbasis: React/TypeScript, API in Node.js/TypeScript, Online-PostgreSQL und lokales SQLite sowie separate native Windows-Medienkomponente.
- Bewerte Kompatibilität und Lizenzen vor konkreter Abhängigkeitseinführung. Größeren Umbau begründen und abstimmen.
- Baue Browser-Demo mit synthetischer Veranstaltung und deutlich markierten Geräteadaptern.
- Erarbeite Windows-Testversion für reale Ausgabe und Geräteprüfungen. Ohne vorhandene Windows-/Hardwareumgebung verbleiben diese Nachweise ausdrücklich offen.
- Ordne benötigte Entitäten und API-Verträge für den ersten Ablauf schriftlich und als Code-Schemas, bevor mehrere Komponenten darauf aufbauen. Entwürfe kennzeichnen; noch offene Produktregeln nicht erfinden.
- Originale ShowNight-Grafiken/Farben sind Designgrundlage. Verfügbarkeit prüfen; fehlende Quellen festhalten.

## Fertigkriterien für den ersten Ablauf
1. Veranstaltung, Show, Szene und Medien bleiben nach Neustart erhalten.
2. Vorschau verändert die Publikumsanzeige nicht; GO übernimmt bewusst die gewählte Szene.
3. Zwei berechtigte Regiefenster sehen denselben serverseitigen Zustand; konkurrierendes GO führt nicht zu unbeabsichtigtem doppeltem Fortschritt.
4. Simulierte und echte Ausgaben sind erkennbar; simulierte Rückmeldung wird nicht als Hardwarebeweis geführt.
5. Start-/Build-Anleitung und passende Prüfungen sind vorhanden, tatsächliche Ergebnisse und Einschränkungen dokumentiert.
6. Browser-Demo funktioniert; Windows-Ausgabe ist separat nachgewiesen oder als offener Nachweis ausgewiesen. Die vollständige Arbeitspaketabnahme erfolgt erst nach erforderlichem realem Nachweis.

## Noch kein vollständiger technischer Vertrag
Das Gesamt-Datenmodell, endgültige APIs, genaue Synchronitätsgrenzen und Teile der Bedienabläufe sind noch auszuarbeiten. Sie blockieren das Projektgerüst und isolierte technische Prototypen nicht. Sie müssen vor betroffener produktiver Implementierung konkretisiert werden.
[Offene Punkte](../planung/offene-punkte.md) und [bestätigte Bedienregeln](../planung/veranstaltung-anlegen.md) gelten weiter.


Die Bedienregeln D004 sind in der ersten Veranstaltungserstellung umzusetzen; siehe verbindlichen Bedienablauf in Anforderungen. Noch ungeklärte Vorlagen-/Abhängigkeitsdetails bleiben als solche zu dokumentieren.
