import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import {
  accountEmailInput,
  accountTokenInput,
  passwordResetRequestInput,
  passwordResetInput,
} from "../../../packages/contracts/src/index.js";
import { actor } from "./auth.js";
import { transaction, type DB, type Queryable } from "./db.js";
import type { Config } from "./config.js";
import { checkPassword, hashPassword, hash, token } from "./security.js";
import { HttpError } from "./errors.js";
import { confirmationMail, passwordResetMail } from "./account-mail.js";

const invalid = () =>
  new HttpError(
    400,
    "ACCOUNT_TOKEN_INVALID",
    "Der Link ist ungültig oder abgelaufen. Bitte einen neuen Link anfordern.",
  );
const denied = () =>
  new HttpError(
    401,
    "AUTH_FAILED",
    "Anmeldung oder Bestätigung fehlgeschlagen.",
  );
async function currentSession(c: Queryable, req: FastifyRequest) {
  const held = await c.query(
    "SELECT token_hash FROM sessions WHERE token_hash=$1 AND user_id=$2 FOR UPDATE",
    [req.actor.sessionHash, req.actor.id],
  );
  const identity = held.rowCount
    ? await actor(c, req.cookies.sn_session)
    : null;
  if (
    !identity ||
    identity.id !== req.actor.id ||
    identity.csrfToken !== req.headers["x-csrf-token"]
  )
    throw denied();
}
async function queued(
  c: Queryable,
  cfg: Config,
  recipient: string,
  mail: { subject: string; text: string; html: string },
) {
  const id = randomUUID();
  const mode =
    cfg.MAIL_DELIVERY_ENABLED === "true" &&
    cfg.MAIL_MODE === "smtp" &&
    cfg.DEMO_ENABLED === "false"
      ? "smtp"
      : "test";
  await c.query(
    "INSERT INTO mail_jobs(id,business_key,recipient,subject,body,body_html,status,delivery_mode) VALUES($1,$2,$3,$4,$5,$6,'queued',$7)",
    [id, "account:" + id, recipient, mail.subject, mail.text, mail.html, mode],
  );
}
// All mutation paths lock user → token, matching login/MFA/password changes.
async function tokenOwner(c: Queryable, raw: string, kind: string) {
  const found = (
    await c.query(
      "SELECT user_id FROM account_tokens WHERE token_hash=$1 AND kind=$2",
      [hash(raw), kind],
    )
  ).rows[0];
  if (!found) throw invalid();
  const user = (
    await c.query("SELECT * FROM users WHERE id=$1 AND enabled FOR UPDATE", [
      found.user_id,
    ])
  ).rows[0];
  if (!user) throw invalid();
  const ticket = (
    await c.query(
      "SELECT * FROM account_tokens WHERE token_hash=$1 AND user_id=$2 AND kind=$3 AND expires_at>clock_timestamp() FOR UPDATE",
      [hash(raw), user.id, kind],
    )
  ).rows[0];
  if (!ticket) throw invalid();
  return { user, ticket };
}
export function accountRoutes(app: FastifyInstance, db: DB, cfg: Config) {
  const mailDeliveryEnabled =
    cfg.MAIL_DELIVERY_ENABLED === "true" &&
    cfg.MAIL_MODE === "smtp" &&
    cfg.DEMO_ENABLED === "false";
  app.get("/api/v1/account", async (req) => {
    const row = (
      await db.query("SELECT email,pending_email FROM users WHERE id=$1", [
        req.actor.id,
      ])
    ).rows[0];
    return {
      email: row.email,
      pendingEmail: row.pending_email,
      mailDeliveryEnabled,
    };
  });
  app.post(
    "/api/v1/account/email",
    { config: { rateLimit: { max: 5, timeWindow: 60000 } } },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const input = accountEmailInput.parse(req.body);
      const original = (
        await db.query(
          "SELECT password_hash FROM users WHERE id=$1 AND enabled",
          [req.actor.id],
        )
      ).rows[0];
      if (
        !original ||
        typeof original.password_hash !== "string" ||
        !(await checkPassword(input.currentPassword, original.password_hash))
      )
        throw denied();
      await transaction(db, async (c) => {
        const user = (
          await c.query(
            "SELECT * FROM users WHERE id=$1 AND enabled FOR UPDATE",
            [req.actor.id],
          )
        ).rows[0];
        if (!user || user.password_hash !== original.password_hash)
          throw denied();
        await currentSession(c, req);
        const raw = token();
        await c.query("UPDATE users SET pending_email=$2 WHERE id=$1", [
          user.id,
          input.email,
        ]);
        await c.query(
          "DELETE FROM account_tokens WHERE user_id=$1 AND kind='confirm'",
          [user.id],
        );
        await c.query(
          "INSERT INTO account_tokens(token_hash,user_id,kind,email,expires_at) VALUES($1,$2,'confirm',$3,clock_timestamp()+interval '30 minutes')",
          [hash(raw), user.id, input.email],
        );
        await queued(
          c,
          cfg,
          input.email,
          confirmationMail({
            displayName: user.display_name,
            actionUrl: cfg.origin + "/#email-bestaetigen=" + raw,
            expiresMinutes: 30,
          }),
        );
      });
      return { requested: true, mailDeliveryEnabled };
    },
  );
  app.post(
    "/api/v1/auth/email/confirm",
    { config: { rateLimit: { max: 10, timeWindow: 60000 } } },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const input = accountTokenInput.parse(req.body);
      try {
        await transaction(db, async (c) => {
          const { user, ticket } = await tokenOwner(c, input.token, "confirm");
          if (user.pending_email !== ticket.email) throw invalid();
          await c.query(
            "UPDATE users SET email=$2,pending_email=NULL WHERE id=$1",
            [user.id, ticket.email],
          );
          await c.query("DELETE FROM account_tokens WHERE user_id=$1", [
            user.id,
          ]);
        });
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw invalid();
        throw error;
      }
      return { confirmed: true };
    },
  );
  app.post(
    "/api/v1/auth/password/request",
    { config: { rateLimit: { max: 5, timeWindow: 60000 } } },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const input = passwordResetRequestInput.parse(req.body);
      await transaction(db, async (c) => {
        // A login matching an email-shaped identifier takes precedence, avoiding
        // resetting two accounts if namespaces overlap.
        const user = (
          await c.query(
            "SELECT * FROM users WHERE enabled AND (login=$1 OR email=$1) ORDER BY (login=$1) DESC LIMIT 1 FOR UPDATE",
            [input.identifier],
          )
        ).rows[0];
        if (!user?.email || !user.password_hash) return;
        const raw = token();
        await c.query(
          "DELETE FROM account_tokens WHERE user_id=$1 AND kind='reset'",
          [user.id],
        );
        await c.query(
          "INSERT INTO account_tokens(token_hash,user_id,kind,email,expires_at) VALUES($1,$2,'reset',$3,clock_timestamp()+interval '15 minutes')",
          [hash(raw), user.id, user.email],
        );
        await queued(
          c,
          cfg,
          user.email,
          passwordResetMail({
            displayName: user.display_name,
            actionUrl: cfg.origin + "/#passwort-zuruecksetzen=" + raw,
            expiresMinutes: 15,
          }),
        );
      });
      return reply.code(202).send({ requested: true, mailDeliveryEnabled });
    },
  );
  app.post(
    "/api/v1/auth/password/reset",
    { config: { rateLimit: { max: 10, timeWindow: 60000 } } },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const input = passwordResetInput.parse(req.body);
      // Expensive derivation outside locks; the token is rechecked under user lock.
      const next = await hashPassword(input.newPassword);
      await transaction(db, async (c) => {
        const { user, ticket } = await tokenOwner(c, input.token, "reset");
        if (user.email !== ticket.email) throw invalid();
        await c.query(
          "UPDATE users SET password_hash=$2,pending_email=NULL WHERE id=$1",
          [user.id, next],
        );
        await c.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
        await c.query("DELETE FROM challenges WHERE user_id=$1", [user.id]);
        await c.query("DELETE FROM account_tokens WHERE user_id=$1", [user.id]);
      });
      reply.clearCookie("sn_session", { path: "/" });
      return { changed: true, reauthenticate: true };
    },
  );
}
