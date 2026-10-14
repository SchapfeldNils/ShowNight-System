import { z } from "zod";
import { id, name } from "./index.js";
export const offlineBytes = 2 * 1024 * 1024;
export const origin = z
  .string()
  .max(300)
  .url()
  .refine((s) => {
    const u = new URL(s);
    return (
      u.origin === s &&
      !u.username &&
      !u.password &&
      (u.protocol === "https:" ||
        (u.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(u.hostname)))
    );
  });
export const localTarget = z.strictObject({
  schemaVersion: z.literal(1),
  targetId: id,
  publicKey: z.string().max(8192),
});
export const serverTrust = z.strictObject({
  schemaVersion: z.literal(1),
  serverOrigin: origin,
  publicKey: z.string().max(8192),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export const offlineRole = z.enum(["leitung", "mitglied", "technik", "live"]);
export const offlineGrant = z.strictObject({
  eventId: id,
  roles: z.array(offlineRole).min(1).max(4),
  assignedShows: z.array(id).max(1000),
});
export const offlineUser = z.strictObject({
  id,
  login: z.string().regex(/^[a-z0-9._@+-]{3,120}$/),
  displayName: name,
  admin: z.boolean(),
  enabled: z.boolean(),
  passwordHash: z
    .string()
    .regex(/^[a-f0-9]{32}:[a-f0-9]{128}$/)
    .nullable(),
  mfaSecret: z
    .string()
    .regex(/^[A-Z2-7]{32}$/)
    .nullable(),
  grants: z.array(offlineGrant).max(20),
});
export const offlineSnapshot = z
  .strictObject({
    schemaVersion: z.literal(1),
    id,
    serverOrigin: origin,
    sequence: z.int().positive().max(Number.MAX_SAFE_INTEGER),
    createdAt: z.iso.datetime(),
    packages: z
      .array(
        z.strictObject({
          id,
          eventId: id,
          manifestSha: z.string().regex(/^[a-f0-9]{64}$/),
        }),
      )
      .min(1)
      .max(20),
    users: z.array(offlineUser).min(1).max(500),
  })
  .superRefine((s, c) => {
    const unique = (v: string[]) => new Set(v).size === v.length;
    const events = new Set(s.packages.map((p) => p.eventId));
    if (
      !unique(s.packages.map((p) => p.id)) ||
      !unique(s.users.map((u) => u.id)) ||
      !unique(s.users.map((u) => u.login)) ||
      s.users.some(
        (u) =>
          !unique(u.grants.map((g) => g.eventId)) ||
          u.grants.some(
            (g) =>
              !events.has(g.eventId) ||
              !unique(g.roles) ||
              !unique(g.assignedShows),
          ),
      )
    )
      c.addIssue({
        code: "custom",
        message: "Ungültige oder doppelte Konten-/Rechtezuordnung.",
      });
    if (
      !s.users.some(
        (u) => u.admin && u.enabled && u.passwordHash && u.mfaSecret,
      )
    )
      c.addIssue({
        code: "custom",
        message:
          "Vorbereitetes aktives Administratorkonto mit MFA erforderlich.",
      });
  });
const b64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/);
export const offlineEnvelope = z.strictObject({
  schemaVersion: z.literal(1),
  targetId: id,
  serverOrigin: origin,
  sequence: z.int().positive().max(Number.MAX_SAFE_INTEGER),
  wrappedKey: b64.max(1024),
  iv: b64.length(16),
  tag: b64.length(24),
  ciphertext: b64.max(offlineBytes),
  signature: b64.length(88),
});
export type OfflineSnapshot = z.infer<typeof offlineSnapshot>;
export type OfflineUser = z.infer<typeof offlineUser>;
export type OfflineGrant = z.infer<typeof offlineGrant>;
