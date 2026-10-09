import { z } from "zod";
export const id = z.uuid();
export const name = z.string().trim().min(1).max(200);
export const password = z.string().min(12).max(256);
export const moduleKeys = [
  "organisation",
  "shows",
  "spiele",
  "moderation",
  "buehne",
  "tickets",
  "sponsoring",
  "finanzen",
  "technik",
] as const;
export const modules = z.array(z.enum(moduleKeys)).max(moduleKeys.length);
export const eventCreate = z.strictObject({
  name,
  template: z.enum(["shownight", "spieleabend", "custom"]).default("shownight"),
});
export const eventPatch = z.strictObject({
  expectedRevision: z.int().positive(),
  name: name.optional(),
  date: z.iso.date().nullable().optional(),
  location: z.string().max(300).optional(),
  modules: modules.optional(),
});
export const cue = z.strictObject({
  id,
  name,
  triggerHint: z.string().max(500).default(""),
  notes: z.string().max(5000).default(""),
  enabled: z.boolean().default(true),
  mediaIds: z.array(id).max(30).default([]),
});
export const showCreate = z.strictObject({
  name,
  description: z.string().max(10000).default(""),
});
export const showPatch = z.strictObject({
  expectedRevision: z.int().positive(),
  name: name.optional(),
  description: z.string().max(10000).optional(),
  cues: z.array(cue).max(500).optional(),
});
export const showCopy = z.strictObject({
  sourceShowId: id,
  sourceRevision: z.int().positive(),
});
export const grantInput = z.strictObject({
  userId: id,
  role: z.enum(["leitung", "live", "technik", "mitglied"]),
});
export const userCreate = z.strictObject({
  login: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._@+-]{3,120}$/),
  displayName: name,
});
export const loginInput = z.strictObject({
  login: z.string().max(120),
  password: z.string().max(256),
});
export const mfaInput = z.strictObject({
  challenge: z.string().min(20).max(100),
  code: z.string().min(6).max(40),
});
export const inviteInput = z.strictObject({
  token: z.string().min(20).max(100),
  password,
});
export const mailInput = z.strictObject({
  businessKey: z.string().min(1).max(200),
  recipient: z.email(),
  subject: name,
  text: z.string().min(1).max(20000),
});
export const mediaStatus = z.enum(["processing", "ready", "failed"]);
export const manifest = z.strictObject({
  schemaVersion: z.literal(1),
  id,
  eventId: id,
  createdAt: z.iso.datetime(),
  eventRevision: z.int().positive(),
  event: z.object({
    name: z.string(),
    date: z.string().nullable(),
    location: z.string(),
    modules,
  }),
  shows: z.array(
    z.object({
      id,
      name: z.string(),
      description: z.string(),
      revision: z.int().positive(),
      sourceShowId: id.nullable(),
      sourceRevision: z.int().positive().nullable(),
      cues: z.array(cue),
    }),
  ),
  media: z.array(
    z.object({
      id,
      name: z.string(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      sizeBytes: z.number().positive(),
      mime: z.string(),
      downloadPath: z.string(),
    }),
  ),
  status: z.enum(["valid", "invalid"]),
  errors: z.array(z.string()),
  liveActivationSupported: z.literal(false),
});
export type Cue = z.infer<typeof cue>;
export type Manifest = z.infer<typeof manifest>;
export const eventRecord = z.strictObject({
  id,
  name,
  revision: z.int().positive(),
  date: z.iso.date().nullable(),
  location: z.string(),
  modules,
  role: z.string(),
  canEdit: z.boolean(),
});
export const showRecord = z.strictObject({
  id,
  eventId: id.nullable(),
  name,
  description: z.string(),
  revision: z.int().positive(),
  sourceShowId: id.nullable(),
  sourceRevision: z.int().positive().nullable(),
  cues: z.array(cue),
  canEdit: z.boolean(),
  teamIds: z.array(id),
});
export type EventRecord = z.infer<typeof eventRecord>;
export type ShowRecord = z.infer<typeof showRecord>;
export type MediaRecord = {
  id: string;
  eventId: string | null;
  showId: string | null;
  name: string;
  status: z.infer<typeof mediaStatus>;
  sizeBytes: number;
  sha256: string;
  mime: string;
  analysis: {
    duration?: number;
    streams?: {
      codec_type: string;
      codec_name?: string;
      width?: number;
      height?: number;
    }[];
    audioAnalysis: string;
  };
  error: string | null;
};
