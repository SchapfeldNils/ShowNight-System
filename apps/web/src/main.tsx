import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  EventRecord,
  ShowRecord,
  MediaRecord,
  Cue,
  Manifest,
} from "../../../packages/contracts/src/index.js";
import "./style.css";
import { moduleKeys } from "../../../packages/contracts/src/index.js";
import { Devices } from "./devices.js";
type Me = {
  id: string;
  displayName: string;
  admin: boolean;
  csrfToken: string;
  demo: boolean;
};
type Team = { id: string; name: string; userIds: string[] };
type Grant = {
  userId: string;
  displayName: string;
  login: string;
  role: string;
};
let csrf = "";
class ApiError extends Error {
  constructor(
    public status: number,
    public data: any,
  ) {
    super(data.error?.message ?? "Verbindung fehlgeschlagen.");
  }
}
async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api/v1" + path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { "X-CSRF-Token": csrf }),
    },
    ...(body === undefined
      ? {}
      : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}
function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label>
      {label}
      <input {...props} />
    </label>
  );
}
function App() {
  const [me, setMe] = useState<Me | null>(null),
    [events, setEvents] = useState<EventRecord[]>([]),
    [eventId, setEventId] = useState(""),
    [page, setPage] = useState("Übersicht"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(false);
  const [login, setLogin] = useState(""),
    [password, setPassword] = useState(""),
    [challenge, setChallenge] = useState<any>(null),
    [code, setCode] = useState(""),
    [recovery, setRecovery] = useState<string[]>([]);
  const [inviteToken, setInviteToken] = useState(() =>
    location.hash.startsWith("#einladung=") ? location.hash.slice(11) : "",
  );
  const [shows, setShows] = useState<ShowRecord[]>([]),
    [library, setLibrary] = useState<ShowRecord[]>([]),
    [media, setMedia] = useState<MediaRecord[]>([]),
    [teams, setTeams] = useState<Team[]>([]),
    [grants, setGrants] = useState<Grant[]>([]),
    [allTeams, setAllTeams] = useState<Team[]>([]),
    [users, setUsers] = useState<any[]>([]);
  const [eventName, setEventName] = useState(""),
    [template, setTemplate] = useState("shownight"),
    [showName, setShowName] = useState(""),
    [teamName, setTeamName] = useState(""),
    [existingTeam, setExistingTeam] = useState(""),
    [newLogin, setNewLogin] = useState(""),
    [newDisplay, setNewDisplay] = useState(""),
    [invitation, setInvitation] = useState("");
  const [editShow, setEditShow] = useState<ShowRecord | null>(null),
    [editEvent, setEditEvent] = useState<EventRecord | null>(null),
    [packageResult, setPackageResult] = useState<Manifest | null>(null),
    [diag, setDiag] = useState<any>(null),
    [jobs, setJobs] = useState<any[]>([]),
    [conflict, setConflict] = useState<{
      path: string;
      mine: any;
      current: any;
    } | null>(null);
  const active = events.find((e) => e.id === eventId);
  async function loadIdentity() {
    try {
      const u = await api<Me>("/me");
      csrf = u.csrfToken;
      setMe(u);
      setEvents(await api("/events"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setMe(null);
        return;
      }
      throw e;
    }
  }
  useEffect(() => {
    void loadIdentity().catch((e) => setError(e.message));
  }, []);
  async function refresh() {
    const [e, l, t] = await Promise.all([
      api<EventRecord[]>("/events"),
      api<ShowRecord[]>("/shows"),
      api<Team[]>("/teams"),
    ]);
    setEvents(e);
    setLibrary(l);
    setAllTeams(t);
    if (eventId) {
      const [s, m, et] = await Promise.all([
        api<ShowRecord[]>("/shows?eventId=" + eventId),
        api<MediaRecord[]>("/media?eventId=" + eventId),
        api<Team[]>("/events/" + eventId + "/teams"),
      ]);
      setShows(s);
      setMedia(m);
      setTeams(et);
      const ev = e.find((e) => e.id === eventId);
      if (ev?.canEdit) setGrants(await api("/events/" + eventId + "/grants"));
      else setGrants([]);
    } else {
      setShows([]);
      setMedia([]);
      setTeams([]);
      setGrants([]);
    }
    if (me?.admin) setUsers(await api("/users"));
  }
  useEffect(() => {
    if (me) void refresh().catch((e) => setError(e.message));
    setEditShow(null);
    setEditEvent(null);
    setPackageResult(null);
  }, [eventId, me?.id]);
  useEffect(() => {
    if (!me) return;
    const timer = setInterval(() => {
      if (page === "Medien" && eventId)
        void api<MediaRecord[]>("/media?eventId=" + eventId)
          .then(setMedia)
          .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [me, eventId, page]);
  useEffect(() => {
    if (!me) return;
    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/v1/status/ws`,
    );
    ws.onmessage = (e) => {
      try {
        const snapshot = JSON.parse(e.data);
        if (snapshot.type === "snapshot") setEvents(snapshot.events);
      } catch {
        /* ignore malformed transport */
      }
    };
    return () => ws.close();
  }, [me?.id]);
  async function run(action: () => Promise<unknown>) {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }
  async function save(path: string, mine: any) {
    try {
      await api(path, "PATCH", mine);
      setNotice("Gespeichert.");
      await refresh();
      setEditShow(null);
      setEditEvent(null);
      return true;
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status === 409 &&
        e.data.error?.code === "REVISION_CONFLICT"
      ) {
        setConflict({ path, mine, current: e.data.error.details.current });
        return false;
      }
      throw e;
    }
  }
  if (!me)
    return (
      <main className="login">
        <div className="brand">
          SHOW<span>NIGHT</span>
        </div>
        <p className="eyebrow">VERANSTALTUNGEN VORBEREITEN · S1</p>
        <section className="card">
          <h1>
            {inviteToken
              ? "Konto einrichten"
              : challenge
                ? "Zusätzliche Bestätigung"
                : "Willkommen"}
          </h1>
          <p>Onlinevorbereitung für Shows und Veranstaltungen.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (inviteToken) {
                  await api("/auth/invitation", "POST", {
                    token: inviteToken,
                    password,
                  });
                  setInviteToken("");
                  history.replaceState(null, "", location.pathname);
                  setPassword("");
                  setNotice("Kennwort eingerichtet. Jetzt anmelden.");
                } else if (challenge) {
                  const result = await api("/auth/mfa/verify", "POST", {
                    challenge: challenge.challenge,
                    code,
                  });
                  csrf = result.csrfToken;
                  if (result.recoveryCodes?.length) {
                    setRecovery(result.recoveryCodes);
                  } else {
                    await loadIdentity();
                    setChallenge(null);
                    setPassword("");
                  }
                } else {
                  const result = await api("/auth/login", "POST", {
                    login,
                    password,
                  });
                  if (result.authenticated) {
                    csrf = result.csrfToken;
                    await loadIdentity();
                    setPassword("");
                  } else {
                    setChallenge(result);
                    setCode("");
                  }
                }
              });
            }}
          >
            {inviteToken ? (
              <Field
                label="Neues Kennwort (mindestens 12 Zeichen)"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={12}
                required
              />
            ) : challenge ? (
              <>
                {challenge.setup && (
                  <div className="callout">
                    <strong>MFA einrichten</strong>
                    <p>
                      Diesen Schlüssel in einer Authenticator-App als
                      zeitbasierten Code hinzufügen:
                    </p>
                    <code className="secret">{challenge.secret}</code>
                    <p>
                      Die Einrichtung ist erst nach gültigem Code abgeschlossen.
                    </p>
                  </div>
                )}
                <Field
                  label="Authenticator-Code oder Wiederherstellungscode"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="one-time-code"
                  required
                />
              </>
            ) : (
              <>
                <Field
                  label="Benutzername"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoComplete="username"
                  required
                />
                <Field
                  label="Kennwort"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </>
            )}
            {!recovery.length && (
              <button disabled={loading}>
                {inviteToken
                  ? "Kennwort setzen"
                  : challenge
                    ? "Bestätigen"
                    : "Anmelden"}
              </button>
            )}
            {challenge && !recovery.length && (
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setChallenge(null);
                  setCode("");
                }}
              >
                Zurück zur Anmeldung
              </button>
            )}
          </form>
          {recovery.length > 0 && (
            <div className="callout">
              <strong>Wiederherstellungscodes einmalig sichern</strong>
              <p>
                Jeder Code kann genau einmal verwendet werden. Außerhalb dieser
                App sicher aufbewahren.
              </p>
              <pre>{recovery.join("\n")}</pre>
              <button
                onClick={() =>
                  void run(async () => {
                    setRecovery([]);
                    setChallenge(null);
                    setPassword("");
                    await loadIdentity();
                  })
                }
              >
                Codes gesichert · Weiter
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="success">
              {notice}
            </p>
          )}
        </section>
        <p className="muted">
          Vorläufige Gestaltung. Originale ShowNight-Designquellen fehlen im
          Repository.
        </p>
      </main>
    );
  const nav = [
    "Übersicht",
    ...(!active || active.modules.includes("shows") ? ["Shows", "Medien"] : []),
    "Teams & Rechte",
    ...(me.admin ? ["Diagnose"] : []),
  ];
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          SHOW<span>NIGHT</span>
        </div>
        <p className="eyebrow">VORBEREITUNG</p>
        <label>
          Veranstaltung wechseln
          <select
            aria-label="Veranstaltung wechseln"
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value);
              setPage("Übersicht");
            }}
          >
            <option value="">Meine Übersicht / Bibliothek</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <nav>
          {nav.map((n) => (
            <button
              key={n}
              className={page === n ? "nav active" : "nav"}
              onClick={() => {
                setPage(n);
                if (n === "Diagnose")
                  void run(async () => {
                    setDiag(await api("/diagnostics"));
                    setJobs(await api("/mail-jobs"));
                  });
              }}
            >
              {n}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <strong>{me.displayName}</strong>
          <small>{me.admin ? "Administration" : "Veranstaltungszugang"}</small>
          <button
            className="secondary"
            onClick={() =>
              void run(async () => {
                await api("/auth/logout", "POST");
                csrf = "";
                setMe(null);
                setEventId("");
              })
            }
          >
            Abmelden
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <p className="eyebrow">
              SHOWNIGHT SYSTEM / {active?.name ?? "MEINE ÜBERSICHT"}
            </p>
            <h1>{page}</h1>
          </div>
          <span className="badge">S1 · Onlinevorbereitung</span>
        </header>
        <div className="banner">
          {me.demo ? "DEMO · Synthetische Daten. " : ""}Gerätekanal simuliert ·
          Keine Bühnenausgabe ·{" "}
          {diag?.mail?.realDeliveryEnabled
            ? "SMTP konfiguriert; keine Demo-Mailanlage"
            : "Mail-Testmodus"}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="success" role="status">
            {notice}
          </p>
        )}
        {page === "Übersicht" && (
          <>
            {!active ? (
              <>
                <section className="card">
                  <h2>Veranstaltung anlegen</h2>
                  <form
                    className="inline"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        const created = await api<EventRecord>(
                          "/events",
                          "POST",
                          { name: eventName, template },
                        );
                        setEventId(created.id);
                        setEventName("");
                        setNotice(
                          "Veranstaltung angelegt. Datum und Ort können später ergänzt werden.",
                        );
                      });
                    }}
                  >
                    <Field
                      label="Name der Veranstaltung"
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                      required
                    />
                    <label>
                      Vorlage
                      <select
                        value={template}
                        onChange={(e) => setTemplate(e.target.value)}
                      >
                        <option value="shownight">ShowNight</option>
                        <option value="spieleabend">Spieleabend</option>
                        <option value="custom">Eigene Veranstaltung</option>
                      </select>
                    </label>
                    <button disabled={loading}>Veranstaltung anlegen</button>
                  </form>
                </section>
                <div className="grid">
                  {events.map((e) => (
                    <button
                      className="event-card"
                      key={e.id}
                      onClick={() => setEventId(e.id)}
                    >
                      <small>{e.role}</small>
                      <h2>{e.name}</h2>
                      <p>
                        {e.date ?? "Datum noch offen"} ·{" "}
                        {e.location || "Ort noch offen"}
                      </p>
                      <span>Vorbereitung öffnen →</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="stats">
                  <section className="card">
                    <small>Shows im Event</small>
                    <strong>{shows.length}</strong>
                  </section>
                  <section className="card">
                    <small>Zugeordnete Teams</small>
                    <strong>{teams.length}</strong>
                  </section>
                  <section className="card">
                    <small>Medien geprüft</small>
                    <strong>
                      {media.filter((m) => m.status === "ready").length} /{" "}
                      {media.length}
                    </strong>
                  </section>
                </div>
                <section className="card">
                  <h2>Einrichtungsstatus</h2>
                  <ul>
                    {!active.date && (
                      <li>Datum offen – für Terminplanung später ergänzen.</li>
                    )}
                    {!active.location && (
                      <li>Ort offen – für Aufbauplanung später ergänzen.</li>
                    )}
                    {!teams.length && <li>Noch kein Team zugeordnet.</li>}
                    {!shows.length && (
                      <li>
                        Noch keine Show als Veranstaltungskopie aufgenommen.
                      </li>
                    )}
                    {media
                      .filter((m) => m.status !== "ready")
                      .map((m) => (
                        <li key={m.id}>
                          {m.name}:{" "}
                          {m.status === "processing"
                            ? "Analyse läuft"
                            : "Prüfung fehlgeschlagen"}
                        </li>
                      ))}
                  </ul>
                  <p className="muted">
                    Aufgaben, Termine und persönliche Anordnung folgen mit dem
                    Organisationsmodul. Dies ist die S1-Prüfübersicht.
                  </p>
                  {active.canEdit && (
                    <button
                      className="secondary"
                      onClick={() => setEditEvent({ ...active })}
                    >
                      Grunddaten und Module bearbeiten
                    </button>
                  )}
                </section>
                {editEvent && (
                  <section className="card">
                    <h2>Veranstaltungsdaten</h2>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(() =>
                          save("/events/" + editEvent.id, {
                            expectedRevision: editEvent.revision,
                            name: editEvent.name,
                            date: editEvent.date,
                            location: editEvent.location,
                            modules: editEvent.modules,
                          }),
                        );
                      }}
                    >
                      <Field
                        label="Name"
                        value={editEvent.name}
                        onChange={(e) =>
                          setEditEvent({ ...editEvent, name: e.target.value })
                        }
                      />
                      <div className="inline">
                        <Field
                          label="Datum"
                          type="date"
                          value={editEvent.date ?? ""}
                          onChange={(e) =>
                            setEditEvent({
                              ...editEvent,
                              date: e.target.value || null,
                            })
                          }
                        />
                        <Field
                          label="Ort"
                          value={editEvent.location}
                          onChange={(e) =>
                            setEditEvent({
                              ...editEvent,
                              location: e.target.value,
                            })
                          }
                        />
                      </div>
                      <p>
                        Modulinhalte bleiben beim Ausblenden erhalten. Shows:{" "}
                        {shows.length}, Medien: {media.length}. Nicht
                        implementierte Module sind nur
                        Vorbereitungseinstellungen.
                      </p>
                      <div className="checks">
                        {moduleKeys.map((key) => (
                          <label key={key}>
                            <input
                              type="checkbox"
                              checked={editEvent.modules.includes(key)}
                              onChange={(e) =>
                                setEditEvent({
                                  ...editEvent,
                                  modules: e.target.checked
                                    ? [...editEvent.modules, key]
                                    : editEvent.modules.filter(
                                        (m) => m !== key,
                                      ),
                                })
                              }
                            />
                            {key}
                          </label>
                        ))}
                      </div>
                      <button disabled={loading}>Daten speichern</button>
                    </form>
                  </section>
                )}
                {active.canEdit && (
                  <section className="card">
                    <h2>Paketmanifest</h2>
                    <p>
                      Pinnt Event- und Showrevisionen sowie Medienprüfsummen.
                      Der Download enthält diesen Vorbereitungsstand und seine
                      Medien. Lokaler Paketimport aktiviert keine Show;
                      Offlinekonten und Livebetrieb folgen.
                    </p>
                    <button
                      disabled={loading}
                      onClick={() =>
                        void run(async () =>
                          setPackageResult(
                            await api(
                              "/events/" + eventId + "/packages",
                              "POST",
                              {},
                            ),
                          ),
                        )
                      }
                    >
                      Paketmanifest erzeugen
                    </button>
                    {packageResult && (
                      <>
                        <p
                          className={
                            packageResult.status === "valid"
                              ? "success"
                              : "error"
                          }
                        >
                          {packageResult.status === "valid"
                            ? "Manifest vollständig geprüft"
                            : "Manifest ungültig"}
                        </p>
                        {packageResult.errors.map((e, i) => (
                          <p key={i}>{e}</p>
                        ))}
                        {packageResult.status === "valid" && (
                          <p>
                            <a
                              href={`/api/v1/packages/${packageResult.id}/download`}
                              download
                            >
                              Paket mit Medien herunterladen
                            </a>
                          </p>
                        )}
                        <details>
                          <summary>Gepinnte Inhalte anzeigen</summary>
                          <pre>{JSON.stringify(packageResult, null, 2)}</pre>
                        </details>
                        <button
                          className="secondary"
                          onClick={() => {
                            const url = URL.createObjectURL(
                              new Blob(
                                [JSON.stringify(packageResult, null, 2)],
                                { type: "application/json" },
                              ),
                            );
                            const a = document.createElement("a");
                            a.href = url;
                            a.download =
                              "shownight-manifest-" +
                              packageResult.id +
                              ".json";
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Manifest herunterladen
                        </button>
                        <button
                          className="secondary"
                          onClick={() =>
                            void run(async () =>
                              setPackageResult(
                                await api(
                                  "/packages/" + packageResult.id + "/manifest",
                                ),
                              ),
                            )
                          }
                        >
                          Dateien erneut prüfen
                        </button>
                      </>
                    )}
                  </section>
                )}
              </>
            )}
          </>
        )}
        {page === "Shows" && (
          <>
            <section className="card">
              <h2>Unabhängige Show vorbereiten</h2>
              <form
                className="inline"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const s = await api<ShowRecord>("/shows", "POST", {
                      name: showName,
                    });
                    setShowName("");
                    await refresh();
                    setEditShow(s);
                  });
                }}
              >
                <Field
                  label="Name der Show"
                  value={showName}
                  onChange={(e) => setShowName(e.target.value)}
                  required
                />
                <button disabled={loading}>Show anlegen</button>
              </form>
            </section>
            {active && (
              <section className="card">
                <h2>Shows in dieser Veranstaltung</h2>
                {shows.map((s) => (
                  <ShowRow
                    key={s.id}
                    show={s}
                    onEdit={() =>
                      setEditShow({ ...s, cues: s.cues.map((c) => ({ ...c })) })
                    }
                  />
                ))}
                {!shows.length && <p>Noch keine Shows aufgenommen.</p>}
              </section>
            )}
            <section className="card">
              <h2>Unabhängige Showbibliothek</h2>
              {library.map((s) => (
                <div className="show-row" key={s.id}>
                  <ShowRow
                    show={s}
                    onEdit={() =>
                      setEditShow({ ...s, cues: s.cues.map((c) => ({ ...c })) })
                    }
                  />
                  {active?.canEdit && (
                    <button
                      className="secondary"
                      disabled={loading}
                      onClick={() =>
                        void run(async () => {
                          await api(
                            "/events/" + eventId + "/show-copies",
                            "POST",
                            { sourceShowId: s.id, sourceRevision: s.revision },
                          );
                          await refresh();
                          setNotice(
                            "Eigenständige Eventkopie aufgenommen. Spätere Quellenänderungen werden nicht automatisch übernommen.",
                          );
                        })
                      }
                    >
                      Als Eventkopie aufnehmen
                    </button>
                  )}
                </div>
              ))}
            </section>
            {editShow && (
              <ShowEditor
                key={editShow.id}
                initial={editShow}
                teams={teams}
                onSave={(s) =>
                  run(() =>
                    save("/shows/" + s.id, {
                      expectedRevision: s.revision,
                      name: s.name,
                      description: s.description,
                      cues: s.cues,
                    }),
                  )
                }
                onAssign={(teamId) =>
                  run(async () => {
                    await api("/shows/" + editShow.id + "/teams", "POST", {
                      teamId,
                    });
                    await refresh();
                    setNotice(
                      "Team darf die gesamte zugeordnete Show bearbeiten.",
                    );
                  })
                }
                onUploaded={() => refresh()}
                onClose={() => setEditShow(null)}
                busy={loading}
              />
            )}
          </>
        )}
        {page === "Medien" && (
          <>
            {active ? (
              <>
                <section className="card">
                  <h2>Veranstaltungsmedien</h2>
                  <p>
                    Originaldateien bleiben erhalten. Zulässige Formate: PNG,
                    JPEG, MP4, WebM, MP3, WAV. Größe, tatsächlicher Dateityp und
                    Abspielmetadaten werden geprüft.
                  </p>
                  {active.canEdit && (
                    <Upload
                      scope={"eventId=" + eventId}
                      onDone={() => refresh()}
                    />
                  )}
                </section>
                <MediaList media={media} />
              </>
            ) : (
              <section className="card">
                <p>
                  Veranstaltung auswählen oder Medien direkt in einer
                  unabhängigen Show hochladen.
                </p>
              </section>
            )}
          </>
        )}
        {page === "Teams & Rechte" && (
          <>
            {active ? (
              <>
                <section className="card">
                  <h2>Teams zuordnen</h2>
                  <p>
                    Eine Eventzuordnung ermöglicht Sichtbarkeit. Bearbeitung
                    gilt erst für die ausdrücklich zugeordnete ganze Show. LIVE
                    und Technik bleiben eigene Rechte.
                  </p>
                  {active.canEdit && (
                    <>
                      <form
                        className="inline"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(async () => {
                            await api("/events/" + eventId + "/teams", "POST", {
                              name: teamName,
                            });
                            setTeamName("");
                            await refresh();
                          });
                        }}
                      >
                        <Field
                          label="Neues Team"
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                          required
                        />
                        <button>Team anlegen und zuordnen</button>
                      </form>
                      <form
                        className="inline"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(async () => {
                            await api("/events/" + eventId + "/teams", "POST", {
                              teamId: existingTeam,
                            });
                            await refresh();
                          });
                        }}
                      >
                        <label>
                          Bestehendes Team
                          <select
                            value={existingTeam}
                            onChange={(e) => setExistingTeam(e.target.value)}
                            required
                          >
                            <option value="">Team wählen</option>
                            {allTeams.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button className="secondary">Team zuordnen</button>
                      </form>
                    </>
                  )}
                  {teams.map((t) => (
                    <div className="team-row" key={t.id}>
                      <strong>{t.name}</strong>
                      <p>{t.userIds.length} Mitglieder</p>
                      {active.canEdit && (
                        <select
                          aria-label={"Mitglied zu " + t.name + " hinzufügen"}
                          value=""
                          onChange={(e) => {
                            const userId = e.target.value;
                            if (userId)
                              void run(async () => {
                                await api(
                                  "/events/" +
                                    eventId +
                                    "/teams/" +
                                    t.id +
                                    "/members",
                                  "POST",
                                  { userId },
                                );
                                await refresh();
                              });
                          }}
                        >
                          <option value="">Mitglied hinzufügen</option>
                          {[
                            ...new Map(
                              grants.map((g) => [g.userId, g]),
                            ).values(),
                          ]
                            .filter((g) => !t.userIds.includes(g.userId))
                            .map((g) => (
                              <option key={g.userId} value={g.userId}>
                                {g.displayName}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  ))}
                </section>
                {active.canEdit && (
                  <>
                    <section className="card">
                      <h2>Konto einladen</h2>
                      <form
                        className="inline"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(async () => {
                            const u = await api(
                              "/events/" + eventId + "/users",
                              "POST",
                              { login: newLogin, displayName: newDisplay },
                            );
                            setInvitation(u.invitationUrl);
                            setNewLogin("");
                            setNewDisplay("");
                            await refresh();
                          });
                        }}
                      >
                        <Field
                          label="Benutzername"
                          value={newLogin}
                          onChange={(e) => setNewLogin(e.target.value)}
                          required
                        />
                        <Field
                          label="Anzeigename"
                          value={newDisplay}
                          onChange={(e) => setNewDisplay(e.target.value)}
                          required
                        />
                        <button>Einrichtungslink erstellen</button>
                      </form>
                      {invitation && (
                        <div className="callout">
                          <p>
                            Einmalig angezeigter Link, 24 Stunden gültig.
                            Persönlich weitergeben; keine Mail versendet.
                          </p>
                          <input
                            readOnly
                            aria-label="Einrichtungslink"
                            value={invitation}
                          />
                        </div>
                      )}
                    </section>
                    <section className="card">
                      <h2>Eventrechte</h2>
                      <p>
                        Leitung benötigt MFA. Die Rolle erteilt keine
                        Systemadministration und kein LIVE-Recht.
                      </p>
                      <table>
                        <thead>
                          <tr>
                            <th>Person</th>
                            <th>Rolle</th>
                            <th>Aktion</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grants.map((g) => (
                            <tr key={g.userId + g.role}>
                              <td>{g.displayName}</td>
                              <td>{g.role}</td>
                              <td>
                                <button
                                  className="secondary"
                                  onClick={() =>
                                    void run(async () => {
                                      await api(
                                        "/events/" +
                                          eventId +
                                          "/grants/" +
                                          g.userId +
                                          "/" +
                                          g.role,
                                        "DELETE",
                                      );
                                      await refresh();
                                    })
                                  }
                                >
                                  Widerrufen
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <GrantForm
                        users={
                          me.admin
                            ? users
                            : [
                                ...new Map(
                                  grants.map((g) => [
                                    g.userId,
                                    {
                                      id: g.userId,
                                      displayName: g.displayName,
                                    },
                                  ]),
                                ).values(),
                              ]
                        }
                        admin={me.admin}
                        onGrant={(userId, role) =>
                          run(async () => {
                            await api(
                              "/events/" + eventId + "/grants",
                              "POST",
                              { userId, role },
                            );
                            await refresh();
                          })
                        }
                      />
                    </section>
                  </>
                )}
              </>
            ) : (
              <section className="card">
                Bitte eine Veranstaltung auswählen.
              </section>
            )}
          </>
        )}
        {page === "Diagnose" && diag && (
          <>
            <Devices api={api} run={run} />
            <section className="card">
              <h2>S1-Diagnosebeispiele · ausschließlich simuliert</h2>
              <p>
                Diese Beispiele sind keine verbundenen Geräte und führen keine
                Bühnenbefehle aus.
              </p>
              <div className="grid">
                {diag.devices.map((d: any) => (
                  <div className="callout" key={d.id}>
                    <strong>{d.profile.toUpperCase()} · SIMULIERT</strong>
                    <p>{d.adapter}</p>
                    {d.capabilities.map((c: any) => (
                      <p key={c.name}>
                        {c.name}:{" "}
                        {c.availability === "unknown"
                          ? "Unbekannt / nicht geprüft"
                          : "Online nicht unterstützt"}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </section>
            <section className="card">
              <h2>
                Mailwarteschlange ·{" "}
                {diag.mail.realDeliveryEnabled ? "SMTP" : "Testmodus"}
              </h2>
              <p>
                Testaufträge werden dauerhaft gespeichert und vom Worker als
                simuliert markiert. Eine SMTP-Annahme ist kein Zustellnachweis.
              </p>
              <button
                disabled={diag.mail.realDeliveryEnabled}
                onClick={() =>
                  void run(async () => {
                    await api("/mail-jobs", "POST", {
                      businessKey: "demo-" + crypto.randomUUID(),
                      recipient: "demo@example.invalid",
                      subject: "ShowNight Test",
                      text: "Synthetischer Test ohne Versand.",
                    });
                    setJobs(await api("/mail-jobs"));
                  })
                }
              >
                Synthetischen Testauftrag anlegen
              </button>
              <button
                className="secondary"
                onClick={() =>
                  void run(async () => setJobs(await api("/mail-jobs")))
                }
              >
                Status aktualisieren
              </button>
              <table>
                <thead>
                  <tr>
                    <th>Auftrag</th>
                    <th>Zustand</th>
                    <th>Versuche</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td>{j.businessKey}</td>
                      <td>{j.status}</td>
                      <td>{j.attempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
        <footer>
          Entwicklungszwischenstand S1 · Vorläufige Gestaltung, Originaldateien
          fehlen · Vollständige Veranstaltungsfreigabe ausstehend
        </footer>
      </main>
      {conflict && (
        <div className="modal-backdrop">
          <section
            className="card modal"
            role="dialog"
            aria-modal="true"
            aria-label="Versionskonflikt"
          >
            <h2>Versionskonflikt</h2>
            <p>
              Die andere Änderung wurde zuerst gespeichert. Deine Fassung bleibt
              hier erhalten. Keine automatische Wiederholung.
            </p>
            <div className="grid">
              <div>
                <h3>Meine Fassung</h3>
                <pre>{JSON.stringify(conflict.mine, null, 2)}</pre>
              </div>
              <div>
                <h3>Aktuelle Fassung · Revision {conflict.current.revision}</h3>
                <pre>{JSON.stringify(conflict.current, null, 2)}</pre>
              </div>
            </div>
            <button
              onClick={() =>
                void run(async () => {
                  const saved = await save(conflict.path, {
                    ...conflict.mine,
                    expectedRevision: conflict.current.revision,
                  });
                  if (saved) setConflict(null);
                })
              }
            >
              Meine Fassung bewusst als neue Revision speichern
            </button>
            <button
              className="secondary"
              onClick={() => {
                setEditShow(null);
                setEditEvent(null);
                setConflict(null);
                void refresh();
              }}
            >
              Aktuelle Fassung übernehmen
            </button>
            <button className="secondary" onClick={() => setConflict(null)}>
              Weiter bearbeiten
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
function ShowRow({ show, onEdit }: { show: ShowRecord; onEdit: () => void }) {
  return (
    <div className="show-info">
      <div>
        <h3>{show.name}</h3>
        <p>
          {show.cues.length} Einsätze · Revision {show.revision}
          {show.sourceShowId ? " · Veranstaltungskopie" : ""}
        </p>
      </div>
      <button className="secondary" onClick={onEdit}>
        {show.canEdit ? "Arbeitsfläche öffnen" : "Show ansehen"}
      </button>
    </div>
  );
}
function ShowEditor({
  initial,
  teams,
  onSave,
  onAssign,
  onUploaded,
  onClose,
  busy,
}: {
  initial: ShowRecord;
  teams: Team[];
  onSave: (s: ShowRecord) => Promise<void>;
  onAssign: (teamId: string) => Promise<void>;
  onUploaded: () => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const [s, setS] = useState(initial),
    [media, setMedia] = useState<MediaRecord[]>([]),
    [team, setTeam] = useState(""),
    [error, setError] = useState("");
  const scope = "showId=" + s.id;
  const load = async () => {
    try {
      setMedia(await api("/media?" + scope));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, [s.id]);
  function updateCue(index: number, values: Partial<Cue>) {
    setS({
      ...s,
      cues: s.cues.map((c, i) => (i === index ? { ...c, ...values } : c)),
    });
  }
  return (
    <section className="card editor">
      <div className="show-info">
        <h2>
          {s.name} · {s.eventId ? "Eventkopie" : "Unabhängige Vorbereitung"}
        </h2>
        <button className="secondary" onClick={onClose}>
          Arbeitsfläche schließen
        </button>
      </div>
      <p className="muted">
        Entwurf im Browser · Ausgangsrevision {s.revision} · Speichern ändert
        keine Liveausgabe.
      </p>
      {error && <p className="error">{error}</p>}
      <Field
        label="Showname"
        value={s.name}
        disabled={!s.canEdit}
        onChange={(e) => setS({ ...s, name: e.target.value })}
      />
      <label htmlFor={"description-" + s.id}>Beschreibung</label>
      <textarea
        id={"description-" + s.id}
        value={s.description}
        disabled={!s.canEdit}
        onChange={(e) => setS({ ...s, description: e.target.value })}
      />
      <h3>Einsätze</h3>
      {s.cues.map((c, i) => (
        <div className="cue" key={c.id}>
          <span className="cue-index">{String(i + 1).padStart(2, "0")}</span>
          <div>
            <Field
              label="Einsatzname"
              value={c.name}
              disabled={!s.canEdit}
              onChange={(e) => updateCue(i, { name: e.target.value })}
            />
            <Field
              label="Auslösehinweis"
              value={c.triggerHint}
              disabled={!s.canEdit}
              onChange={(e) => updateCue(i, { triggerHint: e.target.value })}
            />
            <label htmlFor={"notes-" + c.id}>Notizen</label>
            <textarea
              id={"notes-" + c.id}
              value={c.notes}
              disabled={!s.canEdit}
              onChange={(e) => updateCue(i, { notes: e.target.value })}
            />
            <div className="checks">
              <label>
                <input
                  type="checkbox"
                  checked={c.enabled}
                  disabled={!s.canEdit}
                  onChange={(e) => updateCue(i, { enabled: e.target.checked })}
                />
                Einsatz aktiviert
              </label>
            </div>
            <label>
              Medienreferenz hinzufügen
              <select
                value=""
                disabled={!s.canEdit}
                onChange={(e) => {
                  if (e.target.value && !c.mediaIds.includes(e.target.value))
                    updateCue(i, { mediaIds: [...c.mediaIds, e.target.value] });
                }}
              >
                <option value="">Datei wählen</option>
                {media.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.status}
                  </option>
                ))}
              </select>
            </label>
            {c.mediaIds.map((id) => (
              <p key={id}>
                {media.find((m) => m.id === id)?.name ?? id}
                {s.canEdit && (
                  <button
                    className="secondary"
                    onClick={() =>
                      updateCue(i, {
                        mediaIds: c.mediaIds.filter((m) => m !== id),
                      })
                    }
                  >
                    Referenz entfernen
                  </button>
                )}
              </p>
            ))}
          </div>
          {s.canEdit && (
            <div className="cue-actions">
              <button
                className="secondary"
                disabled={i === 0}
                onClick={() => {
                  const next = [...s.cues];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  setS({ ...s, cues: next });
                }}
              >
                ↑
              </button>
              <button
                className="secondary"
                disabled={i === s.cues.length - 1}
                onClick={() => {
                  const next = [...s.cues];
                  [next[i + 1], next[i]] = [next[i], next[i + 1]];
                  setS({ ...s, cues: next });
                }}
              >
                ↓
              </button>
              <button
                className="secondary"
                onClick={() =>
                  setS({ ...s, cues: s.cues.filter((_, j) => j !== i) })
                }
              >
                Entfernen
              </button>
            </div>
          )}
        </div>
      ))}
      {s.canEdit && (
        <>
          <button
            className="secondary"
            onClick={() =>
              setS({
                ...s,
                cues: [
                  ...s.cues,
                  {
                    id: crypto.randomUUID(),
                    name: "Neuer Einsatz",
                    triggerHint: "",
                    notes: "",
                    enabled: true,
                    mediaIds: [],
                  },
                ],
              })
            }
          >
            Einsatz hinzufügen
          </button>
          <button disabled={busy} onClick={() => void onSave(s)}>
            Show speichern
          </button>
          <h3>Showmedien</h3>
          <Upload
            scope={scope}
            onDone={async () => {
              await load();
              await onUploaded();
            }}
          />
          <MediaList media={media} />
          {s.eventId && (
            <form
              className="inline"
              onSubmit={(e) => {
                e.preventDefault();
                void onAssign(team);
              }}
            >
              <label>
                Team für die ganze Show
                <select
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  required
                >
                  <option value="">Team wählen</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="secondary">Showteam zuordnen</button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
function Upload({
  scope,
  onDone,
}: {
  scope: string;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <label className="upload">
      {busy ? "Upload läuft …" : "Datei sicher hochladen"}
      <input
        type="file"
        disabled={busy}
        accept=".png,.jpg,.jpeg,.mp4,.webm,.mp3,.wav"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const body = new FormData();
          body.append("file", file);
          setBusy(true);
          setMessage("");
          void api("/media/uploads?" + scope, "POST", body)
            .then(async () => {
              setMessage("Original gespeichert. Analyse läuft im Worker.");
              await onDone();
            })
            .catch((e) => setMessage(e.message))
            .finally(() => setBusy(false));
          e.target.value = "";
        }}
      />
      <span role="status">{message}</span>
    </label>
  );
}
function MediaList({ media }: { media: MediaRecord[] }) {
  return (
    <div className="media-grid">
      {media.map((m) => (
        <article className="card" key={m.id}>
          {m.status === "ready" && m.mime.startsWith("image/") && (
            <img src={"/api/v1/media/" + m.id + "/content"} alt={m.name} />
          )}
          <h3>{m.name}</h3>
          <p className={"state " + m.status}>
            {m.status === "ready"
              ? "Geprüft"
              : m.status === "processing"
                ? "Analyse läuft"
                : "Prüfung fehlgeschlagen"}
          </p>
          <p>
            {(m.sizeBytes / 1024).toFixed(1)} KB · {m.mime}
          </p>
          {m.analysis.duration && (
            <p>{m.analysis.duration.toFixed(1)} Sekunden</p>
          )}
          {m.error && <p className="error">{m.error}</p>}
          <details>
            <summary>Speicherung und Analyse</summary>
            <p>
              SHA-256: <code>{m.sha256}</code>
            </p>
            <pre>{JSON.stringify(m.analysis, null, 2)}</pre>
            <p>Lautheitsanalyse und Abspielfassungen folgen später.</p>
          </details>
          {m.status === "ready" && (
            <a
              href={"/api/v1/media/" + m.id + "/content"}
              target="_blank"
              rel="noreferrer"
            >
              Geprüftes Original öffnen
            </a>
          )}
        </article>
      ))}
    </div>
  );
}
function GrantForm({
  users,
  admin,
  onGrant,
}: {
  users: any[];
  admin: boolean;
  onGrant: (u: string, r: string) => Promise<void>;
}) {
  const [u, setU] = useState(""),
    [role, setRole] = useState("mitglied");
  return (
    <form
      className="inline"
      onSubmit={(e) => {
        e.preventDefault();
        void onGrant(u, role);
      }}
    >
      <label>
        Person
        <select value={u} onChange={(e) => setU(e.target.value)} required>
          <option value="">Person wählen</option>
          {users.map((x) => (
            <option key={x.id} value={x.id}>
              {x.displayName}
            </option>
          ))}
        </select>
      </label>
      <label>
        Rolle
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {["mitglied", "leitung", "live", ...(admin ? ["technik"] : [])].map(
            (r) => (
              <option value={r} key={r}>
                {r}
              </option>
            ),
          )}
        </select>
      </label>
      <button>Eventrecht hinzufügen</button>
    </form>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
