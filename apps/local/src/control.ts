import { createServer, connect, type Server } from "node:net";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

/**
 * Lokaler Steuerkanal für den geordneten Stopp des eigenen Servers (Issue #32).
 *
 * - Named Pipe unter Windows (nur lokal erreichbar, kein Netzwerkport); auf anderen
 *   Systemen eine Unix-Socket-Datei, ausschließlich für Tests.
 * - Jeder Start erzeugt ein zufälliges Token. Es steht nur im Laufzustand im privaten
 *   Datenordner (ACL: aktueller Benutzer und SYSTEM).
 * - Es wird nie ein Prozess per PID beendet. Ein fremder Prozess, auch auf Port 3443,
 *   kennt weder Pipe noch Token und bleibt unberührt.
 */

export const runStateName = "run-state.json";
const runState = z.strictObject({
  version: z.literal(1),
  pid: z.int().positive(),
  startedAt: z.iso.datetime(),
  pipe: z.string().min(1).max(260),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  mode: z.enum(["run", "run-renderer"]),
  origin: z.string().max(200),
});
export type RunState = z.infer<typeof runState>;

const digest = (value: string) => createHash("sha256").update(value).digest();

function pipePath(id: string) {
  return process.platform === "win32"
    ? `\\\\.\\pipe\\shownight-local-${id}`
    : join(tmpdir(), `shownight-${id}.sock`);
}

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
  const id = randomBytes(8).toString("hex");
  const token = randomBytes(32).toString("hex");
  const expected = digest(token);
  const pipe = pipePath(id);
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
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(pipe, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const state: RunState = {
    version: 1,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    pipe,
    token,
    mode: options.mode,
    origin: options.origin,
  };
  const file = join(options.root, runStateName);
  const temporary = file + "." + id + ".tmp";
  await writeFile(temporary, JSON.stringify(state), {
    flag: "wx",
    mode: 0o600,
  });
  await rename(temporary, file);
  let closed = false;
  return {
    pipe,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      try {
        // Nur den eigenen Laufzustand entfernen, nie den eines späteren Starts.
        const current = await readRunState(options.root);
        if (current?.pid === process.pid && current.pipe === pipe)
          await unlink(file);
      } catch {
        /* Unlesbarer Zustand bleibt für die Diagnose erhalten. */
      }
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
    await unlink(join(root, runStateName)).catch(() => {});
    return {
      result: "not-running",
      message:
        "Server läuft nicht mehr. Veralteter Laufzustand eines früheren Starts wurde entfernt.",
    };
  }
  const token = state.token;
  const accepted = await new Promise<boolean>((resolve) => {
    const socket = connect(state.pipe);
    let output = "";
    const done = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.setEncoding("utf8");
    socket.setTimeout(3000, () => done(false));
    socket.on("error", () => done(false));
    socket.on("connect", () =>
      socket.write(JSON.stringify({ action: "stop", token }) + "\n"),
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
