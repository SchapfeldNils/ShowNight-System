import type { Actor } from "./auth.js";
import type { Queryable } from "./db.js";
import { missing, forbidden } from "./errors.js";
export async function eventAccess(
  db: Queryable,
  user: Actor,
  eventId: string,
  edit = false,
) {
  const r = await db.query(
    `SELECT e.*, EXISTS(SELECT 1 FROM grants WHERE event_id=e.id AND user_id=$2 AND role='leitung') AS lead,
    EXISTS(SELECT 1 FROM grants WHERE event_id=e.id AND user_id=$2) OR EXISTS(SELECT 1 FROM event_teams et JOIN team_members tm ON tm.team_id=et.team_id WHERE et.event_id=e.id AND tm.user_id=$2) AS member
    FROM events e WHERE e.id=$1`,
    [eventId, user.id],
  );
  const e = r.rows[0];
  if (!e || (!user.admin && !e.lead && !e.member)) missing();
  if (edit && !user.admin && !e.lead) forbidden();
  return e;
}
export async function showAccess(
  db: Queryable,
  user: Actor,
  showId: string,
  edit = false,
) {
  const r = await db.query(
    `SELECT s.*, EXISTS(SELECT 1 FROM show_teams st JOIN team_members tm ON tm.team_id=st.team_id WHERE st.show_id=s.id AND tm.user_id=$2) AS assigned FROM shows s WHERE s.id=$1`,
    [showId, user.id],
  );
  const s = r.rows[0];
  if (!s) missing();
  let canEdit = user.admin;
  if (s.event_id) {
    const e = await eventAccess(db, user, s.event_id);
    canEdit ||= e.lead || s.assigned;
  } else {
    if (!user.admin && s.created_by !== user.id && !s.assigned) missing();
    canEdit ||= s.created_by === user.id || s.assigned;
  }
  if (edit && !canEdit) forbidden();
  return { ...s, canEdit };
}
export async function mediaAccess(db: Queryable, user: Actor, mediaId: string) {
  const m = (await db.query("SELECT * FROM media WHERE id=$1", [mediaId]))
    .rows[0];
  if (!m) missing();
  if (user.admin) return m;
  if (m.event_id) {
    try {
      await eventAccess(db, user, m.event_id);
      return m;
    } catch (e) {
      if (
        !(
          e instanceof Error &&
          "status" in e &&
          [403, 404].includes(Number(e.status))
        )
      )
        throw e;
    }
  }
  const links = (
    await db.query("SELECT show_id FROM show_media WHERE media_id=$1", [
      mediaId,
    ])
  ).rows;
  for (const link of links) {
    try {
      await showAccess(db, user, link.show_id);
      return m;
    } catch (e) {
      if (
        !(
          e instanceof Error &&
          "status" in e &&
          [403, 404].includes(Number(e.status))
        )
      )
        throw e;
    }
  }
  missing();
}
