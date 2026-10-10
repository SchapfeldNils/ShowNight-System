import { z } from "zod";
import { manifest } from "./index.js";

// A content-only S1 snapshot; identities, sessions and live activation are absent.
export const packageLimits = {
  headerBytes: 8 * 1024 * 1024,
  fileBytes: 2 * 1024 ** 3,
  totalBytes: 64 * 1024 ** 3,
  files: 2000,
} as const;
export const transferManifest = manifest
  .extend({
    event: manifest.shape.event.strict(),
    shows: z
      .array(
        manifest.shape.shows.element.strict().extend({
          cues: manifest.shape.shows.element.shape.cues.max(500),
        }),
      )
      .max(1000),
    media: z
      .array(
        manifest.shape.media.element.strict().extend({
          sizeBytes: z.int().positive().max(packageLimits.fileBytes),
          mime: z.enum([
            "image/png",
            "image/jpeg",
            "video/mp4",
            "video/webm",
            "audio/mpeg",
            "audio/wav",
            "audio/x-wav",
          ]),
          downloadPath: z
            .string()
            .regex(/^\/api\/v1\/media\/[0-9a-f-]{36}\/content$/),
        }),
      )
      .max(packageLimits.files),
    status: z.literal("valid"),
    errors: z.array(z.string()).length(0),
  })
  .superRefine((m, ctx) => {
    const media = new Set(m.media.map((f) => f.id));
    const unique = (ids: string[]) => new Set(ids).size === ids.length;
    if (
      !unique(m.shows.map((s) => s.id)) ||
      !unique(m.media.map((f) => f.id)) ||
      m.shows.some((s) => !unique(s.cues.map((c) => c.id)))
    )
      ctx.addIssue({
        code: "custom",
        message: "Doppelte Inhaltskennungen im Paket.",
      });
    if (m.media.some((f) => f.downloadPath !== `/api/v1/media/${f.id}/content`))
      ctx.addIssue({ code: "custom", message: "Ungültige Dateizuordnung." });
    if (m.media.reduce((n, f) => n + f.sizeBytes, 0) > packageLimits.totalBytes)
      ctx.addIssue({
        code: "custom",
        message: "Paket überschreitet das Gesamtlimit.",
      });
    if (
      m.shows.some((s) =>
        s.cues.some((c) => c.mediaIds.some((id) => !media.has(id))),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Medienreferenz fehlt im Paket.",
      });
  });
export type TransferManifest = z.infer<typeof transferManifest>;
