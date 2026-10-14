# Abschlussplan für die geprüften Pull Requests

Stand: 14. Oktober 2026. Dieser Plan hält die Ergebnisse von 13 voneinander unabhängigen, lesenden Sub-Agent-Prüfungen fest. Geprüft wurden jeweils das verbundene GitHub-Konto `SchapfeldNils`, die damalige Base und der Head, die Merge-Base, der vollständige PR-Diff, vorhandene Reviews und CI-Nachweise. Die Zeilen sind **Arbeitsaufträge**, keine nachträglich ausgeführten Korrekturen, Merge-Freigaben oder Hardwareabnahmen. Vor jeder Umsetzung und jedem Merge den aktuellen GitHub-Stand erneut lesen.

Während der Prüfung wurde [PR #2](https://github.com/SchapfeldNils/ShowNight-System/pull/2) gemergt. [#14](https://github.com/SchapfeldNils/ShowNight-System/pull/14) und [#19](https://github.com/SchapfeldNils/ShowNight-System/pull/19) wurden ungemergt geschlossen; ein Schließgrund war aus den verfügbaren PR-Daten nicht belegbar. Die übrigen zehn PRs waren zuletzt offen und Draft. Die folgenden Head-Kürzel identifizieren ausschließlich die geprüften Stände.

## Vorrang und Integrationsfolge

1. Den in #2 gemeldeten Medienworker-Wettlauf am bereits gemergten Stand mit einem eigenen Korrektur-PR prüfen und beheben. Produktive App-/Worker-Updates bleiben ein gesonderter Betriebsschritt.
2. Für die offenen, gestapelten Arbeitspakete die konkrete Kette **#5 → #7 → #9 → #11 → #13 → #16 → #18 → #21** bearbeiten. Die Fehler eines PR vor seiner Integration beheben. Nach jedem Merge die nächste Base, Merge-Base, den vollständigen Diff und die Checks neu prüfen; bei Squash-Merges können Rebase oder gezieltes Übernehmen nötig sein. Draftstatus und unabhängiges Review bewusst klären. Der alte Base-Branch eines PR ist kein Nachweis, dass er bereits sauber auf `main` liegt.
3. [#22](https://github.com/SchapfeldNils/ShowNight-System/pull/22) und [#23](https://github.com/SchapfeldNils/ShowNight-System/pull/23) hängen von #21 ab. #23 hatte beim Review bereits einen Mergekonflikt mit dem neueren #21-Head. Beide danach erneut vergleichen und ihre eigenen Punkte abarbeiten.
4. Die geschlossenen KI-Werkzeug-PRs #14 und #19 nur dann wieder öffnen oder in neue Arbeitspakete übernehmen, wenn diese optionale Entwicklungsarbeit weitergeführt werden soll. Sie sind keine Voraussetzung für die Produktkette.

## Einzelmaßnahmen

### [#2 – S1-Onlinevorbereitung](https://github.com/SchapfeldNils/ShowNight-System/pull/2), geprüft `ffefe65e`, inzwischen gemergt

Die sieben alten Reviewthreads waren erledigt und ihre Korrekturen samt Tests nachvollziehbar. **Neuer P2-Befund als Nacharbeit:** In [`worker.ts`](https://github.com/SchapfeldNils/ShowNight-System/blob/ffefe65e101098f6636a8127054304ccb291dff0/apps/api/src/worker.ts#L12) dauert die Lease zwei Minuten, während mehrere Prüfprozesse zusammen länger laufen können. Ein zweiter Worker kann denselben Datensatz übernehmen; spätere Abschlussupdates prüfen den gültigen Claim nicht. Mit zwei verzögerten Workern reproduzieren, Abschlussupdates an Claim/Lease binden und den endgültigen Medienstatus testen. Da #2 bereits gemergt ist, diese Korrektur auf einem eigenen Branch/PR gegen den aktuellen `main` vornehmen.

### [#5 – Windows-Agent](https://github.com/SchapfeldNils/ShowNight-System/pull/5), geprüft `1209c4ad`

**P2:** [`client.ts`](https://github.com/SchapfeldNils/ShowNight-System/blob/1209c4addedfcde1a300f0d75c4b8aa4ede62ed7/apps/agent/src/client.ts#L45) schließt nach zwölf Sekunden ohne WELCOME mit Code 1008; der Client behandelt 1008 als dauerhafte Ablehnung und stoppt die Wiederverbindung. Den lokalen Timeout als wiederholbaren Transportfehler behandeln und eine verzögerte WELCOME-Antwort mit anschließender erfolgreicher Neuverbindung testen. Danach #5 auf die dann gültige S1-Basis beziehen und die aktuellen Checks prüfen.

### [#7 – lokale Paketablage](https://github.com/SchapfeldNils/ShowNight-System/pull/7), geprüft `75849027`

Im vollständigen Diff kein belegter neuer Fehler. Nach #5 Base/Diff/Checks neu prüfen, unabhängiges Review einholen und die historischen Commit-/CI-Angaben der PR-Beschreibung auf den tatsächlich integrierten Stand bringen. Der Paketimport ersetzt keine Offlinekonten oder Showfreigabe.

### [#9 – lokaler HTTPS-Server und Offlinekonten](https://github.com/SchapfeldNils/ShowNight-System/pull/9), geprüft `81e2e7a5`

**P1 – Rechte:** [`accounts.ts`](https://github.com/SchapfeldNils/ShowNight-System/blob/81e2e7a5bf38f9071afd7624555604c73389fd53/apps/local/src/accounts.ts#L378) erlaubt einer Eventleitung beim lokalen Anlegen die Rolle `technik`, obwohl die Online-API diese Vergabe untersagt. Identische Rollenregel durchsetzen und den Leitungsfall testen.

**P2 – Quellenimport:** [`accounts.ts`](https://github.com/SchapfeldNils/ShowNight-System/blob/81e2e7a5bf38f9071afd7624555604c73389fd53/apps/local/src/accounts.ts#L141) importiert nach ID, während lokale Logins eindeutig und lokale Konten erhalten bleiben. Ein unabhängiges Quellkonto mit gleichem Login kann die ganze Transaktion samt Rechteentzug/Sitzungswiderruf zurückrollen. Konflikt vorab erkennen, sichere Behandlung für veraltete Rechte definieren und den Import-/Widerrufsfall testen.

### [#11 – LAN-Einrichtung](https://github.com/SchapfeldNils/ShowNight-System/pull/11), geprüft `80a1370c`

**P2:** [`server-main.ts`](https://github.com/SchapfeldNils/ShowNight-System/blob/80a1370c6841bf9d1ad346bedd8ea37a9d7a9011/apps/local/src/server-main.ts#L82) prüft und meldet den Fingerabdruck von `server.cer`, während TLS aus `server.pfx` bedient wird. Bei abweichenden Dateien kann die Diagnose bestehen und das dokumentierte Clientvertrauen scheitern. Beide Zertifikate vor Diagnose und Start vergleichen oder den Fingerabdruck aus dem tatsächlich geladenen Zertifikat ableiten; Negativtest ergänzen.

### [#13 – Renderer und Windows-Setup](https://github.com/SchapfeldNils/ShowNight-System/pull/13), geprüft `2e947279`

Kein belegter neuer Diff-Fehler; S1-, Renderer- und Installerchecks des geprüften Heads waren grün. Nach der korrigierten Basis #11 erneut vergleichen und Review einholen. Die synthetische Bilddiagnose ist kein HDMI-, Ton- oder Bühnenbetrieb.

### [#16 – Paketmedien im Renderer](https://github.com/SchapfeldNils/ShowNight-System/pull/16), geprüft `a74a04e7`

Kein belegter neuer Diff-Fehler; die drei Workflows des geprüften Heads waren grün. Nach #13 Base/Diff und Checks erneut prüfen und Review einholen. Die stumme Einzelmediendiagnose ersetzt keinen vollständigen Szenen- oder Showablauf.

### [#18 – Szenenentwürfe](https://github.com/SchapfeldNils/ShowNight-System/pull/18), geprüft `4d5e5b2c`

**P2 – führende Nachweise:** [Status](https://github.com/SchapfeldNils/ShowNight-System/blob/4d5e5b2c956601976085d896509f82727925e065/docs/entwicklung/status.md#L7), Szenenanleitung, Nachweis-JSON und PR-Beschreibung bezeichnen noch `1c983fc` beziehungsweise Schema 4 als Abschlussstand. Der geprüfte Head enthält Migration 005 und erwartet Schema 5. Aktuelle Software-/CI-Nachweise ergänzen und alte Setup-Prüfsummen ausdrücklich dem historischen Build zuordnen. Danach mit der korrigierten Basis #16 neu vergleichen.

### [#21 – Windows-Erststart](https://github.com/SchapfeldNils/ShowNight-System/pull/21), geprüft `1220822a`

**P1 – Betriebsanweisung:** [`s3-netcup-update.md`](https://github.com/SchapfeldNils/ShowNight-System/blob/1220822a90d5247b585a9d3592b6120c0ab03da0/docs/entwicklung/s3-netcup-update.md#L40) enthält noch einen als aktuell lesbaren produktiven Schema-2→4-Ablauf, obwohl derselbe PR bereits eine öffentliche Schema-4-Readiness dokumentiert. Den ausgeführten/probierten alten Ablauf datiert erhalten, aktuelle Bestandsaufnahme und künftigen Updateplan getrennt führen. Entsprechende Schema-2-Aussagen in Installeranleitung und Status berichtigen. Der Head hatte nach dem geprüften Runtime-Commit nur Dokumentationsänderungen ohne eigenen CI-Lauf; die drei Runtime-Workflows waren grün. Nach #18 erneut prüfen.

### [#22 – portable Sicherung](https://github.com/SchapfeldNils/ShowNight-System/pull/22), geprüft `e0c94d7f`

**P2 – Archivvollständigkeit:** [`backup-vault.mjs`](https://github.com/SchapfeldNils/ShowNight-System/blob/e0c94d7f7365a6971d0d63a3cbbe154e008a4e0b/scripts/backup-vault.mjs#L117) schreibt sofort unter dem endgültigen Namen. Bei Prozessabbruch kann ein unvollständiges Archiv sichtbar bleiben. Im selben Zielverzeichnis temporär schreiben und nach erfolgreichem Abschluss atomar bereitstellen; Abbruch prüfen.

**P2 – Kennwortschutz:** [`backup-run.sh`](https://github.com/SchapfeldNils/ShowNight-System/blob/e0c94d7f7365a6971d0d63a3cbbe154e008a4e0b/deploy/backup-run.sh#L11) prüft bei der Kennwortdatei nur, ob sie existiert. Eigentümer und Zugriffsrechte vor dem Lesen prüfen; unsichere Dateien ablehnen und testen. Die erfolgreichen CI-Läufe der früheren Runtime ersetzen keinen produktiven Zeitplan, externe Kopie, Kennwortverwahrung oder Provider-Restore.

### [#23 – Betriebsnachweise](https://github.com/SchapfeldNils/ShowNight-System/pull/23), geprüft `3528b1f3`

GitHub meldete **`mergeable=false`**: Base und Head liefen auseinander. Die überlappenden Protokoll- und Statusänderungen aus dem inzwischen neueren #21 erhalten, Konflikt lösen und den dann vollständigen Diff erneut prüfen. **P2 – Dokumentation:** [`s3-netcup-update.md`](https://github.com/SchapfeldNils/ShowNight-System/blob/3528b1f365fee17d0b266e61bdc1cdb13cd1e2cf/docs/entwicklung/s3-netcup-update.md#L3) bezeichnet den lokalen Erststart noch als offen, während #23 einen erfolgten MFA-Erststart dokumentiert. Als historischen Stand formulieren. Am geprüften Head gab es keine CI-Läufe oder Reviews; die Betriebsbelege beschreiben Runtime `1c983fc`/Schema 4 und Setup 0.3.6, nicht automatisch die neueren Entwicklungsfixes/Schema 5.

### [#14 – lokale GPU-KI](https://github.com/SchapfeldNils/ShowNight-System/pull/14), geprüft `5c5ac3e1`, ungemergt geschlossen

Optionale Entwicklungsarbeit, keine Abhängigkeit der Produktkette. Bei späterer Übernahme zwei **P2**-Fehler beheben: [markierte Downloadabschnitte](https://github.com/SchapfeldNils/ShowNight-System/blob/5c5ac3e1d42f64c774c3d6a4a1b1b7ed1042052c/scripts/local-ai/Get-ShowNightLocalModel.ps1#L46) nach Gesamthashfehler erneut laden statt dauerhaft wiederverwenden; [`Unload`](https://github.com/SchapfeldNils/ShowNight-System/blob/5c5ac3e1d42f64c774c3d6a4a1b1b7ed1042052c/scripts/local-ai/ShowNightLocalAI.Server.ps1#L15) nur für die eigene Ollama-Instanz ausführen. Beides auf dem Zielrechner testen und einen neuen PR gegen den dann gültigen Stand erwägen.

### [#19 – lokaler Prüfbot](https://github.com/SchapfeldNils/ShowNight-System/pull/19), geprüft `cbfd74cf`, ungemergt geschlossen

Ebenfalls optionale Entwicklungsarbeit. Bei Übernahme zwei **P2**-Fehler beheben: späte WhatsApp-[ACKs](https://github.com/SchapfeldNils/ShowNight-System/blob/cbfd74cff155aad8d47ebc373039e54a32f41375/scripts/local-ai/qa/notifications.mjs#L83) mit der Outbox abgleichen, damit die Übersicht Zustellungen korrekt zählt; Modellversuche in [`worker.mjs`](https://github.com/SchapfeldNils/ShowNight-System/blob/cbfd74cff155aad8d47ebc373039e54a32f41375/scripts/local-ai/qa/worker.mjs#L65) **vor** dem Start dauerhaft auf das Tageslimit anrechnen, damit Abstürze das Limit nicht umgehen. Späte ACKs und Neustart während der Berechnung testen. #19 baut auf dem ebenfalls ungemergt geschlossenen #14 auf; beide nicht ungeprüft direkt nach `main` übernehmen.

## Gemeinsamer Abschlussnachweis

Für jeden korrigierten PR: exakte neue Base/Head/Merge-Base und vollständigen Dateidiff prüfen, passende Regressionstests und aktuelle CI am endgültigen Runtime-Head belegen, vorhandene Reviewthreads und unabhängiges Review berücksichtigen, Dokumentation/PR-Beschreibung auf denselben Stand bringen. Ein Dokumentationscommit mit CI-Skip benötigt eine belegte unveränderte Runtime und korrekt zugeordnete frühere Checks. Erst dann Draftstatus und Merge oder begründetes Schließen entscheiden. Nach einem Merge abhängige PRs erneut gegen die neue Basis prüfen.

Reale Netcup-/Windows-Updates, Mail- oder WhatsApp-Zustellung, unabhängige Sicherung, physische HDMI-/Ton-/Geräteabnahme und vollständige Veranstaltungsfreigabe sind gesonderte Betreiber- und Produktnachweise. Synthetische Tests, alte CI-Läufe und PR-Kommentare weisen sie nicht automatisch nach. Die F-/A-Kennungen und die Dokumentation des vollständigen ersten Veranstaltungsumfangs bleiben maßgeblich.
