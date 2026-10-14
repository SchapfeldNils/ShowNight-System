# Lokale Kontenrechte: Technikvergabe

14. Oktober 2026 · [Issue #27](https://github.com/SchapfeldNils/ShowNight-System/issues/27) · F05/F30, A18. Branch `codex/s3-offline-account-rights`, Ausgangsbasis PR #25 / `000f1a2995443d84bfc1a9fd4b2a11b77ed1d936`.

## Verhalten und Bedienung

Bei **Lokale Veranstaltungskonten** bietet die lokale Oberfläche die Rolle **Technik** nur Systemadministratoren an. Eine Veranstaltungsleitung kann weiterhin Konten mit den bereits unterstützten Fachrollen im eigenen vorbereiteten Event anlegen. Technische Rechte bleiben von vollständigen Inhaltsrechten getrennt.

Der Server prüft die Technikvergabe unabhängig vom Formular. Eine direkte Anfrage einer nichtadministrativen Leitung mit `role: "technik"` wird vor Konto-, Grant-, Einladungs- und Auditänderungen mit HTTP 403 abgewiesen. Das setzt die bereits online durchgesetzte Regel lokal durch; keine neue Fachrolle oder Rechteerweiterung. Bestehende Konten werden nicht nachträglich verändert. Frühere unzulässige Vergaben lassen sich daraus nicht automatisch erkennen oder bereinigen; der vorhandene Sperrweg bleibt verfügbar.

Bestehende Anmeldung/MFA, Veranstaltungsbindung, Einladungsannahme, CSRF und Sperren bleiben verbindlich. Keine Schemaänderung, zusätzliche Bibliothek oder Lizenz.

## Auslieferung und Grenzen

Setupquellen 0.3.9 enthalten die Korrektur; ein tatsächlich erzeugtes und geprüftes Artefakt wird erst nach erfolgreicher CI ausgewiesen. Installation wie in [Streaming-Installer](s3-streaming-installer.md), mit vorheriger Sicherung und regulär beendetem eigenem Dienst. Dieser Entwicklungsdurchlauf aktualisiert weder den vorhandenen lokalen Betrieb 0.3.8 noch Netcup und führt keine Geräteaktion aus. Kein automatischer Merge.

Die Browserprüfung verwendet synthetische API-Daten. Sie ersetzt keine API-Rechteprüfung. SQLite-/API-Tests und unabhängiger Review werden getrennt dokumentiert. Keine Veranstaltungs-, LAN-, Geräte- oder Hardwarefreigabe. Mail und physische Ausgabe bleiben aus. Native Komposition der vorhandenen Paket-v2-Szenen ist das nächste Entwicklungsarbeitspaket.

## Prüfstand

Implementierung und neue Nachweise in Arbeit. Erfolgreiche Prüfungen der Ausgangsbasis werden nicht als Nachweis der Korrektur übernommen.
