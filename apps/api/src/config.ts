import { resolve } from "node:path";
import { z } from "zod";
const env = z.object({
  DATABASE_URL: z.string().min(1),
  PUBLIC_BASE_URL: z.url().default("http://localhost:3000"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MFA_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  MEDIA_ROOT: z.string().default(".local/media"),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(2147483648)
    .default(104857600),
  FFPROBE_PATH: z.string().default("ffprobe"),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  MAIL_DELIVERY_ENABLED: z.enum(["true", "false"]).default("false"),
  MAIL_MODE: z.enum(["test", "smtp"]).default("test"),
  TRUSTED_PROXY_CIDRS: z.string().default(""),
  DEMO_ENABLED: z.enum(["true", "false"]).default("false"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_TLS_MODE: z.enum(["implicit", "starttls"]).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM_ADDRESS: z.email().optional(),
  MAIL_REPLY_TO: z.email().optional(),
});
export function config(input = process.env, requireSmtp = true) {
  const cleaned = { ...input };
  for (const key of [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_TLS_MODE",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "MAIL_FROM_ADDRESS",
    "MAIL_REPLY_TO",
  ])
    if (cleaned[key] === "") delete cleaned[key];
  const result = env.safeParse(cleaned);
  if (!result.success)
    throw new Error(
      "Ungültige Konfiguration: " +
        result.error.issues.map((i) => i.path.join(".")).join(", "),
    );
  const c = result.data;
  if (
    requireSmtp &&
    c.MAIL_DELIVERY_ENABLED === "true" &&
    (c.MAIL_MODE !== "smtp" ||
      !c.SMTP_HOST ||
      !c.SMTP_PORT ||
      !c.SMTP_TLS_MODE ||
      !c.SMTP_USER ||
      !c.SMTP_PASSWORD ||
      !c.MAIL_FROM_ADDRESS)
  )
    throw new Error(
      "Echter Mailversand benötigt vollständige SMTP-Konfiguration.",
    );
  if (c.DEMO_ENABLED === "true" && c.MAIL_DELIVERY_ENABLED === "true")
    throw new Error("Demo darf keinen echten Versand aktivieren.");
  return {
    ...c,
    MEDIA_ROOT: resolve(c.MEDIA_ROOT),
    secure: new URL(c.PUBLIC_BASE_URL).protocol === "https:",
    origin: new URL(c.PUBLIC_BASE_URL).origin,
  };
}
export type Config = ReturnType<typeof config>;
