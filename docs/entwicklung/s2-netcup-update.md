# S2-Update auf Netcup: vorbereiteter Ablauf

Stand: 10. Oktober 2026. [PR #5](https://github.com/SchapfeldNils/ShowNight-System/pull/5), abhängig von S1-PR #2. **Vorbereitung und isolierter Probelauf, noch kein produktives S2-Update.** Keine Veranstaltungsfreigabe und kein PR-Merge.

## Konkreter Stand und Nachweise

Produktiv läuft S1 mit Schema 1. Ziel ist das geprüfte ARM64-Image `shownight:26edc1d1e464ed3ad7694b46e4036b6ccc669049-arm64`, [Actions 37980294023](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/37980294023). Heruntergeladenes Archiv-SHA256: `d02b4d5e8b2cde8e5f744cd547a4f5cfa9630b2afbfa2af411449a55ed7c7ced`. Config-SHA256: `37f7b1a22b9d3799dcd961f58cdfdcb2ad2aff41d3ca465ef00e1961a7b660ac`. Archivhash vor Übertragung und auf der VM geprüft; nach Import Architektur und sämtliche RootFS-Layer mit dem CI-Archiv verglichen. Docker/containerd kann als Image-ID den zusätzlichen OCI-Manifestdigest melden.

Am 10. Oktober auf der vorhandenen VM tatsächlich ausgeführt:

1. Live-Snapshot ausschließlich für den Probelauf erstellt. Tabellen-/Medienstand unmittelbar davor und danach identisch; produktive App/Worker dabei weitergelaufen. **Dies ersetzt nicht das konsistente Wartungsbackup vor einem Produktivupdate.**
2. Snapshot in eigene neue PostgreSQL-/Medienvolumes wiederhergestellt. Alle 18 ursprünglichen Tabelleninhalte per Hashvergleich identisch; aktuell keine Medien im Snapshot. S1 bereit mit Schema 1.
3. Nur Test-App gestoppt, Migration 2 mit neuem Image bewusst ausgeführt und S2-Test-App gestartet. Readiness 200/Schema 2; ursprüngliche Daten unverändert, drei neue Agenttabellen leer.
4. Ursprünglichen Snapshot in weiteren neuen leeren Volumes wiederhergestellt und altes S1-Image gestartet. Wieder alle Tabellen/Medien identisch, Readiness 200/Schema 1.
5. Beide Teststacks gestoppt. Private Daten/Volumestände vorläufig als Nachweis erhalten; keine Produktivvolumes gelöscht oder verändert. Produktiv anschließend erneut Schema 1/ready geprüft.

Vorlage: [s2-preflight-compose.yaml](../../deploy/s2-preflight-compose.yaml). Ausschließlich internes Backendnetz, keine veröffentlichten Ports, kein Proxyanschluss und kein Worker. Original-MFA-Schlüssel privat, separate Test-DB-Kennwörter. Mailausgabe aus. Private Durchführungsergebnisse und Konfiguration auf Betreiberrechner außerhalb OneDrive/Git, ACL aktueller Benutzer/SYSTEM. Keine produktive Anmeldung am Teststack durch Übernahme des Betreiberfaktors.

## Ablauf für das produktive Update

Der folgende Ablauf ist vorbereitet, aber noch nicht ausgeführt:

1. Kurzes Wartungsfenster für ausschließlich den ShowNight-Stack: App und Worker stoppen. Frisches DB-/Medienbackup mit SHA256 erstellen, Originalkonfiguration/MFA-Schlüssel getrennt geschützt sichern und externe Kopie prüfen. Während der Unterbrechung ist die Website vorübergehend nicht benutzbar.
2. Sicherung in neuen isolierten leeren Volumes prüfen. Bestehende Daten, Medien und ursprüngliche Konfiguration erhalten; keinen erneuten Bootstrap und keinen Betreiber-MFA-Reset durchführen.
3. Migration 2 mit dem oben festgelegten Image ausdrücklich ausführen. Portainer-Stack auf diesem Image starten; sämtliche anderen Environmentwerte, Mail-deaktiviert-Status, vorhandene Volumes und Proxyroute erhalten. Privaten Compose-/Environmentstand mit Portainer konsistent halten.
4. HTTPS/Readiness Schema 2, bestehende Vorbereitung sowie neue Paarungs-/WSS-/Diagnose-/Widerrufswege am tatsächlichen Ziel prüfen. Synthetische Abnahmekonten/-geräte anschließend gezielt bereinigen. DJ-Rechner separat als reales Gerät paaren; keine Cloud-Bühnenbefehle aktivieren.
5. Bei Fehler nach Migration S1 aus dem passenden gesicherten Schema-1-Bestand in separaten Volumes wiederherstellen und bewusst umschalten. Ein bloßer Rückwechsel des Images reicht nicht: S1 akzeptiert Schema 2 nicht. Keine Migrationszeile löschen und keine Produktivvolumes überschreiben.

Keine neue DNS-/Proxy-/TLS-Installation und keine Veränderung anderer Stacks. Regelmäßiges unabhängiges Backup-/Schlüsselziel bleibt [Issue #3](https://github.com/SchapfeldNils/ShowNight-System/issues/3). Der erfolgreiche Probelauf beweist Datenübernahme/Rückkehr, noch keine produktive S2-Paarung oder physische Gerätefunktion.
