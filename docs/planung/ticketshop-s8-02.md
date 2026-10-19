# Planungsrunde: Ticketshop S8-02 – Saalplan, Gastshop und Reservierung

Datum: 19\. Oktober 2026. Status: vom Betreiber im Claude-Chat beantwortet; direkte Bestätigung in [Issue #43](https://github.com/SchapfeldNils/ShowNight-System/issues/43) erbeten (D022). Zielanforderungen, keine umgesetzte Software.

Grundlage: Kapitel 11–13 und F38/F39/A24 in [anforderungen.md](../anforderungen.md). Die dort bestätigten Fachregeln gelten weiter (Gastshop ohne Konto mit geschütztem Bestelllink, befristete Holds mit Countdown, Lückenregeln je Bereich, Gruppen, Käufervorschau ohne Bestandsblockade, keine Onlinezahlung). Diese Runde klärt nur, was S8-02 umfasst und wie offen gebliebene Punkte entschieden sind.

## Entscheidungen

1. **Umfang:** S8-02 umfasst den grafischen Saalplan (Editor mit runden und rechteckigen Tischen, Sitzreihen, Einzelsitzen, Bühne, gesperrten Bereichen; Kennungen, Prüfung vor Veröffentlichung, wiederverwendbare Vorlagen) **und** den Gastshop mit Platzwahl auf Karte und in der Liste sowie befristeten Holds und Bestellungen. Zahlungsbestätigung, Tickets/QR und Einlass folgen in späteren Paketen.
2. **Öffentlichkeit:** Der Shop ist zunächst nur als **Käufervorschau für das Team** erreichbar. Ein öffentlicher Link entsteht erst nach vollständigen Veranstalter-, Datenschutz- und Vertragsangaben (O11) und einer ausdrücklichen Betreiberfreigabe je Veranstaltung.
3. **Haltezeit:** 15 Minuten mit sichtbarem Countdown.
4. **Missbrauchsschutz ohne Käuferkonto:** Anfragelimit je Adresse, Höchstzahl gleichzeitiger Holds je Sitzung, Bestelllimit je Bestellung (aus S8-01) und ein unsichtbares Fallenfeld. Kein Captcha, keine externen Dienste.
5. **Käuferdaten:** Name, E-Mail und Telefon sind Pflicht. Käufer können optional **Papierkarten per Post** wählen; nur dann ist die Postanschrift Pflicht, und es fällt eine **Versandgebühr** an, die je Veranstaltung einstellbar ist.
6. **Rechte:** Saalplan, Shop-Einstellungen und Bestellungen bearbeiten globale Admins, die Veranstaltungsleitung und eine **neue Veranstaltungsrolle „Verkauf“**.
7. **E-Mails:** Die Bestellbestätigung mit Bestelllink und Zahlungsreferenz wird vorbereitet, aber nur im Testmodus erzeugt. Echter Versand erst mit der öffentlichen Freigabe.

## Abgeleitete Folgen für die Umsetzung

- Neue Rolle `verkauf` braucht eine Erweiterung der Rollenprüfung online und im Offlinepaket; bestehende Rollen bleiben unverändert.
- Postversand ist ein neuer Bestellweg: Versandart, Versandgebühr und Anschrift gehören zur Bestellung; der Druck und Versand selbst kommt mit dem Ticketpaket.
- Doppelbuchungsschutz (A24) als serverseitige Transaktion mit Regressionstests für gleichzeitige Holds.
- Nur synthetische Daten im Repository; keine echten Käufer-, Adress- oder Zahlungsdaten.

## Offen

- O11: Veranstalter-, Datenschutz- und Vertragsangaben vor öffentlicher Freigabe.
- Höhe der Versandgebühr und ob sie je Bestellung oder je Karte gilt (wird beim Umsetzen als Einstellung je Veranstaltung mit Betrag je Bestellung vorgeschlagen).
