import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { z } from "zod";
import { open, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { ServerOptions } from "node:https";
import {
  id,
  loginInput,
  mfaInput,
  inviteInput,
} from "../../../packages/contracts/src/index.js";
import { packageHeader } from "../../../packages/transfer/src/archive.js";
import { HttpError } from "../../api/src/errors.js";
import type { LocalAccounts } from "./accounts.js";
import type { Actor } from "../../api/src/auth.js";
import type { PackageStore } from "./store.js";
export async function localServer(
  accounts: LocalAccounts,
  packages: PackageStore,
  origin: string,
  webRoot?: string,
  tls?: ServerOptions,
) {
  const app = Fastify({
    bodyLimit: 16384,
    logger: false,
    ...(tls ? { https: tls } : {}),
  });
  await app.register(cookie);
  await app.register(helmet, {
    hsts: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await app.register(rateLimit, { max: 200, timeWindow: 60000 });
  app.decorateRequest("actor");
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== origin
    )
      throw new HttpError(403, "ORIGIN", "Anfrageursprung nicht zulässig.");
    const publicRoute = [
      "/api/local/auth/login",
      "/api/local/auth/mfa/verify",
      "/api/local/auth/invitation",
    ].includes(req.url.split("?")[0]);
    if (publicRoute) return;
    const a = accounts.actor(req.cookies.sn_local_session);
    if (!a) throw new HttpError(401, "SESSION", "Bitte lokal anmelden.");
    req.actor = a;
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["x-csrf-token"] !== a.csrfToken
    )
      throw new HttpError(403, "CSRF", "Anfragebestätigung fehlt.");
  });
  app.setErrorHandler((e, _req, reply) => {
    const err = e as { statusCode?: number; code?: string };
    const status =
      e instanceof HttpError
        ? e.status
        : e instanceof z.ZodError
          ? 400
          : err.code === "ERR_SQLITE_ERROR"
            ? 409
            : err.statusCode && err.statusCode < 500
              ? err.statusCode
              : 500;
    reply.code(status).send({
      error: {
        message:
          e instanceof HttpError
            ? e.message
            : status === 409
              ? "Eintrag besteht bereits oder ist widersprüchlich."
              : status === 400
                ? "Bitte Eingaben prüfen."
                : "Lokale Anfrage fehlgeschlagen.",
      },
    });
  });
  const session = (r: { session: string }, reply: any) => {
    reply.setCookie("sn_local_session", r.session, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 3600,
    });
    const { session: _, ...out } = r;
    return out;
  };
  const authLimit = { config: { rateLimit: { max: 15, timeWindow: 60000 } } };
  app.post("/api/local/auth/login", authLimit, async (req, reply) => {
    const i = loginInput.parse(req.body),
      r = await accounts.login(i.login, i.password);
    return "session" in r ? session(r, reply) : r;
  });
  app.post("/api/local/auth/mfa/verify", authLimit, async (req, reply) => {
    const i = mfaInput.parse(req.body);
    return session(accounts.verify(i.challenge, i.code), reply);
  });
  app.post("/api/local/auth/invitation", authLimit, async (req) => {
    const i = inviteInput.parse(req.body);
    return accounts.acceptInvitation(i.token, i.password);
  });
  app.post("/api/local/auth/logout", async (req, reply) => {
    accounts.logout(req.actor);
    reply.clearCookie("sn_local_session", {
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "strict",
    });
    return { loggedOut: true };
  });
  const available = (a: Actor, pid: string) => {
    const binding = accounts.packageBindings().find((p) => p.id === pid);
    if (!binding)
      throw new HttpError(404, "NOT_FOUND", "Paket nicht vorbereitet.");
    accounts.eventAllowed(a, binding.eventId);
    const m = packages.metadata(pid).manifest;
    if (
      m.eventId !== binding.eventId ||
      packageHeader(m).hash !== binding.manifestSha
    )
      throw new HttpError(409, "PACKAGE_CHANGED", "Paketinhalt verändert.");
    return m;
  };
  app.get("/api/local/me", async (req) => ({
    id: req.actor.id,
    displayName: req.actor.displayName,
    admin: req.actor.admin,
    csrfToken: req.actor.csrfToken,
    grants: accounts.grants(req.actor),
    mode: "offline-preparation",
    preparedAt: accounts.meta("prepared_at"),
    pendingSync: req.actor.admin ? accounts.pending() : null,
    liveActivationSupported: false,
    mailDeliveryEnabled: false,
  }));
  app.get("/api/local/packages", async (req) =>
    packages.list().filter((p) => {
      try {
        available(req.actor, p.id);
        return true;
      } catch {
        return false;
      }
    }),
  );
  app.get<{ Params: { id: string } }>(
    "/api/local/packages/:id",
    async (req) => {
      const m = available(req.actor, id.parse(req.params.id));
      // Grants apply to the whole prepared event. Assigned show edit rights are
      // carried separately; this service exposes no editor or live operation.
      return { ...m, liveActivationSupported: false };
    },
  );
  app.get<{ Params: { id: string; mediaId: string } }>(
    "/api/local/packages/:id/media/:mediaId",
    async (req, reply) => {
      const pid = id.parse(req.params.id),
        mid = id.parse(req.params.mediaId);
      const m = available(req.actor, pid);
      if (!m.media.some((f) => f.id === mid))
        throw new HttpError(404, "NOT_FOUND", "Medium nicht verfügbar.");
      const file = packages.file(pid, mid);
      if (!(await lstat(file.path)).isFile())
        throw new HttpError(
          409,
          "MEDIA_CHANGED",
          "Medium fehlt oder wurde verändert.",
        );
      const handle = await open(file.path, "r");
      try {
        const st = await handle.stat(),
          digest = createHash("sha256");
        if (!st.isFile() || st.size !== file.media.sizeBytes) throw new Error();
        for await (const b of handle.createReadStream({ autoClose: false }))
          digest.update(b);
        if (digest.digest("hex") !== file.media.sha256) throw new Error();
        // Hashing large files yields to other requests. Recheck a session/block
        // or freshly imported account snapshot before opening the response.
        const current = accounts.actor(req.cookies.sn_local_session);
        if (!current)
          throw new HttpError(401, "SESSION", "Sitzung inzwischen beendet.");
        available(current, pid);
        // The same opened file descriptor is used for verification and delivery.
        return reply
          .type(file.media.mime)
          .header("Content-Length", file.media.sizeBytes)
          .header("Content-Disposition", 'attachment; filename="' + mid + '"')
          .send(handle.createReadStream({ start: 0, autoClose: true }));
      } catch (e) {
        await handle.close();
        if (e instanceof HttpError) throw e;
        throw new HttpError(
          409,
          "MEDIA_CHANGED",
          "Medium fehlt oder wurde verändert.",
        );
      }
    },
  );
  app.get<{ Params: { eventId: string } }>(
    "/api/local/events/:eventId/users",
    async (req) => accounts.users(req.actor, id.parse(req.params.eventId)),
  );
  app.post<{ Params: { eventId: string } }>(
    "/api/local/events/:eventId/users",
    async (req) =>
      accounts.createUser(req.actor, id.parse(req.params.eventId), req.body),
  );
  app.post<{ Params: { eventId: string; userId: string } }>(
    "/api/local/events/:eventId/users/:userId/block",
    async (req) => {
      const b = z.strictObject({ blocked: z.boolean() }).parse(req.body);
      return accounts.block(
        req.actor,
        id.parse(req.params.userId),
        b.blocked,
        id.parse(req.params.eventId),
      );
    },
  );
  app.post<{ Params: { userId: string } }>(
    "/api/local/users/:userId/block",
    async (req) => {
      const b = z.strictObject({ blocked: z.boolean() }).parse(req.body);
      return accounts.block(req.actor, id.parse(req.params.userId), b.blocked);
    },
  );
  app.post("/api/local/live/activate", async () => {
    throw new HttpError(
      409,
      "NOT_IMPLEMENTED",
      "Liveaktivierung und Geräteausgabe noch nicht implementiert.",
    );
  });
  app.get("/health/live", async () => ({
    status: "alive",
    mode: "offline-preparation",
    liveActivationSupported: false,
  }));
  if (webRoot)
    await app.register(staticFiles, { root: webRoot, index: "index.html" });
  return app;
}
