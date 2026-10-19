// Synthetic isolated-container probe. Its enroll stdout is a PRIVATE fixture,
// including the synthetic MFA secret; redirect it to a protected file, not logs.
import { createHash, createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const ensure = (condition) => {
  if (!condition) throw new Error("probe");
};
export function totp(secret, counter) {
  ensure(
    /^[A-Z2-7]+$/.test(secret) && Number.isSafeInteger(counter) && counter >= 0,
  );
  let bits = 0,
    value = 0;
  const bytes = [];
  for (const letter of secret) {
    value = (value << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(letter);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  const count = Buffer.alloc(8);
  count.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(count).digest();
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonHash = (value) => hash(JSON.stringify(canonical(value)));

async function run() {
  const mode = process.env.SN_PROBE_MODE;
  const schema = Number(process.env.SN_PROBE_SCHEMA);
  const password = process.env.SN_PROBE_PASSWORD;
  ensure(
    ["enroll", "check"].includes(mode) &&
      [6, 7, 8].includes(schema) &&
      typeof password === "string" &&
      password.length >= 12,
  );
  const fixture =
    mode === "check" ? JSON.parse(process.env.SN_PROBE_FIXTURE) : null;
  let cookie = "",
    csrf = "";
  async function request(
    path,
    { body, authenticated = false, status = 200, bytes = false } = {},
  ) {
    const response = await fetch("http://127.0.0.1:3000" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(authenticated ? { cookie, "x-csrf-token": csrf } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
    ensure(response.status === status);
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    if (bytes) return Buffer.from(await response.arrayBuffer());
    return response.json();
  }
  const ready = await request("/health/ready");
  ensure(ready.status === "ready" && ready.schemaVersion === schema);
  await request("/api/v1/me", { status: 401 });
  await request("/api/v1/events", { status: 401 });
  await request("/api/v1/auth/login", {
    body: { login: "release-admin", password: password + "-wrong" },
    status: 401,
  });
  const login = await request("/api/v1/auth/login", {
    body: { login: "release-admin", password },
  });
  ensure(
    login.authenticated === false &&
      typeof login.challenge === "string" &&
      !cookie &&
      login.setup === (mode === "enroll"),
  );
  await request("/api/v1/me", { status: 401 });
  const secret = mode === "enroll" ? login.secret : fixture.mfaSecret;
  ensure(typeof secret === "string");
  // Reject the historic code, then wait for a new wall-clock code. Historic
  // rejection alone may also mean expiry; a fresh-challenge replay below
  // separately verifies replay protection. No future or recovery codes are used.
  if (mode === "check") {
    ensure(Number.isSafeInteger(fixture.lastCounter));
    await request("/api/v1/auth/mfa/verify", {
      body: {
        challenge: login.challenge,
        code: totp(secret, fixture.lastCounter),
      },
      status: 401,
    });
    const wait = (fixture.lastCounter + 1) * 30000 + 100 - Date.now();
    ensure(wait <= 31000);
    if (wait > 0) await delay(wait);
  } else {
    const counter = Math.floor(Date.now() / 30000);
    const valid = new Set(
      [-1, 0, 1].map((offset) => totp(secret, counter + offset)),
    );
    let wrong = "000000";
    while (valid.has(wrong)) wrong = String(Number(wrong) + 1).padStart(6, "0");
    await request("/api/v1/auth/mfa/verify", {
      body: { challenge: login.challenge, code: wrong },
      status: 401,
    });
  }
  const counter = Math.floor(Date.now() / 30000);
  const verified = await request("/api/v1/auth/mfa/verify", {
    body: { challenge: login.challenge, code: totp(secret, counter) },
  });
  ensure(
    verified.authenticated === true &&
      cookie &&
      typeof verified.csrfToken === "string",
  );
  csrf = verified.csrfToken; // Recovery codes in this response are never retained.
  const replay = await request("/api/v1/auth/login", {
    body: { login: "release-admin", password },
  });
  ensure(replay.authenticated === false && replay.setup === false);
  await request("/api/v1/auth/mfa/verify", {
    body: { challenge: replay.challenge, code: totp(secret, counter) },
    status: 401,
  });
  const me = await request("/api/v1/me", { authenticated: true });
  ensure(
    me.admin === true &&
      me.mfaVerified === true &&
      me.login === "release-admin",
  );
  const diagnostics = await request("/api/v1/diagnostics", {
    authenticated: true,
  });
  ensure(
    diagnostics.mode === "online-preparation" &&
      diagnostics.mail.realDeliveryEnabled === false,
  );
  if (mode === "enroll")
    await request("/api/v1/events", {
      authenticated: true,
      body: { name: "Synthetische Netcup-Releaseprüfung", template: "custom" },
    });
  const events = await request("/api/v1/events", { authenticated: true });
  ensure(events.length >= 2);
  const shows = new Map();
  for (const eventId of [null, ...events.map((event) => event.id)]) {
    const found = await request(
      "/api/v1/shows" + (eventId ? "?eventId=" + eventId : ""),
      { authenticated: true },
    );
    for (const show of found) shows.set(show.id, show);
  }
  ensure(shows.size >= 2);
  const media = new Map();
  for (const show of shows.values()) {
    const found = await request("/api/v1/media?showId=" + show.id, {
      authenticated: true,
    });
    for (const item of found) media.set(item.id, item);
  }
  ensure(media.size > 0);
  const mediaProof = [];
  for (let item of media.values()) {
    for (
      let attempt = 0;
      item.status === "processing" && attempt < 60;
      attempt++
    ) {
      await delay(500);
      item = await request("/api/v1/media/" + item.id, { authenticated: true });
    }
    ensure(item.status === "ready");
    await request("/api/v1/media/" + item.id + "/content", { status: 401 });
    const bytes = await request("/api/v1/media/" + item.id + "/content", {
      authenticated: true,
      bytes: true,
    });
    ensure(
      bytes.length > 0 &&
        bytes.length === item.sizeBytes &&
        hash(bytes) === item.sha256,
    );
    mediaProof.push({
      id: item.id,
      sha256: hash(bytes),
      sizeBytes: bytes.length,
    });
  }
  const snapshot = {
    userId: me.id,
    events: events
      .map((event) => ({ id: event.id, hash: jsonHash(event) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    shows: [...shows.values()]
      .map((show) => ({ id: show.id, hash: jsonHash(show) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    media: mediaProof.sort((a, b) => a.id.localeCompare(b.id)),
  };
  if (mode === "enroll")
    return { version: 1, ...snapshot, mfaSecret: secret, lastCounter: counter };
  ensure(fixture.version === 1 && snapshot.userId === fixture.userId);
  for (const kind of ["events", "shows", "media"])
    ensure(JSON.stringify(snapshot[kind]) === JSON.stringify(fixture[kind]));
  return {
    passed: true,
    schema,
    events: events.length,
    shows: shows.size,
    media: media.size,
    freshMfa: true,
    unauthenticatedDenied: true,
    byteHashesVerified: true,
  };
}

if (
  process.argv[1] === "-" ||
  process.argv[1]?.endsWith("netcup-release-probe.mjs")
) {
  try {
    process.stdout.write(JSON.stringify(await run()) + "\n");
  } catch {
    process.stderr.write("Isolierte Netcup-Releaseprobe fehlgeschlagen.\n");
    process.exitCode = 1;
  }
}
