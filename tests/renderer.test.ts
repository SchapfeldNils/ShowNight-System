import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rendererAction,
  rendererState,
} from "../packages/contracts/src/renderer.js";
import { localServer } from "../apps/local/src/server.js";
import { rendererFixture } from "./renderer-fixture.js";
test("Renderervertrag: kein Pfad, Gerät, URI oder physische Ausgabe in Diagnosenachrichten", () => {
  const c = {
    commandId: randomUUID(),
    expectedRevision: 0,
    action: "prepare",
    scene: "grafik",
  };
  assert.equal(rendererAction.safeParse(c).success, true);
  for (const key of ["path", "uri", "device", "shell", "physicalOutputEnabled"])
    assert.equal(
      rendererAction.safeParse({ ...c, [key]: "untrusted" }).success,
      false,
    );
  assert.equal(
    rendererAction.safeParse({ ...c, expectedRevision: -1 }).success,
    false,
  );
  assert.equal(rendererAction.safeParse({ ...c, action: "go" }).success, false);
  assert.equal(
    rendererState.safeParse({ physicalOutputEnabled: true }).success,
    false,
  );
});
test("Lokale Rendererdiagnose verlangt aktuelle Admin-/MFA-Sitzung und Origin/CSRF auch ohne Nativepaket", async () => {
  const f = await rendererFixture(),
    app = await localServer(f.accounts, f.packages, "https://localhost:3443");
  const call = (
    url: string,
    method = "GET",
    payload?: any,
    headers?: Record<string, string>,
  ) =>
    app.inject({
      url: "/api/local" + url,
      method: method as any,
      headers: { origin: "https://localhost:3443", ...headers },
      ...(payload === undefined ? {} : { payload }),
    });
  try {
    assert.equal((await call("/renderer")).statusCode, 401);
    const first = await call("/auth/login", "POST", {
      login: "admin",
      password: f.password,
    });
    assert.ok(first.json().challenge);
    assert.equal(first.cookies.length, 0);
    assert.equal((await call("/renderer")).statusCode, 401);
    const member = await f.accounts.login("member", f.password);
    assert.ok("session" in member);
    const mc = "sn_local_session=" + member.session;
    assert.equal(
      (await call("/renderer", "GET", undefined, { cookie: mc })).statusCode,
      403,
    );
    assert.equal(
      (await call("/renderer/frames/program", "GET", undefined, { cookie: mc }))
        .statusCode,
      403,
    );
    const a = await f.loginAdmin(),
      cookie = "sn_local_session=" + a.session;
    const report = await call("/renderer", "GET", undefined, { cookie });
    assert.equal(report.statusCode, 200);
    assert.equal(report.json().availability, "disabled");
    const body = {
      commandId: randomUUID(),
      expectedRevision: 0,
      action: "clear",
    };
    assert.equal(
      (await call("/renderer/test", "POST", body, { cookie })).statusCode,
      403,
    );
    const headers = { cookie, "x-csrf-token": a.csrfToken };
    assert.equal(
      (
        await call("/renderer/test", "POST", body, {
          ...headers,
          origin: "https://untrusted.example",
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await call("/renderer/test", "POST", { ...body, action: "go" }, headers))
        .statusCode,
      400,
    );
    assert.equal(
      (await call("/renderer/test", "POST", body, headers)).statusCode,
      503,
    );
    assert.equal(
      (await call("/renderer/frames/unknown", "GET", undefined, headers))
        .statusCode,
      404,
    );
    f.accounts.block(f.accounts.actor(a.session)!, f.adminId, true);
    assert.equal(
      (await call("/renderer", "GET", undefined, headers)).statusCode,
      401,
    );
  } finally {
    await app.close();
    f.close();
  }
});
