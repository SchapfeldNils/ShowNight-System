import EmbeddedPostgres from "embedded-postgres";
import ffprobe from "ffprobe-static";
import ffmpeg from "ffmpeg-static";
import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../apps/api/src/config.js";
import { database, migrate } from "../apps/api/src/db.js";
import { createApp } from "../apps/api/src/app.js";
import { bootstrap } from "../apps/api/src/auth.js";
import { demoPng } from "../apps/api/src/demo.js";
export async function fixture(port = 55433) {
  const dir = resolve(".local/tests/" + randomBytes(8).toString("hex"));
  await mkdir(dir, { recursive: true });
  const dbPassword = randomBytes(24).toString("hex");
  const pg = new EmbeddedPostgres({
    databaseDir: join(dir, "postgres"),
    user: "shownight",
    password: dbPassword,
    port,
    persistent: true,
    authMethod: "scram-sha-256",
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("shownight_test");
  const cfg = config({
    DATABASE_URL: `postgres://shownight:${dbPassword}@127.0.0.1:${port}/shownight_test`,
    MFA_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    MEDIA_ROOT: join(dir, "media"),
    FFPROBE_PATH: process.env.FFPROBE_PATH || ffprobe.path,
    FFMPEG_PATH: process.env.FFMPEG_PATH || ffmpeg,
    PUBLIC_BASE_URL: "http://localhost:3000",
    DEMO_ENABLED: "true",
    MAX_UPLOAD_BYTES: "4096",
  });
  const db = database(cfg.DATABASE_URL);
  await migrate(db);
  const adminPassword = randomBytes(20).toString("hex");
  await bootstrap(db, "admin", "Testadministration", adminPassword);
  const app = await createApp(db, cfg);
  await app.ready();
  const video = join(dir, "synthetic.mp4");
  await promisify(execFile)(
    cfg.FFMPEG_PATH,
    [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=green:s=32x32:d=0.2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      video,
    ],
    { windowsHide: true, timeout: 30000 },
  );
  const videoBytes = await readFile(video);
  const require = createRequire(import.meta.url);
  const binaries = await import(
    pathToFileURL(
      join(dirname(require.resolve("embedded-postgres")), "binary.js"),
    ).href
  );
  const bin = (await binaries.default()) as {
    postgres: string;
    pg_ctl: string;
    initdb: string;
  };
  return {
    pg,
    db,
    cfg,
    app,
    dir,
    bin,
    adminPassword,
    demoPng,
    videoBytes,
    async close() {
      await app.close();
      await db.end();
      await pg.stop();
    },
  };
}
export function multipartFile(bytes: Buffer, filename = "demo.png") {
  const boundary = "shownight-test-boundary";
  return {
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    contentType: "multipart/form-data; boundary=" + boundary,
  };
}
