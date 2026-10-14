# Netcup: Sicherungsablauf härten

15. Oktober 2026 · Issue #3 · F50/A17 · `codex/netcup-backup-hardening`, Basis PR #22 / `e0c94d7f7365a6971d0d63a3cbbe154e008a4e0b`. Eigener Folge-PR, kein produktiver Sicherungsjob.

## Korrekturen

Der bisherige direkte Stream unter dem endgültigen Archivnamen konnte bei Prozessabbruch eine unvollständige `.snbackup` hinterlassen. Der Vault schreibt jetzt eine exklusive Datei mit zufälligem `.partial-…`-Suffix im gleichen Zielverzeichnis, ergänzt den GCM-Tag, synchronisiert und schließt die Datei. Erst dann veröffentlicht ein exklusiver Hardlink das vollständige Archiv. Ein bestehender Zielname, einschließlich Symlink, wird nicht ersetzt. Erfolg und abgefangene Fehler entfernen ausschließlich die eigene Teildatei. Format SNBACKUP1/AES-256-GCM/scrypt und Entschlüsselung bleiben unverändert; keine neue Abhängigkeit oder Lizenz.

Das Zielfilesystem muss Hardlinks im selben Verzeichnis unterstützen, etwa ext4 auf der VM oder NTFS unter Windows. Keine unsichere Rename-/Kopierausweichlösung. SIGKILL/Stromausfall kann eine private `.partial-…` hinterlassen; solche Dateien sind keine fertigen Archive. Erst die vollständige, synchronisierte Datei erhält den finalen Namen. Keine zusätzliche Zusicherung gegen Dateisystem-/Hardwareverlust oder zur Persistenz des Verzeichniseintrags bei Stromausfall; externe Kopie und tatsächlicher Restore bleiben erforderlich. Ziel-/Stagingverzeichnisse müssen privat sein.

Der Linux-Runner prüfte bisher nur die Existenz der Kennwortdatei. Node öffnet sie jetzt mit `O_NOFOLLOW | O_NONBLOCK` und prüft am geöffneten Deskriptor: reguläre Datei, Eigentümer gleich ausführender UID, Modus exakt 0400 oder 0600. Symlink, FIFO, Verzeichnis und andere Berechtigungen werden vor jeder Docker-/Wartungsaktion abgewiesen. Der geprüfte Deskriptor wird bis zum Vault weitergereicht; Pfadersetzung während der Sicherung ändert das verwendete Kennwort nicht. Keine Kennwortinhalte in Argumenten oder Logs. Der Runner bleibt ausschließlich für Linux vorgesehen. Keine zusätzliche Komponente neben dem bereits vorausgesetzten Node 24, Docker Compose und flock.

## Benutzung und Nachweise

Aufruf und isolierter Restore wie in [Sicherungsbetrieb](backup-betrieb.md). Kennwortdatei im privaten Verzeichnis als eigener Benutzer mit Modus 0400/0600 vorbereiten; keine echten Zugangsdaten in Repository/Chat. `pnpm test:backup` prüft Vault und unter Linux den Runner. Unter Windows werden die beiden Linux-Tests ausdrücklich übersprungen.

Neue Vaultregression lokal Windows x64/Node 24.19.0: 6/6 bestanden. Vor Korrektur reproduzierte der Prozessabbruchtest den vorzeitig sichtbaren finalen Namen. Kontrollierter echter Subprozessabbruch nach tatsächlich geschriebenen verschlüsselten Bytes, ohne Sleeps oder Produktionshooks; konkurrierende Schreiber mit genau einem authentifizierbaren Gewinner, bestehende Ziele, Roundtrip und Bereinigung nach Streamfehler geprüft. Linuxkontrolltests für unsichere Modi, Symlink/Verzeichnis/FIFO, sichere Modi und Pfadersetzung implementiert; tatsächlicher Linuxlauf und vollständige CI noch ausstehend. Unabhängiger vollständiger Code-/Testreview ohne bestätigte Befunde. Abschließender CI-/Dokumentationsreview folgt.

## Betriebsgrenzen und Übergabe

Keine Änderung des bestehenden Checkouts, installierter lokaler Dienste, Netcup-Dienste, Timer, Produktivkonfiguration oder Rechte. Kein Merge/Update und kein echter Mail-/Geräteaufruf. Unabhängiger Sicherungsort, Kennwortverwahrung, Aufbewahrung, Überwachung und tatsächlicher Provider-/Produktivrestore bleiben offen. Issue #3 und F50/A17 insgesamt bleiben offen.

Diese Basis enthält die getrennte Worker-Korrektur aus PR #34 nicht. Für die spätere Onlinekonsolidierung beide Korrekturen bewusst in einen vollständigen Releasekandidaten integrieren und dessen Backup/Restore/Migration/Rückkehr prüfen. Keine unmittelbare Produktivfreigabe aus einem isolierten CI-Erfolg.