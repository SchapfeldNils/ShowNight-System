import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import websocket from "@fastify/websocket";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  mailInput,
  eventCreate,
  eventPatch,
  showCreate,
  showPatch,
  showCopy,
  loginInput,
  mfaInput,
  inviteInput,
} from "../../../packages/contracts/src/index.js";
import type { Config } from "./config.js";
import type { DB } from "./db.js";
import { authRoutes, actor } from "./auth.js";
import { contentRoutes, visibleEvents } from "./content.js";
import { mediaRoutes } from "./media.js";
import { packageRoutes } from "./packages.js";
import { agentRoutes } from "./agents.js";
import { offlineRoutes } from "./offline.js";
import {
  pairingInput,
  diagnosticInput,
} from "../../../packages/contracts/src/agent.js";
import { HttpError, forbidden } from "./errors.js";
export async function createApp(db: DB, cfg: Config, logging = false) {
  const app = Fastify({
    bodyLimit: 1024 * 1024,
    trustProxy: cfg.TRUSTED_PROXY_CIDRS
      ? cfg.TRUSTED_PROXY_CIDRS.split(",").map((s) => s.trim())
      : false,
    logger: logging
      ? {
          level: "info",
          redact: [
            "req.headers.cookie",
            "req.headers.authorization",
            "req.headers.x-csrf-token",
            "req.body",
            "res.headers.set-cookie",
          ],
        }
      : false,
    logController: new Fastify.LogController({ disableRequestLogging: true }),
  });
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "blob:", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: cfg.secure,
  });
  await app.register(rateLimit, { max: 200, timeWindow: 60000 });
  await app.register(multipart, {
    limits: { fileSize: cfg.MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 1 },
    preservePath: true,
  });
  await app.register(websocket, { options: { maxPayload: 4096 } });
  authRoutes(app, db, cfg);
  contentRoutes(app, db, cfg);
  mediaRoutes(app, db, cfg);
  packageRoutes(app, db, cfg);
  agentRoutes(app, db);
  offlineRoutes(app, db, cfg);
  app.setErrorHandler((e, req, reply) => {
    let status = 500,
      code = "INTERNAL",
      message = "Die Anfrage konnte nicht verarbeitet werden.",
      details: unknown;
    const err = e as { code?: string; statusCode?: number };
    if (e instanceof HttpError) {
      status = e.status;
      code = e.code;
      message = e.message;
      details = e.details;
    } else if (e instanceof z.ZodError) {
      status = 400;
      code = "VALIDATION";
      message = "Bitte Eingaben prüfen.";
      details = e.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
    } else if (err.code === "23505") {
      status = 409;
      code = "ALREADY_EXISTS";
      message = "Dieser Eintrag besteht bereits.";
    } else if (err.code === "23503") {
      status = 400;
      code = "REFERENCE";
      message = "Eine zugeordnete Kennung ist ungültig.";
    } else if (err.statusCode && err.statusCode < 500) {
      status = err.statusCode;
      code = status === 413 ? "UPLOAD_LIMIT" : "REQUEST";
      message =
        status === 413
          ? "Die Datei überschreitet das Uploadlimit."
          : "Ungültige oder zu häufige Anfrage.";
    }
    app.log.warn({ correlationId: req.id, code, status }, "Anfrage abgewiesen");
    reply.code(status).send({
      error: {
        code,
        message,
        correlationId: req.id,
        ...(details ? { details } : {}),
      },
    });
  });
  app.get("/health/live", async () => ({
    status: "alive",
    service: "shownight",
    mode: "online-preparation",
  }));
  app.get("/health/ready", async (_req, reply) => {
    try {
      const r = await db.query(
        "SELECT version FROM schema_migrations ORDER BY version",
      );
      if (r.rows.map((r) => r.version).join(",") !== "1,2,3") throw new Error();
      return { status: "ready", schemaVersion: 3 };
    } catch {
      return reply.code(503).send({ status: "not_ready" });
    }
  });
  app.get("/api/v1/diagnostics", async (req) => {
    if (!req.actor.admin) forbidden();
    return {
      mode: "online-preparation",
      demo: cfg.DEMO_ENABLED === "true",
      mail: {
        mode: cfg.MAIL_DELIVERY_ENABLED === "true" ? "smtp" : "test",
        realDeliveryEnabled: cfg.MAIL_DELIVERY_ENABLED === "true",
      },
      media: (
        await db.query(
          "SELECT status,count(*)::int AS count FROM media GROUP BY status",
        )
      ).rows,
      devices: [
        {
          id: "simulation-dj",
          profile: "dj",
          simulated: true,
          availability: "simulated",
          adapter: "S1-Diagnosedemo",
          capabilities: [
            { name: "Virtual DJ", availability: "unknown" },
            { name: "APC Mini MK2", availability: "unknown" },
            { name: "Vorhören / FLX4", availability: "unknown" },
          ],
        },
        {
          id: "simulation-light",
          profile: "light",
          simulated: true,
          availability: "simulated",
          adapter: "S1-Diagnosedemo",
          capabilities: [
            { name: "Daslight", availability: "unknown" },
            { name: "Stream Deck", availability: "unknown" },
          ],
        },
        {
          id: "simulation-main",
          profile: "main",
          simulated: true,
          availability: "simulated",
          adapter: "S1-Diagnosedemo",
          capabilities: [
            { name: "HDMI-Renderer", availability: "unsupported_online" },
          ],
        },
      ],
      realOutputsSupported: false,
    };
  });
  app.get("/api/v1/mail-jobs", async (req) => {
    if (!req.actor.admin) forbidden();
    return (
      await db.query(
        'SELECT id,business_key AS "businessKey",status,attempts,last_error AS "lastError",created_at AS "createdAt" FROM mail_jobs ORDER BY created_at DESC LIMIT 100',
      )
    ).rows;
  });
  app.post("/api/v1/mail-jobs", async (req) => {
    if (!req.actor.admin) forbidden();
    if (cfg.MAIL_DELIVERY_ENABLED === "true")
      throw new HttpError(
        403,
        "DEMO_MAIL_ONLY",
        "Diese S1-Demooberfläche legt ausschließlich Testaufträge an.",
      );
    const input = mailInput.parse(req.body);
    const job = (
      await db.query(
        "INSERT INTO mail_jobs(id,business_key,recipient,subject,body,status) VALUES($1,$2,$3,$4,$5,'queued') ON CONFLICT(business_key) DO NOTHING RETURNING id,status",
        [
          randomUUID(),
          input.businessKey,
          input.recipient,
          input.subject,
          input.text,
        ],
      )
    ).rows[0];
    return job ?? { duplicate: true };
  });
  app.get("/api/v1/status/ws", { websocket: true }, (socket, req) => {
    if (req.headers.origin !== cfg.origin) {
      socket.close(1008, "Ungültiger Ursprung");
      return;
    }
    let busy = false;
    const send = async () => {
      if (busy) return;
      busy = true;
      try {
        const user = await actor(db, req.cookies.sn_session);
        if (!user) {
          socket.close(1008, "Sitzung beendet");
          return;
        }
        socket.send(
          JSON.stringify({
            protocolVersion: 1,
            type: "snapshot",
            mode: "online-preparation",
            simulatedDevices: true,
            events: await visibleEvents(db, user),
          }),
        );
      } catch {
        socket.close(1011, "Status nicht verfügbar");
      } finally {
        busy = false;
      }
    };
    // S1 status snapshots are replaceable. Live command/event replay is reserved for S2/S4.
    const timer = setInterval(() => {
      void send();
    }, 3000);
    socket.on("close", () => clearInterval(timer));
    socket.on("error", () => clearInterval(timer));
    void send();
    socket.on("message", () =>
      socket.close(1008, "S1 unterstützt keine Geräte- oder Livebefehle."),
    );
  });
  app.get("/api/v1/openapi.json", async () => {
    const specs: Record<string, [string, z.ZodType]> = {
      "/auth/login": ["post", loginInput],
      "/auth/mfa/verify": ["post", mfaInput],
      "/auth/invitation": ["post", inviteInput],
      "/events": ["post", eventCreate],
      "/events/{id}": ["patch", eventPatch],
      "/shows": ["post", showCreate],
      "/shows/{id}": ["patch", showPatch],
      "/events/{id}/show-copies": ["post", showCopy],
      "/devices/pairings": ["post", pairingInput],
      "/devices/{id}/diagnostics": ["post", diagnosticInput],
    };
    const paths = Object.fromEntries(
      Object.entries(specs).map(([path, [method, schema]]) => [
        "/api/v1" + path,
        {
          [method]: {
            security: path.startsWith("/auth") ? [] : [{ cookieAuth: [] }],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: z.toJSONSchema(schema, { io: "input" }),
                },
              },
            },
            responses: {
              200: { description: "Erfolg" },
              400: { description: "Ungültige Eingabe" },
              401: { description: "Sitzung/MFA fehlt" },
              403: { description: "Rechte/CSRF fehlen" },
              409: { description: "Versionskonflikt" },
            },
          },
        },
      ]),
    );
    return {
      openapi: "3.1.0",
      info: {
        title: "ShowNight S1 Vorbereitung",
        version: "0.1.0",
        description:
          "Implementierte Kern-JSON-Schreibverträge; ergänzende Routen siehe docs/entwicklung/s1-api.md.",
      },
      servers: [{ url: cfg.PUBLIC_BASE_URL }],
      paths,
      components: {
        securitySchemes: {
          cookieAuth: { type: "apiKey", in: "cookie", name: "sn_session" },
        },
      },
    };
  });
  const webRoot = resolve("dist/web");
  if (existsSync(webRoot)) {
    await app.register(staticFiles, { root: webRoot, index: "index.html" });
  } else
    app.get("/", async (_req, reply) =>
      reply
        .type("text/plain")
        .send("ShowNight: pnpm build ausführen oder pnpm dev:web starten."),
    );
  return app;
}
