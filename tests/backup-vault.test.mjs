import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  access,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import { sealBackup, openBackup } from "../scripts/backup-vault.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shownight-backup-vault-"));
  const source = join(root, "source");
  await mkdir(source);
  const db = randomBytes(1024 * 128),
    media = randomBytes(1024 * 256);
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  await writeFile(join(source, "database.dump"), db);
  await writeFile(join(source, "media.tar"), media);
  await writeFile(
    join(source, "SHA256SUMS"),
    hash(db) + "  database.dump\n" + hash(media) + "  media.tar\n",
  );
  const config = join(root, "stack.env");
  await writeFile(
    config,
    "MFA_ENCRYPTION_KEY=synthetic-secret-only\nSMTP_PASSWORD=synthetic\n",
  );
  return {
    root,
    source,
    config,
    db,
    media,
    password: randomBytes(32).toString("base64url"),
    archive: join(root, "backup.snbackup"),
  };
}
test("Portables Backup: tatsächliche verschlüsselte Dateien und Konfiguration mit unabhängiger Wiederherstellung", async () => {
  const f = await fixture();
  const proof = await sealBackup(f.source, f.config, f.archive, f.password);
  assert.equal(proof.files, 4);
  const encrypted = await readFile(f.archive);
  assert.equal(encrypted.includes(Buffer.from("synthetic-secret-only")), false);
  assert.equal(encrypted.includes(f.db), false);
  const destination = join(f.root, "restore");
  assert.equal(
    (await openBackup(f.archive, destination, f.password)).authenticated,
    true,
  );
  assert.deepEqual(await readFile(join(destination, "database.dump")), f.db);
  assert.deepEqual(await readFile(join(destination, "media.tar")), f.media);
  assert.deepEqual(
    await readFile(join(destination, "stack.env")),
    await readFile(f.config),
  );
  assert.deepEqual(
    (await readdir(destination)).sort(),
    ["SHA256SUMS", "database.dump", "media.tar", "stack.env"].sort(),
  );
});
test("Falsches Kennwort, manipuliertes Archiv und truncation liefern keine wiederhergestellten Dateien", async () => {
  const f = await fixture();
  await sealBackup(f.source, f.config, f.archive, f.password);
  const original = await readFile(f.archive);
  for (const [kind, password, bytes] of [
    ["password", "wrong-password-with-sufficient-length", original],
    ["tamper", f.password, Buffer.from(original)],
    ["truncated", f.password, original.subarray(0, original.length - 1)],
  ]) {
    if (kind === "tamper") bytes[100] ^= 1;
    const archive = join(f.root, kind + ".snbackup");
    await writeFile(archive, bytes);
    const destination = join(f.root, kind);
    await assert.rejects(openBackup(archive, destination, password));
    await assert.rejects(access(destination));
  }
});
test("Vorhandene Ausgabe und Quelldaten bleiben bei ungültiger Sicherung unverändert", async () => {
  const f = await fixture();
  await sealBackup(f.source, f.config, f.archive, f.password);
  const before = await readFile(f.archive);
  await assert.rejects(sealBackup(f.source, f.config, f.archive, f.password));
  assert.deepEqual(await readFile(f.archive), before);
  const destination = join(f.root, "existing");
  await mkdir(destination);
  await writeFile(join(destination, "keep.txt"), "retained");
  await assert.rejects(openBackup(f.archive, destination, f.password));
  assert.equal(
    await readFile(join(destination, "keep.txt"), "utf8"),
    "retained",
  );
  await writeFile(join(f.source, "database.dump"), "changed");
  const bad = join(f.root, "bad.snbackup");
  await assert.rejects(sealBackup(f.source, f.config, bad, f.password));
  await assert.rejects(access(bad));
});
