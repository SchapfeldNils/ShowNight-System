# Sicherung und unabhängige Wiederherstellung – Issue #3

14. Oktober 2026 · `codex/issue-3-external-backup`. Vorbereiteter Softwareablauf; kein eingerichteter produktiver Backupjob.

Der Betreiber stellt klar: keine externe Festplatte verfügbar; er geht von einem Netcup-Backup der VM aus. Die zuvor genannte externe Festplatte ist damit keine gültige Zielvorgabe. Für das Providerbackup sind Produkt, Umfang der Docker-Datenträger/Volumes, Zeitplan, Aufbewahrung und tatsächlich nutzbare Wiederherstellung noch zu erheben. Daraus wird kein geprüfter externer Schutz oder unabhängiger Schlüsselstand abgeleitet. 30 tägliche Stände bleiben ein Planungsvorschlag; automatische Löschung ist nicht aktiviert.

## Implementierter Ablauf

`deploy/backup-run.sh` ist ein für Linux vorbereiteter täglicher Aufruf. Er benötigt vorhandene private `stack.env`, ein vorhandenes Sicherungsziel und eine private Kennwortdatei. `flock` verhindert parallele Wartungsfenster. Die vorhandene Sicherung stoppt nur App/Worker des konfigurierten Stacks, dumpft PostgreSQL und archiviert Medien. Beide Dienste müssen vorher laufen; bei Fehler wird ihr Wiederanlauf mit `--wait` geprüft und dessen Fehlschlag nicht als Erfolg ausgegeben. Unvollständige Sicherungen werden nicht verschlüsselt veröffentlicht. Die private Konfiguration muss dem tatsächlich wirksamen Portainer-/Compose-Stand einschließlich MFA-/DB-/SMTP-Werten entsprechen; keine zusätzliche private Datei außerhalb dieser Konfiguration ist automatisch enthalten.

Das neue `scripts/backup-vault.mjs` verschlüsselt Datenbank, Medienarchiv, SHA256SUMS und private Stackkonfiguration als eine `.snbackup`-Datei. Node-Bordmittel: AES-256-GCM, authentifizierter Formatheader, pro Archiv frisches Salt/IV, scrypt (N=32768, r=8, p=1), Streaming statt vollständigem Medienarchiv im RAM. Quelldateien und vorhandene Dump-/Medienprüfsummen werden geprüft; Änderungen beim Lesen brechen ab. Das Sicherungskennwort ist separat und mindestens 20 Zeichen lang. Es ist weder Betreiberlogin noch Windows-DPAPI-Schlüssel und gehört an ein unabhängiges, noch festzulegendes Wiederherstellungsziel. Kennwortverlust verhindert Entschlüsselung.

`open` entschlüsselt ausschließlich in ein neues privates Verzeichnis: Windows-ACL für aktuellen Benutzer/SYSTEM, Unix 0700. Vor dem Herauslösen der vier festen Dateien muss die GCM-Authentifizierung bestanden sein. Namen und Größen werden geprüft, enthaltene SHA256 erneut verglichen; Fehler entfernen nur eigene feste Ausgabedateien. Bestehende Ausgaben werden nicht überschrieben. Kein Restore in laufende Produktivvolumes und keine automatische Migration. Erfolgreiche Dateientschlüsselung ersetzt keinen PostgreSQL-/MFA-/Anwendungsrestore.

## Benutzung ohne Geheimnisse in der Kommandozeile

