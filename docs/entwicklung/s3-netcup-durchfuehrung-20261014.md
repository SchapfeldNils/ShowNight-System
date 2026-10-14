# S3 · Produktivupdate am 14. Oktober 2026

Lokale Fortsetzung am selben Abend abgeschlossen: passender Anmeldestand regulär importiert und installierter Server 0.3.6 tatsächlich auf https://localhost:3443 gestartet. HTTPS/Hostname/CA und Schutz unangemeldeter Konten geprüft. Genaues öffentliches Zertifikat nach ausdrücklicher Freigabe nur für CurrentUser Root importiert; lokale Seite im Chrome-Browser ohne Zwischenwarnung geöffnet. Betreiber bestätigt persönliche lokale Anmeldung/MFA; angemeldeten Browserzustand und aktive MFA-bestätigte lokale Sitzung zusätzlich geprüft, ohne Token oder Recoverycodes auszugeben. [Nachweis des lokalen Starts](nachweise/2026-10-14-lokaler-start.json). Damit ist dieser Erststart mit bestehendem Konto bestanden; Hardware-/Showbetrieb und unabhängige lokale Recovery-Sicherung bleiben gesondert offen. Der Produktivnachweis unten beschreibt den vorherigen Stand vor dieser lokalen Fortsetzung.

