import { z } from "zod";
import { id } from "./index.js";
export const rendererScene = z.enum(["grafik", "video"]);
const sceneState = z.strictObject({
  id,
  kind: rendererScene,
  videoFrames: z.number().int().nonnegative(),
});
export const rendererState = z.strictObject({
  protocolVersion: z.literal(1),
  epoch: id,
  revision: z.number().int().nonnegative(),
  mode: z.literal("software-diagnostics"),
  width: z.literal(640),
  height: z.literal(360),
  physicalOutputEnabled: z.literal(false),
  audioOutputEnabled: z.literal(false),
  preview: sceneState.nullable(),
  program: sceneState.nullable(),
  mediaError: z.boolean(),
  gstreamerVersion: z.string().max(40),
  skiaRevision: z.string().regex(/^[0-9a-f]{40}$/),
});
export type RendererState = z.infer<typeof rendererState>;
export const rendererAction = z.discriminatedUnion("action", [
  z.strictObject({
    commandId: id,
    expectedRevision: z.number().int().nonnegative(),
    action: z.literal("prepare"),
    scene: rendererScene,
  }),
  z.strictObject({
    commandId: id,
    expectedRevision: z.number().int().nonnegative(),
    action: z.literal("take"),
    expectedSceneId: id,
  }),
  z.strictObject({
    commandId: id,
    expectedRevision: z.number().int().nonnegative(),
    action: z.literal("clear"),
  }),
]);
export type RendererAction = z.infer<typeof rendererAction>;
export const rendererReply = z.strictObject({
  protocolVersion: z.literal(1),
  epoch: id,
  requestId: id,
  result: z.enum(["completed", "conflict", "failed"]),
  code: z.enum([
    "OK",
    "REVISION",
    "SCENE",
    "COMMAND_ID",
    "LIMIT",
    "MEDIA",
    "INVALID",
  ]),
  state: rendererState,
});
export const rendererHello = z.strictObject({
  protocolVersion: z.literal(1),
  epoch: id,
  type: z.literal("hello"),
  state: rendererState,
});
export type RendererReport = {
  availability: "disabled" | "available" | "unavailable";
  mode: "software-diagnostics";
  physicalOutputEnabled: false;
  audioOutputEnabled: false;
  state: RendererState | null;
};
