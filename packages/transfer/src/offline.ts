import {
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  randomBytes,
  randomUUID,
  generateKeyPairSync,
  publicEncrypt,
  privateDecrypt,
  createCipheriv,
  createDecipheriv,
  sign,
  verify,
  createHash,
} from "node:crypto";
import {
  localTarget,
  serverTrust,
  offlineSnapshot,
  offlineEnvelope,
  offlineBytes,
  type OfflineSnapshot,
} from "../../contracts/src/offline.js";
export const keyFingerprint = (pem: string) =>
  createHash("sha256")
    .update(createPublicKey(pem).export({ format: "der", type: "spki" }))
    .digest("hex");
export function signer(masterKey: string) {
  const seed = Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(masterKey, "hex"),
      Buffer.alloc(0),
      "ShowNight/offline-signing/v1",
      32,
    ),
  );
  return createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      seed,
    ]),
    format: "der",
    type: "pkcs8",
  });
}
export function trustFor(masterKey: string, serverOrigin: string) {
  const publicKey = createPublicKey(signer(masterKey))
    .export({ type: "spki", format: "pem" })
    .toString();
  return serverTrust.parse({
    schemaVersion: 1,
    serverOrigin,
    publicKey,
    fingerprint: keyFingerprint(publicKey),
  });
}
export function createTarget() {
  const keys = generateKeyPairSync("rsa", {
    modulusLength: 3072,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return {
    target: localTarget.parse({
      schemaVersion: 1,
      targetId: randomUUID(),
      publicKey: keys.publicKey,
    }),
    privateKey: keys.privateKey,
  };
}
function core(e: any) {
  return {
    schemaVersion: e.schemaVersion,
    targetId: e.targetId,
    serverOrigin: e.serverOrigin,
    sequence: e.sequence,
    wrappedKey: e.wrappedKey,
    iv: e.iv,
    tag: e.tag,
    ciphertext: e.ciphertext,
  };
}
function aad(e: any) {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: e.schemaVersion,
      targetId: e.targetId,
      serverOrigin: e.serverOrigin,
      sequence: e.sequence,
    }),
  );
}
export function encryptSnapshot(
  value: OfflineSnapshot,
  targetValue: unknown,
  masterKey: string,
) {
  const s = offlineSnapshot.parse(value),
    t = localTarget.parse(targetValue),
    publicKey = createPublicKey(t.publicKey);
  if (
    publicKey.asymmetricKeyType !== "rsa" ||
    (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 3072
  )
    throw new Error("RSA-Zielschlüssel nicht unterstützt.");
  const plaintext = Buffer.from(JSON.stringify(s));
  if (plaintext.length > offlineBytes / 2)
    throw new Error("Anmeldestand zu groß.");
  const key = randomBytes(32),
    iv = randomBytes(12);
  const base = {
    schemaVersion: 1 as const,
    targetId: t.targetId,
    serverOrigin: s.serverOrigin,
    sequence: s.sequence,
  };
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(base));
  const unsigned = {
    ...base,
    wrappedKey: publicEncrypt(
      { key: publicKey, oaepHash: "sha256" },
      key,
    ).toString("base64"),
    iv: iv.toString("base64"),
    tag: "",
    ciphertext: Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]).toString("base64"),
  };
  unsigned.tag = cipher.getAuthTag().toString("base64");
  return offlineEnvelope.parse({
    ...unsigned,
    signature: sign(
      null,
      Buffer.from(JSON.stringify(core(unsigned))),
      signer(masterKey),
    ).toString("base64"),
  });
}
export function decryptSnapshot(
  value: unknown,
  privateKey: string,
  targetId: string,
  trustValue: unknown,
) {
  const e = offlineEnvelope.parse(value),
    trust = serverTrust.parse(trustValue),
    pub = createPublicKey(trust.publicKey);
  if (
    pub.asymmetricKeyType !== "ed25519" ||
    keyFingerprint(trust.publicKey) !== trust.fingerprint ||
    e.targetId !== targetId ||
    e.serverOrigin !== trust.serverOrigin ||
    !verify(
      null,
      Buffer.from(JSON.stringify(core(e))),
      pub,
      Buffer.from(e.signature, "base64"),
    )
  )
    throw new Error(
      "Anmeldestand stammt nicht vom eingerichteten Server/Ziel.",
    );
  const key = privateDecrypt(
    { key: privateKey, oaepHash: "sha256" },
    Buffer.from(e.wrappedKey, "base64"),
  );
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(e.iv, "base64"));
  d.setAAD(aad(e));
  d.setAuthTag(Buffer.from(e.tag, "base64"));
  const data = Buffer.concat([
    d.update(Buffer.from(e.ciphertext, "base64")),
    d.final(),
  ]);
  if (data.length > offlineBytes / 2) throw new Error("Anmeldestand zu groß.");
  const s = offlineSnapshot.parse(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)),
  );
  if (s.sequence !== e.sequence || s.serverOrigin !== e.serverOrigin)
    throw new Error("Anmeldestand widersprüchlich.");
  return s;
}
