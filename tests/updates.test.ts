import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, sign } from "node:crypto";
import { mkdtemp, readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signer, trustFor } from "../packages/transfer/src/offline.js";
import {
  compareVersions,
  updateFileName,
  updateSigningPayload,
  type UpdateManifest,
} from "../packages/contracts/src/updates.js";
import {
  checkForUpdate,
  installedVersion,
  preparedUpdate,
  verifyRelease,
} from "../apps/local/src/updates.js";

const masterKey = randomBytes(32).toString("hex");
const origin = "https://shownight.example.invalid";
const trust = trustFor(masterKey, origin);
const setup = Buffer.concat([Buffer.from("MZ"), randomBytes(4096)]);

function release(
  version: string,
  bytes = setup,
  key = masterKey,
  overrides: Partial<UpdateManifest> = {},
) {
  const manifest: UpdateManifest = {
    schemaVersion: 1,
    platform: "windows-x64",
    version,
    file: updateFileName,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    publishedAt: "2026-10-15T08:00:00.000Z",
    ...overrides,
  };
  return {
    manifest,
    signature: sign(null, updateSigningPayload(manifest), signer(key)).toString(
      "base64",
    ),
  };
}

/** Synthetischer Onlineserver: liefert Manifest und Setup-Datei. */
function server(
  latest: unknown,
  files: Record<string, Buffer> = {},
  calls: string[] = [],
) {
  return async (url: string) => {
    calls.push(url);
    if (url.endsWith("/latest.json"))
      return latest === null
        ? new Response("{}", { status: 404 })
        : new Response(JSON.stringify(latest), { status: 200 });
    for (const [version, bytes] of Object.entries(files))
      if (url.endsWith(`/${version}/${updateFileName}`))
        return new Response(new Uint8Array(bytes), { status: 200 });
    return new Response("{}", { status: 404 });
  };
}

test("Versionen und Manifestsignatur", () => {
  assert.ok(compareVersions("0.3.12", "0.3.11") > 0);
  assert.ok(compareVersions("0.10.0", "0.9.9") > 0);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.throws(() => compareVersions("1.0", "1.0.0"));
  assert.equal(
    verifyRelease(release("0.3.12"), trust.publicKey).version,
    "0.3.12",
  );
  const tampered = release("0.3.12");
  tampered.manifest.version = "0.3.13";
  assert.throws(() => verifyRelease(tampered, trust.publicKey));
  assert.throws(() =>
    verifyRelease(
      release("0.3.12", setup, randomBytes(32).toString("hex")),
      trust.publicKey,
    ),
  );
  assert.throws(() =>
    verifyRelease({ ...release("0.3.12"), extra: true }, trust.publicKey),
  );
});

test("Download nur nach Signatur-, Größen- und SHA-256-Prüfung", async () => {
  const dir = await mkdtemp(join(tmpdir(), "shownight-updates-"));
  const options = {
    origin,
    publicKey: trust.publicKey,
    current: "0.3.11",
    dir,
  };
  // Kein Update veröffentlicht, aktuelle Version, unbekannte Version.
  assert.equal(
    (await checkForUpdate({ ...options, fetchImpl: server(null) })).state,
    "none",
  );
  assert.equal(
    (await checkForUpdate({ ...options, fetchImpl: server(release("0.3.11")) }))
      .state,
    "current",
  );
  assert.equal(
    (
      await checkForUpdate({
        ...options,
        current: null,
        fetchImpl: server(null),
      })
    ).state,
    "unknown-version",
  );
  // Nicht erreichbar: installierte Version bleibt.
  const offline = await checkForUpdate({
    ...options,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(offline.state, "offline");
  // Fremd signiert: nichts herunterladen.
  const calls: string[] = [];
  const foreign = await checkForUpdate({
    ...options,
    fetchImpl: server(
      release("0.3.12", setup, randomBytes(32).toString("hex")),
      { "0.3.12": setup },
      calls,
    ),
  });
  assert.equal(foreign.state, "failed");
  assert.equal(calls.length, 1);
  // Falscher Inhalt bzw. abgeschnittene Datei: verwerfen.
  for (const bytes of [
    Buffer.concat([Buffer.from("MZ"), randomBytes(4096)]),
    setup.subarray(0, 100),
  ]) {
    const bad = await checkForUpdate({
      ...options,
      fetchImpl: server(release("0.3.12"), { "0.3.12": bytes }),
    });
    assert.equal(bad.state, "failed");
    assert.equal(await preparedUpdate(dir, "0.3.11", trust.publicKey), null);
  }
  assert.deepEqual(
    (await readdir(join(dir, "0.3.12"))).filter((f) => f.endsWith(".exe")),
    [],
  );
  // Gültig: geprüft herunterladen, aber nicht installieren.
  const ready = await checkForUpdate({
    ...options,
    fetchImpl: server(release("0.3.12"), { "0.3.12": setup }),
  });
  assert.equal(ready.state, "ready");
  if (ready.state !== "ready") return;
  assert.deepEqual(await readFile(ready.path), setup);
  const prepared = await preparedUpdate(dir, "0.3.11", trust.publicKey);
  assert.equal(prepared?.version, "0.3.12");
  // Erneute Prüfung lädt nicht erneut herunter.
  const again: string[] = [];
  await checkForUpdate({
    ...options,
    fetchImpl: server(release("0.3.12"), { "0.3.12": setup }, again),
  });
  assert.equal(again.length, 1);
  // Manipulierte Datei oder fremder Schlüssel: nicht vorbereiten.
  assert.equal(
    await preparedUpdate(
      dir,
      "0.3.11",
      trustFor(randomBytes(32).toString("hex"), origin).publicKey,
    ),
    null,
  );
  await writeFile(ready.path, Buffer.concat([setup, Buffer.from("x")]));
  assert.equal(await preparedUpdate(dir, "0.3.11", trust.publicKey), null);
  // Nach Installation (gleiche Version) räumt die nächste Prüfung auf.
  await checkForUpdate({
    ...options,
    current: "0.3.12",
    fetchImpl: server(release("0.3.12")),
  });
  assert.deepEqual(
    (await readdir(dir)).filter((n) => /^\d/.test(n)),
    [],
  );
});

test("Nur HTTPS als Updatequelle; installierte Version aus version.json", async () => {
  const dir = await mkdtemp(join(tmpdir(), "shownight-updates-"));
  const plain = await checkForUpdate({
    origin: "http://shownight.example.invalid",
    publicKey: trust.publicKey,
    current: "0.3.11",
    dir,
    fetchImpl: server(release("0.3.12"), { "0.3.12": setup }),
  });
  assert.equal(plain.state, "failed");
  const base = join(dir, "app");
  await mkdir(base);
  assert.equal(await installedVersion(base), null);
  await writeFile(
    join(base, "version.json"),
    JSON.stringify({ version: "0.3.12" }),
  );
  assert.equal(await installedVersion(base), "0.3.12");
  await writeFile(join(base, "version.json"), JSON.stringify({ version: "x" }));
  assert.equal(await installedVersion(base), null);
});
