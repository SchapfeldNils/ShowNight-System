# Systemadresse und E-Mail-Einbindung

Stand: 9. Oktober 2026. Entscheidung D014.

## Bestätigt
- Geplante öffentliche Systemadresse: https://eventmanagement.jungschuetzen-flueren.de
- Netcup kann die benötigten Mailpostfächer bereitstellen.
- Dies bestätigt weder einen bereits gesetzten DNS-Eintrag noch ein bereits angelegtes Postfach oder einen erfolgreich getesteten Versand.

## Umsetzungsvorschlag für S1
Die Systemadresse ist die konfigurierte öffentliche Basis-URL für Browseroberfläche, API und Systemlinks. Den bereits vorhandenen Nginx-Reverse-Proxy (D015) für die Systemdomain integrieren; API zunächst unter /api/v1 auf demselben Origin. Keine zweite Proxy-/TLS-Verwaltung installieren. Nginx-Standort, Betriebsart und Zertifikatszustand sind noch zu erheben.
DNS auf die tatsächliche Netcup-VM zeigen lassen; keine IP-Adresse erraten. Einen AAAA-Eintrag nur für einen tatsächlich funktionierenden IPv6-Zugang setzen. HTTPS und Linkerzeugung am Zielserver prüfen. Vorhandene andere Webseiten/MX-Einträge nicht durch diese Systembereitstellung ersetzen.
Die öffentliche ShowNight-/Shop-Adresse und eine gesonderte Testadresse sind noch nicht bestätigt.

## E-Mail
Netcup-Postfach als authentifizierten SMTP-Versandweg vorsehen. Host, Port, TLS-Modus, Benutzer und Zugangsdaten aus der tatsächlichen Postfachkonfiguration übernehmen. Keine fest erfundene mx-Serveradresse oder pauschal angenommener Port.
Die Anwendung enthält einen konfigurierbaren SMTP-Adapter und einen klar markierten Testadapter. Versand aus einem Hintergrundworker mit dauerhaft gespeicherten Aufträgen, Fehleranzeige, Wiederholungsversuchen und kontrolliertem erneutem Versand. Ohne Internet lokale Aufträge ausstehend halten und später an die Online-Versandzuständigkeit übergeben.
E-Mail-Konfiguration ist ein technischer Startentwurf zur Umsetzung, kein Auftrag zum aktuellen Versand an Personen.

## Noch offene Absender
Vorschläge, noch nicht bestätigt:
- system@jungschuetzen-flueren.de für Systemnachrichten.
- tickets@jungschuetzen-flueren.de für Ticketkommunikation.
- Reply-To an ein betreutes Postfach.

Absender müssen beim gewählten Netcup-Postfach erlaubt sein. Ein vorhandenes Alias ist nicht automatisch eine nutzbare SMTP-Identität. Postfachanlage und konkrete Adressen mit dem Betreiber klären.

## Konfigurationsvertrag
Beispielhafte Variablennamen, von Codex begründbar anpassbar:
- PUBLIC_BASE_URL=https://eventmanagement.jungschuetzen-flueren.de
- SMTP_HOST, SMTP_PORT, SMTP_TLS_MODE, SMTP_USER, SMTP_PASSWORD
- MAIL_FROM_ADDRESS, MAIL_FROM_NAME, MAIL_REPLY_TO
- MAIL_DELIVERY_ENABLED (Demo standardmäßig false)
- MAIL_TEST_RECIPIENT (kontrollierte Testadresse, nicht ins Repository eintragen)

.env.example enthält ausschließlich Platzhalter. Reale Secrets nur in Serverkonfiguration; niemals im Browser, Git-Commit oder Diagnosepaket. Transportverschlüsselung und Zertifikatsprüfung aktiv halten.

## Zuverlässigkeit und Rückmeldungen
MailJob: id, eventId optional, businessKey, templateVersion, recipient, payload, status, attemptCount, nextAttemptAt, providerMessageId optional, lastError.
Eine eindeutige businessKey verhindert doppelte Auftragsanlage für denselben fachlichen Anlass. SMTP-Versand und Datenbanktransaktion sind nicht atomar: Timeout nach Übergabe kann unklaren Ausgang erzeugen. Status unknown anzeigen und nicht als garantierte Zustellung oder garantierten duplikatfreien Versand darstellen.
Status mindestens queued, sending, accepted_by_smtp, failed, unknown. Ein delivered-Status ist nur mit tatsächlichem Zustellnachweis zulässig. Reale Bounces können in einem betreuten Postfach eingehen; automatisches Bounce-Einlesen ist damit nicht bereits implementiert.
Lokaler Server und Online-Server dürfen nicht unabhängig denselben Auftrag versenden. Versandzuständigkeit und Abgleich über stabile MailJob/businessKey identifizieren. Bereits überholte Erinnerungen vor verspätetem Versand auf fachliche Gültigkeit prüfen.

## Prüfung vor echtem Versand
- Basis-URL und absolute Login-/Einladungs-/Ticketlinks korrekt.
- Testadapter sendet keine echten E-Mails.
- SMTP-TLS, erlaubter Absender und Reply-To an kontrolliertem Testpostfach prüfen.
- Fehler/Timeout/erneuter Versand und Versandaufträge nach Neustart testen.
- SPF/DKIM/DMARC nach tatsächlichem Anbieter und bestehender Domainkonfiguration prüfen; keine vorhandenen DNS-Regeln ungeprüft ersetzen.
- Mengenlimits des tatsächlich verwendeten Postfachs erfassen. Keine Annahme unbegrenzten oder gebührenfreien Versands.
