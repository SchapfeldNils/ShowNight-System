import { DatabaseSync } from "node:sqlite";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { password, userCreate } from "../../../packages/contracts/src/index.js";
import {
  type OfflineSnapshot,
  offlineRole,
  offlineSnapshot,
} from "../../../packages/contracts/src/offline.js";
import {
  token,
  hash,
  hashPassword,
  checkPassword,
  seal,
  unseal,
  totpSecret,
  verifyTotp,
} from "../../api/src/security.js";
import { HttpError } from "../../api/src/errors.js";
import type { Actor } from "../../api/src/auth.js";
type Row = Record<string, any>;
const deny = () =>
  new HttpError(
    401,
    "AUTH_FAILED",
    "Anmeldung oder Bestätigung fehlgeschlagen.",
  );
export class LocalAccounts {
  private db: DatabaseSync;
  constructor(
    root: string,
    readonly key: string,
  ) {
    this.db = new DatabaseSync(join(root, "accounts.sqlite"));
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
    );
    const version = this.db.prepare("PRAGMA user_version").get()?.user_version;
    if (version !== 0 && version !== 1) {
      this.db.close();
      throw new Error("Lokales Kontenschema nicht unterstützt.");
    }
    this.db.exec(
      [
        "CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT",
        "CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,login TEXT UNIQUE NOT NULL,display_name TEXT NOT NULL,admin INTEGER NOT NULL,enabled INTEGER NOT NULL,blocked INTEGER NOT NULL DEFAULT 0,password_hash TEXT,source_password_hash TEXT,mfa_secret TEXT,source_mfa_fp TEXT NOT NULL,mfa_counter INTEGER NOT NULL DEFAULT -1,recovery_hashes TEXT,provenance TEXT NOT NULL) STRICT",
        "CREATE TABLE IF NOT EXISTS access(user_id TEXT REFERENCES users(id),event_id TEXT NOT NULL,roles TEXT NOT NULL,assigned_shows TEXT NOT NULL,provenance TEXT NOT NULL,PRIMARY KEY(user_id,event_id)) STRICT",
        "CREATE TABLE IF NOT EXISTS event_blocks(user_id TEXT REFERENCES users(id),event_id TEXT NOT NULL,PRIMARY KEY(user_id,event_id)) STRICT",
        "CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf_token TEXT NOT NULL,mfa_verified INTEGER NOT NULL,expires_at INTEGER NOT NULL) STRICT",
        "CREATE TABLE IF NOT EXISTS challenges(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),secret TEXT,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0) STRICT",
        "CREATE TABLE IF NOT EXISTS invitations(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL) STRICT",
        "CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,user_id TEXT,kind TEXT NOT NULL,event_id TEXT,subject_id TEXT,created_at TEXT NOT NULL,pending_sync INTEGER NOT NULL DEFAULT 0) STRICT",
        "PRAGMA user_version=1",
      ].join(";"),
    );
  }
  close() {
    this.db.close();
  }
  private tx<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw e;
    }
  }
  meta(key: string) {
    const r = this.db.prepare("SELECT value FROM meta WHERE key=?").get(key);
    return r ? String(r.value) : null;
  }
  private set(key: string, value: string) {
    this.db
      .prepare(
        "INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, value);
  }
  private audit(
    userId: string | null,
    kind: string,
    eventId: string | null = null,
    pending = false,
    subjectId: string | null = null,
  ) {
    this.db
      .prepare("INSERT INTO audit VALUES(?,?,?,?,?,?,?)")
      .run(
        randomUUID(),
        userId,
        kind,
        eventId,
        subjectId,
        new Date().toISOString(),
        pending ? 1 : 0,
      );
  }
  configureRecovery(code: string) {
    if (this.meta("recovery_hash"))
      throw new Error("Wiederherstellungsschlüssel bereits eingerichtet.");
    this.set("recovery_hash", hash(code));
  }
  importSnapshot(s: OfflineSnapshot) {
    s = offlineSnapshot.parse(s);
    return this.tx(() => {
      if (
        this.meta("server_origin") &&
        this.meta("server_origin") !== s.serverOrigin
      )
        throw new Error("Serverwechsel erfordert gesonderte Einrichtung.");
      const seq = Number(this.meta("sequence") ?? 0);
      if (s.sequence === seq && this.meta("snapshot_id") === s.id)
        return { status: "already_present" };
      if (s.sequence <= seq)
        throw new Error("Veralteter oder bereits abgelöster Anmeldestand.");
      this.db
        .prepare("UPDATE users SET enabled=0 WHERE provenance=?")
        .run(s.serverOrigin);
      this.db
        .prepare("DELETE FROM access WHERE provenance=?")
        .run(s.serverOrigin);
      for (const u of s.users) {
        const old = this.db
          .prepare("SELECT * FROM users WHERE id=?")
          .get(u.id) as Row | undefined;
        const fp = hash(u.mfaSecret ?? ""),
          sameMfa = old?.source_mfa_fp === fp,
          samePassword = old?.source_password_hash === u.passwordHash;
        const encrypted = sameMfa
          ? old!.mfa_secret
          : u.mfaSecret
            ? seal(u.mfaSecret, this.key)
            : null;
        const localPassword = samePassword
          ? old!.password_hash
          : u.passwordHash;
        this.db
          .prepare(
            "INSERT INTO users(id,login,display_name,admin,enabled,password_hash,source_password_hash,mfa_secret,source_mfa_fp,mfa_counter,recovery_hashes,provenance) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login,display_name=excluded.display_name,admin=excluded.admin,enabled=excluded.enabled,password_hash=excluded.password_hash,source_password_hash=excluded.source_password_hash,mfa_secret=excluded.mfa_secret,source_mfa_fp=excluded.source_mfa_fp,mfa_counter=excluded.mfa_counter,recovery_hashes=excluded.recovery_hashes,provenance=excluded.provenance",
          )
          .run(
            u.id,
            u.login,
            u.displayName,
            +u.admin,
            +u.enabled,
            localPassword,
            u.passwordHash,
            encrypted,
            fp,
            sameMfa ? old!.mfa_counter : -1,
            sameMfa ? old!.recovery_hashes : null,
            s.serverOrigin,
          );
        for (const g of u.grants)
          this.db
            .prepare(
              "INSERT INTO access VALUES(?,?,?,?,?) ON CONFLICT(user_id,event_id) DO UPDATE SET roles=excluded.roles,assigned_shows=excluded.assigned_shows,provenance=excluded.provenance",
            )
            .run(
              u.id,
              g.eventId,
              JSON.stringify(g.roles),
              JSON.stringify(g.assignedShows),
              s.serverOrigin,
            );
      }
      this.db.exec("DELETE FROM sessions;DELETE FROM challenges;");
      this.set("server_origin", s.serverOrigin);
      this.set("sequence", String(s.sequence));
      this.set("snapshot_id", s.id);
      this.set("prepared_at", s.createdAt);
      this.set("packages", JSON.stringify(s.packages));
      this.audit(null, "signed-accounts-imported");
      return { status: "imported" };
    });
  }
  private needsMfa(u: Row) {
    return (
      !!u.admin ||
      !!u.mfa_secret ||
      (
        this.db
          .prepare("SELECT roles FROM access WHERE user_id=?")
          .all(u.id) as Row[]
      ).some((r) => JSON.parse(r.roles).includes("leitung"))
    );
  }
  private newSession(u: Row, mfa: boolean) {
    if (!u.enabled || u.blocked || (this.needsMfa(u) && !mfa)) throw deny();
    const raw = token(),
      csrf = token();
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?,?,?)")
      .run(hash(raw), u.id, csrf, +mfa, Date.now() + 8 * 3600000);
    return { session: raw, authenticated: true, csrfToken: csrf };
  }
  async login(login: string, secret: string) {
    const u = this.db
      .prepare("SELECT * FROM users WHERE login=?")
      .get(login.trim().toLowerCase()) as Row | undefined;
    const verified = await checkPassword(
      secret,
      u?.password_hash ?? "0".repeat(32) + ":" + "0".repeat(128),
    );
    const current = u
      ? (this.db.prepare("SELECT * FROM users WHERE id=?").get(u.id) as
          | Row
          | undefined)
      : undefined;
    if (
      !verified ||
      !current ||
      current.password_hash !== u?.password_hash ||
      !current.enabled ||
      current.blocked
    )
      throw deny();
    if (this.needsMfa(current)) {
      const challenge = token(),
        secret = current.mfa_secret ? null : totpSecret();
      this.db
        .prepare(
          "INSERT INTO challenges(token_hash,user_id,secret,expires_at) VALUES(?,?,?,?)",
        )
        .run(
          hash(challenge),
          current.id,
          secret ? seal(secret, this.key) : null,
          Date.now() + 300000,
        );
      return {
        authenticated: false,
        challenge,
        setup: !!secret,
        ...(secret
          ? {
              secret,
              uri:
                "otpauth://totp/ShowNight-Offline:" +
                encodeURIComponent(current.login) +
                "?secret=" +
                secret +
                "&issuer=ShowNight-Offline&digits=6&period=30",
            }
          : {}),
      };
    }
    return this.newSession(current, false);
  }
  verify(challengeValue: string, code: string) {
    const out = this.tx(() => {
      const c = this.db
        .prepare(
          "SELECT * FROM challenges WHERE token_hash=? AND expires_at>? AND attempts<5",
        )
        .get(hash(challengeValue), Date.now()) as Row | undefined;
      const u = c
        ? (this.db.prepare("SELECT * FROM users WHERE id=?").get(c.user_id) as
            | Row
            | undefined)
        : undefined;
      if (!c || !u || !u.enabled || u.blocked) return null;
      const secret = u.mfa_secret ?? c.secret;
      if (!secret) return null;
      const counter = verifyTotp(
        unseal(secret, this.key),
        code,
        Number(u.mfa_counter),
      );
      const recovery: string[] = u.recovery_hashes
        ? JSON.parse(u.recovery_hashes)
        : [];
      const recoveryIndex = u.mfa_secret ? recovery.indexOf(hash(code)) : -1;
      if (counter === null && recoveryIndex < 0) {
        this.db
          .prepare(
            "UPDATE challenges SET attempts=attempts+1 WHERE token_hash=?",
          )
          .run(hash(challengeValue));
        return null;
      }
      const issue = u.recovery_hashes === null;
      const codes = issue
        ? Array.from({ length: 8 }, () => token().slice(0, 20))
        : [];
      if (recoveryIndex >= 0) recovery.splice(recoveryIndex, 1);
      this.db
        .prepare(
          "UPDATE users SET mfa_secret=?,mfa_counter=?,recovery_hashes=? WHERE id=?",
        )
        .run(
          secret,
          counter ?? u.mfa_counter,
          JSON.stringify(issue ? codes.map(hash) : recovery),
          u.id,
        );
      this.db.prepare("DELETE FROM challenges WHERE user_id=?").run(u.id);
      this.audit(
        u.id,
        recoveryIndex >= 0 ? "offline-recovery-used" : "offline-mfa-verified",
      );
      return {
        ...this.newSession({ ...u, mfa_secret: secret }, true),
        recoveryCodes: codes,
      };
    });
    if (!out) throw deny();
    return out;
  }
  actor(raw: string | undefined): Actor | null {
    if (!raw) return null;
    const u = this.db
      .prepare(
        "SELECT u.*,s.mfa_verified,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.enabled=1 AND u.blocked=0",
      )
      .get(hash(raw), Date.now()) as Row | undefined;
    if (!u || (this.needsMfa(u) && !u.mfa_verified)) return null;
    return {
      id: u.id,
      login: u.login,
      displayName: u.display_name,
      admin: !!u.admin,
      mfaVerified: !!u.mfa_verified,
      csrfToken: u.csrf_token,
      sessionHash: hash(raw),
    };
  }
  logout(a: Actor) {
    this.db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run(a.sessionHash);
  }
  grants(a: Actor) {
    return this.db
      .prepare(
        "SELECT event_id AS eventId,roles,assigned_shows AS assignedShows FROM access WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM event_blocks b WHERE b.user_id=access.user_id AND b.event_id=access.event_id)",
      )
      .all(a.id)
      .map((r) => ({
        eventId: String(r.eventId),
        roles: JSON.parse(String(r.roles)) as string[],
        assignedShows: JSON.parse(String(r.assignedShows)) as string[],
      }));
  }
  eventAllowed(a: Actor, eventId: string, manage = false) {
    if (!this.packageBindings().some((p) => p.eventId === eventId))
      throw new HttpError(404, "NOT_FOUND", "Veranstaltung nicht vorbereitet.");
    const g = this.grants(a).find((g) => g.eventId === eventId);
    if (!a.admin && (!g || (manage && !g.roles.includes("leitung"))))
      throw new HttpError(404, "NOT_FOUND", "Veranstaltung nicht verfügbar.");
  }
  packageBindings() {
    return JSON.parse(
      this.meta("packages") ?? "[]",
    ) as OfflineSnapshot["packages"];
  }
  users(a: Actor, eventId: string) {
    this.eventAllowed(a, eventId, true);
    return this.db
      .prepare(
        "SELECT u.id,u.login,u.display_name AS displayName,u.admin,u.enabled,u.blocked,ac.roles,EXISTS(SELECT 1 FROM event_blocks b WHERE b.user_id=u.id AND b.event_id=ac.event_id) AS eventBlocked FROM users u JOIN access ac ON ac.user_id=u.id WHERE ac.event_id=? ORDER BY u.login",
      )
      .all(eventId)
      .map((r) => ({
        ...r,
        admin: !!r.admin,
        enabled: !!r.enabled,
        blocked: !!r.blocked,
        eventBlocked: !!r.eventBlocked,
        roles: JSON.parse(String(r.roles)),
      }));
  }
  createUser(a: Actor, eventId: string, input: unknown) {
    this.eventAllowed(a, eventId, true);
    const u = userCreate
        .extend({ role: offlineRole.default("mitglied") })
        .parse(input),
      uid = randomUUID(),
      raw = token();
    this.tx(() => {
      this.db
        .prepare(
          "INSERT INTO users(id,login,display_name,admin,enabled,source_mfa_fp,provenance) VALUES(?,?,?,0,1,?,'local')",
        )
        .run(uid, u.login, u.displayName, hash(""));
      this.db
        .prepare("INSERT INTO access VALUES(?,?,?,?,'local')")
        .run(uid, eventId, JSON.stringify([u.role]), "[]");
      this.db
        .prepare("INSERT INTO invitations VALUES(?,?,?)")
        .run(hash(raw), uid, Date.now() + 86400000);
      this.audit(a.id, "offline-user-created", eventId, true, uid);
    });
    return { id: uid, invitationToken: raw };
  }
  async acceptInvitation(raw: string, secret: string) {
    password.parse(secret);
    const derived = await hashPassword(secret);
    this.tx(() => {
      const i = this.db
        .prepare(
          "SELECT i.* FROM invitations i JOIN users u ON u.id=i.user_id WHERE token_hash=? AND expires_at>? AND u.enabled=1 AND u.blocked=0",
        )
        .get(hash(raw), Date.now()) as Row | undefined;
      if (!i) throw deny();
      this.db
        .prepare("UPDATE users SET password_hash=? WHERE id=?")
        .run(derived, i.user_id);
      this.db.prepare("DELETE FROM invitations WHERE user_id=?").run(i.user_id);
      this.db.prepare("DELETE FROM sessions WHERE user_id=?").run(i.user_id);
      this.audit(i.user_id, "offline-invitation-used", null, true);
    });
    return { accepted: true };
  }
  block(a: Actor, uid: string, blocked: boolean, eventId?: string) {
    if (eventId) this.eventAllowed(a, eventId, true);
    else if (!a.admin)
      throw new HttpError(403, "FORBIDDEN", "Systemrecht erforderlich.");
    const u = this.db.prepare("SELECT * FROM users WHERE id=?").get(uid) as
      | Row
      | undefined;
    if (
      !u ||
      (u.admin && (!a.admin || !!eventId)) ||
      (eventId &&
        !this.db
          .prepare("SELECT 1 FROM access WHERE user_id=? AND event_id=?")
          .get(uid, eventId))
    )
      throw new HttpError(404, "NOT_FOUND", "Konto nicht verfügbar.");
    this.tx(() => {
      if (eventId) {
        if (blocked)
          this.db
            .prepare("INSERT OR IGNORE INTO event_blocks VALUES(?,?)")
            .run(uid, eventId);
        else
          this.db
            .prepare("DELETE FROM event_blocks WHERE user_id=? AND event_id=?")
            .run(uid, eventId);
      } else
        this.db
          .prepare("UPDATE users SET blocked=? WHERE id=?")
          .run(+blocked, uid);
      this.db.prepare("DELETE FROM sessions WHERE user_id=?").run(uid);
      this.db.prepare("DELETE FROM challenges WHERE user_id=?").run(uid);
      this.audit(
        a.id,
        blocked ? "offline-account-blocked" : "offline-account-unblocked",
        eventId,
        true,
        uid,
      );
    });
    return { blocked };
  }
  async recover(code: string, uid: string, newPassword: string) {
    const expected = this.meta("recovery_hash"),
      actual = hash(code);
    if (
      !expected ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
    )
      throw deny();
    password.parse(newPassword);
    const derived = await hashPassword(newPassword);
    this.tx(() => {
      const u = this.db.prepare("SELECT * FROM users WHERE id=?").get(uid) as
        | Row
        | undefined;
      if (!u?.admin || !u.enabled) throw deny();
      this.db
        .prepare(
          "UPDATE users SET password_hash=?,blocked=0,mfa_secret=NULL,mfa_counter=-1,recovery_hashes=NULL WHERE id=?",
        )
        .run(derived, uid);
      this.db.prepare("DELETE FROM sessions WHERE user_id=?").run(uid);
      this.db.prepare("DELETE FROM challenges WHERE user_id=?").run(uid);
      this.audit(uid, "operator-recovery", null, true);
    });
  }
  pending() {
    return Number(
      this.db
        .prepare("SELECT count(*) AS n FROM audit WHERE pending_sync=1")
        .get()?.n ?? 0,
    );
  }
  admins() {
    return this.db
      .prepare(
        "SELECT id,login,display_name AS displayName,enabled,blocked FROM users WHERE admin=1 ORDER BY login",
      )
      .all();
  }
}
