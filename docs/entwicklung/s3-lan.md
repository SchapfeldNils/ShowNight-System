# S3-03 · LAN-Einrichtung des lokalen Vorbereitungsservers

Stand: 10. Oktober 2026. Softwarepaket auf eigenem Branch `codex/s3-lan-setup`, [Issue #10](https://github.com/SchapfeldNils/ShowNight-System/issues/10), abhängig von [S3-02 / PR #9](https://github.com/SchapfeldNils/ShowNight-System/pull/9). Keine Installation am realen Veranstaltungsaufbau und kein Netcup-Update. F01–F50/A01–A30 bleiben der vollständige Freigabeumfang.

## Einrichtung eines neuen lokalen Serverprofils

Windows x64 und ein eigener Windows-Benutzer sind Voraussetzung. Im portablen Server-ZIP sind Node 24.19.0, deutsche Startdateien und diese Anleitung enthalten; Compiler/npm sind beim Anwender nicht erforderlich. Die Schritte für Inhaltspakete, Quellvertrauen, verschlüsselten Anmeldestand, MFA und Recovery aus der S3-02-Anleitung gelten weiterhin. Die Online-Exportoberfläche erfordert den S3-02-Softwarestand; der produktive Netcup-Server ist weiterhin S2.

1. Dem Server im Veranstaltungsnetz eine feste private IPv4-Adresse geben, beispielsweise durch eine DHCP-Reservierung am Router. Die Beispieladresse unten ist synthetisch und muss durch die tatsächlich diesem Server zugewiesene Adresse ersetzt werden. Das Netz benötigt keine öffentliche Domain und kein Internet. LAN-IPv6, DNS-Namen und mehrere gleichzeitig gebundene Schnittstellen sind in diesem Teilpaket nicht enthalten.
2. `local-network.example.json` aus dem ZIP als eigene `local-network.json` kopieren und die Adresse eintragen:

   ```json
   { "version": 1, "address": "192.168.50.10" }
   ```

   Zulässig sind kanonische IPv4-Adressen aus 10/8, 172.16/12 oder 192.168/16. Keine Wildcard, öffentliche Adresse, URL, Portangabe oder Loopback-Adresse. Die Datei enthält keine Zugangsdaten; tatsächliche lokale Adressen gehören trotzdem nicht in öffentliche Abnahmeprotokolle.
3. `Server-LAN-Einrichten.cmd` starten und den Dateipfad eingeben. Alternativ im entpackten Ordner: `node.exe main.js init-lan "C:\Vorbereitung\local-network.json"`. Das erzeugt ein neues geschütztes Profil unter `%LOCALAPPDATA%\ShowNight\local-server`. Zielschlüssel, Kontenschlüssel und PFX-Kennwort bleiben CurrentUser-DPAPI-geschützt. Das Zertifikat gilt ein Jahr und hat ausschließlich die gewählte IP als Subject Alternative Name. Port ist 3443, kanonische Adresse im Beispiel `https://192.168.50.10:3443`.
4. `Server-Netzwerk-Pruefen.cmd` ausführen. Die Ausgabe enthält Adresse, tatsächlich vorhandene IPv4-Zuordnung, SHA256-Zertifikatsfingerabdruck und Gültigkeitsende, keine Anmelde-/Recovery-/Privatschlüssel. Sie prüft weder fremdes Zertifikatvertrauen noch Firewall, WLAN, laufenden Dienst oder Veranstaltungsbereitschaft.
5. Den getrennten administrativen Recovery-Schlüssel persönlich sichern. Öffentliche `server.sntarget` und vorbereitete Inhaltspakete/`.sntrust`/`.snauth` wie in S3-02 verwenden. Nur die Zielanfrage und das öffentliche `server.cer` an erforderliche Vorbereitungs-/Clientrechner übertragen. Private `server.dpapi`, `server.pfx`, Kontendatenbank und Recoverydatei bleiben am Server beziehungsweise am getrennten Sicherungsziel.
6. Auf jedem Windows-Regieclient und am Server selbst Quelle und **SHA256-Fingerabdruck** von `server.cer` persönlich mit der Diagnose des Servers vergleichen. Danach über den Windows-Import für den jeweiligen aktuellen Benutzer in „Vertrauenswürdige Stammzertifizierungsstellen“ importieren. Das Installationspaket nimmt diesen Schritt nicht automatisch vor. In der Zertifikatsanzeige kann „Fingerabdruck“ SHA1 bedeuten; zum Vergleich der SHA256-Ausgabe beispielsweise in PowerShell mit vorhandenem Node: `node.exe -e "const fs=require('node:fs'),c=require('node:crypto');console.log(new c.X509Certificate(fs.readFileSync(process.argv[1])).fingerprint256)" "C:\Vorbereitung\server.cer"`. Das öffentliche Zertifikat darf geprüft werden; keine private PFX-Datei verteilen. Android/iOS-Zertifikatsinstallation und tatsächliche Mobilbrowser bleiben spätere Geräteprüfungen.
7. Auf dem Server ausschließlich den benötigten TCP-Port im privaten Veranstaltungsnetz freigeben. Beispiel für einen Administrator in PowerShell, nach Anpassung von Programm-/Server-/Clientadressen:

   ```powershell
   New-NetFirewallRule -Name 'ShowNight-Local-3443' -DisplayName 'ShowNight lokaler Server' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3443 -LocalAddress '192.168.50.10' -RemoteAddress '192.168.50.21','192.168.50.22' -Profile Private -Program 'C:\ShowNight\server-windows\node.exe'
   ```

   Die Regel betrifft nur dieses Programm, diese Serveradresse und die ausdrücklich angegebenen Clients im privaten Netzwerkprofil. Weitere Geräte müssen gezielt ergänzt werden. Das Paket ändert keine Firewall-/Routerregeln und keinen Netzwerkprofiltyp. Eine Windows-Nachfrage nach allgemeinem Netzwerkzugriff ersetzt diese gezielte Einrichtung nicht. Keine Portweiterleitung am Router erforderlich. Zum späteren Entfernen der eigenen Regel: `Remove-NetFirewallRule -Name 'ShowNight-Local-3443'`.
8. `Server-Start.cmd` starten und auf allen Clients einschließlich Server exakt die eingerichtete HTTPS-Adresse öffnen. Nicht `localhost` oder einen anderen Alias verwenden: Zertifikat, Host- und Origin-Prüfung sind auf die konfigurierte Adresse abgestimmt. Der Server bindet ausschließlich diese Schnittstelle. Falsche Hostheader erhalten 421, fremde Origins 403; Auth/MFA/CSRF und Veranstaltungsrechte gelten unverändert. Zum Stoppen im Startfenster Strg+C.

## Vorhandene Profile, Fehler und sichere Grenzen

`Server-Einrichten.cmd` ohne LAN-Datei bleibt die Loopback-Neueinrichtung mit `https://localhost:3443` und ausschließlich 127.0.0.1. Bereits vorhandene S3-02-Profile bleiben unverändert lesbar. LAN-Einrichtung wandelt ein vorhandenes Profil **nicht** um und ersetzt keine Schlüssel, Zertifikate, Konten, Sperren oder Pakete. Die gezielte Umstellung vorhandener Profile mit Zertifikatsrotation und Sitzungssperre ist noch offen; dafür keine vorhandenen Dateien löschen oder zurücksetzen. Ein neuer Windows-Benutzer ist ein neues Ziel und benötigt einen eigenen verschlüsselten Anmeldestand. Er übernimmt keine lokalen Änderungen automatisch.

Eine exklusive `init.lock` verhindert konkurrierende Erstinitialisierungen. Bereits vorhandene oder teilweise erzeugte Profil-/Zertifikats-/Recoverydateien führen zur Ablehnung. Nach einem Prozessabsturz kann die Sperrdatei bleiben; keinen automatisch erzwungenen Neustart der Einrichtung vornehmen. Zuerst vorhandene Dateien sichern und Ursache prüfen. Der Befehl gibt keine Geheimnisse in Fehlermeldungen aus.

Bei geänderter/fehlender Server-IP startet der Dienst nicht auf einer anderen Schnittstelle und fällt nicht auf eine Wildcard zurück. Die feste ursprüngliche Adresse wieder bereitstellen und Diagnose ausführen. Zertifikate ohne passenden Zielnamen, mit zukünftigem Gültigkeitsbeginn oder nach Ablauf stoppen den Start. Zertifikatserneuerung/Adresswechsel sind separate noch offene Einrichtungsschritte; TLS-Prüfung nicht umgehen. Mehrere Serverinstanzen auf derselben Adresse werden durch den belegten Port abgewiesen.

Der laufende Dienst verwendet SQLite nur lokal. Clients greifen per HTTPS zu, keine Datenbankdatei wird im Netzwerk freigegeben. Schließen eines Browsers beendet den Server nicht. Alle Ansichten bleiben als Offlinevorbereitung ohne Live-/Geräteausgabe und mit deaktiviertem Mailversand gekennzeichnet. Kein WSS-Live-/GO-/Renderer-/Tonweg durch dieses Paket.

## Softwareprüfung und spätere Abnahme

Ausführbare Entwicklungsbefehle: `pnpm typecheck`, `pnpm test`, `pnpm build`, auf Windows `pnpm server:package`, danach `pnpm test:offline`. Die vorhandene CI führt Unit-/Offlineprüfungen auf Windows und nativen Linux-AMD64-/ARM64-Runnern aus; Windows testet das tatsächlich entpackte Bundle außerhalb des Repositorys. Aktuelle Ergebnisse: [Status](status.md), [Protokoll](protokoll.md).

Die Windows-Softwareprüfung erzeugt ein LAN-IP-Zertifikat in einem künstlichen Profil und transportiert HTTPS **ausschließlich über isoliertes Loopback**. Die Identitätsprüfung richtet sich trotzdem ausdrücklich auf die zertifizierte LAN-IP. Falsche Identität und fehlendes Vertrauen scheitern; Host/Origin/MFA/CSRF/Sitzungswiderruf werden über echte TLS-Verbindungen geprüft. Keine automatische Vertrauensinstallation, Firewalländerung oder Bindung an ein tatsächlich verwendetes LAN. Die bestehende portable Loopback-Prüfung bleibt erhalten, einschließlich paralleler Einrichtung und Erhalt bestehender Dateien.

Offene reale Prüfung zu L-01/A01/A18/A19: Server plus zwei Regierechner im vorgesehenen WLAN/LAN, manuell überprüftes Zertifikatvertrauen, gezielte Firewall, Login/MFA/Rollen, Internettrennung, Browserverlust/Wiederverbindung sowie Adress- und Serverneustart. Geräte-/Hardware-/Lastabnahme, Renderer, vollständiger lokaler Fachumfang, Onlineabgleich und Veranstaltungsfreigabe bleiben offen.

Keine neue Abhängigkeit oder Lizenz: vorhandene Node-/Fastify-/Zod-Grundlage und Windows-Zertifikatswerkzeuge. Technische Primärquellen, geprüft am 10. Oktober 2026: [Windows-Zertifikat mit IP-SAN](https://learn.microsoft.com/en-us/powershell/module/pki/new-selfsignedcertificate), [gezielte Firewallregel](https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule), [Node-TLS-Identitätsprüfung](https://nodejs.org/download/release/v24.19.0/docs/api/tls.html#tlscheckserveridentityhostname-cert).
