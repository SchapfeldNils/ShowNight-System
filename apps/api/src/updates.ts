import { createHash, randomBytes, sign } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Config } from "./config.js";
import { HttpError, forbidden } from "./errors.js";
import { signer } from "../../../packages/transfer/src/offline.js";
import {
  compareVersions,
  maxUpdateBytes,
  signedUpdateManifest,
  softwareVersion,
  updateFileName,
  updateManifest,
  updatePlatform,
  updateSigningPayload,
  type SignedUpdateManifest,
} from "../../../packages/contracts/src/updates.js";

// Issue #33 / D020: Softwareupdates für den Streaming-Rechner. Upload nur durch
// Admin mit MFA; Abruf öffentlich, damit der lokale Server ohne Onlinesitzung prüfen kann.

const root = (cfg: Config) =>
  join(cfg.MEDIA_ROOT, "software-updates", updatePlatform);
const versionDir = (cfg: Config, version: string) =>
  join(root(cfg), softwareVersion.parse(version));

async function readRelease(
  cfg: Config,
  version: string,
): Promise<SignedUpdateManifest | null> {
  try {
    const raw = await readFile(
      join(versionDir(cfg, version), "manifest.json"),
      "utf8",
    );
    const release = signedUpdateManifest.parse(JSON.parse(raw));
    return release.manifest.version === version ? release : null;
  } catch {
    return null;
  }
}

export async function listReleases(cfg: Config) {
  let names: string[] = [];
  try {
    names = await readdir(root(cfg));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const releases: SignedUpdateManifest[] = [];
  for (const name of names)
    if (softwareVersion.safeParse(name).success) {
      const release = await readRelease(cfg, name);
      if (release) releases.push(release);
    }
  return releases.sort((a, b) =>
    compareVersions(b.manifest.version, a.manifest.version),
  );
}

function admin(req: { actor: { admin: boolean; mfaVerified: boolean } }) {
  if (!req.actor.admin) forbidden();
  if (!req.actor.mfaVerified)
    throw new HttpError(
      401,
      "MFA_REQUIRED",
      "Zusätzliche Bestätigung erforderlich.",
    );
}

export function updateRoutes(app: FastifyInstance, cfg: Config) {
  app.get("/updates/v1/windows-x64/latest.json", async (_req, reply) => {
    const [latest] = await listReleases(cfg);
    reply.header("Cache-Control", "no-store");
    if (!latest)
      return reply.code(404).send({
        error: { code: "NO_UPDATE", message: "Kein Update veröffentlicht." },
      });
    return latest;
  });

  app.get(
    "/updates/v1/windows-x64/:version/" + updateFileName,
    async (req, reply) => {
      const version = softwareVersion.safeParse((req.params as any).version);
      const release = version.success
        ? await readRelease(cfg, version.data)
        : null;
      if (!release)
        return reply
          .code(404)
          .send({ error: { code: "NOT_FOUND", message: "Nicht gefunden." } });
      const path = join(
        versionDir(cfg, release.manifest.version),
        updateFileName,
      );
      return reply
        .header("Cache-Control", "no-store")
        .header("Content-Length", String(release.manifest.size))
        .type("application/vnd.microsoft.portable-executable")
        .send(createReadStream(path));
    },
  );

  app.get("/api/v1/software-updates", async (req) => {
    admin(req);
    return (await listReleases(cfg)).map((r) => r.manifest);
  });

  app.post("/api/v1/software-updates", async (req) => {
    admin(req);
    const { version } = z
      .strictObject({ version: softwareVersion })
      .parse(req.query);
    const limit = Math.min(cfg.MAX_UPLOAD_BYTES, maxUpdateBytes);
    await mkdir(root(cfg), { recursive: true });
    if (await readRelease(cfg, version))
      throw new HttpError(
        409,
        "VERSION_EXISTS",
        "Diese Version ist bereits veröffentlicht.",
      );
    const upload = await req.file({
      limits: { fileSize: limit, files: 1, fields: 0, parts: 1 },
    });
    if (!upload)
      throw new HttpError(
        400,
        "FILE_REQUIRED",
        "Bitte die Setup-Datei wählen.",
      );
    const staging = join(
      root(cfg),
      "." + version + "-" + randomBytes(6).toString("hex"),
    );
    await mkdir(staging, { mode: 0o700 });
    try {
      const file = join(staging, updateFileName);
      let size = 0;
      const hash = createHash("sha256");
      await pipeline(
        upload.file,
        new Transform({
          transform(chunk, _encoding, callback) {
            size += chunk.length;
            hash.update(chunk);
            callback(null, chunk);
          },
        }),
        createWriteStream(file, { flags: "wx", mode: 0o600 }),
      );
      if (upload.file.truncated || size > limit)
        throw new HttpError(
          413,
          "UPLOAD_LIMIT",
          "Die Datei überschreitet das Uploadlimit.",
        );
      // Windows-Programm (PE) erkennen; der Inhalt wird nicht ausgeführt.
      const head = Buffer.alloc(2);
      const handle = await open(file, "r");
      try {
        await handle.read(head, 0, 2, 0);
      } finally {
        await handle.close();
      }
      if (size < 1024 || head.toString("latin1") !== "MZ")
        throw new HttpError(
          415,
          "FILE_TYPE",
          "Keine Windows-Setup-Datei (.exe) erkannt.",
        );
      const manifest = updateManifest.parse({
        schemaVersion: 1,
        platform: updatePlatform,
        version,
        file: updateFileName,
        size,
        sha256: hash.digest("hex"),
        publishedAt: new Date().toISOString(),
      });
      const release = signedUpdateManifest.parse({
        manifest,
        signature: sign(
          null,
          updateSigningPayload(manifest),
          signer(cfg.MFA_ENCRYPTION_KEY),
        ).toString("base64"),
      });
      await writeFile(join(staging, "manifest.json"), JSON.stringify(release), {
        flag: "wx",
        mode: 0o600,
      });
      // Atomar veröffentlichen; eine parallel veröffentlichte gleiche Version gewinnt nicht doppelt.
      await rename(staging, versionDir(cfg, version)).catch((error) => {
        if (["EEXIST", "ENOTEMPTY", "EPERM"].includes(error.code))
          throw new HttpError(
            409,
            "VERSION_EXISTS",
            "Diese Version ist bereits veröffentlicht.",
          );
        throw error;
      });
      return manifest;
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  });

  app.delete("/api/v1/software-updates/:version", async (req) => {
    admin(req);
    const version = softwareVersion.parse((req.params as any).version);
    const dir = versionDir(cfg, version);
    try {
      if (!(await stat(dir)).isDirectory()) throw new Error();
    } catch {
      throw new HttpError(
        404,
        "NOT_FOUND",
        "Nicht gefunden oder kein Zugriff.",
      );
    }
    // Erst unsichtbar machen, dann entfernen.
    const withdrawn = join(
      root(cfg),
      ".withdrawn-" + version + "-" + randomBytes(6).toString("hex"),
    );
    await rename(dir, withdrawn);
    await rm(withdrawn, { recursive: true, force: true });
    return (await listReleases(cfg)).map((r) => r.manifest);
  });
}
