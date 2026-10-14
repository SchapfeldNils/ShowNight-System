# S2-Lesediagnose: Aktualisierung am 10. Oktober 2026

Produktiver Server und DJ-Agent auf Revision `a8b062ff0c945e920834e6c0887e15cf29662219`/Agent 0.2.1 aktualisiert. Fortsetzung des beauftragten S2-Betriebs auf [PR #5](https://github.com/SchapfeldNils/ShowNight-System/pull/5); kein Merge, keine Veranstaltungsfreigabe. [Bedienung und Vertragsgrenzen](s2-virtualdj-diagnose.md).

## Herkunft und Prüfungen

[Actions 38006960819](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38006960819) für exakt diese Revision vollständig erfolgreich: Windows-Agent sowie native AMD64-/ARM64-Prüfungen einschließlich Typen, acht Unitprüfungen, acht S2-Integrationsprüfungen, 13 S1-Integrationsprüfungen, Browser, Produktionsaudit/Lizenzen und Container/Backup/Restore. Zusätzlich lokal Typen/Build/Windows-Paket, acht Unit-, acht S2- und eine Browserprüfung bestanden. Synthetischer Browsernachweis ist ausdrücklich als Vertragstest bezeichnet.

| Artefakt | SHA256 |
| --- | --- |
| CI-ARM64-Archiv | `62eeb6b29ec2e106ed3d9c5c4940645b160a478b47f4ac5a5b35be2e3385f589` |
| Image-Konfiguration | `704b1184724741fc50686d67b74804ff08741fef05b23927ed883c717a8721f5` |
| CI-Windows-ZIP | `1fa68be70989aca2ae311edacfbfb15144f4edb3ecc2452c91ebe4c083184bfd` |

Archivhash lokal und auf VM geprüft. Nach Docker-Import ARM64/Linux, sämtliche RootFS-Layer und Entrypoint/Cmd/Environment/Arbeitsverzeichnis/Benutzer mit CI-Konfiguration verglichen. Windows-ZIP vor Entpacken hashgeprüft. Produktiv tatsächlich `shownight:a8b062ff0c945e920834e6c0887e15cf29662219-arm64` ausgelesen.

## Sicherung und Update

1. Ausschließlich eigene ShowNight-App/Worker kurz gestoppt. PostgreSQL- und Medienbackup erstellt; stabiler Snapshot vor/nach Sicherung verglichen. Bisherige Dienste anschließend wieder bereit, bevor der isolierte Restore begann.
2. Externe Kopie außerhalb OneDrive/Git auf Betreiberrechner mit SHA256 geprüft. Sicherung in neue leere getrennte PostgreSQL-/Medienvolumes wiederhergestellt. Alle **21 Tabelleninhalte** und Medienstand identisch; Schema 2 bereit. Aktuell **keine Medien** im Backup, deshalb kein zusätzlicher Nachweis nicht leerer Medien daraus. Recoveryprojekt `shownight-s2-vdj-recovery-20261010` danach gestoppt, eigene Nachweisvolumes vorläufig erhalten. Keine öffentlichen Ports/Proxyverbindung und kein Recovery-Worker.
3. Originalkonfiguration privat gesichert; zusätzliche DPAPI/CurrentUser-Kopie mit identischem Entschlüsselungs-Roundtrip. Betreiberrechner: `%LOCALAPPDATA%/ShowNight/operations/s2-vdj-a8b062f-20261010`, ACL Benutzer/SYSTEM. VM: `/opt/shownight/releases/s2-vdj-a8b062f-20261010/backup`. DPAPI bleibt an diesen Windows-Benutzer gebunden; unabhängiges portables Schlüssel-/Backupziel aus Issue #3 bleibt offen.
4. Portainer-Stack 23/Endpoint 3 und private Compose-Konfiguration auf geprüftes Image abgeglichen. Environmentvergleich: ausschließlich Image geändert. App/Worker bereit, **Schema 2 unverändert; keine Migration ausgeführt**. Mailversand aus. Rückwechsel auf vorheriges Schema-2-Image `26edc1d` mit ursprünglicher Konfiguration vorbereitet, nicht benötigt oder ausgeführt. Der frühere S1-Rückwechsel hat andere Datenbankvoraussetzungen, siehe [ursprüngliches S2-Update](s2-netcup-update.md).
5. Bisheriger Agent 0.2.0 am neuen Server verbunden und Diagnose samt SQLite-Ergebnis bestätigt. Anschließend ausschließlich alten konkreten Agentprozess beendet, neue geprüfte Windows-ZIP gestartet. Agent 0.2.1 tatsächlich per WSS verbunden. DPAPI-Identitätsdatei byteidentisch; keine erneute Paarung, SQLite-Journal erhalten. Private manuelle Start-/Stopphilfe auf neue Laufzeit aktualisiert, kein Autostart/Dienst.
6. Öffentliches HTTPS-Ziel per IPv4 und IPv6 mit unverändertem Hostnamen und vollständiger Zertifikatsprüfung bereit/Schema 2. Windows-Resolver weiterhin vorheriges Webhostingziel; temporäre IP-Vorgabe ausschließlich im Agentprozess bleibt erforderlich. Keine globale DNS-/Hostsänderung.

## Reale Pluginprüfung und Grenzen

Aktualisierter Agent meldete zunächst gegen die echte lokale Plugininstanz `unavailable`, mit aktuellen Beobachtungs-/Serverempfangszeiten und bestehender Verbindung. Separate begrenzte rohe HTTP-Leseabfrage bestätigte **401 mit den unveränderten lokalen Werten**. Erster Ziel-Erholungstest deshalb vor jeder Konfigurationsänderung abgebrochen, eigenes synthetisches MFA-Konto entfernt. Nach Betreiberabgleich weiterhin 401: gespeicherter Pluginstring und lokale Datei unterschieden sich. Tatsächlich erfolgreiche Leseabfrage mit dem gespeicherten Pluginwert bestätigt, ausschließlich `VDJ_AUTH` in lokaler Datei angeglichen, vorherige Datei privat gesichert. Keine Änderung der Pluginparameter und kein Secret im öffentlichen Protokoll.

Danach am tatsächlichen produktiven Ziel bestanden: Agent 0.2.1 verbunden, **`available` → `unavailable` bei kurzzeitig absichtlich falscher lokaler Anmeldung → `available` nach exakter Wiederherstellung**. Frische `observedAt`-/`reportedAt`-Berichte mit `current=true`; gleiche tatsächliche serverseitige WSS-Epoch durchgehend bestätigt. Kein Authentifizierungsstring in Geräteantworten, keine Pluginrohantwort im Fähigkeitsvertrag. Anschließende Diagnose `completed`/`agent-roundtrip` am Ziel und im lokalen SQLite-Journal. Eigenes synthetisches MFA-Konto und seine Serveraufträge entfernt; echte DJ-Paarung erhalten. Privater Zielnachweis: `target-proof.json` im oben genannten Releaseordner. Dies ist ein realer Zugriffs-/Authfehler-/Erholungsnachweis, **kein nachgewiesener Absturz/Neustart der VirtualDJ-Anwendung**.

Nach bestandenem Test wurde die lokale Datei erneut mit abweichendem Wert gespeichert; neuer 401 und aktueller Fehlerstatus tatsächlich erkannt. Datei nochmals mit dem weiterhin erfolgreich abgefragten Pluginwert angeglichen, vorherigen Dateistand separat privat gesichert. Bei späteren manuellen Änderungen beide Werte konsistent halten; ein alter Editorinhalt kann die korrigierte Datei wieder überschreiben.

Nur DJ-Rechner verfügbar; FLX4 nicht angeschlossen. Kein Play/Pause, keine Deckposition, kein Ton-/PA-/Licht-/HDMI-/Synchronitätsnachweis. Plugin lauscht auf `0.0.0.0`; Dauerbetriebsbegrenzung weiterhin offen. Tatsächliche Abnahme von S2-06/S2-07 und vollständiger F01–F50/A01–A30-Umfang bleiben offen.
