# Lokale Kontenrechte: Technikvergabe

14\. Oktober 2026 · [Issue #27](https://github.com/SchapfeldNils/ShowNight-System/issues/27) · F05/F30, A18. Branch `codex/s3-offline-account-rights`, Ausgangsbasis PR #25 / `000f1a2995443d84bfc1a9fd4b2a11b77ed1d936`.

## Verhalten und Bedienung

Bei **Lokale Veranstaltungskonten** bietet die lokale Oberfläche die Rolle **Technik** nur Systemadministratoren an. Eine Veranstaltungsleitung kann weiterhin Konten mit den bereits unterstützten Fachrollen im eigenen vorbereiteten Event anlegen. Technische Rechte bleiben von vollständigen Inhaltsrechten getrennt.

Der Server prüft die Technikvergabe unabhängig vom Formular. Eine direkte Anfrage einer nichtadministrativen Leitung mit `role: "technik"` wird vor Konto-, Grant-, Einladungs- und Auditänderungen mit HTTP 403 abgewiesen. Das setzt die bereits online durchgesetzte Regel lokal durch; keine neue Fachrolle oder Rechteerweiterung. Bestehende Konten werden nicht nachträglich verändert. Frühere unzulässige Vergaben lassen sich daraus nicht automatisch erkennen oder bereinigen; der vorhandene Sperrweg bleibt verfügbar.

Bestehende Anmeldung/MFA, Veranstaltungsbindung, Einladungsannahme, CSRF und Sperren bleiben verbindlich. Keine Schemaänderung, zusätzliche Bibliothek oder Lizenz.

## Auslieferung und Grenzen

Setup 0.3.9 mit Renderer aus erfolgreichem nativen CI-Lauf tatsächlich heruntergeladen: GitHub-Artefakt `11930770617`, Archiv-SHA256 `9da1a2a8011d079b4076cbadff3de383be26493726aaa54f0285d1f76466019e` bestätigt. Setup 30.049.055 Bytes, SHA256 `c08646a57f5d7c3f5bc76beea36e4ea1c93df378598464aa904e1a64e6976d68`; deklarierte Setup-/Paketprüfsummen ebenfalls bestätigt. `build-info.json` und tatsächliche EXE-Produktversion 0.3.9, `rendererIncluded=true`. Unsigniert. Im Arbeits-Worktree unter `dist/streaming-installer/ShowNight-Streaming-Setup-x64.exe` bereitgestellt, nicht installiert.

Installation wie in [Streaming-Installer](s3-streaming-installer.md), mit vorheriger Sicherung und regulär beendetem eigenem Dienst. Dieser Entwicklungsdurchlauf aktualisiert weder den vorhandenen lokalen Betrieb 0.3.8 noch Netcup und führt keine Geräteaktion aus. Kein automatischer Merge.

Die Browserprüfung verwendet synthetische API-Daten. Sie ersetzt keine API-Rechteprüfung. SQLite-/API-Tests und unabhängiger Review werden getrennt dokumentiert. Keine Veranstaltungs-, LAN-, Geräte- oder Hardwarefreigabe. Mail und physische Ausgabe bleiben aus. Native Komposition der vorhandenen Paket-v2-Szenen ist das nächste Entwicklungsarbeitspaket.

## Prüfstand

Runtime `7dba227007f4127f7cf6a8a4dd77029a40615bff`, [PR #28](https://github.com/SchapfeldNils/ShowNight-System/pull/28). Lokal unter Windows/Node 24.19.0 tatsächlich ausgeführt:

```powershell
pnpm install --frozen-lockfile --offline
node node_modules/typescript/bin/tsc --noEmit
node scripts/build.mjs
node --import tsx --test --test-timeout=90000 tests/*.test.ts
node --import tsx --test tests/server-overview-browser.ts
node --check scripts/streaming-installer-test.mjs
```

Typprüfung/Build bestanden, sämtliche Units 35/35, darunter Kontenrechte 8/8 mit realer SQLite/MFA und Fastify-Injection ohne Listener. Edge-Browser 6/6, darunter zwei neue Formularfälle mit synthetischen API-Daten. Leitung mit bereits vorhandener eigener Technikrolle darf nicht delegieren; Admin darf Technik anlegen. Einladungsannahme, Mitgliedsanmeldung, Eventgrenzen, falsche Rollen und unerlaubte Adminfelder geprüft. Ablehnung lässt Nutzer-/Grant-/Einladungs-/Auditzahlen unverändert. Keine echten Konten verwendet.

Unabhängiger Subagent prüfte den vollständigen Zehn-Dateien-Diff gegen die Ausgangsbasis und führte Kontenrechte 8/8, Typprüfung, Installersyntax und Diffprüfung erneut aus. Ein bestätigter P2 (Installerquelle noch 0.3.8 gegenüber Artefaktmetadaten 0.3.9) behoben und unabhängig nachgeprüft; keine verbleibenden bestätigten Befunde. Zusätzlich vergleicht der isolierte CI-Installertest die installierte Registry-`DisplayVersion` mit den Artefaktmetadaten. Review ist kein GitHub-Freigabevotum und ersetzt keinen Betreiberentscheid.

Der gewünschte lokale KI-Helfer `C:\Users\nilss\AppData\Local\ShowNight\LocalAI\Invoke-ShowNightLocalAI.ps1` ist am angegebenen Pfad weiterhin nicht vorhanden; kein lokales KI-Ergebnis behauptet. Die unabhängige Subagentenprüfung ist durchgeführt. Erfolgreiche Prüfungen der Ausgangsbasis werden nicht als Nachweis der Korrektur übernommen.

Abgeschlossene CI am Runtimecommit: [S1](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38640003700), [Server-Installer](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38640003549), [nativer Renderer](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38640003677) sämtlich erfolgreich. Windows, AMD64 und ARM64 einschließlich der jeweiligen Integrations-/Container-/Restoreprüfungen bestanden. Native Diagnose 5/5, portables Paket 6/6 und vollständiger Installerlebenszyklus bestanden. ARM64-Erstlauf nach bestandenen Units am 120-Sekunden-Zeitlimit beim erstmaligen Download des PostgreSQL-Testimages gescheitert, vor dem eigentlichen Dump/Restore. Gezielte unveränderte Jobwiederholung vollständig erfolgreich, keine abgeschwächte Prüfung. [Strukturierter Nachweis](nachweise/s3-offline-kontenrechte.json).

Abschließender Dokumentationsnachtrag unabhängig ohne weitere Befunde geprüft. Keine formellen GitHub-Reviews oder Reviewkommentare bei der Abschlussabfrage; der dokumentierte Subagentenreview bleibt davon getrennt. Der Nachweiscommit ändert ausschließlich Dokumentation und verwendet CI-Skip; geprüfter Code bleibt `7dba227`.
