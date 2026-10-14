import { open, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  sceneRecord,
  sceneMediaIds,
  type SceneRecord,
} from "../../../packages/contracts/src/scene.js";
import { rendererMediaDescriptor } from "../../../packages/contracts/src/renderer.js";
import {
  rendererSceneDescriptor,
  rendererSceneSnapshot,
  rendererSceneLimits,
} from "../../../packages/contracts/src/renderer-scene.js";
import {
  stageRendererMedia,
  type RendererMediaSource,
} from "./renderer-media.js";

// All paths and metadata are resolved by the local server, never an HTTP body.
export type RendererSceneSource = {
  packageId: string;
  manifestSha256: string;
  scene: SceneRecord;
  images: RendererMediaSource[];
};

function validated(source: RendererSceneSource) {
  const scene = sceneRecord.parse(source.scene);
  const required = new Set(sceneMediaIds(scene.definition));
  const images = source.images
    .map((image) => ({
      ...image,
      media: rendererMediaDescriptor.parse({
        ...image.media,
        inputId: randomUUID(),
      }),
    }))
    .sort((a, b) => a.media.mediaId.localeCompare(b.media.mediaId));
  if (
    images.length > rendererSceneLimits.images ||
    images.length !== required.size ||
    new Set(images.map((image) => image.media.mediaId)).size !==
      images.length ||
    images.some(
      (image) =>
        !required.has(image.media.mediaId) ||
        !["image/png", "image/jpeg"].includes(image.media.mime) ||
        image.media.packageId !== source.packageId ||
        image.media.manifestSha256 !== source.manifestSha256,
    ) ||
    images.reduce((total, image) => total + image.media.sizeBytes, 0) >
      rendererSceneLimits.totalBytes
  )
    throw new Error("SCENE_MEDIA");
  // Validate package/hash even for a scene containing no image layers.
  rendererSceneDescriptor.parse({
    inputId: randomUUID(),
    packageId: source.packageId,
    sceneId: scene.id,
    sceneRevision: scene.revision,
    manifestSha256: source.manifestSha256,
    sha256: "0".repeat(64),
    sizeBytes: 1,
  });
  return { scene, images };
}

export function rendererSceneFingerprint(source: RendererSceneSource) {
  const { scene, images } = validated(source);
  return createHash("sha256")
    .update(
      JSON.stringify({
        packageId: source.packageId,
        manifestSha256: source.manifestSha256,
        scene,
        images: images.map(({ media: { inputId: _, ...media } }) => media),
      }),
    )
    .digest("hex");
}

export async function stageRendererScene(
  source: RendererSceneSource,
  folder: string,
  inputId: string,
  guard: () => void,
) {
  guard();
  const { scene, images } = validated(source);
  // Parse before constructing a UUID-derived child path.
  rendererSceneDescriptor.parse({
    inputId,
    packageId: source.packageId,
    sceneId: scene.id,
    sceneRevision: scene.revision,
    manifestSha256: source.manifestSha256,
    sha256: "0".repeat(64),
    sizeBytes: 1,
  });
  const paths: string[] = [];
  try {
    const copied = [];
    for (const image of images) {
      guard();
      const staged = await stageRendererMedia(
        image,
        folder,
        image.media.inputId,
        guard,
      );
      paths.push(staged.path);
      copied.push(staged.media);
      guard();
    }
    const snapshot = rendererSceneSnapshot.parse({
      schemaVersion: 1,
      scene,
      images: copied,
    });
    const bytes = Buffer.from(JSON.stringify(snapshot), "utf8");
    if (bytes.length > rendererSceneLimits.snapshotBytes)
      throw new Error("SCENE_LIMIT");
    const descriptor = rendererSceneDescriptor.parse({
      inputId,
      packageId: source.packageId,
      sceneId: scene.id,
      sceneRevision: scene.revision,
      manifestSha256: source.manifestSha256,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.length,
    });
    const path = join(folder, "scene-" + inputId + ".json");
    guard();
    const output = await open(path, "wx", 0o600);
    paths.push(path);
    try {
      await output.writeFile(bytes);
      await output.sync();
    } finally {
      await output.close();
    }
    guard();
    return { descriptor, paths };
  } catch (error) {
    // Only remove files created by this invocation. No native command has run.
    await Promise.all(paths.map((path) => unlink(path).catch(() => {})));
    throw error;
  }
}
