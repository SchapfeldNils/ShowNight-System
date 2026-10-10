import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, lstat, rename, rm } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { packageMagic } from "../../../packages/transfer/src/archive.js";
import {
  packageLimits,
  transferManifest,
} from "../../../packages/contracts/src/transfer.js";

export class PackageStore {
  private db: DatabaseSync;
  readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
    this.db = new DatabaseSync(join(this.root, "packages.sqlite"));
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
    );
    const version = this.db.prepare("PRAGMA user_version").get()?.user_version;
    if (version !== 0 && version !== 1) {
      this.db.close();
      throw new Error("Lokales Paketschema nicht unterstützt.");
    }
    this.db.exec(`CREATE TABLE IF NOT EXISTS packages(
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, header_sha TEXT NOT NULL,
      manifest_json TEXT NOT NULL, directory_key TEXT NOT NULL UNIQUE, imported_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS package_shows(
      package_id TEXT REFERENCES packages(id), id TEXT NOT NULL, revision INTEGER NOT NULL, name TEXT NOT NULL,
      PRIMARY KEY(package_id,id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS package_cues(
      package_id TEXT NOT NULL, show_id TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL, definition TEXT NOT NULL,
      PRIMARY KEY(package_id,show_id,id), FOREIGN KEY(package_id,show_id) REFERENCES package_shows(package_id,id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS package_media(
      package_id TEXT REFERENCES packages(id), id TEXT NOT NULL, sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL,
      PRIMARY KEY(package_id,id)
    ) STRICT; PRAGMA user_version=1;`);
  }
  close() {
    this.db.close();
  }
  list() {
    return this.db
      .prepare(
        "SELECT id,event_id AS eventId,imported_at AS importedAt,manifest_json FROM packages ORDER BY imported_at DESC",
      )
      .all()
      .map((r) => {
        const m = transferManifest.parse(JSON.parse(String(r.manifest_json)));
        return {
          id: String(r.id),
          eventId: String(r.eventId),
          name: m.event.name,
          eventRevision: m.eventRevision,
          shows: m.shows.length,
          media: m.media.length,
          importedAt: String(r.importedAt),
          liveActivationSupported: false,
        };
      });
  }
  private record(id: string) {
    const r = this.db.prepare("SELECT * FROM packages WHERE id=?").get(id);
    if (!r) throw new Error("Paket nicht vorhanden.");
    const key = String(r.directory_key);
    if (!/^[0-9a-f-]{36}$/.test(key))
      throw new Error("Ungültiger lokaler Paketschlüssel.");
    if (
      createHash("sha256").update(String(r.manifest_json)).digest("hex") !==
      r.header_sha
    )
      throw new Error("Gespeichertes Manifest verändert.");
    return {
      manifest: transferManifest.parse(JSON.parse(String(r.manifest_json))),
      dir: join(this.root, "packages", key),
    };
  }
  metadata(id: string) {
    const { manifest } = this.record(id);
    const row = this.db.prepare("SELECT header_sha FROM packages WHERE id=?").get(id)!;
    return { manifest, headerHash: String(row.header_sha) };
  }
  file(id: string, mediaId: string) {
    const { manifest, dir } = this.record(id);
    const media = manifest.media.find(m => m.id === mediaId);
    if (!media) throw new Error("Medium nicht im Paket.");
    return { path: join(dir, media.id), media };
  }
  async verify(id: string) {
    const { manifest: m, dir } = this.record(id),
      errors: string[] = [];
    for (const media of m.media) {
      try {
        const path = join(dir, media.id);
        if (!(await lstat(path)).isFile()) throw new Error();
        const file = await open(path, "r");
        try {
          if ((await file.stat()).size !== media.sizeBytes) throw new Error();
          const hash = createHash("sha256");
          for await (const chunk of file.createReadStream({ autoClose: false }))
            hash.update(chunk);
          if (hash.digest("hex") !== media.sha256) throw new Error();
        } finally {
          await file.close();
        }
      } catch {
        errors.push(`Datei ${media.name}: fehlt oder verändert.`);
      }
    }
    return {
      id: m.id,
      status: errors.length ? "invalid" : "valid",
      errors,
      liveActivationSupported: false,
    };
  }
  async importArchive(path: string) {
    if (!(await lstat(path)).isFile())
      throw new Error("Reguläre Paketdatei erforderlich.");
    const source = await open(path, "r");
    let stage: string | undefined, published: string | undefined;
    let position = 0;
    const exact = async (size: number) => {
      const bytes = Buffer.alloc(size);
      let offset = 0;
      while (offset < size) {
        const r = await source.read(bytes, offset, size - offset, position);
        if (!r.bytesRead) throw new Error("Paket ist unvollständig.");
        position += r.bytesRead;
        offset += r.bytesRead;
      }
      return bytes;
    };
    // Cleanup only our generated direct children, never archive paths or arbitrary caller targets.
    const removeOwn = async (path: string, parent: string) => {
      if (
        dirname(resolve(path)) !== resolve(parent) ||
        !/^[0-9a-f-]{36}$/.test(path.slice(parent.length + 1))
      )
        throw new Error("Ungültiger eigener Stagingpfad.");
      await rm(path, { recursive: true, force: true });
    };
    try {
      if (!(await exact(packageMagic.length)).equals(packageMagic))
        throw new Error("Paketformat nicht unterstützt.");
      const size = (await exact(4)).readUInt32BE();
      if (!size || size > packageLimits.headerBytes)
        throw new Error("Paketmanifest überschreitet das Limit.");
      const expectedHash = (await exact(32)).toString("hex"),
        json = await exact(size);
      if (createHash("sha256").update(json).digest("hex") !== expectedHash)
        throw new Error("Manifestprüfsumme falsch.");
      const m = transferManifest.parse(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json)),
      );
      if (
        (await source.stat()).size !==
        position + m.media.reduce((n, f) => n + f.sizeBytes, 0)
      )
        throw new Error(
          "Paketlänge stimmt nicht; Dateien fehlen oder Zusatzdaten vorhanden.",
        );
      const key = randomUUID(),
        stageRoot = join(this.root, "staging"),
        packagesRoot = join(this.root, "packages");
      await mkdir(stageRoot, { recursive: true, mode: 0o700 });
      await mkdir(packagesRoot, { recursive: true, mode: 0o700 });
      stage = join(stageRoot, key);
      await mkdir(stage, { mode: 0o700 });
      for (const media of m.media) {
        const output = await open(join(stage, media.id), "wx", 0o600),
          hash = createHash("sha256");
        try {
          let left = media.sizeBytes;
          while (left) {
            const bytes = await exact(Math.min(left, 64 * 1024));
            hash.update(bytes);
            await output.writeFile(bytes);
            left -= bytes.length;
          }
          await output.sync();
          if (hash.digest("hex") !== media.sha256)
            throw new Error(`Datei ${media.name}: Prüfsumme falsch.`);
        } finally {
          await output.close();
        }
      }
      if ((await source.stat()).size !== position)
        throw new Error("Paket während Import verändert.");
      const existing = this.db
        .prepare("SELECT header_sha FROM packages WHERE id=?")
        .get(m.id);
      if (existing) {
        if (existing.header_sha !== expectedHash)
          throw new Error("Paketkennung mit anderem Inhalt bereits vorhanden.");
        if ((await this.verify(m.id)).status !== "valid")
          throw new Error(
            "Vorhandenes Paket beschädigt; nicht automatisch ersetzt.",
          );
        return {
          id: m.id,
          status: "already_present",
          liveActivationSupported: false,
        };
      }
      const target = join(packagesRoot, key);
      if (dirname(resolve(target)) !== resolve(packagesRoot))
        throw new Error("Ungültiger eigener Zielpfad.");
      await rename(stage, target);
      stage = undefined;
      published = target;
      this.db.exec("BEGIN IMMEDIATE");
      try {
        const concurrent = this.db
          .prepare("SELECT header_sha FROM packages WHERE id=?")
          .get(m.id);
        if (concurrent) {
          this.db.exec("ROLLBACK");
          if (
            concurrent.header_sha !== expectedHash ||
            (await this.verify(m.id)).status !== "valid"
          )
            throw new Error(
              "Parallel importierte Paketkennung hat anderen oder beschädigten Inhalt.",
            );
          return {
            id: m.id,
            status: "already_present",
            liveActivationSupported: false,
          };
        }
        this.db
          .prepare("INSERT INTO packages VALUES(?,?,?,?,?,?)")
          .run(
            m.id,
            m.eventId,
            expectedHash,
            json.toString("utf8"),
            key,
            new Date().toISOString(),
          );
        for (const s of m.shows) {
          this.db
            .prepare("INSERT INTO package_shows VALUES(?,?,?,?)")
            .run(m.id, s.id, s.revision, s.name);
          s.cues.forEach((c, i) =>
            this.db
              .prepare("INSERT INTO package_cues VALUES(?,?,?,?,?)")
              .run(m.id, s.id, c.id, i, JSON.stringify(c)),
          );
        }
        for (const f of m.media)
          this.db
            .prepare("INSERT INTO package_media VALUES(?,?,?,?)")
            .run(m.id, f.id, f.sha256, f.sizeBytes);
        this.db.exec("COMMIT");
        published = undefined;
      } catch (e) {
        if (this.db.isTransaction) this.db.exec("ROLLBACK");
        throw e;
      }
      return { id: m.id, status: "imported", liveActivationSupported: false };
    } finally {
      await source.close();
      if (stage) await removeOwn(stage, join(this.root, "staging"));
      if (published) await removeOwn(published, join(this.root, "packages"));
    }
  }
}
