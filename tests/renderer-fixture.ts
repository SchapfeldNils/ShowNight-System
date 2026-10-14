import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { LocalAccounts } from "../apps/local/src/accounts.js";
import { PackageStore } from "../apps/local/src/store.js";
import { hashPassword, totpSecret, totp } from "../apps/api/src/security.js";
import { offlineSnapshot } from "../packages/contracts/src/offline.js";
import { transferManifest } from "../packages/contracts/src/transfer.js";
import { packageHeader } from "../packages/transfer/src/archive.js";
export async function rendererFixture(
  media: { name: string; mime: string; bytes: Buffer }[] = [],
) {
  const root = await mkdtemp(join(tmpdir(), "shownight-renderer-test-")),
    accountsRoot = join(root, "accounts"),
    packageRoot = join(root, "packages");
  await mkdir(accountsRoot);
  await mkdir(packageRoot);
  const password = randomBytes(24).toString("hex"),
    secret = totpSecret(),
    key = randomBytes(32).toString("hex");
  const eventId = randomUUID(),
    adminId = randomUUID();
  const manifest = transferManifest.parse({
    schemaVersion: 1,
    id: randomUUID(),
    eventId,
    createdAt: new Date().toISOString(),
    eventRevision: 1,
    event: {
      name: "Synthetische Rendererdiagnose",
      date: null,
      location: "",
      modules: ["shows"],
    },
    shows: [],
    media: media.map((file) => {
      const id = randomUUID();
      return {
        id,
        name: file.name,
        mime: file.mime,
        sizeBytes: file.bytes.length,
        sha256: createHash("sha256").update(file.bytes).digest("hex"),
        downloadPath: "/api/v1/media/" + id + "/content",
      };
    }),
    status: "valid",
    errors: [],
    liveActivationSupported: false,
  });
  const snapshot = offlineSnapshot.parse({
    schemaVersion: 1,
    id: randomUUID(),
    serverOrigin: "https://renderer.example.test",
    sequence: 1,
    createdAt: new Date().toISOString(),
    packages: [
      { id: manifest.id, eventId, manifestSha: packageHeader(manifest).hash },
    ],
    users: [
      {
        id: adminId,
        login: "admin",
        displayName: "Synthetische Testadministration",
        admin: true,
        enabled: true,
        passwordHash: await hashPassword(password),
        mfaSecret: secret,
        grants: [],
      },
      {
        id: randomUUID(),
        login: "member",
        displayName: "Synthetisches Mitglied",
        admin: false,
        enabled: true,
        passwordHash: await hashPassword(password),
        mfaSecret: null,
        grants: [
          { eventId, roles: ["mitglied", "technik"], assignedShows: [] },
        ],
      },
    ],
  });
  const accounts = new LocalAccounts(accountsRoot, key),
    packages = new PackageStore(packageRoot);
  accounts.importSnapshot(snapshot);
  if (media.length) {
    const archive = join(root, "test.snpkg");
    await writeFile(
      archive,
      Buffer.concat([
        packageHeader(manifest).bytes,
        ...media.map((m) => m.bytes),
      ]),
    );
    await packages.importArchive(archive);
  }
  async function loginAdmin() {
    const login = await accounts.login("admin", password);
    if (!("challenge" in login)) throw new Error("MFA-Herausforderung fehlt.");
    return accounts.verify(login.challenge!, totp(secret));
  }
  return {
    root,
    password,
    secret,
    adminId,
    manifest,
    snapshot,
    accounts,
    packages,
    loginAdmin,
    close() {
      accounts.close();
      packages.close();
    },
  };
}
