import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  stageRendererScene,
  type RendererSceneSource,
} from "../apps/local/src/renderer-scene.js";
import {
  RendererClient,
  RendererFault,
  disabledRenderer,
} from "../apps/local/src/renderer.js";
import type { RendererState } from "../packages/contracts/src/renderer.js";
import {
  rendererSceneAction,
  rendererSceneSnapshot,
  type RendererSceneAction,
  type RendererSceneDescriptor,
} from "../packages/contracts/src/renderer-scene.js";
import { sceneRecord } from "../packages/contracts/src/scene.js";
import { rendererFixture } from "./renderer-fixture.js";
import { packageHeader } from "../packages/transfer/src/archive.js";
import { transferManifest } from "../packages/contracts/src/transfer.js";
import { localServer } from "../apps/local/src/server.js";
import { HttpError } from "../apps/api/src/errors.js";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function sourceFixture() {
  const root = await mkdtemp(join(tmpdir(), "shownight-scene-stage-"));
  const folder = join(root, "stage");
  await mkdir(folder);
  const packageId = randomUUID(),
    mediaId = randomUUID();
  const bytes = Buffer.from(
    "Synthetische PNG/JPEG-Vertragsbytes, kein Decoderbeleg",
  );
  const path = join(root, mediaId);
  await writeFile(path, bytes);
  const scene = sceneRecord.parse({
    id: randomUUID(),
    showId: randomUUID(),
    revision: 2,
    definition: {
      name: "Synthetische Paketszene",
      logicalWidth: 1920,
      logicalHeight: 1080,
      background: "#123456",
      layers: [
        {
          id: randomUUID(),
          name: "Bild",
          kind: "image",
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          opacity: 1,
          visible: false,
          mediaId,
          fit: "cover",
        },
        {
          id: randomUUID(),
          name: "Wiederverwendetes Bild",
          kind: "image",
          x: 10,
          y: 10,
          width: 200,
          height: 200,
          opacity: 0.5,
          visible: true,
          mediaId,
          fit: "contain",
        },
      ],
    },
  });
  const source: RendererSceneSource = {
    packageId,
    manifestSha256: "a".repeat(64),
    scene,
    images: [
      {
        root,
        path,
        media: {
          packageId,
          mediaId,
          manifestSha256: "a".repeat(64),
          sha256: sha(bytes),
          mime: "image/png",
          sizeBytes: bytes.length,
        },
      },
    ],
  };
  return { root, folder, bytes, source };
}

test("Szenenstaging: exakter Snapshot, nur eine Kopie je Bildreferenz und JPEG-Suffix", async () => {
  const f = await sourceFixture();
  const staged = await stageRendererScene(
    f.source,
    f.folder,
    randomUUID(),
    () => {},
  );
  const snapshotPath = staged.paths.find((path) => path.endsWith(".json"))!;
  const bytes = await readFile(snapshotPath);
  assert.equal(staged.descriptor.sha256, sha(bytes));
  assert.equal(staged.descriptor.sizeBytes, bytes.length);
  const snapshot = rendererSceneSnapshot.parse(
    JSON.parse(bytes.toString("utf8")),
  );
  assert.deepEqual(snapshot.scene, f.source.scene);
  assert.equal(snapshot.images.length, 1);
  assert.equal(staged.paths.length, 2);
  assert.deepEqual(
    await readFile(staged.paths.find((path) => path.endsWith(".png"))!),
    f.bytes,
  );
  const jpeg = structuredClone(f.source);
  jpeg.images[0].media.mime = "image/jpeg";
  const jpegStage = await stageRendererScene(
    jpeg,
    f.folder,
    randomUUID(),
    () => {},
  );
  assert.equal(
    jpegStage.paths.some((path) => path.endsWith(".jpg")),
    true,
  );
  assert.deepEqual(
    await readFile(jpegStage.paths.find((path) => path.endsWith(".jpg"))!),
    f.bytes,
  );
});

