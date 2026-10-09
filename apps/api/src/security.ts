import {
  randomBytes,
  createHash,
  scrypt as rawScrypt,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
  createHmac,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(rawScrypt);
export const token = () => randomBytes(32).toString("base64url");
export const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return (
    salt + ":" + ((await scrypt(password, salt, 64)) as Buffer).toString("hex")
  );
}
export async function checkPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return (
    expected.length === derived.length && timingSafeEqual(derived, expected)
  );
}
export function seal(value: string, key: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const data = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function unseal(value: string, key: string) {
  const [iv, tag, data] = value
    .split(".")
    .map((b) => Buffer.from(b, "base64url"));
  const d = createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function totpSecret() {
  let bits = 0,
    n = 0,
    result = "";
  for (const b of randomBytes(20)) {
    n = (n << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(n >>> bits) & 31];
    }
  }
  return result;
}
function base32(s: string) {
  let n = 0,
    bits = 0;
  const bytes = [];
  for (const c of s) {
    n = (n << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((n >>> bits) & 255);
    }
  }
  return Buffer.from(bytes);
}
export function totp(secret: string, counter = Math.floor(Date.now() / 30000)) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32(secret)).update(b).digest();
  const offset = h[19] & 15;
  return ((h.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
export function verifyTotp(secret: string, code: string, lastCounter = -1) {
  if (!/^\d{6}$/.test(code)) return null;
  const now = Math.floor(Date.now() / 30000);
  for (const offset of [-1, 0, 1]) {
    const counter = now + offset;
    if (
      counter > lastCounter &&
      timingSafeEqual(Buffer.from(totp(secret, counter)), Buffer.from(code))
    )
      return counter;
  }
  return null;
}
