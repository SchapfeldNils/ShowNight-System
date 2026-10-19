import test from "node:test";
import assert from "node:assert/strict";
import {
  randomUUID,
  randomBytes,
  createHash,
  X509Certificate,
} from "node:crypto";
import { resolve, join } from "node:path";
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  readdir,
  unlink,
} from "node:fs/promises";
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
import { packageHeader } from "../packages/transfer/src/archive.js";
import { encryptSnapshot, trustFor } from "../packages/transfer/src/offline.js";
import { totp } from "../apps/api/src/security.js";
import { rendererBrowserProof } from "./renderer-browser.js";
import { nativeSceneProof } from "./renderer-scene-native.js";

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
      "Paketmedien: native PNG-/VP8-Diagnose, unveränderliche Kopie und bewusstes Ende",
      async () => {
        const png = await readFile(join(output, "grafik.png"));
        const video = await readFile(
          resolve("dist/renderer-windows/assets/test.webm"),
        );
        const local = await rendererFixture([
          { name: "Synthetisches Paketbild", mime: "image/png", bytes: png },
          {
            name: "Synthetisches Paketvideo",
            mime: "video/webm",
            bytes: video,
          },
          {
            name: "Synthetische falsche PNG-Signatur",
            mime: "image/png",
            bytes: Buffer.alloc(32),
          },
          {
            name: "Synthetischer PNG-Decoderfehler",
            mime: "image/png",
            bytes: png.subarray(0, 33),
          },
        ]);
        const app = await localServer(
          local.accounts,
          local.packages,
          "https://localhost:3443",
          undefined,
          undefined,
          false,
          client,
        );
        try {
          const login = await local.loginAdmin();
          const headers = {
            origin: "https://localhost:3443",
            "content-type": "application/json",
            cookie: "sn_local_session=" + login.session,
            "x-csrf-token": login.csrfToken,
          };
          const post = (url: string, payload: unknown) =>
            app.inject({
              method: "POST",
              url: "/api/local/renderer/" + url,
              headers,
              payload: JSON.stringify(payload),
            });
          let state = (await client.status()).state!;
          assert.equal(state.packageMediaSupported, true);
          state = await client.command({
            commandId: randomUUID(),
            expectedRevision: state.revision,
            action: "clear",
          });
          const prepare = {
            commandId: randomUUID(),
            expectedRevision: state.revision,
            action: "prepare-package",
            packageId: local.manifest.id,
            mediaId: local.manifest.media[0].id,
          };
          let response = await post("package-media", prepare);
          assert.equal(response.statusCode, 200, response.body);
          state = response.json();
          assert.equal(
            state.preview?.packageMedia?.packageId,
            local.manifest.id,
          );
          assert.equal(
            state.preview?.packageMedia?.sha256,
            local.manifest.media[0].sha256,
          );
          const picture = await client.frame("preview");
          await writeFile(join(output, "paketbild.png"), picture);
          const dir = (await readdir(join(f.root, "frames"))).find((n) =>
            n.startsWith("session-"),
          )!;
          const locked = join(
            f.root,
            "frames",
            dir,
            "input-" + state.preview!.packageMedia!.inputId + ".png",
          );
          await assert.rejects(writeFile(locked, Buffer.alloc(png.length)));
          await assert.rejects(unlink(locked));
          const original = local.packages.file(
            local.manifest.id,
            prepare.mediaId,
          );
          await writeFile(original.path, Buffer.alloc(png.length, 8));
          response = await post("test", {
            commandId: randomUUID(),
            expectedRevision: state.revision,
            action: "take",
            expectedSceneId: state.preview!.id,
          });
          assert.equal(response.statusCode, 200, response.body);
          state = response.json();
          assert.equal(sha(await client.frame("program")), sha(picture));
          assert.equal(
            (
              await post("package-media", {
                ...prepare,
                commandId: randomUUID(),
                expectedRevision: state.revision,
              })
            ).statusCode,
            409,
          );
          assert.equal((await client.status()).state!.revision, state.revision);
          await writeFile(original.path, png);
          assert.equal((await post("package-media", prepare)).statusCode, 200);
          assert.equal((await client.status()).state!.revision, state.revision);
          response = await post("package-media", {
            ...prepare,
            commandId: randomUUID(),
            expectedRevision: state.revision,
            mediaId: local.manifest.media[1].id,
          });
          assert.equal(response.statusCode, 200, response.body);
          state = response.json();
          const first = state.preview!.videoFrames;
          await pause(120);
          assert.ok(
            (await client.status()).state!.preview!.videoFrames > first,
          );
          assert.equal(sha(await client.frame("program")), sha(picture));
          response = await post("test", {
            commandId: randomUUID(),
            expectedRevision: state.revision,
            action: "take",
            expectedSceneId: state.preview!.id,
          });
          assert.equal(response.statusCode, 200, response.body);
          state = response.json();
          await writeFile(
            join(output, "paketvideo.png"),
            await client.frame("program"),
          );
          await pause(4400);
          state = (await client.status()).state!;
          assert.equal(state.program?.ended, true);
          const finalFrames = state.program!.videoFrames;
          await pause(150);
          assert.equal(
            (await client.status()).state!.program!.videoFrames,
            finalFrames,
          );
          const stageDir = join(f.root, "frames", dir);
          const stagedCount = async () =>
            (await readdir(stageDir)).filter((n) => n.startsWith("input-"))
              .length;
          const beforeInvalid = await stagedCount();
          for (const invalid of local.manifest.media.slice(2)) {
            response = await post("package-media", {
              ...prepare,
              commandId: randomUUID(),
              expectedRevision: state.revision,
              mediaId: invalid.id,
            });
            assert.equal(response.statusCode, 503, response.body);
            assert.equal(
              (await client.status()).state!.revision,
              state.revision,
            );
            assert.equal(
              await stagedCount(),
              beforeInvalid,
              "Konstruktor-/Decoderfehler geben Dateisperre frei.",
            );
          }
          if (process.env.RENDERER_TEST_BROWSER === "true") {
            await rendererBrowserProof(
              local.accounts,
              local.packages,
              client,
              login.session,
              local.manifest,
              output,
            );
            state = (await client.status()).state!;
          }
          state = await client.command({
            commandId: randomUUID(),
            expectedRevision: state.revision,
            action: "clear",
          });
          assert.equal(state.preview, null);
          assert.equal(state.program, null);
          await assert.rejects(readFile(locked));
        } finally {
          await app.close();
          local.close();
        }
      },
    );
    await t.test(
      "Paketszenen: echte PNG-/JPEG-/Textkomposition, Budgetgrenzen und atomare Fehler",
      async (sceneTest) => {
        await nativeSceneProof(
          sceneTest,
          client,
          join(f.root, "frames"),
          output,
        );
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
    // Diagnostics for the sporadic CI failure (PR #49/#58): keep the last part
    // of the CLI output, without secrets, and report exit code and duration.
    const redact = (text: string) =>
      text
        .replaceAll(f.password, "[REDACTED]")
        .replace(/[A-Za-z0-9_\-+/=]{32,}/g, "[REDACTED]")
        .slice(-4000);
    async function cli(mode: string, file?: string) {
      const started = Date.now();
      let output = "";
      const keep = (b: Buffer) => {
        output = (output + b.toString()).slice(-16000);
      };
      await new Promise<void>((resolve, reject) => {
        const child = spawn(runtime, [main, mode, ...(file ? [file] : [])], {
          cwd: folder,
          env,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
        child.stdout!.on("data", keep);
        child.stderr!.on("data", keep);
        const detail = (what: string) =>
          new Error(
            `Portabler Befehl ${mode}: ${what} nach ${Date.now() - started} ms.\n` +
              redact(output),
          );
        const timer = setTimeout(() => {
          child.kill();
          reject(detail("zu langsam"));
        }, 30000);
        child.once("error", reject);
        child.once("close", (code, signal) => {
          clearTimeout(timer);
          code === 0
            ? resolve()
            : reject(detail(`fehlgeschlagen (Exitcode ${code}, Signal ${signal})`));
        });
      });
      console.log(`Portabler Befehl ${mode}: ${Date.now() - started} ms`);
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
      const archive = join(isolated, "input.snpkg");
      await writeFile(archive, packageHeader(f.manifest).bytes);
      await cli("import-package", archive);
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
        stdio: ["ignore", "pipe", "pipe"],
      });
      let serverOutput = "";
      server.stderr!.on("data", (b: Buffer) => {
        serverOutput = (serverOutput + b.toString()).slice(-16000);
      });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(
                "Portabler HTTPS-Rendererstart fehlgeschlagen.\n" +
                  redact(serverOutput),
              ),
            ),
          25000,
        );
        server!.stdout!.on("data", (b) => {
          if (b.toString().includes("https://localhost:3443")) {
            clearTimeout(timer);
            resolve();
          }
        });
        server!.once("exit", (code) => {
          clearTimeout(timer);
          reject(
            new Error(
              `Portabler Server vorzeitig beendet (Exitcode ${code}).\n` +
                redact(serverOutput),
            ),
          );
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
