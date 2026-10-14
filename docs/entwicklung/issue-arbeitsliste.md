# Netcup-Arbeitsliste

15. Oktober 2026: Betreiber priorisiert Netcup vor weiterem lokalen Funktionsausbau. Diese auf S1/main angelegte Liste beschreibt die Serverkonsolidierung; weitergehende ungemergte S2/S3-Zweige werden dadurch nicht verworfen oder als produktiv bezeichnet.

| Paket | Aktueller Stand | Abschlusskriterien / nächste Arbeit |
| --- | --- | --- |
| [#31 Medienworker](https://github.com/SchapfeldNils/ShowNight-System/issues/31) | PR #34: implementiert, lokal und AMD64-/ARM64-CI bestanden, unabhängig geprüft | Softwarekorrektur nachgewiesen; noch ungemergt und nicht produktiv. In vollständigen Releasekandidaten integrieren und dessen Update prüfen |
| [#3 Sicherung](https://github.com/SchapfeldNils/ShowNight-System/issues/3) | Implementierte Grundlage in ungemergtem PR #22; kein belegter produktiver Sicherungsbetrieb | Atomare Veröffentlichung, private Kennwortdatei prüfen; danach unabhängiges Ziel, Verwahrung, Retention/Monitoring und tatsächlichen Restore konkretisieren |
| Onlinekonsolidierung | Öffentlich zuletzt Schema 4; aktuelle Entwicklung enthält weitere Korrekturen | Istbestand lesend erheben, vollständigen exakten Releasekandidaten auswählen, Backup/Restore/Migration/Rückkehr prüfen, erst dann konkrete Betreiberfreigabe |

PR #2 ist gemergt, Issue #1 geschlossen. Keine erneute S1-Grundentwicklung. PR #23 enthält historische Betriebsnachweise und hat einen Mergekonflikt. Die neue isolierte S1-Workerbasis mit Migrationen 001/005 darf nicht direkt über den vollständigen Schema-4-Betrieb ausgerollt werden. [Korrektur und Nachweisgrenzen](netcup-worker-claims.md).
