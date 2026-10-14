import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { agentRoutes } from "../apps/api/src/agents.js";
import type { DB } from "../apps/api/src/db.js";
import { hash } from "../apps/api/src/security.js";
import { startAgent } from "../apps/agent/src/client.js";
import { baseCapabilities } from "../apps/agent/src/diagnostics.js";
import type { Capability } from "../packages/contracts/src/agent.js";

test(
  "Server-Heartbeat-Timeout nach WELCOME bleibt vorübergehend: gültiger Agent verbindet erneut",
  { timeout: 30000 },
  async () => {
    const identity = {
      server: "",
      deviceId: randomUUID(),
      profile: "dj" as const,
      credential: randomBytes(32).toString("base64url"),
    };
    // This test exercises actual route/socket/timer/client behavior. Persistence is
    // a fixed valid device; real PostgreSQL fencing/revocation remains in S2 CI.
    const query = async (sql: string, params?: unknown[]) => {
      if (sql.startsWith("SELECT id,profile FROM agent_devices")) {
        assert.equal(params?.[0], hash(identity.credential));
        return {
          rows: [{ id: identity.deviceId, profile: identity.profile }],
          rowCount: 1,
        };
      }
      if (sql.startsWith("SELECT revoked_at"))
        return { rows: [{ revoked_at: null }], rowCount: 1 };
      return { rows: [{ id: identity.deviceId }], rowCount: 1 };
    };
    const db = {
      query,
      connect: async () => ({ query, release() {} }),
    } as unknown as DB;
    const app = Fastify();
    await app.register(websocket);
    agentRoutes(app, db);
    const closes: number[] = [];
    app.websocketServer.on("connection", (socket) =>
      socket.on("close", (code) => closes.push(code)),
    );
    await app.listen({ host: "127.0.0.1", port: 0 });
    identity.server =
      "http://127.0.0.1:" + (app.server.address() as { port: number }).port;
    let probeCalls = 0,
      welcomes = 0;
    let recovered!: () => void;
    const done = new Promise<void>((resolve) => {
      recovered = resolve;
    });
    const probe = async (): Promise<Capability[]> => {
      if (++probeCalls === 2) return new Promise(() => {}); // Stall first heartbeat only.
      return baseCapabilities;
    };
    const agent = startAgent(
      identity,
      await mkdtemp(join(tmpdir(), "shownight-heartbeat-retry-")),
      (state) => {
        if (state.startsWith("Verbunden") && ++welcomes === 2) recovered();
      },
      probe,
    );
    try {
      await done;
      assert.equal(welcomes, 2);
      assert.equal(closes[0], 1011);
      assert.ok(!closes.includes(1008));
    } finally {
      agent.stop();
      for (const socket of app.websocketServer.clients) socket.terminate();
      await app.close();
    }
  },
);
