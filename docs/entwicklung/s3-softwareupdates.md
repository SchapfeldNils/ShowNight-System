# Softwareupdates für den Streaming-Rechner – Issue #33

15\. Oktober 2026 · [Issue #33](https://github.com/SchapfeldNils/ShowNight-System/issues/33) · Entscheidung [D020](../planung/entscheidungen.md#d020--softwareupdates-für-den-streaming-rechner) · Umsetzung Claude, Review Codex. Setupquellen 0.3.12. Baut auf [#32 Server stoppen](s3-server-stoppen.md) auf.

## Ablauf

1. **Veröffentlichen (online, nur Admin mit MFA):** Diagnose → „Softwareupdates · Streaming-Rechner“ → Version (z. B. `0.3.12`) und `ShowNight-Streaming-Setup-x64.exe` aus dem geprüften CI-Artefakt wählen → „Veröffentlichen“. Der Server prüft, dass es eine Windows-Programmdatei ist, berechnet Größe und SHA-256 und signiert das Manifest mit seinem vorhandenen Offline-Signaturschlüssel. Die höchste veröffentlichte Version wird verteilt; „Zurückziehen“ entfernt eine Version.
2. **Prüfen und Herunterladen (Streaming-Rechner, automatisch):** beim Öffnen der Serveroberfläche und alle 6 Stunden im laufenden Server. Abruf von `https://<Onlineserver>/updates/v1/windows-x64/latest.json`. Heruntergeladen wird nur, wenn die Signatur zum importierten Serverschlüssel passt und die Version neuer ist; danach werden Größe und SHA-256 geprüft. Ablage: `%LOCALAPPDATA%\ShowNight\updates` (privat). Fehlerhafte oder unvollständige Downloads werden verworfen.
3. **Installieren (nur nach Bestätigung):** „Update installieren“ in der Serveroberfläche fragt nach, prüft Signatur und Datei erneut und fragt online, ob die Version noch aktuell ist (zurückgezogene Versionen werden nicht installiert). Danach startet das Setup; es beendet den eigenen Server geordnet (#32), ersetzt die Programmdateien und lässt Profil, Konten, Schlüssel und Pakete unverändert. Anschließend „ShowNight Streaming starten“ öffnen.

Ohne Internet oder bei nicht erreichbarem Onlineserver läuft die installierte Version unverändert weiter; die Oberfläche zeigt den Grund. Die Offline-Liveausführung hängt nicht von Netcup ab.

## Kommandos

`main.js update-check` (prüft und lädt geprüft herunter, installiert nie; JSON-Ausgabe), `main.js update-prepare` (erneute Prüfung vor der Installation). Ohne importierten Serverschlüssel: `not-configured`.

## Sicherheit und Restrisiko

- Gewählt: HTTPS plus Prüfsumme, keine eigene Betreibersignatur. Zusätzlich wird das Manifest mit dem bereits vertrauten Serverschlüssel signiert (keine neue Schlüsselverwaltung).
- **Restrisiko:** Wer die Netcup-VM oder ihren Schlüssel kontrolliert, kann ein falsches Update verteilen. Es gibt keine Authenticode-Signatur der Setup-Datei.
- Öffentlich abrufbar sind nur Manifest und Setup-Datei; das Repository ist ohnehin öffentlich. Upload und Zurückziehen nur für Admin mit MFA, Ursprungs- und CSRF-Prüfung.
- Ablage im vorhandenen Medienvolume (`software-updates/windows-x64/<Version>`), damit von der bestehenden Sicherung erfasst. Keine Datenbankmigration. Upload-Grenze: `MAX_UPLOAD_BYTES` (Standard 100 MB) und Nginx `client_max_body_size 101m`.

## Prüfungen

- `tests/updates.test.ts`: Versionsvergleich, Signaturprüfung (manipuliert, fremder Schlüssel, Zusatzfelder), kein Update, aktuell, offline, fremd signiert ohne Download, falscher Inhalt und abgeschnittene Datei verworfen, gültiger Download, keine erneute Übertragung, manipulierte Datei nicht vorbereitet, Aufräumen nach Installation, nur HTTPS, `version.json`.
- `tests/updates-integration.ts` (`pnpm test:updates`): Rechte (Mitglied, anonym, falsches CSRF), ungültige Versionen/Dateitypen/Größen, Veröffentlichen, doppelte Version, signiertes Manifest, Download, Pfadmanipulation, Ende-zu-Ende-Prüfung des lokalen Moduls gegen die echte API, ältere Version, Zurückziehen.
- `scripts/streaming-installer-test.mjs`: `version.json` = Setupversion, `update-check` ohne Serverschlüssel, Update-Schaltfläche anfangs gesperrt.

## Grenzen

- Kein echter Update-Durchlauf (Veröffentlichen auf Netcup → Download → Setup) auf dem Streaming-Rechner; das ist ein eigener, freigegebener Betriebsschritt.
- Kein Showbetrieb vorhanden; Schutz vor Unterbrechung ist die Bestätigung. Eine automatische Sperre während einer Show folgt mit #45.
- Ein Server aus 0.3.10 oder älter kennt keinen Updateweg; 0.3.12 muss einmalig manuell installiert werden.
