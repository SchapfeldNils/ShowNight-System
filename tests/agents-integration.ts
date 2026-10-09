import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { mkdir, readFile, mkdtemp, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import WebSocket from "ws";
import { fixture } from "./fixture.js";
import { totp, hash } from "../apps/api/src/security.js";
import { startAgent } from "../apps/agent/src/client.js";
import {
  pair,
  saveIdentity,
  loadIdentity,
  secureDirectory,
} from "../apps/agent/src/identity.js";
import { database, migrate } from "../apps/api/src/db.js";
async function until(check: () => Promise<boolean>, timeout = 7000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.fail("Erwarteter Zustand nicht erreicht.");
}
test("S2 mit echtem PostgreSQL und outbound Windows-/Node-Agent", async (t) => {
  const f = await fixture(55435),
    { app, db, cfg } = f;
  let agent: ReturnType<typeof startAgent> | undefined;
  let cookie = "",
    csrf = "";
  const request = (path: string, method = "GET", body?: unknown) =>
    app.inject({
      url: "/api/v1" + path,
      method: method as any,
      headers: { origin: cfg.origin, cookie, "x-csrf-token": csrf },
      ...(body === undefined ? {} : { payload: body as any }),
    });
  try {
    const login = (
      await request("/auth/login", "POST", {
        login: "admin",
        password: f.adminPassword,
      })
    ).json();
    const verified = await request("/auth/mfa/verify", "POST", {
      challenge: login.challenge,
      code: totp(login.secret),
    });
    assert.equal(verified.statusCode, 200);
    cookie = "sn_session=" + verified.cookies[0].value;
    csrf = verified.json().csrfToken;
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address() as { port: number };
    const server = "http://127.0.0.1:" + address.port;
    const create = async (profile = "dj") =>
      (
        await request("/devices/pairings", "POST", {
          name: "Synthetischer Agent",
          profile,
        })
      ).json();
    const code = (await create()).code,
      identity = await pair(server, code);
    await t.test(
      "S2-02: Paarung einmalig/abgelaufen, Hash statt Gerätecredential, Browser-Origin abgewiesen",
      async () => {
        await assert.rejects(() => pair(server, code));
        const expired = (await create()).code;
        await db.query(
          "UPDATE agent_pairings SET expires_at=now()-interval '1 second' WHERE code_hash=$1",
          [hash(expired)],
        );
        await assert.rejects(() => pair(server, expired));
        const row = (
          await db.query("SELECT token_hash FROM agent_devices WHERE id=$1", [
            identity.deviceId,
          ])
        ).rows[0];
        assert.equal(row.token_hash, hash(identity.credential));
        assert.notEqual(row.token_hash, identity.credential);
        assert.equal(
          (
            await app.inject({
              method: "POST",
              url: "/api/agent/v1/pair",
              headers: { origin: cfg.origin },
              payload: { code, protocolVersion: 1 },
            })
          ).statusCode,
          403,
        );
      },
    );
    const dir = join(f.dir, "agent");
    await mkdir(dir);
    if (process.platform === "win32") {
      await secureDirectory(dir);
      await saveIdentity(dir, identity);
      assert.deepEqual(await loadIdentity(dir), identity);
    }
    const states: string[] = [];
    agent = startAgent(identity, dir, (state) => states.push(state));
    const devices = async () => {
      const r = await request("/devices");
      assert.equal(r.statusCode, 200, r.body);
      return r.json();
    };
    await until(async () => (await devices())[0]?.connected);
    await t.test(
      "S2-03/04: echte Verbindung, Simulation getrennt, parallele Deduplizierung/Konflikt",
      async () => {
        assert.equal((await devices())[0].agentVersion, "0.2.0");
        assert.equal(
          (await devices())[0].capabilities.find(
            (c: any) => c.source === "simulator",
          ).availability,
          "simulated",
        );
        const path = "/devices/" + identity.deviceId + "/diagnostics",
          input = { dispatchId: randomUUID(), action: "diagnostics.ping" };
        const results = await Promise.all([
          request(path, "POST", input),
          request(path, "POST", input),
        ]);
        for (const r of results) assert.equal(r.statusCode, 200, r.body);
        assert.equal(results.filter((r) => r.json().duplicate).length, 1);
        await until(
          async () =>
            (await devices())[0].receipts.find(
              (r: any) => r.id === input.dispatchId,
            )?.status === "completed",
        );
        assert.equal(
          (await request(path, "POST", { ...input, action: "simulator.noop" }))
            .statusCode,
          409,
        );
        assert.equal(
          (
            await request(path, "POST", {
              dispatchId: randomUUID(),
              action: "play",
            })
          ).statusCode,
          400,
        );
        const simulation = {
          dispatchId: randomUUID(),
          action: "simulator.noop",
        };
        assert.equal((await request(path, "POST", simulation)).statusCode, 200);
        await until(
          async () =>
            (await devices())[0].receipts.find(
              (r: any) => r.id === simulation.dispatchId,
            )?.evidence === "simulator-no-effect",
        );
      },
    );
    await t.test(
      "Vorübergehender Datenbankausfall verbindet Agent automatisch wieder, gespeicherte Ergebnisse bleiben",
      async () => {
        const epoch = (
          await db.query(
            "SELECT connection_id FROM agent_devices WHERE id=$1",
            [identity.deviceId],
          )
        ).rows[0].connection_id;
        await f.pg.stop();
        try {
          await until(
            async () => states.some((s) => s.startsWith("Nicht verbunden")),
            13000,
          );
        } finally {
          await f.pg.start();
        }
        await until(async () => (await devices())[0].connected, 15000);
        assert.notEqual(
          (
            await db.query(
              "SELECT connection_id FROM agent_devices WHERE id=$1",
              [identity.deviceId],
            )
          ).rows[0].connection_id,
          epoch,
        );
        assert(
          (await devices())[0].receipts.every(
            (r: any) => r.status === "completed",
          ),
        );
      },
    );
    await t.test(
      "S2-05/08: Disconnect, kein Replay, falsche Identität/Protokoll, Widerruf",
      async () => {
        agent!.stop();
        agent = undefined;
        await until(async () => !(await devices())[0].connected);
        const dispatchId = randomUUID();
        assert.equal(
          (
            await request(
              "/devices/" + identity.deviceId + "/diagnostics",
              "POST",
              { dispatchId: randomUUID(), action: "diagnostics.ping" },
            )
          ).statusCode,
          409,
        );
        const interrupted = new WebSocket(
          server.replace("http:", "ws:") + "/api/agent/v1/ws",
          { headers: { Authorization: "Bearer " + identity.credential } },
        );
        interrupted.on("error", () => {});
        interrupted.on("open", () =>
          interrupted.send(
            JSON.stringify({
              type: "hello",
              protocolVersion: 1,
              deviceId: identity.deviceId,
              profile: "dj",
              agentVersion: "0.2.0",
              capabilities: [],
            }),
          ),
        );
        await new Promise<void>((resolve) =>
          interrupted.once("message", () => resolve()),
        );
        const received = new Promise<void>((resolve) =>
          interrupted.once("message", (raw) => {
            assert.equal(JSON.parse(raw.toString()).dispatchId, dispatchId);
            resolve();
          }),
        );
        assert.equal(
          (
            await request(
              "/devices/" + identity.deviceId + "/diagnostics",
              "POST",
              { dispatchId, action: "diagnostics.ping" },
            )
          ).statusCode,
          200,
        );
        await received;
        // The test peer withholds heartbeat and receipt, proving liveness loss during an actual dispatch.
        await until(async () => !(await devices())[0].connected, 19000);
        await until(
          async () =>
            (
              await db.query(
                "SELECT status FROM agent_dispatches WHERE id=$1",
                [dispatchId],
              )
            ).rows[0].status === "unknown",
        );
        assert.equal(
          (
            await db.query("SELECT status FROM agent_dispatches WHERE id=$1", [
              dispatchId,
            ])
          ).rows[0].status,
          "unknown",
        );
        agent = startAgent(identity, dir);
        await until(async () => (await devices())[0].connected);
        const old = (
          await request(
            "/devices/" + identity.deviceId + "/diagnostics",
            "POST",
            { dispatchId, action: "diagnostics.ping" },
          )
        ).json();
        assert.equal(old.duplicate, true);
        assert.equal(old.status, "unknown");
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int n FROM agent_dispatches WHERE id=$1",
              [dispatchId],
            )
          ).rows[0].n,
          1,
        );
        const bad = new WebSocket(
          server.replace("http:", "ws:") + "/api/agent/v1/ws",
          { headers: { Authorization: "Bearer " + identity.credential } },
        );
        bad.on("error", () => {});
        bad.on("open", () =>
          bad.send(
            JSON.stringify({
              type: "hello",
              protocolVersion: 2,
              deviceId: identity.deviceId,
              profile: "dj",
              agentVersion: "0.2.0",
              capabilities: [],
            }),
          ),
        );
        const closeCode = await new Promise<number>((r) =>
          bad.on("close", (code) => r(code)),
        );
        assert.equal(closeCode, 1008);
        assert.equal(
          (
            await request(
              "/devices/" + identity.deviceId + "/revoke",
              "POST",
              {},
            )
          ).statusCode,
          200,
        );
        await until(
          async () =>
            (await devices())[0].revokedAt !== null &&
            !(await devices())[0].connected,
        );
        assert.equal(
          (
            await request(
              "/devices/" + identity.deviceId + "/diagnostics",
              "POST",
              { dispatchId: randomUUID(), action: "diagnostics.ping" },
            )
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await app.inject({
              url: "/api/agent/v1/ws",
              headers: { Authorization: "Bearer " + identity.credential },
            })
          ).statusCode,
          401,
        );
        const plainToken = randomBytes(32).toString("base64url"),
          userId = randomUUID();
        await db.query(
          "INSERT INTO users(id,login,display_name) VALUES($1,'device-reader','Synthetisch')",
          [userId],
        );
        await db.query(
          "INSERT INTO sessions(token_hash,user_id,csrf_token,mfa_verified,expires_at) VALUES($1,$2,'synthetic',true,now()+interval '1 hour')",
          [hash(plainToken), userId],
        );
        const denied = await app.inject({
          url: "/api/v1/devices",
          headers: { cookie: "sn_session=" + plainToken },
        });
        assert.equal(denied.statusCode, 403);
      },
    );
    await t.test(
      "Windows-Startpaket: gebündelter CLI paaren/starten, Diagnose, keine npm-Laufzeitabhängigkeit",
      { skip: process.platform !== "win32" },
      async () => {
        const local = await mkdtemp(join(tmpdir(), "shownight-cli-")),
          code = (await create("light")).code;
        const runtimeSource = existsSync("dist/agent-windows/node.exe")
          ? join(process.cwd(), "dist/agent-windows/node.exe")
          : process.execPath;
        const mainSource = existsSync("dist/agent-windows/main.js")
          ? join(process.cwd(), "dist/agent-windows/main.js")
          : join(process.cwd(), "dist/agent/main.js");
        const runtime = join(local, "node.exe"),
          main = join(local, "main.mjs");
        await copyFile(runtimeSource, runtime);
        await copyFile(mainSource, main);
        const setup = spawn(runtime, [main, "pair"], {
          cwd: local,
          env: { ...process.env, LOCALAPPDATA: local },
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        });
        let output = "",
          sentServer = false,
          sentCode = false;
        setup.stderr.resume();
        setup.stdout.on("data", (b) => {
          output += b.toString();
          if (!sentServer && output.includes("Serveradresse")) {
            sentServer = true;
            setup.stdin.write(server + "\n");
          }
          if (!sentCode && output.includes("Einmaliger Paarungscode")) {
            sentCode = true;
            setup.stdin.end(code + "\n");
          }
        });
        assert.equal(
          await new Promise<number | null>((r) => setup.once("close", r)),
          0,
        );
        const saved = await loadIdentity(join(local, "ShowNight/agent"));
        assert.equal(saved.profile, "light");
        const child = spawn(runtime, [main, "run"], {
          cwd: local,
          env: { ...process.env, LOCALAPPDATA: local },
          windowsHide: true,
          stdio: "ignore",
        });
        try {
          await until(async () =>
            (await devices()).some(
              (d: any) => d.id === saved.deviceId && d.connected,
            ),
          );
          const dispatchId = randomUUID();
          assert.equal(
            (
              await request(
                "/devices/" + saved.deviceId + "/diagnostics",
                "POST",
                { dispatchId, action: "diagnostics.ping" },
              )
            ).statusCode,
            200,
          );
          await until(async () =>
            (await devices())
              .find((d: any) => d.id === saved.deviceId)
              ?.receipts.some(
                (r: any) => r.id === dispatchId && r.status === "completed",
              ),
          );
          await request("/devices/" + saved.deviceId + "/revoke", "POST", {});
          assert.equal(
            await new Promise<number | null>((r) => child.once("close", r)),
            0,
          );
        } finally {
          if (child.exitCode === null) child.kill();
        }
      },
    );
    await t.test(
      "Migration 1 → 2 erhält bestehende Daten und ist wiederholbar",
      async () => {
        await f.pg.createDatabase("shownight_upgrade");
        const upgrade = database(
          cfg.DATABASE_URL.replace("shownight_test", "shownight_upgrade"),
        );
        try {
          await upgrade.query(
            await readFile("apps/api/migrations/001_core.sql", "utf8"),
          );
          const uid = randomUUID();
          await upgrade.query(
            "INSERT INTO users(id,login,display_name) VALUES($1,'migration-user','Erhalten')",
            [uid],
          );
          await migrate(upgrade);
          await migrate(upgrade);
          assert.equal(
            (
              await upgrade.query(
                "SELECT display_name FROM users WHERE id=$1",
                [uid],
              )
            ).rows[0].display_name,
            "Erhalten",
          );
          assert.deepEqual(
            (
              await upgrade.query(
                "SELECT version FROM schema_migrations ORDER BY version",
              )
            ).rows.map((r) => r.version),
            [1, 2],
          );
        } finally {
          await upgrade.end();
        }
      },
    );
  } finally {
    agent?.stop();
    await f.close();
  }
});
