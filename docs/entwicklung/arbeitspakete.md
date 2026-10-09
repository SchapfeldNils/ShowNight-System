# Entwicklungsplan – Server zuerst, danach Agenten

Stand: 9. Oktober 2026. D013 ersetzt die frühere unmittelbare Startreihenfolge aus D003; Gesamtumfang und technische Risikoprüfung bleiben bestehen.

| Paket | Ergebnis | Abnahme |
| --- | --- | --- |
| S1 Netcup-Server | Gemeinsames Projekt, API/Web, PostgreSQL, Auth/Rechte/MFA, Event/Show/Medienvorbereitung, Paketmanifest, Deployment/Sicherung | S1-01–S1-12 in abnahmeplan.md; reale VM-Prüfung bei Zugang |
| S2 Windows-Agenten | Paarung, Profile, Fähigkeiten, Heartbeats, Diagnose, Idempotenz, simulierte und verifizierte Realadapter | S2-01–S2-08; tatsächliche Gerätegrenzen sichtbar |
| S3 Lokaler Betrieb | Lokaler Server/SQLite, vollständige Pakete, Windows-Medienprozess, HDMI und separate Ausgabe | L-01/L-12/L-13; reale Windows-/Ausgabeprüfung |
| S4 Durchgängiger Showablauf | Szene, persönliche Vorschau, gemeinsames GO-Ziel, Ausgabe, Durchläufe und Versionen | L-02–L-11; zwei gleichberechtigte Regien |
| S5 Liveausbau | Voller Editor, Kameras, Ton, Licht, Controller, Timer und Übergänge | Betroffene F-/A-Fälle, L-14 und reale Last-/Synchronitätsmessungen |
| S6 Organisation | Teams, Aufgaben, Helfer, Kalender, Proben, Bühne, Requisiten und Kostüme | A18/A21/A22 |
| S7 Spiele und Moderation | Quiz, Tablets, Jury, Buzzer, Wertung, Karten und Moderatoransicht | A12/A23/A29 |
| S8 Verkauf | Shop/Saalplan, Gruppen, Zahlungen, Tickets und Einlass | A24–A27 |
| S9 Ergänzungen | Sponsoren, Öffentlichkeit und einfache Einnahmen/Ausgaben | A28 |
| S10 Auslieferung | Vollständiger Abgleich, Installer, bebilderte Anleitung, Sicherung/Rückfall und Gesamttest | A01–A30 einschließlich A17/A30 |

Reihenfolge späterer Fachmodule kann begründet angepasst werden. Alle vereinbarten Module bleiben Teil der vollständigen ersten Veranstaltungsfreigabe. Früh in S2/S3 müssen die riskanten Geräte-/Renderingwege geprüft werden; keine breite Fachmodulentwicklung vor den wesentlichen technischen Nachweisen.

## Agile Lieferung
Je Paket: nutzbarer Ablauf, Daten-/Schnittstellenänderungen, angemessene Tests, Startanleitung, bekannte Grenzen, aktualisierte Dokumentation und eigener PR. Keine automatischen Merges.
Codex beginnt S1 mit konfigurierbaren Deploymentvorlagen. Fehlende reale Zugangsdaten blockieren nur den Zieldeploymentnachweis. S2 folgt der nutzbaren Servergrundlage und braucht keine bezahlten Zusatzplugins.

## Erforderliche Netcup-Angaben vor echtem Deployment
VM/System, Architektur/Ressourcen und Datenträger; Domain/DNS; autorisierter SSH-/Adminzugang; bestehende Dienste/Ports; TLS- und Mail-Einrichtung; externe Sicherung. Noch nicht vorhanden oder nicht erhoben: als offen kennzeichnen. Keine Produktionswerte erraten und keine vorhandene VM pauschal überschreiben.

## Dokumente
[Datenmodell](datenmodell.md), [Schnittstellen](schnittstellen.md), [Abnahmeplan](abnahmeplan.md), [Startprompt](codex-startprompt.md). Der Windows-Hauptrechner bleibt der lokale Liveprozessor; die Cloud ist kein Ersatz für HDMI-/Bühnenausgabe.
