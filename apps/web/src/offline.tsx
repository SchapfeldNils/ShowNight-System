import { useState } from "react";
import { localTarget } from "../../../packages/contracts/src/offline.js";
export function OfflineExport({
  packageId,
  csrf,
}: {
  packageId: string;
  csrf: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [target, setTarget] = useState<unknown>(null);
  return (
    <aside className="offline-export">
      <h3>Offline-Anmeldung für diesen Rechner vorbereiten</h3>
      <p>
        Den lokalen Server zuerst einrichten und seine Datei server.sntarget
        auswählen. Inhaltspaket und Anmeldestand werden getrennt
        heruntergeladen.
      </p>
      <p>
        <a href="/api/v1/offline/trust" download>
          Serverschlüssel über die angemeldete HTTPS-Verbindung herunterladen
        </a>
      </p>
      <label>
        Zielanfrage (.sntarget)
        <input
          type="file"
          accept=".sntarget"
          onChange={async (e) => {
            setTarget(null);
            setError("");
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              if (f.size > 16384) throw new Error("Zielanfrage zu groß.");
              setTarget(localTarget.parse(JSON.parse(await f.text())));
            } catch {
              setError(
                "Zielanfrage ungültig. Datei aus der lokalen Einrichtung verwenden.",
              );
            }
          }}
        />
      </label>
      <button
        type="button"
        disabled={!target || busy}
        onClick={() => {
          void (async () => {
            setBusy(true);
            setError("");
            try {
              const r = await fetch("/api/v1/offline/exports", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-CSRF-Token": csrf,
                },
                body: JSON.stringify({ target, packageIds: [packageId] }),
              });
              if (!r.ok) {
                const b = await r.json();
                throw new Error(b.error?.message ?? "Export fehlgeschlagen.");
              }
              const blob = await r.blob(),
                url = URL.createObjectURL(blob),
                a = document.createElement("a");
              a.href = url;
              a.download = "shownight-offline.snauth";
              a.click();
              URL.revokeObjectURL(url);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        Verschlüsselten Anmeldestand herunterladen
      </button>
      {error && <p role="alert">{error}</p>}
      <p>
        Die Datei enthält vertrauliche Anmeldedaten in verschlüsselter Form.
        Persönlich übertragen; der spätere Onlineabgleich und Livebetrieb sind
        noch offen.
      </p>
    </aside>
  );
}