Nach ausdrücklicher Betreiberfreigabe „Ja“ zum Schema-2→4-Update und zur Fortsetzung der lokalen Einrichtung durchgeführt. Bezug: [Issue #20](https://github.com/SchapfeldNils/ShowNight-System/issues/20). Kein PR-Merge durch diesen Betreiberlauf.

**Aktiver Online-Stand:** `shownight:1c983fc01c98916fc782422f19e67567821bdaaa-arm64`, Schema 4. Website und Readiness über normales öffentliches HTTPS mit vollständiger Zertifikatsprüfung jeweils 200. App und PostgreSQL healthy, Worker running. Mailversand weiterhin aus. [Strukturierter Nachweis](nachweise/2026-10-14-s3-netcup-produktiv.json).

Dieser Stand ist die zuvor geprüfte Runtime passend zu Setup 0.3.6. Separat im Entwicklungsbranch enthaltene PR-Bugkorrekturen und Migration 005 sind **nicht** mitbereitgestellt; [deren eigene Grenzen](pr-bug-abnahme.md) bleiben maßgeblich. Entwicklungs-HEAD und ausgeliefertes Image nicht gleichsetzen.

## Erster Versuch und tatsächliche Rückkehr

Ausgangskonfiguration und ARM64-Image erneut bestätigt. Ausschließlich ShowNight-App/Worker gestoppt, aktuellen DB-/Medienbestand gesichert und vollständigen Tabellen-/Medienhashvergleich bei angehaltenen Schreibzugriffen ausgeführt. Externe Betreiberkopie per SHA256 geprüft, private Konfiguration zusätzlich mit Windows-DPAPI/CurrentUser-Roundtrip gesichert. Frisches Schema-2-Backup in neuen leeren Recoveryvolumes tatsächlich wiederhergestellt, alte Runtime gestartet und Readiness sowie sämtliche Datenhashes identisch bestätigt; Recovery anschließend gestoppt.

Migration auf Schema 4 erfolgreich, aber die unmittelbare Portainer-Statusassertion bestätigte den erwarteten Aktivstatus nicht. Rückkehr eingeleitet; dieselbe zu frühe Statusassertion unterbrach auch deren anschließende Prüfung. Rückkehr-Environment war tatsächlich übernommen. Dienste daraufhin ausdrücklich gestartet und Schema 2/öffentliche Seite 200 bestätigt. Die geprüfte Schema-2-Sicherung läuft seitdem in den getrennten Volumes `shownight-s3-recovery-20261014-database` und `shownight-s3-recovery-20261014-media`. Ursprüngliche Volumes nicht überschrieben oder gelöscht.

Zusatzprüfung: stillgelegten ursprünglichen DB-Volumestand ausschließlich schreibgeschützt in ein neues Auditvolume kopiert. Nur die Kopie mit Schema-4-Runtime gestartet. Alle 24 Tabellen und der leere Medienstand entsprechen exakt dem beim ersten Versuch vor Freigabe gespeicherten Migrationsstand. Keine dort übergangenen Datenbankänderungen festgestellt. Auditstack wieder gestoppt; ursprüngliche DB dafür nicht gestartet.

## Erfolgreicher erneuter Versuch

Statusprüfung wartet jetzt auf den bestätigten Zielzustand. Während der internen Prüfung ist die App vollständig vom Proxy-Netz getrennt; ein bloßer temporärer DNS-Alias wäre wegen möglicherweise zwischengespeicherter Ziel-IP-Adressen unzureichend.

1. Neuen aktuellen Schema-2-Produktivstand erneut gesichert. App/Worker von Sicherung bis zur Freigabe angehalten. Backup auf VM und externem Betreiberrechner gehasht; Konfiguration mit DPAPI-Roundtrip bestätigt.
2. Frische Sicherung in weitere neue leere Volumes `shownight-s3-recovery-20261014b-database` und `shownight-s3-recovery-20261014b-media` wiederhergestellt. Alle 21 ursprünglichen Tabellen einschließlich Migrationsmarker und Medienhashes identisch; alte Runtime bereit mit Schema 2. Dieser Recoveryzweig behält zur möglichen Umschaltung die ursprünglichen internen DB-Zugangsdaten privat. Vorbereitende Live-Teststacks verwendeten unabhängige Test-DB-Kennwörter. Recoveryzweig anschließend gestoppt.
3. Migration 003/004 auf dem aktiven Produktivvolumen. Alle 20 ursprünglichen Fachtabellen und Medienhashes vor Appfreigabe unverändert. Zusätzliche Tabellen `offline_exports`, `scenes`, `scene_leases` leer; vier Migrationsmarker.
4. Portainer-Stack 23/Endpoint 3 zunächst mit temporärer Compose-Fassung gestartet: App ausschließlich am Backendnetz, keine veröffentlichten Ports und kein Proxyanschluss. Readiness Schema 4, neue App-/Workerimages und ausgeschalteten Mailversand tatsächlich geprüft; vollständiger Tabellen-/Medienhashvergleich weiterhin identisch.
5. Ursprünglichen Compose-Inhalt wiederhergestellt und Proxyanschluss freigegeben. Portainer-/CLI-Konfiguration identisch bestätigt, Seite und Readiness öffentlich HTTPS 200/Schema 4. Erfolgreicher Versuch von 19:28:09 UTC bis 19:29:25 UTC; dies ist nicht die gesamte Unterbrechungsdauer beider Versuche.

Aktiv bleiben die beim ersten Rückwechsel verwendeten Recoveryvolumes ohne „b“. Gegenüber dem Stand unmittelbar vor dem erneuten Versuch änderte sich final ausschließlich das Image; gegenüber dem allerersten Ausgangsstand zusätzlich die beiden Volumennamen. Ursprüngliche Volumes erhalten. Die „b“-Recovery- und Auditstacks sind gestoppt; private Nachweisvolumes vorläufig erhalten. Kein pauschales Docker-Aufräumen.

## Sicherungszuordnung

| Stand | Privater VM-Sicherungsordner | Zweck |
| --- | --- | --- |
| erster Schema-2-Stand | `/opt/shownight/releases/s3-1c983fc-20261014/backup` | tatsächlich verwendete erste Rückkehr |
| Schema-2-Stand vor erneutem Versuch | `/opt/shownight/releases/s3-1c983fc-20261014-retry1/backup` | frisches geprüftes Wartungsbackup für erfolgreichen Versuch |

Externe Kopien: `%LOCALAPPDATA%/ShowNight/operations/s3-preflight-1c983fc-20261014/production/fresh-backup` beziehungsweise `production-retry1/fresh-backup`, außerhalb OneDrive/Git mit Benutzer-/SYSTEM-ACL. Keine Backupinhalte, Konfigurationswerte oder Kontendaten veröffentlicht. DPAPI benötigt das zugehörige Windows-Profil; unabhängige langfristige Backup-/Schlüsselziele bleiben gesondert offen.

## Betriebsstand und lokale Fortsetzung

Tatsächlich geprüft: ARM64, Docker 29.1.5, Compose 5.0.1, PostgreSQL 17.9 (Debian 17.9-1.pgdg12+1), Node 24.19.0, FFmpeg 5.1.9-0+deb12u1. Keine Treiber-/VM-/Nginx-Neuinstallation, DNS-, Firewall-, Geräte- oder Tonausgabeänderung.

Lokale Setup-0.3.6-Installation und Serverprofil erhalten. Zertifikat CN=localhost gültig bis 14. Oktober 2027, Adress-/Zertifikatprüfung bestanden. Nach späterer ausdrücklicher Freigabe exakt den geprüften SHA256-Fingerabdruck nur in CurrentUser Root importiert und gespeicherten Fingerabdruck bestätigt. Kein Systemstore verändert, keine HTTPS-Warnung umgangen.

Betreiber meldete zunächst fehlende Zugangsdaten. Vorhandene geschützte Einrichtungsdatei lokal auffindbar gemacht und auf ausdrücklichen Wunsch in Visual Studio Code geöffnet, keine Werte im Chat ausgegeben und keine Passwörter/MFA zurückgesetzt. Betreiber bestätigt anschließend die reguläre Anmeldung; Adminbereich und geschützte Exportansicht tatsächlich im Browser sichtbar.

Gültiges Inhaltspaket für den vorhandenen Veranstaltungsstand erzeugt und über diese Sitzung heruntergeladen. Bestand enthält keine Shows/Medien; keine Testshow erfunden. Öffentlichen Serverschlüssel authentifiziert heruntergeladen und seinen Fingerabdruck unabhängig über die bestätigte SSH-Verbindung erfolgreich mit der VM-Ableitung verglichen; Ergebnis im strukturierten Produktivnachweis bestätigt. Inhaltspaket und ausdrücklich geprüften Serverschlüssel erfolgreich mit installiertem 0.3.6-CLI in das bestehende lokale Profil importiert; private Dateien außerhalb OneDrive/Git mit Benutzer-/SYSTEM-ACL.

Automatisierte Browser-Dateiauswahl meldete die öffentliche Zielanfrage ungültig, obwohl lokale Prüfung korrektes JSON, Schema 1 und RSA/3072 Bit bestätigt. Manuelle Auswahl angefordert und öffentliche, hashidentische Kopie in Downloads bereitgestellt. Betreiber hat den verschlüsselten Anmeldestand anschließend heruntergeladen; Profil/Schlüssel nicht neu erzeugt.

Erster Import mit unverändertem installiertem CLI abgewiesen: der neu exportierte Anmeldestand bindet ein erneut erzeugtes Inhaltspaket, lokal lag nur das vorherige. Eine getrennte Diagnosekopie mit ausschließlich erlaubten Fehlerkennungen/Paketkennungen zeigte das fehlende Paket; keine Anmeldewerte ausgegeben oder kryptografischen Prüfungen verändert. Passendes Paket über bestehende authentifizierte Browseransicht heruntergeladen/importiert; anschließend originalen CLI-Import erfolgreich wiederholt. SQLite lesend bestätigt: Snapshot vorhanden, ein lokaler Benutzer. Vorheriges Paket erhalten.

Installierte Node-/Serverlaufzeit manuell und ohne Autostart im Modus `run` gestartet; Prozess-/Listenerzuordnung geprüft. Kein Renderer, keine Geräte-/Liveausgabe. Privates Prozessprotokoll und Logs unter `%LOCALAPPDATA%/ShowNight/operations/local-onboarding-20261014`. HTTPS-Prüfung mit öffentlichem Zertifikat als explizitem CA und vollständiger Hostprüfung: Seite 200, `/health/live` 200/offline-preparation, unangemeldetes `/api/local/me` 401. Erste Probe übergab das DER-Zertifikat unmittelbar als CA; nach korrekter PEM-Konvertierung bestanden, keine TLS-Prüfung abgeschaltet. Nach Benutzer-Zertifikatimport reale lokale Anmeldeseite ohne Browserwarnung geöffnet. Persönliche lokale MFA-Anmeldung durch Betreiber bestätigt; angemeldete Oberfläche ohne Recoveryanzeige und aktive MFA-Sitzung per lesender Existenzprüfung bestätigt. Keine Recoverycodes oder Sitzungstoken erfasst.

Kleinen abschließenden lokalen KI-Review eingeordnet: behauptete fehlende Signatur-/Ziel- und Hostnachweise treffen auf diesen tatsächlich ausgeführten Pfad nicht zu. Unveränderter installierter Import prüft Signatur/Ziel/Manifestbindung; abgewiesenes fehlendes Paket zeigt die aktive Bindungsprüfung. Node-HTTPS prüft bei explizitem CA, Host localhost und rejectUnauthorized=true standardmäßig die Hostidentität; tatsächlicher Browserzugriff ohne Zwischenwarnung zusätzlich beobachtet. Keine Modellbehauptung als Fehler oder Freigabe übernommen.

Lokale KI für begrenzten Dokumentationsreview genutzt. Hinweise zur eindeutigen Sicherungszuordnung und zum aktuellen Wartungsstand geprüft und oben konkretisiert. Installierte lokale Hinweise vor dem Nachweispaket eng gefiltert abgerufen; vor Abschluss acht historische Protokollhinweise und fünf gezielte Folgehinweise gesichtet und privat triagiert. Keine konkreten Betriebsfehler daraus bestätigt; allgemeine unbelegte Aussagen verworfen, separate Szenen-/Rechte-/Clienttestfragen privat für ein gegebenenfalls beauftragtes Fachpaket aufgeschoben und hier nicht als erledigt bezeichnet. Keine Modelltexte oder privaten Zustandsdaten veröffentlicht. Modelltext ist kein Nachweis. Umfangreiche Hardware-/LAN-/HDMI-/Ton-/Veranstaltungsprüfungen bleiben offen; kein neuer Nachweis nicht leerer Medien, da der Bestand null Mediendateien umfasst.