Laufzeit Node 24, Docker Compose und Linux `flock` (util-linux) sind Voraussetzungen für den Runner; reine Entschlüsselung benötigt Node 24, unter Windows zusätzlich die vorhandene Windows PowerShell für ACLs. Keine neuen npm-Komponenten. Node/Bibliothekslizenzen unverändert; `flock` unter MIT gemäß [Herstellerquelltext](https://github.com/util-linux/util-linux/blob/master/sys-utils/flock.c), geprüft am 14. Oktober 2026. Tatsächlich installierte Version/Lizenz vor produktiver Einrichtung dokumentieren.

Beispiel unter Linux mit privaten absoluten Pfaden außerhalb Git/OneDrive (Platzhalter ersetzen):

```sh
sh deploy/backup-run.sh /PRIVATE/stack.env /BACKUP_TARGET /PRIVATE/backup-password
node scripts/backup-vault.mjs open /BACKUP_TARGET/DATEI.snbackup /PRIVATE/new-restore < /PRIVATE/backup-password
```

Die Kennwortdatei muss ausschließlich für den Betreiber lesbar sein (Unix 0600 beziehungsweise passende Windows-ACL). Kennwort nicht in Shellhistory, Logs, Chat oder Repository hinterlegen. Das verschlüsselte Archiv zusätzlich außerhalb der VM sichern; ein Ordner auf derselben VM ist allein kein externes Ziel. Klartext-Staging wird nach Runnerende über feste eigene Dateinamen bereinigt; Crash-/Stromausfall kann private Restdateien hinterlassen, daher geschützten Temp-Speicher und manuelle Bereinigung prüfen.

Für den eigentlichen isolierten Restore die entschlüsselte `stack.env` privat auf **neuen Stack, neue Volumes, eindeutigen Alias und Mail aus** anpassen; Original-MFA-Schlüssel erhalten. Danach den bestehenden Ablauf verwenden:

```sh
RESTORE_CONFIRM=EMPTY_ISOLATED_STACK sh deploy/restore.sh /PRIVATE/restore.env /PRIVATE/new-restore
```

Es wurde kein Cron-/Systemd-/Windows-Timer auf Produktivsystemen eingerichtet. Vor Aktivierung: konkretes unabhängiges Sicherungs-/Kennwortziel, Aufbewahrung, Wartungszeit und Monitoring klären; erstmalige verschlüsselte externe Kopie plus isolierten Restore mit MFA/Dateihashes bestätigen. Fehlerstatus und ausbleibende Läufe müssen im festgelegten Monitor sichtbar sein. Ein Netcup-VM-Snapshot erfüllt diese Punkte erst nach konkreter Prüfung seiner Abdeckung und eines Restores.

## Tatsächliche Prüfungen

Lokal Windows x64: `node --test tests/backup-vault.test.mjs` 3/3 bestanden mit synthetischen Dump-/Medienbytes und Konfiguration. Verschlüsselter Dateierhalt, echte Wiederherstellung, falsches Kennwort, Manipulation, abgeschnittenes Archiv, ungültige Quelldatei und Erhalt vorhandener Ausgabe geprüft. Kein anderer realer Windows-Benutzer eingesetzt; profilunabhängiges Format nutzt ausdrücklich keine DPAPI. ACL-Tests außerhalb Sandbox mit privaten temporären Verzeichnissen durchgeführt. Kein Docker auf diesem Host: Linux-Runner, Fehler-/Wiederanlauf und vollständiger DB-/Medienrestore werden separat in CI geprüft. `tests/container-smoke.sh` führt dort Runner, verschlüsselte Sicherung, Entschlüsselung und tatsächlichen isolierten PostgreSQL-/Medienrestore durch. CI-Ergebnis erst nach tatsächlichem Lauf ergänzen.

CI-Nachweis Runtime `37c1d1045e1eded09f19e3c91490f4702b0e748d`: [S1 checks 38626408226](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38626408226) vollständig erfolgreich auf Windows sowie nativen AMD64-/ARM64-Linux-Runnern. Die drei Vaultprüfungen bestehen auf allen Plattformen; die zusätzliche Linux-Wartungsprüfung belegt Erfolg, Abweisung bereits gestoppter Dienste, Dump-/Stopfehler mit Wiederanlauf und Fehlerstatus bei fehlendem Wiederanlauf. Beide Linux-Containerabläufe führen den echten Wartungsrunner, verschlüsselte Sicherung, Entschlüsselung und isolierten PostgreSQL-/Medienrestore durch; Medienhashvergleich und anschließender Datenbankausfall/Wiederverbindung bestanden. Der [Server-Installerlauf 38626408257](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38626408257) ist ebenfalls erfolgreich. Auch der separate [Native-renderer-Lauf 38626408225](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38626408225) ist vollständig erfolgreich: nativer Build/Prozess, portables Server-/Rendererpaket und echter Renderer-Setup-Lebenszyklus. [Strukturierter Backupnachweis](nachweise/backup-vault.json). Reine nachfolgende Dokumentationscommits ändern diese Runtime nicht.

Offen: produktiver Zeitplan, automatisches Fehler-/Ausbleibemonitoring, externe Zustellung/30-Tage-Aufbewahrung, unabhängige Kennwortverwahrung, Providerumfang und periodischer realer Restore. F50/A17 und Issue #3 bleiben insgesamt offen.
