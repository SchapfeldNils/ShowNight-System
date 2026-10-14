import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
export type DB = pg.Pool;
export type Queryable = Pick<pg.PoolClient, "query">;
export function database(url: string) {
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 3000,
    statement_timeout: 10000,
  });
  pool.on("error", () => {
    /* Idle connection failures are handled by readiness and subsequent queries. No secret-bearing errors are logged. */
  });
  return pool;
}
export async function transaction<T>(
  db: DB,
  action: (client: pg.PoolClient) => Promise<T>,
  isolation = "",
) {
  const client = await db.connect();
  try {
    await client.query(
      "BEGIN" + (isolation ? " ISOLATION LEVEL " + isolation : ""),
    );
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
async function migrationFiles() {
  const directory = existsSync(resolve("dist/api/001_core.sql"))
    ? "dist/api"
    : "apps/api/migrations";
  const files = (await readdir(directory))
    .filter((file) => /^\d{3}_[a-z_]+\.sql$/.test(file))
    .sort();
  if (
    !files.length ||
    files[0] !== "001_core.sql" ||
    new Set(files.map((f) => Number(f.slice(0, 3)))).size !== files.length
  )
    throw new Error("Ungültige Migrationen.");
  return files.map((file) => ({
    version: Number(file.slice(0, 3)),
    path: resolve(directory, file),
  }));
}
export async function migrationVersions() {
  return (await migrationFiles()).map((file) => file.version);
}
export async function migrate(db: DB) {
  const files = await migrationFiles();
  await transaction(db, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(732198421)");
    const exists = await c.query(
      "SELECT to_regclass('public.schema_migrations') AS name",
    );
    const installed = exists.rows[0].name
      ? (
          await c.query(
            "SELECT version FROM schema_migrations ORDER BY version",
          )
        ).rows.map((r) => r.version as number)
      : [];
    if (
      installed.some(
        (version) => !files.some((file) => file.version === version),
      )
    )
      throw new Error("Nicht unterstützter Migrationsstand.");
    for (const file of files)
      if (!installed.includes(file.version))
        await c.query(await readFile(file.path, "utf8"));
  });
}