test("Szenenstaging: fehlerhafte Bindungen, Rohgrenzen und Pfadinput werden ohne Veröffentlichung verworfen", async () => {
  const f = await sourceFixture();
  const malformed = [
    { ...f.source, images: [] },
    { ...f.source, images: [...f.source.images, ...f.source.images] },
    {
      ...f.source,
      images: [
        {
          ...f.source.images[0],
          media: { ...f.source.images[0].media, packageId: randomUUID() },
        },
      ],
    },
    {
      ...f.source,
      images: [
        {
          ...f.source.images[0],
          media: {
            ...f.source.images[0].media,
            manifestSha256: "b".repeat(64),
          },
        },
      ],
    },
    {
      ...f.source,
      images: [
        {
          ...f.source.images[0],
          media: { ...f.source.images[0].media, mime: "video/webm" as const },
        },
      ],
    },
    {
      ...f.source,
      images: [
        {
          ...f.source.images[0],
          media: {
            ...f.source.images[0].media,
            sizeBytes: 32 * 1024 * 1024 + 1,
          },
        },
      ],
    },
  ];
  for (const source of malformed) {
    await assert.rejects(
      stageRendererScene(source, f.folder, randomUUID(), () => {}),
    );
    assert.deepEqual(await readdir(f.folder), []);
  }
  const tooLarge = structuredClone(f.source);
  const originalLayer = tooLarge.scene.definition.layers[0];
  tooLarge.images = Array.from({ length: 3 }, () => ({
    ...f.source.images[0],
    media: {
      ...f.source.images[0].media,
      mediaId: randomUUID(),
      sizeBytes: 32 * 1024 * 1024,
    },
  }));
  tooLarge.scene.definition.layers = tooLarge.images.map((image) => ({
    ...originalLayer,
    id: randomUUID(),
    kind: "image" as const,
    mediaId: image.media.mediaId,
    fit: "contain" as const,
  }));
  await assert.rejects(
    stageRendererScene(tooLarge, f.folder, randomUUID(), () => {}),
  );
  assert.deepEqual(await readdir(f.folder), []);
  for (const inputId of ["../escape", "bad", "C:/outside"])
    await assert.rejects(
      stageRendererScene(f.source, f.folder, inputId, () => {}),
    );
  const action = {
    commandId: randomUUID(),
    expectedRevision: 0,
    action: "prepare-scene",
    packageId: f.source.packageId,
    sceneId: f.source.scene.id,
  };
  for (const field of [
    "path",
    "scene",
    "definition",
    "images",
    "inputId",
    "uri",
    "shell",
  ])
    assert.equal(
      rendererSceneAction.safeParse({ ...action, [field]: "untrusted" })
        .success,
      false,
    );
});

test("Szenenstaging: Hashfehler und Rechtewiderruf räumen alle eigenen Kopien atomar auf", async () => {
  const f = await sourceFixture();
  await writeFile(f.source.images[0].path, Buffer.alloc(f.bytes.length, 1));
  await assert.rejects(
    stageRendererScene(f.source, f.folder, randomUUID(), () => {}),
    /MEDIA_CHANGED/,
  );
  assert.deepEqual(await readdir(f.folder), []);
  await writeFile(f.source.images[0].path, f.bytes);
  let calls = 0;
  await assert.rejects(
    stageRendererScene(f.source, f.folder, randomUUID(), () => {
      if (++calls === 8)
        throw new HttpError(401, "SESSION", "Synthetischer Widerruf.");
    }),
    (error) => error instanceof HttpError && error.status === 401,
  );
  assert.deepEqual(await readdir(f.folder), []);
});

// This replaces IPC, not staging, queueing, guards, receipt handling or cleanup.
// It proves the controller contract and explicitly does not prove native images.
async function controllerFixture() {
  const f = await sourceFixture();
  const client = new RendererClient("not-used-by-contract-adapter", f.root);
  const state: RendererState = {
    protocolVersion: 1,
    epoch: client.epoch,
    revision: 0,
    mode: "software-diagnostics",
    width: 640,
    height: 360,
    physicalOutputEnabled: false,
    audioOutputEnabled: false,
    preview: null,
    program: null,
    mediaError: false,
    packageMediaSupported: true,
    packageScenesSupported: true,
    gstreamerVersion: "contract-only",
    skiaRevision: "a".repeat(40),
  };
  const internals = client as unknown as {
    frames: string;
    last: RendererState | null;
    staged: Map<string, Set<string>>;
    request(
      type: string,
      extra?: Record<string, unknown>,
      guard?: () => void,
    ): Promise<{ state: RendererState; requestId: string }>;
    sceneCommands: Map<string, unknown>;
  };
  internals.frames = f.folder;
  let commands = 0;
  let outcome: "completed" | "failed" | "unknown" = "completed";
  internals.request = async (type, extra = {}, guard = () => {}) => {
    guard();
    if (type === "command") {
      ++commands;
      const command = extra.command as RendererSceneAction & {
        scene: RendererSceneDescriptor;
      };
      if (outcome === "unknown") {
        client.disconnect();
        throw new RendererFault(503, "UNKNOWN");
      }
      if (outcome === "failed") {
        internals.last = state;
        throw new RendererFault(409, "REVISION");
      }
      if (command.action === "prepare-scene") {
        const snapshot = rendererSceneSnapshot.parse(
          JSON.parse(
            await readFile(
              join(f.folder, "scene-" + command.scene.inputId + ".json"),
              "utf8",
            ),
          ),
        );
        assert.equal(snapshot.scene.id, f.source.scene.id);
        state.preview = {
          id: command.commandId,
          kind: "szene",
          videoFrames: 0,
          packageScene: command.scene,
        };
      } else {
        const action = extra.command as { action: string };
        if (action.action === "take")
          state.program = structuredClone(state.preview);
        if (action.action === "clear") {
          state.preview = null;
          state.program = null;
        }
      }
      ++state.revision;
    }
    internals.last = state;
    return { state, requestId: randomUUID() };
  };
  const action: RendererSceneAction = {
    commandId: randomUUID(),
    expectedRevision: 0,
    action: "prepare-scene",
    packageId: f.source.packageId,
    sceneId: f.source.scene.id,
  };
  return {
    ...f,
    client,
    state,
    internals,
    action,
    commands: () => commands,
    setOutcome(value: typeof outcome) {
      outcome = value;
    },
  };
}

