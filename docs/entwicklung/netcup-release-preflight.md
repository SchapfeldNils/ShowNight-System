# Netcup: vollständiger Releasekandidat und isolierte Updateprüfung

15. Oktober 2026 · F50/A17, F30/A18, F12/F28 · Issue #36 · in Arbeit auf `codex/netcup-release-preflight`, Basis PR #35 / `460bb1de75e42fa05ccf23909c10d97428f30c90`. Kein Produktivupdate und keine Mergefreigabe.

## Tatsächlicher Ausgangsbestand

Lesende Portainer-HTTPS-GET-Inventur am 15.10.2026, 00:35:30 MESZ: Endpoint 3 DEWES-NET-PV001, Stack 23 shownight aktiv. App und Worker ARM64-Image `shownight:1c983fc01c98916fc782422f19e67567821bdaaa-arm64`, Image-/RepoDigest `sha256:de17514bbe2e87821cfc6cf5e3e6e5ba7bfaf73a2d6395dfce8e3dd12862acd3`. Öffentliches HTTPS `/health/ready` 200 / Schema 4. App und PostgreSQL `17.9-bookworm` gesund, Worker läuft ohne eigenen Healthcheck. Alle drei Dienste `unless-stopped`, Neustartzähler 0, keine Hostportbindungen. Mailversand im Stack sowie App/Worker deaktiviert. Tatsächliche persistente Volumes `shownight-s3-recovery-20261014-database` und `shownight-s3-recovery-20261014-media`; Worker greift schreibgeschützt auf Medien zu. Keine Docker-Exec-/POST-/Änderungsaktion. Providerbackup, Zeitplan/Retention, unabhängige Archiv-/Kennwortziele und echter Produktivrestore daraus nicht nachgewiesen.

## Bewusst gewählte Basis

PR #22 enthält die vollständigen Migrationen 001–005 sowie bereits die Onlinekorrekturen für MFA/Rechte, Teamverwaltung, Einladungen, Medien-/Pakete, WSS und persistenten Mailmodus. PR #35 ergänzt die geprüfte Sicherungshärtung. Die darüberliegenden lokalen PRs bis #30 ändern keinen zusätzlichen API-/Web-/Transfer-/Docker-/Compose-Code für den Onlinebetrieb und sind für diesen Kandidaten nicht erforderlich.

Die konkrete Worker-Korrektur aus PR #34 / `dd28868da5d483df85a43dda85809e0d16d78ce4` wird hier mit unverändertem Runtime-/Regressionstestdiff integriert; Paket-/Workfloweinträge werden in der vorhandenen vollständigen Basis ergänzt. Anders als der isolierte S1-Branch enthält dieser Kandidat alle Migrationen 001–005. Keine zusätzlichen Fachfunktionen oder neue Rechte-/Ausfallregeln.

## Arbeitsteilung und ausstehende Nachweise

Root integriert Worker, dokumentiert Bestand und Kandidat. Ein Subagent implementiert die isolierte Containerprüfung und deren eigene AMD64-/ARM64-CI; ein zweiter die HTTP-/MFA-/Medienprobe. Ein nicht implementierender Reviewer prüft den vollständigen Diff und später die Nachweise. Eindeutige Dateibereiche, keine konkurrierenden Änderungen.

Geplant: alten Code exakt aus Produktionsruntime-Commit als synthetischen Schema-4-Stack bauen, anmelden/MFA einrichten und synthetische Inhalte erfassen. Verschlüsseltes Vorabbackup, Entschlüsselung und Restore in neue getrennte Volumes, Migration auf 5, wiederholte Migration und erneute API-/MFA-/Medienhashprüfung. Rückkehr durch dasselbe Vorabbackup in einen dritten frischen Stack mit altem Code, keine Schema-Downgrade-SQL. Alle Ausgaben/Mail aus. Der aus Quellcode neu gebaute alte Container ist nicht bitidentisch zum tatsächlichen Produktionsdigest; dies bleibt ein isolierter Softwarenachweis.

Lokal auf Windows x64/Node 24.19.0 Typprüfung und integrierte PostgreSQL-/FFmpeg-Claimregression 11/11 bestanden; Probe-Bordmitteltests 2/2 bestanden. Noch kein vollständiger Container-/Upgrade-/CI-Nachweis für diesen Kandidaten. Vor einer späteren konkreten Betreiberfreigabe fehlen Zielbackup mit überprüfter unabhängiger Kopie und Kennwortverwahrung, exakter wirksamer privater Stackstand, Erhalt der tatsächlichen Volumen-/Proxyzuordnung, altes exaktes Image als Rückkehrartefakt, gemeinsam gestoppte alte App/Worker und Zielnachweise. Keine alten ungeschützten Worker neben dem korrigierten Worker betreiben. Keine Freigabe allein aus CI, Creditreset oder Quellcodeprüfung. Hardware-/Veranstaltungsfreigabe bleibt offen.
## Spätere konkrete Betreiberfreigabe

Der aktuelle Auftrag erlaubt Vorbereitung und isolierte Prüfung. Er erlaubt keinen Merge oder Austausch des laufenden Netcup-Stacks. Eine spätere Freigabe muss sich auf den konkreten geprüften Kandidatencommit und das zugehörige ARM64-Image mit Archivhash/Image-ID beziehen, nicht auf einen beweglichen Branch oder ein anderes erfolgreiches Image.

Vor dem Wartungsfenster: wirksamen privaten Portainer-/Compose-Stand einschließlich ORIGINAL-MFA-Schlüssel sichern; tatsächlich belegte Volumes, Proxyalias/-netz und SMTP-Auszustand erhalten. Neues verschlüsseltes Backup erstellen und unabhängig von der VM ablegen, Hash und Entschlüsselbarkeit bestätigen sowie isolierten Restore prüfen. Exaktes altes Produktionsimage mit Digest und private Wiederanlaufkonfiguration sichern. Ziel-/Rückkehrvolumes müssen frisch und von den produktiven getrennt sein. Unabhängige Kennwortverwahrung und verfügbare verantwortliche Person klären.

Im erst später freizugebenden Wartungsablauf alte App UND alten Worker gemeinsam stoppen. Kein gleichzeitiger alter ungefencter Worker. Keine echten E-Mails oder Geräteaktionen aus Prüfungen. Kandidat zuerst gegen restaurierte getrennte Daten prüfen und erst nach dessen Zielnachweisen den konkreten Umschaltablauf freigeben. Rückkehr erfolgt durch Vorabbackup und altes Image in passenden getrennten Volumes; keine improvisierte Rückmigration von Schema 5 nach 4. Nach dem Fenster tatsächliche Image-/Schema-/MFA-/Medien-/Mail-Aus-/Workerbefunde protokollieren. Ein laufender Worker ohne Healthcheck beweist keinen Arbeitsfortschritt.

Diese Anleitung ist eine prüfbare Vorbereitung, kein ausgeführtes Wartungsprotokoll. Öffentliches Repository enthält ausschließlich synthetische Testdaten und freigegebene technische Metadaten, keine privaten Konfigurationen oder Anmeldeinformationen.