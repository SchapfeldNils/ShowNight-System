# Sicherung und unabhängige Wiederherstellung – Issue #3

19\. Oktober 2026 (PR offen, nicht eingerichtet): `deploy/backup.sh` prüft vor jedem Stopp mit `scripts/stack-check.mjs`, ob die private `stack.env` exakt zum laufenden Stack passt (Compose-Konfigurations-Hash und aufgelöste Volume-Namen von `postgres`, `app`, `worker`). Dazu kommen systemd-Vorlagen für einen täglichen Lauf. Details unten unter „Vorprüfung“ und „Zeitgesteuerte Sicherung“.

15\. Oktober 2026: Netcup hat Vorrang. [Sicherungshärtung](netcup-backup-haertung.md) auf eigenem Folgebranch zu PR #22: atomare Archivveröffentlichung und Prüfung der geöffneten Kennwortdatei vor Wartung implementiert, neue Vaultregression 6/6 lokal bestanden, unabhängiger Codereview ohne Befund; S1-CI 38648600570 vollständig erfolgreich auf Windows/AMD64/ARM64 einschließlich echtem verschlüsseltem Containerrestore. Kein produktiver Sicherungsjob/Update. Die getrennte Worker-Korrektur PR #34 ist vollständig geprüft, aber in dieser älteren Basis nicht enthalten. PR #2 ist gemergt und Issue #1 geschlossen; ältere Tabellen unten historisch einordnen.

14\. Oktober 2026 · `codex/issue-3-external-backup`. Vorbereiteter Softwareablauf; kein eingerichteter produktiver Backupjob.

Der Betreiber stellt klar: keine externe Festplatte verfügbar; er geht von einem Netcup-Backup der VM aus. Die zuvor genannte externe Festplatte ist damit keine gültige Zielvorgabe. Für das Providerbackup sind Produkt, Umfang der Docker-Datenträger/Volumes, Zeitplan, Aufbewahrung und tatsächlich nutzbare Wiederherstellung noch zu erheben. Daraus wird kein geprüfter externer Schutz oder unabhängiger Schlüsselstand abgeleitet. 30 tägliche Stände bleiben ein Planungsvorschlag; automatische Löschung ist nicht aktiviert.

## Implementierter Ablauf

`deploy/backup-run.sh` ist ein für Linux vorbereiteter täglicher Aufruf. Er benötigt vorhandene private `stack.env`, ein vorhandenes Sicherungsziel und eine private Kennwortdatei. `flock` verhindert parallele Wartungsfenster. Die vorhandene Sicherung stoppt nur App/Worker des konfigurierten Stacks, dumpft PostgreSQL und archiviert Medien. Beide Dienste müssen vorher laufen; bei Fehler wird ihr Wiederanlauf mit `--wait` geprüft und dessen Fehlschlag nicht als Erfolg ausgegeben. Unvollständige Sicherungen werden nicht verschlüsselt veröffentlicht. Die private Konfiguration muss dem tatsächlich wirksamen Portainer-/Compose-Stand einschließlich MFA-/DB-/SMTP-Werten entsprechen; keine zusätzliche private Datei außerhalb dieser Konfiguration ist automatisch enthalten.

Das neue `scripts/backup-vault.mjs` verschlüsselt Datenbank, Medienarchiv, SHA256SUMS und private Stackkonfiguration als eine `.snbackup`-Datei. Node-Bordmittel: AES-256-GCM, authentifizierter Formatheader, pro Archiv frisches Salt/IV, scrypt (N=32768, r=8, p=1), Streaming statt vollständigem Medienarchiv im RAM. Quelldateien und vorhandene Dump-/Medienprüfsummen werden geprüft; Änderungen beim Lesen brechen ab. Das Sicherungskennwort ist separat und mindestens 20 Zeichen lang. Es ist weder Betreiberlogin noch Windows-DPAPI-Schlüssel und gehört an ein unabhängiges, noch festzulegendes Wiederherstellungsziel. Kennwortverlust verhindert Entschlüsselung.