test("Szenencontroller: Deduplizierung ohne Staging/Replay, Konflikte und gepinnte Vorschau/Programmgruppen", async () => {
  const f = await controllerFixture();
  try {
    const first = await f.client.prepareScene(f.action, f.source, () => {});
    assert.equal(first.revision, 1);
    const before = await readdir(f.folder);
    await f.client.prepareScene(f.action, f.source, () => {});
    assert.equal(f.commands(), 1);
    assert.deepEqual(await readdir(f.folder), before);
    await assert.rejects(
      f.client.prepareScene(
        { ...f.action, expectedRevision: 99 },
        f.source,
        () => {},
      ),
      (error) => error instanceof RendererFault && error.status === 409,
    );
    assert.equal(f.commands(), 1);
    await f.client.command(
      {
        commandId: randomUUID(),
        action: "take",
        expectedRevision: 1,
        expectedSceneId: f.action.commandId,
      },
      () => {},
    );
    await f.client.prepareScene(
      { ...f.action, commandId: randomUUID(), expectedRevision: 2 },
      f.source,
      () => {},
    );
    assert.equal(f.internals.staged.size, 2);
    assert.equal((await readdir(f.folder)).length, 4);
    await f.client.command(
      { commandId: randomUUID(), expectedRevision: 3, action: "clear" },
      () => {},
    );
    assert.deepEqual(await readdir(f.folder), []);
    assert.equal(f.internals.staged.size, 0);
  } finally {
    await f.client.close();
  }
});

test("Szenencontroller: bestätigte Fehler bleiben Fehler, Unknown hält Kopien und sendet nicht erneut", async () => {
  const f = await controllerFixture();
  try {
    f.setOutcome("failed");
    await assert.rejects(
      f.client.prepareScene(f.action, f.source, () => {}),
      (error) => error instanceof RendererFault && error.status === 409,
    );
    assert.deepEqual(await readdir(f.folder), []);
    await assert.rejects(
      f.client.prepareScene(f.action, f.source, () => {}),
      (error) => error instanceof RendererFault && error.status === 409,
    );
    assert.equal(f.commands(), 1);
    f.setOutcome("unknown");
    const unknownAction = { ...f.action, commandId: randomUUID() };
    await assert.rejects(
      f.client.prepareScene(unknownAction, f.source, () => {}),
      (error) => error instanceof RendererFault && error.code === "UNKNOWN",
    );
    const retained = await readdir(f.folder);
    assert.equal(retained.length, 2);
    await assert.rejects(
      f.client.prepareScene(unknownAction, f.source, () => {}),
      (error) => error instanceof RendererFault && error.code === "UNKNOWN",
    );
    assert.equal(f.commands(), 2);
    assert.deepEqual(await readdir(f.folder), retained);
  } finally {
    await f.client.close();
  }
  assert.deepEqual(await readdir(f.folder), []);
});

test("Szenencontroller: Capability, Cachegrenze und neuer Guard verhindern Versand", async () => {
  const f = await controllerFixture();
  try {
    f.state.packageScenesSupported = false;
    await assert.rejects(
      f.client.prepareScene(f.action, f.source, () => {}),
      (error) => error instanceof RendererFault && error.code === "UNSUPPORTED",
    );
    assert.deepEqual(await readdir(f.folder), []);
    f.state.packageScenesSupported = true;
    await f.client.prepareScene(f.action, f.source, () => {});
    await assert.rejects(
      f.client.prepareScene(f.action, f.source, () => {
        throw new HttpError(401, "SESSION", "Widerrufen.");
      }),
      (error) => error instanceof HttpError && error.status === 401,
    );
    assert.equal(f.commands(), 1);
    for (let i = f.internals.sceneCommands.size; i < 1024; i++)
      f.internals.sceneCommands.set(randomUUID(), {});
    await assert.rejects(
      f.client.prepareScene(
        { ...f.action, commandId: randomUUID() },
        f.source,
        () => {},
      ),
      (error) => error instanceof RendererFault && error.code === "LIMIT",
    );
    assert.equal(f.commands(), 1);
  } finally {
    await f.client.close();
  }
});

