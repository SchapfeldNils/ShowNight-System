# Fachliches Datenmodell – erster Showablauf

Stand: 9. Oktober 2026. Fachliche Grundlage: Gesamtkonzept und D004–D012. Ergänzt um einen implementierbaren technischen Startentwurf. Fachregeln sind verbindlich; technische Bezeichner und Speicherentscheidungen sind begründbar anpassbar. Migrationen und Code-Schemas werden bei Umsetzung ergänzt. Dieses Dokument deckt den ersten Showablauf ab, noch nicht das gesamte Ticket-/Organisations-/Spielmodell.

## Objekte und Beziehungen

| Objekt | Bedeutung | Beziehungen und Regeln |
| --- | --- | --- |
| Veranstaltung | Organisatorischer Rahmen | Module, Teams, Veranstaltungsshows und aktivierte Datenstände |
| Unabhängige Show | Außerhalb einer Veranstaltung vorbereitbar | Wird als Veranstaltungskopie aufgenommen; Updates bewusst übernehmen |
| Veranstaltungsshow | Eigener vorbereiteter Stand einer Show | Abschnitte, Einsätze, Szenen und mehrere getrennte Durchläufe |
| Abschnitt | Optionale Gruppierung im Ablauf | Aufklappbare Gruppe von Einsätzen |
| Einsatz | Ein manuell oder ausdrücklich automatisch ausgelöster Schritt | Reihenfolge, Auslösehinweis, optional Bildaktion, geordnete Aktionen und eigene Einstellungen |
| Szene | Zusammengesetzter Bildinhalt | Ebenen und Medienelemente; in mehreren Einsätzen nutzbar |
| Szenenverwendung | Beziehung Einsatz–Szene | Übergang, Videoendverhalten und andere erlaubte Einstellungen können Vorgaben überschreiben |
| Medienobjekt | Datei mit Original und bearbeiteten Fassungen | Verwendungen nachverfolgen; verwendete Medien vor Löschung schützen |
| Aktionsbaustein | Wiederverwendbare Kombination | Versionierte Fassung; bewusste Übernahme neuer Versionen |
| Aktion | Bild-, Ton-, Licht-, Timer- oder Ablaufwirkung | Geordnet, optional verzögert; Wiederbetätigung/Abbruch gemäß Fachregeln |
| Technikanforderung | Vorbereiteter Musik-/Lichtwunsch | Später konkreter Technikaktion zuordenbar, ohne eine bereits funktionierende Anbindung zu behaupten |
| Durchlauf | Probe oder Aufführung | Gehört zur Veranstaltungsshow, hat eigene Livezustände und Ergebnisse |
| Datenstand | Vorbereitete oder aktivierte Fassung | Prüfen, bewusst aktivieren, aktive Fassung nachvollziehen und bewusst zurückkehren |
| Livezustand | Laufender Betrieb eines Durchlaufs | Ablaufposition, markierter GO-Einsatz, laufende Ausgabe und unabhängige Zustände für Ton/Licht/Timer |

## Zentrale Invarianten
- Ein Einsatz braucht keine Szene. Ohne Bildaktion bleibt die laufende Bildausgabe bestehen.
- Vorschauauswahl ist kein GO und keine Datenaktivierung.
- GO verwendet den explizit markierten nächsten Einsatz; konkurrierende Befehle werden serverseitig geordnet und abgesichert.
- Laufende Ausgabe darf weiter auf einer älteren Szene beruhen, während eine neue vorbereitete Fassung aktiviert wurde.
- Neue Datenstände werden für den gewählten Umfang vollständig geprüft und atomar aktiviert. Keine Teilmischung bei Fehler.
- Showvorlage, Veranstaltungskopie und Durchlauf haben unterschiedliche Aufgaben; Probenpunkte und Livezustände dürfen nicht versehentlich in eine echte Aufführung übernommen werden.
- Wiederherstellung erstellt eine neue aktuelle Fassung und erhält den Verlauf.
- Rechte werden nicht durch Kopieren, Papierkorb, lokale Entwürfe oder ausgeblendete Module umgangen.
- Unbekannter technischer Zustand bleibt unbekannt; gesendet bedeutet nicht ausgeführt.

## Noch zu konkretisieren
- Verhalten der persönlichen Vorschau bei mehreren Fenstern desselben Benutzers noch konkretisieren. Persönliche Vorschau je Regie und gemeinsames GO-Ziel sind durch D011 bestätigt.
- Technische Speicherstruktur, Objektkennungen, Versionsfelder, Befehls- und Ereignisschemas.
- Modulübergreifende Beziehungen für Ticketing, Finanzen, Organisation und Spiele anhand der bestehenden Anforderungen.
- Genaue Regeln zu lokalen Entwürfen, Papierkorbfristen und Wiederherstellungskonflikten.
- Zustandsübergänge und Nachweise für laufende Szene während Aktivierung.

