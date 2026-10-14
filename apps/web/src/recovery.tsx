import { useState } from "react";

type Request = (path: string, method?: string, body?: unknown) => Promise<any>;
export function Recovery({
  request,
  mode,
  token,
  done,
}: {
  request: Request;
  mode: "request" | "reset" | "confirm";
  token: string;
  done: (message: string) => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  return (
    <section className="card account-card">
      <h1>
        {mode === "request"
          ? "Passwort vergessen"
          : mode === "reset"
            ? "Neues Passwort setzen"
            : "E-Mail-Adresse bestätigen"}
      </h1>
      <p>
        {mode === "request"
          ? "Wenn dein Konto eine bestätigte E-Mail-Adresse hat, erhältst du einen Link zum Zurücksetzen."
          : mode === "reset"
            ? "Dein Authenticator bleibt eingerichtet. Du benötigst ihn weiterhin für die Anmeldung."
            : "Bestätige die E-Mail-Adresse, die du in deinem Konto hinterlegt hast."}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setNotice("");
          if (mode === "reset" && password !== repeat) {
            setError("Die neuen Passwörter stimmen nicht überein.");
            return;
          }
          setBusy(true);
          try {
            if (mode === "request") {
              const result = await request("/auth/password/request", "POST", {
                identifier,
              });
              setNotice(
                result.mailDeliveryEnabled
                  ? "Falls ein passendes Konto mit bestätigter E-Mail-Adresse vorhanden ist, erhältst du eine Nachricht. Prüfe auch deinen Spamordner."
                  : "Mailversand ist hier deaktiviert. Es wurde keine echte E-Mail versendet.",
              );
            } else if (mode === "reset") {
              await request("/auth/password/reset", "POST", {
                token,
                newPassword: password,
              });
              done(
                "Passwort zurückgesetzt. Bitte melde dich mit deinem neuen Passwort und gegebenenfalls deinem Authenticator an.",
              );
            } else {
              await request("/auth/email/confirm", "POST", { token });
              done(
                "E-Mail-Adresse bestätigt. Du kannst sie jetzt für die Passwortwiederherstellung verwenden.",
              );
            }
          } catch (failure) {
            setError(
              failure instanceof Error
                ? failure.message
                : "Die Anfrage konnte nicht abgeschlossen werden.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          {mode === "request" && (
            <label>
              E-Mail-Adresse oder Benutzername
              <input
                autoComplete="username"
                required
                maxLength={254}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </label>
          )}
          {mode === "reset" && (
            <>
              <label>
                Neues Passwort
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={256}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
            </>
          )}
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
          <button type="submit">
            {busy
              ? "Wird bearbeitet …"
              : mode === "request"
                ? "Link anfordern"
                : mode === "reset"
                  ? "Neues Passwort speichern"
                  : "E-Mail-Adresse bestätigen"}
          </button>
          <button type="button" className="secondary" onClick={() => done("")}>
            Zur Anmeldung
          </button>
        </fieldset>
      </form>
    </section>
  );
}
