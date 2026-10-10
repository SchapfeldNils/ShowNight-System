import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import {
  id,
  manifest,
  type Manifest,
} from "../../../packages/contracts/src/index.js";
import { transaction, type DB } from "./db.js";
import { eventAccess } from "./permissions.js";
import { blobPath, fileHash } from "./media.js";
import { HttpError, missing } from "./errors.js";
import type { Config } from "./config.js";
import { Readable } from "node:stream";
import { mediaAccess } from "./permissions.js";
import { transferManifest } from "../../../packages/contracts/src/transfer.js";
import {
  packageHeader,
  packageBytes,
} from "../../../packages/transfer/src/archive.js";
export async function checkManifest(db: DB, cfg: Config, m: Manifest) {
  const errors = [...m.errors];
  for (const file of m.media) {
    const row = (
      await db.query("SELECT blob_key,status FROM media WHERE id=$1", [file.id])
    ).rows[0];
    if (!row || row.status !== "ready") {
      errors.push(`Datei ${file.name}: nicht bereit.`);
      continue;
    }
    try {
      const path = blobPath(cfg, row.blob_key);
      if (
        (await stat(path)).size !== file.sizeBytes ||
        (await fileHash(path)) !== file.sha256
      )
        errors.push(`Datei ${file.name}: Größe oder Prüfsumme falsch.`);
    } catch {
      errors.push(`Datei ${file.name}: fehlt.`);
    }
  }
  return {
    ...m,
    status: errors.length ? ("invalid" as const) : ("valid" as const),
    errors: [...new Set(errors)],
  };
}
export function packageRoutes(app: FastifyInstance, db: DB, cfg: Config) {
  app.post("/api/v1/events/:id/packages", async (req) => {
    const eventId = id.parse((req.params as any).id);
    const result = await transaction(
      db,
      async (c) => {
        const e = await eventAccess(c, req.actor, eventId, true);
        const shows = (
          await c.query(
            "SELECT * FROM shows WHERE event_id=$1 ORDER BY created_at",
            [eventId],
          )
        ).rows;
        const media = (
          await c.query(
            "SELECT * FROM media WHERE event_id=$1 OR id IN (SELECT sm.media_id FROM show_media sm JOIN shows s ON s.id=sm.show_id WHERE s.event_id=$1)",
            [eventId],
          )
        ).rows;
        const errors = media
          .filter((m) => m.status !== "ready")
          .map((m) => `Datei ${m.name}: ${m.status}.`);
        const mediaIds = new Set(media.map((m) => m.id));
        for (const s of shows)
          for (const cue of s.cues)
            for (const mediaId of cue.mediaIds)
              if (!mediaIds.has(mediaId))
                errors.push(`Einsatz ${cue.name}: Medienreferenz fehlt.`);
        const m = manifest.parse({
          schemaVersion: 1,
          id: randomUUID(),
          eventId,
          createdAt: new Date().toISOString(),
          eventRevision: e.revision,
          event: {
            name: e.name,
            date: e.date,
            location: e.location,
            modules: e.modules,
          },
          shows: shows.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            revision: s.revision,
            sourceShowId: s.source_show_id,
            sourceRevision: s.source_revision,
            cues: s.cues,
          })),
          media: media.map((m) => ({
            id: m.id,
            name: m.name,
            sha256: m.sha256,
            sizeBytes: Number(m.size_bytes),
            mime: m.mime,
            downloadPath: `/api/v1/media/${m.id}/content`,
          })),
          status: errors.length ? "invalid" : "valid",
          errors,
          liveActivationSupported: false,
        });
        // Hash the immutable original files while the content snapshot remains pinned.
        for (const file of media) {
          try {
            const path = blobPath(cfg, file.blob_key);
            if (
              (await stat(path)).size !== Number(file.size_bytes) ||
              (await fileHash(path)) !== file.sha256
            )
              m.errors.push(`Datei ${file.name}: Prüfsumme oder Größe falsch.`);
          } catch {
            m.errors.push(`Datei ${file.name}: fehlt.`);
          }
        }
        m.status = m.errors.length ? "invalid" : "valid";
        await c.query(
          "INSERT INTO packages(id,event_id,manifest,created_by) VALUES($1,$2,$3,$4)",
          [m.id, eventId, JSON.stringify(m), req.actor.id],
        );
        return m;
      },
      "REPEATABLE READ",
    );
    return result;
  });
  app.get("/api/v1/packages/:id/manifest", async (req) => {
    const p = (
      await db.query("SELECT * FROM packages WHERE id=$1", [
        id.parse((req.params as any).id),
      ])
    ).rows[0];
    if (!p) missing();
    await eventAccess(db, req.actor, p.event_id);
    return checkManifest(db, cfg, manifest.parse(p.manifest));
  });
  app.post("/api/v1/activations", async () => {
    throw new HttpError(
      409,
      "ONLINE_PREPARATION_ONLY",
      "Online werden Pakete vorbereitet. Liveaktivierung folgt am lokalen Server in S3/S4.",
    );
  });
  app.get("/api/v1/packages/:id/download", async (req, reply) => {
    const p = (
      await db.query("SELECT * FROM packages WHERE id=$1", [
        id.parse((req.params as any).id),
      ])
    ).rows[0];
    if (!p) missing();
    await eventAccess(db, req.actor, p.event_id);
    const checked = await checkManifest(db, cfg, manifest.parse(p.manifest));
    if (checked.status !== "valid")
      throw new HttpError(
        409,
        "PACKAGE_INVALID",
        "Paket nicht vollständig. Bitte Manifest erneut prüfen.",
      );
    const parsed = transferManifest.safeParse(checked);
    if (!parsed.success)
      throw new HttpError(
        409,
        "PACKAGE_UNSUPPORTED",
        "Dieses Paket überschreitet die Grenzen der lokalen Vorbereitungsablage.",
      );
    const paths = new Map<string, string>();
    for (const f of parsed.data.media) {
      // Every embedded file requires the same access as its ordinary download.
      const row = await mediaAccess(db, req.actor, f.id);
      paths.set(f.id, blobPath(cfg, row.blob_key));
    }
    let header;
    try {
      header = packageHeader(parsed.data);
    } catch {
      throw new HttpError(
        413,
        "PACKAGE_LIMIT",
        "Paketmanifest überschreitet das Übertragungslimit.",
      );
    }
    return reply
      .type("application/octet-stream")
      .header("Cache-Control", "no-store")
      .header(
        "Content-Disposition",
        `attachment; filename="shownight-${parsed.data.id}.snpkg"`,
      )
      .header(
        "Content-Length",
        header.bytes.length +
          parsed.data.media.reduce((n, f) => n + f.sizeBytes, 0),
      )
      .send(Readable.from(packageBytes(parsed.data, (id) => paths.get(id)!)));
  });
}
