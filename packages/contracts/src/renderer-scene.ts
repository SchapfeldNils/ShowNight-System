import { z } from "zod";
import { id } from "./index.js";
import { sceneRecord, sceneMediaIds } from "./scene.js";
import { rendererMediaDescriptor } from "./renderer.js";

export const rendererSceneLimits = {
  snapshotBytes: 1024 * 1024,
  imageBytes: 32 * 1024 * 1024,
  totalBytes: 64 * 1024 * 1024,
  images: 64,
  decodedPixels: 16777216,
} as const;

export const rendererSceneAction = z.strictObject({
  commandId: id,
  expectedRevision: z.int().nonnegative(),
  action: z.literal("prepare-scene"),
  packageId: id,
  sceneId: id,
});
export type RendererSceneAction = z.infer<typeof rendererSceneAction>;

export {
  rendererSceneDescriptor,
  type RendererSceneDescriptor,
} from "./renderer.js";

export const rendererSceneSnapshot = z
  .strictObject({
    schemaVersion: z.literal(1),
    scene: sceneRecord,
    images: z
      .array(
        rendererMediaDescriptor.extend({
          mime: z.enum(["image/png", "image/jpeg"]),
        }),
      )
      .max(rendererSceneLimits.images),
  })
  .superRefine((value, ctx) => {
    const referenced = new Set(sceneMediaIds(value.scene.definition));
    const provided = new Set(value.images.map((image) => image.mediaId));
    if (
      provided.size !== value.images.length ||
      referenced.size !== provided.size ||
      [...referenced].some((id) => !provided.has(id))
    )
      ctx.addIssue({
        code: "custom",
        message: "Szenenbilder müssen genau und eindeutig gebunden sein.",
      });
    if (
      new Set(value.images.map((image) => image.inputId)).size !==
      value.images.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Bildkopien müssen eindeutige Kennungen haben.",
      });
    if (
      value.images.reduce((sum, image) => sum + image.sizeBytes, 0) >
      rendererSceneLimits.totalBytes
    )
      ctx.addIssue({
        code: "custom",
        message: "Szenenbilder überschreiten das gemeinsame Größenlimit.",
      });
    if (
      new Set(value.images.map((image) => image.packageId)).size > 1 ||
      new Set(value.images.map((image) => image.manifestSha256)).size > 1
    )
      ctx.addIssue({
        code: "custom",
        message: "Szenenbilder müssen aus demselben Paketstand stammen.",
      });
  });
export type RendererSceneSnapshot = z.infer<typeof rendererSceneSnapshot>;
