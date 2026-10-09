import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  loginInput,
  mfaInput,
  inviteInput,
  password,
} from "../../../packages/contracts/src/index.js";
import type { Config } from "./config.js";
import { transaction, type DB } from "./db.js";
import { HttpError } from "./errors.js";
import {
  token,
  hash,
  checkPassword,
  hashPassword,
  seal,
  unseal,
  totpSecret,
  verifyTotp,
} from "./security.js";
export type Actor = {
  id: string;
  login: string;
  displayName: string;
  admin: boolean;
  mfaVerified: boolean;
  csrfToken: string;
  sessionHash: string;
};
declare module "fastify" {
  interface FastifyRequest {
    actor: Actor;
  }
}
const denied = () =>
  new HttpError(
    401,
    "AUTH_FAILED",
    "Anmeldung oder Bestätigung fehlgeschlagen.",
  );
export async function actor(
  db: DB,
  session: string | undefined,
): Promise<Actor | null> {
  if (!session) return null;
  const r = await db.query(
    `SELECT u.id,u.login,u.display_name,u.admin,s.mfa_verified,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.enabled`,
    [hash(session)],
  );
  const u = r.rows[0];
  if (!u) return null;
  const needs =
    u.admin ||
    (
      await db.query(
        "SELECT 1 FROM grants WHERE user_id=$1 AND role='leitung' LIMIT 1",
        [u.id],
      )
    ).rowCount;
  if (needs && !u.mfa_verified) return null;
  return {
    id: u.id,
    login: u.login,
    displayName: u.display_name,
    admin: u.admin,
    mfaVerified: u.mfa_verified,
    csrfToken: u.csrf_token,
    sessionHash: hash(session),
  };
}
export async function bootstrap(
  db: DB,
  login: string,
  displayName: string,
  secret: string,
) {
  password.parse(secret);
  await transaction(db, async (c) => {
    const state = await c.query(
      "SELECT completed FROM bootstrap WHERE singleton=true FOR UPDATE",
    );
    if (state.rows[0].completed)
      throw new Error("Bootstrap wurde bereits abgeschlossen.");
    await c.query(
      "INSERT INTO users(id,login,display_name,password_hash,admin) VALUES($1,$2,$3,$4,true)",
      [
        randomUUID(),
        z
          .string()
          .regex(/^[a-z0-9._@+-]{3,120}$/)
          .parse(login),
        displayName,
        await hashPassword(secret),
      ],
    );
    await c.query("UPDATE bootstrap SET completed=true");
  });
}
export function authRoutes(app: FastifyInstance, db: DB, cfg: Config) {
  app.decorateRequest("actor");
  app.addHook("onRequest", async (req, reply) => {
    // Native pairing has its own one-use credential and rate limit. Browser Origins are rejected there.
    if (req.url === "/api/agent/v1/pair" && req.method === "POST") return;
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== cfg.origin
    )
      throw new HttpError(403, "ORIGIN", "Ungültiger Ursprung.");
    if (!req.url.startsWith("/api/v1/") || req.url.startsWith("/api/v1/auth/"))
      return;
    const user = await actor(db, req.cookies.sn_session);
    if (!user) throw denied();
    req.actor = user;
    reply.header("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["x-csrf-token"] !== user.csrfToken
    )
      throw new HttpError(403, "CSRF", "Sicherheitsbestätigung fehlt.");
  });
  async function session(userId: string, mfa: boolean, reply: FastifyReply) {
    const raw = token(),
      csrf = token();
    await db.query(
      "INSERT INTO sessions(token_hash,user_id,csrf_token,mfa_verified,expires_at) VALUES($1,$2,$3,$4,now()+interval '8 hours')",
      [hash(raw), userId, csrf, mfa],
    );
    reply.setCookie("sn_session", raw, {
      httpOnly: true,
      secure: cfg.secure,
      sameSite: "strict",
      path: "/",
      maxAge: 28800,
    });
    return { authenticated: true, csrfToken: csrf };
  }
  app.post(
    "/api/v1/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: 60000 } } },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const input = loginInput.parse(req.body);
      const r = await db.query(
        "SELECT * FROM users WHERE login=$1 AND enabled",
        [input.login.toLowerCase().trim()],
      );
      const user = r.rows[0];
      // Same expensive derivation for missing accounts; never log the request body.
      if (
        !(await checkPassword(
          input.password,
          user?.password_hash ?? "0".repeat(32) + ":" + "0".repeat(128),
        )) ||
        !user
      )
        throw denied();
      const required =
        user.admin ||
        (
          await db.query(
            "SELECT 1 FROM grants WHERE user_id=$1 AND role='leitung' LIMIT 1",
            [user.id],
          )
        ).rowCount;
      if (required || user.mfa_secret) {
        const raw = token();
        const setup = !user.mfa_secret;
        const secret = setup ? totpSecret() : null;
        await db.query(
          "INSERT INTO challenges(token_hash,user_id,secret,expires_at) VALUES($1,$2,$3,now()+interval '5 minutes')",
          [
            hash(raw),
            user.id,
            secret ? seal(secret, cfg.MFA_ENCRYPTION_KEY) : null,
          ],
        );
        return {
          authenticated: false,
          challenge: raw,
          setup,
          ...(secret
            ? {
                secret,
                uri: `otpauth://totp/ShowNight:${encodeURIComponent(user.login)}?secret=${secret}&issuer=ShowNight&digits=6&period=30`,
              }
            : {}),
        };
      }
      return session(user.id, false, reply);
    },
  );
  app.post(
    "/api/v1/auth/mfa/verify",
    { config: { rateLimit: { max: 10, timeWindow: 60000 } } },
    async (req, reply) => {
      const input = mfaInput.parse(req.body);
      const result = await transaction(db, async (c) => {
        const r = await c.query(
          "SELECT * FROM challenges WHERE token_hash=$1 AND expires_at>now() AND attempts<5 FOR UPDATE",
          [hash(input.challenge)],
        );
        const challenge = r.rows[0];
        if (!challenge) return null;
        const u = (
          await c.query(
            "SELECT * FROM users WHERE id=$1 AND enabled FOR UPDATE",
            [challenge.user_id],
          )
        ).rows[0];
        if (!u) return null;
        const encrypted = u.mfa_secret ?? challenge.secret;
        if (!encrypted) return null;
        const counter = verifyTotp(
          unseal(encrypted, cfg.MFA_ENCRYPTION_KEY),
          input.code,
          Number(u.mfa_counter),
        );
        const recovery: string[] = u.recovery_hashes;
        const recoveryIndex = u.mfa_secret
          ? recovery.indexOf(hash(input.code))
          : -1;
        if (counter === null && recoveryIndex < 0) {
          await c.query(
            "UPDATE challenges SET attempts=attempts+1 WHERE token_hash=$1",
            [hash(input.challenge)],
          );
          return null;
        }
        const setup = !u.mfa_secret;
        const codes = setup
          ? Array.from({ length: 8 }, () => token().slice(0, 20))
          : [];
        if (recoveryIndex >= 0) recovery.splice(recoveryIndex, 1);
        await c.query(
          "UPDATE users SET mfa_secret=$2,mfa_counter=$3,recovery_hashes=$4 WHERE id=$1",
          [
            u.id,
            encrypted,
            counter ?? u.mfa_counter,
            JSON.stringify(setup ? codes.map(hash) : recovery),
          ],
        );
        await c.query("DELETE FROM challenges WHERE user_id=$1", [u.id]);
        return { userId: u.id, codes };
      });
      if (!result) throw denied();
      reply.header("Cache-Control", "no-store");
      return {
        ...(await session(result.userId, true, reply)),
        recoveryCodes: result.codes,
      };
    },
  );
  app.post(
    "/api/v1/auth/invitation",
    { config: { rateLimit: { max: 10, timeWindow: 60000 } } },
    async (req) => {
      const input = inviteInput.parse(req.body);
      await transaction(db, async (c) => {
        const r = await c.query(
          "DELETE FROM invitations WHERE token_hash=$1 AND expires_at>now() RETURNING user_id",
          [hash(input.token)],
        );
        if (!r.rowCount) throw denied();
        await c.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
          r.rows[0].user_id,
          await hashPassword(input.password),
        ]);
        await c.query("DELETE FROM sessions WHERE user_id=$1", [
          r.rows[0].user_id,
        ]);
      });
      return { accepted: true };
    },
  );
  app.post("/api/v1/auth/logout", async (req, reply) => {
    const u = await actor(db, req.cookies.sn_session);
    if (!u) throw denied();
    if (req.headers["x-csrf-token"] !== u.csrfToken)
      throw new HttpError(403, "CSRF", "Sicherheitsbestätigung fehlt.");
    await db.query("DELETE FROM sessions WHERE token_hash=$1", [u.sessionHash]);
    reply.clearCookie("sn_session", { path: "/" });
    return { loggedOut: true };
  });
  app.get("/api/v1/me", async (req) => {
    const grants = (
      await db.query(
        'SELECT event_id AS "eventId",role FROM grants WHERE user_id=$1',
        [req.actor.id],
      )
    ).rows;
    return {
      id: req.actor.id,
      login: req.actor.login,
      displayName: req.actor.displayName,
      admin: req.actor.admin,
      mfaVerified: req.actor.mfaVerified,
      csrfToken: req.actor.csrfToken,
      grants,
      demo: cfg.DEMO_ENABLED === "true",
    };
  });
}
export async function requireActor(req: FastifyRequest, db: DB) {
  const u = await actor(db, req.cookies.sn_session);
  if (!u) throw denied();
  return u;
}
