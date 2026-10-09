import { useEffect, useState } from "react";
type Device = {
  id: string;
  name: string;
  profile: string;
  revokedAt: string | null;
  lastSeen: string | null;
  connected: boolean;
  agentVersion: string | null;
  capabilities: { name: string; source: string; availability: string }[];
  receipts: {
    id: string;
    action: string;
    status: string;
    evidence: string | null;
  }[];
};
type Api = <T = any>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;
const availability: Record<string, string> = {
  available: "Verfügbar",
  simulated: "SIMULIERT – keine Gerätewirkung",
  unknown: "Unbekannt / nicht geprüft",
  unsupported_online: "Online nicht unterstützt",
};
const status: Record<string, string> = {
  sent: "Gesendet",
  accepted: "Empfang gespeichert",
  completed: "Diagnose abgeschlossen",
  unknown: "Ergebnis unbekannt – nicht wiederholen",
  failed: "Fehlgeschlagen",
};
export function Devices({
  api,
  run,
}: {
  api: Api;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [devices, setDevices] = useState<Device[]>([]),
    [name, setName] = useState(""),
    [profile, setProfile] = useState("dj"),
    [pairing, setPairing] = useState<{
      code: string;
      expiresAt: string;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true,
      busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const d = await api<Device[]>("/devices");
        if (live) {
          setDevices(d);
          setError("");
        }
      } catch {
        if (live)
          setError(
            "Gerätestatus nicht erreichbar; angezeigte Werte können veraltet sein.",
          );
      } finally {
        busy = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [api]);
  return (
    <section className="card">
      <h2>Windows-Agenten · Verbindung und Diagnose</h2>
      <p>
        Reale Verbindungen werden getrennt von Testadaptern angezeigt. Online
        keine Bühnen-, Musik- oder Lichtbefehle. Ein Diagnoseergebnis bestätigt
        keine physische Ausgabe.
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () =>
            setPairing(
              await api("/devices/pairings", "POST", { name, profile }),
            ),
          );
        }}
      >
        <label>
          Gerätename
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Geräteprofil
          <select
            aria-label="Geräteprofil"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
          >
            <option value="dj">DJ-Notebook</option>
            <option value="light">Lichtnotebook</option>
            <option value="main">Hauptrechner</option>
          </select>
        </label>
        <button>Paarungscode erstellen</button>
      </form>
      {pairing && (
        <div className="callout">
          <strong>
            Einmaliger Code: <code>{pairing.code}</code>
          </strong>
          <p>
            Im Windows-Agenten „Einrichten.cmd“ eingeben. Gültig bis{" "}
            {new Date(pairing.expiresAt).toLocaleTimeString("de-DE")}.
            Serveradresse: {location.origin}
          </p>
          <button className="secondary" onClick={() => setPairing(null)}>
            Code ausblenden
          </button>
        </div>
      )}
      {!devices.length && <p>Noch keine gepaarten Geräte.</p>}
      <div className="grid">
        {devices.map((d) => (
          <article key={d.id} className="callout">
            <h3>
              {d.name} · {d.profile.toUpperCase()}
            </h3>
            <strong>
              {d.revokedAt
                ? "Widerrufen"
                : error
                  ? "Verbindung ungeprüft"
                  : d.connected
                    ? "Verbunden"
                    : "Nicht verbunden"}
            </strong>
            <p>
              Agent: {d.agentVersion ?? "Noch nicht gemeldet"} · letzte Meldung:{" "}
              {d.lastSeen
                ? new Date(d.lastSeen).toLocaleString("de-DE")
                : "Keine"}
            </p>
            {d.capabilities.map((c) => (
              <p key={c.name}>
                {c.name}: {availability[c.availability]} (
                {c.source === "agent"
                  ? "Agent"
                  : c.source === "simulator"
                    ? "Simulator"
                    : "Nicht eingerichtet"}
                )
              </p>
            ))}
            <button
              disabled={!d.connected || !!d.revokedAt || !!error}
              onClick={() =>
                void run(async () => {
                  await api("/devices/" + d.id + "/diagnostics", "POST", {
                    dispatchId: crypto.randomUUID(),
                    action: "diagnostics.ping",
                  });
                  setDevices(await api("/devices"));
                })
              }
            >
              Verbindung prüfen
            </button>
            <button
              className="secondary"
              disabled={!!d.revokedAt}
              onClick={() =>
                void run(async () => {
                  await api("/devices/" + d.id + "/revoke", "POST", {});
                  setDevices(await api("/devices"));
                })
              }
            >
              Geräteidentität widerrufen
            </button>
            {d.receipts.map((r) => (
              <p key={r.id}>
                {r.action === "simulator.noop"
                  ? "SIMULIERTER Test"
                  : "Verbindungsdiagnose"}
                : {status[r.status]} · {r.id.slice(0, 8)}
              </p>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