test("Szenencontroller: Widerruf unmittelbar vor Versand entfernt ungesendete Gruppe und Receipt", async () => {
  const f = await controllerFixture();
  try {
    await assert.rejects(
      f.client.prepareScene(f.action, f.source, () => {
        if (f.internals.sceneCommands.has(f.action.commandId))
          throw new HttpError(401, "SESSION", "Vor Versand widerrufen.");
      }),
      (error) => error instanceof HttpError && error.status === 401,
    );
    assert.equal(f.commands(), 0);
    assert.equal(f.internals.sceneCommands.size, 0);
    assert.equal(f.internals.staged.size, 0);
    assert.deepEqual(await readdir(f.folder), []);
    await f.client.prepareScene(f.action, f.source, () => {});
    assert.equal(f.commands(), 1);
  } finally {
    await f.client.close();
  }
});

test("Paketszenen-HTTP: echte SQLite/MFA-Bindung, Rechte, keine Browserdefinition und spätere Widerrufe", async () => {
  const bytes = Buffer.from("synthetische Paketbildbytes");
  const f = await rendererFixture([
    { name: "Synthetisches JPEG", mime: "image/jpeg", bytes },
  ]);
  const scene = sceneRecord.parse({
    id: randomUUID(),
    showId: randomUUID(),
    revision: 1,
    definition: {
      name: "Synthetische HTTP-Szene",
      logicalWidth: 1920,
      logicalHeight: 1080,
      background: "#000000",
      layers: [
        {
          id: randomUUID(),
          name: "Bild",
          kind: "image",
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          opacity: 1,
          visible: true,
          mediaId: f.manifest.media[0].id,
          fit: "contain",
        },
      ],
    },
  });
  const manifest = transferManifest.parse({
    ...f.manifest,
    schemaVersion: 2,
    id: randomUUID(),
    scenes: [scene],
    shows: [
      {
        id: scene.showId,
        name: "Synthetische Show",
        description: "",
        revision: 1,
        sourceShowId: null,
        sourceRevision: null,
        cues: [
          {
            id: randomUUID(),
            name: "Synthetischer Einsatz",
            sceneId: scene.id,
          },
        ],
      },
    ],
  });
  const archive = join(f.root, "scene.snpkg");
  await writeFile(
    archive,
    Buffer.concat([packageHeader(manifest).bytes, bytes]),
  );
  await f.packages.importArchive(archive);
  f.accounts.importSnapshot({
    ...f.snapshot,
    id: randomUUID(),
    sequence: 2,
    packages: [
      ...f.snapshot.packages,
      {
        id: manifest.id,
        eventId: manifest.eventId,
        manifestSha: packageHeader(manifest).hash,
      },
    ],
  });
  const folder = join(f.root, "scene-stage");
  await mkdir(folder);
  let calls = 0,
    revoke = false;
  const adapter = {
    ...disabledRenderer,
    async prepareScene(
      _action: RendererSceneAction,
      source: RendererSceneSource,
      guard: () => void,
    ) {
      try {
        await stageRendererScene(source, folder, randomUUID(), guard);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new RendererFault(409, "SCENE");
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
        packageScenesSupported: true,
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
  const session = await f.loginAdmin();
  const headers = {
    origin: "https://localhost:3443",
    cookie: "sn_local_session=" + session.session,
    "x-csrf-token": session.csrfToken,
  };
  const action: RendererSceneAction = {
    commandId: randomUUID(),
    expectedRevision: 0,
    action: "prepare-scene",
    packageId: manifest.id,
    sceneId: scene.id,
  };
  const call = (payload: unknown = action, h = headers) =>
    app.inject({
      method: "POST",
      url: "/api/local/renderer/package-scene",
      headers: h,
      payload: payload as object,
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
      (await call(action, { ...headers, origin: "https://untrusted.example" }))
        .statusCode,
      403,
    );
    assert.equal(
      (await call({ ...action, packageId: randomUUID() })).statusCode,
      404,
    );
    assert.equal(
      (await call({ ...action, sceneId: randomUUID() })).statusCode,
      404,
    );
    assert.equal(
      (await call({ ...action, packageId: f.manifest.id })).statusCode,
      404,
    );
    assert.equal(
      (await call({ ...action, scene: scene.definition })).statusCode,
      400,
    );
    assert.equal((await call()).statusCode, 200);
    assert.equal(calls, 1);
    const original = f.packages.file(manifest.id, manifest.media[0].id);
    await writeFile(original.path, Buffer.alloc(bytes.length, 1));
    assert.equal((await call()).statusCode, 409);
    assert.equal(calls, 1);
    await writeFile(original.path, bytes);
    revoke = true;
    assert.equal((await call()).statusCode, 401);
    assert.equal(calls, 1);
  } finally {
    await app.close();
    f.close();
  }
});
