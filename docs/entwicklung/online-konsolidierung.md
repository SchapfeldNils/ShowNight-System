# Gemeinsame, nutzbare Online-Version

15\. Oktober 2026 · F30/A18, F01/F05/F12/F25, F28/A03/A04. Nutzer priorisiert eine sichtbare Online-Version und autorisiert das Zusammenführen geeigneter geprüfter Entwicklungsstände. Die automatische Fortsetzung bleibt pausiert; dieser manuelle Auftrag wird ausgeführt. Kein Produktivupdate aus einer Mergefreigabe ableiten.

## Eine gemeinsame Basis

Arbeitsbranch `codex/online-visible-release`. Integriert: PR #30 (`3cdcc376`) einschließlich seiner S2/S3-/Installer-/Konten-/Renderer-Vorgänger, vollständiger Netcup-Kandidat PR #37 (`d88a891`) mit Sicherungshärtung und Workerkorrektur sowie aktuelles main (`cd71423`). Mergezwischenstände `b492b8c` und `336a0d0`. Nur README, Status und Arbeitsliste hatten Inhaltskonflikte; beide Nachweisstände erhalten. Keine direkte Entwicklung auf main. Ein neuer Gesamt-PR gegen main ersetzt die Notwendigkeit, alle historischen Zwischenzweige nacheinander zu mergen.

PR #23 und #26 sind historische Betriebs-/Prüfdokumentationszweige, keine neue Produktbasis. Ihre bekannten Befunde wurden triagiert. Ein neuer gemeinsamer Commit benötigt eigene Prüfungen; alte erfolgreiche CI und alte Images sind kein Nachweis dieses Kandidaten.

## Sichtbare Kontofunktionen

- `Mein Konto` und `Abmelden` im oberen Bereich, unabhängig vom unteren Ende der Seitenleiste.
- Tatsächlicher alter Abmeldefehler reproduziert: leerer POST mit JSON-Content-Type wurde von Fastify vor der Route abgewiesen. Header jetzt nur für tatsächlich vorhandene JSON-Inhalte.
- Eigenes Passwort mit aktuellem Kennwort und Wiederholung ändern; danach erneute Online-Anmeldung auf allen Geräten. MFA, Recoverycodes und Rollen bleiben erhalten. Alte Antworten/Verbindungen dürfen private Daten nicht wieder einblenden.
- Je Konto eine eigene bestätigte, normalisierte E-Mail-Adresse (Betreiberentscheidung vom 15. Oktober). Bestätigungsmail und Passwortreset mit ShowNight-HTML und Klartext. Links mit Einmaltoken, Ablauf, neuer Anfrage und Widerruf; kein MFA-Reset durch E-Mail.
- Mail-Test-/Ausmodus zeigt ausdrücklich, dass keine echte Nachricht verschickt wird. Bereits vorbereitete Offlinekonten behalten ihren gesonderten Stand.

Migration 006 ergänzt Mailadressen, gehashte Kontotoken und optionalen HTML-Mailinhalt. Aktueller Kandidat benötigt Schema 6; isolierter Update-/Rückkehrlauf wird von bisheriger Produktionscode-Baseline Schema 4 auf 6 angepasst. Kein improvisierter Schema-Downgrade; Rückkehr über Vorabbackup und altes Image.

## Gezielte Restkorrekturen für den Gesamtmerge

Eigener WELCOME-Timeout und serverseitiger Heartbeat-Timeout bleiben vorübergehende Verbindungsfehler; echte Policy-Ablehnung bleibt endgültig. CER/PFX samt privatem Schlüssel werden auf Übereinstimmung geprüft, ohne Zertifikatsvertrauen zu verändern. Offline-Anmeldekollisionen brechen verständlich und atomar ab, ohne Konten automatisch zusammenzuführen. Keine neuen lokalen Fachfunktionen und kein Hardwarebeleg.

## Prüfstand und Lieferung

Runtime `f232483fd04f47dfa8c973fe1892859a3e84d27b`, [Gesamt-PR #38](https://github.com/SchapfeldNils/ShowNight-System/pull/38): Build/Typprüfung, 14/14 echte PostgreSQL-Kontoprüfungen einschließlich CLI-Recovery und Nebenläufigkeit, 2/2 echte Konto-/Mailbrowserabläufe auf Desktop/Mobil, 5/5 Szenenintegration sowie gezielte Windows-/Socket-/Vorlagenprüfungen bestanden. Vollständiger unabhängiger Code-Review und Nachprüfung bestätigter Sicherheitskorrekturen ohne verbleibende bestätigte Codeblocker. Alle vier neuen CI-Workflows erfolgreich: [S1 38654029540](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38654029540) auf Windows/AMD64/ARM64, [Schema4→6/Rückkehr 38654029557](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38654029557) AMD64/ARM64, [Native38654029528](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38654029528), [Installer38654029597](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38654029597). Alte Szenenschema-Erwartung 5 schlug in der ersten CI berechtigt fehl, auf neue 6 korrigiert und Szenensuite lokal 5/5 sowie Gesamt-CI erneut erfolgreich. Jeder Abschlussnachweis wird an den konkreten Runtimecommit gebunden. Neue Paketbefehle `pnpm test:account`, vorhandene `pnpm test`, `pnpm test:browser`, `pnpm test:worker-claims`, S1- und native/Installerprüfungen sowie neue Rehearsal-CI verwenden.

Die Vorlage wurde mit synthetischen Daten auf Desktop/Mobil gerendert. SMTP-Verbindung, TLS und Anmeldung mit vorhandener privater Konfiguration durch `nodemailer.verify` erfolgreich, keine Nachricht versendet. Keine Käuferdaten, Kennwörter, MFA-/Resetcodes in Git oder Screenshots. Praktische Zustellung und tatsächliche Produktionsbereitstellung sind noch offen.

Lieferkriterien: Kontoablauf im Browser bestanden, bestehende Veranstaltungs-/Show-/Medienabläufe erhalten, unabhängiger Review ohne offene bestätigte Blocker, passende CI für den gemeinsamen Stand erfolgreich, ein nachvollziehbarer Gesamtmerge. Danach konkrete Freigabe für den produktiven Onlinewechsel mit frischem geprüftem Backup, altem Rückkehrimage und unveränderter Volumen-/Proxyzuordnung. Erst die tatsächliche URL-Prüfung nach Bereitstellung bestätigt Verfügbarkeit beim Betreiber.

Ticketshop F38–F43/A24–A27 und Stage Timer F20/A10 bleiben ausdrücklich offene Produktlieferungen. Der gemeinsame Codebestand ist keine vollständige Veranstaltungsfreigabe.

[Kombinierter Nachweis](nachweise/online-konsolidierung.json), originale Rehearsalergebnisse [AMD64](nachweise/online-release-amd64.json)/[ARM64](nachweise/online-release-arm64.json). Exakt im Rehearsal geprüftes ARM64-Image lokal Git-ignoriert unter `.local/artifacts/online-f232/candidate-arm64/shownight-arm64.tar.gz` gesichert: 239339727 Bytes, SHA256 `bab305c3032d558770efa57bf19a488565548698bb0a7a5b6d627f54077a56e5`, Image-ID `sha256:d0736b5ceb95ff4b4a33d6e43d24cbd87e0e37e0e0bc7bb44cce3af88eae44b7`. ZIP und inneres Archiv separat geprüft. Nicht mit separat neu gebautem S1-Artefakt verwechseln. Rückkehrbaseline wurde aus altem Code neu gebaut und ist nicht der bitidentische tatsächliche Produktionsdigest. Noch keine Produktivbereitstellung.
