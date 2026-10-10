import { networkInterfaces } from "node:os";
import { X509Certificate } from "node:crypto";
import { checkServerIdentity } from "node:tls";
import { z } from "zod";

// A chosen interface, never a wildcard or a publicly routable listener.
export const privateIPv4 = z.string().refine((value) => {
  const parts = value.split(".");
  if (
    parts.length !== 4 ||
    parts.some((p) => !/^(0|[1-9][0-9]{0,2})$/.test(p) || Number(p) > 255)
  )
    return false;
  const [a, b] = parts.map(Number);
  return (
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  );
}, "Eine private IPv4-Adresse ohne führende Nullen ist erforderlich.");
export const lanSetup = z.strictObject({
  version: z.literal(1),
  address: privateIPv4,
});
export type LanSetup = z.infer<typeof lanSetup>;
export function lanOrigin(address: string) {
  return "https://" + privateIPv4.parse(address) + ":3443";
}
export function assignedAddress(address: string) {
  return Object.values(networkInterfaces())
    .flat()
    .some((n) => n?.family === "IPv4" && n.address === address);
}
export function certificateInfo(
  bytes: Buffer,
  origin: string,
  now = Date.now(),
) {
  const c = new X509Certificate(bytes),
    host = new URL(origin).hostname;
  if (checkServerIdentity(host, c.toLegacyObject()))
    throw new Error("Zertifikat passt nicht zur Serveradresse.");
  if (Date.parse(c.validFrom) > now || Date.parse(c.validTo) <= now)
    throw new Error("Zertifikat ist noch nicht gültig oder abgelaufen.");
  return { fingerprintSha256: c.fingerprint256, validUntil: c.validTo, host };
}
