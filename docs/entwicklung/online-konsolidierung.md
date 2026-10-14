# Gemeinsame, nutzbare Online-Version

15. Oktober 2026 · F30/A18, F01/F05/F12/F25, F28/A03/A04. Nutzer priorisiert eine sichtbare Online-Version und autorisiert das Zusammenführen geeigneter geprüfter Entwicklungsstände. Die automatische Fortsetzung bleibt pausiert; dieser manuelle Auftrag wird ausgeführt. Kein Produktivupdate aus einer Mergefreigabe ableiten.

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

Build/Typprüfung und erste echte PostgreSQL-/Windows-/Socketprüfungen bestanden; endgültige Browser-, Gesamt-CI- und unabhängige Gesamtprüfung noch in Arbeit. Jeder Abschlussnachweis wird an den konkreten Runtimecommit gebunden. Neue Paketbefehle `pnpm test:account`, vorhandene `pnpm test`, `pnpm test:browser`, `pnpm test:worker-claims`, S1- und native/Installerprüfungen sowie neue Rehearsal-CI verwenden.

Die Vorlage wurde mit synthetischen Daten auf Desktop/Mobil gerendert. SMTP-Verbindung, TLS und Anmeldung mit vorhandener privater Konfiguration durch `nodemailer.verify` erfolgreich, keine Nachricht versendet. Keine Käuferdaten, Kennwörter, MFA-/Resetcodes in Git oder Screenshots. Praktische Zustellung und tatsächliche Produktionsbereitstellung sind noch offen.

Lieferkriterien: Kontoablauf im Browser bestanden, bestehende Veranstaltungs-/Show-/Medienabläufe erhalten, unabhängiger Review ohne offene bestätigte Blocker, passende CI für den gemeinsamen Stand erfolgreich, ein nachvollziehbarer Gesamtmerge. Danach konkrete Freigabe für den produktiven Onlinewechsel mit frischem geprüftem Backup, altem Rückkehrimage und unveränderter Volumen-/Proxyzuordnung. Erst die tatsächliche URL-Prüfung nach Bereitstellung bestätigt Verfügbarkeit beim Betreiber.

Ticketshop F38–F43/A24–A27 und Stage Timer F20/A10 bleiben ausdrücklich offene Produktlieferungen. Der gemeinsame Codebestand ist keine vollständige Veranstaltungsfreigabe.
