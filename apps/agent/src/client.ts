import WebSocket from "ws";
import { join } from "node:path";
import {
  agentDispatch,
  agentWelcome,
  type AgentIdentity,
} from "../../../packages/contracts/src/agent.js";
import { Ledger } from "./ledger.js";
export const capabilities = [
  { name: "Verbindungsdiagnose", source: "agent", availability: "available" },
  {
    name: "Test ohne Gerätewirkung",
    source: "simulator",
    availability: "simulated",
  },
  {
    name: "VirtualDJ / Daslight / Controller",
    source: "unconfigured",
    availability: "unknown",
  },
  {
    name: "HDMI und Publikumston",
    source: "unconfigured",
    availability: "unsupported_online",
  },
] as const;
export function startAgent(
  identity: AgentIdentity,
  dir: string,
  onState: (state: string) => void = () => {},
) {
  const ledger = new Ledger(join(dir, "receipts.sqlite"));
  let stopped = false,
    disposed = false,
    ws: WebSocket | undefined,
    retry: ReturnType<typeof setTimeout> | undefined,
    attempt = 0;
  const connect = () => {
    if (stopped) return;
    const url = new URL("/api/agent/v1/ws", identity.server);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url, {
      headers: { Authorization: "Bearer " + identity.credential },
      maxPayload: 4096,
      handshakeTimeout: 10000,
      followRedirects: false,
    });
    ws = socket;
    let epoch: string | undefined,
      heartbeat: ReturnType<typeof setInterval> | undefined;
    const welcomeTimeout = setTimeout(
      () => socket.close(1008, "Serverantwort fehlt"),
      12000,
    );
    socket.on("open", () =>
      socket.send(
        JSON.stringify({
          type: "hello",
          protocolVersion: 1,
          deviceId: identity.deviceId,
          profile: identity.profile,
          agentVersion: "0.2.0",
          capabilities,
        }),
      ),
    );
    socket.on("unexpected-response", (_request, response) => {
      response.resume();
      if ([401, 403, 404].includes(response.statusCode ?? 0)) {
        stopped = true;
        onState(
          "Identität/Server abgewiesen; bewusste neue Paarung erforderlich.",
        );
      }
      socket.terminate();
    });
    socket.on("message", (raw) => {
      if (stopped) return;
      try {
        const input = JSON.parse(raw.toString());
        if (!epoch) {
          const welcome = agentWelcome.parse(input);
          if (
            welcome.deviceId !== identity.deviceId ||
            welcome.profile !== identity.profile
          )
            throw new Error("Identität");
          epoch = welcome.authorityEpoch;
          attempt = 0;
          clearTimeout(welcomeTimeout);
          onState("Verbunden · ausschließlich Diagnose");
          heartbeat = setInterval(() => {
            if (socket.readyState === 1)
              socket.send(
                JSON.stringify({
                  type: "heartbeat",
                  protocolVersion: 1,
                  authorityEpoch: epoch,
                }),
              );
          }, 5000);
          return;
        }
        const dispatch = agentDispatch.parse(input);
        if (
          dispatch.deviceId !== identity.deviceId ||
          dispatch.authorityEpoch !== epoch
        )
          throw new Error("Zuständigkeit");
        const send = (receipt: ReturnType<Ledger["complete"]>) =>
          socket.send(
            JSON.stringify({
              type: "receipt",
              protocolVersion: 1,
              authorityEpoch: epoch,
              dispatchId: dispatch.dispatchId,
              ...receipt,
            }),
          );
        const result = ledger.accept(dispatch);
        send(result.receipt);
        // These are the only executable actions: a receipt and a marked no-effect simulator.
        if (!result.duplicate) send(ledger.complete(dispatch));
      } catch {
        socket.close(
          1008,
          "Ungültiger Auftrag oder Journalfehler. Keine Wiederholung.",
        );
      }
    });
    socket.on("error", () => {});
    socket.on("close", (code) => {
      clearTimeout(welcomeTimeout);
      clearInterval(heartbeat);
      if (code === 1008) {
        stopped = true;
        onState("Verbindung abgewiesen; Konfiguration/Widerruf prüfen.");
      }
      if (!stopped) {
        onState("Nicht verbunden · alte Aufträge werden nicht nachgeholt");
        retry = setTimeout(
          connect,
          Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)) +
            Math.random() * 500,
        );
      }
    });
  };
  connect();
  return {
    stop() {
      if (disposed) return;
      disposed = true;
      stopped = true;
      clearTimeout(retry);
      ws?.close(1000, "Agent beendet");
      ledger.close();
    },
  };
}