Codex darf technische Entwürfe nachvollziehbar ausarbeiten. Neue grundlegende Produktregeln bleiben abstimmungspflichtig.


## Zustandsaufteilung nach D011
- Gemeinsamer serverseitiger Zustand: aktive Fassung, Ablaufposition, markierter nächster GO-Einsatz, Publikumsausgabe und ausgeführte Aktionen.
- Persönlicher Regiezustand: ausgewählter Vorschauinhalt und dessen Prüfwiedergabe; fremdes GO überschreibt diesen nicht.
- Gerätebezogener Vorhörzustand: ein Kanal pro Notebook, neuer Vorhöraufruf ersetzt bisherigen; keine automatische Ausgabe auf Publikumskanal bei Fehler.
- Gemeinsames Vorbereiten ist ein ausdrücklicher Befehl mit Konflikterkennung. Erste gültige konkurrierende Änderung gilt, veraltete Gegenänderung wird abgewiesen und nicht automatisch wiederholt.
- Technische Zuordnung persönlicher Zustände zu Fenstern/Sitzungen und Geräteidentität muss im Schnittstellenentwurf konkretisiert werden.


## Durchlauf-Lebenszyklus nach D012
Fachliche Zustände: vorbereitet, gestartet, Ablaufende erreicht und abgeschlossen. Technische Zwischenzustände sind noch zu spezifizieren.
- Start: Ausgangszustand prüfen, Zielposition vorbereiten; keine implizite Ausführung des ersten Einsatzes.
- Ablaufende: Kennzeichnung nach letztem Einsatz, noch kein automatischer Abschluss ohne konfigurierte Abschlussaktion.
- Abschluss: Ergebnisse/Verlauf abschließen; Ausgabezustände separat nach Abschlussaktion behandeln.
- Wechsel: nächsten Durchlauf vorbereiten, laufende Aktionen anzeigen und explizit gemäß Wechselregeln wechseln.
- Wiederholung: neue Durchlaufidentität; bestehende Ergebnisse und Historie nicht überschreiben.
- Simulationsprobe: isolierter Zustand; kein Zugriff auf reale Ausgabe-/Geräteadapter der Aufführung.
- Korrekturen nach Abschluss: nachvollziehbare Ergänzung, keine Veränderung früherer Ausführungsprotokolle.

 
## Technischer Startentwurf: gemeinsame Konventionen
Status: aus den Fachregeln abgeleiteter Implementierungsvorschlag, keine zusätzlich bestätigte Produktentscheidung. Codex darf reversible technische Details begründet anpassen.
- Stabile UUID-Kennungen über PostgreSQL, SQLite und Paketexport hinweg. Kennungen beim Export/Import erhalten; Kopien erhalten neue Objektkennungen mit Herkunftsverweis.
- Veränderliche Datensätze: id, revision (positive Ganzzahl), createdAt, updatedAt, createdBy, updatedBy. Zeitstempel als UTC; Darstellung nach Veranstaltungszeitzone.
- Fachrevision, Schema-Version und Livezustandsrevision sind getrennt. Schreibzugriffe verwenden erwartete Revision; Konflikte überschreiben nicht still.
- Inhalte und Verwendungen normalisiert speichern. Flexible Szenen-/Aktionsparameter als validiertes, versioniertes JSON; nicht die gesamte Anwendung als unvalidierten JSON-Block speichern.
- Dateien außerhalb der Datenbank; blobKey ist interner relativer Schlüssel, niemals ein vom Client frei vorgegebener Dateisystempfad. Originale unverändert.
- Zugehörigkeit und Fremdschlüssel auch serverseitig prüfen. SQLite-Fremdschlüssel aktivieren; keine Datenbankdatei über Netzwerk gemeinsam beschreiben.
- Soft Delete mit deletedAt/deletedBy für Papierkorb. Endgültige Löschung nur nach Prüfung aller Verwendungen einschließlich gehaltener historischer/aktiver Versionen; Aufbewahrungsfristen noch offen.

## Identität, Organisation und Rechte

