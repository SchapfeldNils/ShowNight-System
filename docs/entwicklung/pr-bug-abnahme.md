# PR-Bug-Nachprüfung

Stand: 14. Oktober 2026. Betreiberauftrag: alle offenen PRs durcharbeiten und behobene Bugs mit Nachweis abhaken. Keine eigenständigen PR-Merges, keine Produktiv-/Geräteupdates und keine vorweggenommene Veranstaltungsfreigabe.

## S1-Korrekturen

- Gleichberechtigte Eventleitungen können Mitglieder auch in vom Admin/anderen Leitungen angelegte Teams aufnehmen. Änderungen globaler Mitgliedschaft bleiben verweigert, wenn verknüpfte fremde Events/Privatshows außerhalb ihres Verwaltungsumfangs liegen.
- Die Eventrechteentscheidung prüft Pflicht-MFA erneut anhand der in derselben Abfrage ermittelten Leitungsrolle; ein Rollenwechsel nach der ursprünglichen Sitzungsabfrage ermöglicht keinen ungeprüften Leitungszugriff.
- Die Medienwahl einer Eventshow enthält eigene Anhänge und veranstaltungsweite Originale. Unabhängige/fremde Shows erhalten dadurch keine Medienrechte.
- `POST /events/:id/users/:userId/invitation` erneuert einen manuellen Einrichtungslink für ein noch nicht eingerichtetes Eventkonto. Alte Links werden widerrufen; gesetzte Kennwörter und gesperrte/fremde Konten bleiben geschützt. UI-Aktion „Einrichtungslink erneuern“, keine automatische E-Mail.
- `DELETE /events/:id/teams/:teamId/members/:userId` widerruft globale Mitgliedschaft nur im vollständigen zulässigen Verwaltungsscope. `DELETE /shows/:id/teams/:teamId` löst eine konkrete Showzuordnung. `DELETE /events/:id/teams/:teamId` löst die Eventzuordnung einschließlich Showzuordnungen dieses Teams innerhalb desselben Events; andere Events und Inhalte bleiben erhalten. Direkte andere Rollen bleiben wirksam. Deutsche UI-Aktionen vorhanden.
- Fehlgeschlagene Originale ohne gespeicherte Einsatzreferenz blockieren neue Pakete nicht mehr; auch deaktivierte Einsätze und später gespeicherte Szenen zählen als Verwendungen. Keine Original-/Anhang-/Historienlöschung oder Rechteumgehung.
- Status-WebSocket verbindet mit 1–15 Sekunden Abstand und vollständigem Snapshot erneut. Hinweis auf veraltete Werte bis zur Rückkehr; bei 401/Policy-Close und Abmeldung stoppen Wiederholungen. Keine fachlichen Schreibbefehle werden wiederholt.
- Migration `005_mail_delivery.sql` hält Test-/SMTP-Versandart dauerhaft am Auftrag fest; Altbestand und API-Testroute bleiben `test`, auch nach Worker-Konfigurationswechsel. Echte SMTP-Aufträge werden bei deaktiviertem Versand nicht als simuliert erledigt. Reale Fachmailanlage weiterhin offen.

## Migration und Branchkompatibilität

Migration 4 ist inzwischen für Szenen belegt. Die frühere ausschließlich lokale Mailkorrektur `2baac60` verwendete noch diese Nummer und wird **nicht** unverändert ausgerollt. Mailkorrektur verwendet deshalb 5. Der bisherige produktive Stand ist unverändert. Der aktuelle Branch liefert seine tatsächlich vorhandenen SQL-Migrationen; CLI führt unter Advisory Lock nur fehlende bekannte Migrationen aus, unbekannte installierte Versionen werden abgewiesen. Build entfernt ausschließlich zuvor generierte SQL-Dateien im eigenen `dist/api` und kopiert die Migrationen des jeweiligen Branches. Readiness verlangt genau dessen vollständige Versionsliste. Dies ermöglicht auch S1/S2-Updates mit reservierten späteren Versionsnummern, ohne nicht vorhandene Fachmodule vorzutäuschen.

Vor einem ausdrücklich freigegebenen Serverupdate Backup/isolierten Restore prüfen und alte App-/Workerprozesse stoppen. Neues Image migrieren und erst neue Prozesse starten. Alte Worker kennen die dauerhafte Testeigenschaft nicht und dürfen nicht weiterlaufen. Keine automatische Downmigration; Rückkehr benötigt einen passenden gesicherten Stand.

## Nachweise

`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`, `pnpm test:review`, `pnpm test:browser`. `test:review` verwendet echte isolierte PostgreSQL-Daten und synthetische Konten/Originale: Mitverwaltung, fremder Teamumfang, MFA-Rollenwechsel zwischen zwei Abfragen, Eventmedienwahl, Einladungsablauf/Erneuerung und tatsächlich widerrufene Showbearbeitung. Die vorhandene Kernintegration prüft zusätzlich Mailmodus/Altbestand, Paket-Recovery ohne SQL-Aufräumen und Restore. Browser enthält zwei Transportunterbrechungen und Sitzungswiderruf.

PR-Checks und erledigte Threads werden erst anhand des tatsächlichen jeweiligen neuen Heads abgehakt. Historisch grüne CI anderer Stände ersetzt keinen neuen Nachweis. Offene Hardware-/Betreiber-/Dauerbetriebs-/WhatsApp-Zustellprüfungen bleiben offen und sind keine durch Softwaretests erledigten Bugs.
