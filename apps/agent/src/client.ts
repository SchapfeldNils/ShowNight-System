import WebSocket from "ws";
import { join } from "node:path";
import {
  agentDispatch,
  agentWelcome,
  type AgentIdentity,
  type Capability,
} from "../../../packages/contracts/src/agent.js";
import { Ledger } from "./ledger.js";
import { baseCapabilities } from "./diagnostics.js";
export const capabilities = baseCapabilities;
export function startAgent(
  identity: AgentIdentity,
  dir: string,
  onState: (state: string) => void = () => {},
  probe: () => Promise<Capability[]> = async () => baseCapabilities,
) {
  const ledger = new Ledger(join(dir, "receipts.sqlite"));
  let stopped = false,
    disposed = false,
    ws: WebSocket | undefined,
    retry: ReturnType<typeof setTimeout> | undefined,
    attempt = 0;
  const currentCapabilities = async () => {
    try {
      return await probe();
    } catch {
      return baseCapabilities;
    }
  };
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
    socket.on("open", async () => {
      if (stopped || ws !== socket || socket.readyState !== 1) return;
      const current = await currentCapabilities();
      if (stopped || ws !== socket || socket.readyState !== 1) return;
      socket.send(
        JSON.stringify({
          type: "hello",
          protocolVersion: 1,
          deviceId: identity.deviceId,
          profile: identity.profile,
          agentVersion: "0.2.1",
          capabilities: current,
        }),
      );
    });
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
          let probing = false;
          heartbeat = setInterval(async () => {
            if (probing || stopped || socket.readyState !== 1) return;
            probing = true;
            try {
              const current = await currentCapabilities();
              if (stopped || ws !== socket || socket.readyState !== 1) return;
              socket.send(
                JSON.stringify({
                  type: "heartbeat",
                  protocolVersion: 1,
                  authorityEpoch: epoch,
                  capabilities: current,
                }),
              );
            } finally {
              probing = false;
            }
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
