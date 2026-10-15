import { createServer, connect, type Server } from "node:net";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

/**
 * Lokaler Steuerkanal für den geordneten Stopp des eigenen Servers (Issue #32).
 *
 * - TCP ausschließlich auf 127.0.0.1 mit zufälligem Port. Loopback ist von anderen
 *   Rechnern nicht erreichbar, auch bei LAN-Einrichtung und unabhängig von
 *   Windows-Pipe-Sicherheitsbeschreibungen (Review PR #51).
 * - Jeder Start erzeugt ein zufälliges 256-Bit-Token. Es steht nur im Laufzustand im
 *   privaten Datenordner (ACL: aktueller Benutzer und SYSTEM). Ohne Token wird nichts
 *   beendet; gleichzeitige Verbindungen sind begrenzt.
 * - Es wird nie ein Prozess per PID beendet. Ein fremder Prozess, auch auf Port 3443,
 *   kennt weder Port noch Token und bleibt unberührt.
 */

export const runStateName = "run-state.json";
const runState = z.strictObject({
  version: z.literal(2),
  pid: z.int().positive(),
  startedAt: z.iso.datetime(),
  port: z.int().min(1024).max(65535),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  mode: z.enum(["run", "run-renderer"]),
  origin: z.string().max(200),
});
export type RunState = z.infer<typeof runState>;

const digest = (value: string) => createHash("sha256").update(value).digest();
const loopback = "127.0.0.1";

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: Prozess existiert, gehört aber einem anderen Benutzer.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export async function readRunState(root: string): Promise<RunState | null> {
  let raw: string;
  try {
    raw = await readFile(join(root, runStateName), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (raw.length > 4096) throw new Error("Laufzustand zu groß.");
  return runState.parse(JSON.parse(raw));
}

/** Entfernt den Laufzustand nur, wenn er noch genau dem erwarteten Start gehört. */
async function unlinkIfSame(root: string, expected: RunState) {
  try {
    const current = await readRunState(root);
    if (
      current?.pid === expected.pid &&
      current.port === expected.port &&
      current.startedAt === expected.startedAt
    )
      await unlink(join(root, runStateName));
  } catch {
    /* Unlesbarer oder fremder Zustand bleibt für die Diagnose erhalten. */
  }
}

export type ServiceState =
  | { state: "running"; startedAt: string; pid: number }
  | { state: "stopped" }
  | { state: "stale" }
  | { state: "unreadable" };

/** Nur lesend: Laufzustand dieser Installation, ohne Steuerkanal zu öffnen. */
export async function serviceState(root: string): Promise<ServiceState> {
  try {
    const s = await readRunState(root);
    if (!s) return { state: "stopped" };
    return alive(s.pid)
      ? { state: "running", startedAt: s.startedAt, pid: s.pid }
      : { state: "stale" };
  } catch {
    return { state: "unreadable" };
  }
}

export async function startControl(options: {
  root: string;
  origin: string;
  mode: RunState["mode"];
  onStop: () => void;
}) {
  const token = randomBytes(32).toString("hex");
  const expected = digest(token);
  let requested = false;
  const server: Server = createServer((socket) => {
    let input = "";
    socket.setEncoding("utf8");
    socket.setTimeout(3000, () => socket.destroy());
    socket.on("error", () => socket.destroy());
    socket.on("data", (chunk: string) => {
      input += chunk;
      if (input.length > 512) return socket.destroy();
      const end = input.indexOf("\n");
      if (end < 0) return;
      let ok = false;
      try {
        const message = JSON.parse(input.slice(0, end));
        ok =
          message?.action === "stop" &&
          typeof message.token === "string" &&
          timingSafeEqual(digest(message.token), expected);
      } catch {
        ok = false;
      }
      socket.end(JSON.stringify({ ok }) + "\n");
      if (ok && !requested) {
        requested = true;
        // Antwort zuerst zustellen, danach geordnet beenden.
        setImmediate(options.onStop);
      }
    });
  });
  // Begrenzt gehaltene Verbindungen, damit der Kanal nicht blockiert werden kann.
  server.maxConnections = 8;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: loopback, port: 0, exclusive: true }, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const closeServer = () =>
    new Promise<void>((resolve) => server.close(() => resolve()));
  const address = server.address();
  const state: RunState = {
    version: 2,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    port: typeof address === "object" && address ? address.port : 0,
    token,
    mode: options.mode,
    origin: options.origin,
  };
  const file = join(options.root, runStateName);
  const temporary = file + "." + randomBytes(6).toString("hex") + ".tmp";
  try {
    runState.parse(state);
    await writeFile(temporary, JSON.stringify(state), {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, file);
  } catch (error) {
    // Review PR #51: ohne veröffentlichten Laufzustand keinen offenen Kanal zurücklassen.
    await rm(temporary, { force: true }).catch(() => {});
    await closeServer();
    throw error;
  }
  let closed = false;
  return {
    port: state.port,
    async close() {
      if (closed) return;
      closed = true;
      await closeServer();
      // Nur den eigenen Laufzustand entfernen, nie den eines späteren Starts.
      await unlinkIfSame(options.root, state);
    },
  };
}

export type StopResult = {
  result: "stopped" | "not-running" | "failed";
  message: string;
};

/** Fordert den geordneten Stopp des eigenen Servers an und wartet auf sein Ende. */
export async function requestStop(
  root: string,
  timeoutMs = 20000,
): Promise<StopResult> {
  let s: RunState | null;
  try {
    s = await readRunState(root);
  } catch {
    return {
      result: "failed",
      message:
        "Laufzustand nicht lesbar. Nichts beendet; Datenordner und Windows-Benutzer prüfen.",
    };
  }
  if (!s)
    return {
      result: "not-running",
      message:
        "Server läuft nicht (kein Laufzustand dieser Installation). Nichts beendet.",
    };
  const state = s;
  if (!alive(state.pid)) {
    // Review PR #51: nur entfernen, wenn kein neuerer Start den Zustand ersetzt hat.
    await unlinkIfSame(root, state);
    return {
      result: "not-running",
      message:
        "Server läuft nicht mehr. Veralteter Laufzustand eines früheren Starts wurde entfernt.",
    };
  }
  const accepted = await new Promise<boolean>((resolve) => {
    const socket = connect({ host: loopback, port: state.port });
    let output = "";
    let settled = false;
    const done = (value: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setEncoding("utf8");
    socket.setTimeout(3000, () => done(false));
    socket.on("error", () => done(false));
    socket.on("connect", () =>
      socket.write(
        JSON.stringify({ action: "stop", token: state.token }) + "\n",
      ),
    );
    socket.on("data", (chunk: string) => {
      output += chunk;
      if (output.length > 512) return done(false);
      if (output.includes("\n")) {
        try {
          done(JSON.parse(output).ok === true);
        } catch {
          done(false);
        }
      }
    });
    socket.on("end", () => done(false));
  });
  if (!accepted)
    return {
      result: "failed",
      message:
        "Server antwortet nicht auf den lokalen Stoppbefehl. Nichts gewaltsam beendet; Serverfenster prüfen und dort mit Strg+C beenden.",
    };
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!alive(state.pid))
      return {
        result: "stopped",
        message:
          "Server geordnet beendet. Daten, Profil und Pakete bleiben erhalten.",
      };
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return {
    result: "failed",
    message:
      "Stopp angefordert, Beendigung aber nicht innerhalb von " +
      Math.round(timeoutMs / 1000) +
      " Sekunden bestätigt. Nichts gewaltsam beendet; Status erneut prüfen.",
  };
}
