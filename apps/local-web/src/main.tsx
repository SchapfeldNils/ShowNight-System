import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../web/src/style.css";
import "./style.css";
import type { TransferManifest } from "../../../packages/contracts/src/transfer.js";
type Me = {
  id: string;
  displayName: string;
  admin: boolean;
  csrfToken: string;
  grants: { eventId: string; roles: string[] }[];
  preparedAt: string;
  pendingSync: number | null;
};
type Pkg = {
  id: string;
  eventId: string;
  name: string;
  eventRevision: number;
  shows: number;
  media: number;
};
type User = {
  id: string;
  login: string;
  displayName: string;
  admin: boolean;
  enabled: boolean;
  blocked: boolean;
  eventBlocked: boolean;
  roles: string[];
};
function App() {
  const [me, setMe] = useState<Me | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [packages, setPackages] = useState<Pkg[]>([]),
    [selected, setSelected] = useState<
      (TransferManifest & { liveActivationSupported: false }) | null
    >(null);
  const [users, setUsers] = useState<User[]>([]),
    [challenge, setChallenge] = useState<{
      challenge: string;
      setup: boolean;
      secret?: string;
    } | null>(null),
    [codes, setCodes] = useState<string[]>([]);
  const [invite, setInvite] = useState("");
  const clear = () => {
    setMe(null);
    setSelected(null);
    setPackages([]);
    setUsers([]);
    setInvite("");
    setCodes([]);
  };
  async function api<T>(path: string, body?: unknown): Promise<T> {
    const r = await fetch("/api/local" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(me ? { "X-CSRF-Token": me.csrfToken } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const out = await r.json();
    if (!r.ok) {
      if (r.status === 401 && !path.startsWith("/auth/")) clear();
      throw new Error(out.error?.message ?? "Lokale Anfrage fehlgeschlagen.");
    }
    return out;
  }
  async function refresh() {
    const m = await api<Me>("/me");
    setMe(m);
    setPackages(await api<Pkg[]>("/packages"));
    return m;
  }
  useEffect(() => {
    void refresh().catch(() => {});
  }, []);
  useEffect(() => {
    if (!me) return;
    const timer = setInterval(() => {
      void refresh().catch((e) => {
        setError(e.message);
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [!!me]);
  async function task(fn: () => Promise<unknown>) {
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const form = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    return Object.fromEntries(new FormData(e.currentTarget));
  };
  async function choose(p: Pkg) {
    const m = await api<TransferManifest & { liveActivationSupported: false }>(
      "/packages/" + p.id,
    );
    setSelected(m);
    if (
      me &&
      (me.admin ||
        me.grants.some(
          (g) => g.eventId === p.eventId && g.roles.includes("leitung"),
        ))
    )
      setUsers(await api<User[]>("/events/" + p.eventId + "/users"));
    else setUsers([]);
  }
  const manages =
    me &&
    selected &&
    (me.admin ||
      me.grants.some(
        (g) => g.eventId === selected.eventId && g.roles.includes("leitung"),
      ));
  return (
    <div className="offline-app">
      <header>
        <h1>ShowNight</h1>
        <p>Offlinevorbereitung · lokal auf diesem Rechner</p>
      </header>
      <main>
        <aside className="banner">
          Vorbereitungsmodus · Liveaktivierung und Geräteausgabe noch nicht
          verfügbar · Mailversand aus
        </aside>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {!me ? (
          <section>
            <h2>Lokal anmelden</h2>
            <p>
              Verwende das Kennwort aus dem zuletzt importierten Anmeldestand.
            </p>
            {!challenge ? (
              <form
                onSubmit={(e) => {
                  const f = form(e);
                  void task(async () => {
                    const r = await api<any>("/auth/login", {
                      login: f.login,
                      password: f.password,
                    });
                    if (r.authenticated) await refresh();
                    else setChallenge(r);
                  });
                }}
              >
                <label>
                  Benutzername
                  <input name="login" autoComplete="username" required />
                </label>
                <label>
                  Kennwort
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <button>Anmelden</button>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  const f = form(e);
                  void task(async () => {
                    const r = await api<{ recoveryCodes: string[] }>(
                      "/auth/mfa/verify",
                      { challenge: challenge.challenge, code: f.code },
                    );
                    setChallenge(null);
                    await refresh();
                    setCodes(r.recoveryCodes);
                  });
                }}
              >
                <h3>Zusätzliche Bestätigung</h3>
                {challenge.setup && (
                  <>
                    <p>
                      Richte für dieses lokale Konto einen Authenticator ein.
                      Den Schlüssel nur persönlich übernehmen.
                    </p>
                    <p>
                      <code>{challenge.secret}</code>
                    </p>
                  </>
                )}
                <label>
                  Authenticator- oder Offline-Recoverycode
                  <input name="code" autoComplete="one-time-code" required />
                </label>
                <button>Bestätigen</button>
                <button type="button" onClick={() => setChallenge(null)}>
                  Zurück
                </button>
              </form>
            )}
            <details>
              <summary>
                Persönlichen Offline-Einrichtungszugang verwenden
              </summary>
              <form
                onSubmit={(e) => {
                  const f = form(e);
                  void task(async () => {
                    await api("/auth/invitation", {
                      token: f.token,
                      password: f.password,
                    });
                    setMessage("Kennwort gesetzt. Jetzt lokal anmelden.");
                    e.currentTarget?.reset();
                  });
                }}
              >
                <label>
                  Einrichtungscode
                  <input name="token" autoComplete="off" required />
                </label>
                <label>
                  Neues Kennwort (mindestens 12 Zeichen)
                  <input
                    name="password"
                    type="password"
                    minLength={12}
                    maxLength={256}
                    required
                  />
                </label>
                <button>Kennwort setzen</button>
              </form>
            </details>
          </section>
        ) : (
          <>
            <section>
              <h2>{me.displayName}</h2>
              <p>
                Anmeldestand vom{" "}
                {new Date(me.preparedAt).toLocaleString("de-DE")}
              </p>
              <button
                onClick={() =>
                  void task(async () => {
                    await api("/auth/logout", {});
                    clear();
                  })
                }
              >
                Abmelden
              </button>
              {me.admin && (
                <p>
                  {me.pendingSync} lokale Änderungen vorgemerkt. Der
                  Onlineabgleich ist noch nicht implementiert.
                </p>
              )}
            </section>
            {codes.length > 0 && (
              <section>
                <h2>Offline-Recoverycodes einmalig sichern</h2>
                <p>
                  Diese Codes gelten nur hier. Jeder Code ist einmal verwendbar.
                  Persönlich sichern.
                </p>
                <ul>
                  {codes.map((c) => (
                    <li key={c}>
                      <code>{c}</code>
                    </li>
                  ))}
                </ul>
                <button onClick={() => setCodes([])}>Codes gesichert</button>
              </section>
            )}
            <section>
              <h2>Vorbereitete Pakete</h2>
              {!packages.length && (
                <p>Für dieses Konto sind keine Pakete verfügbar.</p>
              )}
              {packages.map((p) => (
                <article key={p.id}>
                  <h3>{p.name}</h3>
                  <p>
                    Revision {p.eventRevision} · {p.shows} Shows · {p.media}{" "}
                    Medien
                  </p>
                  <button onClick={() => void task(() => choose(p))}>
                    Paket ansehen
                  </button>
                </article>
              ))}
            </section>
            {selected && (
              <section>
                <h2>{selected.event.name}</h2>
                <p>Lesender Paketstand · keine Bearbeitung oder Liveausgabe</p>
                {selected.shows.map((s) => (
                  <article key={s.id}>
                    <h3>{s.name}</h3>
                    <p>{s.description}</p>
                    <ol>
                      {s.cues.map((c) => (
                        <li key={c.id}>
                          <strong>{c.name}</strong>
                          <p>{c.triggerHint}</p>
                          <p>{c.notes}</p>
                          <p>
                            {c.enabled ? "Cue vorgesehen" : "Cue deaktiviert"}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </article>
                ))}
                <h3>Medien</h3>
                <p>Downloads spielen weder Vorschau- noch Publikumston ab.</p>
                <ul>
                  {selected.media.map((m) => (
                    <li key={m.id}>
                      <a
                        href={
                          "/api/local/packages/" +
                          selected.id +
                          "/media/" +
                          m.id
                        }
                        download={m.name}
                      >
                        {m.name}
                      </a>{" "}
                      · {m.mime} · {m.sizeBytes} Bytes
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {manages && selected && (
              <section>
                <h2>Lokale Veranstaltungskonten</h2>
                <p>
                  Einrichtungszugänge persönlich weitergeben. Es wird keine
                  E-Mail versendet.
                </p>
                <form
                  onSubmit={(e) => {
                    const f = form(e);
                    void task(async () => {
                      const r = await api<{ invitationToken: string }>(
                        "/events/" + selected.eventId + "/users",
                        {
                          login: f.login,
                          displayName: f.displayName,
                          role: f.role,
                        },
                      );
                      setInvite(r.invitationToken);
                      setUsers(
                        await api<User[]>(
                          "/events/" + selected.eventId + "/users",
                        ),
                      );
                    });
                  }}
                >
                  <label>
                    Benutzername
                    <input
                      name="login"
                      required
                      pattern="[a-z0-9._@+-]{3,120}"
                    />
                  </label>
                  <label>
                    Name
                    <input name="displayName" required />
                  </label>
                  <label>
                    Veranstaltungsrolle
                    <select name="role" defaultValue="mitglied">
                      <option value="mitglied">Mitglied</option>
                      <option value="technik">Technik</option>
                      <option value="live">Live</option>
                      <option value="leitung">
                        Leitung (MFA erforderlich)
                      </option>
                    </select>
                  </label>
                  <button>Konto vorbereiten</button>
                </form>
                {invite && (
                  <aside>
                    <p>Persönlicher Einrichtungscode · 24 Stunden gültig</p>
                    <code>{invite}</code>
                    <button onClick={() => setInvite("")}>
                      Persönlich übernommen
                    </button>
                  </aside>
                )}
                <ul>
                  {users.map((u) => (
                    <li key={u.id}>
                      <strong>{u.displayName}</strong> ({u.login}) ·{" "}
                      {u.roles.join(", ")} ·{" "}
                      {!u.enabled
                        ? "Im Quellstand deaktiviert"
                        : u.blocked
                          ? "Lokal global gesperrt"
                          : u.eventBlocked
                            ? "Für diese Veranstaltung gesperrt"
                            : "Freigegeben"}
                      {!u.admin && (
                        <button
                          onClick={() =>
                            void task(async () => {
                              await api(
                                "/events/" +
                                  selected.eventId +
                                  "/users/" +
                                  u.id +
                                  "/block",
                                { blocked: !u.eventBlocked },
                              );
                              setUsers(
                                await api<User[]>(
                                  "/events/" + selected.eventId + "/users",
                                ),
                              );
                            })
                          }
                        >
                          {u.eventBlocked
                            ? "Veranstaltungssperre aufheben"
                            : "Für Veranstaltung sperren"}
                        </button>
                      )}
                      {me.admin && (
                        <button
                          onClick={() =>
                            void task(async () => {
                              await api("/users/" + u.id + "/block", {
                                blocked: !u.blocked,
                              });
                              setUsers(
                                await api<User[]>(
                                  "/events/" + selected.eventId + "/users",
                                ),
                              );
                            })
                          }
                        >
                          {u.blocked
                            ? "Globale lokale Sperre aufheben"
                            : "Lokal global sperren"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
      <footer>
        ShowNight · vorläufige Gestaltung auf Basis der vorhandenen
        Weboberfläche · Hardwareabnahme offen
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
