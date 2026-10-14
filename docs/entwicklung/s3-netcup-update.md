# S3 · Online-Update für die lokale Erstinbetriebnahme

Stand: 14. Oktober 2026. [Issue #20](https://github.com/SchapfeldNils/ShowNight-System/issues/20), [Entwurfs-PR #21](https://github.com/SchapfeldNils/ShowNight-System/pull/21). Produktiv läuft weiterhin S2/Schema 2. **Kein Produktivupdate durchgeführt und keine produktive Datenbank migriert.**

## Anlass und Abgrenzung

Setup 0.3.6 enthält den lokalen HTTPS-Server und Renderer. Das auf dem DJ-Rechner inzwischen angelegte Profil besteht die Adress-/Zertifikat-Konfigurationsprüfung. Es fehlen jedoch Inhaltspaket, ausdrücklich importiertes Serververtrauen und der dazu passende, rechnergebundene Anmeldestand. Die lokale Kontenablage enthält keinen Snapshot und null Benutzer; der Starter verweigert dann bewusst den Start. Die allgemeine Fehlermeldung erklärt diese Voraussetzung bislang nicht. [Einrichtungsnachweis](nachweise/2026-10-14-erstinstallation.json).

Die dafür vorgesehenen Online-Exportwege sind im produktiven S2-Stand noch nicht bereitgestellt. Eine Neuinstallation der gleichen Setup-EXE, das erneute Initialisieren des Profils oder ein pauschaler Zertifikatimport beseitigen diese fehlenden Vorbereitungsdaten nicht. Keine Ersatzkonten und kein Umgehen bestehender Anmeldung/MFA oder Ziel-/Signaturprüfung.

## Konkreter Updateentwurf

Ziel ist das ARM64-Image `shownight:1c983fc01c98916fc782422f19e67567821bdaaa-arm64` aus dem erfolgreichen [S1-Prüflauf 38608548898](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38608548898), Artefakt `11916663556`. Dieser Stand entspricht der für Setup 0.3.6 geprüften Runtime und enthält Migrationen 003/004. Er erweitert die Online-Datenbank von Schema 2 auf 4. Der Streaming-Rechner rendert später lokal; Netcup übernimmt keine Bühnenausgabe.

Das heruntergeladene GitHub-Artefakt wurde gegen SHA256 `9a3fe173db4a938a9e9f5cf1aee9bdc80d6d5d8a063e7fceb3f02c6b6eba6b0b` geprüft. Linux/ARM64, Imagekonfiguration und sämtliche RootFS-Layer nach Import auf der bestätigten VM mit dem CI-Archiv verglichen. Bestehendes Produktivimage: `shownight:a8b062ff0c945e920834e6c0887e15cf29662219-arm64`.

Portainer-Stack 23 auf Endpoint 3 tatsächlich lesend geprüft: aktiv, Konfiguration identisch zur privaten CLI-Konfiguration. Alter und neuer Updateentwurf liegen ausschließlich im geschützten Betriebsordner außerhalb OneDrive/Git. Compose-Inhalt und alle Environmentwerte bleiben im Entwurf gleich; ausschließlich `SHOWNIGHT_IMAGE` wechselt. `pullImage=false`, da das geprüfte Image bereits auf der VM liegt. Mailversand bleibt ausgeschaltet. Ein vorbereiteter Entwurf ist keine gesendete Portainer-Aktualisierung.

## Isolierter Probelauf auf der Ziel-VM

Live-Snapshot für den Probelauf erstellt, ohne App/Worker zu stoppen. Alle Tabellen- und Medienhashes unmittelbar davor und danach identisch. Dies ist **kein konsistentes Wartungsbackup für das Produktivupdate**. Private Snapshotdaten werden nicht veröffentlicht.

Vorhandene [Compose-Testvorlage](../../deploy/s2-preflight-compose.yaml) wiederverwendet: je ein neuer eindeutiger Projekt-/DB-/Medienvolumename, vor Start auf Nichtexistenz geprüft, nur internes Backendnetz, keine veröffentlichten Ports, kein Proxyanschluss, kein Worker. Eigene DB-Kennwörter; ursprünglicher MFA-Schlüssel nur in privaten Konfigurationen. Kein produktives Konto angemeldet und kein Betreiberfaktor übernommen.

Tatsächlich ausgeführt:

1. Snapshot in neue leere Testvolumes wiederhergestellt und mit altem S2-Image gestartet. Readiness Schema 2; alle Tabelleninhalte und Medienhashes identisch.
2. Ausschließlich Test-App gestoppt, Migrationen mit neuem Image ausgeführt und Test-App gestartet. Readiness Schema 4; ursprüngliche Fachtabellen unverändert, drei zusätzliche Tabellen `offline_exports`, `scenes` und `scene_leases` leer. Migrationsmarker enthält vier Einträge.
3. Eigenes temporäres synthetisches Admin-Konto ausschließlich im Teststack angelegt. Reguläre Anmeldung und eigene MFA-Einrichtung/Bestätigung ausgeführt. Ohne Anmeldung beide Offlinewege 401; mit bestätigter Anmeldung Vertrauensdownload 200 und fehlerhafte Exportanfrage 400. Synthetisches Konto, Challenges und Sitzung anschließend entfernt; vollständiger Tabellen-/Medienhashvergleich wieder identisch zum Stand vor der Zusatzprobe. Dies ist noch kein erfolgreicher Export eines echten Betreiberpakets.

4. Ursprünglichen Snapshot in weiteren neuen leeren Volumes wiederhergestellt und mit altem S2-Image gestartet. Readiness Schema 2; alle ursprünglichen Tabellen und Medienhashes identisch. Beide Teststacks anschließend gestoppt; private Nachweisvolumes vorläufig erhalten.
5. Produktiv erneut Readiness Schema 2, ursprüngliches App-/Workerimage und ausgeschalteten Mailversand geprüft. Kein produktiver Dienst gestoppt und kein Produktivupdate gesendet.

[Strukturierter Nachweis](nachweise/2026-10-14-s3-netcup-probelauf.json): 21 ursprüngliche Tabellen einschließlich Migrationsmarker, davon 20 unveränderte Fachtabellen. Aktuell null Medien im Snapshot; daraus folgt kein neuer Nachweis eines nicht leeren Medienbestands. Archivhash des eigentlichen Image-TAR.GZ: `298933bbe6636584194e1950cddaa866bdc8e3564822b3393429163e251ecb81`.

Lokale KI für ein kleines Review der versionierten Compose-Testvorlage verwendet. Hinweise zur expliziten Prüfung neuer Volumennamen und des Images nachvollzogen und im tatsächlich ausgeführten Ablauf berücksichtigt. Den Hinweis zum MFA-Schlüssel eingeordnet: der originale Schlüssel ist für die Kopie bestehender verschlüsselter Daten erforderlich und bleibt ausschließlich privat. Die Antwort wurde am Ausgabelimit abgeschnitten; keine vollständige KI-Freigabe daraus abgeleitet. Maßgeblich sind die selbst geprüften Zielnachweise oben.

## Produktivablauf nach ausdrücklicher Freigabe

Die folgende Änderung benötigt eine kurze Website-Unterbrechung und verändert das produktive Datenbankschema. Deshalb vor Ausführung ausdrücklich freigeben lassen; der bisherige Auftrag zum historischen S2-Update wird nicht als Freigabe hierfür behandelt.

1. Aktuellen Portainer-/CLI-/Image-/Schemazustand erneut gegen den geprüften Entwurf vergleichen. Bei Abweichung anhalten und Entwurf neu prüfen.
2. Ausschließlich ShowNight-App/Worker für ein frisches Wartungsbackup stoppen. Datenbank, Medien und private Konfiguration sichern. Backuphashes auf VM und externer Betreiberkopie prüfen. App/Worker bis zum erfolgreichen Update oder zur geprüften Rückkehr gestoppt lassen, damit während der Wiederherstellungsprüfung keine zwischenzeitlichen Benutzeränderungen verloren gehen. Schlüssel-/Konfigurationssicherung außerhalb OneDrive/Git schützen; lokale DPAPI-Kopie benötigt weiterhin das zugehörige Windows-Profil und ist keine unabhängige portable Schlüsselsicherung.
3. Diese frische Sicherung in weiteren neuen leeren isolierten Volumes wiederherstellen; alte Runtime/Readiness Schema 2 sowie alle Tabellen-/Medienhashes bestätigen. Der vorangegangene Live-Probelauf ersetzt diesen Schritt nicht. Bei Fehler vor Migration den bisherigen produktiven Stand wieder starten und Änderung abbrechen.
4. Migration 003/004 bewusst ausführen. Portainer-Stack mit dem geprüften Image aktualisieren und CLI-Konfiguration konsistent halten. Readiness Schema 4, öffentliche HTTPS-Verbindung, Worker, erhaltene Daten und vorhandene DJ-Identität prüfen; Mailausgabe bleibt aus. Kein Bootstrap/MFA-Reset, keine DNS-/Proxy-Neueinrichtung und kein PR-Merge.
5. Bei Fehler nach Migration reicht der Wechsel zum alten Image nicht aus: passenden Schema-2-Sicherungsstand mit altem Image in getrennten Volumes wiederherstellen und erst nach Prüfung bewusst umschalten. Keine Migrationszeilen löschen und keine Produktivvolumes überschreiben. Bis zu dieser geprüften Rückkehr keine neuen produktiven Schreibzugriffe zulassen.
6. Betreiber meldet sich regulär online mit eigener MFA an; passende Inhaltspakete und zielgebundenen Anmeldestand exportieren. Dateien privat auf dem DJ-Rechner bereitstellen und in vorgeschriebener Reihenfolge importieren. Vertrauensfingerabdruck und Zertifikatvertrauen gezielt prüfen, anschließend lokalen Server starten und tatsächliche HTTPS-Anmeldung bestätigen. Keine Geheimnisse im Chat.

Die Ersteinrichtung bleibt bis zum tatsächlichen lokalen Start und zur Anmeldung offen. Umfangreiche LAN-/Hardware-/Ton-/HDMI-/Veranstaltungsprüfungen und die vollständige Showfreigabe bleiben davon getrennt. Allgemeine Starterfehler und fehlender Einrichtungsassistent bleiben als Softwarearbeit in Issue #20 offen.
