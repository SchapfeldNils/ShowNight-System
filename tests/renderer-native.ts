import test from "node:test";
import assert from "node:assert/strict";
import {
  randomUUID,
  randomBytes,
  createHash,
  X509Certificate,
} from "node:crypto";
import { resolve, join } from "node:path";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { setTimeout as pause } from "node:timers/promises";
import { createConnection } from "node:net";
import { spawn } from "node:child_process";
import { request as httpsRequest } from "node:https";
import { RendererClient, RendererFault } from "../apps/local/src/renderer.js";
import { localServer } from "../apps/local/src/server.js";
import { rendererFixture } from "./renderer-fixture.js";
import { powershell } from "../apps/agent/src/identity.js";
import { loadVault } from "../apps/local/src/vault.js";
import { PackageStore } from "../apps/local/src/store.js";
import { packageHeader } from "../packages/transfer/src/archive.js";
import { encryptSnapshot, trustFor } from "../packages/transfer/src/offline.js";
import { totp } from "../apps/api/src/security.js";

test("S3-04: echter Windows-C++-/GStreamer-/Skia-Prozess ohne Bildschirm/Ton", async (t) => {
  assert.equal(
    process.platform,
    "win32",
    "Native Rendererprüfung verlangt Windows.",
  );
  const f = await rendererFixture();
  const client = new RendererClient(
    resolve("dist/renderer-windows"),
    join(f.root, "frames"),
  );
  const sha = (bytes: Buffer) =>
    createHash("sha256").update(bytes).digest("hex");
  const output = resolve("test-results/renderer");
  await mkdir(output, { recursive: true });
  const applications: Awaited<ReturnType<typeof localServer>>[] = [];
  try {
    await client.start();
    await t.test(
      "Sicherer Start, reale Skia-PNGs und isoliertes Vorbereiten/Übernehmen",
      async () => {
        const initial = (await client.status()).state!;
        assert.equal(initial.revision, 0);
        assert.equal(initial.preview, null);
        assert.equal(initial.program, null);
        assert.equal(initial.audioOutputEnabled, false);
        assert.equal(initial.physicalOutputEnabled, false);
        const background = await client.frame("program");
        const id = randomUUID();
        const prepare = {
          commandId: id,
          expectedRevision: 0,
          action: "prepare" as const,
          scene: "grafik" as const,
        };
        const prepared = await client.command(prepare);
        assert.equal(prepared.revision, 1);
        assert.equal(prepared.preview?.id, id);
        assert.equal(prepared.program, null);
        assert.equal(sha(await client.frame("program")), sha(background));
        const preview = await client.frame("preview");
        assert.notEqual(sha(preview), sha(background));
        const duplicate = await client.command(prepare);
        assert.equal(duplicate.revision, 1);
        await assert.rejects(
          () => client.command({ ...prepare, scene: "video" }),
          (e) => e instanceof RendererFault && e.code === "COMMAND_ID",
        );
        const commands = await Promise.allSettled([
          client.command({
            commandId: randomUUID(),
            expectedRevision: 1,
            action: "take",
            expectedSceneId: id,
          }),
          client.command({
            commandId: randomUUID(),
            expectedRevision: 1,
            action: "take",
            expectedSceneId: id,
          }),
        ]);
        assert.equal(
          commands.filter((r) => r.status === "fulfilled").length,
          1,
        );
        assert.equal(commands.filter((r) => r.status === "rejected").length, 1);
        const current = (await client.status()).state!;
        assert.equal(current.revision, 2);
        assert.equal(current.program?.id, id);
        const program = await client.frame("program");
        assert.equal(sha(program), sha(preview));
        await writeFile(join(output, "grafik.png"), program);
        await writeFile(join(output, "hintergrund.png"), background);
      },
    );
    await t.test(
      "Echte lokale Videodekodierung, getrennte Kanäle und Pipe-Wiederverbindung ohne Replay",
      async () => {
        const before = (await client.status()).state!,
          program = await client.frame("program");
        const id = randomUUID();
        const prepare = {
          commandId: id,
          expectedRevision: before.revision,
          action: "prepare" as const,
          scene: "video" as const,
        };
        const prepared = await client.command(prepare);
        assert.equal(prepared.program?.id, before.program?.id);
        await pause(250);
        const moving = (await client.status()).state!;
        assert.ok(moving.preview!.videoFrames > prepared.preview!.videoFrames);
        assert.equal(sha(await client.frame("program")), sha(program));
        const frame = await client.frame("preview");
        await writeFile(join(output, "video-mit-grafik.png"), frame);
        await client.command({
          commandId: randomUUID(),
          expectedRevision: moving.revision,
          action: "take",
          expectedSceneId: id,
        });
        const taken = (await client.status()).state!;
        client.disconnect();
        await pause(300);
        const reconnected = (await client.status()).state!;
        assert.equal(reconnected.epoch, taken.epoch);
        assert.equal(reconnected.revision, taken.revision);
        assert.equal(reconnected.program?.id, id);
        assert.ok(
          reconnected.program!.videoFrames > taken.program!.videoFrames,
        );
        // Old duplicate returns its receipt, without modifying the current stand.
        assert.equal(
          (await client.command(prepare)).revision,
          prepared.revision,
        );
        assert.equal((await client.status()).state!.revision, taken.revision);
        client.disconnect();
        await new Promise<void>((resolve, reject) => {
          const socket = createConnection(client.pipePath);
          const timer = setTimeout(() => {
            socket.destroy();
            reject(new Error("Falsche Authentifizierung nicht abgewiesen."));
          }, 3000);
          socket.once("connect", () =>
            socket.write(
              JSON.stringify({
                protocolVersion: 1,
                epoch: client.epoch,
                type: "hello",
                token: "0".repeat(64),
              }) + "\n",
            ),
          );
          socket.on("data", () => {
            clearTimeout(timer);
            socket.destroy();
            reject(new Error("Fremder Token akzeptiert."));
          });
          socket.once("error", () => {
            clearTimeout(timer);
            resolve();
          });
          socket.once("close", () => {
            clearTimeout(timer);
            resolve();
          });
        });
        assert.equal((await client.status()).state!.program?.id, id);
      },
    );
    await t.test(
      "Lokale API: MFA/Admin, CSRF, aktuelle Sperren, echte Rendererbilder",
      async () => {
        const app = await localServer(
          f.accounts,
          f.packages,
          "https://localhost:3443",
          undefined,
          undefined,
          false,
          client,
        );
        applications.push(app);
        const a = await f.loginAdmin(),
          cookie = "sn_local_session=" + a.session;
        const headers = {
          origin: "https://localhost:3443",
          cookie,
          "x-csrf-token": a.csrfToken,
        };
        assert.equal(
          (await app.inject({ url: "/api/local/renderer" })).statusCode,
          401,
        );
        const member = await f.accounts.login("member", f.password);
        assert.ok("session" in member);
        assert.equal(
          (
            await app.inject({
              url: "/api/local/renderer",
              headers: { cookie: "sn_local_session=" + member.session },
            })
          ).statusCode,
          403,
        );
        const status = await app.inject({
          url: "/api/local/renderer",
          headers,
        });
        assert.equal(status.json().availability, "available");
        const image = await app.inject({
          url: "/api/local/renderer/frames/preview",
          headers,
        });
        assert.equal(image.statusCode, 200);
        assert.equal(image.headers["content-type"], "image/png");
        assert.match(String(image.headers["cache-control"]), /no-store/);
        const body = {
          commandId: randomUUID(),
          expectedRevision: status.json().state.revision,
          action: "clear" as const,
        };
        assert.equal(
          (
            await app.inject({
              url: "/api/local/renderer/test",
              method: "POST",
              headers: { ...headers, "x-csrf-token": "" },
              payload: body,
            })
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await app.inject({
              url: "/api/local/renderer/test",
              method: "POST",
              headers,
              payload: body,
            })
          ).statusCode,
          200,
        );
        let authorize = true;
        await assert.rejects(() =>
          client.command(
            {
              ...body,
              commandId: randomUUID(),
              expectedRevision: body.expectedRevision + 1,
            },
            () => {
              if (!authorize) throw new Error("Berechtigung entzogen.");
              authorize = false;
              throw new Error("Berechtigung entzogen.");
            },
          ),
        );
        assert.equal(
          (await client.status()).state!.revision,
          body.expectedRevision + 1,
        );
        f.accounts.block(f.accounts.actor(a.session)!, f.adminId, true);
        assert.equal(
          (
            await app.inject({
              url: "/api/local/renderer/frames/program",
              headers,
            })
          ).statusCode,
          401,
        );
      },
    );
  } finally {
    for (const app of applications) await app.close();
    await client.close();
    f.close();
  }
});

