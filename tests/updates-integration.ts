import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture, multipartFile } from "./fixture.js";
import { hash, hashPassword, totp } from "../apps/api/src/security.js";
import { trustFor } from "../packages/transfer/src/offline.js";
import { updateFileName } from "../packages/contracts/src/updates.js";
import { checkForUpdate, verifyRelease } from "../apps/local/src/updates.js";
import { syntheticSetup } from "./update-fixture.js";

test(
  "Issue #33: Softwareupdates veröffentlichen, öffentlich prüfbar abrufen, zurückziehen",
  { timeout: 180000 },
  async (t) => {
    const f = await fixture(55460),
      { db, app, cfg } = f;
    type Session = { cookie: string; csrf: string };
    const anonymous: Session = { cookie: "", csrf: "" };
    let admin: Session = anonymous;
    const inject = (
      url: string,
      method = "GET",
      as = admin,
      extra: Record<string, unknown> = {},
      headers: Record<string, string> = {},
    ) =>
      app.inject({
        url,
        method: method as any,
        headers: {
          origin: cfg.origin,
          cookie: as.cookie,
          "x-csrf-token": as.csrf,
          ...headers,
        },
        ...extra,
      });
    const upload = (version: string | null, bytes: Buffer, as = admin) => {
      const body = multipartFile(bytes, updateFileName);
      return inject(
        "/api/v1/software-updates" +
          (version === null ? "" : "?version=" + version),
        "POST",
        as,
        { payload: body.payload },
        { "content-type": body.contentType },
      );
    };
    const setup = (version = "0.3.12", size = 2048) =>
      syntheticSetup(version, size);
    const trust = trustFor(cfg.MFA_ENCRYPTION_KEY, cfg.origin);
    try {
      const first = await inject("/api/v1/auth/login", "POST", anonymous, {
        payload: { login: "admin", password: f.adminPassword },
      });
      const verified = await inject(
        "/api/v1/auth/mfa/verify",
        "POST",
        anonymous,
        {
          payload: {
            challenge: first.json().challenge,
            code: totp(first.json().secret),
          },
        },
      );
      assert.equal(verified.statusCode, 200);
      admin = {
        cookie: "sn_session=" + verified.cookies[0].value,
        csrf: verified.json().csrfToken,
      };

      await t.test("Ohne Veröffentlichung kein Update", async () => {
        const latest = await inject("/updates/v1/windows-x64/latest.json");
        assert.equal(latest.statusCode, 404);
      });

      await t.test("Nur Admin mit Sitzung, CSRF und Ursprung", async () => {
        const memberId = randomUUID(),
          raw = randomBytes(32).toString("hex"),
          csrf = randomBytes(20).toString("hex");
        await db.query(
          "INSERT INTO users(id,login,display_name,password_hash) VALUES($1,'update-mitglied','Mitglied',$2)",
          [memberId, await hashPassword(randomBytes(20).toString("hex"))],
        );
        await db.query(
          "INSERT INTO sessions(token_hash,user_id,csrf_token,mfa_verified,expires_at) VALUES($1,$2,$3,false,now()+interval '1 hour')",
          [hash(raw), memberId, csrf],
        );
        const member = { cookie: "sn_session=" + raw, csrf };
        assert.equal((await upload("0.3.12", setup(), member)).statusCode, 403);
        assert.equal(
          (await inject("/api/v1/software-updates", "GET", member)).statusCode,
          403,
        );
        assert.equal(
          (await upload("0.3.12", setup(), anonymous)).statusCode,
          401,
        );
        assert.equal(
          (
            await upload("0.3.12", setup(), {
              ...admin,
              csrf: "falsch",
            })
          ).statusCode,
          403,
        );
        assert.equal(
          (await inject("/updates/v1/windows-x64/latest.json")).statusCode,
          404,
        );
      });

      await t.test("Ungültige Uploads veröffentlichen nichts", async () => {
        const missing = await upload(
          null,
          Buffer.concat([Buffer.from("MZ"), Buffer.alloc(2000)]),
        );
        assert.equal(missing.statusCode, 415);
        assert.equal(missing.json().error.code, "VERSION_MISSING");
        const mismatch = await upload("0.3.13", setup("0.3.12"));
        assert.equal(mismatch.statusCode, 400);
        assert.equal(mismatch.json().error.code, "VERSION_MISMATCH");
        assert.equal((await upload("1.2", setup())).statusCode, 400);
        assert.equal((await upload("../1.2.3", setup())).statusCode, 400);
        assert.equal(
          (await upload("0.3.12", Buffer.from("PK" + "x".repeat(2000))))
            .statusCode,
          415,
        );
        assert.equal(
          (await upload("0.3.12", setup("0.3.12", 1000))).statusCode,
          415,
        );
        assert.equal(
          (await upload("0.3.12", setup("0.3.12", cfg.MAX_UPLOAD_BYTES + 10)))
            .statusCode,
          413,
        );
        assert.deepEqual((await inject("/api/v1/software-updates")).json(), []);
      });

      const bytes = setup();
      await t.test(
        "Veröffentlichen, signiertes Manifest und Download",
        async () => {
          const published = await upload(null, bytes);
          assert.equal(published.statusCode, 200, published.body);
          const manifest = published.json();
          assert.equal(manifest.version, "0.3.12");
          assert.equal(manifest.size, bytes.length);
          assert.equal(
            manifest.sha256,
            createHash("sha256").update(bytes).digest("hex"),
          );
          assert.equal((await upload("0.3.12", setup())).statusCode, 409);
          assert.equal((await upload(null, setup())).statusCode, 409);
          const latest = await inject(
            "/updates/v1/windows-x64/latest.json",
            "GET",
            anonymous,
          );
          assert.equal(latest.statusCode, 200);
          assert.deepEqual(
            verifyRelease(latest.json(), trust.publicKey),
            manifest,
          );
          const download = await inject(
            `/updates/v1/windows-x64/0.3.12/${updateFileName}`,
            "GET",
            anonymous,
          );
          assert.equal(download.statusCode, 200);
          assert.deepEqual(download.rawPayload, bytes);
          assert.equal(
            (
              await inject(
                `/updates/v1/windows-x64/..%2F..%2Fsecret/${updateFileName}`,
                "GET",
                anonymous,
              )
            ).statusCode,
            404,
          );
        },
      );

      await t.test(
        "Lokale Prüfung gegen den echten Onlineserver (synthetisch)",
        async () => {
          const dir = await mkdtemp(join(tmpdir(), "shownight-update-e2e-"));
          const fetchImpl = async (url: string) => {
            const r = await app.inject({
              url: new URL(url).pathname + new URL(url).search,
            });
            return new Response(new Uint8Array(r.rawPayload), {
              status: r.statusCode,
            });
          };
          const status = await checkForUpdate({
            origin: "https://shownight.example.invalid",
            publicKey: trust.publicKey,
            current: "0.3.11",
            dir,
            fetchImpl,
          });
          assert.equal(status.state, "ready");
          if (status.state === "ready")
            assert.deepEqual(await readFile(status.path), bytes);
        },
      );

      await t.test("Ältere Version und Zurückziehen", async () => {
        assert.equal((await upload(null, setup("0.3.11"))).statusCode, 200);
        assert.deepEqual(
          (await inject("/api/v1/software-updates"))
            .json()
            .map((r: any) => r.version),
          ["0.3.12", "0.3.11"],
        );
        assert.equal(
          (await inject("/updates/v1/windows-x64/latest.json")).json().manifest
            .version,
          "0.3.12",
        );
        const withdrawn = await inject(
          "/api/v1/software-updates/0.3.12",
          "DELETE",
        );
        assert.equal(withdrawn.statusCode, 200);
        assert.deepEqual(
          withdrawn.json().map((r: any) => r.version),
          ["0.3.11"],
        );
        assert.equal(
          (await inject("/updates/v1/windows-x64/latest.json")).json().manifest
            .version,
          "0.3.11",
        );
        assert.equal(
          (await inject(`/updates/v1/windows-x64/0.3.12/${updateFileName}`))
            .statusCode,
          404,
        );
        assert.equal(
          (await inject("/api/v1/software-updates/0.3.12", "DELETE"))
            .statusCode,
          404,
        );
      });
    } finally {
      await f.close();
    }
  },
);
