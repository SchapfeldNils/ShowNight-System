import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import {
  packageLimits,
  transferManifest,
  type TransferManifest,
} from "../../contracts/src/transfer.js";

export const packageMagic = Buffer.from("ShowNight-Paket/1\n", "ascii");
export function packageHeader(value: unknown) {
  const m = transferManifest.parse(value);
  const json = Buffer.from(JSON.stringify(m));
  if (json.length > packageLimits.headerBytes)
    throw new Error("Paketmanifest zu groß.");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(json.length);
  const digest = createHash("sha256").update(json).digest();
  return {
    manifest: m,
    hash: digest.toString("hex"),
    bytes: Buffer.concat([packageMagic, length, digest, json]),
  };
}
// No archive paths, compression, script execution or network fetches.
export async function* packageBytes(
  m: TransferManifest,
  pathFor: (id: string) => string,
) {
  yield packageHeader(m).bytes;
  for (const media of m.media) {
    const file = await open(pathFor(media.id), "r");
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size !== media.sizeBytes)
        throw new Error("Paketdatei nicht vollständig.");
      const hash = createHash("sha256");
      let size = 0;
      for await (const chunk of file.createReadStream({ autoClose: false })) {
        size += chunk.length;
        if (size > media.sizeBytes) throw new Error("Paketdatei verändert.");
        hash.update(chunk);
        yield chunk as Buffer;
      }
      if (size !== media.sizeBytes || hash.digest("hex") !== media.sha256)
        throw new Error("Paketdatei verändert.");
    } finally {
      await file.close();
    }
  }
}