if (process.env.RENDERER_TEST_PORTABLE === "true")
  test("Portables Server-/Renderer-ZIP: echte CLI, DPAPI und HTTPS-Rendererdiagnose außerhalb Repository", async () => {
    const f = await rendererFixture(),
      isolated = await mkdtemp(join(tmpdir(), "shownight-renderer-zip-"));
    await powershell(
      "[void][Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem');$v=[Console]::In.ReadToEnd()|ConvertFrom-Json;[IO.Compression.ZipFile]::ExtractToDirectory($v.zip,$v.out)",
      JSON.stringify({
        zip: resolve("dist/shownight-server-renderer-windows-x64.zip"),
        out: isolated,
      }),
    );
    const folder = join(isolated, "server-renderer-windows"),
      profile = join(isolated, "profile"),
      root = join(profile, "ShowNight/local-server");
    const runtime = join(folder, "node.exe"),
      main = join(folder, "main.js");
    const env = { ...process.env, LOCALAPPDATA: profile };
    async function cli(mode: string, file?: string) {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(runtime, [main, mode, ...(file ? [file] : [])], {
          cwd: folder,
          env,
          windowsHide: true,
          stdio: "ignore",
        });
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error("Portabler Befehl zu langsam."));
        }, 30000);
        child.once("error", reject);
        child.once("close", (code) => {
          clearTimeout(timer);
          code === 0
            ? resolve()
            : reject(new Error("Portabler Befehl fehlgeschlagen: " + mode));
        });
      });
    }
    let server: ReturnType<typeof spawn> | null = null;
    try {
      await cli("init");
      const v = await loadVault(root),
        trustKey = randomBytes(32).toString("hex");
      const trustPath = join(isolated, "test.sntrust"),
        authPath = join(isolated, "test.snauth");
      await writeFile(
        trustPath,
        JSON.stringify(trustFor(trustKey, f.snapshot.serverOrigin)),
      );
      const packagesRoot = join(profile, "ShowNight/local-packages"),
        archive = join(isolated, "input.snpkg");
      await mkdir(packagesRoot, { recursive: true });
      await writeFile(archive, packageHeader(f.manifest).bytes);
      const packages = new PackageStore(packagesRoot);
      try {
        await packages.importArchive(archive);
      } finally {
        packages.close();
      }
      await writeFile(
        authPath,
        JSON.stringify(encryptSnapshot(f.snapshot, v.target, trustKey)),
      );
      await cli("trust", trustPath);
      await cli("import-auth", authPath);
      const certificate = new X509Certificate(
        await readFile(join(root, "server.cer")),
      );
      server = spawn(runtime, [main, "run-renderer"], {
        cwd: folder,
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(new Error("Portabler HTTPS-Rendererstart fehlgeschlagen.")),
          25000,
        );
        server!.stdout!.on("data", (b) => {
          if (b.toString().includes("https://localhost:3443")) {
            clearTimeout(timer);
            resolve();
          }
        });
        server!.once("exit", () => {
          clearTimeout(timer);
          reject(new Error("Portabler Server vorzeitig beendet."));
        });
      });
      let cookie = "",
        csrf = "";
      const request = (path: string, body?: unknown) =>
        new Promise<{ status: number; body: Buffer; cookie: string }>(
          (resolve, reject) => {
            const content =
              body === undefined ? undefined : JSON.stringify(body);
            const r = httpsRequest(
              "https://localhost:3443" + path,
              {
                ca: certificate.toString(),
                rejectUnauthorized: true,
                method: content ? "POST" : "GET",
                headers: {
                  origin: "https://localhost:3443",
                  cookie,
                  "x-csrf-token": csrf,
                  ...(content
                    ? {
                        "content-type": "application/json",
                        "content-length": Buffer.byteLength(content),
                      }
                    : {}),
                },
              },
              (res) => {
                const chunks: Buffer[] = [];
                res.on("data", (b) => chunks.push(b));
                res.on("end", () =>
                  resolve({
                    status: res.statusCode!,
                    body: Buffer.concat(chunks),
                    cookie: res.headers["set-cookie"]?.[0].split(";")[0] ?? "",
                  }),
                );
              },
            );
            r.setTimeout(8000, () =>
              r.destroy(new Error("Portabler HTTPS-Test zu langsam.")),
            );
            r.on("error", reject);
            r.end(content);
          },
        );
      assert.equal((await request("/")).status, 200);
      assert.equal((await request("/api/local/renderer")).status, 401);
      const login = await request("/api/local/auth/login", {
        login: "admin",
        password: f.password,
      });
      const verified = await request("/api/local/auth/mfa/verify", {
        challenge: JSON.parse(login.body.toString()).challenge,
        code: totp(f.secret),
      });
      assert.equal(verified.status, 200);
      cookie = verified.cookie;
      csrf = JSON.parse(verified.body.toString()).csrfToken;
      const status = await request("/api/local/renderer"),
        state = JSON.parse(status.body.toString()).state;
      assert.equal(status.status, 200);
      assert.equal(state.program, null);
      assert.equal(
        (
          await request("/api/local/renderer/test", {
            commandId: randomUUID(),
            expectedRevision: state.revision,
            action: "prepare",
            scene: "video",
          })
        ).status,
        200,
      );
      const image = await request("/api/local/renderer/frames/preview");
      assert.equal(image.status, 200);
      assert.deepEqual([...image.body.subarray(0, 4)], [137, 80, 78, 71]);
    } finally {
      if (server) {
        // Windows termination is deliberate; find/stop only the native child
        // belonging to this isolated server through its exact parent identity.
        const pid = server.pid;
        if (pid)
          await powershell(
            "$v=[Console]::In.ReadToEnd()|ConvertFrom-Json;Get-CimInstance Win32_Process -Filter ('ParentProcessId='+$v.pid) | Where-Object { $_.Name -eq 'shownight-renderer.exe' -and $_.ExecutablePath -eq $v.exe } | ForEach-Object { Stop-Process -Id $_.ProcessId }",
            JSON.stringify({
              pid,
              exe: join(folder, "renderer/shownight-renderer.exe"),
            }),
          ).catch(() => {});
        server.kill();
      }
      f.close();
    }
  });
