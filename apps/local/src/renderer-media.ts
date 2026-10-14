import { open, lstat, realpath, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, sep, join } from "node:path";
import {
  rendererMediaDescriptor,
  type RendererMediaDescriptor,
} from "../../../packages/contracts/src/renderer.js";

export type RendererMediaSource = {
  root: string;
  path: string;
  media: Omit<RendererMediaDescriptor, "inputId">;
};
// The caller supplies only a server-resolved PackageStore path. Never accept
// this object from an HTTP body. Use one descriptor for hashing AND copying.
export async function stageRendererMedia(
  source: RendererMediaSource,
  folder: string,
  inputId: string,
  guard: () => void,
) {
  const media = rendererMediaDescriptor.parse({ ...source.media, inputId });
  guard();
  const root = await realpath(source.root);
  if (!(await lstat(source.path)).isFile()) throw new Error("MEDIA_CHANGED");
  const actual = await realpath(source.path);
  if (!actual.startsWith(root + sep)) throw new Error("MEDIA_CHANGED");
  const path = join(
    folder,
    "input-" + inputId + (media.mime === "image/png" ? ".png" : ".webm"),
  );
  if (
    resolve(path).slice(0, resolve(folder).length + 1) !==
    resolve(folder) + sep
  )
    throw new Error("MEDIA_CHANGED");
  const input = await open(source.path, "r");
  let output: Awaited<ReturnType<typeof open>> | undefined;
  let created = false;
  try {
    const stat = await input.stat();
    if (!stat.isFile() || stat.size !== media.sizeBytes)
      throw new Error("MEDIA_CHANGED");
    guard();
    output = await open(path, "wx", 0o600);
    created = true;
    const hash = createHash("sha256");
    let size = 0;
    for await (const bytes of input.createReadStream({ autoClose: false })) {
      size += bytes.length;
      if (size > media.sizeBytes) throw new Error("MEDIA_CHANGED");
      hash.update(bytes);
      await output.writeFile(bytes);
    }
    if (size !== media.sizeBytes || hash.digest("hex") !== media.sha256)
      throw new Error("MEDIA_CHANGED");
    await output.sync();
    guard();
    return { path, media };
  } catch (error) {
    await output?.close();
    output = undefined;
    if (created) await unlink(path);
    throw error;
  } finally {
    await input.close();
    await output?.close();
  }
}
