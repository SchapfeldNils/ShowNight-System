# Lokaler KI-Pruefhelfer im Dauerbetrieb – DEV-KI-02

Stand: 14. Oktober 2026. Vom Betreiber beauftragt: kontinuierliche lokale Entwicklungsunterstuetzung und WhatsApp-Rueckmeldung nach jedem Auftrag. Getrenntes Entwicklerwerkzeug, keine neue ShowNight-Laufzeitfunktion. Voraussetzung: [lokale GPU-KI](lokale-ki.md), Windows, PowerShell 7, Node 24, Git, pnpm und vorhandenes Google Chrome. Kostenloser privater WhatsApp-Web-Zugang; keine kostenpflichtige Business-API oder Cloud-Modellanfrage.

## Arbeitsweise

Der Hintergrundprozess betrachtet den jeweiligen **gespeicherten HEAD** des konfigurierten ShowNight-Checkout. Laufende, nicht gespeicherte Aenderungen, unversionierte Dateien, Symlinks, versteckte Verzeichnisse und erkannte Geheimnisse bleiben ausserhalb des Modellkontexts. Er liest freigegebene Fachquellen, Tests und Entwicklungs-/Planungsdokumente mittels `git show`; Modellantworten haben keinen Werkzeug-, Shell- oder Schreibzugriff. Die Schutzmuster sind keine allgemeine Geheimniserkennung: das oeffentliche Repository muss weiterhin geheimnisfrei bleiben.

Auftraege entstehen aus begrenzten Quelltextabschnitten. Geaenderte Dateien zuerst, danach Renderer-/Transfer-/Vertragsquellen und Tests; die erste S-Paketueberschrift im aktuellen Entwicklungsstatus beeinflusst die Priorisierung. Die Suche alle fuenf Minuten nutzt Inhalts-Hashes: unveraenderte Abschnitte werden nicht staendig erneut geprueft. Maximal zwei Auftraege je Durchlauf, standardmaessig 120 Versuche pro Kalendertag in Europe/Berlin. Keine sinnlosen Wiederholungen bei leerer Warteschlange. Neue gespeicherte Aenderungen werden spaeter automatisch aufgenommen. Es gibt keine eigenstaendige Produktplanung oder automatische Umsetzung der Vorschlaege.

Modell: `shownight-local:8b`, 8.192 Kontexttokens, maximal 1.536 Ausgabetokens, Temperatur 0, JSON-Schema. Ein Auftrag umfasst hoechstens 110 Zeilen/7.500 Zeichen einschliesslich Platz fuer Zeilennummern; Dateien ueber 160.000 Bytes und einzelne ueberlange Zeilen werden ausgelassen. Maximal 1.200 Aufgaben im Zustand; bei grossen Bestanden werden weitere Dateien nach Abarbeitung aufgenommen. Bis zu 400 erledigte/fehlgeschlagene Aufgaben bleiben als Verlauf erhalten, der Bericht zeigt die letzten 60 Erfolge. Versandbelege und lokale Tokenzaehler bleiben getrennt erhalten. Unterschiedliche lokale Entwicklungsaufrufe teilen den bestehenden Windows-GPU-Mutex. Bei belegter GPU wartet der Hintergrundhelfer, ohne Cloudfallback.

Das Modell liefert maximal drei Fehlerkandidaten und zwei Testideen. Jeder Kandidat braucht ein wortgetreues Zitat auf der angegebenen Quelltextzeile. Unbelegte Hinweise werden verworfen; abgebrochene oder ungueltige Antworten sind Fehler. Auch ein geprueftes Zitat beweist keinen fachlichen Fehler. JavaScript wird nur dann mit `node --check --input-type=module` geparst, wenn ein ganzer Modultext im Auftrag enthalten ist; keine Ausfuehrung, keine Imports und keine Produkt-/Hardwareabnahme. Andere Sprachen werden nicht automatisch gebaut oder getestet. Maximal ein Wiederholungsversuch nach fuenf Minuten; jeder Versuch erzeugt seine eigene Rueckmeldung.

## Private WhatsApp-Verknuepfung

