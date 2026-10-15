import { z } from "zod";

/**
 * Softwareupdates für den Streaming-Rechner (Issue #33, D020).
 * Echtheit: HTTPS plus SHA-256; das Manifest wird zusätzlich mit dem vorhandenen
 * Offline-Signaturschlüssel des Online-Servers signiert, dem der lokale Server
 * über den importierten Serverschlüssel bereits vertraut.
 */

export const updatePlatform = "windows-x64" as const;
export const updateFileName = "ShowNight-Streaming-Setup-x64.exe" as const;
export const maxUpdateBytes = 200 * 1024 * 1024;
export const softwareVersion = z
  .string()
  .regex(/^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/);

export const updateManifest = z.strictObject({
  schemaVersion: z.literal(1),
  platform: z.literal(updatePlatform),
  version: softwareVersion,
  file: z.literal(updateFileName),
  size: z.int().positive().max(maxUpdateBytes),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  publishedAt: z.iso.datetime(),
});
export type UpdateManifest = z.infer<typeof updateManifest>;

export const signedUpdateManifest = z.strictObject({
  manifest: updateManifest,
  signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
});
export type SignedUpdateManifest = z.infer<typeof signedUpdateManifest>;

/** Signierte Bytes mit Domänentrennung; Feldreihenfolge fest. */
export function updateSigningPayload(m: UpdateManifest) {
  return Buffer.from(
    "ShowNight/software-update/v1\n" +
      JSON.stringify([
        m.schemaVersion,
        m.platform,
        m.version,
        m.file,
        m.size,
        m.sha256,
        m.publishedAt,
      ]),
    "utf8",
  );
}

/** Vergleich „1.2.3“: negativ, 0 oder positiv. */
export function compareVersions(a: string, b: string) {
  const pa = softwareVersion.parse(a).split(".").map(Number);
  const pb = softwareVersion.parse(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** Größter Bereich am Dateianfang, in dem die Versionsressource gesucht wird. */
export const versionScanBytes = 8 * 1024 * 1024;

/**
 * Liest die Dateiversion aus der Windows-Versionsressource (VS_FIXEDFILEINFO) eines
 * Setups, z. B. 0.3.12.0 → „0.3.12“. Bindet das Updatemanifest an das tatsächlich
 * hochgeladene Setup statt an eine manuell eingegebene Version (Review PR #52).
 */
export function peFileVersion(bytes: Uint8Array): string | null {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (data.length < 2 || data.toString("latin1", 0, 2) !== "MZ") return null;
  const signature = Buffer.from([0xbd, 0x04, 0xef, 0xfe]);
  const at = data.indexOf(signature);
  if (at < 0 || at + 16 > data.length) return null;
  const major = data.readUInt32LE(at + 8),
    minor = data.readUInt32LE(at + 12);
  const parts = [major >>> 16, major & 0xffff, minor >>> 16, minor & 0xffff];
  if (parts[3] !== 0) return null;
  const version = parts.slice(0, 3).join(".");
  return softwareVersion.safeParse(version).success ? version : null;
}
