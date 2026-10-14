# Lokale KI fuer die ShowNight-Entwicklung

Stand: 14. Oktober 2026. Entwicklungswerkzeug nach ausdruecklichem Betreiberauftrag, keine Laufzeitabhaengigkeit der Showsoftware und kein Hardware-/Veranstaltungsnachweis.

Ollama 0.40.4 (MIT) und Qwen3 8B, Q4_K_M (Apache-2.0) werden kostenlos lokal eingesetzt. Offizielles Windows-amd64-Archiv: SHA256 `7485a1172f8527db4342a63521b9342fc466185ff0855da378cc864ecf6354cf`. Quellen: [Ollama-Release](https://github.com/ollama/ollama/releases/tag/v0.40.4), [MIT-Lizenz](https://github.com/ollama/ollama/blob/v0.40.4/LICENSE), [Qwen3-Modell](https://ollama.com/library/qwen3:8b), [Modellhersteller/Lizenz](https://huggingface.co/Qwen/Qwen3-8B). Die Lizenztexte/Metadaten im heruntergeladenen Herstellerbestand bleiben erhalten; keine Modelle oder GPU-DLLs in Git oder im ShowNight-Installer.

## Einrichtung und Start

Voraussetzungen dieses Rechners: Windows x64, PowerShell 7 fuer die Installation, RTX 3070 Laptop mit 8 GiB dediziertem VRAM, NVIDIA-Treiber 560.81, ca. 32 GiB RAM, Codex CLI 0.162.0-alpha.17.2. Windows zeigt zusaetzlich bis zu 15,9 GB gemeinsam genutzten Hauptspeicher, insgesamt 23,9 GB. Das sind keine 24 GB dedizierter Grafikspeicher. Reserve fuer Desktop und andere Programme einplanen. Download umfasst ca. 1,47 GB Laufzeit plus 5,2 GB Modell; entpackte Laufzeit/Cache benoetigen weiteren Platz. Windows-Speichererklaerung: [Microsoft](https://devblogs.microsoft.com/directx/gpus-in-the-task-manager/).

Einmal im Checkout mit diesen Werkzeugen:

```powershell
& .\scripts\local-ai\Install-ShowNightLocalAI.ps1
```

Daten liegen unter `%LOCALAPPDATA%\ShowNight\LocalAI`, ausserhalb von OneDrive. Keine maschinenweiten PATH-/Treiber-/Firewallaenderungen, kein geplanter Autostart. Nach Windows-Neustart startet der Aufruf unten den Server erneut. Bindung ausschliesslich `127.0.0.1:11434`, Cloudfunktionen mit `OLLAMA_NO_CLOUD=1` ausgeschaltet. Eine fremde bereits laufende Ollama-Instanz wird nicht ersetzt.

Modelldownload ist auf vier gleichzeitige IPv4-Verbindungen mit je 32-MiB-Abschnitten begrenzt. Fertige Abschnitte bleiben bei Netzwerkfehlern erhalten, Range-/Laengenpruefung und abschliessender Gesamt-SHA256 verhindern die Verwendung einer fehlerhaften Datei. Gepinnter Modellblob: `a3de86cd1c132c822487ededd47a324c50491393e6565cd14bafa40d0b8e686f`. Anschliessend ergaenzt Ollama das offizielle Manifest samt Lizenzmetadaten. Ein erneuter Installationsaufruf verwendet den bestehenden geprueften Laufzeitbestand. `-RefreshTools` kopiert lediglich aktualisierte Startwerkzeuge, ohne Server oder Modell zu ersetzen.

## Aus jedem ShowNight-Checkout verwenden

Die installierte Kopie ist unabhaengig vom Arbeitsbranch. Der andere Entwicklungschat kann dieselben Befehle aufrufen:

```powershell
$localAI = Join-Path $env:LOCALAPPDATA 'ShowNight\LocalAI\Invoke-ShowNightLocalAI.ps1'
& $localAI -Workspace (Get-Location).Path -Task 'Schreibe eine kurze deutsche Dokumentation zur gezeigten Funktion.' -ContextFile 'packages/contracts/src/transfer.ts'
& $localAI -Mode Review -Task 'Pruefe diese Funktion auf konkrete Randfallfehler. Gib keine pauschale Freigabe.' -ContextFile 'packages/contracts/src/transfer.ts'
```

In der Codex-Windows-Sandbox kann `LOCALAPPDATA` auf einen isolierten Ordner zeigen und Loopback gesperrt sein. Dort den absoluten installierten Pfad `C:\Users\nilss\AppData\Local\ShowNight\LocalAI\Invoke-ShowNightLocalAI.ps1` benutzen und den Shellaufruf mit der erforderlichen Hostfreigabe ausfuehren. Der Entwicklungschat darf eine verweigerte Hostfreigabe nicht umgehen.

`Draft`/`Review` uebertragen ausschliesslich Aufgabe und ausdruecklich ausgewaehlte versionierte Dateien an die Loopback-API. Keine automatische Repositorysuche. Maximal 14.000 Zeichen Eingabe, 8.192 Kontexttokens und 64 bis 2.048 Ausgabetokens (`-MaxTokens`, Standard 1.536). Die Zeichengrenze ist eine praktische Begrenzung, keine Garantie fuer jedes Tokenizerverhalten; grosse Dateien/Aufgaben gezielt aufteilen. `.env*`, `.local`, Geheimnis-/Schluessel-/Datenbankdateien sind nicht als Dateikontext zulaessig. Aufgaben selbst nur mit synthetischen Daten und ohne Zugangsdaten formulieren.

Ergebnis wird auf der Konsole und als ungepruefter JSON-Entwurf unter `.local/local-ai/results/` ausgegeben, einschliesslich lokaler Tokenzahlen und Ausgabegeschwindigkeit. Keine Datei wird automatisch geaendert oder ein Patch angewendet. Abgeschnittene Antworten sind als unvollstaendig markiert. Datei-/Git-/Testpruefungen erfolgen anschliessend durch den Entwicklungschat. Fehler wechseln niemals automatisch zu einem Cloudmodell.

Ein Windows-Mutex erlaubt nur einen Werkzeugauftrag gleichzeitig, auch aus mehreren Chats. Bei belegter GPU den Auftrag spaeter wiederholen. Auch direkte API-Nutzer muessen seriell arbeiten; sie umgehen den Werkzeug-Mutex. Nur das zuletzt benoetigte Modell bleibt maximal zwei Minuten geladen. Serverstart begrenzt Parallelitaet/geladene Modelle auf eins, Flash Attention und q8_0-KV-Cache fuer das 8-GiB-Profil.

## Codex CLI mit lokalem Modell

Optional fuer kleine begrenzte Aufgaben mit Dateizugriff:

```powershell
& $localAI -Mode Codex -ReadOnly -Task 'Lies nur die benannte Datei und erklaere ihre Eingabevalidierung.'
# Bearbeitung ausschliesslich im eigenen Arbeitsbranch/Checkout:
& $localAI -Mode Codex -Task 'Bearbeite die konkret beschriebene kleine Aufgabe im eigenen Arbeitsbranch.'
```

Codex startet mit `--oss --local-provider ollama --model shownight-local:8b`, einem separaten CODEX_HOME ohne OpenAI-Zugangsdaten, deaktivierten Plugins/Apps/Shell-Snapshots und ohne Websuche. Windows-Sandbox wird eingeschraenkt als `unelevated` konfiguriert; das Modell erhaelt keine Hosteskalation. Interaktiv bleibt die Werkzeugfreigabe aktiv; `-ReadOnly` setzt den lesenden Sandboxmodus. `-NonInteractive` nutzt `codex exec` mit JSON-Ereignissen und ist ausschliesslich lesend erlaubt. Schreibender Start auf main/master/ohne Arbeitsbranch wird abgewiesen. Keine Nutzung mit deaktivierter Sandbox. Bei Modell-/Werkzeuginkompatibilitaet den direkten Draft-/Review-Weg verwenden. Die dokumentierte [CLI-Unterstuetzung](https://learn.chatgpt.com/docs/developer-commands?surface=cli) ist keine Gleichwertigkeitszusage fuer lokale Modelle. Die aktuelle CLI kennt fuer das lokale Modell keine eigenen Metadaten und meldet deshalb eine Warnung; der explizite 8K-Kontext und die tatsaechlichen Werkzeugpruefungen sind davon getrennt.

AGENTS.md gilt fuer jedes Arbeitspaket weiter: eigener Branch/PR, Pflichtdokumente, deutsche UI, echte Nachweise und keine eigenstaendigen Merges. Lange Dokumente passen nicht gemeinsam in 8K. Der Entwicklungschat liest die Grundlagen und gibt kleine daraus abgeleitete Aufgaben an den direkten lokalen Entwurfsweg. Architektur, Rechte, Ausfallregeln, konkurrierendes GO, Sicherheitspruefungen und abschliessende Abnahme weiterhin gezielt mit staerkerem Modell und echten Tests behandeln. Ein lokaler Codex-Lauf ersetzt die Pflichtlekture nicht.

## Status, Speicher freigeben, beenden

```powershell
$server = Join-Path $env:LOCALAPPDATA 'ShowNight\LocalAI\ShowNightLocalAI.Server.ps1'
& $server -Action Status
& $server -Action Unload
& $server -Action Stop
```

`Status` zeigt Version und geladenen Modell-/VRAM-Stand, `Unload` gibt Modell-Grafikspeicher frei, `Stop` beendet nur den im eigenen PID-Bestand identifizierten ShowNight-Ollama-Prozess. Vor echten Renderer-/DJ-/Lasttests lokale KI entladen und beenden. Keine gemeinsame Leistungsfreigabe aus einem Modellrauchtest ableiten.

## Grenzen und Nachweise

Die tatsaechlich durchgefuehrten Installations-/GPU-/API-/Codex-Pruefungen stehen in [status.md](status.md). Ein kleines Modell kann falsche oder unvollstaendige Entwuerfe erzeugen. Eine konkrete Tokenersparnis wird erst ueber vergleichbare Entwicklungsaufgaben einschliesslich Nacharbeit nachgewiesen. Lokale Modellanfragen verbrauchen keine OpenAI-Modelltokens; Planung und Review in einem Cloudchat weiterhin schon. Builds und Tests bleiben unabhaengige lokale Werkzeuge, meist auf der CPU.

Nach eingerichteter Installation im Werkzeugcheckout pruefen:

```powershell
& .\scripts\local-ai\Test-ShowNightLocalAI.ps1
```

Die Rauchpruefung verwendet synthetische Rechen-/Schutzdaten und eine versionierte Quelldatei, prueft eine echte API-Antwort plus GPU-Speicher, verweigerten `.env`-Kontext, den prozessuebergreifenden Mutex sowie einen isolierten lesenden Codex-Werkzeugaufruf mit Markerabgleich. Ergebnisse werden lokal unter `.local/local-ai/acceptance.json` gespeichert. Keine ShowNight-Fachabnahme daraus ableiten; interaktive Codebearbeitung und komplexe Agentenaufgaben sind mit diesem Lesetest noch nicht praktisch freigegeben.
