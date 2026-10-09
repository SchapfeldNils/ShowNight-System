# Implementierter S1-Vertrag

Stand: 9. Oktober 2026. Führende Implementierung: `packages/contracts/src/index.ts`, `apps/api/src`. Der umfassendere [Schnittstellenentwurf](schnittstellen.md) bleibt das Ziel für spätere Pakete. Nur folgende Teilmenge ist jetzt implementiert.

## Auth und Rechte

`/api/v1` auf demselben Origin wie Web. Schreibende Browseranfragen brauchen exakten `Origin` gemäß `PUBLIC_BASE_URL`; angemeldete Mutationen zusätzlich `X-CSRF-Token` aus `/me`. Cookie `sn_session`: HttpOnly, SameSite Strict, Secure bei HTTPS, acht Stunden. DB speichert nur Tokenhash. Kennwörter: gesalzene scrypt-Ableitung. Admin/Leitung: TOTP mit verschlüsseltem Secret, fünf Minuten gültige Challenge, maximal fünf Versuche, pro Konto verbrauchter TOTP-Zähler und einmalige gehashte Recovery-Codes. Rechte werden bei jedem Zugriff aus aktuellen Zuordnungen ermittelt; Rollenwechsel zur Leitung invalidiert MFA-unbestätigte Zugriffe sofort.

| Route | Verhalten |
| --- | --- |
| POST `/auth/login` | login/password; erst nach erforderlicher MFA Sitzung, andernfalls challenge/setup/secret zur Einrichtung |
| POST `/auth/mfa/verify` | challenge/code; atomare Bestätigung und Recovery-Verbrauch |
| POST `/auth/invitation` | token/password; einmaliges Kennwortsetzen, kein Versand |
| POST `/auth/logout`; GET `/me` | Sitzung widerrufen; sichere Identität/CSRF/Eventrollen |
| GET `/users` | Sichere Kontenliste ausschließlich Admin |
| POST `/events/:id/users` | Admin/Leitung: neues Eventkonto und einmaliger manueller Einrichtungslink |
| GET/POST `/events/:id/grants` | Rolle mit Eventumfang, Leitung/mitglied/live/technik getrennt |
| DELETE `/events/:id/grants/:userId/:role` | Berechtigter Widerruf; keine automatische LIVE-Freigabe |

Systemadmin ist in S1 ein breites Verwaltungsprofil; Eventleitung bleibt eventbezogen, ohne Systemadministration. Leitung kann nur bereits eigene Eventmitglieder mit Eventrollen versehen; technische Administration bleibt Admin. Beliebige globale Konten werden ihr nicht aufgelistet. Eventanlage benötigt bestätigte MFA, da sie Leitung verleiht. Konten ohne MFA können weiterhin zugeordnete Inhalte vorbereiten. Freie Rollen-/Einladungsverwaltung wird später ausgebaut; kein Offline-MFA-Nachweis in S1.

## Inhalte

| Route | Verhalten |
| --- | --- |
| GET/POST `/events`; GET/PATCH `/events/:id` | Sichtbare Events; Anlage mit name und optionaler template; Revision, Datum/Ort/Module |
| GET `/teams`; GET/POST `/events/:id/teams` | Rechtegefilterte Teams; vorhandenes Team oder name neu zuordnen |
| POST `/events/:id/teams/:teamId/members` | Globale Mitgliedschaft nach Verwaltungsrecht; Konto muss im Leitungsumfang sein |
| GET/POST `/shows`; GET `/shows/:id` | Unabhängige Shows; mit `?eventId=` Veranstaltungskopien |
| PATCH `/shows/:id` | expectedRevision, Name/Beschreibung/geordnete Einsätze; Medienbereich prüfen |
| POST `/events/:id/show-copies` | sourceShowId/sourceRevision, neue Kopie und neue Cue-IDs, Herkunft pinnen |
| POST `/shows/:id/teams` | Berechtigte Zuordnung zur ganzen Show; Leitung muss Event verwalten |
| GET `/shows/:id/history` | Unveränderlicher Versionsverlauf im erlaubten Showbereich |

Teammitglied sieht allgemeine Planung desselben Events und bearbeitet zugeordnete ganze Shows. Kein Recht zum Ändern Eventgrunddaten oder globaler Technik. Noch keine Quiz-/Lösungstabellen; spätere Fachmodule müssen ihre eigenen vertraulichen Rechte prüfen. Fehler: `error:{code,message,correlationId,details?}`. Fremde Ressourcen: 404. Revisionskonflikt: 409 `REVISION_CONFLICT`, zugelassener aktueller Stand unter `details.current`. Keine automatische Wiederholung; neue bewusste Änderung benötigt aktuelle Revision. Inhalt und unveränderliche Revision werden in derselben Transaktion gespeichert.

