import EmbeddedPostgres from "embedded-postgres";
import ffprobe from "ffprobe-static";
import ffmpeg from "ffmpeg-static";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
const mode = process.argv[2];
await mkdir(".local", { recursive: true });
if (mode === "setup") {
  try {
    await access(".env");
    console.log(".env vorhanden; nicht überschrieben.");
  } catch {
    const secret = randomBytes(24).toString("hex");
    await writeFile(
      ".env",
      `PUBLIC_BASE_URL=http://localhost:3000\nHOST=127.0.0.1\nPORT=3000\nDATABASE_URL=postgres://shownight:${secret}@127.0.0.1:55432/shownight\nMFA_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\nMEDIA_ROOT=.local/media\nMAX_UPLOAD_BYTES=104857600\nFFPROBE_PATH="${ffprobe.path.replaceAll("\\", "/")}"\nFFMPEG_PATH="${ffmpeg.replaceAll("\\", "/")}"\nMAIL_MODE=test\nMAIL_DELIVERY_ENABLED=false\nDEMO_ENABLED=true\nTRUSTED_PROXY_CIDRS=\n`,
      { mode: 0o600, flag: "wx" },
    );
    console.log("Lokale .env mit zufälligen Geheimnissen erstellt.");
  }
  console.log(
    "Weiter: pnpm local:db (eigenes Terminal), pnpm db:migrate, pnpm admin:bootstrap, pnpm build, pnpm dev, pnpm worker.",
  );
} else if (mode === "db") {
  const env = await readFile(".env", "utf8");
  const line = env.split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("Zuerst local:setup.");
  const url = new URL(line.slice("DATABASE_URL=".length));
  if (url.hostname !== "127.0.0.1" || url.port !== "55432")
    throw new Error(
      "local:db startet nur die isolierte lokale Datenbank auf Port 55432.",
    );
  const pg = new EmbeddedPostgres({
    databaseDir: resolve(".local/postgres"),
    user: url.username,
    password: url.password,
    port: 55432,
    persistent: true,
    initdbFlags: ["--auth-host=scram-sha-256", "--auth-local=scram-sha-256"],
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  try {
    await access(".local/postgres/PG_VERSION");
  } catch {
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase(url.pathname.slice(1));
  } catch {
    /* Database may already exist; migration checks actual readiness. */
  }
  console.log(
    "PostgreSQL lokal auf 127.0.0.1:55432. Ctrl+C beendet den Prozess; Daten bleiben.",
  );
  let stopping = false;
  for (const s of ["SIGTERM", "SIGINT"] as const)
    process.on(s, () => {
      if (!stopping) {
        stopping = true;
        void pg.stop().then(() => process.exit(0));
      }
    });
} else throw new Error("local.ts setup | db");