`open` entschlüsselt ausschließlich in ein neues privates Verzeichnis: Windows-ACL für aktuellen Benutzer/SYSTEM, Unix 0700. Vor dem Herauslösen der vier festen Dateien muss die GCM-Authentifizierung bestanden sein. Namen und Größen werden geprüft, enthaltene SHA256 erneut verglichen; Fehler entfernen nur eigene feste Ausgabedateien. Bestehende Ausgaben werden nicht überschrieben. Kein Restore in laufende Produktivvolumes und keine automatische Migration. Erfolgreiche Dateientschlüsselung ersetzt keinen PostgreSQL-/MFA-/Anwendungsrestore.

## Vorprüfung vor jeder Sicherung

`backup.sh` startet App und Worker nach dem Dump mit `docker compose up -d --wait app worker` neu. Passt die verwendete `stack.env` nicht exakt zum laufenden Stack (zum Beispiel abweichender Volume-Name oder ein anderes Image als in Portainer), erzeugt Compose dabei Container mit der abweichenden Konfiguration neu. Bei falschem `DB_VOLUME_NAME` liefe Postgres dann auf einem leeren Volume. Erkannt bei der Vorbereitung des Schema-7-Updates (#53, #59).

Deshalb ruft `backup.sh` vor jedem Stopp `node scripts/stack-check.mjs <stack.env> deploy/compose.yaml postgres app worker` auf:
- Je Dienst muss der Compose-Konfigurations-Hash (`docker compose config --hash`) dem Label `com.docker.compose.config-hash` des laufenden Containers entsprechen.
- Weil dieser Hash nur Schlüssel und Referenzen enthält, werden zusätzlich verglichen:
  - die tatsächlich eingebundenen Volumes mit den aufgelösten Namen aus `docker compose config --format json`,
  - die verbundenen Netzwerke mit den aufgelösten Netzwerknamen (z. B. `PROXY_NETWORK_NAME`; ein falscher Name ließe App/Worker nach dem Stopp nicht wieder starten),
  - die Image-ID des laufenden Containers mit der Image-ID, auf die die Image-Referenz jetzt lokal zeigt (nach `docker load` oder `pull` desselben Tags würde Compose den Container sonst mit dem neuen Image neu erzeugen).
- Bei Abweichung bricht die Sicherung ab, **bevor** etwas gestoppt wird, und nennt den betroffenen Dienst. Die Prüfung liest nur.
- Node ist damit auch für `backup.sh` allein Voraussetzung (für `backup-run.sh` war es das bereits).

Nach jeder Änderung am Portainer-Stack (Image, Volumes, Umgebungswerte) muss die private `stack.env` nachgeführt werden, sonst verweigert der nächste Lauf die Sicherung. Das ist gewollt.

Geprüft durch `tests/backup-runner.test.mjs` mit Docker-Attrappe (abweichender Hash, Volume, Netzwerkname oder Image: kein Stopp, kein Neustart) sowie in CI durch die echten Containerabläufe (`tests/container-smoke.sh`, Netcup-Rehearsal), in denen die Vorprüfung gegen echte Compose-Stacks läuft.

## Abbruch während der Wartung

`backup.sh` legt vor dem Stopp die Markierung `<stack.env>.backup-stopped` an und entfernt sie erst nach bestätigtem Wiederanlauf. Abbruchsignale (INT, TERM, HUP) lösen denselben Wiederanlauf aus wie ein Fehler. Wird der Prozess hart beendet oder scheitert der Wiederanlauf, bleibt die Markierung stehen: `sh deploy/backup-recover.sh <stack.env>` startet dann App und Worker und entfernt sie. Ohne Markierung tut das Skript nichts, bewusst gestoppte Dienste bleiben aus. In der systemd-Vorlage läuft es als `ExecStopPost` nach jedem Ende des Dienstes.

## Zeitgesteuerte Sicherung (Vorlage)

`deploy/systemd/shownight-backup.service` und `.timer` sind **Vorlagen** mit Platzhaltern; nichts davon ist auf Netcup eingerichtet.
- Vorschlag: täglich 04:30 Uhr VM-Zeit mit bis zu 10 Minuten Zufallsverzögerung, verpasste Läufe werden nachgeholt (`Persistent=true`).
- Jeder Lauf unterbricht App und Worker für die Dauer von Dump und Medienarchiv (Wartungsfenster); während eines öffentlichen Ticketverkaufs ist die Uhrzeit neu abzustimmen.
- Einrichtung (durch Codex, nur nach Betreiberfreigabe): Platzhalter ersetzen, Dateien nach `/etc/systemd/system/` kopieren, `systemctl daemon-reload`, einmal manuell `systemctl start shownight-backup.service` und Ergebnis prüfen, erst dann `systemctl enable --now shownight-backup.timer`.
- Sichtbarkeit: `systemctl status shownight-backup.service`, `journalctl -u shownight-backup.service`, `systemctl list-timers`. Eine aktive Benachrichtigung bei Fehlern oder ausbleibenden Läufen ist **noch nicht** vorhanden.
- Weiter offen: externes Sicherungsziel (ein Ordner auf derselben VM ist kein externes Ziel), Aufbewahrung und Löschung, unabhängige Kennwortverwahrung, periodischer Restore-Nachweis.

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

Es wurde kein Cron-/Systemd-/Windows-Timer auf Produktivsystemen eingerichtet; die systemd-Dateien in `deploy/systemd/` sind nur Vorlagen. Vor Aktivierung: konkretes unabhängiges Sicherungs-/Kennwortziel, Aufbewahrung, Wartungszeit und Monitoring klären; erstmalige verschlüsselte externe Kopie plus isolierten Restore mit MFA/Dateihashes bestätigen. Fehlerstatus und ausbleibende Läufe müssen im festgelegten Monitor sichtbar sein. Ein Netcup-VM-Snapshot erfüllt diese Punkte erst nach konkreter Prüfung seiner Abdeckung und eines Restores.

## Tatsächliche Prüfungen

Lokal Windows x64: `node --test tests/backup-vault.test.mjs` 3/3 bestanden mit synthetischen Dump-/Medienbytes und Konfiguration. Verschlüsselter Dateierhalt, echte Wiederherstellung, falsches Kennwort, Manipulation, abgeschnittenes Archiv, ungültige Quelldatei und Erhalt vorhandener Ausgabe geprüft. Kein anderer realer Windows-Benutzer eingesetzt; profilunabhängiges Format nutzt ausdrücklich keine DPAPI. ACL-Tests außerhalb Sandbox mit privaten temporären Verzeichnissen durchgeführt. Kein Docker auf diesem Host: Linux-Runner, Fehler-/Wiederanlauf und vollständiger DB-/Medienrestore werden separat in CI geprüft. `tests/container-smoke.sh` führt dort Runner, verschlüsselte Sicherung, Entschlüsselung und tatsächlichen isolierten PostgreSQL-/Medienrestore durch. CI-Ergebnis erst nach tatsächlichem Lauf ergänzen.

CI-Nachweis Runtime `37c1d1045e1eded09f19e3c91490f4702b0e748d`: [S1 checks 38626408226](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38626408226) vollständig erfolgreich auf Windows sowie nativen AMD64-/ARM64-Linux-Runnern. Die drei Vaultprüfungen bestehen auf allen Plattformen; die zusätzliche Linux-Wartungsprüfung belegt Erfolg, Abweisung bereits gestoppter Dienste, Dump-/Stopfehler mit Wiederanlauf und Fehlerstatus bei fehlendem Wiederanlauf. Beide Linux-Containerabläufe führen den echten Wartungsrunner, verschlüsselte Sicherung, Entschlüsselung und isolierten PostgreSQL-/Medienrestore durch; Medienhashvergleich und anschließender Datenbankausfall/Wiederverbindung bestanden. Der [Server-Installerlauf 38626408257](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38626408257) ist ebenfalls erfolgreich. Auch der separate [Native-renderer-Lauf 38626408225](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38626408225) ist vollständig erfolgreich: nativer Build/Prozess, portables Server-/Rendererpaket und echter Renderer-Setup-Lebenszyklus. [Strukturierter Backupnachweis](nachweise/backup-vault.json). Reine nachfolgende Dokumentationscommits ändern diese Runtime nicht.

Offen: produktiver Zeitplan, automatisches Fehler-/Ausbleibemonitoring, externe Zustellung/30-Tage-Aufbewahrung, unabhängige Kennwortverwahrung, Providerumfang und periodischer realer Restore. F50/A17 und Issue #3 bleiben insgesamt offen.
