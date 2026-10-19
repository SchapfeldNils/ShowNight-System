// Local live protocol, package 1 (Issue #45). Simulated output only (D021):
// commands change the server-side live state; no renderer, device or audio.
import { z } from "zod";

const uuid = z.uuid();
const revision = z.int().min(0).max(2_000_000_000);
const envelope = {
  protocolVersion: z.literal(1),
  commandId: uuid,
  eventId: uuid,
};
const runEnvelope = {
  ...envelope,
  runId: uuid,
  expectedLiveRevision: revision,
};

export const liveCommand = z.discriminatedUnion("type", [
  z.strictObject({
    ...envelope,
    type: z.literal("stand.activate"),
    payload: z.strictObject({
      packageId: uuid,
      expectedStandRevision: revision,
    }),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal("stand.rollback"),
    payload: z.strictObject({ expectedStandRevision: revision }),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal("run.create"),
    payload: z.strictObject({
      showId: uuid,
      kind: z.enum(["probe", "auffuehrung"]),
    }),
  }),
  z.strictObject({
    ...runEnvelope,
    type: z.literal("run.start"),
    payload: z.strictObject({ startCueId: uuid.optional() }),
  }),
  z.strictObject({
    ...runEnvelope,
    type: z.literal("cue.prepare"),
    payload: z.strictObject({ cueId: uuid }),
  }),
  z.strictObject({
    ...runEnvelope,
    type: z.literal("cue.go"),
    payload: z.strictObject({ expectedNextCueId: uuid }),
  }),
  z.strictObject({
    ...runEnvelope,
    type: z.literal("run.end"),
    payload: z.strictObject({}),
  }),
]);
export type LiveCommand = z.infer<typeof liveCommand>;
export type LiveCommandType = LiveCommand["type"];

/** Commands that need the operating right (D021 point 1). */
export const operateCommands: LiveCommandType[] = [
  "run.create",
  "run.start",
  "cue.prepare",
  "cue.go",
  "run.end",
];
/** Commands that need the activation right (D021 point 2). */
export const activationCommands: LiveCommandType[] = [
  "stand.activate",
  "stand.rollback",
];
export const operateRoles = ["live", "technik"];
export const activationRoles = ["technik"];

export function liveRights(admin: boolean, roles: readonly string[]) {
  return {
    view: true,
    operate: admin || roles.some((r) => operateRoles.includes(r)),
    activate: admin || roles.some((r) => activationRoles.includes(r)),
  };
}

export type LiveCue = {
  id: string;
  name: string;
  triggerHint: string;
  enabled: boolean;
  sceneId: string | null;
  sceneName: string | null;
};
export type LiveOutput = {
  cueId: string;
  name: string;
  sceneId: string | null;
  sceneName: string | null;
  packageId: string;
  eventRevision: number;
  takenAt: string;
  takenBy: string;
};
export type BlockReason =
  | "next_changed"
  | "next_removed"
  | "next_moved"
  | "cues_inserted"
  | "position_removed";
export type LiveRun = {
  id: string;
  showId: string;
  showName: string;
  kind: "probe" | "auffuehrung";
  status: "prepared" | "running" | "ended";
  liveRevision: number;
  packageId: string;
  eventRevision: number;
  cues: LiveCue[];
  nextCueId: string | null;
  /** GO stays locked until the next cue is confirmed again (D009 4/7). */
  nextBlocked: BlockReason | null;
  positionCueId: string | null;
  atEnd: boolean;
  output: LiveOutput | null;
  createdAt: string;
  lastAction: { type: string; by: string; at: string } | null;
};
export type LiveStand = {
  revision: number;
  packageId: string | null;
  eventRevision: number | null;
  activatedAt: string | null;
  activatedBy: string | null;
  previousPackageId: string | null;
  previousEventRevision: number | null;
};
export type LiveEvent = {
  sequence: number;
  type: string;
  runId: string | null;
  liveRevision: number | null;
  actorId: string;
  actorName: string;
  at: string;
  summary: string;
};
export type LiveSnapshot = {
  protocolVersion: 1;
  authorityId: "local-server";
  authorityEpoch: string;
  sequence: number;
  eventId: string;
  simulated: true;
  stand: LiveStand;
  runs: LiveRun[];
  rights: { view: boolean; operate: boolean; activate: boolean };
};
export type LiveCommandResult = {
  commandId: string;
  accepted: boolean;
  /** true when a retransmitted commandId returned the stored result. */
  replayed: boolean;
  status: number;
  code: string;
  message: string;
  runId: string | null;
  liveRevision: number | null;
  sequence: number;
};
