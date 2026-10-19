// Local live protocol, package 1 (Issue #45). Simulated output only (D021):
// commands change the server-side live state; no renderer, device or audio.
import { z } from "zod";
import type { TimerPreparation } from "./timer.js";

const uuid = z.uuid();
const revision = z.int().min(0).max(2_000_000_000);
const envelope = {
  protocolVersion: z.literal(1),
  commandId: uuid,
  eventId: uuid,
};
// Stage monitor (Issue #41, D024): its own revision per event, so a timer
// action never invalidates a concurrent GO of the other director.
const monitorEnvelope = {
  ...envelope,
  expectedMonitorRevision: revision,
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
  z.strictObject({
    ...monitorEnvelope,
    type: z.literal("timer.load"),
    payload: z.strictObject({
      showId: uuid,
      /** Overrides the draft duration of a countdown. */
      durationSeconds: z.int().min(1).max(86400).optional(),
      /** Countdown to a wall-clock target time of the local server. */
      targetAt: z.iso.datetime({ offset: true }).optional(),
    }),
  }),
  z.strictObject({
    ...monitorEnvelope,
    type: z.literal("timer.start"),
    payload: z.strictObject({}),
  }),
  z.strictObject({
    ...monitorEnvelope,
    type: z.literal("timer.pause"),
    payload: z.strictObject({}),
  }),
  z.strictObject({
    ...monitorEnvelope,
    type: z.literal("timer.resume"),
    payload: z.strictObject({}),
  }),
  z.strictObject({
    ...monitorEnvelope,
    type: z.literal("timer.reset"),
    payload: z.strictObject({}),
  }),
  z.strictObject({
    ...monitorEnvelope,
    type: z.literal("timer.clear"),
    payload: z.strictObject({}),
  }),
  z.strictObject({
    ...monitorEnvelope,
    type: z.literal("hint.hide"),
    payload: z.strictObject({}),
  }),
  z.strictObject({
    ...monitorEnvelope,
    type: z.literal("timer.adjust"),
    payload: z.strictObject({
      deltaSeconds: z
        .int()
        .min(-3600)
        .max(3600)
        .refine((v) => v !== 0),
    }),
  }),
  z.strictObject({
    ...monitorEnvelope,
    type: z.literal("hint.show"),
    payload: z.strictObject({
      text: z.string().trim().min(1).max(1000),
      layout: z.enum(["alongside", "replace"]),
      expirySeconds: z.int().min(1).max(3600).nullable(),
    }),
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
  "timer.load",
  "timer.start",
  "timer.pause",
  "timer.resume",
  "timer.reset",
  "timer.adjust",
  "timer.clear",
  "hint.show",
  "hint.hide",
];
export const monitorCommands: LiveCommandType[] = operateCommands.filter(
  (t) => t.startsWith("timer.") || t.startsWith("hint."),
);
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
/**
 * Server-authoritative stage timer. Display value = valueMs, shifted by the
 * time since anchorAt while running (countdown down, elapsed up). A target
 * time is a running countdown whose value is the distance to targetAt.
 */
export type MonitorTimer = {
  showId: string;
  showName: string;
  /** Revision of the timer draft in the package, null for default values. */
  draftRevision: number | null;
  mode: "countdown" | "elapsed" | "target";
  targetAt: string | null;
  initialMs: number;
  valueMs: number;
  anchorAt: string | null;
  started: boolean;
  warningSeconds: number;
  normalColor: string;
  warningColor: string;
  overrunColor: string;
  showOverrun: boolean;
};
export type MonitorHint = {
  text: string;
  layout: TimerPreparation["hintLayout"];
  shownAt: string;
  /** Independent of a timer pause (stage timer preparation rule). */
  expiresAt: string | null;
};
export type MonitorState = {
  revision: number;
  timer: MonitorTimer | null;
  hint: MonitorHint | null;
  lastAction: { type: string; by: string; at: string } | null;
};
/** What a stage monitor page reads: timer and hints only (F20, P5). */
export type MonitorView = {
  protocolVersion: 1;
  simulated: true;
  serverTime: string;
  revision: number;
  timer: MonitorTimer | null;
  hint: MonitorHint | null;
};
export type MonitorLink = {
  id: string;
  label: string;
  createdAt: string;
  createdBy: string;
  expiresAt: string | null;
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
  monitor: MonitorState;
  serverTime: string;
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
  /** Stage monitor revision after timer/hint commands, else null. */
  monitorRevision: number | null;
  sequence: number;
};
