# Netcup: technische Vorabprüfung Schema 6 → 7

Stand: 15\. Oktober 2026. Vorbereitung durch Codex auf ausdrücklichen Betreiberauftrag, unabhängig von Claudes Korrektur der Updateanleitung in [PR #53](https://github.com/SchapfeldNils/ShowNight-System/pull/53). Arbeits-/Ausführungsissue: [#54](https://github.com/SchapfeldNils/ShowNight-System/issues/54). **Keine produktive Umschaltung, Dienstunterbrechung oder frische Produktivsicherung ausgeführt.**

## Festgelegter Prüfkandidat und Umfang

- Commit `0834409abfbda494841ad4c47d79153cd8f0f3f6` auf `main`, nach Merge von #55.
- Enthalten: gespeicherte Stage-Timer-/Hinweisvorbereitung und persönliche stumme Browserprobe (#42), Szeneneditor mit korrigierter Freigabe und Geometrie (#55).
- Nicht enthalten: Ticketvorbereitung (#49), Softwareupdate-Verteilung (#52), Showablauf (#56), echte Bühnen-/Ton-/Lichtausgabe. Diese PRs sind keine Voraussetzung für den begrenzten Onlineumfang.
- S1-Pushprüfung am exakten Commit: [38757414099](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38757414099), erfolgreich.

## Tatsächlich lesend geprüfter Produktivbestand

Abfrage am 15. Oktober 2026 um 15:26 UTC über HTTPS-GET und SSH mit vorhandenem festem Hostschlüssel. Private Zugangsdaten wurden ausschließlich lokal eingelesen; kein Docker-Exec, Dienststopp oder Stack-Update.

| Merkmal | Befund |
| --- | --- |
| Öffentliche Bereitschaft | `ready`, Schema 6 |
| Portainer | Version 2.45.2, Endpoint 3, Stack 23 `shownight` |
| App und Worker | Runtime `f232483fd04f47dfa8c973fe1892859a3e84d27b`, ARM64, Image `sha256:529010a8c9ed7fe768602cddc131b2fa727e21c2d01ab61495d416da5a0d2e1d` |
| Dienste | App gesund, PostgreSQL gesund, Worker läuft; alle Neustartzähler 0. Worker ohne eigenen Healthcheck: kein Beleg für Fortschritt einzelner Aufträge. |
| Datenbank | `postgres:17.9-bookworm`, Volume `shownight-online-f232-20261015-database` |
| Medien | Volume `shownight-online-f232-20261015-media`; Worker lesend, App schreibend |
| Netz/Ports | Vorhandene Backend-/Proxyanbindung, keine Hostportbindungen der drei Dienste |
| Mail | `MAIL_DELIVERY_ENABLED=true`; keine Testmail ausgelöst |
| Speicherplatz | 464.373.288.960 Byte verfügbar auf dem Docker-Dateisystem; noch keine Aussage über die Größe eines frischen Backups |

## Portainer-Fehlerstatus verändert den Wartungsablauf

Stackstatus ist **4 (Deployment fehlgeschlagen)**, obwohl die tatsächlichen Dienste laufen. Die gespeicherte Fehlermeldung des letzten Deploymentversuchs lautet: `removal of container ... is already in progress`. Das ist ein historischer Deploymentfehler; eine aktuell laufende Entfernung ist daraus nicht bewiesen.

Für die installierte Version 2.45.2 wurde der offizielle Quellcode unabhängig geprüft:

1. [PrepareStackStatusForDeployment](https://github.com/portainer/portainer/blob/2.45.2/api/stacks/stackutils/stack_status.go) überschreibt `DeploymentStartStatus` mit dem aktuellen Stackstatus. Der gespeicherte alte Wert 1 schützt daher nicht vor dem Fehlerpfad.
2. Der [Updatehandler](https://github.com/portainer/portainer/blob/2.45.2/api/http/handler/stacks/stack_update.go) führt bei diesem Ausgangsstatus zunächst `Undeploy`, anschließend `Deploy` aus. HTTP 200 bestätigt nur den gestarteten Auftrag.
3. [Compose-Undeploy](https://github.com/portainer/portainer/blob/2.45.2/api/exec/compose_stack.go) verwendet den Projektnamen; [Compose Down](https://github.com/portainer/portainer/blob/2.45.2/pkg/libstack/compose/composeplugin.go) fordert `RemoveOrphans:true`, aber `Volumes:false` an. Benannte Volumes werden auf diesem Pfad nicht zur Löschung angefordert; Container einschließlich PostgreSQL und Projektnetz können neu erstellt werden.

Folge: Kein kosmetischer Statusreset oder reparierender PUT während laufender Nutzung. Vollständigen Stackneustart im Wartungsfenster berücksichtigen, aktuelle Container nach Neubau neu ermitteln und die ursprünglichen Volumes sowie externe Proxyanbindung bewahren. Abschluss anhand Deploymentstatus **und** tatsächlich laufenden Images, Mounts, Health und Schema bestätigen.

## Isolierte Update- und Rückfallprobe

[Rehearsal 38759884920](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38759884920) wurde gezielt für den oben genannten Commit gestartet; dessen SHA anschließend direkt überprüft. ARM64 und AMD64 sind erfolgreich.

Beide Originalnachweise bestätigen Schema 6 → 7, zweimalige Migration, verschlüsseltes Backup, Wiederherstellung, ursprünglichen MFA-Schlüssel aus demselben Archiv, Bestands-/Medienprüfung und Rückkehr auf Schema 6. Mailversand in der Probe ist aus. Die Ergebnisse kennzeichnen ausdrücklich `syntheticOnly:true`, `baselineRebuilt:true` und `productionDigestMatched:false`.

Das ist ein Software-/CI-Nachweis und ersetzt keinen frischen Restore tatsächlicher Produktivdaten mit dem vorhandenen alten Produktionsimage. Die Prüfcontainer haben keine produktiven Daten oder Volumes verwendet.

Das S1-ARM64-Image wurde zusätzlich lokal heruntergeladen und gehasht. Für die spätere Umschaltung wird das **separat exportierte, exakt im Rehearsal getestete Image** gebunden; die beiden Builds sind nicht austauschbar.

| Gebundenes Rehearsal-Artefakt | Lokal geprüfter Wert |
| --- | --- |
| GitHub-Artefakt | `netcup-release-candidate-arm64`, ID `11984788808` |
| Imagearchiv | `shownight-arm64.tar.gz`, 239.335.882 Byte |
| SHA256 des Imagearchivs | `a2591c6f0f96379c61c5223b55379cf7e20349c6faec70585f561b65bd56dfb2` |
| Image-Konfigurations-ID | `sha256:993ccfec69a225a515e235ee6996c258ddc439ffe7cfcd49b63f493a79b99996` |
| Plattform/Tag | `linux/arm64`, `shownight:0834409abfbda494841ad4c47d79153cd8f0f3f6-arm64` |

SHA256 wurde lokal neu berechnet und stimmt mit der enthaltenen Prüfsummendatei überein. Konfiguration aus dem Docker-Archiv tatsächlich gelesen und gehasht; sie stimmt mit `candidateImageID` des Original-Rehearsalnachweises überein. Der von GitHub gemeldete äußere ZIP-Digest ist separat im JSON vermerkt; er wurde nicht unabhängig aus den äußeren ZIP-Bytes nachgerechnet. Das Image wurde nicht auf die VM geladen.

[Maschinenlesbare Archivprüfung](nachweise/netcup-schema7-vorabpruefung.json), unveränderte Originalergebnisse [ARM64](nachweise/netcup-schema7-arm64.json) und [AMD64](nachweise/netcup-schema7-amd64.json). Der Docker-Archiv-SHA256 ist die spätere Vergleichsgrundlage auf der VM; dort ist zusätzlich der vollständige Konfigurations-/RootFS-Abgleich nötig.

## Noch vor der Umschaltung erforderlich

- Claudes korrigierte, gegen die tatsächlichen Backupskripte geprüfte Anleitung: `backup.sh` verlangt laufende App und Worker, stoppt und startet sie selbst. Vorheriger manueller Stopp würde den Sicherungsaufruf abbrechen. Schreibstillstand über Backup, Restoreprobe und Umschaltung muss ausdrücklich gewährleistet sein.
- Exaktes ARM64-Archiv prüfen; bei Übertragung zur VM dort erneut hashen und Imagekonfiguration/RootFS mit dem CI-Artefakt vergleichen. Altes exaktes Image und wirksame private Stackkonfiguration einschließlich ursprünglichem MFA-Schlüssel erhalten.
- Konkrete Betreiberfreigabe für Commit, Image und Wartungsfenster. Der Vorbereitungsauftrag erlaubt noch keine Unterbrechung.
- Frisches konsistentes Backup, verschlüsselte unabhängige Windows-Kopie außerhalb OneDrive/Git, tatsächliche Entschlüsselung und Hashvergleich.
- Restore in neue leere isolierte Volumes, Mail aus; zuerst altes Produktionsimage, dann Zielmigration, Bestandsvergleich und passende Funktionsprobe. Ursprüngliche Produktivvolumes bleiben unverändert als Rückweg.
- Nach Umschaltung öffentliche Bereitschaft, bestehende Anmeldung/MFA, Show-/Medienbestand, Timer-/Hinweisvorbereitung und Editor einschließlich Speichern/Neuladen prüfen. Kein echter Geräte-/Mailtest.

Rückweg: altes exaktes Image und ursprüngliche Volumes, keine SQL-Rückmigration. Nach neuen Benutzereingaben keine automatische Rückkehr über diese Daten. Regelmäßiger Sicherungsbetrieb und reale Hardware-/Veranstaltungsabnahmen bleiben offen.
