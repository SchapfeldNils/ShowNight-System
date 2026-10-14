import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { rendererFixture } from "./renderer-fixture.js";
import { stageRendererMedia } from "../apps/local/src/renderer-media.js";
import { disabledRenderer, RendererFault } from "../apps/local/src/renderer.js";
import {
  rendererPackageAction,
  rendererMediaDescriptor,
} from "../packages/contracts/src/renderer.js";
import { localServer } from "../apps/local/src/server.js";
import { HttpError } from "../apps/api/src/errors.js";

test("Paketdiagnose kopiert unveränderte Bytes und verwirft Änderungen, Übergröße und verlorene Rechte", async () => {
  const root = await mkdtemp(join(tmpdir(), "shownight-media-stage-"));
  const stage = join(root, "stage");
  await mkdir(stage);
  const bytes = Buffer.from("synthetischer Vertragsinhalt");
  const path = join(root, "medium");
  await writeFile(path, bytes);
  const media = {
    packageId: randomUUID(),
    mediaId: randomUUID(),
    manifestSha256: "a".repeat(64),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.length,
    mime: "image/png" as const,
  };
  const source = { root, path, media };
  const inputId = randomUUID();
  const copied = await stageRendererMedia(source, stage, inputId, () => {});
  assert.deepEqual(await readFile(copied.path), bytes);
  assert.equal(copied.media.inputId, inputId);
  await writeFile(path, Buffer.alloc(bytes.length, 42));
  await assert.rejects(
    stageRendererMedia(source, stage, randomUUID(), () => {}),
    /MEDIA_CHANGED/,
  );
  await writeFile(path, bytes);
  const before = await readdir(stage);
  let guards = 0;
  await assert.rejects(
    stageRendererMedia(source, stage, randomUUID(), () => {
      if (++guards === 3)
        throw new HttpError(401, "SESSION", "Synthetisch widerrufen.");
    }),
    (e) => e instanceof HttpError && e.status === 401,
  );
  assert.deepEqual(await readdir(stage), before);
  assert.equal(
    rendererMediaDescriptor.safeParse({
      ...media,
      inputId,
      sizeBytes: 32 * 1024 * 1024 + 1,
    }).success,
    false,
  );
  const action = {
    commandId: randomUUID(),
    expectedRevision: 0,
    action: "prepare-package",
    packageId: media.packageId,
    mediaId: media.mediaId,
  };
  for (const key of ["path", "uri", "shell", "inputId", "mime", "media"])
    assert.equal(
      rendererPackageAction.safeParse({ ...action, [key]: "untrusted" })
        .success,
      false,
    );
  await assert.rejects(
    stageRendererMedia(
      { ...source, root: stage },
      stage,
      randomUUID(),
      () => {},
    ),
    /MEDIA_CHANGED/,
  );
});

test("Paketdiagnose verlangt aktuelle Adminrechte UND gebundene Pakete; Vertragsadapter bestätigt keine native Wiedergabe", async () => {
  const f = await rendererFixture([
    {
      name: "Synthetisches PNG",
      mime: "image/png",
      bytes: Buffer.from("nur Vertragsbytes"),
    },
    {
      name: "Synthetisches MP4",
      mime: "video/mp4",
      bytes: Buffer.from("nicht unterstützt"),
    },
  ]);
  const dir = join(f.root, "stage");
  await mkdir(dir);
  let calls = 0,
    revoke = false;
  const adapter = {
    ...disabledRenderer,
    async prepareMedia(_action: any, source: any, guard: () => void) {
      try {
        await stageRendererMedia(source, dir, randomUUID(), guard);
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new RendererFault(409, "MEDIA");
      }
      if (revoke)
        f.accounts.block(f.accounts.actor(session.session)!, f.adminId, true);
      guard();
      ++calls;
      return {
        protocolVersion: 1 as const,
        epoch: randomUUID(),
        revision: 1,
        mode: "software-diagnostics" as const,
        width: 640 as const,
        height: 360 as const,
        physicalOutputEnabled: false as const,
        audioOutputEnabled: false as const,
        preview: null,
        program: null,
        mediaError: false,
        gstreamerVersion: "contract-only",
        skiaRevision: "a".repeat(40),
      };
    },
  };
  const app = await localServer(
    f.accounts,
    f.packages,
    "https://localhost:3443",
    undefined,
    undefined,
    false,
    adapter,
  );
  const session = await f.loginAdmin(),
    cookie = "sn_local_session=" + session.session;
  const headers = {
    origin: "https://localhost:3443",
    cookie,
    "x-csrf-token": session.csrfToken,
  };
  const action = {
    commandId: randomUUID(),
    expectedRevision: 0,
    action: "prepare-package",
    packageId: f.manifest.id,
    mediaId: f.manifest.media[0].id,
  };
  const call = (payload = action, h = headers) =>
    app.inject({
      method: "POST",
      url: "/api/local/renderer/package-media",
      payload,
      headers: h,
    });
  try {
    assert.equal(
      (await call(action, { ...headers, cookie: "" })).statusCode,
      401,
    );
    const member = await f.accounts.login("member", f.password);
    assert.ok("session" in member);
    assert.equal(
      (
        await call(action, {
          ...headers,
          cookie: "sn_local_session=" + member.session,
          "x-csrf-token": member.csrfToken,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await call(action, { ...headers, "x-csrf-token": "" })).statusCode,
      403,
    );
    assert.equal(
      (await call({ ...action, packageId: randomUUID() })).statusCode,
      404,
    );
    assert.equal(
      (await call({ ...action, mediaId: randomUUID() })).statusCode,
      404,
    );
    assert.equal(
      (await call({ ...action, mediaId: f.manifest.media[1].id })).statusCode,
      422,
    );
    assert.equal(
      (await call({ ...action, path: "C:/untrusted" } as any)).statusCode,
      400,
    );
    const accepted = await call();
    assert.equal(accepted.statusCode, 200);
    assert.equal(calls, 1);
    assert.match(
      String(accepted.headers["content-security-policy"]),
      /img-src[^;]*blob:/,
    );
    const file = f.packages.file(action.packageId, action.mediaId);
    await writeFile(file.path, Buffer.alloc(file.media.sizeBytes, 55));
    assert.equal((await call()).statusCode, 409);
    assert.equal(calls, 1);
    await writeFile(file.path, Buffer.from("nur Vertragsbytes"));
    revoke = true;
    assert.equal((await call()).statusCode, 401);
    assert.equal(calls, 1);
  } finally {
    await app.close();
    f.close();
  }
});
