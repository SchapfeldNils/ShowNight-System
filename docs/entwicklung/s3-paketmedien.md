# S3-05 · Paketmedien im nativen Renderer

Stand: 14. Oktober 2026. Branch codex/s3-package-renderer, [Issue #15](https://github.com/SchapfeldNils/ShowNight-System/issues/15), auf PR #13 aufgebaut. Umsetzung und Prüfungen sind getrennt; nativer Nachweis für dieses Paket noch offen.

## Nutzbarer Teilablauf

Nach Einrichtung des lokalen Servers und ausdrücklichem Import eines passenden Anmeldestands/zugehöriger Inhaltspakete mit dem lokalen Admin und MFA anmelden. Setup/Start mit Renderer verwenden. Unter „Vorbereitete Inhaltspakete“ ein Paket ansehen. In „Medienprozess · Softwarediagnose“ ein Paketmedium wählen und „Paketmedium vorbereiten“ auslösen. „Diagnosebilder aktualisieren“ zeigt native Standbilder. Erst „Diagnosebild übernehmen“ übernimmt das Medium im getrennten Diagnoseprogramm.

Unterstützter erster Teilumfang: PNG bis 32 MiB, maximal 4096 × 4096 Pixel, und WebM mit VP8 bis 32 MiB und 1920 × 1080 Eingangspixeln. Video wird stumm auf die kleine Diagnosefläche skaliert. Kein allgemeiner MP4-/JPEG-/Audio-/Codecbeleg. Paketvideo endet auf seinem letzten Diagnoseframe, ohne automatischen Loop/Folgeeinsatz; dies ist ausschließlich Diagnoseverhalten und keine Produktentscheidung über konfigurierbare Videoendregeln. Synthetisches bisheriges Testvideo behält seinen gekennzeichneten Diagnoseloop.

Das vorhandene Paketformat enthält Shows, Einsätze und Medienreferenzen, noch kein vollständiges Szenen-/Ebenenmodell. Dieses Paket lädt ein einzelnes verifiziertes Paketmedium. Es aktiviert kein Showpaket, erstellt keinen vollständigen Szeneneditor und führt keinen Show-GO aus. Auch Vorschau bleibt hier eine globale technische Admin-Diagnose; persönliche Regievorschau nach D011 bleibt offen. Native Fläche weiterhin 640 × 360; keine HDMI-/Ton-/Streamingausgabe.

## Dateien, Bindung und Protokoll

HTTP POST /api/local/renderer/package-media akzeptiert nur commandId, expectedRevision, action=prepare-package, packageId und mediaId. Keine Browserpfade/URIs, keine frei gewählten Metadaten oder Codecs. Gleiche technische Admin-/MFA-Rechte wie S3-04 plus aktuelle Paketbindung/Veranstaltungsrechte. Das Inhaltspaket selbst besitzt SHA256; seine Zuordnung wird über den separat signierten Kontenstand gebunden. Origin/CSRF und aktuelle Sitzung gelten weiterhin.

Der Server löst die Paketdatei auf. Der Controller kopiert ausschließlich eine reguläre Datei innerhalb der Paketablage in seinen privaten Sitzungsordner. Dateigröße/SHA256 werden aus demselben geöffneten Deskriptor beim Kopieren geprüft. guard prüft Sitzung und Paketbindung erneut vor/nach asynchronen Dateiarbeiten und nach der Warteschlange unmittelbar vor IPC. Native Seite akzeptiert nur UUID-basierte lokale Eingaben, prüft Größe/Hash/Signatur selbst und hält einen Windows-Readhandle ohne Schreib-/Löschfreigabe während der Verwendung. Keine Laufzeitnachladung aus downloadPath.

Native Vorschau/Programm pinnen jeweils die tatsächliche verifizierte Kopie. Eine Änderung der ursprünglichen Paketdatei ersetzt eine bereits geladene Diagnose nicht. Neuer Ladevorgang muss erneut erfolgreich prüfen. Neue temporäre inputId ist kein fachlicher Befehlsinhalt: Deduplizierung vergleicht commandId und stabile Paket-/Medien-/Hash-/Revisionsdaten; gleicher Befehl spielt nichts erneut ab. Fehlgeschlagene Vorbereitung belässt bestehende Kanäle. Bei unbekanntem Transportergebnis keine automatische Wiederholung.

Maximal vier private Eingabedateien, jeweils höchstens 32 MiB, je Prozess. Bestätigte Referenzen und native Dateisperren schützen noch verwendete Kopien; nicht mehr benötigte eigene Dateien werden bereinigt. Nach unbekanntem Ergebnis bleiben Dateien bis zur bestätigten Zustandabfrage erhalten. Flüchtige Diagnosejournale bleiben auf 1024 Receipts begrenzt. Dies ist kein persistentes S4-Ausführungsjournal.

Protokoll 1 erweitert die bestätigte Fähigkeit packageMediaSupported; ältere Renderer melden sie nicht und erhalten keine Paketmedienaufträge. Szene meldet optionale packageMedia mit Paket-/Medien-/Manifest-/Dateihash, MIME, Größe und inputId sowie ended. inputId ist ein Ressourcenbezug, kein Pfad oder Zugangsschlüssel. Dateiende löst keine Fachaktion aus.

## Kostenlose Voraussetzungen

Weiter C++/GStreamer/Skia. PNG wird über den im vorhandenen Windows enthaltenen Microsoft-WIC-PNG-Decoder aus geprüften Speicherbytes decodiert und durch Skia dargestellt. Keine zusätzliche npm-Bibliothek oder gekaufte Komponente. WIC bleibt eine Windows-/Windows-SDK-Voraussetzung. WebM verwendet die vorhandenen GStreamer-Plugins mit festem VP8-/Appsink-Weg; keine automatisch gewählten URI-/Audio-/Bildschirmsinks. Legacy-/versionierte Pluginpfade sind auf gebündelte Plugins gesetzt.

Primärquellen: [Microsoft WIC-Streamdecoder](https://learn.microsoft.com/en-us/windows/win32/wic/-wic-decoder-howto-createusingstream), [WIC-Formatkonvertierung](https://learn.microsoft.com/en-us/windows/win32/api/wincodec/nf-wincodec-iwicformatconverter-initialize), [GStreamer VP8](https://gstreamer.freedesktop.org/documentation/vpx/index.html), [Videoscale](https://gstreamer.freedesktop.org/documentation/videoconvertscale/videoscale.html).

## Prüfungen und lokale KI

Ausführbare Befehle: pnpm typecheck, pnpm test, pnpm build. Native Windows-CI: pnpm renderer:build, pnpm test:renderer, pnpm renderer:package und erneutes test:renderer mit RENDERER_TEST_PORTABLE=true, anschließend pnpm streaming:installer --renderer und pnpm test:installer.

Softwareprüfungen ergänzen tatsächliche Bytekopie/Hashfehler/Größenlimit, Rechteverlust während Dateiarbeit, Bindungs-/Admin-/CSRF-Verweigerung, native PNG-/VP8-Dekodierung, tatsächliche Windows-Schreib-/Löschsperre, unveränderte übernommene Kopie bei verändertem Original, deduplizierte erneute Anfrage und ausdrücklich sichtbares Videoende. Stubs sind nur Vertragsnachweise, keine native Wiedergabe. Aktuelle tatsächliche Ergebnisse in status.md.

Lokales Modell shownight-local:8b über den Betreiber-Helper für einen kleinen Entwurf verwendet: nur versionierte Transfer-/Rendererverträge als Kontext, 1566 Eingabe-/443 Ausgabetokens. Entwurf geprüft: Medienlistenmitgliedschaft ersetzt keine Sitzungsrechte; Formatfreigabe im Manifest beweist keine nativen MP4-Fähigkeiten. Diese Aussagen nicht übernommen. Erste Reviewanfrage für die neue, noch unversionierte Datei wurde vom Helper abgelehnt; erst nach Aufnahme in Git erneut prüfen. Modelltexte sind ungeprüfte Beratung, keine Testergebnisse. Rohantworten bleiben privat unter .local/local-ai/results.
