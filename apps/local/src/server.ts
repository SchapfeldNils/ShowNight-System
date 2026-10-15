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
import { sceneMediaIds } from "../../../packages/contracts/src/scene.js";
import {
  rendererSceneAction,
  rendererSceneLimits,
} from "../../../packages/contracts/src/renderer-scene.js";
import type { RendererSceneSource } from "./renderer-scene.js";
import { HttpError } from "../../api/src/errors.js";
import type { LocalAccounts } from "./accounts.js";
import type { Actor } from "../../api/src/auth.js";
import type { PackageStore } from "./store.js";
import {
  rendererAction,
  rendererPackageAction,
  rendererMediaDescriptor,
} from "../../../packages/contracts/src/renderer.js";
import {
  disabledRenderer,
  RendererFault,
  type RendererControl,
} from "./renderer.js";
import type { WindowsIoReport } from "../../../packages/contracts/src/local-status.js";
import { unavailableWindowsIo } from "./windows-io.js";
import { LiveEngine, type LiveRights } from "./live.js";
import { liveRights } from "../../../packages/contracts/src/live.js";
export async function localServer(
  accounts: LocalAccounts,
  packages: PackageStore,
  origin: string,
  webRoot?: string,
  tls?: ServerOptions,
  canonicalHost = false,
  renderer: RendererControl = disabledRenderer,
  ioProvider: () => Promise<WindowsIoReport> = async () =>
    unavailableWindowsIo(),
) {
  const startedAt = new Date().toISOString();
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
        imgSrc: ["'self'", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await app.register(rateLimit, { max: 200, timeWindow: 60000 });
  app.decorateRequest("actor");
  app.addHook("onRequest", async (req, reply) => {
    if (canonicalHost && req.headers.host !== new URL(origin).host)
      throw new HttpError(
        421,
        "HOST",
        "Bitte die eingerichtete Serveradresse verwenden.",
      );
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
  const rendererAdmin = (req: {
    actor: Actor;
    cookies: { sn_local_session?: string };
  }) => {
    const current = accounts.actor(req.cookies.sn_local_session);
    if (!current || current.id !== req.actor.id)
      throw new HttpError(401, "SESSION", "Bitte lokal anmelden.");
    if (!current.admin)
      throw new HttpError(
        403,
        "FORBIDDEN",
        "Systemadministration für die lokale Systemdiagnose erforderlich.",
      );
  };
  const rendererError = (e: unknown): never => {
    if (e instanceof RendererFault)
      throw new HttpError(
        e.status,
        "RENDERER",
        e.status === 409
          ? "Diagnosekonflikt: aktuellen Zustand prüfen und bewusst neu auslösen."
          : "Rendererdiagnose nicht bestätigt; Paket, Prozess und Status prüfen.",
      );
    throw e;
  };
  app.get("/api/local/server-status", async (req) => {
    rendererAdmin(req);
    const [io, report] = await Promise.all([
      ioProvider().catch(() => unavailableWindowsIo()),
      renderer.status().catch(() => ({
        availability: "unavailable" as const,
        mode: "software-diagnostics" as const,
        physicalOutputEnabled: false as const,
        audioOutputEnabled: false as const,
        state: null,
      })),
    ]);
    // Device enumeration yields; imported snapshots or local blocks may revoke
    // this session while the operating system is answering.
    rendererAdmin(req);
    return {
      checkedAt: new Date().toISOString(),
      service: {
        origin,
        startedAt,
        tls: !!tls,
        liveEnabled: false,
        mailEnabled: false,
      },
      preparation: {
        packages: packages.list().length,
        accountSnapshotPrepared: !!accounts.meta("snapshot_id"),
      },
      renderer: report,
      io,
    };
  });
  app.get("/api/local/renderer", async (req) => {
    rendererAdmin(req);
    try {
      const report = await renderer.status();
      rendererAdmin(req);
      return report;
    } catch (e) {
      return rendererError(e);
    }
  });
  app.post("/api/local/renderer/test", async (req) => {
    rendererAdmin(req);
    const action = rendererAction.parse(req.body);
    try {
      const state = await renderer.command(action, () => rendererAdmin(req));
      rendererAdmin(req);
      return state;
    } catch (e) {
      return rendererError(e);
    }
  });
  app.post("/api/local/renderer/package-media", async (req) => {
    rendererAdmin(req);
    const action = rendererPackageAction.parse(req.body);
    const manifest = available(req.actor, action.packageId);
    if (!manifest.media.some((m) => m.id === action.mediaId))
      throw new HttpError(404, "MEDIA", "Medium nicht im vorbereiteten Paket.");
    const file = packages.file(action.packageId, action.mediaId);
    const checked = rendererMediaDescriptor.safeParse({
      inputId: action.commandId,
      packageId: action.packageId,
      mediaId: action.mediaId,
      manifestSha256: packageHeader(manifest).hash,
      sha256: file.media.sha256,
      mime: file.media.mime,
      sizeBytes: file.media.sizeBytes,
    });
    if (
      !checked.success ||
      !["image/png", "video/webm"].includes(checked.data.mime)
    )
      throw new HttpError(
        422,
        "FORMAT",
        "Paketdiagnose unterstützt PNG und VP8-WebM bis 32 MiB.",
      );
    const { inputId: _, ...media } = checked.data;
    const guard = () => {
      rendererAdmin(req);
      const current = accounts.actor(req.cookies.sn_local_session)!;
      if (
        packageHeader(available(current, action.packageId)).hash !==
        media.manifestSha256
      )
        throw new HttpError(
          409,
          "PACKAGE_CHANGED",
          "Paketzuordnung inzwischen verändert.",
        );
    };
    try {
      const state = await renderer.prepareMedia(
        action,
        { root: packages.root, path: file.path, media },
        guard,
      );
      guard();
      return state;
    } catch (e) {
      return rendererError(e);
    }
  });
  app.post("/api/local/renderer/package-scene", async (req) => {
    rendererAdmin(req);
    const action = rendererSceneAction.parse(req.body);
    const manifest = available(req.actor, action.packageId);
    const scene =
      manifest.schemaVersion === 2
        ? manifest.scenes?.find((item) => item.id === action.sceneId)
        : undefined;
    if (!scene)
      throw new HttpError(404, "SCENE", "Szene nicht im vorbereiteten Paket.");
    const manifestSha256 = packageHeader(manifest).hash;
    const imageIds = [...new Set(sceneMediaIds(scene.definition))];
    const images: RendererSceneSource["images"] = imageIds.map((mediaId) => {
      if (!manifest.media.some((media) => media.id === mediaId))
        throw new HttpError(
          404,
          "MEDIA",
          "Szenenmedium nicht im vorbereiteten Paket.",
        );
      const file = packages.file(action.packageId, mediaId);
      const parsed = rendererMediaDescriptor.safeParse({
        inputId: action.commandId,
        packageId: action.packageId,
        mediaId,
        manifestSha256,
        sha256: file.media.sha256,
        mime: file.media.mime,
        sizeBytes: file.media.sizeBytes,
      });
      if (
        !parsed.success ||
        !["image/png", "image/jpeg"].includes(parsed.data.mime)
      )
        throw new HttpError(
          422,
          "FORMAT",
          "Szenendiagnose unterstützt PNG/JPEG bis 32 MiB je Bild.",
        );
      const { inputId: _, ...media } = parsed.data;
      return { root: packages.root, path: file.path, media };
    });
    if (
      images.length > rendererSceneLimits.images ||
      images.reduce((total, image) => total + image.media.sizeBytes, 0) >
        rendererSceneLimits.totalBytes
    )
      throw new HttpError(
        422,
        "LIMIT",
        "Szenendiagnose überschreitet das Bild- oder Gesamtlimit.",
      );
    const guard = () => {
      rendererAdmin(req);
      const current = accounts.actor(req.cookies.sn_local_session)!;
      if (
        packageHeader(available(current, action.packageId)).hash !==
        manifestSha256
      )
        throw new HttpError(
          409,
          "PACKAGE_CHANGED",
          "Paketzuordnung inzwischen verändert.",
        );
    };
    try {
      const state = await renderer.prepareScene(
        action,
        { packageId: action.packageId, manifestSha256, scene, images },
        guard,
      );
      guard();
      return state;
    } catch (error) {
      return rendererError(error);
    }
  });
  app.get<{ Params: { channel: string } }>(
    "/api/local/renderer/frames/:channel",
    async (req, reply) => {
      rendererAdmin(req);
      if (req.params.channel !== "preview" && req.params.channel !== "program")
        throw new HttpError(404, "CHANNEL", "Diagnosebild nicht verfügbar.");
      try {
        const bytes = await renderer.frame(req.params.channel, () =>
          rendererAdmin(req),
        );
        rendererAdmin(req);
        return reply.type("image/png").send(bytes);
      } catch (e) {
        return rendererError(e);
      }
    },
  );
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
  // Showablauf Paket 1 (Issue #45, D021): simulated server-side live state.
  // Opened on first use, so servers without live use create no live database.
  let liveEngine: LiveEngine | null = null;
  const live = () =>
    (liveEngine ??= new LiveEngine(packages.root, {
    manifest(pid) {
      const binding = accounts.packageBindings().find((p) => p.id === pid);
      if (!binding) throw new Error("Paket nicht vorbereitet.");
      const m = packages.metadata(pid).manifest;
      const headerHash = packageHeader(m).hash;
      if (m.eventId !== binding.eventId || headerHash !== binding.manifestSha)
        throw new Error("Paketinhalt verändert.");
      return { manifest: m, headerHash };
    },
    verify: (pid) => packages.verify(pid),
    eventOf: (pid) =>
      accounts.packageBindings().find((p) => p.id === pid)?.eventId,
  }));
  app.addHook("onClose", async () => liveEngine?.close());
  const rightsFor = (a: Actor, eventId: string): LiveRights => {
    accounts.eventAllowed(a, eventId);
    const g = accounts.grants(a).find((g) => g.eventId === eventId);
    return liveRights(a.admin, g?.roles ?? []);
  };
  app.get<{ Params: { eventId: string } }>(
    "/api/local/live/:eventId",
    async (req) => {
      const eventId = id.parse(req.params.eventId);
      const rights = rightsFor(req.actor, eventId);
      return {
        ...live().snapshot(eventId, rights),
        history: live().history(eventId, 30),
      };
    },
  );
  app.get<{
    Params: { eventId: string };
    Querystring: { epoch?: string; after?: string };
  }>("/api/local/live/:eventId/events", async (req) => {
    const eventId = id.parse(req.params.eventId);
    rightsFor(req.actor, eventId);
    const after = z.coerce.number().int().min(0).parse(req.query.after ?? "0");
    return live().events(eventId, req.query.epoch, after);
  });
  app.post("/api/local/live/commands", async (req, reply) => {
    const { eventId } = z.object({ eventId: id }).parse(req.body);
    const rights = rightsFor(req.actor, eventId);
    const result = await live().execute(
      { id: req.actor.id, displayName: req.actor.displayName },
      rights,
      req.body,
      () => {
        // Re-read session, block and roles after slow package verification.
        const current = accounts.actor(req.cookies.sn_local_session);
        if (!current || current.id !== req.actor.id)
          return { view: false, operate: false, activate: false };
        try {
          return rightsFor(current, eventId);
        } catch {
          return { view: false, operate: false, activate: false };
        }
      },
    );
    return reply.code(result.status).send(result);
  });
  app.post("/api/local/live/activate", async () => {
    throw new HttpError(
      409,
      "NOT_IMPLEMENTED",
      "Liveaktivierung erfolgt über den Showablauf (stand.activate); Geräteausgabe ist noch nicht implementiert.",
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
