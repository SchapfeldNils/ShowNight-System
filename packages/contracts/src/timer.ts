import { z } from "zod";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const timerPreparation = z
  .strictObject({
    mode: z.enum(["countdown", "elapsed"]),
    durationSeconds: z.int().min(0).max(86400).default(900),
    warningSeconds: z.int().min(0).max(86400).default(120),
    normalColor: color.default("#cded84"),
    warningColor: color.default("#ffcf66"),
    overrunColor: color.default("#ff727c"),
    showOverrun: z.boolean().default(true),
    hintText: z.string().max(1000).default(""),
    hintLayout: z.enum(["alongside", "replace"]).default("alongside"),
    hintExpirySeconds: z.int().min(1).max(3600).nullable().default(null),
  })
  .superRefine((value, context) => {
    if (value.mode === "countdown" && value.durationSeconds < 1)
      context.addIssue({
        code: "custom",
        path: ["durationSeconds"],
        message: "Countdown benötigt mindestens eine Sekunde.",
      });
  });
export type TimerPreparation = z.infer<typeof timerPreparation>;
export const defaultTimerPreparation = timerPreparation.parse({
  mode: "countdown",
  durationSeconds: 900,
});
