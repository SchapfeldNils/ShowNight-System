# S1 starten und bedienen

Stand: 9. Oktober 2026. Entwicklungszwischenstand, keine Veranstaltungsfreigabe. Nachweise: [status.md](status.md). Node.js 24, pnpm 11.25.0; installierte Versionen sind durch `pnpm-lock.yaml` festgelegt.

## Frischer lokaler Checkout

```sh
git clone https://github.com/SchapfeldNils/ShowNight-System.git
cd ShowNight-System
git switch feat/s1-online-server
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm local:setup
pnpm local:db
```

`local:setup` schreibt einmalig eine ignorierte `.env` mit zufälligem DB-Kennwort und MFA-Schlüssel sowie Pfaden zu den ausschließlich für Entwicklung installierten Medienwerkzeugen. Keine vorhandene Konfiguration wird überschrieben. `local:db` startet PostgreSQL 17.9 ausschließlich auf `127.0.0.1:55432`. Daten bleiben unter `.local/postgres`. Der native Entwicklungsstarter ist noch kein Windows-Installer oder S3-Offlinebetrieb. Datenbankverzeichnisse möglichst außerhalb synchronisierter Laufwerke betreiben; `local:db` ist nur eine lokale Entwicklerhilfe.

In einem zweiten Terminal:

```sh
pnpm db:migrate
```

Ein persönliches Erstkennwort von mindestens zwölf Zeichen und einen eigenen Login setzen. PowerShell-Beispiel ohne festes Kennwort:

```powershell
$env:BOOTSTRAP_LOGIN = Read-Host 'Admin-Login'
$env:BOOTSTRAP_NAME = Read-Host 'Anzeigename'
$secret = Read-Host 'Persönliches Erstkennwort' -AsSecureString
$env:BOOTSTRAP_PASSWORD = [System.Net.NetworkCredential]::new('', $secret).Password
pnpm admin:bootstrap
Remove-Item Env:BOOTSTRAP_PASSWORD
pnpm demo:seed
pnpm build
pnpm dev
```

In einem dritten Terminal `pnpm worker` ausführen. Dann `http://localhost:3000` öffnen. Beim ersten Login den einmalig angezeigten Schlüssel in einer Authenticator-App einrichten, Code bestätigen und Wiederherstellungscodes außerhalb der App sichern. Vor erfolgreicher MFA erhält das Erstkonto keine Sitzung. Bootstrap ist ausschließlich eine Host-CLI und wird in einer gesperrten DB-Zeile dauerhaft abgeschlossen.

Der Worker prüft Originaldateien; ohne Worker bleibt der Zustand `processing`. `pnpm demo:seed` erzeugt nur synthetische Veranstaltung/Show/Team/Bilddatei und ist wiederholbar. Keine fremden Geräte, Empfänger oder Bühnenausgänge werden kontaktiert. `pnpm dev:web` ist optionaler Vite-Entwicklungsbetrieb: `PUBLIC_BASE_URL=http://localhost:5173` in `.env` setzen, API und Worker neu starten; Vite reicht HTTP/WS auf Port 3000 weiter. Für den geprüften Standardablauf verwenden wir den Produktionsbuild auf Port 3000.

## Nutzbarer Ablauf

1. Veranstaltung mit nur einem Namen anlegen. Vorlage ist ShowNight, Spieleabend oder eigene Veranstaltung; Datum/Ort später ergänzen. Übersicht zeigt offene Einrichtungsschritte.
2. Unter **Teams & Rechte** neues/bestehendes Team zuordnen. Konto über einen persönlichen, einmaligen Einrichtungslink anlegen. Keine E-Mail wird dadurch versendet. Mitglieder und Eventrollen sichtbar zuweisen.
3. Unter **Shows** unabhängige Show vorbereiten: Beschreibung, geordnete Einsätze, Auslösehinweise, Notizen, Aktivierung und Medienreferenzen. Texte in S1 ausdrücklich speichern.
4. Originalmedien direkt im Showbereich hochladen. Erkanntes Dateiformat, Speichergröße, SHA-256 und Analysezustand prüfen. Datei bleibt bis zur erfolgreichen Prüfung nicht bereit.
5. Show **als Eventkopie aufnehmen**. Quelle und Kopie erhalten getrennte Revisionen; Einsätze neue IDs. Dateien werden unverändert referenziert, keine Sitzungen oder Laufzustände kopiert. Team zur ganzen Eventshow zuordnen.
6. Parallel dieselbe Beschreibung ändern: erster gültiger Schreibzugriff gewinnt; andere Fassung bleibt im Konfliktdialog sichtbar. Bewusst aktuellen Stand übernehmen, weiter bearbeiten oder eigene Fassung als neue Revision speichern.
7. Übersicht → **Paketmanifest erzeugen**. Event-/Showrevisionen und Originaldateiprüfsummen sind gepinnt. JSON herunterladen und Dateien erneut prüfen. Dieses S1-Manifest ist noch kein vollständiges Offlinepaket mit Konten/Schriften/Renderer; `liveActivationSupported=false`.
8. Diagnose zeigt ausschließlich simulierte Profile dj/light/main und reale Fähigkeiten als unbekannt/nicht unterstützt. Synthetischer Mailauftrag bleibt dauerhaft in der DB und wird vom Worker als `simulated` markiert.

