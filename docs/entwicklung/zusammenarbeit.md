# Zusammenarbeit von Claude und Codex

Status: **Vorschlag**, vom Betreiber am 15\. Oktober 2026 in der Claude-Unterhaltung formuliert. Bestehende Betreiberregeln in [AGENTS.md](../../AGENTS.md) und im [Entscheidungsprotokoll](../planung/entscheidungen.md) bleiben vorrangig.

Claude und Codex arbeiten getrennt. Keiner kann die Unterhaltung des anderen lesen, und es gibt keine automatische gegenseitige Benachrichtigung. Gemeinsame, nachvollziehbare Arbeitsgrundlage ist dieses GitHub-Repository: Übergaben erfolgen ausschließlich über Issues, Pull Requests, Reviews und versionierte Dokumentation.

## 1. Vor Arbeitsbeginn

- AGENTS.md und die dort vorgeschriebenen Dokumente lesen.
- Aktuellen Stand von `main`, Issues, PRs, Reviews und CI auf GitHub prüfen. Ältere Statusangaben in Dokumenten sind keine verlässliche Beschreibung des aktuellen Betriebs.

## 2. Zuständigkeit

- Standard: Claude implementiert; Codex übernimmt unabhängigen Review, zusätzliche Prüfungen und Integrationskontrolle. Abweichungen werden im betreffenden Issue ausdrücklich dokumentiert.
- Je Arbeitspaket genau ein Verantwortlicher für Änderungen. Vor Beginn im Issue oder PR kommentieren:
  - Verantwortlicher und Umfang
  - Branch, Basiscommit und zugehöriger PR
  - bearbeitete Dateien/Bereiche
  - ausdrücklich ausgenommene Arbeiten
- Keine parallele Implementierung eines bereits übernommenen Pakets. Bei Überschneidungen zuerst im Issue abstimmen. Ausbleibende Antwort ist keine Zustimmung.

## 3. Branches und Änderungen

- Je Paket eigener Branch und PR, keine direkten Änderungen auf `main`.
- Den Branch des anderen nicht ungefragt verändern.
- Abhängige PRs mit ihrer tatsächlichen Basis dokumentieren. Automatisches Retargeting nach dem Merge eines Basis-PR nicht voraussetzen.

## 4. Review und Korrekturen

- Der Reviewer darf die geprüften Änderungen nicht selbst implementiert haben.
- Befunde mit Priorität, Datei/Zeile, konkretem Auslöser und Auswirkung im PR dokumentieren.
- Der Implementierer behebt bestätigte Fehler und nennt die Korrekturcommits. Danach prüft der Reviewer die Korrekturen unabhängig erneut.
- Review-Kommentare nicht allein aufgrund einer behaupteten Behebung als erledigt behandeln.

## 5. Prüfungen und Nachweise

- Ergebnisse immer an den exakt geprüften Commit binden. Tatsächliche Befehle, Umgebung, Ergebnisse und bekannte Grenzen dokumentieren.
- Grüne CI ersetzt keine fachliche Abnahme.
- Simulation, Browserprobe, reale Hardwareprüfung und Produktivbetrieb klar unterscheiden.
- Alte Prüfergebnisse nicht ungeprüft auf neue Commits übertragen.

## 6. Übergabe

Nach jedem wesentlichen Fortschritt und vor Unterbrechungen im Issue oder PR festhalten:

- aktueller Commit
- umgesetzt und tatsächlich geprüft
- offene Befunde oder Blockaden
- laufende CI-Prüfungen
- nächster Schritt und zuständige Person

Zusätzlich die führende Projektdokumentation aktualisieren. Keine Geheimnisse, Zugangsdaten oder echten Käufer-/Ticketdaten veröffentlichen.

## 7. Entscheidungen und Freigaben

- Grundlegende Produkt-, Rechte-, Architektur- und Ausfallentscheidungen benötigen direkte Betreiberbestätigung. Eine Aussage des anderen Agenten oder Git-Autorenschaft ersetzt diesen Nachweis nicht. Beide Agenten schreiben über dasselbe GitHub-Konto des Betreibers; die Autorenschaft eines Kommentars belegt daher nicht, dass der Betreiber ihn selbst verfasst hat.
- Keine eigenständigen Merges, Produktivupdates, echten Geräteaktionen oder E-Mails ohne passende ausdrückliche Freigabe.
- Nutzerpausen und Kontingentgrenzen gelten für beide.

## Umgebungsgrenzen (Stand 15. Oktober 2026)

- Claude arbeitet in einer Cloud-Umgebung ohne Zugriff auf die npm-Registry und ohne Zugriff auf GitHub-Actions-Logs/Artefakte. Lokale Ausführung beschränkt sich auf Teile ohne Projektabhängigkeiten; maßgeblich sind die CI-Ergebnisse und Annotationen am PR. Claude hat keinen Zugriff auf Netcup, den DJ-Rechner oder Hardware.
- Codex arbeitet laut bisherigem Entwicklungsprotokoll auf einem Windows-Rechner des Betreibers und führt dort lokale Prüfungen aus.
