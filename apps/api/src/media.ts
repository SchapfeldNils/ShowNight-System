import { randomUUID, createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileTypeFromFile } from "file-type";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Config } from "./config.js";
import { transaction, type DB } from "./db.js";
import { eventAccess, showAccess, mediaAccess } from "./permissions.js";
import { HttpError } from "./errors.js";
import { id } from "../../../packages/contracts/src/index.js";
export const allowedMimes = new Set([
  "image/png",
  "image/jpeg",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
]);
export function safeName(name: string) {
  if (
    !name ||
    name.length > 200 ||
    /[\/\\\x00-\x1f]/.test(name) ||
    name.includes("..")
  )
    throw new HttpError(400, "FILE_NAME", "Ungültiger Dateiname.");
  return name;
}
export const mediaDto = (m: any) => ({
  id: m.id,
  eventId: m.event_id,
  showId: m.show_id,
  name: m.name,
  status: m.status,
  sizeBytes: Number(m.size_bytes),
  sha256: m.sha256,
  mime: m.mime,
  analysis: m.analysis,
  error: m.error,
});
export async function fileHash(path: string) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest("hex");
}
export function blobPath(cfg: Config, key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key))
    throw new Error("Ungültiger interner Dateischlüssel.");
  return join(cfg.MEDIA_ROOT, key);
}
export function mediaRoutes(app: FastifyInstance, db: DB, cfg: Config) {
  app.post("/api/v1/media/uploads", async (req) => {
    const q = z
      .union([z.strictObject({ eventId: id }), z.strictObject({ showId: id })])
      .parse(req.query);
    if ("eventId" in q) await eventAccess(db, req.actor, q.eventId, true);
    else await showAccess(db, req.actor, q.showId, true);
    await mkdir(cfg.MEDIA_ROOT, { recursive: true });
    const upload = await req.file({
      limits: { fileSize: cfg.MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 1 },
    });
    if (!upload)
      throw new HttpError(400, "FILE_REQUIRED", "Bitte eine Datei wählen.");
    const mediaId = randomUUID(),
      path = blobPath(cfg, mediaId),
      temp = path + ".upload";
    try {
      const filename = safeName(upload.filename);
      let size = 0;
      const h = createHash("sha256");
      await pipeline(
        upload.file,
        new Transform({
          transform(chunk, _encoding, callback) {
            size += chunk.length;
            h.update(chunk);
            callback(null, chunk);
          },
        }),
        createWriteStream(temp, { flags: "wx", mode: 0o600 }),
      );
      if (upload.file.truncated || size > cfg.MAX_UPLOAD_BYTES)
        throw new HttpError(
          413,
          "UPLOAD_LIMIT",
          "Die Datei überschreitet das Uploadlimit.",
        );
      const type = await fileTypeFromFile(temp);
      if (!type || !allowedMimes.has(type.mime))
        throw new HttpError(
          415,
          "FILE_TYPE",
          "Dieser tatsächliche Dateityp wird nicht unterstützt. Erlaubt: PNG, JPEG, MP4, WebM, MP3, WAV.",
        );
      await rename(temp, path);
      const m = await transaction(db, async (c) => {
        const row = (
          await c.query(
            "INSERT INTO media(id,event_id,show_id,created_by,name,blob_key,size_bytes,sha256,mime,status) VALUES($1,$2,$3,$4,$5,$9,$6,$7,$8,'processing') RETURNING *",
            [
              mediaId,
              "eventId" in q ? q.eventId : null,
              "showId" in q ? q.showId : null,
              req.actor.id,
              filename,
              size,
              h.digest("hex"),
              type.mime,
              mediaId,
            ],
          )
        ).rows[0];
        if ("showId" in q)
          await c.query(
            "INSERT INTO show_media(show_id,media_id) VALUES($1,$2)",
            [q.showId, mediaId],
          );
        return row;
      });
      return mediaDto(m);
    } catch (e) {
      await unlink(temp).catch(() => {});
      await unlink(path).catch(() => {});
      throw e;
    }
  });
  app.get("/api/v1/media", async (req) => {
    const q = z
      .union([z.strictObject({ eventId: id }), z.strictObject({ showId: id })])
      .parse(req.query);
    if ("eventId" in q) {
      await eventAccess(db, req.actor, q.eventId);
      return (
        await db.query(
          "SELECT m.* FROM media m WHERE event_id=$1 OR id IN (SELECT sm.media_id FROM show_media sm JOIN shows s ON s.id=sm.show_id WHERE s.event_id=$1) ORDER BY created_at DESC",
          [q.eventId],
        )
      ).rows.map(mediaDto);
    }
    await showAccess(db, req.actor, q.showId);
    return (
      await db.query(
        "SELECT m.* FROM media m JOIN show_media sm ON sm.media_id=m.id WHERE sm.show_id=$1 ORDER BY m.created_at DESC",
        [q.showId],
      )
    ).rows.map(mediaDto);
  });
  app.get("/api/v1/media/:id", async (req) =>
    mediaDto(
      await mediaAccess(db, req.actor, id.parse((req.params as any).id)),
    ),
  );
  app.get("/api/v1/media/:id/content", async (req, reply) => {
    const m = await mediaAccess(
      db,
      req.actor,
      id.parse((req.params as any).id),
    );
    if (m.status !== "ready")
      throw new HttpError(
        409,
        "MEDIA_NOT_READY",
        "Datei ist noch nicht geprüft oder fehlgeschlagen.",
      );
    const path = blobPath(cfg, m.blob_key);
    const info = await stat(path).catch(() => null);
    if (!info || info.size !== Number(m.size_bytes))
      throw new HttpError(
        409,
        "MEDIA_MISSING",
        "Gespeicherte Datei fehlt oder ist verändert.",
      );
    reply
      .type(m.mime)
      .header("Accept-Ranges", "bytes")
      .header("X-Content-Type-Options", "nosniff")
      .header(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(m.name)}`,
      );
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      let start = 0,
        end = info.size - 1;
      if (!match || (!match[1] && !match[2]))
        return reply
          .code(416)
          .header("Content-Range", `bytes */${info.size}`)
          .send();
      if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(Number(match[2]), info.size - 1);
      }
      if (start > end || start >= info.size)
        return reply
          .code(416)
          .header("Content-Range", `bytes */${info.size}`)
          .send();
      return reply
        .code(206)
        .header("Content-Range", `bytes ${start}-${end}/${info.size}`)
        .header("Content-Length", end - start + 1)
        .send(createReadStream(path, { start, end }));
    }
    return reply
      .header("Content-Length", info.size)
      .send(createReadStream(path));
  });
}
