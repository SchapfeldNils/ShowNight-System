import { createHash, createPublicKey, verify } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import {
  compareVersions,
  signedUpdateManifest,
  softwareVersion,
  updateFileName,
  updateSigningPayload,
  type UpdateManifest,
} from "../../../packages/contracts/src/updates.js";

/**
 * Issue #33 / D020: Softwareupdates vom ShowNight-Onlineserver.
 * Herunterladen ist automatisch, installieren nur nach Bestätigung in der
 * Serveroberfläche. Ohne Internet läuft die installierte Version unverändert weiter.
 */

export type UpdateStatus =
  | { state: "unknown-version"; message: string }
  | { state: "not-configured"; message: string }
  | { state: "offline"; message: string }
  | { state: "none"; current: string; message: string }
  | { state: "current"; current: string; latest: string; message: string }
  | {
      state: "ready";
      current: string;
      version: string;
      path: string;
      sha256: string;
      message: string;
    }
  | {
      state: "available";
      current: string;
      version: string;
      message: string;
    }
  | { state: "failed"; message: string };

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<Response>;

/** Version der installierten Anwendung (version.json neben main.js), sonst null. */
export async function installedVersion(
  base = dirname(fileURLToPath(import.meta.url)),
) {
  try {
    const raw = JSON.parse(await readFile(join(base, "version.json"), "utf8"));
    return softwareVersion.parse(raw.version);
  } catch {
    return null;
  }
}

/** Prüft Format und Signatur des Manifests mit dem vertrauten Serverschlüssel. */
export function verifyRelease(
  raw: unknown,
  publicKeyPem: string,
): UpdateManifest {
  const release = signedUpdateManifest.parse(raw);
  const ok = verify(
    null,
    updateSigningPayload(release.manifest),
    createPublicKey(publicKeyPem),
    Buffer.from(release.signature, "base64"),
  );
  if (!ok) throw new Error("Signatur des Updatemanifests ungültig.");
  return release.manifest;
}

