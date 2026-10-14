# S3 · Installationsanwendung für den Streaming-Rechner

Stand: 14. Oktober 2026. Betreiberanforderung: Das Anwenderpaket muss eine Windows-Installationsanwendung sein. Umsetzung auf Branch codex/s3-renderer-foundation, [PR #13](https://github.com/SchapfeldNils/ShowNight-System/pull/13), [Issue #12](https://github.com/SchapfeldNils/ShowNight-System/issues/12).

## Paket und Einrichtung

ShowNight-Streaming-Setup-x64.exe installiert für den aktuellen Windows-Benutzer unter %LOCALAPPDATA%\Programs\ShowNight\Streaming. Der deutsche Assistent legt Startmenüeinträge und auf Wunsch eine Desktopverknüpfung an. Der lokale HTTPS-Server, seine Weboberfläche und Node 24.19.0 sind gebündelt. Kein npm, Compiler oder SDK beim Anwender erforderlich.

Zwei ausdrücklich getrennte Buildstände: Der Workflow Streaming installer erzeugt das Server-Vorabpaket ohne Renderer. Der Workflow Native renderer erzeugt nach bestandenem nativen Build und den Rendererprüfungen das Paket mit Renderer. Installationshinweise.txt und build-info.json weisen den jeweiligen Umfang aus. Das Server-Vorabpaket ist kein vollständiges Streaming-/HDMI-/OBS-System. Auch der enthaltene Renderer bleibt zunächst reine Softwarediagnose.

Nach Installation die nummerierten Startmenüeinträge benutzen: einmaligen lokalen Server einrichten, ausdrücklich Serverschlüssel und rechnergebundenen Anmeldestand importieren, anschließend ShowNight Streaming starten. Die eigentliche Server-/Konteneinrichtung und Zertifikatprüfung stehen in Anleitung.md im Programmordner beziehungsweise [S3-Lokalserver](s3-lokalserver.md). Eine vorhandene Einrichtung nicht neu initialisieren. Der Start öffnet das Server-Konsolenfenster; Browser an der ausgegebenen HTTPS-Adresse öffnen. Server im Konsolenfenster mit Strg+C regulär beenden.

Setup startet keine Medienausgabe, verändert weder Zertifikatvertrauen noch Firewall und richtet keinen Windows-Autostart ein. Konten, Schlüssel, Pakete und Einrichtung bleiben unter %LOCALAPPDATA%\ShowNight, getrennt von den Programmdateien. Für das Rendererpaket zusätzlich kostenlose passende Microsoft-Visual-C++-v14-x64-Laufzeit und Windows-Schrift Arial erforderlich; siehe [Renderer-Anleitung](s3-renderer.md). Eine automatische Onlinepaarung oder grafische vollständige Ersteinrichtung gehört noch nicht zum vorhandenen Ablauf.

## Update und Deinstallation

Gleiche AppId und gleicher Benutzer erlauben ein Update über die bestehende Installation. Vorher den eigenen Server/Renderer regulär beenden. Setup und Uninstaller prüfen laufende Prozesse anhand des exakten installierten EXE-Pfads; sie beenden keine Anwendungen. Nicht verfügbare Prozessprüfung verhindert die Änderung.

Windows → Installierte Apps → ShowNight Streaming oder Startmenü → Deinstallieren entfernt die vom Installer verwalteten Programmdateien/Verknüpfungen. Die getrennten Benutzerdaten bleiben erhalten. Kein rekursives Löschen des ShowNight-Datenordners. Das Entwicklungspaket besitzt noch keine Herausgebersignatur; SHA256-Datei liegt neben der Setup-EXE.

## Build, Prüfungen und Grenzen

Buildrechner Windows x64 mit Inno Setup 6: pnpm build, pnpm server:package, pnpm streaming:installer. Für das Rendererpaket vorher den nativen Renderer bauen, prüfen und mit pnpm renderer:package bündeln; anschließend pnpm streaming:installer --renderer. Ergebnis: dist/streaming-installer/ShowNight-Streaming-Setup-x64.exe, SHA256 und build-info.json.

pnpm test:installer läuft ausschließlich mit CI=true auf einem isolierten Windows-Runner. Er prüft echte stille Installation in einen temporären Ordner mit Leerzeichen, gebündelte Node-Laufzeit, Startmenüziel, tatsächliche lokale DPAPI-Ersteinrichtung in einem getrennten synthetischen Profil, Updatesperre bei laufender eigener EXE, Update und Deinstallation mit erhaltenen Einrichtungsdaten. Ein vorhandener AppId-Registryeintrag verhindert den Test. Protokolle und Ergebnis stehen im Actions-Artefakt. Dies ersetzt weder einen interaktiven Betreibertest noch Streaming-/LAN-/Hardwareabnahme. Aktuellen tatsächlichen Prüfstand in status.md beachten.

Installerwerkzeug: Inno Setup 6, kostenlos nach [Inno Setup License](https://github.com/jrsoftware/issrc/blob/main/license.txt). Compiler nur im Build, keine Zusatzkosten/Compilerinstallation beim Anwender. Der offizielle [GitHub-Windows-Runner](https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-Readme.md) enthält Inno Setup; dessen tatsächlich verwendeter Versionsstand wird im Buildlog ausgegeben. Paketbibliothekslizenzen bleiben im Programmordner enthalten.
