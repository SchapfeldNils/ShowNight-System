# Windows-Erststart und Einrichtungsstatus

14. Oktober 2026 · Issue #20 · Branch `codex/s3-first-run-diagnosis`, PR #21.

Der Startbefehl prüft vor Server- und Rendererstart die lokale Einrichtung. Fehlt sie, zeigt das Konsolenfenster konkrete Schritte statt der bisherigen allgemeinen Fehlermeldung. Es bleibt durch die Startdatei geöffnet. Der Eintrag **Einrichtungsstatus prüfen** im Startmenü beziehungsweise `Server-Status.cmd` prüft dieselben Voraussetzungen, ohne einen Dienst zu starten. CLI: `node.exe main.js status`.

1. Bei fehlendem Profil **1 - Lokalen Server einrichten** öffnen. Teilweise vorhandene oder nicht lesbare Profile nicht neu initialisieren: vorhandene Schlüssel erhalten, Windows-Benutzer und Anleitung prüfen.
2. In der Onlinevorbereitung mit eigenen Admin-/MFA-Rechten ein Inhaltspaket (`.snpkg`), den Serverschlüssel und einen an `server.sntarget` gebundenen Anmeldestand exportieren. Der Exportweg benötigt mindestens Schema 3. Die bisherige produktive Schema-2-Version unterstützt ihn nicht. Eine Produktionsaktualisierung benötigt weiterhin einen konkret geprüften Updateplan, Wartungsbackup/Restore und Betreiberfreigabe; die Statusprüfung führt sie nicht durch. Neuere Schema-5-Runtime und historischer Schema-4-Probelauf sind getrennte Stände.
3. **Inhaltspaket importieren**, **2 - Serverschlüssel importieren**, **3 - Anmeldestand importieren** öffnen. Den Serverschlüsselfingerabdruck unabhängig vergleichen. Die Statusausgabe unterscheidet die fehlenden Importe. Ein leerer Anmeldestand ohne Veranstaltungen bleibt nach dem bestehenden Verfahren zulässig; fehlende Inhaltspakete werden erklärt. Vor dem Dienststart werden sämtliche gebundenen Pakete weiterhin nach Dateien, Hash und Manifestzuordnung geprüft.
4. Das HTTPS-Zertifikat gemäß `Anleitung.md` vergleichen und auf jedem Client bewusst vertrauen. Eine bestandene Adress-/Gültigkeitsprüfung beweist kein installiertes Clientvertrauen. Keine automatische Rootstore- oder Firewalländerung.
5. **ShowNight Streaming starten** öffnen und das Serverfenster geöffnet lassen. Erst die ausgegebene Startbestätigung bedeutet, dass der Listener gestartet wurde. Die Statusprüfung allein ermittelt keinen laufenden Dienst. Ein belegter Port 3443 wird gesondert erklärt; fremde Prozesse werden nicht beendet.

Die Prüfung liest vorhandene Konten-/Paketdatenbanken mit SQLite `readOnly`, erzeugt keine fehlenden Datenbanken, veröffentlicht keine Kontennamen oder Geheimnisse und fragt keinen Online-Server ab. Vorhandene DPAPI-Identität, Zertifikat, Zielanfrage und Wiederherstellungsschlüssel bleiben erhalten. MFA-, Rechte-, Signatur- und Paketprüfungen bleiben erforderlich.

## Prüfungen und Grenzen

Lokal Windows x64: `pnpm typecheck`, `pnpm build` und `node --import tsx --test tests/*.test.ts` bestanden (18/18). Vier neue Erststartprüfungen umfassen fehlendes/teilweises/beschädigtes Profil, getrennte Importmeldungen, den tatsächlichen TypeScript-Starter mit isoliertem DPAPI-Profil und byteidentischen Dateierhalt. Sandbox-ACL blockierte zunächst den synthetischen Windows-Fall; außerhalb der Sandbox mit eigenem Temp-Profil bestanden.

Installerquelle auf 0.3.7 erhöht. Der Installertest prüft den zusätzlichen Status-Startmenüeintrag und den installierten Erststart. Aktueller ZIP-/Installer-/vollständiger CI-Nachweis wird gesondert protokolliert; aus Quellenänderung kein ausgeliefertes Setup behaupten. Keine Installation auf dem Betreiberrechner, kein Produktionsupdate, kein realer Betreiberimport und keine vollständige Erstinbetriebnahme. HDMI, Ton, WebRTC und Veranstaltungsabnahme bleiben offen. Teilgrundlage F26/F28/F30/F49/A17/A18.
