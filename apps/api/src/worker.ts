import { execFile } from "node:child_process";
import { promisify } from "node:util";
import nodemailer from "nodemailer";
import { z } from "zod";
import type { DB } from "./db.js";
import type { Config } from "./config.js";
import { blobPath, fileHash } from "./media.js";
const exec = promisify(execFile);
export async function processMedia(db: DB, cfg: Config) {
  const row = (
    await db.query(
      `UPDATE media SET lease_until=now()+interval '2 minutes',attempts=attempts+1 WHERE id=(SELECT id FROM media WHERE status='processing' AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
    )
  ).rows[0];
  if (!row) return false;
  try {
    const path = blobPath(cfg, row.blob_key);
    if ((await fileHash(path)) !== row.sha256) throw new Error("checksum");
    const { stdout } = await exec(
      cfg.FFPROBE_PATH,
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        path,
      ],
      { timeout: 60000, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    const probe = z
      .object({
        streams: z
          .array(
            z.object({
              codec_type: z.string(),
              codec_name: z.string().optional(),
              width: z.number().optional(),
              height: z.number().optional(),
            }),
          )
          .min(1),
        format: z.object({ duration: z.string().optional() }),
      })
      .parse(JSON.parse(stdout));
    const expected = row.mime.startsWith("audio/") ? "audio" : "video";
    if (!probe.streams.some((s) => s.codec_type === expected))
      throw new Error("stream");
    if (
      expected === "video" &&
      !probe.streams.some(
        (s) =>
          s.codec_type === "video" && (s.width ?? 0) > 0 && (s.height ?? 0) > 0,
      )
    )
      throw new Error("dimensions");
    // Header inspection alone can accept truncated or corrupt files. Decode the
    // supported audio/video streams with a bounded subprocess before marking ready.
    const decoded = await exec(
      cfg.FFMPEG_PATH,
      [
        "-v",
        "error",
        "-xerror",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        path,
        "-map",
        "0:v?",
        "-map",
        "0:a?",
        "-f",
        "null",
        "-",
      ],
      { timeout: 60000, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    if (decoded.stderr.trim()) throw new Error("decode");
    const duration = probe.format.duration
      ? Number(probe.format.duration)
      : undefined;
    await db.query(
      "UPDATE media SET status='ready',analysis=$2,error=NULL,lease_until=NULL WHERE id=$1",
      [
        row.id,
        JSON.stringify({
          duration: Number.isFinite(duration) ? duration : undefined,
          streams: probe.streams,
          audioAnalysis: probe.streams.some((s) => s.codec_type === "audio")
            ? "not_run_s1"
            : "not_applicable",
        }),
      ],
    );
  } catch {
    await db.query(
      "UPDATE media SET status='failed',error='Datei beschädigt, Analysewerkzeug nicht verfügbar oder Prüfung fehlgeschlagen.',lease_until=NULL WHERE id=$1",
      [row.id],
    );
  }
  return true;
}
export async function processMail(db: DB, cfg: Config) {
  // A worker crash during SMTP cannot prove whether the peer accepted the message.
  await db.query(
    "UPDATE mail_jobs SET status='unknown',last_error='Worker unterbrochen; Übergabe unbestätigt.' WHERE status='sending' AND started_at<now()-interval '5 minutes'",
  );
  const job = (
    await db.query(
      `UPDATE mail_jobs SET status='sending',attempts=attempts+1,started_at=now() WHERE id=(SELECT id FROM mail_jobs WHERE status='queued' AND next_attempt_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
    )
  ).rows[0];
  if (!job) return false;
  if (cfg.MAIL_DELIVERY_ENABLED === "false") {
    await db.query(
      "UPDATE mail_jobs SET status='simulated',provider_message_id=NULL,last_error=NULL WHERE id=$1",
      [job.id],
    );
    return true;
  }
  const transport = nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: cfg.SMTP_PORT,
    secure: cfg.SMTP_TLS_MODE === "implicit",
    requireTLS: cfg.SMTP_TLS_MODE === "starttls",
    auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASSWORD },
    tls: { rejectUnauthorized: true },
    connectionTimeout: 10000,
    socketTimeout: 30000,
    logger: false,
    debug: false,
  });
  try {
    const result = await transport.sendMail({
      from: cfg.MAIL_FROM_ADDRESS,
      replyTo: cfg.MAIL_REPLY_TO,
      to: job.recipient,
      subject: job.subject,
      text: job.body,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    await db.query(
      "UPDATE mail_jobs SET status='accepted_by_smtp',provider_message_id=$2,last_error=NULL WHERE id=$1",
      [job.id, result.messageId],
    );
  } catch (e) {
    const code = (e as { code?: string }).code;
    const safeRetry = ["ECONNECTION", "EDNS", "EAUTH", "ETLS"].includes(
      code ?? "",
    );
    const status = safeRetry
      ? job.attempts >= 3
        ? "failed"
        : "queued"
      : "unknown";
    await db.query(
      "UPDATE mail_jobs SET status=$2,next_attempt_at=now()+interval '5 minutes',last_error=$3 WHERE id=$1",
      [
        job.id,
        status,
        safeRetry
          ? "SMTP-Verbindungsaufbau fehlgeschlagen."
          : "SMTP-Übergabe unbestätigt; keine automatische Wiederholung.",
      ],
    );
  } finally {
    transport.close();
  }
  return true;
}
export async function workerTick(db: DB, cfg: Config) {
  await processMedia(db, cfg);
  await processMail(db, cfg);
  await db.query(
    "DELETE FROM sessions WHERE expires_at<now(); DELETE FROM challenges WHERE expires_at<now(); DELETE FROM invitations WHERE expires_at<now()",
  );
}