| Entität | Mindestfelder zusätzlich zu Konventionen | Regeln |
| --- | --- | --- |
| User | login, displayName, status, passwordHash, mfaEnabled | Keine Passwörter im Klartext; Authdetails getrennt und nicht in fachlichen API-Antworten |
| UserSession | userId, expiresAt, revokedAt | Server prüft Sperrung und Ablauf; keine Identität aus frei übergebenem Benutzerfeld |
| Event | name, date nullable, venue nullable, timezone, moduleConfig | Beim Anlegen nur Name Pflicht; Zeitzone als technische konfigurierbare Vorgabe |
| Team | name, description | Mitgliedschaften getrennt speichern; keine implicit globale Bearbeitungsrechte |
| TeamMembership | teamId, userId | Mehrfachmitgliedschaft möglich |
| EventTeam | eventId, teamId | Zuordnung erzeugt keine Rechte außerhalb des Events |
| Role / Permission | key, scope, description | Systemadministration, Veranstaltungsleitung, LIVE/Technik und Inhaltsrechte getrennt |
| RoleGrant | userId oder teamId, roleId, scopeType, scopeId | Globale, Event- und Show-Zuweisung nach Fachregeln; kein anonymes Wildcard-Recht |
| ShowTeamAssignment | showId, teamId | Team darf zugeordnete ganze Show bearbeiten; kein zusätzlicher Inhaltsfreigabeschritt |

Leitung darf sämtliche Inhalte ihrer Veranstaltung sehen/bearbeiten. Systemadministration und LIVE-Aktivierung sind gesonderte Fähigkeiten. Implementiere Rechteprüfungen an API, Dateien und Ereignisabonnements, nicht nur an UI-Menüs. Pflicht-MFA für Admin/Leitung online; vollständiger Offline-MFA-/Recovery-Weg vor lokaler Freigabe. Geschützte Quizlösungen nicht durch allgemeine Leserechte offenlegen.

## Show- und Medienobjekte

| Entität | Mindestfelder | Beziehungen |
| --- | --- | --- |
| Show | id, eventId nullable, name, description, sourceShowId nullable, expectedDurationMs nullable, revision | eventId null: unabhängige Show; eventId gesetzt: Veranstaltungskopie |
| Section | showId, name, orderKey, enabled | Optional; Einsätze dürfen ohne Abschnitt bestehen |
| Cue | showId, sectionId nullable, name, orderKey, enabled, triggerHint, notes, expectedDurationMs nullable, overrides | Kein zwingender Szenenbezug; Szenenverwendung separat |
| Scene | showId oder definierter Bibliotheksbereich, name, logicalWidth, logicalHeight, defaults, revision | Eigentumsbereich eindeutig; Mehrfachverwendung zulässig |
| SceneLayer | sceneId, parentLayerId nullable, type, orderKey, transform, style, contentRef, animation | Typen: image/video/camera/text/shape/group; Maße in logischer Szenengröße |
| CueSceneUse | cueId, sceneId, overrides | Start-/Endverhalten und Übergang können Vorgaben überschreiben |
| ActionBlock / ActionBlockVersion | name, scope, versionId, schemaVersion, definition | Verwendungen pinnen eine Version; Änderungen nicht automatisch übernehmen |
| CueAction | cueId, orderKey, kind, delayMs, payload, repeatPolicy, exitPolicy, independentOnAbort | Direkte Aktionen oder gepinnte Bausteinverwendung; Parameter typabhängig validieren |
| TechnicalRequirement | cueId oder showId, kind, name, description, bindingId nullable | Musik-/Lichtwunsch auch ohne vorhandene Gerätebindung |
| MediaAsset | scope, ownerId, name, tags, originalBlobId | Berechtigung und Verwendungsnachweise |
| MediaBlob | relativeKey, sha256, sizeBytes, detectedMime, status | Status uploading/processing/ready/failed; ready erst nach Prüfungen |
| MediaVariant | assetId, blobId, purpose, sourceBlobId, analysis | Originalreferenz, Thumbnail/Arbeitsfassung/Audioanalyse getrennt |
| MediaUse | assetId, sceneLayerId oder actionRef, pinnedVariantId | Nicht beide Zieltypen gleichzeitig; vollständige Verwendungsprüfung |
| SceneEditLease | sceneId, holderSessionId, expiresAt, leaseToken | Exklusive Bearbeitung, TTL/Heartbeat technisch konfigurierbar |
| ContentRevision | entityType, entityId, revision, payload, label nullable, reason | Unveränderliche Revisionen, benannte Stände, vorherige Fassung bleibt |

Reihenfolge als explizites orderKey; bei Verschieben innerhalb einer Transaktion normalisieren. Exakte Typen in gemeinsamer Schema-Bibliothek definieren. Eine Szene gehört nicht gleichzeitig mehreren Shows: showübergreifende Wiederverwendung über definierte Bibliothek/Version; konkrete Bibliotheks-ACL gemäß Fachregeln.

## Vorbereitung und Laufzeit

