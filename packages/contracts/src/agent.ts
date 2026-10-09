import { z } from "zod";
export const agentProfile = z.enum(["dj", "light", "main"]);
export const pairingInput = z
  .object({ name: z.string().trim().min(1).max(80), profile: agentProfile })
  .strict();
export const capability = z
  .object({
    name: z.string().min(1).max(80),
    source: z.enum(["agent", "simulator", "unconfigured"]),
    availability: z.enum([
      "available",
      "simulated",
      "unknown",
      "unavailable",
      "unsupported_online",
    ]),
    observedAt: z.iso.datetime().optional(),
  })
  .strict();
export const agentHello = z
  .object({
    type: z.literal("hello"),
    protocolVersion: z.literal(1),
    deviceId: z.uuid(),
    profile: agentProfile,
    agentVersion: z.enum(["0.2.0", "0.2.1"]),
    capabilities: z.array(capability).max(12),
  })
  .strict();
export const agentWelcome = z
  .object({
    type: z.literal("welcome"),
    protocolVersion: z.literal(1),
    authorityId: z.literal("online-diagnostics"),
    authorityEpoch: z.uuid(),
    deviceId: z.uuid(),
    profile: agentProfile,
    heartbeatMs: z.literal(5000),
    mode: z.literal("diagnostics-only"),
  })
  .strict();
export const diagnosticAction = z.enum(["diagnostics.ping", "simulator.noop"]);
export const diagnosticInput = z
  .object({ dispatchId: z.uuid(), action: diagnosticAction })
  .strict();
export const agentDispatch = z
  .object({
    type: z.literal("dispatch"),
    protocolVersion: z.literal(1),
    dispatchId: z.uuid(),
    commandId: z.uuid(),
    deviceId: z.uuid(),
    authorityId: z.literal("online-diagnostics"),
    authorityEpoch: z.uuid(),
    adapter: z.literal("diagnostics"),
    action: diagnosticAction,
    parameters: z.object({}).strict(),
    simulated: z.boolean(),
  })
  .strict()
  .refine((d) => d.simulated === (d.action === "simulator.noop"));
export const agentMessage = z.discriminatedUnion("type", [
  agentHello,
  z
    .object({
      type: z.literal("heartbeat"),
      protocolVersion: z.literal(1),
      authorityEpoch: z.uuid(),
      capabilities: z.array(capability).max(12).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("receipt"),
      protocolVersion: z.literal(1),
      authorityEpoch: z.uuid(),
      dispatchId: z.uuid(),
      status: z.enum(["accepted", "completed", "failed", "unknown"]),
      evidence: z.enum([
        "persisted",
        "agent-roundtrip",
        "simulator-no-effect",
        "interrupted",
        "capacity",
      ]),
      observedAt: z.iso.datetime(),
    })
    .strict(),
]);
export type AgentIdentity = {
  server: string;
  deviceId: string;
  profile: z.infer<typeof agentProfile>;
  credential: string;
};
export type Capability = z.infer<typeof capability>;
export type AgentDispatch = z.infer<typeof agentDispatch>;