async function sha256(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

/** Entfernt heruntergeladene Stände außer der angegebenen Version. */
async function prune(dir: string, keep?: string) {
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  for (const name of names)
    if (name !== keep && softwareVersion.safeParse(name).success)
      await rm(join(dir, name), { recursive: true, force: true });
}

const pendingFile = (dir: string) => join(dir, "pending.json");

export async function checkForUpdate(options: {
  origin: string;
  publicKey: string;
  current: string | null;
  dir: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** false: nur prüfen, nichts herunterladen (vor der Installation). */
  download?: boolean;
}): Promise<UpdateStatus> {
  const { origin, publicKey, current, dir } = options;
  const fetchImpl: FetchLike =
    options.fetchImpl ?? ((url, init) => fetch(url, init));
  if (!current)
    return {
      state: "unknown-version",
      message:
        "Installierte Version unbekannt (Entwicklungsstand). Keine Updateprüfung.",
    };
  const base = new URL("/updates/v1/windows-x64/", origin);
  if (base.protocol !== "https:")
    return { state: "failed", message: "Updatequelle muss HTTPS verwenden." };
  let response: Response;
  try {
    response = await fetchImpl(new URL("latest.json", base).href, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 10000),
    });
  } catch {
    return {
      state: "offline",
      message:
        "Onlineserver nicht erreichbar. Installierte Version bleibt in Betrieb.",
    };
  }
  if (response.status === 404)
    return { state: "none", current, message: "Kein Update veröffentlicht." };
  if (!response.ok)
    return {
      state: "offline",
      message: `Updatequelle antwortet mit ${response.status}. Installierte Version bleibt in Betrieb.`,
    };
  let manifest: UpdateManifest;
  let signed: unknown;
  try {
    const text = await response.text();
    if (text.length > 65536) throw new Error();
    signed = JSON.parse(text);
    manifest = verifyRelease(signed, publicKey);
  } catch {
    return {
      state: "failed",
      message:
        "Updatemanifest ungültig oder nicht vom vertrauten Server signiert. Nichts heruntergeladen.",
    };
  }
  if (compareVersions(manifest.version, current) <= 0) {
    await prune(dir);
    await rm(pendingFile(dir), { force: true });
    return {
      state: "current",
      current,
      latest: manifest.version,
      message: `Installierte Version ${current} ist aktuell.`,
    };
  }
  const target = join(dir, manifest.version);
  const file = join(target, updateFileName);
  const ready = (): UpdateStatus => ({
    state: "ready",
    current,
    version: manifest.version,
    path: file,
    sha256: manifest.sha256,
    message: `Version ${manifest.version} geprüft und bereit. Installation nur nach Bestätigung.`,
  });
  // Bereits vollständig geprüfter Download?
  try {
    if ((await sha256(file)) === manifest.sha256) {
      await writeFile(pendingFile(dir), JSON.stringify(signed), {
        mode: 0o600,
      });
      return ready();
    }
  } catch {
    /* nicht vorhanden */
  }
  if (options.download === false)
    return {
      state: "available",
      current,
      version: manifest.version,
      message: `Version ${manifest.version} ist verfügbar, aber noch nicht geprüft heruntergeladen.`,
    };
  await mkdir(target, { recursive: true, mode: 0o700 });
  const partial = file + ".partial";
  await rm(partial, { force: true });
  try {
    const download = await fetchImpl(
      new URL(`${manifest.version}/${updateFileName}`, base).href,
      {
        signal: AbortSignal.timeout(
          Math.max(options.timeoutMs ?? 10000, 600000),
        ),
      },
    );
    if (!download.ok || !download.body) throw new Error("download");
    let size = 0;
    const hash = createHash("sha256");
    await pipeline(
      Readable.fromWeb(download.body as any),
      new Transform({
        transform(chunk, _encoding, callback) {
          size += chunk.length;
          if (size > manifest.size) return callback(new Error("size"));
          hash.update(chunk);
          callback(null, chunk);
        },
      }),
      createWriteStream(partial, { flags: "wx", mode: 0o600 }),
    );
    if (size !== manifest.size || hash.digest("hex") !== manifest.sha256)
      throw new Error("hash");
  } catch {
    await rm(partial, { force: true });
    return {
      state: "failed",
      message:
        "Download unvollständig oder Prüfsumme falsch. Verworfen; installierte Version bleibt in Betrieb.",
    };
  }
  await rename(partial, file);
  await writeFile(pendingFile(dir), JSON.stringify(signed), { mode: 0o600 });
  await prune(dir, manifest.version);
  return ready();
}

/**
 * Vor der Installation: Signatur des gespeicherten Manifests und die heruntergeladene
 * Datei erneut prüfen. Gibt null zurück, wenn nichts Gültiges bereitliegt.
 */
export async function preparedUpdate(
  dir: string,
  current: string | null,
  publicKey: string,
) {
  if (!current) return null;
  try {
    const manifest = verifyRelease(
      JSON.parse(await readFile(pendingFile(dir), "utf8")),
      publicKey,
    );
    if (compareVersions(manifest.version, current) <= 0) return null;
    const path = join(dir, manifest.version, updateFileName);
    if ((await sha256(path)) !== manifest.sha256) return null;
    return { version: manifest.version, path, sha256: manifest.sha256 };
  } catch {
    return null;
  }
}

/**
 * Review PR #52: Installation nur, wenn der Onlineserver genau die vorbereitete
 * Version gerade als aktuell bestätigt. Offline, zurückgezogen oder abweichend: nein.
 */
export function installDecision(
  online: UpdateStatus,
  prepared: { version: string; path: string; sha256: string } | null,
):
  | { ok: true; version: string; path: string; sha256: string }
  | { ok: false; message: string } {
  if (
    prepared &&
    online.state === "ready" &&
    online.version === prepared.version
  )
    return { ok: true, ...prepared };
  return {
    ok: false,
    message:
      online.state === "offline"
        ? "Onlineserver nicht erreichbar. Installation erst nach erneuter Online-Bestätigung."
        : online.state === "available" || (online.state === "ready" && prepared)
          ? "Inzwischen ist eine andere Version veröffentlicht. Erneut nach Updates suchen."
          : "Kein bestätigtes Update bereit. " + online.message,
  };
}
