import { useEffect, useState } from "react";

type Release = {
  version: string;
  size: number;
  sha256: string;
  publishedAt: string;
};
type Api = <T = any>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;

const versionPattern = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;

/** Issue #33 / D020: Setup für den Streaming-Rechner veröffentlichen (nur Admin). */
export function SoftwareUpdates({ api }: { api: Api }) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [version, setVersion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [confirm, setConfirm] = useState<string | null>(null);
  const load = () =>
    api<Release[]>("/software-updates")
      .then(setReleases)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  async function act(action: () => Promise<string | void>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const message = await action();
      setNotice(message || success);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card" aria-label="Softwareupdates Streaming-Rechner">
      <h2>Softwareupdates · Streaming-Rechner</h2>
      <p className="muted">
        Die Version wird aus der Versionsressource der Setup-Datei gelesen. Die
        neueste veröffentlichte Version wird von installierten
        Streaming-Rechnern automatisch geprüft und heruntergeladen. Installiert
        wird dort erst nach Bestätigung. Absicherung: HTTPS, SHA-256 und
        Signatur mit dem Serverschlüssel dieses Onlineservers. Wer diesen Server
        kontrolliert, könnte ein falsches Update verteilen.
      </p>
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
      <form
        aria-label="Update veröffentlichen"
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          const declared = version.trim();
          if (declared && !versionPattern.test(declared))
            return setError(
              "Version im Format 1.2.3 angeben oder leer lassen.",
            );
          if (!file) return setError("Setup-Datei wählen.");
          const body = new FormData();
          body.append("file", file);
          void act(async () => {
            const published = await api<Release>(
              "/software-updates" +
                (declared ? "?version=" + encodeURIComponent(declared) : ""),
              "POST",
              body,
            );
            setVersion("");
            setFile(null);
            return `Version ${published.version} aus der Setup-Datei gelesen und veröffentlicht.`;
          }, "Veröffentlicht.");
        }}
      >
        <label>
          Erwartete Version (optional, Kontrolle)
          <input
            placeholder="z. B. 0.3.12"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          />
        </label>
        <label>
          Setup-Datei (ShowNight-Streaming-Setup-x64.exe)
          <input
            type="file"
            accept=".exe"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button disabled={busy}>Veröffentlichen</button>
      </form>
      {releases.length === 0 ? (
        <p className="muted">Noch keine Version veröffentlicht.</p>
      ) : (
        <ul className="release-list">
          {releases.map((r, index) => (
            <li key={r.version} aria-label={`Version ${r.version}`}>
              <div className="release-row">
                <strong>{r.version}</strong>
                {index === 0 && <span className="badge">aktuell verteilt</span>}
                <span>{(r.size / 1024 / 1024).toFixed(1)} MB</span>
                <span>
                  {new Date(r.publishedAt).toLocaleString("de-DE", {
                    timeZone: "Europe/Berlin",
                  })}
                </span>
                <code className="secret">{r.sha256}</code>
              </div>
              <div className="release-actions">
                {confirm === r.version ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await api(
                            "/software-updates/" +
                              encodeURIComponent(r.version),
                            "DELETE",
                          );
                          setConfirm(null);
                        }, `Version ${r.version} zurückgezogen.`)
                      }
                    >
                      Endgültig zurückziehen
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setConfirm(null)}
                    >
                      Behalten
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setConfirm(r.version)}
                  >
                    Zurückziehen
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
