import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocketServer } from "ws";
import { startAgent } from "../apps/agent/src/client.js";

test(
  "Agent verbindet nach fehlendem WELCOME erneut, echte Policy-Ablehnung bleibt endgültig",
  { timeout: 25000 },
  async () => {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const identity = {
      server: "http://127.0.0.1:" + (server.address() as { port: number }).port,
      deviceId: randomUUID(),
      profile: "dj" as const,
      credential: randomBytes(32).toString("base64url"),
    };
    let connections = 0;
    server.on("connection", (socket) => {
      connections++;
      if (connections === 1) return; // Reachable server, but WELCOME never arrives.
      socket.once("message", () =>
        socket.send(
          JSON.stringify({
            type: "welcome",
            protocolVersion: 1,
            authorityId: "online-diagnostics",
            authorityEpoch: randomUUID(),
            deviceId: identity.deviceId,
            profile: identity.profile,
            heartbeatMs: 5000,
            mode: "diagnostics-only",
          }),
        ),
      );
    });
    let connected!: () => void;
    const recovered = new Promise<void>((resolve) => {
      connected = resolve;
    });
    const states: string[] = [];
    const agent = startAgent(
      identity,
      await mkdtemp(join(tmpdir(), "shownight-welcome-retry-")),
      (state) => {
        states.push(state);
        if (state.startsWith("Verbunden")) connected();
      },
    );
    try {
      await recovered;
      assert.equal(connections, 2);
      assert.ok(states.some((state) => state.startsWith("Nicht verbunden")));
      assert.ok(
        !states.some((state) => state.startsWith("Verbindung abgewiesen")),
      );
      for (const socket of server.clients)
        socket.close(1008, "Identität widerrufen");
      await delay(1800);
      assert.ok(
        states.some((state) => state.startsWith("Verbindung abgewiesen")),
      );
      assert.equal(
        connections,
        2,
        "Server-Policy darf keine automatische Neuverbindung auslösen",
      );
    } finally {
      agent.stop();
      for (const socket of server.clients) socket.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
