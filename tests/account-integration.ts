import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { fixture } from "./fixture.js";
import { hashPassword, totp } from "../apps/api/src/security.js";

test(
  "Onlinekonto: Passwortwechsel, Widerruf und konkurrierende Anmeldung mit PostgreSQL",
  { timeout: 180000 },
  async (t) => {
    const f = await fixture(55443);
    const { db, app, cfg } = f;
    let address = 0;
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
        remoteAddress: "127.1.0." + ((++address % 250) + 1),
        headers: {
          origin: cfg.origin,
          ...(session
            ? { cookie: session.cookie, "x-csrf-token": session.csrf }
            : {}),
          ...extra,
        },
        ...(body === undefined ? {} : { payload: body as any }),
      });
    const asSession = (r: any): Session => ({
      cookie:
        "sn_session=" +
        r.cookies.find((c: any) => c.name === "sn_session").value,
      csrf: r.json().csrfToken,
    });
    async function member(label: string) {
      const id = randomUUID(),
        password = "synthetic-old-password-" + label;
      await db.query(
        "INSERT INTO users(id,login,display_name,password_hash) VALUES($1,$2,$2,$3)",
        [id, label, await hashPassword(password)],
      );
      const login = await request("/auth/login", { login: label, password });
      assert.equal(login.statusCode, 200);
      return { id, login: label, password, session: asSession(login) };
    }
    // Pause a real DB result to put the second operation precisely between a
    // stale credential read and the first operation's later transaction.
    function pauseResult(match: (sql: string) => boolean) {
      const query = db.query.bind(db);
      let resume!: () => void, entered!: () => void;
      const gate = new Promise<void>((r) => {
        resume = r;
      });
      const reached = new Promise<void>((r) => {
        entered = r;
      });
      let used = false;
      db.query = (async (...args: any[]) => {
        const result = await (query as any)(...args);
        if (!used && typeof args[0] === "string" && match(args[0])) {
          used = true;
          entered();
          await gate;
        }
        return result;
      }) as typeof db.query;
      return {
        reached,
        resume,
        restore: () => {
          db.query = query;
        },
      };
    }
    try {
      await t.test(
        "Mitglied: Negativschutz verändert Hash/Sitzung nicht, Erfolg widerruft alle Sitzungen",
        async () => {
          const u = await member("member-basic");
          const other = await request("/auth/login", {
            login: u.login,
            password: u.password,
          });
          const second = asSession(other);
          const before = (
            await db.query("SELECT password_hash FROM users WHERE id=$1", [
              u.id,
            ])
          ).rows[0];
          const body = {
            currentPassword: u.password,
            newPassword: "synthetic-new-password-basic",
          };
          for (const [session, headers, input, status] of [
            [undefined, {}, body, 401],
            [u.session, { origin: "https://other.invalid" }, body, 403],
            [u.session, { "x-csrf-token": "wrong" }, body, 403],
            [u.session, {}, { ...body, currentPassword: "wrong" }, 401],
            [u.session, {}, { ...body, newPassword: "short" }, 400],
            [u.session, {}, { ...body, newPassword: "x".repeat(257) }, 400],
            [u.session, {}, { ...body, newPassword: u.password }, 400],
          ] as const)
            assert.equal(
              (
                await request(
                  "/account/password",
                  input,
                  session as Session,
                  headers,
                )
              ).statusCode,
              status,
            );
          assert.deepEqual(
            (
              await db.query("SELECT password_hash FROM users WHERE id=$1", [
                u.id,
              ])
            ).rows[0],
            before,
          );
          const changed = await request("/account/password", body, u.session);
          assert.equal(changed.statusCode, 200);
          assert.deepEqual(changed.json(), {
            changed: true,
            reauthenticate: true,
          });
          assert.equal(changed.headers["cache-control"], "no-store");
          assert.equal(changed.cookies[0].value, "");
          for (const session of [u.session, second])
            assert.equal(
              (await request("/me", undefined, session)).statusCode,
              401,
            );
          assert.equal(
            (
              await request("/auth/login", {
                login: u.login,
                password: u.password,
              })
            ).statusCode,
            401,
          );
          assert.equal(
            (
              await request("/auth/login", {
                login: u.login,
                password: body.newPassword,
              })
            ).json().authenticated,
            true,
          );
        },
      );
      await t.test(
        "Admin: MFA und Rechte bleiben, alle offenen Challenges werden unbrauchbar",
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
          assert.equal(verified.statusCode, 200);
          const session = asSession(verified);
          const me = (await request("/me", undefined, session)).json();
          const challenge = (
            await request("/auth/login", {
              login: "admin",
              password: f.adminPassword,
            })
          ).json().challenge;
          const before = (
            await db.query(
              "SELECT admin,mfa_secret,mfa_counter,recovery_hashes FROM users WHERE id=$1",
              [me.id],
            )
          ).rows[0];
          assert.equal(
            (
              await request(
                "/account/password",
                {
                  currentPassword: f.adminPassword,
                  newPassword: "synthetic-new-admin-password",
                },
                session,
              )
            ).statusCode,
            200,
          );
          assert.deepEqual(
            (
              await db.query(
                "SELECT admin,mfa_secret,mfa_counter,recovery_hashes FROM users WHERE id=$1",
                [me.id],
              )
            ).rows[0],
            before,
          );
          assert.equal(
            (
              await db.query("SELECT 1 FROM challenges WHERE user_id=$1", [
                me.id,
              ])
            ).rowCount,
            0,
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
          const next = (
            await request("/auth/login", {
              login: "admin",
              password: "synthetic-new-admin-password",
            })
          ).json();
          assert.equal(next.setup, false);
          assert.equal(next.authenticated, false);
          const authenticated = await request("/auth/mfa/verify", {
            challenge: next.challenge,
            code: verified.json().recoveryCodes[0],
          });
          assert.equal(authenticated.statusCode, 200);
          assert.equal(
            (await request("/me", undefined, asSession(authenticated))).json()
              .mfaVerified,
            true,
          );
        },
      );
      await t.test(
        "laufender Altpasswortlogin stellt nach Passwortwechsel keine Sitzung aus",
        async () => {
          const u = await member("member-login-race");
          const paused = pauseResult((sql) =>
            sql.startsWith("SELECT * FROM users WHERE login="),
          );
          const pending = request("/auth/login", {
            login: u.login,
            password: u.password,
          });
          try {
            await paused.reached;
            assert.equal(
              (
                await request(
                  "/account/password",
                  {
                    currentPassword: u.password,
                    newPassword: "synthetic-new-password-race",
                  },
                  u.session,
                )
              ).statusCode,
              200,
            );
          } finally {
            paused.resume();
            paused.restore();
          }
          assert.equal((await pending).statusCode, 401);
          assert.equal(
            (await db.query("SELECT 1 FROM sessions WHERE user_id=$1", [u.id]))
              .rowCount,
            0,
          );
        },
      );
      await t.test(
        "konkurrierende Passwortwechsel: veralteter Hash überschreibt den Gewinner nicht",
        async () => {
          const u = await member("member-change-race");
          const paused = pauseResult(
            (sql) =>
              sql === "SELECT password_hash FROM users WHERE id=$1 AND enabled",
          );
          const pending = request(
            "/account/password",
            {
              currentPassword: u.password,
              newPassword: "synthetic-loser-password",
            },
            u.session,
          );
          try {
            await paused.reached;
            assert.equal(
              (
                await request(
                  "/account/password",
                  {
                    currentPassword: u.password,
                    newPassword: "synthetic-winner-password",
                  },
                  u.session,
                )
              ).statusCode,
              200,
            );
          } finally {
            paused.resume();
            paused.restore();
          }
          assert.equal((await pending).statusCode, 401);
          assert.equal(
            (
              await request("/auth/login", {
                login: u.login,
                password: "synthetic-loser-password",
              })
            ).statusCode,
            401,
          );
          assert.equal(
            (
              await request("/auth/login", {
                login: u.login,
                password: "synthetic-winner-password",
              })
            ).statusCode,
            200,
          );
        },
      );
      await t.test(
        "Abmeldung während Passwortprüfung verhindert nachträgliche Änderung",
        async () => {
          const u = await member("member-logout-race");
          const paused = pauseResult(
            (sql) =>
              sql === "SELECT password_hash FROM users WHERE id=$1 AND enabled",
          );
          const pending = request(
            "/account/password",
            {
              currentPassword: u.password,
              newPassword: "synthetic-after-logout-password",
            },
            u.session,
          );
          try {
            await paused.reached;
            assert.equal(
              (await request("/auth/logout", {}, u.session)).statusCode,
              200,
            );
          } finally {
            paused.resume();
            paused.restore();
          }
          assert.equal((await pending).statusCode, 401);
          assert.equal(
            (
              await request("/auth/login", {
                login: u.login,
                password: u.password,
              })
            ).statusCode,
            200,
          );
        },
      );
      await t.test(
        "Passwortwechsel vor wartender MFA: keine tote Sperre oder neue Sitzung",
        async () => {
          const u = await member("admin-mfa-race");
          await db.query("UPDATE users SET admin=true WHERE id=$1", [u.id]);
          const start = (
            await request("/auth/login", {
              login: u.login,
              password: u.password,
            })
          ).json();
          const enrolled = await request("/auth/mfa/verify", {
            challenge: start.challenge,
            code: totp(start.secret),
          });
          assert.equal(enrolled.statusCode, 200);
          const challenge = (
            await request("/auth/login", {
              login: u.login,
              password: u.password,
            })
          ).json().challenge;
          const blocker = await db.connect();
          let changing: ReturnType<typeof request> | undefined;
          let verifying: ReturnType<typeof request> | undefined;
          const waiting = async (sql: string) => {
            for (let attempt = 0; attempt < 500; attempt++) {
              if (
                (
                  await db.query(
                    "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query=$1",
                    [sql],
                  )
                ).rowCount
              )
                return;
              await delay(10);
            }
            assert.fail(
              "Erwarteter echter PostgreSQL-Sperrwartepunkt nicht erreicht",
            );
          };
          try {
            await blocker.query("BEGIN");
            await blocker.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
              u.id,
            ]);
            changing = request(
              "/account/password",
              {
                currentPassword: u.password,
                newPassword: "synthetic-mfa-race-new-password",
              },
              asSession(enrolled),
            );
            await waiting(
              "SELECT password_hash FROM users WHERE id=$1 AND enabled FOR UPDATE",
            );
            verifying = request("/auth/mfa/verify", {
              challenge,
              code: enrolled.json().recoveryCodes[0],
            });
            await waiting(
              "SELECT * FROM users WHERE id=$1 AND enabled FOR UPDATE",
            );
          } finally {
            await blocker.query("ROLLBACK");
            blocker.release();
          }
          assert.equal((await changing!).statusCode, 200);
          assert.equal((await verifying!).statusCode, 401);
          assert.equal(
            (await db.query("SELECT 1 FROM sessions WHERE user_id=$1", [u.id]))
              .rowCount,
            0,
          );
        },
      );
    } finally {
      await f.close();
    }
  },
);
