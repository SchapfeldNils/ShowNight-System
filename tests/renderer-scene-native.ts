import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { randomUUID, createHash } from "node:crypto";
import {
  readFile,
  writeFile,
  readdir,
  unlink,
  mkdtemp,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";
import {
  sceneDefinition,
  type SceneDefinition,
  type SceneLayer,
  type SceneRecord,
} from "../packages/contracts/src/scene.js";
import type {
  RendererState,
  RendererSceneDescriptor,
  RendererMediaDescriptor,
} from "../packages/contracts/src/renderer.js";
import { RendererClient } from "../apps/local/src/renderer.js";
import { localServer } from "../apps/local/src/server.js";
import { rendererFixture } from "./renderer-fixture.js";
import { packageHeader } from "../packages/transfer/src/archive.js";
import { rendererBrowserProof } from "./renderer-browser.js";
import { scenePng, scenePixels } from "./native-scene-pixels.js";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const box = (
  kind: SceneLayer["kind"],
  x: number,
  y: number,
  width: number,
  height: number,
) => ({
  id: randomUUID(),
  name: "Synthetische Ebene",
  kind,
  x,
  y,
  width,
  height,
  opacity: 1,
  visible: true,
});
const rectangle = (
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  extra = {},
) => ({
  ...box("rectangle", x, y, width, height),
  kind: "rectangle" as const,
  color,
  ...extra,
});

export async function nativeSceneProof(
  t: TestContext,
  client: RendererClient,
  framesRoot: string,
  output: string,
) {
  const png = scenePng(32, 16, (x) =>
    x < 16 ? [255, 0, 0, 255] : [0, 0, 255, 255],
  );
  const yellow = scenePng(16, 16, () => [255, 255, 0, 255]);
  const temp = await mkdtemp(join(tmpdir(), "shownight-native-jpeg-"));
  const input = join(temp, "yellow.png"),
    jpegFile = join(temp, "yellow.jpg");
  await writeFile(input, yellow);
  assert.ok(ffmpeg);
  await promisify(execFile)(
    ffmpeg,
    [
      "-y",
      "-v",
      "error",
      "-i",
      input,
      "-frames:v",
      "1",
      "-c:v",
      "mjpeg",
      "-q:v",
      "2",
      "-pix_fmt",
      "yuvj444p",
      jpegFile,
    ],
    { windowsHide: true },
  );
  const jpeg = await readFile(jpegFile);
  const f = await rendererFixture([
    { name: "Synthetisches PNG", mime: "image/png", bytes: png },
    { name: "Synthetisches JPEG", mime: "image/jpeg", bytes: jpeg },
  ]);
  const pngId = f.manifest.media[0].id,
    jpegId = f.manifest.media[1].id;
  const definition = sceneDefinition.parse({
    name: "Native Ebenenprüfung",
    logicalWidth: 320,
    logicalHeight: 180,
    background: "#102030",
    layers: [
      rectangle(10, 10, 60, 40, "#ff0000", {
        id: "D45E8C7A-A701-42A4-BBF4-9263CFE424CC",
      }),
      rectangle(30, 20, 40, 40, "#0000ff", { opacity: 0.5 }),
      rectangle(10, 10, 60, 40, "#00ff00", { visible: false }),
      rectangle(-10, 70, 30, 20, "#00ffff"),
      {
        ...box("image", 100, 10, 40, 40),
        kind: "image",
        mediaId: pngId,
        fit: "contain",
      },
      {
        ...box("image", 150, 10, 20, 40),
        kind: "image",
        mediaId: pngId,
        fit: "cover",
      },
      {
        ...box("image", 190, 10, 40, 40),
        kind: "image",
        mediaId: jpegId,
        fit: "contain",
      },
      {
        ...box("image", 240, 10, 40, 40),
        kind: "image",
        mediaId: pngId,
        fit: "contain",
        opacity: 0.25,
      },
      {
        ...box("text", 10, 110, 60, 35),
        kind: "text",
        text: "Grüße aus ShowNight\nÄÖ",
        fontSize: 12,
        color: "#ffffff",
      },
    ],
  });
  const scene: SceneRecord = {
    id: randomUUID(),
    showId: randomUUID(),
    revision: 1,
    definition,
  };
  f.manifest.id = randomUUID();
  f.manifest.schemaVersion = 2;
  f.manifest.shows = [
    {
      id: scene.showId,
      name: "Synthetische Show",
      description: "",
      revision: 1,
      sourceShowId: null,
      sourceRevision: null,
      cues: [],
    },
  ];
  f.manifest.scenes = [scene];
  const archive = join(f.root, "scene.snpkg");
  await writeFile(
    archive,
    Buffer.concat([packageHeader(f.manifest).bytes, png, jpeg]),
  );
  await f.packages.importArchive(archive);
  f.snapshot.id = randomUUID();
  f.snapshot.sequence = 2;
  f.snapshot.packages = [
    {
      id: f.manifest.id,
      eventId: f.manifest.eventId,
      manifestSha: packageHeader(f.manifest).hash,
    },
  ];
  f.accounts.importSnapshot(f.snapshot);
  const app = await localServer(
    f.accounts,
    f.packages,
    "https://localhost:3443",
    undefined,
    undefined,
    false,
    client,
  );
  try {
    const login = await f.loginAdmin();
    const headers = {
      origin: "https://localhost:3443",
      "content-type": "application/json",
      cookie: "sn_local_session=" + login.session,
      "x-csrf-token": login.csrfToken,
    };
    const before = (await client.status()).state!;
    assert.equal(before.packageScenesSupported, true);
    const response = await app.inject({
      method: "POST",
      url: "/api/local/renderer/package-scene",
      headers,
      payload: {
        commandId: randomUUID(),
        expectedRevision: before.revision,
        action: "prepare-scene",
        packageId: f.manifest.id,
        sceneId: scene.id,
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    let state: RendererState = response.json();
    assert.equal(state.preview?.kind, "szene");
    assert.equal(state.preview?.packageScene?.sceneId, scene.id);
    assert.deepEqual(state.program, before.program);
    const rendered = await client.frame("preview"),
      pixels = scenePixels(rendered);
    assert.equal(pixels.width, 640);
    assert.equal(pixels.height, 360);
    const close = (actual: number[], expected: number[], tolerance = 1) =>
      actual.forEach((n, i) =>
        assert.ok(
          Math.abs(n - expected[i]) <= tolerance,
          `Pixel ${actual} expected ${expected}`,
        ),
      );
    close(pixels.at(2, 2), [16, 32, 48, 255]);
    close(pixels.at(30, 30), [255, 0, 0, 255]);
    close(pixels.at(80, 60), [127, 0, 128, 255]);
    close(pixels.at(2, 150), [0, 255, 255, 255]);
    close(pixels.at(45, 150), [16, 32, 48, 255]);
    close(pixels.at(210, 25), [16, 32, 48, 255]);
    close(pixels.at(210, 50), [255, 0, 0, 255]);
    close(pixels.at(270, 50), [0, 0, 255, 255]);
    close(pixels.at(295, 40), [16, 32, 48, 255]);
    close(pixels.at(305, 25), [255, 0, 0, 255]);
    close(pixels.at(335, 25), [0, 0, 255, 255]);
    close(pixels.at(345, 40), [16, 32, 48, 255]);
    close(pixels.at(400, 50), [255, 255, 0, 255], 8);
    close(pixels.at(490, 50), [76, 24, 36, 255], 2);
    for (const [top, bottom] of [
      [220, 250],
      [250, 280],
    ]) {
      let ink = 0;
      for (let y = top; y < bottom; ++y)
        for (let x = 20; x < 140; ++x) if (pixels.at(x, y)[0] > 100) ++ink;
      assert.ok(
        ink > 10,
        "Mehrzeiliger UTF8-Text erzeugt echte native Glyphen",
      );
    }
    for (let y = 220; y < 290; ++y)
      for (let x = 141; x < 170; ++x) close(pixels.at(x, y), [16, 32, 48, 255]);
    await writeFile(join(output, "paketszene-png-jpeg-text.png"), rendered);
    const session = (await readdir(framesRoot)).find((name) =>
      name.startsWith("session-"),
    )!;
    const stage = join(framesRoot, session),
      snapshot = join(
        stage,
        "scene-" + state.preview!.packageScene!.inputId + ".json",
      );
    const snapshotData = JSON.parse(await readFile(snapshot, "utf8"));
    assert.equal(
      snapshotData.images.length,
      2,
      "Mehrere Ebenen desselben Bildes teilen eine Ressource",
    );
    const imagePaths = snapshotData.images.map(
      (media: RendererMediaDescriptor) =>
        join(
          stage,
          "input-" +
            media.inputId +
            (media.mime === "image/jpeg" ? ".jpg" : ".png"),
        ),
    );
    for (const file of [snapshot, ...imagePaths]) {
      await assert.rejects(writeFile(file, Buffer.from("changed")));
      await assert.rejects(unlink(file));
    }
    state = await client.command({
      commandId: randomUUID(),
      expectedRevision: state.revision,
      action: "take",
      expectedSceneId: state.preview!.id,
    });
    assert.equal(sha(await client.frame("program")), sha(rendered));
    // A new preview must retain the independent immutable program composition.
    state = await client.command({
      commandId: randomUUID(),
      expectedRevision: state.revision,
      action: "prepare",
      scene: "grafik",
    });
    assert.equal(sha(await client.frame("program")), sha(rendered));
    for (const file of [snapshot, ...imagePaths])
      await assert.rejects(unlink(file));
    const raw = client as unknown as {
      request(
        type: "command",
        extra: { command: unknown },
      ): Promise<{ state: RendererState }>;
    };
    const manifestSha256 = packageHeader(f.manifest).hash;
    const rawFiles: string[] = [];
    async function snapshotCommand(
      def: SceneDefinition,
      images: RendererMediaDescriptor[] = [],
      options: { bytes?: Buffer; sha?: string; size?: number } = {},
    ) {
      const inputId = randomUUID();
      const bytes =
        options.bytes ??
        Buffer.from(
          JSON.stringify({
            schemaVersion: 1,
            scene: { ...scene, definition: def },
            images,
          }),
        );
      const file = join(stage, "scene-" + inputId + ".json");
      await writeFile(file, bytes);
      rawFiles.push(file);
      const descriptor: RendererSceneDescriptor = {
        inputId,
        packageId: f.manifest.id,
        sceneId: scene.id,
        sceneRevision: 1,
        manifestSha256,
        sha256: options.sha ?? sha(bytes),
        sizeBytes: options.size ?? bytes.length,
      };
      const current = (await client.status()).state!;
      return {
        commandId: randomUUID(),
        expectedRevision: current.revision,
        action: "prepare-scene",
        packageId: f.manifest.id,
        sceneId: scene.id,
        scene: descriptor,
      };
    }
    async function unchanged(command: unknown) {
      const before = (await client.status()).state!,
        preview = sha(await client.frame("preview")),
        program = sha(await client.frame("program"));
      await assert.rejects(raw.request("command", { command }));
      const after = (await client.status()).state!;
      assert.equal(after.revision, before.revision);
      assert.deepEqual(after.preview, before.preview);
      assert.deepEqual(after.program, before.program);
      assert.equal(sha(await client.frame("preview")), preview);
      assert.equal(sha(await client.frame("program")), program);
    }
    const empty: SceneDefinition = {
      name: "Synthetisch",
      logicalWidth: 200,
      logicalHeight: 200,
      background: "#00ff00",
      layers: [],
    };
    const square = await snapshotCommand(empty);
    state = (await raw.request("command", { command: square })).state;
    const squareRevision = state.revision;
    const squarePixels = scenePixels(await client.frame("preview"));
    close(squarePixels.at(139, 100), [0, 0, 0, 255]);
    close(squarePixels.at(140, 100), [0, 255, 0, 255]);
    close(squarePixels.at(499, 100), [0, 255, 0, 255]);
    close(squarePixels.at(500, 100), [0, 0, 0, 255]);
    await unchanged(await snapshotCommand(empty, [], { sha: "0".repeat(64) }));
    await unchanged(
      await snapshotCommand(empty, [], { bytes: Buffer.from("{malformed") }),
    );
    await unchanged(
      await snapshotCommand(empty, [], { size: 1024 * 1024 + 1 }),
    );
    await unchanged(
      await snapshotCommand({
        ...empty,
        layers: Array.from({ length: 65 }, () =>
          rectangle(0, 0, 1, 1, "#ffffff"),
        ),
      }),
    );
    await unchanged(await snapshotCommand({ ...empty, logicalWidth: 4097 }));
    await unchanged(
      await snapshotCommand({
        ...empty,
        layers: [
          {
            ...box("text", 0, 0, 10, 10),
            kind: "text",
            text: "x".repeat(2001),
            fontSize: 12,
            color: "#ffffff",
          },
        ],
      }),
    );
    await unchanged(
      await snapshotCommand({
        ...empty,
        layers: [
          rectangle(0, 0, 10, 10, "#ffffff"),
          rectangle(0, 0, 10, 10, "#ffffff", { id: "not-a-uuid" }),
        ],
      }),
    );
    const missingImage = {
      ...box("image", 0, 0, 10, 10),
      kind: "image" as const,
      mediaId: randomUUID(),
      fit: "contain" as const,
    };
    await unchanged(
      await snapshotCommand({ ...empty, layers: [missingImage] }),
    );
    const media = (
      bytes: Buffer,
      mime: "image/png" | "image/jpeg" = "image/png",
    ): RendererMediaDescriptor => ({
      inputId: randomUUID(),
      packageId: f.manifest.id,
      mediaId: randomUUID(),
      manifestSha256,
      sha256: sha(bytes),
      mime,
      sizeBytes: bytes.length,
    });
    async function writeImage(bytes: Buffer) {
      const descriptor = media(bytes);
      const file = join(stage, "input-" + descriptor.inputId + ".png");
      await writeFile(file, bytes);
      rawFiles.push(file);
      return descriptor;
    }
    const pngDescriptor = await writeImage(png);
    const imageLayer = (descriptor: RendererMediaDescriptor) => ({
      ...missingImage,
      id: randomUUID(),
      mediaId: descriptor.mediaId,
    });
    await unchanged(
      await snapshotCommand({ ...empty, layers: [imageLayer(pngDescriptor)] }, [
        { ...pngDescriptor, sha256: "0".repeat(64) },
      ]),
    );
    await unchanged(
      await snapshotCommand({ ...empty, layers: [imageLayer(pngDescriptor)] }, [
        { ...pngDescriptor, packageId: randomUUID() },
      ]),
    );
    await unchanged(
      await snapshotCommand({ ...empty, layers: [imageLayer(pngDescriptor)] }, [
        { ...pngDescriptor, manifestSha256: "0".repeat(64) },
      ]),
    );
    await unchanged(await snapshotCommand(empty, [pngDescriptor]));
    await unchanged(
      await snapshotCommand({ ...empty, layers: [imageLayer(pngDescriptor)] }, [
        pngDescriptor,
        pngDescriptor,
      ]),
    );
    const broken = await writeImage(png.subarray(0, 33));
    await unchanged(
      await snapshotCommand({ ...empty, layers: [imageLayer(broken)] }, [
        broken,
      ]),
    );
    // Exactly 64 MiB encoded input is accepted. An additional real PNG crosses
    // the scene-wide budget even though each file independently remains valid.
    const padded = Buffer.alloc(32 * 1024 * 1024);
    png.copy(padded);
    const rawA = await writeImage(padded),
      rawB = await writeImage(padded);
    const rawBoundary = await snapshotCommand(
      { ...empty, layers: [imageLayer(rawA), imageLayer(rawB)] },
      [rawA, rawB],
    );
    await raw.request("command", { command: rawBoundary });
    await unchanged(
      await snapshotCommand(
        {
          ...empty,
          layers: [
            imageLayer(rawA),
            imageLayer(rawB),
            imageLayer(pngDescriptor),
          ],
        },
        [rawA, rawB, pngDescriptor],
      ),
    );
    const large = scenePng(4096, 2048, () => [1, 2, 3, 255]);
    const largeA = await writeImage(large),
      largeB = await writeImage(large);
    const decodedBoundary = await snapshotCommand(
      { ...empty, layers: [imageLayer(largeA), imageLayer(largeB)] },
      [largeA, largeB],
    );
    await raw.request("command", { command: decodedBoundary });
    await unchanged(
      await snapshotCommand(
        {
          ...empty,
          layers: [
            imageLayer(largeA),
            imageLayer(largeB),
            imageLayer(pngDescriptor),
          ],
        },
        [largeA, largeB, pngDescriptor],
      ),
    );
    if (process.env.RENDERER_TEST_BROWSER === "true")
      await rendererBrowserProof(
        f.accounts,
        f.packages,
        client,
        login.session,
        f.manifest,
        output,
      );
    state = (await client.status()).state!;
    const cleared = await client.command({
      commandId: randomUUID(),
      expectedRevision: state.revision,
      action: "clear",
    });
    for (const file of [snapshot, ...imagePaths])
      await assert.rejects(readFile(file));
    for (const file of rawFiles) await unlink(file).catch(() => {});
    const duplicate = await raw.request("command", { command: square });
    assert.equal(
      duplicate.state.revision,
      squareRevision,
      "Receipt bleibt ohne erneutes Öffnen der bereits entfernten Snapshotdatei verfügbar",
    );
    assert.equal((await client.status()).state!.revision, cleared.revision);
    t.diagnostic(
      "Native PNG/JPEG/Text-Komposition, Pixel-/Letterbox-/Clipprüfung, immutable Take und rohe IPC-Fehler-/Budgetprüfungen ausgeführt; physische Ausgaben aus.",
    );
  } finally {
    await app.close();
    f.close();
  }
}
