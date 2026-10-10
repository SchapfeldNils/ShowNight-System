import { readFile, writeFile, lstat, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  createTarget,
  decryptSnapshot,
} from "../../../packages/transfer/src/offline.js";
import {
  localTarget,
  serverTrust,
  offlineBytes,
} from "../../../packages/contracts/src/offline.js";
import {
  protectBytes,
  unprotectBytes,
  secureDirectory,
  powershell,
} from "../../agent/src/identity.js";
import type { PackageStore } from "./store.js";
import type { LocalAccounts } from "./accounts.js";
const schema = z.strictObject({
  version: z.literal(1),
  target: localTarget,
  privateKey: z.string().max(8192),
  key: z.string().regex(/^[0-9a-f]{64}$/),
  pfxPassword: z.string().min(32).max(100),
  origin: z.literal("https://localhost:3443"),
  trust: serverTrust.nullable(),
});
export type Vault = z.infer<typeof schema>;
export async function boundedJson(path: string, limit = offlineBytes) {
  if (!(await lstat(path)).isFile() || (await lstat(path)).size > limit)
    throw new Error("Unzulässige Datei.");
  const bytes = await readFile(path);
  if (bytes.length > limit) throw new Error("Datei zu groß.");
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export async function saveVault(root: string, value: Vault, initial = false) {
  const v = schema.parse(value);
  const encrypted = await protectBytes(Buffer.from(JSON.stringify(v))),
    target = join(root, "server.dpapi");
  if (initial) {
    await writeFile(target, encrypted, { mode: 0o600, flag: "wx" });
    return;
  }
  const temp = join(root, randomUUID() + ".dpapi.tmp");
  try {
    await writeFile(temp, encrypted, { mode: 0o600, flag: "wx" });
    await rename(temp, target);
  } finally {
    await unlink(temp).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}
export async function loadVault(root: string) {
  return schema.parse(
    JSON.parse(
      (
        await unprotectBytes(await readFile(join(root, "server.dpapi"), "utf8"))
      ).toString("utf8"),
    ),
  );
}
export async function initVault(root: string, secrets: string) {
  await secureDirectory(root);
  await secureDirectory(secrets);
  try {
    await lstat(join(root, "server.dpapi"));
    throw new Error("Lokaler Server bereits eingerichtet.");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const t = createTarget(),
    v = schema.parse({
      version: 1,
      target: t.target,
      privateKey: t.privateKey,
      key: randomBytes(32).toString("hex"),
      pfxPassword: randomBytes(32).toString("base64url"),
      origin: "https://localhost:3443",
      trust: null,
    });
  const recovery = randomBytes(32).toString("base64url");
  // The certificate and private key stay in the protected server directory.
  // No trusted-root installation, firewall modification or machine-store access.
  await powershell(
    "Import-Module Microsoft.PowerShell.Security;$v=[Console]::In.ReadToEnd()|ConvertFrom-Json;$cert=$null;try{$cert=New-SelfSignedCertificate -Type SSLServerAuthentication -Subject 'CN=localhost' -TextExtension @('2.5.29.17={text}DNS=localhost&IPAddress=127.0.0.1&IPAddress=::1') -CertStoreLocation 'Cert:\\CurrentUser\\My' -KeyExportPolicy Exportable -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(1);$pwd=ConvertTo-SecureString $v.password -AsPlainText -Force;Export-PfxCertificate -Cert $cert -FilePath ([IO.Path]::Combine($v.root,'server.pfx')) -Password $pwd -CryptoAlgorithmOption AES256_SHA256|Out-Null;Export-Certificate -Cert $cert -FilePath ([IO.Path]::Combine($v.root,'server.cer'))|Out-Null;}finally{if($cert){Remove-Item -LiteralPath ('Cert:\\CurrentUser\\My\\'+$cert.Thumbprint)}}",
    JSON.stringify({ root, password: v.pfxPassword }),
  );
  await writeFile(
    join(root, "server.sntarget"),
    JSON.stringify(v.target, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(
    join(secrets, "local-server-recovery.env"),
    "LOCAL_RECOVERY_KEY=" +
      recovery +
      "\nLOCAL_RECOVERY_USER=\nLOCAL_RECOVERY_PASSWORD=\n",
    { flag: "wx", mode: 0o600 },
  );
  await saveVault(root, v, true);
  return { vault: v, recovery };
}
export async function importAccounts(
  path: string,
  v: Vault,
  packages: PackageStore,
  accounts: LocalAccounts,
) {
  if (!v.trust)
    throw new Error("Serververtrauen zuerst ausdrücklich einrichten.");
  const s = decryptSnapshot(
    await boundedJson(path),
    v.privateKey,
    v.target.targetId,
    v.trust,
  );
  for (const p of s.packages) {
    const local = packages.metadata(p.id);
    // A semantically identical noncanonical header is accepted only if its
    // canonical contents match the signed server manifest.
    const { packageHeader } = await import(
      "../../../packages/transfer/src/archive.js"
    );
    if (
      local.manifest.eventId !== p.eventId ||
      packageHeader(local.manifest).hash !== p.manifestSha ||
      (await packages.verify(p.id)).status !== "valid"
    )
      throw new Error("Inhaltspaket fehlt, ist verändert oder unvollständig.");
  }
  return accounts.importSnapshot(s);
}
