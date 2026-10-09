import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { DatabaseSync } from "node:sqlite";
import { startAgent } from "../apps/agent/src/client.js";
import { agentDispatch } from "../packages/contracts/src/agent.js";
import { Ledger } from "../apps/agent/src/ledger.js";
import {
  serverAddress,
  secureDirectory,
  saveIdentity,
  loadIdentity,
} from "../apps/agent/src/identity.js";
import { virtualDjClock } from "../apps/agent/src/virtualdj.js";
const dispatch = () =>
  agentDispatch.parse({
    type: "dispatch",
    protocolVersion: 1,
    dispatchId: randomUUID(),
    commandId: randomUUID(),
    deviceId: randomUUID(),
    authorityId: "online-diagnostics",
    authorityEpoch: randomUUID(),
    adapter: "diagnostics",
    action: "diagnostics.ping",
    parameters: {},
    simulated: false,
  });
test("Agent verwirft fremde Epoch über echte Socketverbindung vor Journal/Ausführung", async () => {
  const dir = await mkdtemp(join(tmpdir(), "shownight-fence-")),
    identity = {
      server: "",
      deviceId: randomUUID(),
      profile: "dj" as const,
      credential: randomBytes(32).toString("base64url"),
    };
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.once("listening", r));
  identity.server =
    "http://127.0.0.1:" + (server.address() as { port: number }).port;
  const rejected = new Promise<number>((resolve) =>
    server.once("connection", (socket) => {
      socket.once("message", () => {
        const epoch = randomUUID();
        socket.send(
          JSON.stringify({
            type: "welcome",
            protocolVersion: 1,
            authorityId: "online-diagnostics",
            authorityEpoch: epoch,
            deviceId: identity.deviceId,
            profile: "dj",
            heartbeatMs: 5000,
            mode: "diagnostics-only",
          }),
        );
        socket.send(
          JSON.stringify({
            ...dispatch(),
            deviceId: identity.deviceId,
            authorityEpoch: randomUUID(),
          }),
        );
      });
      socket.once("close", (code) => resolve(code));
    }),
  );
  const agent = startAgent(identity, dir);
  try {
    assert.equal(await rejected, 1008);
  } finally {
    agent.stop();
    await new Promise<void>((r) => server.close(() => r()));
  }
  const ledger = new DatabaseSync(join(dir, "receipts.sqlite"));
  assert.equal(ledger.prepare("SELECT count(*) n FROM receipts").get()!.n, 0);
  ledger.close();
});
test("Agentjournal: Neustart verhindert Wiederholung unklarer Effekte; Inhalt und Herkunft gefenced", async () => {
  const dir = await mkdtemp(join(tmpdir(), "shownight-ledger-")),
    path = join(dir, "receipts.sqlite"),
    d = dispatch();
  let ledger = new Ledger(path);
  assert.equal(ledger.accept(d).duplicate, false);
  assert.equal(ledger.accept(d).duplicate, true);
  assert.throws(() =>
    ledger.accept({ ...d, action: "simulator.noop", simulated: true }),
  );
  ledger.close();
  ledger = new Ledger(path);
  const r = ledger.accept(d);
  assert.equal(r.duplicate, true);
  assert.equal(r.receipt.status, "unknown");
  assert.throws(() => ledger.complete(d));
  const completed = dispatch();
  ledger.accept(completed);
  ledger.complete(completed);
  ledger.close();
  ledger = new Ledger(path);
  assert.equal(ledger.accept(completed).receipt.status, "completed");
  assert.throws(() =>
    ledger.accept({ ...completed, authorityEpoch: randomUUID() }),
  );
  ledger.close();
  assert(!agentDispatch.safeParse({ ...d, action: "play" }).success);
  assert(!agentDispatch.safeParse({ ...d, authorityId: "local-live" }).success);
  assert(!agentDispatch.safeParse({ ...d, protocolVersion: 2 }).success);
  assert(
    !agentDispatch.safeParse({ ...d, parameters: { script: "play" } }).success,
  );
  assert.equal(
    serverAddress("http://127.0.0.1:3210/"),
    "http://127.0.0.1:3210",
  );
  for (const value of [
    "http://example.com",
    "https://example.com/token?x=1",
    "https://user:secret@example.com",
    "https://example.com/#foo",
  ])
    assert.throws(() => serverAddress(value));
});
test(
  "Windows-Identität: eingeschränkte ACL, DPAPI-Roundtrip, keine Klartextdatei, kein Überschreiben",
  { skip: process.platform !== "win32" },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "shownight-dpapi-"));
    const acl = await secureDirectory(dir);
    assert.match(acl, /^D:P/);
    assert.equal((acl.match(/\(A;OICI;FA;;;/g) ?? []).length, 2);
    assert(acl.includes(";;;SY)"));
    assert.match(acl, /\(A;OICI;FA;;;S-1-[^)]+\)/);
    const identity = {
      server: "https://example.invalid",
      deviceId: randomUUID(),
      profile: "dj" as const,
      credential: randomBytes(32).toString("base64url"),
    };
    await saveIdentity(dir, identity);
    assert.deepEqual(await loadIdentity(dir), identity);
    assert(
      !(await readFile(join(dir, "identity.dpapi"), "utf8")).includes(
        identity.credential,
      ),
    );
    await assert.rejects(() => saveIdentity(dir, identity));
    await writeFile(join(dir, "identity.dpapi"), "corrupted");
    await assert.rejects(() => loadIdentity(dir));
  },
);
test("VirtualDJ-Leseadapter: dokumentiertes POST/query, Bearer nur im Header, kein execute/Redirect", async () => {
  let calls = 0;
  const secret = randomBytes(16).toString("hex");
  const server = createServer(async (req, res) => {
    calls++;
    assert.equal(req.url, "/query");
    assert.equal(req.method, "POST");
    assert.equal(req.headers.authorization, "Bearer " + secret);
    let body = "";
    for await (const chunk of req) body += chunk;
    assert.equal(body, "get_clock");
    if (calls === 1) res.end("20:31:00");
    else if (calls === 2) {
      res.writeHead(302, { Location: "http://127.0.0.1:1/execute" });
      res.end();
    } else res.end("x".repeat(1025));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  try {
    assert.equal(
      (await virtualDjClock(port, secret)).physicalPlaybackProven,
      false,
    );
    await assert.rejects(() => virtualDjClock(port, secret));
    await assert.rejects(() => virtualDjClock(port, secret));
    assert.equal(calls, 3);
    await assert.rejects(() => virtualDjClock(port, "x\r\ny"));
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
