import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  checkPassword,
  hashPassword,
  seal,
  unseal,
  totp,
  verifyTotp,
} from "../apps/api/src/security.js";
import { config } from "../apps/api/src/config.js";
import {
  eventCreate,
  showPatch,
  manifest,
} from "../packages/contracts/src/index.js";
import { safeName } from "../apps/api/src/media.js";
test("S1-03: Kennwortableitung, RFC 6238-Vektor, Verschlüsselung und Replay-Schutz", async () => {
  const pw = randomBytes(20).toString("hex"),
    h = await hashPassword(pw);
  assert.notEqual(h, await hashPassword(pw));
  assert(await checkPassword(pw, h));
  assert(!(await checkPassword("incorrect", h)));
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totp(secret, 1), "287082");
  const now = Math.floor(Date.now() / 30000);
  assert.equal(verifyTotp(secret, totp(secret, now), now), null);
  assert.equal(verifyTotp(secret, totp(secret, now), now - 1), now);
  const key = randomBytes(32).toString("hex"),
    cipher = seal(secret, key);
  assert.equal(unseal(cipher, key), secret);
  assert.throws(() => unseal(cipher, randomBytes(32).toString("hex")));
});
test("S1-05/07: gemeinsame strikte Verträge und Pfadschutz", () => {
  assert.equal(
    eventCreate.parse({ name: " Nur ein Name " }).name,
    "Nur ein Name",
  );
  assert(!eventCreate.safeParse({ name: "", actorId: "spoof" }).success);
  for (const filename of [
    "../x.png",
    "a/b.png",
    "a\\b.png",
    "bad\x00.png",
    "..png",
  ])
    assert.throws(() => safeName(filename));
  assert.equal(safeName("Bühnenbild.png"), "Bühnenbild.png");
  assert(!showPatch.safeParse({ expectedRevision: 0, name: "x" }).success);
  assert(!manifest.safeParse({ schemaVersion: 2 }).success);
});
test("Mailkonfiguration: kein Demo-Echtversand und kein unvollständiger SMTP-Betrieb", () => {
  const env = {
    DATABASE_URL: "postgres://localhost/test",
    MFA_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  };
  assert.equal(config(env).MAIL_DELIVERY_ENABLED, "false");
  assert.throws(() => config({ ...env, MAIL_DELIVERY_ENABLED: "true" }));
  assert.throws(() =>
    config({ ...env, DEMO_ENABLED: "true", MAIL_DELIVERY_ENABLED: "true" }),
  );
  assert.equal(
    config({ ...env, MAIL_FROM_ADDRESS: "", SMTP_USER: "" }).MAIL_FROM_ADDRESS,
    undefined,
  );
});
