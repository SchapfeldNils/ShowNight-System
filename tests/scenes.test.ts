import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sceneDefinition } from "../packages/contracts/src/scene.js";
import { transferManifest } from "../packages/contracts/src/transfer.js";

test("Szenen: strikte Typen, Ebenengrenzen und Paketversion/-referenzen", () => {
  const showId = randomUUID(),
    sceneId = randomUUID(),
    mediaId = randomUUID();
  const layer = {
    id: randomUUID(),
    name: "Bild",
    kind: "image",
    mediaId,
    fit: "contain",
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    opacity: 1,
    visible: true,
  };
  const definition = {
    name: "Szene",
    logicalWidth: 1920,
    logicalHeight: 1080,
    background: "#000000",
    layers: [layer],
  };
  assert.ok(sceneDefinition.safeParse(definition).success);
  for (const bad of [
    { ...definition, path: "C:/private.png" },
    { ...definition, layers: [layer, layer] },
    { ...definition, layers: [{ ...layer, kind: "camera" }] },
    { ...definition, layers: [{ ...layer, opacity: 1.1 }] },
    {
      ...definition,
      layers: Array.from({ length: 65 }, () => ({
        ...layer,
        id: randomUUID(),
      })),
    },
  ])
    assert.equal(sceneDefinition.safeParse(bad).success, false);
  const base = {
    schemaVersion: 1,
    id: randomUUID(),
    eventId: randomUUID(),
    createdAt: new Date().toISOString(),
    eventRevision: 1,
    event: { name: "Test", date: null, location: "", modules: [] },
    shows: [
      {
        id: showId,
        name: "Show",
        description: "",
        revision: 1,
        sourceShowId: null,
        sourceRevision: null,
        cues: [],
      },
    ],
    media: [
      {
        id: mediaId,
        name: "Bild",
        sha256: "a".repeat(64),
        sizeBytes: 1,
        mime: "image/png",
        downloadPath: `/api/v1/media/${mediaId}/content`,
      },
    ],
    status: "valid",
    errors: [],
    liveActivationSupported: false,
  };
  assert.ok(transferManifest.safeParse(base).success);
  const scene = { id: sceneId, showId, revision: 1, definition };
  const v2 = {
    ...base,
    schemaVersion: 2,
    scenes: [scene],
    shows: [
      { ...base.shows[0], cues: [{ id: randomUUID(), name: "Cue", sceneId }] },
    ],
  };
  assert.ok(transferManifest.safeParse(v2).success);
  for (const bad of [
    { ...v2, schemaVersion: 1 },
    { ...v2, scenes: [] },
    { ...v2, scenes: [scene, scene] },
    { ...v2, scenes: [{ ...scene, showId: randomUUID() }] },
    { ...v2, media: [] },
    {
      ...v2,
      shows: [
        {
          ...v2.shows[0],
          cues: [{ ...v2.shows[0].cues[0], sceneId: randomUUID() }],
        },
      ],
    },
  ])
    assert.equal(transferManifest.safeParse(bad).success, false);
});
