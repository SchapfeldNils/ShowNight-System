import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DB } from "../apps/api/src/db.js";
import { processMedia } from "../apps/api/src/worker.js";
import { blobPath } from "../apps/api/src/media.js";
import { fixture } from "./fixture.js";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

// Delegate every query to PostgreSQL. Pause only the first returned claim so
// another real worker can take its expired lease before this worker continues.
function pausedClaim(db: DB) {
  let release!: () => void;
  let claimed!: (row: any) => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<any>((resolve) => {
    claimed = resolve;
  });
  let first = true;
  const wrapped = Object.create(db) as DB;
  wrapped.query = (async (...args: any[]) => {
    const result = await (db.query as any)(...args);
    if (first) {
      first = false;
      claimed(result.rows[0]);
      await gate;
    }
    return result;
  }) as DB["query"];
  return { db: wrapped, entered, release };
}

test(
  "Medienworker: nur der aktuelle Claim darf seinen Zustand abschließen",
  { timeout: 180000 },
  async (t) => {
    const f = await fixture(55442);
    const { db, cfg } = f;
    try {
      const owner = (await db.query("SELECT id FROM users WHERE login='admin'"))
        .rows[0].id;
      const event = randomUUID();
      await db.query(
        "INSERT INTO events(id,name,modules,created_by) VALUES($1,'Synthetischer Claimtest','[]',$2)",
        [event, owner],
      );
      await mkdir(cfg.MEDIA_ROOT, { recursive: true });
      async function media(bytes = f.demoPng, mime = "image/png") {
        const id = randomUUID();
        await writeFile(blobPath(cfg, id), bytes);
        await db.query(
          "INSERT INTO media(id,event_id,created_by,name,blob_key,size_bytes,sha256,mime,status) VALUES($1::uuid,$2,$3,'Synthetisch',$1::text,$4,$5,$6,'processing')",
          [id, event, owner, bytes.length, sha(bytes), mime],
        );
        return id;
      }
      const state = async (id: string) =>
        (
          await db.query(
            "SELECT status,analysis,error,lease_until,attempts FROM media WHERE id=$1",
            [id],
          )
        ).rows[0];
      const expire = (id: string) =>
        db.query(
          "UPDATE media SET lease_until=now()-interval '1 second' WHERE id=$1",
          [id],
        );
      const unavailable = {
        ...cfg,
        FFPROBE_PATH: join(f.dir, "deliberately-missing-ffprobe"),
      };

      await t.test(
        "aktiver Claim: echte Dekodierung ready und Werkzeugfehler failed",
        async () => {
          const ready = await media(f.videoBytes, "video/mp4");
          assert.equal(await processMedia(db, cfg), true);
          assert.equal((await state(ready)).status, "ready");
          assert.equal((await state(ready)).attempts, 1);
          const failed = await media();
          await processMedia(db, unavailable);
          assert.equal((await state(failed)).status, "failed");
          assert.equal((await state(failed)).lease_until, null);
        },
      );

      await t.test(
        "frische Lease wird von einem zweiten Worker nicht doppelt übernommen",
        async () => {
          const id = await media();
          const a = pausedClaim(db);
          const work = processMedia(a.db, cfg);
          try {
            assert.equal((await a.entered).id, id);
            assert.equal(await processMedia(db, cfg), false);
            assert.equal((await state(id)).attempts, 1);
          } finally {
            a.release();
            await work;
          }
          assert.equal((await state(id)).status, "ready");
        },
      );

      await t.test(
        "abgelaufener nicht übernommener Claim darf weiter abschließen",
        async () => {
          const id = await media();
          const a = pausedClaim(db);
          const work = processMedia(a.db, cfg);
          try {
            await a.entered;
            await expire(id);
          } finally {
            a.release();
            await work;
          }
          assert.equal((await state(id)).status, "ready");
          assert.equal((await state(id)).attempts, 1);
        },
      );

      await t.test(
        "abgelaufene Lease kann nach unterbrochener Arbeit neu übernommen werden",
        async () => {
          const id = await media();
          await db.query(
            "UPDATE media SET attempts=1,lease_until=now()-interval '1 second' WHERE id=$1",
            [id],
          );
          assert.equal(await processMedia(db, cfg), true);
          assert.equal((await state(id)).status, "ready");
          assert.equal((await state(id)).attempts, 2);
        },
      );

      for (const scenario of [
        "alter Erfolg nach failed",
        "alter Erfolg nach ready",
        "alter Fehler nach ready",
      ] as const) {
        await t.test(scenario, async () => {
          const id = await media();
          const a = pausedClaim(db);
          const work = processMedia(a.db, cfg);
          let completed: any;
          try {
            assert.equal((await a.entered).attempts, 1);
            await expire(id);
            if (scenario !== "alter Erfolg nach failed") {
              // B really analyzes a different valid original. A has retained its
              // first row, so restoring PNG afterwards makes its stale success
              // observably different from B's MP4 result.
              await writeFile(blobPath(cfg, id), f.videoBytes);
              await db.query(
                "UPDATE media SET mime='video/mp4',sha256=$2,size_bytes=$3 WHERE id=$1",
                [id, sha(f.videoBytes), f.videoBytes.length],
              );
            }
            assert.equal(
              await processMedia(
                db,
                scenario === "alter Erfolg nach failed" ? unavailable : cfg,
              ),
              true,
            );
            completed = await state(id);
            assert.equal(completed.attempts, 2);
            assert.equal(
              completed.status,
              scenario === "alter Erfolg nach failed" ? "failed" : "ready",
            );
            if (scenario === "alter Erfolg nach ready")
              await writeFile(blobPath(cfg, id), f.demoPng);
          } finally {
            a.release();
            await work;
          }
          assert.deepEqual(
            await state(id),
            completed,
            "Alter Claim hat das Ergebnis des neuen Workers überschrieben",
          );
        });
      }

      await t.test(
        "alter Erfolg verändert den noch arbeitenden Folgeclaim nicht",
        async () => {
          const id = await media();
          const a = pausedClaim(db),
            b = pausedClaim(db);
          const workA = processMedia(a.db, cfg);
          let workB: Promise<boolean> | undefined;
          try {
            await a.entered;
            await expire(id);
            workB = processMedia(b.db, cfg);
            assert.equal((await b.entered).attempts, 2);
            const processing = await state(id);
            a.release();
            await workA;
            assert.deepEqual(
              await state(id),
              processing,
              "Alter Claim hat laufenden Folgeclaim verändert",
            );
          } finally {
            a.release();
            b.release();
            await workA;
            await workB;
          }
          assert.equal((await state(id)).status, "ready");
          assert.equal((await state(id)).attempts, 2);
        },
      );

      for (const failure of [false, true]) {
        await t.test(
          `Statusschutz ohne Claimwechsel (${failure ? "Fehler" : "Erfolg"})`,
          async () => {
            const id = await media();
            const a = pausedClaim(db);
            const work = processMedia(a.db, failure ? unavailable : cfg);
            let completed: any;
            try {
              await a.entered;
              await db.query(
                "UPDATE media SET status='ready',analysis=$2,error=NULL,lease_until=NULL WHERE id=$1",
                [id, JSON.stringify({ synthetic: "external-final-state" })],
              );
              completed = await state(id);
            } finally {
              a.release();
              await work;
            }
            assert.deepEqual(
              await state(id),
              completed,
              "Abgeschlossener Zustand wurde bei gleicher Attemptnummer überschrieben",
            );
          },
        );
      }
      assert.equal(
        await processMedia(db, cfg),
        false,
        "Leere Warteschlange bleibt leer",
      );
    } finally {
      await f.close();
    }
  },
);
