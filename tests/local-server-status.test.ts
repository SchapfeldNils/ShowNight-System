import test from "node:test";
import assert from "node:assert/strict";
import { localServer } from "../apps/local/src/server.js";
import { rendererFixture } from "./renderer-fixture.js";
import { disabledRenderer } from "../apps/local/src/renderer.js";
import { unavailableWindowsIo } from "../apps/local/src/windows-io.js";

test("Serverübersicht: nur aktuelle Admin/MFA-Sitzung, no-store, keine privaten Konten oder Pfade", async () => {
  const f = await rendererFixture();
  let calls = 0;
  const app = await localServer(
    f.accounts,
    f.packages,
    "https://localhost:3443",
    undefined,
    undefined,
    false,
    disabledRenderer,
    async () => {
      calls++;
      return unavailableWindowsIo();
    },
  );
  const request = (session?: string) =>
    app.inject({
      url: "/api/local/server-status",
      headers: session ? { cookie: "sn_local_session=" + session } : {},
    });
  try {
    assert.equal((await request()).statusCode, 401);
    const member = await f.accounts.login("member", f.password);
    assert.ok("session" in member);
    assert.equal((await request(member.session)).statusCode, 403);
    assert.equal(calls, 0);
    const admin = await f.loginAdmin();
    const response = await request(admin.session);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.headers["cache-control"], "no-store");
    const data = response.json();
    assert.equal(calls, 1);
    assert.equal(data.service.liveEnabled, false);
    assert.equal(data.service.mailEnabled, false);
    assert.equal(data.preparation.accountSnapshotPrepared, true);
    assert.equal(data.renderer.physicalOutputEnabled, false);
    assert.equal(data.io.deviceActivationPerformed, false);
    assert.doesNotMatch(
      response.body,
      /password|csrf|session|server\.dpapi|accounts\.sqlite|LOCALAPPDATA/i,
    );
    assert.equal(response.body.includes(f.root), false);
    assert.equal(response.body.includes(f.password), false);
  } finally {
    await app.close();
    f.close();
  }
});

test("Serverübersicht revalidiert Rechte nach Geräteabfrage und versteckt Providerfehler", async () => {
  const f = await rendererFixture();
  let resolveProbe!: (value: ReturnType<typeof unavailableWindowsIo>) => void;
  let signal!: () => void;
  const started = new Promise<void>((resolve) => {
    signal = resolve;
  });
  let fail = true;
  const app = await localServer(
    f.accounts,
    f.packages,
    "https://localhost:3443",
    undefined,
    undefined,
    false,
    disabledRenderer,
    async () => {
      if (fail) throw new Error("privater Fehler C:/Benutzer/Geheimnis");
      signal();
      return new Promise((resolve) => {
        resolveProbe = resolve;
      });
    },
  );
  try {
    const admin = await f.loginAdmin();
    const response = await app.inject({
      url: "/api/local/server-status",
      headers: { cookie: "sn_local_session=" + admin.session },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().io.displays.status, "error");
    assert.doesNotMatch(response.body, /privater|Geheimnis|Benutzer/);
    fail = false;
    const pending = app
      .inject({
        url: "/api/local/server-status",
        headers: { cookie: "sn_local_session=" + admin.session },
      })
      .then((result) => result);
    await started;
    const actor = f.accounts.actor(admin.session);
    assert.ok(actor);
    f.accounts.logout(actor);
    resolveProbe(unavailableWindowsIo());
    assert.equal((await pending).statusCode, 401);
  } finally {
    await app.close();
    f.close();
  }
});
