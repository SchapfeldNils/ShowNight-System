import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  access,
  stat,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import { fork } from "node:child_process";
import { once } from "node:events";
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
  assert.deepEqual(
    (await readdir(f.root)).sort(),
    ["backup.snbackup", "restore", "source", "stack.env"].sort(),
    "Erfolgreiche Veröffentlichung hinterlässt keine Teildatei",
  );
});

test(
  "Konkurrierende Sicherungen veröffentlichen genau ein vollständig lesbares Archiv",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      sealBackup(f.source, f.config, f.archive, f.password),
      sealBackup(f.source, f.config, f.archive, f.password),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    const winner = results.find((r) => r.status === "fulfilled").value;
    assert.equal(
      winner.sha256,
      createHash("sha256")
        .update(await readFile(f.archive))
        .digest("hex"),
    );
    const destination = join(f.root, "restore");
    assert.equal(
      (await openBackup(f.archive, destination, f.password)).authenticated,
      true,
    );
    assert.deepEqual(await readFile(join(destination, "database.dump")), f.db);
    assert.deepEqual(await readFile(join(destination, "media.tar")), f.media);
    assert.deepEqual(
      (await readdir(f.root)).sort(),
      ["backup.snbackup", "restore", "source", "stack.env"].sort(),
    );
  },
);

test(
  "Prozessabbruch während des verschlüsselten Streams veröffentlicht kein finales Archiv",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    const child = fork(
      new URL("./backup-vault-child.mjs", import.meta.url),
      [],
      {
        stdio: ["ignore", "ignore", "pipe", "ipc"],
        windowsHide: true,
      },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const exited = once(child, "exit");
    const blocked = new Promise((resolve, reject) => {
      child.once("message", (message) => {
        if (message.state === "stream-blocked") resolve(message);
        else
          reject(
            new Error(
              "Kindprozess scheiterte vor Streambarriere: " + message.code,
            ),
          );
      });
      child.once("error", reject);
      child.once("exit", () =>
        reject(new Error("Vorzeitiges Prozessende: " + stderr)),
      );
    });
    try {
      child.send({
        source: f.source,
        config: f.config,
        archive: f.archive,
        password: f.password,
      });
      const message = await blocked;
      assert.notEqual(message.path, f.archive);
      assert.equal(dirname(message.path), f.root);
      const temporary = await stat(message.path);
      assert.ok(
        temporary.size > 54,
        "Verschlüsselter Stream wurde tatsächlich geschrieben",
      );
      if (process.platform !== "win32") assert.equal(temporary.mode & 0o077, 0);
      await assert.rejects(access(f.archive), { code: "ENOENT" });
      assert.equal(
        (await readdir(f.root)).some((name) => name.endsWith(".snbackup")),
        false,
      );
    } finally {
      child.kill("SIGKILL");
      await exited;
    }
    await assert.rejects(access(f.archive), { code: "ENOENT" });
    assert.equal(
      (await readdir(f.root)).some((name) => name.endsWith(".snbackup")),
      false,
    );
  },
);

test(
  "Abgefangener Streamfehler entfernt die eigene Teildatei ohne Veröffentlichung",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    const child = fork(
      new URL("./backup-vault-child.mjs", import.meta.url),
      [],
      {
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        windowsHide: true,
      },
    );
    const exited = once(child, "exit");
    const messages = [];
    child.on("message", (message) => {
      messages.push(message.state);
      if (message.state === "stream-blocked") child.send({ continue: true });
    });
    child.send({
      source: f.source,
      config: f.config,
      archive: f.archive,
      password: f.password,
      failDuringStream: true,
    });
    try {
      assert.equal((await exited)[0], 1);
      assert.deepEqual(messages, ["stream-blocked", "failed"]);
      await assert.rejects(access(f.archive), { code: "ENOENT" });
      assert.deepEqual(
        (await readdir(f.root)).sort(),
        ["source", "stack.env"].sort(),
      );
    } finally {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
        await exited;
      }
    }
  },
);
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