| Entität | Mindestfelder | Regeln |
| --- | --- | --- |
| EventPackage | eventId, schemaVersion, manifest, contentRevisionMap, status | Medien/Schriften/Kontenmanifest vollständig; Geheimnisse nie ungeschützt exportieren |
| ActiveStand | eventId, generation, selectedShowVersions, activatedBy, activatedAt | Show- oder Eventaktivierung atomar; nicht gleichbedeutend mit aktueller Bildausgabe |
| Run | eventShowId, mode, status, sourceStandId, startedAt nullable, completedAt nullable | mode rehearsal/simulation/performance; eigene Ergebnisse, keine gemeinsamen Probenzähler |
| LiveState | runId, revision, activeStandId, currentCueId nullable, nextCueId nullable, preparationStatus | preparationStatus ready/stale/needs_confirmation; kein automatisches GO bei Start |
| OutputState | runId, outputId, playingSceneVersionId nullable, playbackId nullable, transition, freeze, blackout, reportedStatus | Alte laufende Szenenversion bleibt trotz neuem ActiveStand referenziert |
| TimerState | runId, timerId, mode, baseValueMs, anchor, paused, hint | Nicht aus Browser-Uhr ableiten; Monotonzeit im laufenden Prozess |
| PreviewState | previewSessionId, selectedContentVersion, playbackPosition | Persönlich, kein gemeinsames GO; mehrere Fenster erhalten eigene Preview-Session als reversibler technischer Startentwurf |
| CueExecution | runId, cueId, contentVersionId, commandId, startedAt, status | Historisch unveränderliche Ausführungsidentität |
| ActionExecution | cueExecutionId, actionId, dispatchId, status, externalEvidence | Teilfehler getrennt; retry nur ausgewählte Aktion mit eigener Ausführungsidentität |
| CommandReceipt | commandId, authorityId, requestHash, result, status | Idempotenz; gleiche Kennung mit anderem Payload ablehnen |
| RuntimeEvent | authorityId, epoch, sequence, kind, payload, createdAt | Geordneter Verlauf für Wiederverbindung; Historie nicht überschreiben |

Laufende Ausgabe und aktiver Stand getrennt referenzieren. Ein Durchlaufabschluss muss keine Medienwiedergabe beenden. Start-/Wechsel-/Abschlussaktionen explizit speichern. Simulation erhält eigene Zustände und darf keine Realadapter erreichen.

## Geräte und Ausführung
AgentDevice: id, name, profile, publicIdentity, trustStatus, lastSeenAt, supportedProtocol.
AgentCapability: deviceId, kind, adapterVersion, availability, simulated, lastObservedAt.
DeviceBinding: event/technicalProfile, logicalFunction, deviceId, capabilityId, configVersion.
ExecutionDispatch: id, commandId, targetDeviceId, playbackId nullable, status, sentAt, acknowledgementAt nullable.

Profile: main (lokaler Server/Renderer-Koordination), dj (Virtual DJ, APC, optional Vorhören), light (Daslight), jeweils frei konfigurierbar. Rollenprofile sind Gerätefunktionen und keine Benutzerrollen. Zugangstoken separat halten. Der Netcup-Server hält Vorbereitung und Geräteinventar, keine Bühnenausgabe.

## Abgleich und Persistenz
PostgreSQL online und SQLite lokal nutzen dieselben fachlichen Schemata über Speicheradapter, aber keine direkte Datenbankreplikation. Abgleich sendet Objekte/Revisionen und Prüfsummen; divergent bearbeitete Objekte benötigen explizite Konfliktentscheidung.
Betriebszuständigkeit hat authorityId und authorityEpoch. Livebefehle gehen nur an den zuständigen lokalen Server; Cloud-Handover für Einlass/Organisation wird später bewusst und gesondert implementiert.
Befehlsannahme, Livezustandsänderung, Ausführungsauftrag und Ereignis in einer Datenbanktransaktion festhalten. Bei Neustart ausstehende Aufträge nicht blind erneut extern ausführen: Status unknown, Abgleich und bewusste Entscheidung. Externe Effekte sind nicht transaktional rückrollbar.
Sichern umfasst Datenbank, Dateien und Manifest. Migrationen mit neuer Datenbank und vorhandenen Daten testen; vor produktiver Migration sichern.

## Abgrenzung für den ersten Sprint
Zuerst User/Session/MFA, Event, Team/Rechte, Show, Media, Revision und Geräteinventar in PostgreSQL implementieren. Szenen-/Durchlauf-/Befehlsobjekte als validierte Verträge vorbereiten; volle Liveausführung nach Agentengrundlage.
Nicht alle Fachmodule vorab mit leeren Tabellen vortäuschen. Ticketshop, Saalplan, Einlass, Quiz, Organisation, Bühne, Moderation, Sponsoren und Finanzen erhalten später vollständige Modulmodelle nach F01–F50. Diese Reihenfolge reduziert nicht den vereinbarten Gesamtscope.
