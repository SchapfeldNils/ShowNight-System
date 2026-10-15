# Entwicklungsplan – Server zuerst, danach Agenten

15. Oktober 2026: [Issue #41](https://github.com/SchapfeldNils/ShowNight-System/issues/41), nächstes sichtbares Onlinepaket: gespeicherte Timer-/Hinweisvorbereitung pro Show und persönliche stumme Browserprobe. Vorhandene Vorbereitungsrechte, Revisionen und unabhängige Showkopie; keine neuen Live-/Ausfallregeln. F20/A10 nur teilweise adressiert. [Ablauf und Grenzen](stage-timer-vorbereitung.md); Status/Prüfungen während Umsetzung führen. Ticketshop und vollständiger lokaler Showbetrieb bleiben Folgepakete.

S3-08, 14. Oktober 2026: [lokale Serverübersicht/Windows-Inventar](s3-serveruebersicht.md), [Issue #24](https://github.com/SchapfeldNils/ShowNight-System/issues/24), [PR #25](https://github.com/SchapfeldNils/ShowNight-System/pull/25). Grafischer Launcher und geschützte Webdiagnose; drei Subagents für Startup/UI/IO. Keine Gerätezuordnung/-ausgabe oder geänderte Rechte. Praktische Hardwareabnahme bleibt offen.

S3-06, 14. Oktober 2026: gespeicherte showbezogene Szenenentwürfe mit eigener Revision, exklusiver Sitzungssperre, Text/Rechteck/Bild, Einsatzreferenz, unabhängiger Kopie und Paket-v2-Übertragung. [Issue #17](https://github.com/SchapfeldNils/ShowNight-System/issues/17), [Ablauf/Grenzen](s3-szenenentwuerfe.md). Erster Gestaltungs-/Datenbaustein; native Szenenkomposition, vollständiger Konva-Editor und S4-Showablauf bleiben nachfolgende Arbeiten.

S3-05, 14. Oktober 2026: verifizierte Paketmedien an die stumme native Softwarediagnose anbinden; [Issue #15](https://github.com/SchapfeldNils/ShowNight-System/issues/15), [Entwurfs-PR #16](https://github.com/SchapfeldNils/ShowNight-System/pull/16). Erst einzelne PNG-/VP8-WebM-Medien mit aktueller Berechtigung/Bindung und unveränderlicher Kopie; vorhandenes Paketformat enthält noch keine vollständigen Szenen. Vollständige Szenen, persönliche Regievorschau, Ausgabe und Show-GO bleiben nachfolgende Arbeiten. [Ablauf und Grenzen](s3-paketmedien.md).

D018, 14. Oktober 2026: Windows-Setup-Anwendung für Streaming-Rechner verbindlich. [Installation und Prüfungen](s3-streaming-installer.md). Echte isolierte Installation/Update/Deinstallation mit erhaltenen Daten prüfen; Server-Vorabpaket ohne Renderer eindeutig kennzeichnen, vollständiges Rendererpaket erst nach erfolgreichem nativen Build.

S3-04, 14. Oktober 2026: ausdrücklich beauftragte native Renderer-Grundlage ohne zweiten Client. [Ablauf und Grenzen](s3-renderer.md), [Issue #12](https://github.com/SchapfeldNils/ShowNight-System/issues/12). Separater C++-/GStreamer-/Skia-Prozess, lokaler Steuerkanal, synthetische Diagnosebilder und sichere Kanaltrennung. Softwarebuilds/kleine automatische Prüfungen jetzt, praktische LAN-/Ausgabe-/Hardwareabnahme später. Vollständiger S3/S4-Scope bleibt offen.

S3-03, 10. Oktober 2026: gezielte LAN-Neueinrichtung des bestehenden Offline-Vorbereitungsservers als weiteres D017-Softwarepaket, eigener Branch/Issue/PR. [Bedienung](s3-lan.md), [aktueller Prüfstand](status.md). Feste private IPv4, HTTPS-IP-Zertifikat, Diagnose, manuelle Client-/Firewallanleitung; keine Änderung von Fachrechten oder Live-/Ausfallmodell. Reale Mehrgeräteprüfung, bestehende Profilumstellung und Renderer bleiben offen. S3 ist dadurch nicht abgeschlossen; die D013-Reihenfolge bleibt.

Stand: 9. Oktober 2026. D013 ersetzt die frühere unmittelbare Startreihenfolge aus D003; Gesamtumfang und technische Risikoprüfung bleiben bestehen.

| Paket                       | Ergebnis                                                                                                                      | Abnahme                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| S1 Netcup-Server            | Gemeinsames Projekt, API/Web, PostgreSQL, Auth/Rechte/MFA, Event/Show/Medienvorbereitung, Paketmanifest, Deployment/Sicherung | S1-01–S1-12 in abnahmeplan.md; reale VM-Prüfung bei Zugang         |
| S2 Windows-Agenten          | Paarung, Profile, Fähigkeiten, Heartbeats, Diagnose, Idempotenz, simulierte und verifizierte Realadapter                      | S2-01–S2-08; tatsächliche Gerätegrenzen sichtbar                   |
| S3 Lokaler Betrieb          | Lokaler Server/SQLite, vollständige Pakete, Windows-Medienprozess, HDMI und separate Ausgabe                                  | L-01/L-12/L-13; reale Windows-/Ausgabeprüfung                      |
| S4 Durchgängiger Showablauf | Szene, persönliche Vorschau, gemeinsames GO-Ziel, Ausgabe, Durchläufe und Versionen                                           | L-02–L-11; zwei gleichberechtigte Regien                           |
| S5 Liveausbau               | Voller Editor, Kameras, Ton, Licht, Controller, Timer und Übergänge                                                           | Betroffene F-/A-Fälle, L-14 und reale Last-/Synchronitätsmessungen |
| S6 Organisation             | Teams, Aufgaben, Helfer, Kalender, Proben, Bühne, Requisiten und Kostüme                                                      | A18/A21/A22                                                        |
| S7 Spiele und Moderation    | Quiz, Tablets, Jury, Buzzer, Wertung, Karten und Moderatoransicht                                                             | A12/A23/A29                                                        |
| S8 Verkauf                  | Shop/Saalplan, Gruppen, Zahlungen, Tickets und Einlass                                                                        | A24–A27                                                            |
| S9 Ergänzungen              | Sponsoren, Öffentlichkeit und einfache Einnahmen/Ausgaben                                                                     | A28                                                                |
| S10 Auslieferung            | Vollständiger Abgleich, Installer, bebilderte Anleitung, Sicherung/Rückfall und Gesamttest                                    | A01–A30 einschließlich A17/A30                                     |

Reihenfolge späterer Fachmodule kann begründet angepasst werden. Alle vereinbarten Module bleiben Teil der vollständigen ersten Veranstaltungsfreigabe. Früh in S2/S3 müssen die riskanten Geräte-/Renderingwege geprüft werden. D017 erlaubt ausdrücklich weitere vorbereitbare Softwarearbeiten, während Bedien-/Gerätefunktionstests nachgeholt werden; fehlende Nachweise bleiben Freigabevoraussetzung.

S3-01: Inhaltspaketdownload, strenge Integritätsprüfung, lokale SQLite-Paketablage und portable Windows-CLI auf eigenem Branch. [Ablauf und Grenzen](s3-paketablage.md), [Issue #6](https://github.com/SchapfeldNils/ShowNight-System/issues/6). Teilgrundlage von L-01; kein abgeschlossener S3-/Offline-/Rendererbetrieb.

## Agile Lieferung

S3-02: lokaler HTTPS-Server auf Loopback, signierte/verschlüsselte vorbereitete Offlinekonten mit MFA, lesende Pakete, persönliche lokale Konteneinrichtung, Sperren und gesonderte administrative Recovery. [Anleitung und Grenzen](s3-lokalserver.md), [Issue #8](https://github.com/SchapfeldNils/ShowNight-System/issues/8). Teilnachweis F30/A18 und L-01; noch kein LAN-/Renderer-/Livebetrieb oder fertiger Onlineabgleich.
Je Paket: nutzbarer Ablauf, Daten-/Schnittstellenänderungen, angemessene Tests, Startanleitung, bekannte Grenzen, aktualisierte Dokumentation und eigener PR. Keine automatischen Merges.
Codex beginnt S1 mit konfigurierbaren Deploymentvorlagen. Fehlende reale Zugangsdaten blockieren nur den Zieldeploymentnachweis. S2 folgt der nutzbaren Servergrundlage und braucht keine bezahlten Zusatzplugins.

## Erforderliche Netcup-Angaben vor echtem Deployment

VM/System, Architektur/Ressourcen und Datenträger; Domain/DNS; autorisierter SSH-/Adminzugang; bestehende Dienste/Ports; TLS- und Mail-Einrichtung; externe Sicherung. Noch nicht vorhanden oder nicht erhoben: als offen kennzeichnen. Keine Produktionswerte erraten und keine vorhandene VM pauschal überschreiben.

## Dokumente

[Datenmodell](datenmodell.md), [Schnittstellen](schnittstellen.md), [Abnahmeplan](abnahmeplan.md), [Startprompt](codex-startprompt.md). Der Windows-Hauptrechner bleibt der lokale Liveprozessor; die Cloud ist kein Ersatz für HDMI-/Bühnenausgabe.