## Prüfungen

Linux ARM64 benötigt ein natives FFprobe, etwa aus dem Distributionspaket `ffmpeg`: `sudo apt-get install ffmpeg`. `local:setup` nimmt einen verfügbaren gebündelten FFprobe-Pfad, andernfalls `ffprobe` aus PATH; `FFPROBE_PATH` kann den Pfad ausdrücklich setzen. In ARM64-Actions wird `/usr/bin/ffprobe` verwendet. Produktionscontainer enthalten FFprobe/FFmpeg für ihre eigene Architektur.

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:browser
pnpm audit --prod
pnpm licenses:inventory
```

Integrationstests brauchen unbenutzte Ports 55433/55434 und PostgreSQL-17-Clientprogramme. Linux: standardmäßig kommen die Clients aus `postgres:17.9-bookworm` über Docker mit Hostnetz; alternativ `PG_BIN_DIR` auf einen vorhandenen PostgreSQL-17-Clientpfad setzen. Windows: `powershell -File scripts/install-pg-clients.ps1` lädt das festgelegte EDB-Archiv, prüft SHA-256 und extrahiert ausschließlich Werkzeuge nach `%LOCALAPPDATA%/ShowNight/tools`. Es installiert keinen Systemdienst. `PG_BIN_DIR` kann einen vorhandenen Clientpfad ersetzen. Tests erzeugen isolierte Datenbanken mit zufälligen Kennwörtern; Testverzeichnisse verbleiben ignoriert unter `.local/tests` zur Diagnose. Browser-Screenshots liegen unter `test-results`.

## Konto wiederherstellen

Screenshots aus dem synthetischen, bestandenen Browserablauf: [Übersicht](screenshots/s1-uebersicht.png), [Revisionskonflikt](screenshots/s1-konflikt.png), [Mobilansicht](screenshots/s1-mobile.png). Sie dokumentieren den S1-Zwischenstand.

Ein Wiederherstellungscode kann anstelle des TOTP-Codes verwendet werden und wird atomar verbraucht. Bei Verlust aller Codes und des Authenticators braucht ein autorisierter Hostadministrator einen dokumentierten Eingriff:

```powershell
$env:RECOVERY_CONFIRM = 'RESET_MFA_AND_SESSIONS'
$env:RECOVERY_LOGIN = Read-Host 'Login'
$secret = Read-Host 'Neues persönliches Kennwort' -AsSecureString
$env:RECOVERY_PASSWORD = [System.Net.NetworkCredential]::new('', $secret).Password
pnpm admin:recover
Remove-Item Env:RECOVERY_PASSWORD
Remove-Item Env:RECOVERY_CONFIRM
```

Alle Sitzungen/Challenges des Kontos werden widerrufen. Nächster Login erfordert neue MFA-Einrichtung, bevor Admin/Leitung Zugriff erhält. Hostzugriff ist der Vertrauensanker; kein öffentlicher MFA-Reset-Endpunkt. Eingriffe organisatorisch mit Zeitpunkt, verantwortlicher Person und Grund protokollieren, niemals mit Kennwort/Codes. Verlust des Verschlüsselungsschlüssels ist kein regulärer Reset: Schlüssel aus getrennt geschützter Sicherung wiederherstellen.
