# Netcup: überholte Medienworker-Aufträge absichern

> Historischer Entwicklungsnachweis aus PR #34. Die Korrektur und ihr Regressionstest wurden später über PR #37 in den gemeinsamen Stand übernommen. Die damalige „Nächstes“-Angabe und Aussagen zum nicht aktualisierten Netcup-Stand beschreiben ausschließlich diesen früheren Zeitpunkt; das spätere Schema-6-Produktivupdate wird in [PR #39](https://github.com/SchapfeldNils/ShowNight-System/pull/39) dokumentiert.

15\. Oktober 2026 · [Issue #31](https://github.com/SchapfeldNils/ShowNight-System/issues/31) · F12/F28, Teilprüfung S1-07/A04. Arbeitsbranch `codex/netcup-media-worker-claims`, Ausgangsbasis gemergter S1/main `cd71423d2757989c342b6b2d54e4f47cd5e348d1`. Kein erneuter S1-Start, kein lokaler Funktionsausbau.

## Fehler und Korrektur

Die Medienverarbeitung übernimmt `processing`-Dateien mit einer zweiminütigen Lease und erhöht dabei `attempts`. Hashprüfung sowie zwei begrenzte Unterprozesse können die Lease überschreiten. Ein zweiter Worker darf dann übernehmen. Bisher schrieben Erfolg und Fehler des alten Workers allein anhand der Medien-ID; damit konnten sie den jüngeren Auftrag überschreiben oder dessen Lease löschen.

Der bestehende, ausschließlich bei Übernahme erhöhte Versuchszähler dient als Claimgeneration. Beide Abschlussänderungen werden auf Medien-ID, weiterhin `processing` und genau den übernommenen Versuch begrenzt. Überholte Erfolge und Fehler ändern keine Daten des Nachfolgers. Der Vergleich findet atomar im PostgreSQL-UPDATE statt; keine bloße Vorabfrage und keine neue Migration. Ein abgelaufener, noch nicht übernommener Auftrag darf wie bisher fertig werden. Die Lease steuert die erneute Übernahme; erst eine neue Claimgeneration macht den alten Abschluss ungültig.

Keine Änderung von Rechten, Medienprüfung, Werkzeugzeitlimits, Lease-Länge oder fachlichem Ausfallverhalten; keine zusätzlichen Komponenten/Lizenzen. `processMedia` meldet weiterhin, ob ein Auftrag übernommen wurde, nicht ob dessen Ergebnis später noch veröffentlicht werden durfte. Geräte- und Mailausgabe werden nicht ausgelöst.

## Prüfung und Start

Implementiert; lokal auf Windows x64/Node 24.19.0 Typprüfung, Build und bestehende Units 3/3 bestanden. Neue Prüfung `pnpm test:worker-claims`: 11/11 mit echter isolierter PostgreSQL-17-Datenbank und tatsächlichen FFprobe-/FFmpeg-Prozessen bestanden. Synthetische Medien und kontrollierte Wartepunkte nach der Übernahme; keine zweiminütigen Sleeps oder bloße SQL-Mocks. Vor Korrektur vier Kontrollfälle bestanden, sechs Race-/Statusunterfälle fehlgeschlagen; nach Korrektur alle erfolgreich. Alter Erfolg/Fehler nach neuer Übernahme und während/nach deren Verarbeitung, normale Verarbeitung, Wiederaufnahme, aktive Lease, gleiche Attemptnummer mit bereits fertigem Status und leere Warteschlange geprüft. Bestehende Kernintegration lokal 14/14 bestanden. Unabhängiger vollständiger Review: keine bestätigten Befunde. Vollständige [S1-CI 38647319730](https://github.com/SchapfeldNils/ShowNight-System/actions/runs/38647319730) auf AMD64 und ARM64 erfolgreich: Typprüfung, Units, Build, Kern-/Review-/Claimintegration, Chromium, Audit/Lizenzen sowie Container-/Backup-/Restoreprüfung und Imageexport. Die neue Claimprüfung besteht auf beiden Architekturen mit 11/11. Kein Windows-CI-Job auf dieser S1-Basis; Windows wurde lokal geprüft. Runtimecommit `dd28868da5d483df85a43dda85809e0d16d78ce4`, [PR #34](https://github.com/SchapfeldNils/ShowNight-System/pull/34), [strukturierter Nachweis](nachweise/netcup-worker-claims.json).

Bestehender S1-Entwicklungsstart mit `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm test:integration`, `pnpm test:review`; gezielte Suite wie oben. Keine Produktivvariablen oder Portainer-Aktualisierung für diese Prüfungen verwenden.

## Betriebsgrenzen und Übergabe

Keine Änderungen an Netcup oder der installierten lokalen 0.3.8, keine eigenständigen Merges. Öffentliche Prüfung im vorherigen Audit: HTTPS-Readiness 200/Schema 4; kein frischer Image-/Worker-/Sicherungsnachweis daraus.

Dieser S1-Branch enthält nur Migrationen **001 und 005**. Sein gebautes Image ist kein unmittelbar für den bestehenden Schema-4-Server freigegebener Updatekandidat: dieser enthält zusätzliche Module/Migrationen. Für die spätere Onlinekonsolidierung die Korrektur bewusst in deren vollständigen Branch integrieren und genau diesen Stand samt Restore/Migration/Rückkehr prüfen. Kein Austausch des produktiven Images mit diesem isolierten S1-Artefakt. Alte ungeschützte Worker dürfen bei einem später freigegebenen Update nicht neben geschützten weiterlaufen.

Nächstes autorisiertes Softwarepaket nach Abschluss: Sicherungshärtung aus Issue #3 (atomare Archivveröffentlichung und private Kennwortdatei vor Wartungsbeginn prüfen). Produktiven Sicherungsort, Kennwortverwahrung, Aufbewahrung/Monitoring sowie späteren Online-Release getrennt konkretisieren. Reale Betriebs-/Hardwareabnahmen bleiben offen.
