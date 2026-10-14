# Vorbereitete Szenen im nativen Medienprozess

14. Oktober 2026 · [Issue #29](https://github.com/SchapfeldNils/ShowNight-System/issues/29) · `codex/s3-native-scene-composition`, auf PR #28 / `1ac77585b18e5749f6f140f2eccfbda2b74f17c6`. Teilumfang F07/F08/F09/F12/F17/F25/F28/F30, Teilnachweise A02/A04/A06/A18. F04 betrifft Dauer; die ursprüngliche falsche Zuordnung wurde korrigiert. Keine vollständige Abnahme dieser Anforderungen.

## Bedienung und Grenzen

Den vorhandenen lokalen Server mit Medienprozess starten, als Admin mit MFA anmelden, unten ein vorbereitetes Paket ansehen. Unter **Medienprozess · Softwarediagnose → Paketszene** eine Szene und **Paketszene vorbereiten** wählen. Das bisherige Diagnoseprogramm bleibt erhalten. **Diagnosebild übernehmen** übernimmt ausdrücklich die Vorschau in den stummen Diagnoseprogrammkanal. Die abgerufenen 640 × 360 PNG-Standbilder stammen aus dem nativen Prozess; die SVG-Skizze daneben bleibt ein Browserentwurf.

Manifest-v1-Pakete und ältere Renderer ohne gemeldete Szenenfähigkeit behalten den bisherigen Einzelmedienweg. Kein automatisches Update, Livepaketwechsel, Show-GO oder Replay. Dieser Durchlauf aktualisiert weder Netcup noch die installierte lokale 0.3.8. Setupquellen 0.3.10; ein tatsächliches Artefakt erst mit erfolgreicher CI ausweisen.

Text, Rechteck und Bild verwenden die bestehende Szenendefinition: Reihenfolge unten nach oben, Sichtbarkeit, Deckkraft, Koordinaten und rechteckige Begrenzungen. Die logische Leinwand wird proportional und zentriert eingepasst; übrige Fläche schwarz. PNG/JPEG mit `contain` oder `cover`. Explizite Textzeilenumbrüche mit Arial/Windows-Schriftfallback und Begrenzung auf die Textbox; keine automatische Worttrennung, Richtext-, eigene Schrift-, typografische Gleichheits- oder vollständige Editorzusage. Native Darstellung ist für diesen Weg verbindlich. Vorläufige vorhandene Gestaltung; Originaldesignquellen fehlen weiterhin.

Animationen, Video-/Kameraebenen, Gruppen, Rotation, Effekte, Full-HD/GPU/WebRTC, persönliche Regievorschau, Publikumston, HDMI/Bühnenmonitor und Showablauf bleiben Folgearbeit. Erkannte Geräte sind dadurch nicht angebunden. Kein Leistungs-/Synchronitäts-/Hardwarebeleg.

## Vertrag und Sicherheit

`POST /api/local/renderer/package-scene`: `{commandId, expectedRevision, action:"prepare-scene", packageId, sceneId}`. Keine Definition, Pfade oder Geräte im Browserauftrag. Aktuelle Admin-/MFA-Sitzung, Origin und CSRF erforderlich. Der Server löst ausschließlich den gebundenen Paketstand samt Szenenrevision und sämtlichen Bildreferenzen auf. Rechte nach Warte-/Dateiarbeit und vor Dispatch erneut prüfen. Gleiche Kennung mit anderem Inhalt ist ein Konflikt; unbestätigte Befehle nicht automatisch erneut senden.

IPC bleibt auf 16 KiB begrenzt. Private UUID-Snapshotdatei bis 1 MiB mit Szenendefinition und eindeutigen Bilddeskriptoren; IPC überträgt nur UUID, Szenen-/Paketkennung, Revision, Manifest-/Dateihash und Größe. Native Prüfung von Hash, Typen, Referenzen und Grenzen unabhängig. Unveränderliche private Kopien und gesperrte native Lesehandles; Übernahme erst nach vollständiger Vorbereitung. Fehler erhalten Vorschau, Diagnoseprogramm und Revision.

Höchstens 64 Ebenen/eindeutige Bilder, 32 MiB je Bild, zusammen 64 MiB Dateidaten. Decodierte Bilder zusammen höchstens 16.777.216 Pixel (64 MiB BGRA) pro Szene; jede Medienkennung einmal laden. Explizite Windows-WIC-PNG-/JPEG-Decoder, keine frei gewählten Codecs/Netzwerk-URIs/neuen Bibliotheken. Standardschriften und WIC als Windows-Voraussetzungen; vorhandene Skia-/GStreamer-/Node-/Inno-Setup-Lizenzen unverändert.

## Prüfstand und Fortsetzung

Implementierung in Arbeit. Build, API-/Rechte-/Snapshotprüfungen, native Pixel-/Fehlerfälle, Browserablauf und unabhängiger vollständiger Diffreview vor Abschluss getrennt nachweisen. Vertragsadapter sind kein C++-/Windowsnachweis. Gewünschter lokaler KI-Helfer am angegebenen Pfad weiterhin nicht vorhanden; kein LocalAI-Ergebnis behauptet.

Nächstes Paket: vorbereiteten vollständigen Showablauf an diese native Grundlage anbinden, mit gleichberechtigten Regien, Ordnung/Deduplizierung und getrennten Geräteabnahmen. Keine neue Fachentscheidung zu Rechten oder Ausfällen durch diesen technischen Teil.
