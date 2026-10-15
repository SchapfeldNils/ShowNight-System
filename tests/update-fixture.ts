import { randomBytes } from "node:crypto";

/** Synthetisches Setup mit VS_FIXEDFILEINFO (FileVersion major.minor.patch.0). */
export function syntheticSetup(version: string, size = 4096) {
  const [a, b, c] = version.split(".").map(Number);
  const info = Buffer.alloc(16);
  info.writeUInt32LE(0xfeef04bd, 0);
  info.writeUInt32LE(0x00010000, 4);
  info.writeUInt32LE(((a << 16) | b) >>> 0, 8);
  info.writeUInt32LE((c << 16) >>> 0, 12);
  return Buffer.concat([
    Buffer.from("MZ"),
    randomBytes(size - 2 - info.length - 32),
    info,
    randomBytes(32),
  ]);
}
