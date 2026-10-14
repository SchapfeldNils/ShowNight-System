import { z } from "zod";

const state = z.enum(["available", "error", "unsupported"]);
const name = z.string().min(1).max(160);
const audioGroup = z.strictObject({
  status: state,
  items: z.array(z.strictObject({ name })).max(64),
  truncated: z.boolean(),
});

// Enumeration describes OS endpoints, never readiness, permissions or live output.
export const windowsIoReport = z.strictObject({
  checkedAt: z.iso.datetime(),
  platform: z.enum(["win32", "unsupported"]),
  displays: z.strictObject({
    status: state,
    items: z
      .array(
        z.strictObject({
          name,
          width: z.number().int().positive().max(65536).nullable(),
          height: z.number().int().positive().max(65536).nullable(),
          connector: z.string().min(1).max(50).nullable(),
        }),
      )
      .max(64),
    truncated: z.boolean(),
  }),
  audioInputs: audioGroup,
  audioOutputs: audioGroup,
  cameras: z.strictObject({
    status: z.literal("unsupported"),
    items: z.tuple([]),
    truncated: z.literal(false),
  }),
  deviceActivationPerformed: z.literal(false),
});
export type WindowsIoReport = z.infer<typeof windowsIoReport>;
