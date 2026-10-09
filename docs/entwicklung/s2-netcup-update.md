# S2-Update auf Netcup: Durchführung und Nachweise

Stand: 10. Oktober 2026. [PR #5](https://github.com/SchapfeldNils/ShowNight-System/pull/5), abhängig von S1-PR #2. **Produktives S2-Update nach ausdrücklicher Betreiberfreigabe durchgeführt; Schema 2 bereit und DJ-Rechner gepaart.** Keine Veranstaltungsfreigabe und kein PR-Merge.

## Konkreter Stand und Nachweise

Produktiv läuft das geprüfte ARM64-Image `shownight:26edc1d1e464ed3ad7694b46e4036b6ccc669049-arm64`, [Actions 37980294023](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/37980294023), mit Schema 2. Heruntergeladenes Archiv-SHA256: `d02b4d5e8b2cde8e5f744cd547a4f5cfa9630b2afbfa2af411449a55ed7c7ced`. Config-SHA256: `37f7b1a22b9d3799dcd961f58cdfdcb2ad2aff41d3ca465ef00e1961a7b660ac`. Archivhash vor Übertragung und auf der VM geprüft; nach Import Architektur und sämtliche RootFS-Layer mit dem CI-Archiv verglichen. Docker/containerd kann als Image-ID den zusätzlichen OCI-Manifestdigest melden.

Vor dem Produktivupdate am 10. Oktober auf der vorhandenen VM tatsächlich ausgeführt:

1. Live-Snapshot ausschließlich für den Probelauf erstellt. Tabellen-/Medienstand unmittelbar davor und danach identisch; produktive App/Worker dabei weitergelaufen. **Dies ersetzt nicht das konsistente Wartungsbackup vor einem Produktivupdate.**
2. Snapshot in eigene neue PostgreSQL-/Medienvolumes wiederhergestellt. Alle 18 ursprünglichen Tabelleninhalte per Hashvergleich identisch; aktuell keine Medien im Snapshot. S1 bereit mit Schema 1.
3. Nur Test-App gestoppt, Migration 2 mit neuem Image bewusst ausgeführt und S2-Test-App gestartet. Readiness 200/Schema 2; ursprüngliche Daten unverändert, drei neue Agenttabellen leer.
4. Ursprünglichen Snapshot in weiteren neuen leeren Volumes wiederhergestellt und altes S1-Image gestartet. Wieder alle Tabellen/Medien identisch, Readiness 200/Schema 1.
5. Beide Teststacks gestoppt. Private Daten/Volumestände vorläufig als Nachweis erhalten; keine Produktivvolumes gelöscht oder verändert. Produktiv anschließend erneut Schema 1/ready geprüft.

Vorlage: [s2-preflight-compose.yaml](../../deploy/s2-preflight-compose.yaml). Ausschließlich internes Backendnetz, keine veröffentlichten Ports, kein Proxyanschluss und kein Worker. Original-MFA-Schlüssel privat, separate Test-DB-Kennwörter. Mailausgabe aus. Private Durchführungsergebnisse und Konfiguration auf Betreiberrechner außerhalb OneDrive/Git, ACL aktueller Benutzer/SYSTEM. Keine produktive Anmeldung am Teststack durch Übernahme des Betreiberfaktors.

## Ablauf für das produktive Update

Nach Freigabe „Ja, Update und DJ-Paarung durchführen“ tatsächlich ausgeführt:

1. Ausschließlich ShowNight-App/Worker für konsistentes Wartungsbackup gestoppt. DB-/Medienbackup und SHA256 auf VM und Betreiberrechner geprüft. Originalkonfiguration separat gesichert, lokale DPAPI/CurrentUser-Kopie mit identischem Entschlüsselungs-Roundtrip bestätigt. Sicherung auf der VM: `/opt/shownight/backups/s2-upgrade-20261010-5722f6a6`; externe Kopie `%LOCALAPPDATA%/ShowNight/operations/s2-preflight-20261010/fresh-backup-5722f6a6`, außerhalb OneDrive/Git, Benutzer-/SYSTEM-ACL.
2. Frische Sicherung in neuen leeren isolierten Volumes wiederhergestellt: alle 18 Tabelleninhalte/Medien identisch, S1 ready/Schema 1. Aktuell keine Medien im Wartungsbackup; kein neuer Nachweis nicht leerer Medien daraus. Recoveryprojekt `shownight-s2-recovery-20261010-5722f6a6` danach gestoppt; eigene Nachweisvolumes vorläufig erhalten.
3. Migration 2 bewusst ausgeführt, ursprüngliche 17 Fachtabellen und Medien unverändert, Migrationsmarker ergänzt. Portainer-Stack 23 auf Endpoint 3 auf geprüftes S2-Image aktualisiert; App healthy und Worker gestartet. Environmentvergleich: ausschließlich Image geändert, private CLI-Konfiguration konsistent mit Portainer. Bestehende Volumes und Proxyroute erhalten; kein Bootstrap/Betreiber-MFA-Reset. Mailversand weiterhin aus.
4. Öffentlicher HTTPS-Zugriff mit vollständiger Zertifikatsprüfung: HTML 200, Readiness 200/Schema 2. Eigenes synthetisches Konto mit eigener MFA: unangemeldet 401, falscher CSRF 403, Nichtadmin 403. Gebündelte Windows-ZIP tatsächlich gepaart und gestartet; WSS durch vorhandenen Proxy, Diagnose `agent-roundtrip`, Simulator `simulator-no-effect`, Duplikat liefert gespeichertes Ergebnis. Widerruf beendet Agenten mit Exit 0. Synthetische Konten/Geräte/Aufträge gezielt bereinigt.
5. Betreiber erstellt nach eigener Admin-/MFA-Anmeldung einen DJ-Code und hinterlegt ihn lokal. DJ-Rechner über gebündelten CLI gepaart, DPAPI-Roundtrip bestätigt, WSS verbunden. Echte Diagnoseantwort `completed`/`agent-roundtrip` in Server und lokalem SQLite bestätigt. Separates synthetisches Diagnosekonto und seine Serverzeile danach entfernt, echte DJ-Identität und lokales Journal erhalten. Agent läuft manuell, kein Dienst/Autostart und keine Bühnenbefehle.

Ein erster Wartungsversuch scheiterte vor der Migration an gemischtem Docker-/JSON-Hilfsoutput; S1-App/Worker automatisch wieder gestartet. Hilfsprüfung auf eindeutige JSON-Zeile korrigiert, danach obiger vollständiger Ablauf bestanden. Kein Rückwechsel nach Migration nötig. Bei künftigem Fehler nach Migration S1 aus passender gesicherter Schema-1-Sicherung in separaten Volumes wiederherstellen und bewusst umschalten. Ein bloßer Imagewechsel reicht nicht; keine Migrationszeile löschen oder Produktivvolumes überschreiben.

Keine neue DNS-/Proxy-/TLS-Installation und keine Veränderung anderer Stacks. Windows-Resolver liefert noch das alte Webhostingziel; Zielprüfung und DJ-Prozess verwendeten deshalb eine ausdrücklich begrenzte IP-Vorgabe für die bestätigte VM, mit unverändertem HTTPS-Hostnamen und voller Zertifikatsprüfung. Keine System-/Router-DNS- oder Hostsänderung. Normaler Agentstart ohne diese vorläufige Hilfe noch zu bestätigen.

Regelmäßiges unabhängiges Backup-/Schlüsselziel bleibt [Issue #3](https://github.com/SchapfeldNils/ShowNight-System/issues/3); DPAPI-Kopie benötigt das zugehörige Windows-Profil und ist keine unabhängige portable Schlüsselkopie. Physische Geräte-/Ton-/Synchronitätsnachweise bleiben offen. Aktuelle Dokumentations-/Vorlagenrevision `85a361d` zusätzlich vollständig grün in [Actions 38004096742](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38004096742); das ausgelieferte Runtimeimage bleibt der oben festgelegte Stand `26edc1d`.
