import { test } from "node:test";
import assert from "node:assert/strict";
import { totp, canonical } from "./netcup-release-probe.mjs";

test("Releaseprobe: TOTP entspricht RFC6238 SHA1 und fordert sechs Stellen", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totp(secret, 1), "287082");
  assert.equal(totp(secret, 37037036), "081804");
  assert.throws(() => totp("invalid", 1));
});
test("Releaseprobe: Objektvergleich ist schlüsselstabil und erhält Arrayreihenfolge", () => {
  assert.deepEqual(canonical({ z: [{ b: 2, a: 1 }], a: 0 }), {
    a: 0,
    z: [{ a: 1, b: 2 }],
  });
  assert.notDeepEqual(canonical([1, 2]), canonical([2, 1]));
});