## Medien und Pakete

S1 vereinfacht den technischen Entwurf auf **einen begrenzten multipart-Upload**: POST `/media/uploads?showId=UUID` oder `?eventId=UUID`, genau ein Dateiteil, keine frei wählbaren Blobpfade. Uploadstream auf zufälligen Schlüssel, SHA-256, reale Dateityperkennung, Größenlimit, Fehlerbereinigung. Kein zweiphasiges Upload-Resume in S1. Unterstützt: PNG/JPEG, MP4/WebM, MP3/WAV. SVG, Präsentationen, animierte Bilder und weitere Formate folgen später.

Workerclaim mit `FOR UPDATE SKIP LOCKED`, zwei Minuten Lease. Prüfsumme, FFprobe-Metadaten und vollständige FFmpeg-Dekodierung mit je 60 Sekunden Timeout. `processing → ready/failed`; bei fehlendem Werkzeug oder überschrittenem Prüfbudget **failed**, keine behauptete Abspielfreigabe. Originale werden nicht verändert. Codec-/Dimensions-/Dauerangaben sind Messwerte; Lautheit/Normalisierung in S1 ausdrücklich `not_run_s1` und spätere Anforderung F13/A07. Keine nachgewiesene Windows-Rendererkompatibilität allein aus Dekodierung.

GET `/media?showId=` oder `?eventId=`, GET `/media/:id`, GET `/media/:id/content`: Rechte auch bei direkter Kennung. Inhalte erst nach ready; einfache und Suffix-Byte-Ranges, 416 bei ungültigem Bereich. Dateien bleiben außerhalb des statischen Webroots. Eventkopien erhalten explizite Dateiverknüpfungen, damit ihre eigenen berechtigten Teams Zugriff haben; kein Zugriff auf die private Quellshow erforderlich. Keine Medienlöschroute: historische Verwendungsprüfung/Papierkorb noch ausstehend.

POST `/events/:id/packages` pinnt den vollständigen **S1-Vorbereitungsstand** in Repeatable Read. Manifest enthält Eventgrunddaten, Showtexte/Einsätze/Revisionen und Originaldateien mit Prüfsummen, Größe und geschützten Downloadpfaden. GET `/packages/:id/manifest` überprüft Originalbytes erneut. Fehlende/veränderte/unbereite Medien → invalid. Keine Zugangsdaten, Sessions oder MFA-Secrets exportieren. Fehlende Offlinekonten, Schriften, Renderer und Livezustand sind keine fertiggestellten S3-Funktionen. POST `/activations` weist Onlineaktivierung grundsätzlich mit 409 ab.

## Betrieb und Status

GET `/health/live`: Prozessstatus. GET `/health/ready`: DB erreichbar und genau Migrationsstand 1, andernfalls 503. App migriert beim Start nicht automatisch. CLI `migrate` serialisiert Einrichtung über Advisory Lock; weitere Migrationen müssen als neue Versionen ergänzt werden.

GET `/status/ws`: Cookie und exakter Origin erforderlich. Rechtegefilterte, ersetzbare Snapshots alle drei Sekunden; Sitzungswiderruf schließt innerhalb dieses Intervalls. Keine Livekommandos, keine Bühnenadapter und keine behauptete Event-Replayfunktion. Wiederverbindung lädt vollständigen Status. GET `/diagnostics`: Admin, klar simulierte Geräteprofile und unbekannte reale Fähigkeiten. GET `/openapi.json`: aus Zod erzeugte Kern-JSON-Schreibverträge; ergänzende Routen in diesem Dokument, keine Behauptung vollständiger OpenAPI-Abdeckung.

GET/POST `/mail-jobs`: Admin-Testoberfläche, persistente eindeutige businessKey. Diese S1-Route legt ausschließlich Testaufträge an und ist bei aktiviertem Echtversand gesperrt. Worker test: simulated ohne Netzwerk. Worker smtp: TLS/Zertifikatsprüfung und Auth, Status accepted_by_smtp, niemals delivered. Sicher vor Übergabe gescheiterte Verbindung begrenzt wiederholen; Timeout/Absturz mit unklarem Übergabeausgang unknown, keine automatische Doppelzustellung. Reale Fachmailanlage/erneuter Versand werden in den zuständigen späteren Modulen ergänzt.
