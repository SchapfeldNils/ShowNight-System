import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rendererSceneAction,
  rendererSceneSnapshot,
  rendererSceneDescriptor,
  rendererSceneLimits,
} from "../packages/contracts/src/renderer-scene.js";

test("Szenenvertrag: große gültige Unicode-Szene passt in Snapshot statt IPC; keine Browserdefinition oder Pfade", () => {
  const sceneId = randomUUID(),
    packageId = randomUUID();
  const command = {
    commandId: randomUUID(),
    expectedRevision: 2,
    action: "prepare-scene",
    packageId,
    sceneId,
  };
  assert.ok(rendererSceneAction.safeParse(command).success);
  for (const extra of [
    { definition: {} },
    { path: "C:/outside.json" },
    { scene: {} },
    { uri: "https://example.test" },
    { physicalOutputEnabled: true },
  ])
    assert.equal(
      rendererSceneAction.safeParse({ ...command, ...extra }).success,
      false,
    );
  const scene = {
    id: sceneId,
    showId: randomUUID(),
    revision: 4,
    definition: {
      name: "Synthetische große Szene",
      logicalWidth: 1920,
      logicalHeight: 1080,
      background: "#000000",
      layers: Array.from({ length: 64 }, () => ({
        id: randomUUID(),
        name: "Text",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        opacity: 1,
        visible: true,
        kind: "text",
        text: "💡".repeat(1000),
        fontSize: 24,
        color: "#ffffff",
      })),
    },
  };
  const snapshot = rendererSceneSnapshot.parse({
    schemaVersion: 1,
    scene,
    images: [],
  });
  const sizeBytes = Buffer.byteLength(JSON.stringify(snapshot));
  assert.ok(
    sizeBytes > 16384,
    "Die vollständige Szene darf nicht als IPC-Nachricht übertragen werden.",
  );
  assert.ok(sizeBytes <= rendererSceneLimits.snapshotBytes);
  const descriptor = rendererSceneDescriptor.parse({
    inputId: randomUUID(),
    packageId,
    sceneId,
    sceneRevision: 4,
    manifestSha256: "a".repeat(64),
    sha256: "b".repeat(64),
    sizeBytes,
  });
  assert.ok(
    Buffer.byteLength(JSON.stringify({ ...command, scene: descriptor })) <
      16384,
  );
  assert.equal(
    rendererSceneDescriptor.safeParse({
      ...descriptor,
      sizeBytes: rendererSceneLimits.snapshotBytes + 1,
    }).success,
    false,
  );
});

test("Szenensnapshot bindet Bilder genau und dedupliziert; fremde Paketstände und Summenlimit werden abgelehnt", () => {
  const mediaId = randomUUID();
  const image = {
    inputId: randomUUID(),
    packageId: randomUUID(),
    mediaId,
    manifestSha256: "a".repeat(64),
    sha256: "b".repeat(64),
    mime: "image/jpeg",
    sizeBytes: 100,
  };
  const layer = {
    id: randomUUID(),
    name: "Bild",
    kind: "image",
    mediaId,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    opacity: 1,
    visible: true,
    fit: "cover",
  };
  const scene = {
    id: randomUUID(),
    showId: randomUUID(),
    revision: 1,
    definition: {
      name: "Bildszene",
      logicalWidth: 100,
      logicalHeight: 100,
      background: "#000000",
      layers: [layer, { ...layer, id: randomUUID(), visible: false }],
    },
  };
  const snapshot = { schemaVersion: 1, scene, images: [image] };
  assert.ok(
    rendererSceneSnapshot.safeParse(snapshot).success,
    "Auch zwei Ebenen teilen exakt eine Bildkopie.",
  );
  for (const images of [
    [],
    [image, image],
    [{ ...image, mediaId: randomUUID() }],
    [{ ...image, mime: "video/webm" }],
  ])
    assert.equal(
      rendererSceneSnapshot.safeParse({ ...snapshot, images }).success,
      false,
    );
  const images = Array.from({ length: 3 }, () => ({
    ...image,
    inputId: randomUUID(),
    mediaId: randomUUID(),
    sizeBytes: rendererSceneLimits.imageBytes,
  }));
  const sceneWithThreeImages = {
    ...scene,
    definition: {
      ...scene.definition,
      layers: images.map((m) => ({
        ...layer,
        id: randomUUID(),
        mediaId: m.mediaId,
      })),
    },
  };
  assert.equal(
    rendererSceneSnapshot.safeParse({
      ...snapshot,
      scene: sceneWithThreeImages,
      images,
    }).success,
    false,
  );
  const small = images.map((m) => ({ ...m, sizeBytes: 100 }));
  assert.ok(
    rendererSceneSnapshot.safeParse({
      ...snapshot,
      scene: sceneWithThreeImages,
      images: small,
    }).success,
  );
  for (const key of ["packageId", "manifestSha256"] as const) {
    const mixed = small.map((m, index) =>
      index
        ? m
        : { ...m, [key]: key === "packageId" ? randomUUID() : "c".repeat(64) },
    );
    assert.equal(
      rendererSceneSnapshot.safeParse({
        ...snapshot,
        scene: sceneWithThreeImages,
        images: mixed,
      }).success,
      false,
    );
  }
});
