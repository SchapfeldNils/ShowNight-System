# Offene Arbeit und Issue-Stand

Abgeglichen mit GitHub am 15. Oktober 2026 (nach Merge PR #38, #39, #40 und Issue-Aufräumen). Frühere Momentaufnahmen dieser Liste stehen unverändert in [historie.md](historie.md).

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

Am 15. Oktober 2026 aufgeräumt: Die S2/S3-Issues, deren Software bereits in `main` liegt, sind geschlossen. Ihre offenen Praxispunkte stehen gesammelt in #46, ihre Softwarefolgen in #44 und #45. Checklisten und Nachweise bleiben in den geschlossenen Issues lesbar.

| Issue | Inhalt | Stand |
| --- | --- | --- |
| [#46](https://github.com/SchapfeldNils/ShowNight-System/issues/46) Hardware-/Showabnahme | Lokale Inbetriebnahme durch Betreiber, LAN, HDMI/Ton/Last, VirtualDJ-/Daslight-/Controllersteuerung, Showprobe | Offen, wartet auf Aufbau und Hardware |
| [#45](https://github.com/SchapfeldNils/ShowNight-System/issues/45) Showablauf | Vorbereiteter Showablauf, Liveaktivierung, Durchläufe, Show-GO | Offen, Software |
| [#44](https://github.com/SchapfeldNils/ShowNight-System/issues/44) Szeneneditor | Vollständiger Szeneneditor (D006) | Offen, Software |
| [#43](https://github.com/SchapfeldNils/ShowNight-System/issues/43) Ticketshop | F38–F43/A24–A27 | Offen, nächste sichtbare Lieferung |
| [#41](https://github.com/SchapfeldNils/ShowNight-System/issues/41) Bühnenmonitor | Vorbereitung in PR #42, Live-Anzeige offen | Teilweise |
| [#33](https://github.com/SchapfeldNils/ShowNight-System/issues/33) Lokales Update über Netcup | | Offen, zurückgestellt |
| [#32](https://github.com/SchapfeldNils/ShowNight-System/issues/32) Lokaler Server bedienbar/stoppen | | Offen, zurückgestellt |
| [#3](https://github.com/SchapfeldNils/ShowNight-System/issues/3) Sicherung | Software in `main`; regelmäßiger Betrieb, unabhängiges Ziel, echter Restore | Offen |

Geschlossen: #1, #31, #36 sowie am 15. Oktober 2026 #4, #6, #8, #10, #12, #15, #17, #20, #24, #27, #29 (Software in `main`, Restpunkte übertragen).

Regeln: Softwareänderungen je eigenem Branch/PR, keine pauschale Umdeklarierung praktischer Abnahmen. Fehlende Hardware blockiert ihre Nachweise, nicht weitere vorbereitbare Softwarearbeit (D017).
