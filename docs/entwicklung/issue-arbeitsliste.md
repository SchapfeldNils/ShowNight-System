# Offene Arbeit und Issue-Stand

Abgeglichen mit GitHub am 15. Oktober 2026 (nach Merge PR #38, #39, #40). Frühere Momentaufnahmen dieser Liste stehen unverändert in [historie.md](historie.md).

## Nächste sichtbare Lieferungen

Betreiberpriorität vom 15. Oktober 2026: zuerst sichtbare, benutzbare Online-Funktionen, danach weitere lokale Entwicklung.

| Lieferung | Tatsächlicher Stand | Nächster Schritt |
| --- | --- | --- |
| Konto / Abmelden / Passwort | In `main` (PR #38) und produktiv auf Schema 6 (PR #39) | Erledigt als Software; persönliche Bedienprobe durch Betreiber |
| E-Mail / Passwort vergessen | In `main` und produktiv, Mailversand aktiv, SMTP-Anmeldung geprüft | Eigene Adresse bestätigen und echte Zustellung einmal nachweisen |
| Stage Timer F20/A10 – Vorbereitung | [PR #42](https://github.com/SchapfeldNils/ShowNight-System/pull/42) offen (Migration 7), CI grün laut PR | Review und Merge durch Betreiber, danach eigenes Produktivupdate Schema 7 |
| Stage Timer – Live-Bühnenanzeige | Offen, [Issue #41](https://github.com/SchapfeldNils/ShowNight-System/issues/41) | Gemeinsamer Livezustand, GO/Zieluhrzeit, echte Bühnenabnahme |
| Ticketshop F38–F43/A24–A27 | Offen, [Issue #43](https://github.com/SchapfeldNils/ShowNight-System/issues/43) | Erstes sichtbares Fachpaket nach Merge des Stage-Timer-PR |
| Regelmäßige Sicherung | Software in `main`; kein regelmäßiger Job, kein unabhängiges Ziel ([Issue #3](https://github.com/SchapfeldNils/ShowNight-System/issues/3)) | Providerbackup klären, Ziel/Zeitplan/Retention festlegen, echten Restore nachweisen |

## Pull Requests

| PR | Stand |
| --- | --- |
| #2 (S1), #5 (S2), #38 (Zusammenführung), #39 (Produktivupdate-Doku), #40 (historische Nachweise) | Gemergt |
| #7, #9, #11, #13, #16, #18, #21, #25, #28, #30, #22, #35, #34, #37 | Geschlossen ohne eigenen Merge – Inhalt über PR #38 (bzw. #37 → #38) in `main` übernommen |
| #14, #19 (lokale GPU-KI), #23, #26 | Geschlossen ohne Merge; #23 und #34 als Nachweise über PR #40 erhalten, #26 überholt |
| #42 Stage Timer | **Offen** |

## Offene Issues

Bei den S2/S3-Issues liegt der Code bereits in `main`. Offen bleiben sie, weil reale Betriebs- oder Hardwareabnahmen fehlen. Der Betreiber entscheidet, ob sie offen bleiben oder geschlossen und durch ein gemeinsames Abnahme-Issue ersetzt werden.

| Issue | Code in `main` | Was tatsächlich noch fehlt |
| --- | --- | --- |
| [#3](https://github.com/SchapfeldNils/ShowNight-System/issues/3) Sicherung | Ja (PR #22/#35 über #37/#38) | Regelmäßiger Betrieb, unabhängiges Ziel, Monitoring, echter Restore |
| [#4](https://github.com/SchapfeldNils/ShowNight-System/issues/4) S2 Windows-Agent | Ja (PR #5) | Steuerung, Daslight, Controller/FLX4, Routing; normaler DNS-Agentstart |
| [#6](https://github.com/SchapfeldNils/ShowNight-System/issues/6) Paketablage | Ja | Keine Softwarelücke dokumentiert; schließbar nach Betreiberentscheidung |
| [#8](https://github.com/SchapfeldNils/ShowNight-System/issues/8) Offlinekonten | Ja | Betreiberbedienung, LAN-/Hardwareabnahme |
| [#10](https://github.com/SchapfeldNils/ShowNight-System/issues/10) LAN | Ja | Mehrere echte Clients, Firewall/Vertrauen, Internettrennung |
| [#12](https://github.com/SchapfeldNils/ShowNight-System/issues/12) Renderer | Ja | HDMI, Ton, Mehrmonitor, Last, Synchronität am Aufbau |
| [#15](https://github.com/SchapfeldNils/ShowNight-System/issues/15) Paketmedien | Ja | Keine Geräte-/Showfreigabe aus stummer Diagnose |
| [#17](https://github.com/SchapfeldNils/ShowNight-System/issues/17) Szenenentwürfe | Ja | Vollständiger Editor als Folgepaket |
| [#20](https://github.com/SchapfeldNils/ShowNight-System/issues/20) Erststart | Ja | Betreiberinstallation mit Export/Import und lokalem Start |
| [#24](https://github.com/SchapfeldNils/ShowNight-System/issues/24) Serverübersicht | Ja | Kameras/physische Ausgabe |
| [#27](https://github.com/SchapfeldNils/ShowNight-System/issues/27) Technikrollen lokal | Ja | Keine Softwarelücke dokumentiert; schließbar nach Betreiberentscheidung |
| [#29](https://github.com/SchapfeldNils/ShowNight-System/issues/29) Native Szenen | Ja | Vorbereiteter Showablauf, reale Geräte-/Full-HD-/Audioabnahme |
| [#32](https://github.com/SchapfeldNils/ShowNight-System/issues/32) Lokaler Server bedienbar/stoppen | Nein | Umsetzung offen (zurückgestellt bis nach Online-Lieferungen) |
| [#33](https://github.com/SchapfeldNils/ShowNight-System/issues/33) Lokales Update über Netcup | Nein | Umsetzung offen (zurückgestellt) |
| [#41](https://github.com/SchapfeldNils/ShowNight-System/issues/41) Bühnenmonitor | Teilweise (PR #42 offen) | Siehe oben |
| [#43](https://github.com/SchapfeldNils/ShowNight-System/issues/43) Ticketshop | Nein | Siehe oben |

Geschlossen: #1 (S1), #31 (Medienworker-Claims), #36 (Netcup-Releasekandidat).

Regeln: Softwareänderungen je eigenem Branch/PR, keine pauschale Umdeklarierung praktischer Abnahmen. Fehlende Hardware blockiert ihre Nachweise, nicht weitere vorbereitbare Softwarearbeit (D017).
