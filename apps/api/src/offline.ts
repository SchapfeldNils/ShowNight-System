import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id, manifest } from "../../../packages/contracts/src/index.js";
import {
  localTarget,
  offlineSnapshot,
  type OfflineGrant,
} from "../../../packages/contracts/src/offline.js";
import {
  trustFor,
  encryptSnapshot,
} from "../../../packages/transfer/src/offline.js";
import { packageHeader } from "../../../packages/transfer/src/archive.js";
import { type DB, transaction } from "./db.js";
import { type Config } from "./config.js";
import { forbidden, missing, HttpError } from "./errors.js";
import { checkManifest } from "./packages.js";
import { unseal } from "./security.js";
export function offlineRoutes(app: FastifyInstance, db: DB, cfg: Config) {
  app.get("/api/v1/offline/trust", async (req, reply) => {
    if (!req.actor.admin) forbidden();
    return reply
      .header(
        "Content-Disposition",
        'attachment; filename="shownight-server.sntrust"',
      )
      .send(trustFor(cfg.MFA_ENCRYPTION_KEY, cfg.origin));
  });
  app.post("/api/v1/offline/exports", async (req, reply) => {
    if (!req.actor.admin || !req.actor.mfaVerified) forbidden();
    const input = z
      .strictObject({
        target: localTarget,
        packageIds: z.array(id).min(1).max(20),
      })
      .parse(req.body);
    if (new Set(input.packageIds).size !== input.packageIds.length)
      throw new HttpError(400, "DUPLICATE", "Doppelte Paketkennung.");
    const snapshot = await transaction(
      db,
      async (c) => {
        const packages = [],
          events = new Set<string>(),
          shows = new Map<string, string[]>();
        for (const pid of input.packageIds) {
          const p = (await c.query("SELECT * FROM packages WHERE id=$1", [pid]))
            .rows[0];
          if (!p) missing();
          const m = await checkManifest(c, cfg, manifest.parse(p.manifest));
          if (m.status !== "valid")
            throw new HttpError(
              409,
              "PACKAGE_INVALID",
              "Alle Inhalte zuerst vollständig vorbereiten.",
            );
          const h = packageHeader(m);
          packages.push({ id: pid, eventId: p.event_id, manifestSha: h.hash });
          events.add(p.event_id);
          shows.set(p.event_id, [
            ...new Set([
              ...(shows.get(p.event_id) ?? []),
              ...m.shows.map((s) => s.id),
            ]),
          ]);
        }
        const users = [];
        const all = (await c.query("SELECT * FROM users ORDER BY id")).rows;
        for (const u of all) {
          const grants: OfflineGrant[] = [];
          for (const eventId of events) {
            const roles = (
              await c.query(
                "SELECT role FROM grants WHERE user_id=$1 AND event_id=$2",
                [u.id, eventId],
              )
            ).rows.map((r) => r.role);
            const team = (
              await c.query(
                "SELECT 1 FROM event_teams et JOIN team_members tm ON tm.team_id=et.team_id WHERE et.event_id=$1 AND tm.user_id=$2 LIMIT 1",
                [eventId, u.id],
              )
            ).rowCount;
            if (!roles.length && !team && !u.admin) continue;
            const assigned = (
              await c.query(
                "SELECT DISTINCT st.show_id FROM show_teams st JOIN team_members tm ON tm.team_id=st.team_id WHERE tm.user_id=$1 AND st.show_id=ANY($2::uuid[])",
                [u.id, shows.get(eventId)],
              )
            ).rows.map((r) => r.show_id);
            grants.push({
              eventId,
              roles: [
                ...new Set([
                  ...roles,
                  ...(team || u.admin ? ["mitglied"] : []),
                ]),
              ],
              assignedShows: assigned,
            });
          }
          if (!grants.length && !u.admin) continue;
          users.push({
            id: u.id,
            login: u.login,
            displayName: u.display_name,
            admin: u.admin,
            enabled: u.enabled,
            passwordHash: u.password_hash,
            mfaSecret: u.mfa_secret
              ? unseal(u.mfa_secret, cfg.MFA_ENCRYPTION_KEY)
              : null,
            grants,
          });
        }
        const snapshotId = randomUUID();
        const row = (
          await c.query(
            "INSERT INTO offline_exports(id,target_id,package_ids,created_by) VALUES($1,$2,$3,$4) RETURNING sequence",
            [snapshotId, input.target.targetId, input.packageIds, req.actor.id],
          )
        ).rows[0];
        return offlineSnapshot.parse({
          schemaVersion: 1,
          id: snapshotId,
          serverOrigin: cfg.origin,
          sequence: Number(row.sequence),
          createdAt: new Date().toISOString(),
          packages,
          users,
        });
      },
      "REPEATABLE READ",
    );
    const envelope = encryptSnapshot(
      snapshot,
      input.target,
      cfg.MFA_ENCRYPTION_KEY,
    );
    return reply
      .header(
        "Content-Disposition",
        'attachment; filename="shownight-' + snapshot.id + '.snauth"',
      )
      .send(envelope);
  });
}
