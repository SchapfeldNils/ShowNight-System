import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, X509Certificate } from "node:crypto";
import { mkdir, writeFile, readFile, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { powershell } from "../apps/agent/src/identity.js";
import { request as httpsRequest } from "node:https";
import { checkServerIdentity } from "node:tls";
import { DatabaseSync } from "node:sqlite";
import { database, migrate } from "../apps/api/src/db.js";
import { fixture, multipartFile } from "./fixture.js";
import { totp, hashPassword, seal } from "../apps/api/src/security.js";
import { processMedia } from "../apps/api/src/worker.js";
import {
  decryptSnapshot,
  createTarget,
  encryptSnapshot,
  trustFor,
} from "../packages/transfer/src/offline.js";
import {
  offlineSnapshot,
  type OfflineSnapshot,
} from "../packages/contracts/src/offline.js";
import { PackageStore } from "../apps/local/src/store.js";
import { LocalAccounts } from "../apps/local/src/accounts.js";
import { localServer } from "../apps/local/src/server.js";
import { importAccounts, loadVault } from "../apps/local/src/vault.js";
import {
  lanOrigin,
  assignedAddress,
  certificateInfo,
} from "../apps/local/src/network.js";
test("S3-02: signierte Offlinekonten, MFA, Rechte und lokaler HTTPS-Dienst", async (t) => {
  const f = await fixture(55436),
    target = createTarget(),
    trust = trustFor(f.cfg.MFA_ENCRYPTION_KEY, f.cfg.origin);
  const root = join(f.dir, "local"),
    packageRoot = join(f.dir, "packages");
  await mkdir(root);
  await mkdir(packageRoot);
  const key = randomBytes(32).toString("hex"),
    recovery = randomBytes(32).toString("base64url");
  let accounts = new LocalAccounts(root, key);
  accounts.configureRecovery(recovery);
  const packages = new PackageStore(packageRoot);
  const local = await localServer(accounts, packages, "https://localhost:3443");
  let cookie = "",
    csrf = "",
    onlineSecret = "",
    snapshot: OfflineSnapshot,
    envelope: any,
    manifest: any,
    eventId = "",
    mediaId = "",
    memberId = "",
    leadId = "",
    secondEvent = "";
  const memberPassword = randomBytes(18).toString("hex"),
    leadPassword = randomBytes(18).toString("hex");
  const online = (path: string, method = "GET", payload?: unknown) =>
    f.app.inject({
      url: "/api/v1" + path,
      method: method as any,
      headers: { cookie, origin: f.cfg.origin, "x-csrf-token": csrf },
      ...(payload === undefined ? {} : { payload: payload as any }),
    });
  let lc = "",
    ls = "";
  const req = (
    path: string,
    method = "GET",
    payload?: unknown,
    headers?: Record<string, string>,
  ) =>
    local.inject({
      url: "/api/local" + path,
      method: method as any,
      headers: {
        cookie: lc,
        origin: "https://localhost:3443",
        "x-csrf-token": ls,
        ...headers,
      },
      ...(payload === undefined ? {} : { payload: payload as any }),
    });
  const adminLogin = async (code: string) => {
    const r = await req("/auth/login", "POST", {
      login: "admin",
      password: f.adminPassword,
    });
    assert.equal(r.statusCode, 200, r.body);
    const v = await req("/auth/mfa/verify", "POST", {
      challenge: r.json().challenge,
      code,
    });
    assert.equal(v.statusCode, 200, v.body);
    lc = "sn_local_session=" + v.cookies[0].value;
    ls = v.json().csrfToken;
    return v;
  };
  const mfaLogin = async (password = f.adminPassword) => {
    const r = await accounts.login("admin", password);
    assert.ok("challenge" in r);
    return r;
  };
  try {
    await t.test(
      "Onlineexport: authentifiziert, eventgebunden, verschlüsselt und ohne Online-Recoverydaten",
      async () => {
        assert.equal((await online("/offline/trust")).statusCode, 401);
        const l = await online("/auth/login", "POST", {
          login: "admin",
          password: f.adminPassword,
        });
        onlineSecret = l.json().secret;
        const v = await online("/auth/mfa/verify", "POST", {
          challenge: l.json().challenge,
          code: totp(onlineSecret),
        });
        assert.equal(v.statusCode, 200, v.body);
        cookie = "sn_session=" + v.cookies[0].value;
        csrf = v.json().csrfToken;
        eventId = (
          await online("/events", "POST", {
            name: "Synthetischer Offlineabend",
          })
        ).json().id;
        secondEvent = (
          await online("/events", "POST", { name: "Zweite Berechtigung" })
        ).json().id;
        const upload = multipartFile(f.demoPng);
        const u = await f.app.inject({
          url: "/api/v1/media/uploads?eventId=" + eventId,
          method: "POST",
          headers: {
            cookie,
            origin: f.cfg.origin,
            "x-csrf-token": csrf,
            "content-type": upload.contentType,
          },
          payload: upload.payload,
        });
        assert.equal(u.statusCode, 200, u.body);
        mediaId = u.json().id;
        await processMedia(f.db, f.cfg);
        manifest = (
          await online("/events/" + eventId + "/packages", "POST", {})
        ).json();
        assert.equal(manifest.status, "valid");
        for (const [login, pass, role] of [
          ["member", memberPassword, "mitglied"],
          ["lead", leadPassword, "leitung"],
        ]) {
          const uid = randomUUID();
          if (role === "leitung") leadId = uid;
          else memberId = uid;
          await f.db.query(
            "INSERT INTO users(id,login,display_name,password_hash) VALUES($1,$2,$2,$3)",
            [uid, login, await hashPassword(pass)],
          );
          await f.db.query("INSERT INTO grants VALUES($1,$2,$3)", [
            eventId,
            uid,
            role,
          ]);
        }
        await f.db.query("INSERT INTO grants VALUES($1,$2,'mitglied')", [
          secondEvent,
          memberId,
        ]);
        await f.db.query(
          "INSERT INTO users(id,login,display_name,password_hash,admin,mfa_secret) VALUES($1,'backup.admin','Zweiter vorbereiteter Admin',$2,true,$3)",
          [
            randomUUID(),
            await hashPassword(f.adminPassword),
            seal(onlineSecret, f.cfg.MFA_ENCRYPTION_KEY),
          ],
        );
        await f.db.query(
          "INSERT INTO users(id,login,display_name,password_hash) VALUES($1,'outsider','Außerhalb',$2)",
          [randomUUID(), await hashPassword(memberPassword)],
        );
        const e = await online("/offline/exports", "POST", {
          target: target.target,
          packageIds: [manifest.id],
        });
        assert.equal(e.statusCode, 200, e.body);
        envelope = e.json();
        assert.equal(e.body.includes(onlineSecret), false);
        assert.equal(e.body.includes("passwordHash"), false);
        snapshot = decryptSnapshot(
          envelope,
          target.privateKey,
          target.target.targetId,
          trust,
        );
        assert.equal(snapshot.users.length, 4);
        assert.equal(
          snapshot.users.find((u) => u.login === "member")!.grants.length,
          1,
        );
        assert.equal(JSON.stringify(snapshot).includes("recovery"), false);
        assert.equal(
          (await online("/offline/trust")).json().fingerprint,
          trust.fingerprint,
        );
        const bytes = (await online("/packages/" + manifest.id + "/download"))
          .rawPayload;
        const path = join(f.dir, "input.snpkg");
        await writeFile(path, bytes);
        await packages.importArchive(path);
        assert.equal(accounts.importSnapshot(snapshot).status, "imported");
      },
    );
    await t.test(
      "Falsches Ziel, fremder Signierer, Manipulation, zu alte Folge und fehlende Paketbindung",
      async () => {
        assert.throws(() =>
          decryptSnapshot(
            { ...envelope, sequence: envelope.sequence + 1 },
            target.privateKey,
            target.target.targetId,
            trust,
          ),
        );
        assert.throws(() =>
          decryptSnapshot(envelope, target.privateKey, randomUUID(), trust),
        );
        assert.throws(() =>
          decryptSnapshot(
            envelope,
            target.privateKey,
            target.target.targetId,
            trustFor(randomBytes(32).toString("hex"), f.cfg.origin),
          ),
        );
        assert.throws(() =>
          offlineSnapshot.parse({ ...snapshot, onlineSession: "secret" }),
        );
        assert.equal(
          accounts.importSnapshot(snapshot).status,
          "already_present",
        );
        assert.throws(() =>
          accounts.importSnapshot({
            ...snapshot,
            id: randomUUID(),
            sequence: 0,
          }),
        );
        const path = join(f.dir, "wrong-binding.snauth");
        await writeFile(
          path,
          JSON.stringify(
            encryptSnapshot(
              {
                ...snapshot,
                id: randomUUID(),
                sequence: snapshot.sequence + 1,
                packages: [
                  { ...snapshot.packages[0], manifestSha: "0".repeat(64) },
                ],
              },
              target.target,
              f.cfg.MFA_ENCRYPTION_KEY,
            ),
          ),
        );
        await assert.rejects(() =>
          importAccounts(
            path,
            {
              version: 1,
              target: target.target,
              privateKey: target.privateKey,
              key,
              pfxPassword: "x".repeat(43),
              origin: "https://localhost:3443",
              trust,
            },
            packages,
            accounts,
          ),
        );
        assert.equal(accounts.meta("snapshot_id"), snapshot.id);
      },
    );
    let codes: string[] = [];
    await t.test(
      "Keine Sitzung vor MFA; Origin/CSRF; Recoverycodes, Replay und fünf Fehlversuche",
      async () => {
        assert.equal((await req("/packages")).statusCode, 401);
        assert.equal(
          (
            await req(
              "/auth/login",
              "POST",
              { login: "admin", password: f.adminPassword },
              { origin: "https://evil.invalid" },
            )
          ).statusCode,
          403,
        );
        const v = await adminLogin(totp(onlineSecret));
        codes = v.json().recoveryCodes;
        assert.equal(codes.length, 8);
        assert.equal(v.cookies[0].httpOnly, true);
        assert.equal(v.cookies[0].secure, true);
        assert.equal(v.cookies[0].sameSite, "Strict");
        assert.equal((await req("/me")).json().admin, true);
        assert.equal(
          (await req("/live/activate", "POST", {}, { "x-csrf-token": "" }))
            .statusCode,
          403,
        );
        assert.equal((await req("/live/activate", "POST", {})).statusCode, 409);
        const a = await mfaLogin();
        assert.throws(() => accounts.verify(a.challenge!, totp(onlineSecret)));
        for (let i = 0; i < 4; i++)
          assert.throws(() => accounts.verify(a.challenge!, "incorrect"));
        assert.throws(() => accounts.verify(a.challenge!, codes[0]));
        const b = await mfaLogin();
        const once = accounts.verify(b.challenge!, codes[0]);
        assert.equal(once.recoveryCodes.length, 0);
        const c = await mfaLogin();
        assert.throws(() => accounts.verify(c.challenge!, codes[0]));
      },
    );
    await t.test(
      "Veranstaltungsrechte, geschütztes Originalmedium und fremde Kontooperationen",
      async () => {
        assert.equal((await req("/packages/" + manifest.id)).statusCode, 200);
        const m = await req("/packages/" + manifest.id + "/media/" + mediaId);
        assert.equal(m.statusCode, 200, m.body);
        assert.deepEqual(m.rawPayload, f.demoPng);
        const l = await req("/auth/login", "POST", {
          login: "member",
          password: memberPassword,
        });
        assert.equal(l.statusCode, 200);
        lc = "sn_local_session=" + l.cookies[0].value;
        ls = l.json().csrfToken;
        assert.equal((await req("/packages")).json().length, 1);
        assert.equal((await req("/packages/" + randomUUID())).statusCode, 404);
        assert.equal(
          (await req("/events/" + eventId + "/users")).statusCode,
          404,
        );
        assert.equal(
          (
            await req("/events/" + eventId + "/users", "POST", {
              login: "bad",
              displayName: "Unberechtigt",
            })
          ).statusCode,
          404,
        );
        assert.equal(
          (
            await req("/users/" + memberId + "/block", "POST", {
              blocked: true,
            })
          ).statusCode,
          403,
        );
        const l2 = await req("/auth/login", "POST", {
          login: "lead",
          password: leadPassword,
        });
        assert.equal(l2.json().setup, true);
        const v = await req("/auth/mfa/verify", "POST", {
          challenge: l2.json().challenge,
          code: totp(l2.json().secret),
        });
        assert.equal(v.statusCode, 200, v.body);
        lc = "sn_local_session=" + v.cookies[0].value;
        ls = v.json().csrfToken;
        assert.equal(
          (await req("/events/" + eventId + "/users")).statusCode,
          200,
        );
        assert.equal(
          (await req("/events/" + secondEvent + "/users")).statusCode,
          404,
        );
        const admin = snapshot.users.find((u) => u.admin)!;
        assert.equal(
          (
            await req(
              "/events/" + eventId + "/users/" + admin.id + "/block",
              "POST",
              { blocked: true },
            )
          ).statusCode,
          404,
        );
      },
    );
    let localUser = "",
      personal = "";
    await t.test(
      "Offlinekonto: einmaliger Einrichtungszugang, Rechte und dauerhafte Veranstaltungssperre",
      async () => {
        const created = await req("/events/" + eventId + "/users", "POST", {
          login: "offline.new",
          displayName: "Persönlich eingerichtet",
          role: "mitglied",
        });
        assert.equal(created.statusCode, 200, created.body);
        localUser = created.json().id;
        personal = created.json().invitationToken;
        assert.equal(
          (
            await req("/auth/login", "POST", {
              login: "offline.new",
              password: memberPassword,
            })
          ).statusCode,
          401,
        );
        assert.equal(
          (
            await req("/auth/invitation", "POST", {
              token: personal,
              password: memberPassword,
            })
          ).statusCode,
          200,
        );
        await assert.rejects(() =>
          accounts.acceptInvitation(personal, memberPassword),
        );
        const login = await accounts.login("offline.new", memberPassword);
        assert.ok("session" in login);
        const a = accounts.actor(login.session)!;
        assert.equal(a.admin, false);
        assert.equal(accounts.grants(a)[0].eventId, eventId);
        assert.equal(
          (
            await req(
              "/events/" + eventId + "/users/" + localUser + "/block",
              "POST",
              { blocked: true },
            )
          ).statusCode,
          200,
        );
        assert.equal(accounts.actor(login.session), null);
        const pending = accounts.pending();
        assert.ok(pending >= 3);
        const next = {
          ...snapshot,
          id: randomUUID(),
          sequence: snapshot.sequence + 1,
        };
        accounts.importSnapshot(next);
        const newLogin = await accounts.login("offline.new", memberPassword);
        assert.ok("session" in newLogin);
        assert.equal(
          accounts.grants(accounts.actor(newLogin.session)! as any).length,
          0,
        );
        assert.equal(accounts.pending(), pending);
        assert.equal((await req("/me")).statusCode, 401);
        const c = await mfaLogin();
        assert.throws(() => accounts.verify(c.challenge!, codes[0]));
        assert.equal(
          accounts.verify(c.challenge!, codes[1]).recoveryCodes.length,
          0,
        );
        assert.throws(() => accounts.importSnapshot(snapshot));
      },
    );
    await t.test(
      "Globale Sperre, Kontenneustart, deaktivierte Quellenkonten und administrativer Wiederherstellungsweg",
      async () => {
        const c = await mfaLogin(),
          v = accounts.verify(c.challenge!, codes[2]),
          a = accounts.actor(v.session)!;
        accounts.block(a, memberId, true);
        accounts.importSnapshot({
          ...snapshot,
          id: randomUUID(),
          sequence: snapshot.sequence + 2,
        });
        await assert.rejects(() => accounts.login("member", memberPassword));
        const secret = randomBytes(18).toString("hex"),
          admin = snapshot.users.find((u) => u.login === "admin")!;
        await assert.rejects(() => accounts.recover("wrong", admin.id, secret));
        await assert.rejects(() =>
          accounts.recover(recovery, memberId, secret),
        );
        await accounts.recover(recovery, admin.id, secret);
        await assert.rejects(() => accounts.login("admin", f.adminPassword));
        let after = await mfaLogin(secret);
        assert.equal(after.setup, true);
        const setupSecret = after.secret!,
          setup = accounts.verify(after.challenge!, totp(setupSecret));
        assert.equal(setup.recoveryCodes.length, 8);
        accounts.importSnapshot({
          ...snapshot,
          id: randomUUID(),
          sequence: snapshot.sequence + 3,
        });
        after = await mfaLogin(secret);
        assert.equal(after.setup, false);
        accounts.close();
        accounts = new LocalAccounts(root, key);
        const again = await mfaLogin(secret);
        assert.throws(() =>
          accounts.verify(again.challenge!, totp(setupSecret)),
        );
        const replacementPassword = randomBytes(18).toString("hex");
        accounts.importSnapshot({
          ...snapshot,
          id: randomUUID(),
          sequence: snapshot.sequence + 4,
          users: snapshot.users.map((u) =>
            u.login === "admin" ? { ...u, enabled: false } : u,
          ),
        });
        await assert.rejects(() => accounts.login("admin", secret));
        await assert.rejects(() =>
          accounts.recover(recovery, admin.id, secret),
        );
        // Restore a valid, freshly prepared credential, remove a former member.
        const replacementHash = await hashPassword(replacementPassword);
        accounts.importSnapshot({
          ...snapshot,
          id: randomUUID(),
          sequence: snapshot.sequence + 5,
          users: snapshot.users
            .filter((u) => u.id !== leadId)
            .map((u) =>
              u.login === "admin" ? { ...u, passwordHash: replacementHash } : u,
            ),
        });
        await assert.rejects(() => accounts.login("admin", secret));
        assert.ok(
          "challenge" in (await accounts.login("admin", replacementPassword)),
        );
        await assert.rejects(() => accounts.login("lead", leadPassword));
        await assert.rejects(() => accounts.login("member", memberPassword));
      },
    );
    await t.test(
      "Ablaufzeiten, Anmeldelimit und additive Migration aus vorhandenem S2-Schema",
      async () => {
        const l = await accounts.login("backup.admin", f.adminPassword);
        assert.ok("challenge" in l);
        const v = accounts.verify(l.challenge, totp(onlineSecret)),
          a = accounts.actor(v.session)!;
        const invite = accounts.createUser(a, eventId, {
          login: "expired.invite",
          displayName: "Abgelaufener Zugang",
        });
        const sql = new DatabaseSync(join(root, "accounts.sqlite"));
        try {
          sql
            .prepare("UPDATE invitations SET expires_at=0 WHERE user_id=?")
            .run(invite.id);
          await assert.rejects(() =>
            accounts.acceptInvitation(invite.invitationToken, memberPassword),
          );
          assert.equal(
            sql
              .prepare("SELECT password_hash FROM users WHERE id=?")
              .get(invite.id)!.password_hash,
            null,
          );
          sql
            .prepare("UPDATE sessions SET expires_at=0 WHERE user_id=?")
            .run(a.id);
          assert.equal(accounts.actor(v.session), null);
          assert.ok(
            sql
              .prepare(
                "SELECT 1 FROM audit WHERE kind='offline-user-created' AND subject_id=?",
              )
              .get(invite.id),
          );
        } finally {
          sql.close();
        }
        const limit = await localServer(
          accounts,
          packages,
          "https://localhost:3443",
        );
        try {
          let last = 0;
          for (let i = 0; i < 16; i++)
            last = (
              await limit.inject({
                url: "/api/local/auth/login",
                method: "POST",
                headers: { origin: "https://localhost:3443" },
                payload: {},
              })
            ).statusCode;
          assert.equal(last, 429);
        } finally {
          await limit.close();
        }
        await f.pg.createDatabase("shownight_s2_upgrade");
        const upgrade = database(
          f.cfg.DATABASE_URL.replace("shownight_test", "shownight_s2_upgrade"),
        );
        try {
          await upgrade.query(
            await readFile("apps/api/migrations/001_core.sql", "utf8"),
          );
          await upgrade.query(
            await readFile("apps/api/migrations/002_agents.sql", "utf8"),
          );
          const uid = randomUUID();
          await upgrade.query(
            "INSERT INTO users(id,login,display_name,mfa_counter) VALUES($1,'retained','Erhalten',42)",
            [uid],
          );
          await migrate(upgrade);
          await migrate(upgrade);
          assert.equal(
            (
              await upgrade.query("SELECT mfa_counter FROM users WHERE id=$1", [
                uid,
              ])
            ).rows[0].mfa_counter,
            "42",
          );
          assert.deepEqual(
            (
              await upgrade.query(
                "SELECT version FROM schema_migrations ORDER BY version",
              )
            ).rows.map((r) => r.version),
            [1, 2, 3],
          );
          assert.equal(
            (await upgrade.query("SELECT count(*) FROM offline_exports"))
              .rows[0].count,
            "0",
          );
        } finally {
          await upgrade.end();
        }
      },
    );
    await t.test(
      "LAN-API-Vertrag: Host, Origin, Rechte, sichere Cookies und Sitzungssperre",
      async () => {
        const path = join(f.dir, "lan-api");
        await mkdir(path);
        const a = new LocalAccounts(path, randomBytes(32).toString("hex"));
        a.importSnapshot(snapshot);
        const origin = lanOrigin("192.168.50.10"),
          app = await localServer(
            a,
            packages,
            origin,
            undefined,
            undefined,
            true,
          );
        const call = (
          url: string,
          method = "GET",
          payload?: any,
          headers?: Record<string, string>,
        ) =>
          app.inject({
            url,
            method: method as any,
            headers: { host: "192.168.50.10:3443", origin, ...headers },
            ...(payload === undefined ? {} : { payload }),
          });
        try {
          assert.equal(
            (
              await call("/health/live", "GET", undefined, {
                host: "localhost:3443",
              })
            ).statusCode,
            421,
          );
          assert.equal((await call("/api/local/packages")).statusCode, 401);
          const body = { login: "member", password: memberPassword };
          assert.equal(
            (
              await call("/api/local/auth/login", "POST", body, {
                origin: "https://localhost:3443",
              })
            ).statusCode,
            403,
          );
          const login = await call("/api/local/auth/login", "POST", body);
          assert.equal(login.statusCode, 200);
          assert.equal(login.cookies[0].secure, true);
          assert.equal(login.cookies[0].httpOnly, true);
          assert.equal(login.cookies[0].sameSite, "Strict");
          const cookie = "sn_local_session=" + login.cookies[0].value;
          const list = await call("/api/local/packages", "GET", undefined, {
            cookie,
          });
          assert.equal(list.statusCode, 200);
          assert.equal(list.json()[0].eventId, eventId);
          const denied = await call(
            "/api/local/events/" + secondEvent + "/users",
            "GET",
            undefined,
            { cookie },
          );
          assert.equal(denied.statusCode, 404);
          const admin = await call("/api/local/auth/login", "POST", {
            login: "admin",
            password: f.adminPassword,
          });
          assert.ok(admin.json().challenge);
          assert.equal(admin.cookies.length, 0);
          const mfa = a.verify(admin.json().challenge, totp(onlineSecret));
          a.block(a.actor(mfa.session)!, memberId, true, eventId);
          assert.equal(
            (await call("/api/local/packages", "GET", undefined, { cookie }))
              .statusCode,
            401,
          );
        } finally {
          await app.close();
          a.close();
        }
      },
    );
    if (process.platform === "win32")
      await t.test(
        "Portables Windows-Bundle: DPAPI, parallele Einrichtung, Loopback-/LAN-Zertifikat und echte TLS-Schutzprüfungen",
        async () => {
          const isolated = await mkdtemp(
            join(tmpdir(), "shownight-server-zip-"),
          );
          await powershell(
            "[void][Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem');$v=[Console]::In.ReadToEnd()|ConvertFrom-Json;[IO.Compression.ZipFile]::ExtractToDirectory($v.zip,$v.out)",
            JSON.stringify({
              zip: resolve("dist/shownight-server-windows-x64.zip"),
              out: isolated,
            }),
          );
          const profile = join(isolated, "portable-profile"),
            serverRoot = join(profile, "ShowNight", "local-server"),
            exe = join(isolated, "server-windows", "main.js"),
            runtime = join(isolated, "server-windows", "node.exe");
          async function cli(
            mode: string,
            arg?: string,
            selectedProfile = profile,
          ) {
            return new Promise<string>((resolve, reject) => {
              const p = spawn(runtime, [exe, mode, ...(arg ? [arg] : [])], {
                cwd: isolated,
                env: { ...process.env, LOCALAPPDATA: selectedProfile },
                windowsHide: true,
                stdio: ["ignore", "pipe", "ignore"],
              });
              let output = "";
              p.stdout.on("data", (b) => (output += b.toString()));
              const timer = setTimeout(() => {
                p.kill();
                reject(new Error("Portabler Befehl antwortet nicht."));
              }, 25000);
              p.on("error", reject);
              p.on("close", (c) => {
                clearTimeout(timer);
                c === 0
                  ? resolve(output)
                  : reject(
                      new Error("Portabler Befehl fehlgeschlagen: " + mode),
                    );
              });
            });
          }
          const parallel = await Promise.allSettled([cli("init"), cli("init")]);
          assert.equal(
            parallel.filter((r) => r.status === "fulfilled").length,
            1,
          );
          const v = await loadVault(serverRoot);
          assert.equal(
            (await readFile(join(serverRoot, "server.dpapi"), "utf8")).includes(
              v.privateKey,
            ),
            false,
          );
          await assert.rejects(() => cli("init"));
          const certificate = new X509Certificate(
            await readFile(join(serverRoot, "server.cer")),
          );
          assert.equal(certificate.checkHost("localhost"), "localhost");
          assert.equal(certificate.checkIP("127.0.0.1"), "127.0.0.1");
          const diagnostic = JSON.parse(await cli("network-check"));
          assert.equal(diagnostic.mode, "loopback-preparation");
          assert.equal(
            diagnostic.certificate.fingerprintSha256,
            certificate.fingerprint256,
          );
          assert.equal(diagnostic.addressAssigned, true);
          assert.equal(JSON.stringify(diagnostic).includes(v.key), false);
          const trustPath = join(f.dir, "test.sntrust"),
            authPath = join(f.dir, "test.snauth");
          await writeFile(trustPath, JSON.stringify(trust));
          await cli("trust", trustPath);
          const portablePackagesRoot = join(
            profile,
            "ShowNight",
            "local-packages",
          );
          await mkdir(portablePackagesRoot, { recursive: true });
          const pp = new PackageStore(portablePackagesRoot);
          try {
            await pp.importArchive(join(f.dir, "input.snpkg"));
          } finally {
            pp.close();
          }
          await writeFile(
            authPath,
            JSON.stringify(
              encryptSnapshot(snapshot, v.target, f.cfg.MFA_ENCRYPTION_KEY),
            ),
          );
          await cli("import-auth", authPath);
          const server = spawn(runtime, [exe, "run"], {
            cwd: isolated,
            env: { ...process.env, LOCALAPPDATA: profile },
            windowsHide: true,
            stdio: ["ignore", "pipe", "ignore"],
          });
          try {
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error("HTTPS-Server startet nicht.")),
                15000,
              );
              server.stdout.on("data", (b) => {
                if (b.toString().includes("https://localhost:3443")) {
                  clearTimeout(timer);
                  resolve();
                }
              });
              server.once("exit", () => {
                clearTimeout(timer);
                reject(new Error("HTTPS-Server vorzeitig beendet."));
              });
            });
            const get = () =>
              new Promise<{ status: number; body: string }>(
                (resolve, reject) => {
                  const r = httpsRequest(
                    "https://localhost:3443/health/live",
                    { ca: certificate.toString(), rejectUnauthorized: true },
                    (res) => {
                      let body = "";
                      res.on("data", (b) => (body += b));
                      res.on("end", () =>
                        resolve({ status: res.statusCode!, body }),
                      );
                    },
                  );
                  r.on("error", reject);
                  r.end();
                },
              );
            assert.equal((await get()).status, 200);
            const page = await new Promise<number>((resolve, reject) => {
              const r = httpsRequest(
                "https://localhost:3443/",
                { ca: certificate.toString(), rejectUnauthorized: true },
                (res) => {
                  res.resume();
                  res.on("end", () => resolve(res.statusCode!));
                },
              );
              r.on("error", reject);
              r.end();
            });
            assert.equal(page, 200);
          } finally {
            server.kill();
            await new Promise<void>((resolve) => {
              if (server.exitCode !== null) resolve();
              else server.once("exit", () => resolve());
            });
          }
          // A LAN certificate is tested over isolated loopback transport. This
          // proves TLS/identity/rights, not a real interface, firewall or WLAN.
          const address = ["10.254.253.252", "192.168.254.253"].find(
            (ip) => !assignedAddress(ip),
          )!;
          assert.ok(address);
          const lanProfile = join(isolated, "lan-profile"),
            lanRoot = join(lanProfile, "ShowNight", "local-server"),
            networkFile = join(isolated, "network.json");
          await writeFile(
            networkFile,
            JSON.stringify({ version: 1, address: "0.0.0.0" }),
          );
          await assert.rejects(() => cli("init-lan", networkFile, lanProfile));
          await writeFile(networkFile, JSON.stringify({ version: 1, address }));
          await cli("init-lan", networkFile, lanProfile);
          const lv = await loadVault(lanRoot),
            lc = new X509Certificate(
              await readFile(join(lanRoot, "server.cer")),
            );
          assert.equal(lv.origin, lanOrigin(address));
          assert.equal(lv.network?.address, address);
          assert.equal(lc.checkIP(address), address);
          assert.equal(lc.checkHost("localhost"), undefined);
          assert.equal(lc.checkIP("127.0.0.1"), undefined);
          assert.throws(() =>
            certificateInfo(lc.raw, "https://localhost:3443"),
          );
          assert.throws(() =>
            certificateInfo(lc.raw, lv.origin, Date.parse(lc.validTo) + 1),
          );
          const diag = JSON.parse(
            await cli("network-check", undefined, lanProfile),
          );
          assert.equal(diag.addressAssigned, false);
          assert.equal(diag.certificate.fingerprintSha256, lc.fingerprint256);
          await assert.rejects(() => cli("run", undefined, lanProfile));
          const a = new LocalAccounts(lanRoot, lv.key);
          a.importSnapshot(snapshot);
          const lan = await localServer(
            a,
            packages,
            lv.origin,
            undefined,
            {
              pfx: await readFile(join(lanRoot, "server.pfx")),
              passphrase: lv.pfxPassword,
              minVersion: "TLSv1.2",
            },
            true,
          );
          await lan.listen({ host: "127.0.0.1", port: 0 });
          const port = (lan.server.address() as { port: number }).port;
          async function request(
            path: string,
            options: {
              host?: string;
              identity?: string;
              trusted?: boolean;
              body?: unknown;
              cookie?: string;
              csrf?: string;
              origin?: string;
            } = {},
          ) {
            return new Promise<{ status: number; body: any; cookie: string }>(
              (resolve, reject) => {
                const body =
                  options.body === undefined
                    ? undefined
                    : JSON.stringify(options.body);
                const r = httpsRequest(
                  {
                    hostname: "127.0.0.1",
                    port,
                    path,
                    method: body ? "POST" : "GET",
                    rejectUnauthorized: true,
                    ...(options.trusted === false ? {} : { ca: lc.toString() }),
                    checkServerIdentity: (_h, c) =>
                      checkServerIdentity(options.identity ?? address, c),
                    headers: {
                      host: options.host ?? address + ":3443",
                      origin: options.origin ?? lv.origin,
                      cookie: options.cookie ?? "",
                      "x-csrf-token": options.csrf ?? "",
                      ...(body
                        ? {
                            "content-type": "application/json",
                            "content-length": Buffer.byteLength(body),
                          }
                        : {}),
                    },
                  },
                  (res) => {
                    let data = "";
                    res.on("data", (b) => (data += b.toString()));
                    res.on("end", () =>
                      resolve({
                        status: res.statusCode!,
                        body: JSON.parse(data),
                        cookie:
                          res.headers["set-cookie"]?.[0].split(";")[0] ?? "",
                      }),
                    );
                    res.on("error", reject);
                  },
                );
                r.setTimeout(5000, () =>
                  r.destroy(new Error("TLS-Testzeit abgelaufen.")),
                );
                r.on("error", reject);
                r.end(body);
              },
            );
          }
          try {
            assert.equal((await request("/health/live")).status, 200);
            await assert.rejects(() =>
              request("/health/live", { trusted: false }),
            );
            await assert.rejects(() =>
              request("/health/live", { identity: "127.0.0.1" }),
            );
            assert.equal(
              (await request("/health/live", { host: "localhost:3443" }))
                .status,
              421,
            );
            assert.equal((await request("/api/local/packages")).status, 401);
            const body = { login: "admin", password: f.adminPassword };
            assert.equal(
              (
                await request("/api/local/auth/login", {
                  body,
                  origin: "https://localhost:3443",
                })
              ).status,
              403,
            );
            const login = await request("/api/local/auth/login", { body });
            assert.equal(login.status, 200);
            assert.ok(login.body.challenge);
            assert.equal(
              (await request("/api/local/packages", { cookie: login.cookie }))
                .status,
              401,
            );
            const auth = await request("/api/local/auth/mfa/verify", {
              body: {
                challenge: login.body.challenge,
                code: totp(onlineSecret),
              },
            });
            assert.equal(auth.status, 200);
            assert.match(auth.cookie, /^sn_local_session=/);
            assert.equal(
              (await request("/api/local/packages", { cookie: auth.cookie }))
                .status,
              200,
            );
            assert.equal(
              (
                await request("/api/local/auth/logout", {
                  body: {},
                  cookie: auth.cookie,
                })
              ).status,
              403,
            );
            assert.equal(
              (
                await request("/api/local/auth/logout", {
                  body: {},
                  cookie: auth.cookie,
                  csrf: auth.body.csrfToken,
                })
              ).status,
              200,
            );
            assert.equal(
              (await request("/api/local/packages", { cookie: auth.cookie }))
                .status,
              401,
            );
            // Rejected reinitialization must leave this target/certificate intact.
            await assert.rejects(() =>
              cli("init-lan", networkFile, lanProfile),
            );
            assert.equal(
              (await loadVault(lanRoot)).target.targetId,
              lv.target.targetId,
            );
            assert.equal(
              new X509Certificate(await readFile(join(lanRoot, "server.cer")))
                .fingerprint256,
              lc.fingerprint256,
            );
          } finally {
            await lan.close();
            a.close();
          }
        },
      );
  } finally {
    await local.close();
    accounts.close();
    packages.close();
    await f.close();
  }
});
