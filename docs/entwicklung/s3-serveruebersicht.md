# Lokale Serverübersicht und Ein-/Ausgänge

14\. Oktober 2026 · [Issue #24](https://github.com/SchapfeldNils/ShowNight-System/issues/24) · F26/F28/F30/F47, A02/A17/A18. Softwarevorbereitung, keine Veranstaltungsfreigabe.

## Abschluss und tatsächliche Betreiberaktualisierung

Runtime `c0a1ec4`, [PR #25](https://github.com/SchapfeldNils/ShowNight-System/pull/25): [S1 Windows/AMD64/ARM64](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38633837969), [Server-Installer](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38633837359) und [nativer Renderer einschließlich vollständigem Installer](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38633837343) erfolgreich. Erster nativer Versuch lief vor der eigentlichen nativen Prüfung in das bestehende 10-Sekunden-Zeitlimit des Windows-Schlüsselablagehelfers; unveränderte Wiederholung erfolgreich (5/5 nativ, 6/6 mit portablem Paket). Kein Absenken von Prüfungen oder Schlüsselschutz. Lokaler zusätzlicher Offlineversuch bestand acht Unterfälle, konnte seinen festen HTTPS-Port neben dem laufenden Hostdienst nicht nutzen; derselbe portable/TLS-Ablauf in isolierter Windows-CI vollständig bestanden.

Setup 0.3.8 mit Renderer tatsächlich heruntergeladen, Archiv- und Setuphash bestätigt, im vorhandenen benutzerdefinierten Programmordner installiert (Exit 0). Vorher Programmstand sowie vier Profil-/Zertifikatsdateien und zwei konsistente SQLite-Onlinekopien privat gesichert; keine vollständige Mediendatensicherung behauptet. Eigener vorher gestarteter Hintergrunddienst anhand PID/EXE/Startzeit/Modus und exklusivem Listener identifiziert, regulär mit SIGINT beendet. Privater eng begrenzter Helfer vorher mit getrennten synthetischen Prozessen geprüft; zusätzliche Konsolenprozesse verhindern jedes Signal. Kein erzwungener Stopp/fremder Prozess. Stopp 20:58:24 UTC, neuer Prozess 20:59:44 UTC; HTTPS danach bestätigt. Ein Operator-Prüfaufruf mit Node `-e` scheiterte an dessen Modulinterpretation und wurde vor dem Start durch eine explizite `.mjs`-Datei ersetzt; kein Profil-/Runtimefehler und keine Datenänderung daraus.

Installierte main.js identisch mit dem CI-Paket; vier Profilhashes, Kontoidentitäten, vorbereiteter Anmeldestand, Paketindex und beide SQLite-Schemata (1) unverändert. Server läuft im Modus `run-renderer`, bestehende Browseranmeldung weiterhin gültig, tatsächliche Übersicht mit verbundenem Renderer und erkanntem Inventar geprüft. Native Windows-Oberfläche geöffnet, laufender Fenstertitel bestätigt. Zertifikatvertrauen/Firewall und Online-Server unverändert; Mail und physische Ausgabe aus. Private Betriebsnachweise unter `%LOCALAPPDATA%\ShowNight\operations\local-ui-update-20261014`, Setup zusätzlich unter `%USERPROFILE%\Downloads\ShowNight-0.3.8`. [Strukturierter Nachweis/Prüfsummen](nachweise/s3-serveruebersicht.json). PR nicht gemergt. Nachfolgende Angaben zur zunächst offenen CI/Auslieferung beschreiben den Entwicklungsverlauf.

## Bedienung

Ab Setupquellen 0.3.8 öffnet **ShowNight Streaming starten** die Windows-Oberfläche auch vor der Einrichtung. Sie zeigt tatsächliche Daten-/Paketpfade und fehlende Vorbereitungsschritte. **Status aktualisieren** liest Vorbereitung und prüft getrennt den HTTPS-Dienst gegen eingerichtetes Zertifikat und erwartete Healthantwort. **Server starten** öffnet nach bestandener Vorprüfung ein eigenes Serverfenster. Dort mit Strg+C regulär beenden. Nach einigen Sekunden aktualisieren, dann **Server im Browser** wählen. Das Schließen der Übersicht beendet keinen laufenden Server. Datenordner und Anleitung sind direkt erreichbar.

Nach Anmeldung/MFA sehen nur Systemadministratoren **Lokaler Server**: Dienstadresse/Startzeit/HTTPS, Paketanzahl/Anmeldestand, Renderer sowie aktive Windows-Displays und Audioendpunkte. Abfrage beim Öffnen und bewusst per Schaltfläche; nach 30 Sekunden als alt markiert. Bei Fehler bleiben frühere Angaben ausdrücklich unbestätigt. Kein Abspielen, Aufnehmen, Zuordnen oder Befehlsreplay durch die Anzeige.

`status` zeigt Benutzerkontext und effektives `LOCALAPPDATA`; `status-json` liefert zusätzlich `listener`. Fehlendes Profil an einem anderen Pfad bedeutet nicht Löschung des ursprünglichen Profils. Sandboxen können `LOCALAPPDATA` umleiten. Fehlend, unzugänglich und falscher Dateityp werden unterschieden. Keine automatische Umleitung zum Host, erneute Einrichtung, Zertifikat-/Firewalländerung oder Windows-Autostart.

## Architektur, Voraussetzungen und Grenzen

Bestehende React-/Fastify-Architektur bleibt bestehen. Launcher: vorhandenes Windows PowerShell 5.1/.NET Windows Forms, keine neue Bibliothek oder Kosten. Prozessbezogenes RemoteSigned ändert keine dauerhafte Richtlinie und überschreibt keine Unternehmensrichtlinie. UTF-8-BOM für PowerShell 5.1. Vorläufige Gestaltung wegen fehlender Originaldesignquellen. Bestehende Komponenten-/Inno-Setup-Lizenzen und gepackte Lizenzdateien unverändert.

`GET /api/local/server-status`: bestehende Admin-/MFA-Sitzung vor und nach Betriebssystemabfrage prüfen, `Cache-Control: no-store`, keine privaten Pfade, Kennungen, Konten oder Rohfehler. Nur der lokale Launcher zeigt dem Windows-Benutzer den eigenen Datenpfad.

DisplayConfig `QDC_ONLY_ACTIVE_PATHS` liefert aktive Ziele, keine vollständige Liste freier Buchsen. CoreAudio liest aktive eRender/eCapture-Endpunkte/FriendlyName im schreibgeschützten PropertyStore. Fester eingebetteter C#-Quelltext/fester PowerShell-Bootstrap, keine Browserdaten in Shellcode. Keine Stream-/Geräteaktivierung oder Mixeränderung. 12 Sekunden, 128 KiB und 64 Geräte je Gruppe als Grenzen; gemeinsame laufende Probe und 30-Sekunden-Cache mit eigenem Erkennungszeitpunkt. Fehler/ungültige Daten ergeben unbestätigte Verfügbarkeit, Rohstderr wird verworfen. Kameras ausdrücklich noch nicht erkannt/unterstützt.

Erkannt bedeutet weder ShowNight-Zuordnung noch frei/belegbar, treibergeprüft oder tatsächlich nutzbar. HDMI/Bühnenmonitor, Publikumston/Vorhören, Aufnahme und Programmausgabestream bleiben ohne nutzbaren Adapter. Rendererdiagnose stumm/ohne physische Ausgabe. Keine geänderten Rechte, GO-, Ersatz- oder Ausfallregeln. Reale Mehrclient-/Hardware-/Dauerbetriebsabnahme bleibt offen.

## Tatsächliche Prüfungen und Protokoll

```powershell
pnpm install --frozen-lockfile --offline
pnpm typecheck
pnpm build
node --import tsx --test --test-timeout=90000 tests/*.test.ts
node --import tsx --test tests/server-overview-browser.ts
pnpm server:package
```

27/27 Units auf freigegebenem Windows-Host bestanden: unter anderem Startup 6/6, IO 5/5 und API-/Rendererrechte. API: 401/403, Sitzungswiderruf während wartender Probe, no-store, verborgene private Fehler. Browser 4/4 mit synthetischen Daten: Desktop/Mobil visuell geprüft, nur GETs, Nichtadmin ohne Diagnoseabfrage, alter Stand, Verbindungsfehler und bewusste Erholung. Build/Windows-Paketbau bestanden. Sandboxlauf wegen Prozess-/ACL-Beschränkungen beendet; Hosttests mit getrennten synthetischen TEMP-Profilen. Vorhandene GO-/Reconnect-Nachweise bleiben maßgeblich; diese Pfade nicht geändert.

Tatsächliche PowerShell-5.1-Oberflächenkonstruktion mit leerem Testprofil: Unicode-Titel, getrennte Pfade, fehlendes Profil und gesperrter Start/Browser bestanden. Unabhängiges Subagentenreview fand zuvor Encoding-/Arraypräzedenzfehler; korrigiert und im isolierten Installertest abgesichert. `pnpm test:installer` ausschließlich in isolierter Windows-CI: Installation, Oberfläche, Startmenü, Updatesperre und Datenerhalt. Gesamt-CI/Auslieferung erst nach tatsächlichem Abschluss ergänzen; Quellversion ist kein ausgeliefertes Setup.

Echte lesende Hostprobe: ein interner Bildschirm 1920×1080, zwei Audioeingänge, drei Audioausgänge; keine Namen/IDs öffentlich protokolliert, nichts aktiviert. Neues gebautes `status-json` gegen vorhandenen Host: `ready=true`, `listener=alive`, `https://localhost:3443`, korrekter Hostdatenpfad. Installierter Dienst weiterhin 0.3.7. Frühere kurze Startprobe war zu knapp, späterer HTTPS-Nachweis erfolgreich. Der damalige Startkontext des Betreibers ist nicht rückwirkend bewiesen; keine Neuinitialisierung nötig.

Gewünschtes LocalAI-Skript am angegebenen Hostpfad und bekannten ShowNight-Werkzeugstandorten nicht vorhanden; kein lokales KI-Review behauptet. Drei Subagents implementierten getrennte Bereiche, Root integrierte/testete; zwei unabhängige Agentenreviews. Kein Merge oder Online-Produktivupdate.

## Primärquellen

- [Microsoft QueryDisplayConfig](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-querydisplayconfig)
- [Microsoft DISPLAYCONFIG_TARGET_DEVICE_NAME](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-displayconfig_target_device_name)
- [Microsoft EnumAudioEndpoints](https://learn.microsoft.com/en-us/windows/win32/api/mmdeviceapi/nf-mmdeviceapi-immdeviceenumerator-enumaudioendpoints)
- [Microsoft CoreAudio Device Properties](https://learn.microsoft.com/en-us/windows/win32/coreaudio/device-properties)
- [Microsoft-Quelle für Collection-IID](https://github.com/microsoft/psi/blob/master/Sources/Audio/Microsoft.Psi.Audio.Windows/ComInterop/Guids.cs)
