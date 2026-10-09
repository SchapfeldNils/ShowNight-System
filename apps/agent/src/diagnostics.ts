import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import type { Capability } from "../../../packages/contracts/src/agent.js";
import { virtualDjClock } from "./virtualdj.js";

export const baseCapabilities: Capability[] = [
  { name: "Verbindungsdiagnose", source: "agent", availability: "available" },
  {
    name: "Test ohne Gerätewirkung",
    source: "simulator",
    availability: "simulated",
  },
  {
    name: "VirtualDJ-Leseabfrage",
    source: "unconfigured",
    availability: "unknown",
  },
  {
    name: "Musiksteuerung / Daslight / Controller",
    source: "unconfigured",
    availability: "unknown",
  },
  {
    name: "HDMI und Publikumston",
    source: "unconfigured",
    availability: "unsupported_online",
  },
];

// Only DJ profiles read this optional local secret file. Never send configuration,
// errors, plugin response text or credentials to the server.
export function localCapabilities(profile: string, configuration: string) {
  let pending: Promise<Capability[]> | undefined;
  async function probe(): Promise<Capability[]> {
    if (profile !== "dj") return baseCapabilities;
    let config: Record<string, string | undefined>;
    try {
      const text = await readFile(configuration, "utf8");
      if (Buffer.byteLength(text) > 4096) throw new Error("CONFIG_LIMIT");
      config = parseEnv(text);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return baseCapabilities;
      return report("unavailable");
    }
    if (!config.VDJ_PORT && !config.VDJ_AUTH) return baseCapabilities;
    try {
      await virtualDjClock(Number(config.VDJ_PORT), config.VDJ_AUTH ?? "");
      return report("available");
    } catch {
      return report("unavailable");
    }
  }
  function report(availability: "available" | "unavailable"): Capability[] {
    return baseCapabilities.map((c) =>
      c.name === "VirtualDJ-Leseabfrage"
        ? {
            ...c,
            source: "agent",
            availability,
            observedAt: new Date().toISOString(),
          }
        : c,
    );
  }
  return () => {
    // Reconnection cannot overlap plugin queries from the preceding socket.
    pending ??= probe().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
