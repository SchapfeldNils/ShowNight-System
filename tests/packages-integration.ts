import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fixture, multipartFile } from "./fixture.js";
import { totp } from "../apps/api/src/security.js";
import { processMedia } from "../apps/api/src/worker.js";
import { blobPath } from "../apps/api/src/media.js";
import { PackageStore } from "../apps/local/src/store.js";
import {
  packageHeader,
  packageMagic,
} from "../packages/transfer/src/archive.js";
import { packageLimits } from "../packages/contracts/src/transfer.js";

test("S3-01: Vorbereitungsdownload und lokale SQLite-Paketablage", async (t) => {
  const f = await fixture(55435);
  let cookie = "",
    csrf = "";
  const request = (path: string, method = "GET", payload?: unknown) =>
    f.app.inject({
      url: "/api/v1" + path,
      method: method as any,
      headers: { origin: f.cfg.origin, cookie, "x-csrf-token": csrf },
      ...(payload === undefined ? {} : { payload: payload as any }),
    });
  const root = join(f.dir, "local-package-store");
  await mkdir(root);
  let store = new PackageStore(root);
  let eventId = "",
    mediaId = "",
    archive: Buffer = Buffer.alloc(0),
    m: any;
  const path = join(f.dir, "synthetic.snpkg");
  const put = async (name: string, bytes: Buffer) => {
    const p = join(f.dir, name);
    await writeFile(p, bytes);
    return p;
  };
  try {
    await t.test(
      "Geschützter Download, eingefrorene Revisionen und Originalmedien",
      async () => {
        assert.equal(
          (await request(`/packages/${randomUUID()}/download`)).statusCode,
          401,
        );
        const login = await request("/auth/login", "POST", {
          login: "admin",
          password: f.adminPassword,
        });
        const v = await request("/auth/mfa/verify", "POST", {
          challenge: login.json().challenge,
          code: totp(login.json().secret),
        });
        assert.equal(v.statusCode, 200);
        cookie = "sn_session=" + v.cookies[0].value;
        csrf = v.json().csrfToken;
        eventId = (
          await request("/events", "POST", {
            name: "Synthetische USB-Vorbereitung",
          })
        ).json().id;
        const show = (
          await request("/shows", "POST", { name: "Synthetische Vorlage" })
        ).json();
        const upload = multipartFile(f.demoPng);
        const u = await f.app.inject({
          url: `/api/v1/media/uploads?showId=${show.id}`,
          method: "POST",
          headers: {
            origin: f.cfg.origin,
            cookie,
            "x-csrf-token": csrf,
            "content-type": upload.contentType,
          },
          payload: upload.payload,
        });
        assert.equal(u.statusCode, 200);
        mediaId = u.json().id;
        await processMedia(f.db, f.cfg);
        const patch = await request(`/shows/${show.id}`, "PATCH", {
          expectedRevision: show.revision,
          cues: [{ id: randomUUID(), name: "Bild", mediaIds: [mediaId] }],
        });
        assert.equal(patch.statusCode, 200, patch.body);
        const reference = patch.json();
        // Two S1 copies legitimately share cue identifiers, scoped to their shows.
        for (let i = 0; i < 2; i++)
          assert.equal(
            (
              await request(`/events/${eventId}/show-copies`, "POST", {
                sourceShowId: show.id,
                sourceRevision: reference.revision,
              })
            ).statusCode,
            200,
          );
        m = (await request(`/events/${eventId}/packages`, "POST", {})).json();
        assert.equal(m.status, "valid");
        assert.equal(
          (
            await request(`/events/${eventId}`, "PATCH", {
              expectedRevision: m.eventRevision,
              name: "Spätere Änderung",
            })
          ).statusCode,
          200,
        );
        const r = await request(`/packages/${m.id}/download`);
        assert.equal(r.statusCode, 200, r.body);
        assert.equal(r.headers["cache-control"], "no-store");
        assert.match(
          String(r.headers["content-disposition"]),
          /attachment.*\.snpkg/,
        );
        archive = r.rawPayload;
        assert.equal(Number(r.headers["content-length"]), archive.length);
        await writeFile(path, archive);
        assert.ok(!archive.includes(Buffer.from(f.adminPassword)));
        assert.ok(!archive.includes(Buffer.from(f.cfg.MFA_ENCRYPTION_KEY)));
        assert.equal(
          (await request(`/packages/${randomUUID()}/download`)).statusCode,
          404,
        );
        const out = await store.importArchive(path);
        assert.equal(out.status, "imported");
        assert.equal(store.list()[0].name, "Synthetische USB-Vorbereitung");
        assert.equal(store.list()[0].shows, 2);
        assert.equal((await store.verify(m.id)).status, "valid");
      },
    );
    await t.test(
      "SQLite-Neustart, idempotenter Import und Konflikt ohne Überschreiben",
      async () => {
        store.close();
        store = new PackageStore(root);
        assert.equal(store.list().length, 1);
        assert.equal(
          (await store.importArchive(path)).status,
          "already_present",
        );
        const conflicting = Buffer.concat([
          packageHeader({ ...m, event: { ...m.event, name: "Andere Daten" } })
            .bytes,
          f.demoPng,
        ]);
        await assert.rejects(
          store.importArchive(await put("conflict.snpkg", conflicting)),
          /Paketkennung/,
        );
        assert.equal(store.list()[0].name, m.event.name);
        assert.equal((await store.verify(m.id)).status, "valid");
        const db = new DatabaseSync(join(root, "packages.sqlite"), {
          readOnly: true,
        });
        assert.equal(
          db.prepare("SELECT count(*) AS n FROM package_cues").get()?.n,
          2,
        );
        db.close();
      },
    );
    await t.test(
      "Beschädigung, Abbruch und Zusatzbytes veröffentlichen keinen Teilstand",
      async () => {
        const altered = Buffer.from(archive);
        altered[altered.length - 1] ^= 1;
        for (const [i, b] of [
          altered,
          archive.subarray(0, archive.length - 1),
          Buffer.concat([archive, Buffer.from("extra")]),
        ].entries())
          await assert.rejects(
            store.importArchive(await put(`invalid-${i}.snpkg`, b)),
          );
        assert.equal(store.list().length, 1);
        assert.deepEqual(await readdir(join(root, "staging")), []);
        assert.equal((await store.verify(m.id)).status, "valid");
      },
    );
    await t.test(
      "Manifestgrenzen, unbekannte Felder/Versionen und fehlende Referenzen",
      async () => {
        const raw = (obj: any) => {
          const json = Buffer.from(JSON.stringify(obj)),
            len = Buffer.alloc(4);
          len.writeUInt32BE(json.length);
          return Buffer.concat([
            packageMagic,
            len,
            createHash("sha256").update(json).digest(),
            json,
            f.demoPng,
          ]);
        };
        const huge = Buffer.alloc(4);
        huge.writeUInt32BE(packageLimits.headerBytes + 1);
        await assert.rejects(
          store.importArchive(
            await put("huge.snpkg", Buffer.concat([packageMagic, huge])),
          ),
        );
        const mutants = [
          { ...m, schemaVersion: 2 },
          { ...m, users: [{ passwordHash: "synthetic-only" }] },
          { ...m, event: { ...m.event, password: "synthetic-only" } },
          { ...m, media: [...m.media, ...m.media] },
          {
            ...m,
            shows: [
              {
                ...m.shows[0],
                cues: [{ ...m.shows[0].cues[0], mediaIds: [randomUUID()] }],
              },
            ],
          },
          {
            ...m,
            media: m.media.map((x: any) => ({
              ...x,
              sizeBytes: packageLimits.fileBytes + 1,
            })),
          },
          {
            ...m,
            media: m.media.map((x: any) => ({ ...x, id: "../../outside" })),
          },
        ];
        for (const [i, obj] of mutants.entries())
          await assert.rejects(
            store.importArchive(await put(`manifest-${i}.snpkg`, raw(obj))),
          );
        const bad = Buffer.from(archive);
        bad[packageMagic.length + 4] ^= 1;
        await assert.rejects(
          store.importArchive(await put("bad-header.snpkg", bad)),
          /Manifestprüfsumme/,
        );
        assert.equal(store.list().length, 1);
      },
    );
    await t.test(
      "Paralleler Import dedupliziert; beschädigter Bestand wird erkannt",
      async () => {
        const fresh = { ...m, id: randomUUID() };
        const source = await put(
          "parallel.snpkg",
          Buffer.concat([packageHeader(fresh).bytes, f.demoPng]),
        );
        const result = await Promise.all([
          store.importArchive(source),
          store.importArchive(source),
        ]);
        assert.deepEqual(result.map((r) => r.status).sort(), [
          "already_present",
          "imported",
        ]);
        const db = new DatabaseSync(join(root, "packages.sqlite"), {
          readOnly: true,
        });
        const key = String(
          db
            .prepare("SELECT directory_key FROM packages WHERE id=?")
            .get(fresh.id)?.directory_key,
        );
        db.close();
        await writeFile(
          join(root, "packages", key, mediaId),
          Buffer.alloc(f.demoPng.length),
        );
        assert.equal((await store.verify(fresh.id)).status, "invalid");
        await assert.rejects(store.importArchive(source), /beschädigt/);
        assert.equal((await store.verify(m.id)).status, "valid");
      },
    );
    await t.test(
      "Server verweigert veränderte Datei und fremde Eventrechte",
      async () => {
        const media = (
          await f.db.query("SELECT * FROM media WHERE id=$1", [mediaId])
        ).rows[0];
        await writeFile(
          blobPath(f.cfg, media.blob_key),
          Buffer.alloc(f.demoPng.length),
        );
        assert.equal(
          (await request(`/packages/${m.id}/download`)).statusCode,
          409,
        );
        await writeFile(blobPath(f.cfg, media.blob_key), f.demoPng);
        const stranger = randomUUID();
        await f.db.query(
          "INSERT INTO users(id,login,display_name) VALUES($1,$2,$3)",
          [stranger, "synthetic-stranger", "Fremdes Konto"],
        );
        const { token, hash } = await import("../apps/api/src/security.js");
        const session = token();
        await f.db.query(
          "INSERT INTO sessions(token_hash,user_id,csrf_token,mfa_verified,expires_at) VALUES($1,$2,$3,true,now()+interval '1 hour')",
          [hash(session), stranger, "synthetic-csrf"],
        );
        const oldCookie = cookie;
        cookie = "sn_session=" + session;
        try {
          assert.equal(
            (await request(`/packages/${m.id}/download`)).statusCode,
            404,
          );
        } finally {
          cookie = oldCookie;
        }
      },
    );
    await t.test(
      "Blockgrenzen, unveränderte Manifestbytes und medienloser Stand",
      async () => {
        const bytes = Buffer.alloc(128 * 1024 + 17, 0x35);
        const large = {
          ...m,
          id: randomUUID(),
          media: m.media.map((f: any) => ({
            ...f,
            sizeBytes: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          })),
        };
        // Preserve the checksum of the source JSON, including harmless whitespace.
        const json = Buffer.from(JSON.stringify(large, null, 2));
        const length = Buffer.alloc(4);
        length.writeUInt32BE(json.length);
        const source = await put(
          "blocks.snpkg",
          Buffer.concat([
            packageMagic,
            length,
            createHash("sha256").update(json).digest(),
            json,
            bytes,
          ]),
        );
        assert.equal((await store.importArchive(source)).status, "imported");
        assert.equal((await store.verify(large.id)).status, "valid");
        assert.equal(
          (await store.importArchive(source)).status,
          "already_present",
        );
        const empty = { ...m, id: randomUUID(), shows: [], media: [] };
        assert.equal(
          (
            await store.importArchive(
              await put("empty.snpkg", packageHeader(empty).bytes),
            )
          ).status,
          "imported",
        );
        assert.equal((await store.verify(empty.id)).status, "valid");
      },
    );
    if (process.platform === "win32")
      await t.test(
        "Gebündelter Windows-CLI außerhalb Repository importiert ohne npm oder Netz",
        async () => {
          const cwd = join(f.dir, "outside-workspace");
          await mkdir(cwd);
          // Copies are deliberately outside the repository, with a separate synthetic LOCALAPPDATA.
          const { mkdtemp, copyFile } = await import("node:fs/promises");
          const { tmpdir } = await import("node:os");
          const external = await mkdtemp(
            join(tmpdir(), "shownight-package-cli-"),
          );
          await copyFile(
            "dist/local-windows/node.exe",
            join(external, "node.exe"),
          );
          await copyFile(
            "dist/local-windows/main.js",
            join(external, "main.mjs"),
          );
          const run = (args: string[]) =>
            new Promise<number>((ok, fail) => {
              const p = spawn(
                join(external, "node.exe"),
                [join(external, "main.mjs"), ...args],
                {
                  cwd: external,
                  env: {
                    ...process.env,
                    LOCALAPPDATA: cwd,
                    HTTP_PROXY: "http://127.0.0.1:1",
                    HTTPS_PROXY: "http://127.0.0.1:1",
                  },
                  stdio: "ignore",
                  windowsHide: true,
                },
              );
              const timeout = setTimeout(() => p.kill(), 20000);
              p.on("error", fail);
              p.on("close", (code) => {
                clearTimeout(timeout);
                ok(code ?? -1);
              });
            });
          assert.equal(await run(["import", resolve(path)]), 0);
          assert.equal(await run(["list"]), 0);
          assert.equal(await run(["check-all"]), 0);
          const imported = new PackageStore(
            join(cwd, "ShowNight", "local-packages"),
          );
          assert.equal(imported.list().length, 1);
          assert.equal((await imported.verify(m.id)).status, "valid");
          imported.close();
          // Retained synthetic temp executable copy is documented; no arbitrary recursive delete.
        },
      );
  } finally {
    store.close();
    await f.close();
  }
});
