import { networkInterfaces } from "node:os";
import { X509Certificate } from "node:crypto";
import { checkServerIdentity } from "node:tls";
import { z } from "zod";
import { powershell } from "../../agent/src/identity.js";

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
// Inspect the exact PFX bytes used by the listener without importing any key into
// a Windows certificate store or changing client trust.
export async function certificatePairInfo(
  certificate: Buffer,
  pfx: Buffer,
  password: string,
  origin: string,
) {
  const info = certificateInfo(certificate, origin);
  const encoded = await powershell(
    "$v=[Console]::In.ReadToEnd()|ConvertFrom-Json;$cert=$null;try{$cert=New-Object Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList @([Convert]::FromBase64String($v.pfx),$v.password,[Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet);if(!$cert.HasPrivateKey){throw 'Private key missing'};[Convert]::ToBase64String($cert.RawData)}finally{if($cert){$cert.Dispose()}}",
    JSON.stringify({ pfx: pfx.toString("base64"), password }),
  );
  const presented = new X509Certificate(Buffer.from(encoded, "base64"));
  if (!presented.raw.equals(new X509Certificate(certificate).raw))
    throw new Error("CER und PFX enthalten unterschiedliche Zertifikate.");
  return info;
}
