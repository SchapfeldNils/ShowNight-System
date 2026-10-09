import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type WebSocket from "ws";
import { z } from "zod";
import {
  agentMessage,
  pairingInput,
  diagnosticInput,
} from "../../../packages/contracts/src/agent.js";
import { hash, token } from "./security.js";
import { transaction, type DB } from "./db.js";
import { HttpError, forbidden } from "./errors.js";
declare module "fastify" {
  interface FastifyRequest {
    agentDevice: { id: string; profile: string };
  }
}
export function agentRoutes(app: FastifyInstance, db: DB) {
  const connections = new Map<string, { socket: WebSocket; epoch: string }>();
  app.decorateRequest("agentDevice");
  app.addHook("preClose", async () => {
    for (const c of connections.values())
      c.socket.close(1001, "Server beendet");
  });
  app.post("/api/v1/devices/pairings", async (req, reply) => {
    if (!req.actor.admin) forbidden();
    const input = pairingInput.parse(req.body);
    const code = randomBytes(12).toString("base64url");
    const result = await db.query(
      "INSERT INTO agent_pairings(code_hash,name,profile,created_by,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes') RETURNING expires_at",
      [hash(code), input.name, input.profile, req.actor.id],
    );
    reply.header("Cache-Control", "no-store");
    return { code, expiresAt: result.rows[0].expires_at };
  });
  app.post(
    "/api/agent/v1/pair",
    { config: { rateLimit: { max: 5, timeWindow: 60000 } } },
    async (req, reply) => {
      if (req.headers.origin || req.headers.cookie) forbidden();
      const { code, protocolVersion } = z
        .object({
          code: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
          protocolVersion: z.literal(1),
        })
        .strict()
        .parse(req.body);
      const credential = token(),
        id = randomUUID();
      const device = await transaction(db, async (c) => {
        const p = (
          await c.query(
            "UPDATE agent_pairings SET consumed_at=now() WHERE code_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING *",
            [hash(code)],
          )
        ).rows[0];
        if (!p)
          throw new HttpError(
            401,
            "PAIRING_INVALID",
            "Paarung abgelaufen oder bereits verwendet.",
          );
        await c.query(
          "INSERT INTO agent_devices(id,name,profile,token_hash,paired_by) VALUES($1,$2,$3,$4,$5)",
          [id, p.name, p.profile, hash(credential), p.created_by],
        );
        return { deviceId: id, profile: p.profile };
      });
      reply.header("Cache-Control", "no-store");
      return { ...device, credential, protocolVersion };
    },
  );
  app.get("/api/v1/devices", async (req) => {
    if (!req.actor.admin) forbidden();
    return (
      await db.query(`SELECT id,name,profile,revoked_at AS "revokedAt",last_seen AS "lastSeen",agent_version AS "agentVersion",capabilities,
      (online AND last_seen>now()-interval '15 seconds' AND revoked_at IS NULL) AS connected,
      (SELECT coalesce(jsonb_agg(r),'[]') FROM (SELECT id,action,status,evidence,observed_at AS "observedAt" FROM agent_dispatches WHERE device_id=d.id ORDER BY created_at DESC LIMIT 10) r) AS receipts
      FROM agent_devices d ORDER BY created_at`)
    ).rows;
  });
  app.post("/api/v1/devices/:id/revoke", async (req) => {
    if (!req.actor.admin) forbidden();
    const id = z.uuid().parse((req.params as { id: string }).id);
    await transaction(db, async (c) => {
      const r = await c.query(
        "UPDATE agent_devices SET revoked_at=coalesce(revoked_at,now()),online=false WHERE id=$1 RETURNING id",
        [id],
      );
      if (!r.rowCount)
        throw new HttpError(404, "DEVICE_MISSING", "Gerät nicht gefunden.");
      await c.query(
        "UPDATE agent_dispatches SET status='unknown',evidence='interrupted' WHERE device_id=$1 AND status IN ('sent','accepted')",
        [id],
      );
    });
    connections.get(id)?.socket.close(1008, "Identität widerrufen");
    return { revoked: true };
  });
  app.post(
    "/api/v1/devices/:id/diagnostics",
    { config: { rateLimit: { max: 20, timeWindow: 60000 } } },
    async (req) => {
      if (!req.actor.admin) forbidden();
      const id = z.uuid().parse((req.params as { id: string }).id),
        input = diagnosticInput.parse(req.body);
      const result = await transaction(db, async (c) => {
        const device = (
          await c.query(
            "SELECT *,last_seen>now()-interval '15 seconds' AS recent FROM agent_devices WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (!device || device.revoked_at) forbidden();
        // Lock the global dispatch id too, including two devices racing for the same id.
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          input.dispatchId,
        ]);
        const old = (
          await c.query("SELECT * FROM agent_dispatches WHERE id=$1", [
            input.dispatchId,
          ])
        ).rows[0];
        if (old) {
          if (old.device_id !== id || old.action !== input.action)
            throw new HttpError(
              409,
              "DISPATCH_CONFLICT",
              "Kennung mit anderem Inhalt verwendet.",
            );
          return {
            dispatchId: old.id,
            status: old.status,
            duplicate: true,
            epoch: old.connection_id,
          };
        }
        const conn = connections.get(id);
        if (
          !device.online ||
          !device.recent ||
          !conn ||
          conn.epoch !== device.connection_id ||
          conn.socket.readyState !== 1
        )
          throw new HttpError(
            409,
            "DEVICE_OFFLINE",
            "Gerät ist nicht verbunden. Kein Auftrag wird nachgeholt.",
          );
        await c.query(
          "INSERT INTO agent_dispatches(id,device_id,connection_id,action,created_by,status) VALUES($1,$2,$3,$4,$5,'sent')",
          [input.dispatchId, id, conn.epoch, input.action, req.actor.id],
        );
        return {
          dispatchId: input.dispatchId,
          status: "sent",
          duplicate: false,
          epoch: conn.epoch,
        };
      });
      if (!result.duplicate) {
        const conn = connections.get(id);
        if (
          !conn ||
          conn.epoch !== result.epoch ||
          conn.socket.readyState !== 1
        ) {
          await db.query(
            "UPDATE agent_dispatches SET status='unknown',evidence='interrupted' WHERE id=$1 AND status='sent'",
            [result.dispatchId],
          );
          return { ...result, status: "unknown" };
        }
        conn.socket.send(
          JSON.stringify({
            type: "dispatch",
            protocolVersion: 1,
            dispatchId: result.dispatchId,
            commandId: result.dispatchId,
            deviceId: id,
            authorityId: "online-diagnostics",
            authorityEpoch: result.epoch,
            adapter: "diagnostics",
            action: input.action,
            parameters: {},
            simulated: input.action === "simulator.noop",
          }),
        );
      }
      return result;
    },
  );
  app.get(
    "/api/agent/v1/ws",
    {
      websocket: true,
      preValidation: async (req) => {
        if (
          req.headers.origin ||
          req.headers.cookie ||
          req.url !== "/api/agent/v1/ws"
        )
          forbidden();
        const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
          req.headers.authorization ?? "",
        );
        const device =
          match &&
          (
            await db.query(
              "SELECT id,profile FROM agent_devices WHERE token_hash=$1 AND revoked_at IS NULL",
              [hash(match[1])],
            )
          ).rows[0];
        if (!device)
          throw new HttpError(401, "DEVICE_AUTH", "Geräteidentität ungültig.");
        req.agentDevice = device;
      },
    },
    (socket, req) => {
      const device = req.agentDevice,
        epoch = randomUUID();
      let active = false,
        closed = false,
        lastMessage = Date.now(),
        pending = 0;
      let chain = Promise.resolve();
      const timer = setInterval(() => {
        if (Date.now() - lastMessage > 15000)
          socket.close(1008, "Heartbeat fehlt");
      }, 1000);
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        if (connections.get(device.id)?.epoch === epoch)
          connections.delete(device.id);
        // Epoch fence prevents an old socket from affecting its replacement.
        void transaction(db, async (c) => {
          const changed = await c.query(
            "UPDATE agent_devices SET online=false WHERE id=$1 AND connection_id=$2 RETURNING id",
            [device.id, epoch],
          );
          if (changed.rowCount)
            await c.query(
              "UPDATE agent_dispatches SET status='unknown',evidence='interrupted' WHERE device_id=$1 AND connection_id=$2 AND status IN ('sent','accepted')",
              [device.id, epoch],
            );
        }).catch(() => {});
      };
      socket.on("close", cleanup);
      socket.on("error", cleanup);
      socket.on("message", (raw) => {
        if (++pending > 20) {
          socket.close(1008, "Zu viele Nachrichten");
          return;
        }
        chain = chain
          .then(async () => {
            if (closed) return;
            const msg = agentMessage.parse(JSON.parse(raw.toString()));
            if (!active) {
              if (
                msg.type !== "hello" ||
                msg.deviceId !== device.id ||
                msg.profile !== device.profile
              )
                throw new Error("HELLO");
              await transaction(db, async (c) => {
                const d = (
                  await c.query(
                    "SELECT revoked_at FROM agent_devices WHERE id=$1 FOR UPDATE",
                    [device.id],
                  )
                ).rows[0];
                if (!d || d.revoked_at || closed) throw new Error("REVOKED");
                await c.query(
                  "UPDATE agent_dispatches SET status='unknown',evidence='interrupted' WHERE device_id=$1 AND status IN ('sent','accepted')",
                  [device.id],
                );
                await c.query(
                  "UPDATE agent_devices SET connection_id=$2,online=true,last_seen=now(),agent_version=$3,capabilities=$4 WHERE id=$1",
                  [
                    device.id,
                    epoch,
                    msg.agentVersion,
                    JSON.stringify(msg.capabilities),
                  ],
                );
              });
              if (closed) return;
              const old = connections.get(device.id);
              connections.set(device.id, { socket, epoch });
              old?.socket.close(1008, "Verbindung ersetzt");
              active = true;
              socket.send(
                JSON.stringify({
                  type: "welcome",
                  protocolVersion: 1,
                  authorityId: "online-diagnostics",
                  authorityEpoch: epoch,
                  deviceId: device.id,
                  profile: device.profile,
                  heartbeatMs: 5000,
                  mode: "diagnostics-only",
                }),
              );
            } else {
              if (msg.type === "hello" || msg.authorityEpoch !== epoch)
                throw new Error("EPOCH");
              await transaction(db, async (c) => {
                const r = await c.query(
                  "UPDATE agent_devices SET last_seen=now() WHERE id=$1 AND connection_id=$2 AND revoked_at IS NULL AND online RETURNING id",
                  [device.id, epoch],
                );
                if (!r.rowCount) throw new Error("REVOKED");
                if (msg.type === "receipt") {
                  const dispatch = (
                    await c.query(
                      "SELECT action,status FROM agent_dispatches WHERE id=$1 AND device_id=$2 AND connection_id=$3 FOR UPDATE",
                      [msg.dispatchId, device.id, epoch],
                    )
                  ).rows[0];
                  if (!dispatch) throw new Error("DISPATCH");
                  const expected =
                    msg.status === "accepted"
                      ? "persisted"
                      : msg.status === "completed"
                        ? dispatch.action === "diagnostics.ping"
                          ? "agent-roundtrip"
                          : "simulator-no-effect"
                        : msg.status === "unknown"
                          ? "interrupted"
                          : "capacity";
                  if (msg.evidence !== expected) throw new Error("EVIDENCE");
                  if (["sent", "accepted"].includes(dispatch.status))
                    await c.query(
                      "UPDATE agent_dispatches SET status=$2,evidence=$3,observed_at=$4 WHERE id=$1",
                      [
                        msg.dispatchId,
                        msg.status,
                        msg.evidence,
                        msg.observedAt,
                      ],
                    );
                }
              });
            }
            lastMessage = Date.now();
          })
          .catch(() => {
            socket.close(1008, "Protokoll oder Verbindung ungültig");
          })
          .finally(() => {
            pending--;
          });
      });
    },
  );
}
