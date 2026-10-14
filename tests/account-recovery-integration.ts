import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fixture } from "./fixture.js";
import {
  hashPassword,
  hash,
  totp,
  seal,
  totpSecret,
} from "../apps/api/src/security.js";

test(
  "Kontowiederherstellung: bestätigte E-Mail, Einmaltoken und paralleler Widerruf",
  { timeout: 180000 },
  async (t) => {
    const f = await fixture(55445),
      { db, app, cfg } = f;
    let ip = 0;
    type Session = { cookie: string; csrf: string };
    const request = (
      path: string,
      body?: unknown,
      session?: Session,
      extra = {},
    ) =>
      app.inject({
        url: "/api/v1" + path,
        method: body === undefined ? "GET" : "POST",
        remoteAddress: "127.2.0." + ((++ip % 250) + 1),
        headers: {
          origin: cfg.origin,
          ...(session
            ? { cookie: session.cookie, "x-csrf-token": session.csrf }
            : {}),
          ...extra,
        },
        ...(body === undefined ? {} : { payload: body as any }),
      });
    const session = (r: any): Session => ({
      cookie:
        "sn_session=" +
        r.cookies.find((c: any) => c.name === "sn_session").value,
      csrf: r.json().csrfToken,
    });
    const mailToken = async (email: string, kind: "confirm" | "reset") => {
      const jobs = (
        await db.query(
          "SELECT body,body_html,delivery_mode FROM mail_jobs WHERE recipient=$1 ORDER BY created_at DESC",
          [email],
        )
      ).rows;
      const marker =
        kind === "confirm" ? "#email-bestaetigen=" : "#passwort-zuruecksetzen=";
      const job = jobs.find((r: any) => r.body.includes(marker));
      assert.ok(job);
      assert.equal(job.delivery_mode, "test");
      assert.ok(job.body_html.includes(marker));
      const raw = job.body.split(marker)[1].match(/^[A-Za-z0-9_-]+/)[0];
      assert.ok(job.body.includes(cfg.origin + "/" + marker));
      assert.equal(
        (
          await db.query(
            "SELECT token_hash FROM account_tokens WHERE token_hash=$1",
            [hash(raw)],
          )
        ).rows[0].token_hash,
        hash(raw),
      );
      return raw;
    };
    async function member(login: string) {
      const id = randomUUID(),
        password = "synthetic-password-" + login;
      await db.query(
        "INSERT INTO users(id,login,display_name,password_hash) VALUES($1,$2,$2,$3)",
        [id, login, await hashPassword(password)],
      );
      const signed = await request("/auth/login", { login, password });
      assert.equal(signed.statusCode, 200);
      return { id, login, password, session: session(signed) };
    }
    async function email(
      u: { password: string; session: Session },
      email: string,
    ) {
      const result = await request(
        "/account/email",
        { email, currentPassword: u.password },
        u.session,
      );
      assert.equal(result.statusCode, 200);
      assert.deepEqual(result.json(), {
        requested: true,
        mailDeliveryEnabled: false,
      });
      return mailToken(email.toLowerCase(), "confirm");
    }
    async function reset(identifier: string, email: string) {
      const result = await request("/auth/password/request", { identifier });
      assert.equal(result.statusCode, 202);
      assert.deepEqual(result.json(), {
        requested: true,
        mailDeliveryEnabled: false,
      });
      assert.equal(result.headers["cache-control"], "no-store");
      return mailToken(email, "reset");
    }
    try {
      const u = await member("recovery-member");
      await t.test(
        "Mail benötigt Sitzung, aktuelles Passwort und CSRF; pending ist noch kein Resetweg",
        async () => {
          assert.equal((await request("/account")).statusCode, 401);
          assert.deepEqual(
            (await request("/account", undefined, u.session)).json(),
            { email: null, pendingEmail: null, mailDeliveryEnabled: false },
          );
          const body = {
            email: "confirmed@example.test",
            currentPassword: u.password,
          };
          assert.equal((await request("/account/email", body)).statusCode, 401);
          assert.equal(
            (
              await request("/account/email", body, u.session, {
                "x-csrf-token": "wrong",
              })
            ).statusCode,
            403,
          );
          assert.equal(
            (
              await request("/account/email", body, u.session, {
                origin: "https://other.invalid",
              })
            ).statusCode,
            403,
          );
          assert.equal(
            (
              await request(
                "/account/email",
                { ...body, currentPassword: "wrong" },
                u.session,
              )
            ).statusCode,
            401,
          );
          assert.equal((await db.query("SELECT 1 FROM mail_jobs")).rowCount, 0);
          const expired = await email(u, "Confirmed@Example.Test");
          assert.deepEqual(
            (await request("/account", undefined, u.session)).json(),
            {
              email: null,
              pendingEmail: "confirmed@example.test",
              mailDeliveryEnabled: false,
            },
          );
          const count = (await db.query("SELECT 1 FROM mail_jobs")).rowCount;
          for (const identifier of [
            u.login,
            "confirmed@example.test",
            "unknown-user",
          ]) {
            const result = await request("/auth/password/request", {
              identifier,
            });
            assert.equal(result.statusCode, 202);
            assert.deepEqual(result.json(), {
              requested: true,
              mailDeliveryEnabled: false,
            });
          }
          assert.equal(
            (await db.query("SELECT 1 FROM mail_jobs")).rowCount,
            count,
          );
          await db.query(
            "UPDATE account_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
            [hash(expired)],
          );
          assert.equal(
            (await request("/auth/email/confirm", { token: expired }))
              .statusCode,
            400,
          );
          const old = await email(u, "confirmed@example.test");
          const current = await email(u, "confirmed@example.test");
          assert.equal(
            (await request("/auth/email/confirm", { token: old })).statusCode,
            400,
          );
          assert.equal(
            (await request("/auth/email/confirm", { token: current }))
              .statusCode,
            200,
          );
          assert.equal(
            (await request("/auth/email/confirm", { token: current }))
              .statusCode,
            400,
          );
          assert.deepEqual(
            (await request("/account", undefined, u.session)).json(),
            {
              email: "confirmed@example.test",
              pendingEmail: null,
              mailDeliveryEnabled: false,
            },
          );
        },
      );
      await t.test(
        "Bestätigte Mail bleibt case-normalisiert eindeutig",
        async () => {
          const other = await member("recovery-other");
          const duplicate = await email(other, "CONFIRMED@example.test");
          assert.equal(
            (await request("/auth/email/confirm", { token: duplicate }))
              .statusCode,
            400,
          );
          assert.equal(
            (await request("/account", undefined, other.session)).json().email,
            null,
          );
        },
      );
      await t.test(
        "Reset: erneute Anfrage, Ablauf und normaler Passwortwechsel widerrufen Links",
        async () => {
          const old = await reset(u.login, "confirmed@example.test");
          const expired = await reset(
            "CONFIRMED@EXAMPLE.TEST",
            "confirmed@example.test",
          );
          assert.equal(
            (
              await request("/auth/password/reset", {
                token: old,
                newPassword: "synthetic-reset-password",
              })
            ).statusCode,
            400,
          );
          await db.query(
            "UPDATE account_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
            [hash(expired)],
          );
          assert.equal(
            (
              await request("/auth/password/reset", {
                token: expired,
                newPassword: "synthetic-reset-password",
              })
            ).statusCode,
            400,
          );
          const invalidated = await reset(u.login, "confirmed@example.test");
          const pendingConfirmation = await email(
            u,
            "pending-before-change@example.test",
          );
          assert.equal(
            (
              await request(
                "/account/password",
                {
                  currentPassword: u.password,
                  newPassword: "synthetic-member-updated-password",
                },
                u.session,
              )
            ).statusCode,
            200,
          );
          assert.equal(
            (
              await request("/auth/password/reset", {
                token: invalidated,
                newPassword: "synthetic-reset-password",
              })
            ).statusCode,
            400,
          );
          assert.equal(
            (
              await request("/auth/email/confirm", {
                token: pendingConfirmation,
              })
            ).statusCode,
            400,
          );
          assert.deepEqual(
            (
              await db.query(
                "SELECT email,pending_email FROM users WHERE id=$1",
                [u.id],
              )
            ).rows[0],
            { email: "confirmed@example.test", pending_email: null },
          );
          assert.equal(
            (
              await db.query("SELECT 1 FROM account_tokens WHERE user_id=$1", [
                u.id,
              ])
            ).rowCount,
            0,
          );
        },
      );
      await t.test(
        "Adminreset ist einmalig, löscht Sitzungen/Challenges und erhält MFA",
        async () => {
          const login = (
            await request("/auth/login", {
              login: "admin",
              password: f.adminPassword,
            })
          ).json();
          const verified = await request("/auth/mfa/verify", {
            challenge: login.challenge,
            code: totp(login.secret),
          });
          const admin = {
            password: f.adminPassword,
            session: session(verified),
          };
          const id = (await request("/me", undefined, admin.session)).json().id;
          const confirmation = await email(admin, "admin@example.test");
          assert.equal(
            (await request("/auth/email/confirm", { token: confirmation }))
              .statusCode,
            200,
          );
          const token = await reset("admin@example.test", "admin@example.test");
          const challenge = (
            await request("/auth/login", {
              login: "admin",
              password: f.adminPassword,
            })
          ).json().challenge;
          const before = (
            await db.query(
              "SELECT admin,mfa_secret,mfa_counter,recovery_hashes FROM users WHERE id=$1",
              [id],
            )
          ).rows[0];
          const results = await Promise.all([
            request("/auth/password/reset", {
              token,
              newPassword: "synthetic-admin-reset-password",
            }),
            request("/auth/password/reset", {
              token,
              newPassword: "synthetic-admin-reset-password",
            }),
          ]);
          assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 400]);
          assert.deepEqual(
            (
              await db.query(
                "SELECT admin,mfa_secret,mfa_counter,recovery_hashes FROM users WHERE id=$1",
                [id],
              )
            ).rows[0],
            before,
          );
          assert.equal(
            (await request("/me", undefined, admin.session)).statusCode,
            401,
          );
          assert.equal(
            (
              await request("/auth/mfa/verify", {
                challenge,
                code: verified.json().recoveryCodes[0],
              })
            ).statusCode,
            401,
          );
          assert.equal(
            (
              await request("/auth/login", {
                login: "admin",
                password: f.adminPassword,
              })
            ).statusCode,
            401,
          );
          const next = (
            await request("/auth/login", {
              login: "admin",
              password: "synthetic-admin-reset-password",
            })
          ).json();
          assert.equal(next.authenticated, false);
          assert.equal(next.setup, false);
          assert.equal(
            (
              await request("/auth/mfa/verify", {
                challenge: next.challenge,
                code: verified.json().recoveryCodes[0],
              })
            ).statusCode,
            200,
          );
        },
      );
      await t.test(
        "Reset während laufender alter Passwortänderung gewinnt ohne spätes Überschreiben",
        async () => {
          const fresh = await member("recovery-race");
          const confirmed = await email(fresh, "race@example.test");
          await request("/auth/email/confirm", { token: confirmed });
          const token = await reset(fresh.login, "race@example.test");
          const original = db.query.bind(db);
          let release!: () => void,
            entered!: () => void,
            used = false;
          const gate = new Promise<void>((r) => {
            release = r;
          });
          const ready = new Promise<void>((r) => {
            entered = r;
          });
          db.query = (async (...args: any[]) => {
            const result = await (original as any)(...args);
            if (
              !used &&
              args[0] ===
                "SELECT password_hash FROM users WHERE id=$1 AND enabled"
            ) {
              used = true;
              entered();
              await gate;
            }
            return result;
          }) as typeof db.query;
          const changing = request(
            "/account/password",
            {
              currentPassword: fresh.password,
              newPassword: "synthetic-loser-password",
            },
            fresh.session,
          );
          try {
            await ready;
            assert.equal(
              (
                await request("/auth/password/reset", {
                  token,
                  newPassword: "synthetic-reset-winner-password",
                })
              ).statusCode,
              200,
            );
          } finally {
            release();
            db.query = original;
          }
          assert.equal((await changing).statusCode, 401);
          assert.equal(
            (
              await request("/auth/login", {
                login: fresh.login,
                password: "synthetic-reset-winner-password",
              })
            ).statusCode,
            200,
          );
        },
      );
      await t.test(
        "Host-Recovery widerruft Reset/Bestätigung und erhält ausschließlich bestätigte Mail",
        async () => {
          const host = await member("host-recovery");
          const confirmed = await email(host, "host-confirmed@example.test");
          assert.equal(
            (await request("/auth/email/confirm", { token: confirmed }))
              .statusCode,
            200,
          );
          const pending = await email(host, "host-pending@example.test");
          const resetToken = await reset(
            host.login,
            "host-confirmed@example.test",
          );
          await db.query(
            "UPDATE users SET admin=true,mfa_secret=$2,mfa_counter=42,recovery_hashes=$3 WHERE id=$1",
            [
              host.id,
              seal(totpSecret(), cfg.MFA_ENCRYPTION_KEY),
              JSON.stringify([hash("synthetic-recovery-code")]),
            ],
          );
          await db.query(
            "INSERT INTO challenges(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '5 minutes')",
            [hash("synthetic-host-login-challenge"), host.id],
          );
          const password = "synthetic-host-recovered-password";
          const result = await promisify(execFile)(
            process.execPath,
            ["--import", "tsx", "apps/api/src/cli.ts", "recover"],
            {
              windowsHide: true,
              timeout: 30000,
              env: {
                ...process.env,
                DATABASE_URL: cfg.DATABASE_URL,
                MFA_ENCRYPTION_KEY: cfg.MFA_ENCRYPTION_KEY,
                MEDIA_ROOT: cfg.MEDIA_ROOT,
                PUBLIC_BASE_URL: cfg.PUBLIC_BASE_URL,
                MAIL_DELIVERY_ENABLED: "false",
                MAIL_MODE: "test",
                DEMO_ENABLED: "true",
                RECOVERY_CONFIRM: "RESET_MFA_AND_SESSIONS",
                RECOVERY_LOGIN: host.login,
                RECOVERY_PASSWORD: password,
              },
            },
          );
          assert.equal(result.stderr, "");
          assert.ok(result.stdout.includes("Kennwort ersetzt"));
          assert.deepEqual(
            (
              await db.query(
                "SELECT email,pending_email,mfa_secret,mfa_counter,recovery_hashes,admin FROM users WHERE id=$1",
                [host.id],
              )
            ).rows[0],
            {
              email: "host-confirmed@example.test",
              pending_email: null,
              mfa_secret: null,
              mfa_counter: "-1",
              recovery_hashes: [],
              admin: true,
            },
          );
          for (const table of ["account_tokens", "sessions", "challenges"])
            assert.equal(
              (
                await db.query(`SELECT 1 FROM ${table} WHERE user_id=$1`, [
                  host.id,
                ])
              ).rowCount,
              0,
            );
          assert.equal(
            (await request("/auth/email/confirm", { token: pending }))
              .statusCode,
            400,
          );
          assert.equal(
            (
              await request("/auth/password/reset", {
                token: resetToken,
                newPassword: "synthetic-host-attacker-password",
              })
            ).statusCode,
            400,
          );
          assert.equal(
            (
              await request("/auth/login", {
                login: host.login,
                password: host.password,
              })
            ).statusCode,
            401,
          );
          const login = (
            await request("/auth/login", { login: host.login, password })
          ).json();
          assert.equal(login.authenticated, false);
          assert.equal(login.setup, true);
        },
      );
    } finally {
      await f.close();
    }
  },
);
