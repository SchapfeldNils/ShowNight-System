import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import type { DB } from "./db.js";
import { transaction } from "./db.js";
import type { Config } from "./config.js";
import { hash } from "./security.js";
import { remember } from "./content.js";
import { blobPath } from "./media.js";
export const demoPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4+7YFAATJAj8w6zk9AAAAAElFTkSuQmCC",
  "base64",
);
export async function seedDemo(db: DB, cfg: Config) {
  if (cfg.DEMO_ENABLED !== "true" || cfg.MAIL_DELIVERY_ENABLED !== "false")
    throw new Error(
      "Demo benötigt DEMO_ENABLED=true und ausgeschalteten Versand.",
    );
  const admin = (
    await db.query(
      "SELECT id FROM users WHERE admin ORDER BY created_at LIMIT 1",
    )
  ).rows[0];
  if (!admin) throw new Error("Zuerst Admin-Bootstrap ausführen.");
  await mkdir(cfg.MEDIA_ROOT, { recursive: true });
  return transaction(db, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(732198422)");
    if (
      (
        await c.query(
          "SELECT 1 FROM events WHERE name='DEMO · ShowNight Musterabend'",
        )
      ).rowCount
    )
      return { created: false };
    const eventId = randomUUID(),
      showId = randomUUID(),
      copyId = randomUUID(),
      teamId = randomUUID(),
      mediaId = randomUUID();
    const cues = [
      {
        id: randomUUID(),
        name: "Begrüßung",
        triggerHint: "Moderation ist bereit",
        notes: "Synthetische Vorbereitung – kein GO in S1.",
        enabled: true,
        mediaIds: [mediaId],
      },
      {
        id: randomUUID(),
        name: "Showbeitrag",
        triggerHint: "Team bereit",
        notes: "Technikanforderung noch offen.",
        enabled: true,
        mediaIds: [],
      },
    ];
    const e = (
      await c.query(
        "INSERT INTO events(id,name,modules,created_by) VALUES($1,$2,$3,$4) RETURNING *",
        [
          eventId,
          "DEMO · ShowNight Musterabend",
          JSON.stringify(["organisation", "shows", "technik"]),
          admin.id,
        ],
      )
    ).rows[0];
    await c.query(
      "INSERT INTO grants(event_id,user_id,role) VALUES($1,$2,'leitung')",
      [eventId, admin.id],
    );
    await c.query("INSERT INTO teams(id,name,created_by) VALUES($1,$2,$3)", [
      teamId,
      "DEMO · Team Sternlicht",
      admin.id,
    ]);
    await c.query("INSERT INTO team_members(team_id,user_id) VALUES($1,$2)", [
      teamId,
      admin.id,
    ]);
    await c.query("INSERT INTO event_teams(event_id,team_id) VALUES($1,$2)", [
      eventId,
      teamId,
    ]);
    for (const sid of [showId, copyId]) {
      const s = (
        await c.query(
          "INSERT INTO shows(id,event_id,name,description,cues,created_by,source_show_id,source_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
          [
            sid,
            sid === copyId ? eventId : null,
            "DEMO · Sternlicht",
            "Unabhängige Vorlage mit getrennter Veranstaltungskopie.",
            JSON.stringify(cues.map((cue) => ({ ...cue, id: randomUUID() }))),
            admin.id,
            sid === copyId ? showId : null,
            sid === copyId ? 1 : null,
          ],
        )
      ).rows[0];
      await remember(c, "show", s, admin.id);
      await c.query("INSERT INTO show_teams(show_id,team_id) VALUES($1,$2)", [
        sid,
        teamId,
      ]);
    }
    await writeFile(blobPath(cfg, mediaId), demoPng, {
      flag: "wx",
      mode: 0o600,
    });
    await c.query(
      "INSERT INTO media(id,show_id,created_by,name,blob_key,size_bytes,sha256,mime,status) VALUES($1,$2,$3,'demo.png',$6,$4,$5,'image/png','processing')",
      [mediaId, showId, admin.id, demoPng.length, hash(demoPng), mediaId],
    );
    for (const sid of [showId, copyId])
      await c.query("INSERT INTO show_media(show_id,media_id) VALUES($1,$2)", [
        sid,
        mediaId,
      ]);
    await remember(c, "event", e, admin.id);
    return { created: true, eventId };
  });
}
