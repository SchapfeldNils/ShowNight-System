# Arbeitsregeln für Codex

## Auftrag und Lesen
Lies README.md, docs/entwicklung/auftrag.md, docs/entwicklung/arbeitspakete.md, docs/anforderungen.md und docs/architektur.md vor der Umsetzung. Berücksichtige docs/gesamtkonzept.md, docs/planung/entscheidungen.md und docs/planung/offene-punkte.md.

Die Dokumentation beschreibt Zielanforderungen. Bezeichne geplante Funktionen und simulierte Integrationen niemals als fertig oder praktisch nachgewiesen. Der vollständige vereinbarte Umfang bleibt das Ziel der ersten Veranstaltungsfreigabe.

## Entwicklung
- Gemeinsames Repository für Web-App, API, Medienkomponente, Agenten und Dokumentation.
- Je Arbeitspaket eigener Arbeitsbranch und Pull Request. Nicht direkt auf main entwickeln und PRs nicht eigenständig mergen, sofern kein weiterer Auftrag dies erlaubt.
- Bestehende Architektur ist Ausgangsbasis. Kleine reversible Implementierungsdetails selbst entscheiden und dokumentieren. Grundlegende Produktentscheidungen, Änderung von Rechten oder Ausfallverhalten und größerer Architekturumbau benötigen Abstimmung.
- Nutze ausschließlich kostenlose zusätzliche Komponenten. Dokumentiere Lizenzen und erforderliche externe Voraussetzungen.
- Halte Fachmodule getrennt, mit gemeinsamen Identitäten, Rechten und definierten Schnittstellen.
- Keine Regieübernahme: mehrere berechtigte Regien sind gleichberechtigt; konkurrierende Befehle serverseitig ordnen und deduplizieren.
- Simulationsmodus deutlich sichtbar. Echte Geräteausgaben und E-Mails im Demo-Betrieb standardmäßig aus.
- Keine erfundenen Geräte-APIs oder Rückmeldungen. Nicht verfügbare Hardware mit klar bezeichnetem Adapter simulieren; reale Nachweise offen lassen.
- UI-Texte auf Deutsch. Originale ShowNight-Gestaltung nutzen, soweit vorhandene Dateien dies erlauben. Fehlende Designquellen dokumentieren; vorläufige Gestaltung als solche markieren.
- Öffentliches Repository: keine Geheimnisse oder realen Ticket-/Käuferdaten. Verwende synthetische Demodaten.

## Nachweise und Dokumentation
Ein Arbeitspaket braucht einen benutzbaren Ablauf, angemessene Prüfungen, Startanleitung, bekannte Grenzen und aktuelle Dokumentation. Dokumentiere die tatsächlich ausführbaren Build-/Testbefehle, sobald das Projektgerüst besteht; nicht vorab erfundene Befehle übernehmen.
Prüfe insbesondere konkurrierendes GO, Wiederverbindung, Rechte und Trennung von Vorschau-/Publikumston. Browser-Demos ersetzen keine Windows-/Hardwareabnahme.
Erhalte F-/A-Kennungen. Neue Entscheidungen mit Datum und Status protokollieren; offene Fragen nicht still als bestätigt übernehmen.
Markdown ist der führende Stand. Der Word-Export ist ein datierter Schnappschuss.
