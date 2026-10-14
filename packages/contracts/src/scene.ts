import { z } from "zod";

const label = z.string().trim().min(1).max(200);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const box = {
  id: z.uuid(),
  name: label,
  x: z.number().min(-8192).max(8192),
  y: z.number().min(-8192).max(8192),
  width: z.number().min(1).max(8192),
  height: z.number().min(1).max(8192),
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
};
export const sceneLayer = z.discriminatedUnion("kind", [
  z.strictObject({
    ...box,
    kind: z.literal("text"),
    text: z.string().max(2000),
    fontSize: z.number().min(6).max(300),
    color,
  }),
  z.strictObject({ ...box, kind: z.literal("rectangle"), color }),
  z.strictObject({
    ...box,
    kind: z.literal("image"),
    mediaId: z.uuid(),
    fit: z.enum(["contain", "cover"]),
  }),
]);
export const sceneDefinition = z
  .strictObject({
    name: label,
    logicalWidth: z.int().min(1).max(4096),
    logicalHeight: z.int().min(1).max(4096),
    background: color,
    layers: z.array(sceneLayer).max(64),
  })
  .superRefine((s, ctx) => {
    if (new Set(s.layers.map((l) => l.id)).size !== s.layers.length)
      ctx.addIssue({
        code: "custom",
        message: "Ebenenkennungen müssen eindeutig sein.",
      });
  });
export const sceneRecord = z.strictObject({
  id: z.uuid(),
  showId: z.uuid(),
  revision: z.int().positive(),
  definition: sceneDefinition,
});
export const sceneCreate = z.strictObject({ name: label });
export const sceneLeaseRequest = z.strictObject({});
export const sceneLease = z.strictObject({
  leaseToken: z.string().min(20).max(100),
});
export const scenePatch = sceneLease.extend({
  expectedRevision: z.int().positive(),
  definition: sceneDefinition,
});
export type SceneDefinition = z.infer<typeof sceneDefinition>;
export type SceneLayer = z.infer<typeof sceneLayer>;
export type SceneRecord = z.infer<typeof sceneRecord>;
export function sceneMediaIds(s: SceneDefinition) {
  return s.layers.flatMap((l) => (l.kind === "image" ? [l.mediaId] : []));
}
