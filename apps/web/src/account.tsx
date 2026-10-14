import { useState, useEffect } from "react";

export function Account({
  name,
  login,
  changePassword,
  request,
}: {
  name: string;
  login?: string;
  request: (path: string, method?: string, body?: unknown) => Promise<any>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailState, setEmailState] = useState<any>(null);
  const [emailNotice, setEmailNotice] = useState("");
  useEffect(() => {
    let active = true;
    void request("/account")
      .then((value) => {
        if (active) setEmailState(value);
      })
      .catch(() => {
        if (active) setError("Kontodaten konnten nicht geladen werden.");
      });
    return () => {
      active = false;
    };
  }, [request]);
  return (
    <section className="card account-card" aria-labelledby="account-heading">
      <h2 id="account-heading">Anmeldung &amp; Sicherheit</h2>
      <p>
        Angemeldet als <strong>{name}</strong>
        {login ? ` (${login})` : ""}.
      </p>
      <h3>E-Mail für die Kontowiederherstellung</h3>
      <p>
        {emailState?.email
          ? `Bestätigte Adresse: ${emailState.email}`
          : "Noch keine bestätigte E-Mail-Adresse hinterlegt."}
      </p>
      {emailState?.pendingEmail && (
        <p>Bestätigung ausstehend: {emailState.pendingEmail}</p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setEmailNotice("");
          setBusy(true);
          try {
            const result = await request("/account/email", "POST", {
              email,
              currentPassword: emailPassword,
            });
            setEmailPassword("");
            setEmailState(await request("/account"));
            setEmailNotice(
              result.mailDeliveryEnabled
                ? "Bitte bestätige die neue Adresse über den Link in deiner E-Mail."
                : "Mailversand ist hier deaktiviert. Es wurde keine echte Bestätigungsmail versendet.",
            );
          } catch (failure) {
            setError(
              failure instanceof Error
                ? failure.message
                : "E-Mail-Adresse konnte nicht hinterlegt werden.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label>
            E-Mail-Adresse
            <input
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Aktuelles Passwort für E-Mail-Bestätigung
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
            />
          </label>
          <button type="submit">Bestätigungsmail anfordern</button>
          {emailNotice && (
            <p className="success" role="status">
              {emailNotice}
            </p>
          )}
        </fieldset>
      </form>
      <h3>Passwort ändern</h3>
      <p>
        Diese Änderung gilt für deine Online-Anmeldung. Danach meldest du dich
        auf allen Geräten erneut an. Dein Authenticator bleibt eingerichtet.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          if (next !== repeat) {
            setError("Die neuen Passwörter stimmen nicht überein.");
            return;
          }
          setBusy(true);
          try {
            await changePassword(current, next);
          } catch (failure) {
            setError(
              failure instanceof Error
                ? failure.message
                : "Passwort konnte nicht geändert werden.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Aktuelles Passwort
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            Neues Passwort
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={256}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </label>
          <label>
            Neues Passwort wiederholen
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={256}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </label>
          <small>
            Mindestens 12 Zeichen. Verwende ein eigenes, neues Passwort.
          </small>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit">
            {busy ? "Passwort wird geändert …" : "Passwort ändern"}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