`whatsapp-web.js` 1.34.7 verwendet WhatsApp Web in einem separaten verborgenen Chrome-Profil, `LocalAuth` speichert die Sitzung. Diese Bibliothek ist **inoffiziell**; ihr Projekt warnt vor moeglichen Kontosperren. Die lokale QR-Seite zeigt diesen Hinweis vor der Verknuepfung. Es entsteht keine offizielle WhatsApp-API-Zusage. Falls dieser Weg nicht gewuenscht ist, nicht scannen und den Dienst stoppen. [Projekt und Hinweis](https://docs.wwebjs.dev/), [Sitzungsspeicherung](https://wwebjs.dev/guide/creating-your-bot/authentication.html).

Verbindung und Zielrufnummer liegen privat unter `%LOCALAPPDATA%\ShowNight\LocalAI\qa`, ausserhalb OneDrive und Git. Windows-Zugriff nur fuer aktuellen Benutzer und SYSTEM. Das separate Browserprofil kann im Rahmen von WhatsApp Multi Device auch Nachrichtenverlauf speichern; es wird weder an die lokale KI uebergeben noch als Auftragsquelle benutzt. Der Dienst registriert keine eingehenden Nachrichten als Befehle. Verknuepft wird ausschliesslich das Konto der Zielrufnummer; ein anderes Konto sperrt den Versand. Rueckmeldungen gehen somit in den eigenen WhatsApp-Chat, der auf den verknuepften Geraeten synchronisiert wird.

Eine zufaellige geheime URL zeigt den aktuellen QR-Code nur ueber `127.0.0.1` auf einem automatisch gewaehlten Port. QR/Sitzung niemals teilen oder versionieren. Die Seite aktualisiert den Code automatisch. URL/Port werden privat erhalten und bei Neustart wiederverwendet; `Connect` liefert den aktuellen Link. Ist der gespeicherte Port fremd belegt, startet keine zweite Instanz darauf. Am Handy: WhatsApp → Verknuepfte Geraete → Geraet hinzufuegen. Nach Verknuepfung sendet der Dienst zuerst eine Einrichtungsnachricht, dann Datei, Zeilenbereich, Commit, Zahl ungepruefter Kandidaten/Testideen und lokale Tokenzahlen je Auftrag. Keine rohen Quelltexte, Geheimnisse oder freie Modelltexte im WhatsApp-Bericht. Details im privaten `state\Bericht.md`.

Ohne verbundenes WhatsApp oder noch offene Rueckmeldung startet keine weitere Modellpruefung. Ein dauerhaftes Versandjournal verhindert absichtliche Doppelversendungen nach Neustart. `server_ack` bedeutet vom WhatsApp-Server bestaetigt; `delivered` erfordert den entsprechenden Zustellbeleg. Keiner der beiden Zustaende behauptet, dass der Betreiber die Nachricht gelesen hat. Ein unklarer Versand nach Absturz/Timeout wird nicht blind erneut gesendet: der Dienst wartet mit `versand_unklar`. Dann den eigenen Chat und das private Versandjournal gezielt pruefen; ohne Abgleich keine Nachricht als zugestellt markieren. WhatsApp-/Internetunterbrechungen koennen die Pruefschleife stoppen; eine garantierte dauerhafte Zustellung gibt es nicht.

## Installation und Bedienung

Die bereits vorhandene GPU-/Modellinstallation wird beibehalten. Der Installer kopiert nur QA-Werkzeuge, installiert die Hash-/Versions-gebundenen Pakete mit `pnpm install --prod --frozen-lockfile --ignore-scripts` und verwendet vorhandenes Chrome. Kein neuer Treiber, kein maschinenweiter Dienst, keine Firewall-/Energieaenderung. Mit `-AutoStart` entsteht der Benutzereintrag `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\ShowNightLocalQA`. Nach Windows-Anmeldung startet der Prozess verborgen und nimmt Zustand/Sitzung wieder auf. Windows muss wach und der Benutzer angemeldet sein; Schlafmodus/Pause werden nicht eigenstaendig verhindert.

Abhaengigkeitshaertung: der erste Audit fand drei hohe Meldungen in den unbenoetigten ZIP-/FTP-Hilfen von Puppeteer. `extract-zip` und `basic-ftp` wurden ueber lokale pnpm-Overrides vollstaendig durch kleine ablehnende Module ersetzt; die gemeldeten Bibliotheksimplementierungen werden nicht installiert. Diese Module lesen keine Archive und oeffnen keine FTP-Verbindung. Browserdownloads/ZIP-Extraktion/FTP sind absichtlich unmoeglich; deshalb vorhandenes Chrome zwingend. Das ersetzt keine allgemeine Sicherheitsfreigabe. [ZIP-Symlink-Meldung](https://github.com/advisories/GHSA-jmr9-qjv8-65gv), [FTP-Meldung](https://github.com/advisories/GHSA-c475-qrg2-pj4r). Der erneute Audit des so begrenzten Paketstands ist von einer upstream behobenen ZIP-Bibliothek zu unterscheiden.

Im Werkzeugcheckout:

```powershell
$runtime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$recipient = Read-Host 'Eigene WhatsApp-Rufnummer mit Laendercode'
& .\scripts\local-ai\Install-ShowNightLocalQA.ps1 `
  -RepositoryRoot 'C:\Pfad\zum\ShowNight-Checkout' -Recipient $recipient `
  -NodePath "$runtime\node\bin\node.exe" `
  -GitPath "$runtime\native\git\cmd\git.exe" `
  -PackageManagerPath "$runtime\node\node_modules\pnpm\bin\pnpm.cjs" `
  -ChromePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' -AutoStart
```

Aus jedem Entwicklungschat die installierten Werkzeuge verwenden:

```powershell
$qa = Join-Path $env:LOCALAPPDATA 'ShowNight\LocalAI\ShowNightLocalQA.ps1'
& $qa -Action Start
& $qa -Action Connect   # private URL im Browser oeffnen
& $qa -Action Status
& $qa -Action Pause     # laufenden Auftrag beenden lassen
& $qa -Action Resume
& $qa -Action Scan      # fortsetzen und neue Git-Staende sofort suchen
& $qa -Action Stop      # beendet diesen Lauf, Autostart bleibt konfiguriert
```

In der Codex-Sandbox den absoluten installierten Pfad benutzen und erforderliche Hostfreigabe beachten, wie in der [Grundinstallation](lokale-ki.md). Aktuellen GPU-Auftrag unterbricht `Stop`; der Zustand nimmt ihn spaeter wieder auf. `Pause` laesst einen laufenden Auftrag fertig werden. Vor echten ShowNight-Renderer-/DJ-/Lasttests QA stoppen und das Modell mit `ShowNightLocalAI.Server.ps1 -Action Unload` entladen. Cloud-Codex selbst bleibt cloudbasiert.

Parameter fuer groessere Nachtpruefungen: Dienst stoppen, `qa\config.json` privat auf `dailyTaskLimit` 1–120 und `scanIntervalSeconds` 60–86.400 einstellen, dann starten. Es bleibt bei zwei Auftraegen je Durchlauf. Grenzen nicht mit einer nachgewiesenen Modellqualitaet oder Cloud-Tokenersparnis verwechseln. `-RefreshTools` aktualisiert nach Stop nur Werkzeuge und erhaelt bestehende Konfiguration/Sitzung/Warteschlange. Autostart deaktivieren: zuerst `Stop`, dann `Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name ShowNightLocalQA`. Die WhatsApp-Sitzung kann zusaetzlich am Handy unter verknuepften Geraeten getrennt werden; private Daten werden nicht automatisch geloescht.

## Pruefungen und Grenzen

Tatsaechlich ausfuehrbare Entwicklerpruefungen, keine echten WhatsApp-Nachrichten in den Unitpruefungen:

```powershell
node --test scripts/local-ai/qa/core.test.mjs
node scripts/local-ai/qa/probe.mjs "$env:LOCALAPPDATA\ShowNight\LocalAI\qa"
git diff --check
```

`SHOWNIGHT_TEST_GIT` kann fuer die Unitpruefungen auf die absolute Git-EXE zeigen. Die GPU-Probe ist ein ausdruecklicher synthetischer Abnahmelauf, keine automatisch bearbeitete Produktaufgabe. Strukturierte Ollama-Antworten: [API](https://docs.ollama.com/api/chat), [JSON-Schema](https://docs.ollama.com/capabilities/structured-outputs).

Keine neuen F-/A-Freigaben, kein Netcup-Deployment, kein automatischer Commit/PR/Merge und keine Aenderung laufender ShowNight-Arbeitspakete. Der andere Entwicklungschat kann den privaten Bericht lesen und einzelne Kandidaten mit echtem Fach-/Testkontext nachvollziehen. Die konkrete Cloud-Tokenersparnis inklusive notwendiger Nacharbeit bleibt offen. Aktuelle Zielrechnernachweise stehen im [Entwicklungsstatus](status.md).
