# S3-01: Vorbereitungsstände herunterladen und lokal importieren

Stand: 10. Oktober 2026. Entwicklungsprototyp 0.3.0 auf `codex/s3-local-packages`, abhängig von S2 PR #5, [Issue #6](https://github.com/SchapfeldNils/ShowNight-System/issues/6). Software-/Geräteabnahme getrennt; keine Veranstaltungsfreigabe.

[Entwurfs-PR #7 und aktuelle Prüfungen](https://github.com/SchapfeldNils/ShowNight-System/pull/7/checks), Runtime `f5309d2`. Lokal nach Paketbuilderänderung zusätzlich S2-Regression 8/8 bestanden. Windows-ZIP als eigenes Actions-Artefakt `shownight-local-windows-x64` des vollständig geprüften jeweiligen Commits; lokaler Entwicklerbuild unter `dist/shownight-local-windows-x64.zip` mit SHA256-Datei. Kein produktives Serverupdate aus Artefakterstellung ableiten.

## Bedienbarer Ablauf

1. Auf einem Server mit diesem Entwicklungsstand anmelden. Veranstaltung → Übersicht → **Paketmanifest erzeugen**. Fehler beheben; nur gültige Manifeste bieten **Paket mit Medien herunterladen**. `.snpkg` enthält die eingefrorenen Event-/Show-/Einsatzdaten und sämtliche darin aufgeführten Originalmedien. Spätere Onlineänderungen ändern diesen Stand nicht.
2. Windows-ZIP `shownight-local-windows-x64.zip` prüfen und entpacken. `Importieren.cmd` öffnen, Pfad zur heruntergeladenen `.snpkg` eingeben; Anführungszeichen um den Pfad sind erlaubt. Kein npm/Compiler benötigt. Der Import macht keine Netzwerkanfragen.
3. **Paket vollständig importiert; nicht live aktiviert** bestätigt vollständige Datei-/Hashprüfung und lokalen SQLite-Eintrag. `Pakete-Anzeigen.cmd` zeigt gehaltene Stände; `Pakete-Pruefen.cmd` prüft alle Dateien erneut. Änderungen am lokalen Bestand können dadurch erkannt werden. Beschädigte/abgeschnittene Pakete erzeugen Fehler und verändern keine vorherigen Pakete.

Lokaler Windows-Speicher: `%LOCALAPPDATA%/ShowNight/local-packages`, außerhalb OneDrive/Git, Eigentümer aktueller Benutzer, Zugriffsrechte ausschließlich Benutzer/SYSTEM. Dateien enthalten interne Vorbereitungsinhalte, deshalb Downloads/USB-Kopien ebenso geschützt behandeln. Der CLI verwendet den angemeldeten Windows-Benutzer; **dies ist keine Offlineanmeldung mit ShowNight-Rollen/MFA** und stellt keinen Browser-/LAN-Zugriff bereit. Keine Cloudpasswörter, MFA-Secrets, Agentcredentials oder Sessions exportieren.

## Umfang und technische Grenzen

Teilgrundlage von F25/F26/F28/F50 sowie L-01/A04/A17. Inhalt ausschließlich implementiertes S1-Schema: Event, Shows, Einsätze und Originalmedien. Eigenständige Szenen/Schriften, alle späteren Fachmodule, vorbereitete Offlinekonten/MFA und geschützter lokaler Mehrbenutzerserver folgen. Das Paket ist **kein vollständiges Veranstaltungs-/Rendererpaket**. Import und Aufbewahrung ändern keine Livezustände. Aktivierung, Rückkehr eines aktiven Stands, GO, Bild/Ton und Geräteausgabe sind noch nicht implementiert.

Transport 1: ASCII `ShowNight-Paket/1` mit abschließendem LF; vier Byte Big-Endian-Manifestlänge; 32 Byte SHA256 des UTF-8-Manifests; Manifest; anschließend Medienbytes in Manifestreihenfolge und exakt angegebener Länge. Keine Kompression/Archivpfade/Links. Interne Dateinamen stammen aus validierten UUIDs; Anzeigenamen werden nicht als Dateipfade benutzt. Prüfsummen belegen Integrität, **keine signierte Herkunft**; nur bewusst aus vertrauenswürdiger eigener Serverquelle erhaltene Pakete importieren.

Grenzen: Manifest 8 MiB, 2000 Medien, einzelne Datei 2 GiB, Mediengesamtgröße 64 GiB, 1000 Shows und 500 Einsätze je Show. Manifest streng validiert, unbekannte Felder/Versionen, doppelte Inhaltskennungen, fehlende Medienreferenzen, fehlende/zusätzliche Bytes und falsche Prüfsummen abgewiesen. Medien bleiben vor Export zusätzlich über bestehende Analyse/Dateirechte geprüft. Keine neue lokale Decoder-/Renderer-/Synchronitätsfreigabe aus Hashprüfung.

Streaming in eigenes Stagingverzeichnis, Dateien synchronisiert, vollständige Prüfung vor Veröffentlichung. SQLite hält Paketidentität/Manifest sowie normalisierte Show-/Einsatz-/Medienmetadaten; Fremdschlüssel, WAL, FULL-Synchronisation und Transaktion. Gehaltene Pakete unveränderlich, keine direkte PostgreSQL-Replikation. Gleiches Paket erneut importieren ist idempotent; gleiche Kennung mit verändertem Inhalt wird abgewiesen, beschädigter vorhandener Stand nicht automatisch ersetzt. Fehler räumen ausschließlich eigene erzeugte Verzeichnisse auf. Prozessabbruch zwischen Dateiveröffentlichung und DB-Commit kann nicht referenzierte private Staging-/Paketverzeichnisse hinterlassen; diese werden nicht angezeigt/aktiviert. Keine ungeprüfte Stromausfallgarantie.

## Entwicklungsstart und Prüfungen

```sh
pnpm typecheck
pnpm build
# Windows vor der Integration (gebündelte CLI wird mitgeprüft):
pnpm local:package
pnpm test:packages
pnpm test:integration
pnpm test:browser
# Windows:
pnpm local:packages import "C:/Pfad/Veranstaltung.snpkg"
pnpm local:packages list
pnpm local:packages check-all
```

Die portable ZIP verwendet dieselbe hashgeprüfte offizielle Node-24.19.0-Laufzeit wie S2; Node-Lizenz und MIT-Lizenz von Zod beiliegend. SQLite in der Node-Laufzeit; keine neue kostenpflichtige Komponente. Betrieb benötigt Windows 64 Bit, lokalen Speicherplatz und Dateizugriff. Kein Installer/Dienst/Autostart.

Tatsächliche Prüfergebnisse werden in [Status](status.md), [Protokoll](protokoll.md) und am PR geführt. Noch keine Produktivinstallation dieses S3-Stands oder vollständige L-01-/Hardwareabnahme aus der Implementierung ableiten.

Lokaler Stand vom 10. Oktober 2026: Typprüfung, Build und Windows-ZIP bestanden; `test:packages` 9/9 einschließlich tatsächlichem separatem Windows-Prozess mit Dateien aus dem gebündelten Paket. Wiederanlauf des SQLite-Speichers, eingefrorene Onlineänderungen, parallele/identische Importe, beschädigter Bestand, Abbruch/Zusatzbytes, unbekannte Felder/Versionen, Rechte und Blockgrenzen geprüft. S1-Regression 13/13, Unitprüfungen 8/8 und Browser 1/1 mit nativem Download bestanden. Tests verwenden ausschließlich synthetische Daten und eigene DB-/Dateiverzeichnisse. Linux-CI lässt den ausdrücklich Windows-spezifischen Prozessfall aus; dort acht Tests einschließlich übergeordnetem Test erwartet. Keine echte Offlineanmeldung oder Bühnenausgabe geprüft.

[Browsernachweis vom 10. Oktober 2026](screenshots/2026-10-10-s3-paketdownload.png): tatsächlicher Download auf eigener Testinstanz, ausschließlich synthetische Daten. Vorläufige Gestaltung; kein realer Geräte-/Bühnenbeleg.
