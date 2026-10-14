import { spawn, type ChildProcess } from "node:child_process";
import { createConnection, type Socket } from "node:net";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { readFile, lstat, mkdtemp, open, unlink } from "node:fs/promises";
import { setTimeout as pause } from "node:timers/promises";
import { z } from "zod";
import { secureDirectory } from "../../agent/src/identity.js";
import {
  rendererHello,
  rendererReply,
  rendererAction,
  rendererPackageAction,
  type RendererPackageAction,
  type RendererAction,
  type RendererState,
  type RendererReport,
} from "../../../packages/contracts/src/renderer.js";
import {
  stageRendererMedia,
  type RendererMediaSource,
} from "./renderer-media.js";
import {
  rendererSceneAction,
  type RendererSceneAction,
  type RendererSceneDescriptor,
} from "../../../packages/contracts/src/renderer-scene.js";
import {
  stageRendererScene,
  rendererSceneFingerprint,
  type RendererSceneSource,
} from "./renderer-scene.js";
export class RendererFault extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super("Rendererdiagnose nicht bestätigt.");
  }
}
export interface RendererControl {
  status(): Promise<RendererReport>;
  command(action: RendererAction, guard: () => void): Promise<RendererState>;
  prepareMedia(
    action: RendererPackageAction,
    source: RendererMediaSource,
    guard: () => void,
  ): Promise<RendererState>;
  prepareScene(
    action: RendererSceneAction,
    source: RendererSceneSource,
    guard: () => void,
  ): Promise<RendererState>;
  frame(channel: "preview" | "program", guard: () => void): Promise<Buffer>;
  close(): Promise<void>;
}
export const disabledRenderer: RendererControl = {
  async status() {
    return {
      availability: "disabled",
      mode: "software-diagnostics",
      physicalOutputEnabled: false,
      audioOutputEnabled: false,
      state: null,
    };
  },
  async command() {
    throw new RendererFault(503, "DISABLED");
  },
  async frame() {
    throw new RendererFault(503, "DISABLED");
  },
  async prepareMedia() {
    throw new RendererFault(503, "DISABLED");
  },
  async prepareScene() {
    throw new RendererFault(503, "DISABLED");
  },
  async close() {},
};
const bundleManifest = z.strictObject({
  version: z.literal(1),
  files: z.record(
    z.string().regex(/^(?:bin\/|plugins\/|assets\/)?[A-Za-z0-9_.-]+$/),
    z.string().regex(/^[0-9a-f]{64}$/),
  ),
});
export class RendererClient implements RendererControl {
  readonly epoch = randomUUID();
  readonly pipePath = "\\\\.\\pipe\\ShowNight-Renderer-" + this.epoch;
  private readonly token = randomBytes(32).toString("hex");
  private process: ChildProcess | null = null;
  private socket: Socket | null = null;
  private frames = "";
  private input = "";
  private waiting: {
    resolve(value: unknown): void;
    reject(error: unknown): void;
    timer: NodeJS.Timeout;
  } | null = null;
  private serial: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private closed = false;
  private last: RendererState | null = null;
  private readonly staged = new Map<string, Set<string>>();
  private readonly sceneCommands = new Map<
    string,
    {
      fingerprint: string;
      descriptor: RendererSceneDescriptor;
      sent: boolean;
      outcome: "pending" | "completed" | "failed" | "unknown";
      error?: unknown;
    }
  >();
  private async discardInput(id: string) {
    const paths = this.staged.get(id);
    if (!paths) return;
    for (const path of paths) {
      try {
        await unlink(path);
        paths.delete(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          paths.delete(path);
      }
    }
    if (!paths.size) this.staged.delete(id);
  }
  private async cleanupInputs() {
    if (!this.last) return; // An unconfirmed request may still be in use.
    const keep = new Set([
      this.last.preview?.packageMedia?.inputId,
      this.last.program?.packageMedia?.inputId,
      this.last.preview?.packageScene?.inputId,
      this.last.program?.packageScene?.inputId,
    ]);
    for (const id of this.staged.keys()) {
      if (keep.has(id)) continue;
      await this.discardInput(id);
    }
  }
  constructor(
    private readonly folder: string,
    private readonly root: string,
  ) {}
  async start() {
    if (process.platform !== "win32" || this.process || this.closed)
      throw new RendererFault(503, "PLATFORM");
    const folder = resolve(this.folder);
    const manifestFile = join(folder, "integrity.json"),
      info = await lstat(manifestFile);
    if (!info.isFile() || info.size > 65536)
      throw new RendererFault(503, "PACKAGE");
    const manifest = bundleManifest.parse(
      JSON.parse(await readFile(manifestFile, "utf8")),
    );
    if (
      Object.keys(manifest.files).length > 200 ||
      !manifest.files["shownight-renderer.exe"] ||
      !manifest.files["assets/test.webm"] ||
      !manifest.files["assets/bild-64x64.bgra"]
    )
      throw new RendererFault(503, "PACKAGE");
    for (const [name, hash] of Object.entries(manifest.files)) {
      if (name.split("/").some((part) => part === "." || part === ".."))
        throw new RendererFault(503, "PACKAGE");
      const file = resolve(folder, name);
      if (!file.startsWith(folder + sep))
        throw new RendererFault(503, "PACKAGE");
      const stat = await lstat(file);
      if (!stat.isFile() || stat.size > 128 * 1024 * 1024)
        throw new RendererFault(503, "PACKAGE");
      if (
        createHash("sha256")
          .update(await readFile(file))
          .digest("hex") !== hash
      )
        throw new RendererFault(503, "PACKAGE");
    }
    await secureDirectory(this.root);
    this.frames = await mkdtemp(join(this.root, "session-"));
    await secureDirectory(this.frames);
    const env = {
      ...process.env,
      PATH: join(folder, "bin") + ";" + (process.env.PATH ?? ""),
      SHOWNIGHT_RENDERER_EPOCH: this.epoch,
      SHOWNIGHT_RENDERER_TOKEN: this.token,
      SHOWNIGHT_RENDERER_FRAMES: this.frames,
    };
    // No command shell, arbitrary executable, window, audio or network sink.
    this.process = spawn(join(folder, "shownight-renderer.exe"), [], {
      cwd: folder,
      env,
      windowsHide: true,
      stdio: "ignore",
    });
    this.process.on("error", () => this.disconnect());
    this.process.on("exit", () => this.disconnect());
    const until = Date.now() + 12000;
    while (
      Date.now() < until &&
      this.process.exitCode === null &&
      !this.closed
    ) {
      try {
        await this.connect();
        return;
      } catch {
        await pause(100);
      }
    }
    await this.close();
    throw new RendererFault(503, "START");
  }
  disconnect() {
    const socket = this.socket;
    this.socket = null;
    this.last = null;
    this.input = "";
    const w = this.waiting;
    this.waiting = null;
    if (w) {
      clearTimeout(w.timer);
      w.reject(new RendererFault(503, "UNKNOWN"));
    }
    socket?.destroy();
  }
  private async connect() {
    if (this.socket && !this.socket.destroyed && this.last) return;
    if (this.closed || !this.process || this.process.exitCode !== null)
      throw new RendererFault(503, "OFFLINE");
    const socket = createConnection(this.pipePath);
    this.socket = socket;
    socket.on("data", (chunk) => {
      if (this.socket !== socket) return;
      this.input += chunk.toString("utf8");
      if (Buffer.byteLength(this.input) > 16384) {
        this.disconnect();
        return;
      }
      const end = this.input.indexOf("\n");
      if (end < 0) return;
      const value = this.input.slice(0, end);
      this.input = this.input.slice(end + 1);
      const waiting = this.waiting;
      if (!waiting || this.input.length) {
        this.disconnect();
        return;
      }
      this.waiting = null;
      clearTimeout(waiting.timer);
      try {
        waiting.resolve(JSON.parse(value));
      } catch {
        waiting.reject(new RendererFault(503, "PROTOCOL"));
        this.disconnect();
      }
    });
    socket.on("error", () => {
      if (this.socket === socket) this.disconnect();
    });
    socket.on("close", () => {
      if (this.socket === socket) this.disconnect();
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new RendererFault(503, "OFFLINE"));
      }, 1000);
      socket.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("error", () => {
        clearTimeout(timer);
        reject(new RendererFault(503, "OFFLINE"));
      });
    });
    try {
      const hello = rendererHello.parse(
        await this.exchange({
          protocolVersion: 1,
          epoch: this.epoch,
          type: "hello",
          token: this.token,
        }),
      );
      if (hello.epoch !== this.epoch || hello.state.epoch !== this.epoch)
        throw new RendererFault(503, "EPOCH");
      this.last = hello.state;
    } catch {
      this.disconnect();
      throw new RendererFault(503, "PROTOCOL");
    }
  }
  private exchange(value: unknown) {
    if (!this.socket || this.socket.destroyed || this.waiting)
      return Promise.reject(new RendererFault(503, "OFFLINE"));
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => this.disconnect(), 5000);
      this.waiting = { resolve, reject, timer };
      this.socket!.write(JSON.stringify(value) + "\n", (error) => {
        if (error) this.disconnect();
      });
    });
  }
  private queue<T>(work: () => Promise<T>): Promise<T> {
    if (this.closed || this.queued >= 16)
      return Promise.reject(new RendererFault(409, "BUSY"));
    ++this.queued;
    const job = this.serial.then(work);
    this.serial = job.catch(() => {});
    return job.finally(() => --this.queued);
  }
  private async request(
    type: "query" | "command" | "frame" | "shutdown",
    extra: Record<string, unknown> = {},
    guard = () => {},
  ) {
    await this.connect();
    guard(); // Recheck authorization after queueing and connecting, before dispatch.
    const requestId = randomUUID();
    let reply: ReturnType<typeof rendererReply.parse>;
    try {
      reply = rendererReply.parse(
        await this.exchange({
          protocolVersion: 1,
          epoch: this.epoch,
          requestId,
          type,
          ...extra,
        }),
      );
    } catch (e) {
      this.disconnect();
      if (e instanceof RendererFault) throw e;
      throw new RendererFault(503, "PROTOCOL");
    }
    if (
      reply.epoch !== this.epoch ||
      reply.state.epoch !== this.epoch ||
      reply.requestId !== requestId
    ) {
      this.disconnect();
      throw new RendererFault(503, "PROTOCOL");
    }
    this.last = reply.state;
    if (reply.result !== "completed")
      throw new RendererFault(
        reply.result === "conflict" ? 409 : 503,
        reply.code,
      );
    return { state: reply.state, requestId };
  }
  status() {
    return this.queue(async () => {
      let state: RendererState | null = null;
      try {
        state = (await this.request("query")).state;
      } catch {}
      return {
        availability: state ? ("available" as const) : ("unavailable" as const),
        mode: "software-diagnostics" as const,
        physicalOutputEnabled: false as const,
        audioOutputEnabled: false as const,
        state,
      };
    });
  }
  command(action: RendererAction, guard = () => {}) {
    const command = rendererAction.parse(action);
    return this.queue(async () => {
      try {
        return (await this.request("command", { command }, guard)).state;
      } finally {
        await this.cleanupInputs();
      }
    });
  }
  prepareMedia(
    action: RendererPackageAction,
    source: RendererMediaSource,
    guard = () => {},
  ) {
    const command = rendererPackageAction.parse(action);
    if (
      command.packageId !== source.media.packageId ||
      command.mediaId !== source.media.mediaId
    )
      throw new RendererFault(400, "MEDIA");
    return this.queue(async () => {
      await this.request("query", {}, guard);
      if (!this.last?.packageMediaSupported)
        throw new RendererFault(503, "UNSUPPORTED");
      await this.cleanupInputs();
      if (this.staged.size >= 4) throw new RendererFault(409, "LIMIT");
      const inputId = randomUUID();
      let staged;
      try {
        staged = await stageRendererMedia(source, this.frames, inputId, guard);
      } catch (e) {
        // Preserve authentication errors from the caller's guard.
        if ((e as { status?: number }).status) throw e;
        throw new RendererFault(409, "MEDIA");
      }
      this.staged.set(inputId, new Set([staged.path]));
      try {
        return (
          await this.request(
            "command",
            { command: { ...command, media: staged.media } },
            guard,
          )
        ).state;
      } finally {
        await this.cleanupInputs();
      }
    });
  }
  prepareScene(
    action: RendererSceneAction,
    source: RendererSceneSource,
    guard = () => {},
  ) {
    const command = rendererSceneAction.parse(action);
    if (
      command.packageId !== source.packageId ||
      command.sceneId !== source.scene.id
    )
      throw new RendererFault(400, "SCENE");
    let sourceFingerprint: string;
    try {
      sourceFingerprint = rendererSceneFingerprint(source);
    } catch {
      throw new RendererFault(409, "SCENE");
    }
    const fingerprint = JSON.stringify({ command, sourceFingerprint });
    return this.queue(async () => {
      guard();
      const cached = this.sceneCommands.get(command.commandId);
      if (cached && cached.fingerprint !== fingerprint)
        throw new RendererFault(409, "COMMAND_ID");
      await this.request("query", {}, guard);
      guard();
      if (!this.last?.packageScenesSupported)
        throw new RendererFault(503, "UNSUPPORTED");
      if (cached) {
        if (cached.outcome === "completed") return this.last!;
        if (cached.outcome === "failed") throw cached.error;
        throw new RendererFault(503, "UNKNOWN");
      }
      // Never evict ambiguous receipts or silently recycle command identities.
      if (this.sceneCommands.size >= 1024)
        throw new RendererFault(409, "LIMIT");
      await this.cleanupInputs();
      guard();
      if (this.staged.size >= 4) throw new RendererFault(409, "LIMIT");
      const inputId = randomUUID();
      let staged;
      try {
        staged = await stageRendererScene(source, this.frames, inputId, guard);
      } catch (error) {
        if ((error as { status?: number }).status) throw error;
        throw new RendererFault(409, "SCENE");
      }
      this.staged.set(inputId, new Set(staged.paths));
      const entry = {
        fingerprint,
        descriptor: staged.descriptor,
        sent: false,
        outcome: "pending" as "pending" | "completed" | "failed" | "unknown",
        error: undefined as unknown,
      };
      this.sceneCommands.set(command.commandId, entry);
      try {
        const result = await this.request(
          "command",
          { command: { ...command, scene: entry.descriptor } },
          () => {
            guard();
            entry.sent = true;
          },
        );
        entry.outcome = "completed";
        return result.state;
      } catch (error) {
        if (!entry.sent) {
          this.sceneCommands.delete(command.commandId);
          await this.discardInput(inputId);
        } else {
          entry.outcome = this.last ? "failed" : "unknown";
          entry.error = error;
        }
        throw error;
      } finally {
        await this.cleanupInputs();
      }
    });
  }
  frame(channel: "preview" | "program", guard = () => {}) {
    if (channel !== "preview" && channel !== "program")
      throw new RendererFault(400, "CHANNEL");
    return this.queue(async () => {
      const { requestId } = await this.request("frame", { channel }, guard);
      const file = join(this.frames, channel + "-" + requestId + ".png");
      try {
        if (!(await lstat(file)).isFile())
          throw new RendererFault(503, "FRAME");
        const fd = await open(file, "r");
        try {
          const stat = await fd.stat();
          if (!stat.isFile() || stat.size < 24 || stat.size > 1048576)
            throw new RendererFault(503, "FRAME");
          const bytes = await fd.readFile();
          if (
            !bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
            bytes.readUInt32BE(16) !== 640 ||
            bytes.readUInt32BE(20) !== 360
          )
            throw new RendererFault(503, "FRAME");
          guard();
          return bytes;
        } finally {
          await fd.close();
        }
      } finally {
        await unlink(file).catch((e) => {
          if (e.code !== "ENOENT") throw e;
        });
      }
    });
  }
  async close() {
    if (this.closed) return;
    // Explicit shutdown of the owned diagnostic process; a dropped pipe alone
    // does not stop existing media or automatically resubmit any command.
    try {
      await this.queue(() => this.request("shutdown"));
    } catch {}
    this.closed = true;
    this.disconnect();
    const child = this.process;
    if (child && child.exitCode === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill();
          resolve();
        }, 3000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    if (!child || child.exitCode !== null) {
      for (const paths of this.staged.values())
        for (const path of paths) await unlink(path).catch(() => {});
      this.staged.clear();
      this.sceneCommands.clear();
    }
  }
}
