import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSecureContext } from "node:tls";
import { initVault } from "../apps/local/src/vault.js";
import { certificatePairInfo } from "../apps/local/src/network.js";
import { startupStatus } from "../apps/local/src/startup.js";

test(
  "Windows: CER/PFX samt privatem Schlüssel müssen übereinstimmen; Status verändert keine Identität",
  { skip: process.platform !== "win32", timeout: 90000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "shownight-certificate-pair-"));
    const root = join(dir, "profile-a"),
      other = join(dir, "profile-b");
    const a = (await initVault(root, join(dir, "secrets-a"))).vault;
    const b = (await initVault(other, join(dir, "secrets-b"))).vault;
    const cer = await readFile(join(root, "server.cer"));
    const pfx = await readFile(join(root, "server.pfx"));
    const otherCer = await readFile(join(other, "server.cer"));
    const otherPfx = await readFile(join(other, "server.pfx"));
    assert.doesNotThrow(() =>
      createSecureContext({ pfx, passphrase: a.pfxPassword }),
    );
    assert.equal(
      (await certificatePairInfo(cer, pfx, a.pfxPassword, a.origin)).host,
      "localhost",
    );
    await assert.rejects(
      certificatePairInfo(cer, otherPfx, b.pfxPassword, a.origin),
      /unterschiedliche Zertifikate/,
    );
    await assert.rejects(
      certificatePairInfo(cer, pfx, "wrong-synthetic-password", a.origin),
    );
    await assert.rejects(certificatePairInfo(cer, cer, "", a.origin));
    await assert.rejects(
      certificatePairInfo(
        cer,
        Buffer.from("corrupt-pfx"),
        a.pfxPassword,
        a.origin,
      ),
    );
    // Both certificates are valid for localhost, but only one matches the PFX.
    await writeFile(join(root, "server.cer"), otherCer);
    const preserved = await Promise.all(
      ["server.dpapi", "server.pfx", "server.cer", "server.sntarget"].map(
        (name) => readFile(join(root, name)),
      ),
    );
    const status = await startupStatus(root, join(dir, "packages"));
    assert.equal(status.ready, false);
    assert.match(
      status.lines.join("\n"),
      /CER\/PFX\/Schlüssel widersprüchlich/,
    );
    assert.doesNotMatch(
      status.lines.join("\n"),
      /Adress-\/Gültigkeitsprüfung bestanden/,
    );
    assert.deepEqual(
      await Promise.all(
        ["server.dpapi", "server.pfx", "server.cer", "server.sntarget"].map(
          (name) => readFile(join(root, name)),
        ),
      ),
      preserved,
    );
  },
);
