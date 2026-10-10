import pg from "pg";
import { readFile } from "node:fs/promises";
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
export async function migrate(db: DB) {
  await transaction(db, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(732198421)");
    const exists = await c.query(
      "SELECT to_regclass('public.schema_migrations') AS name",
    );
    if (!exists.rows[0].name) {
      const path = existsSync(resolve("dist/api/001_core.sql"))
        ? "dist/api/001_core.sql"
        : "apps/api/migrations/001_core.sql";
      await c.query(await readFile(path, "utf8"));
    }
    const versions = await c.query(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    const installed = versions.rows.map((r) => r.version).join(",");
    if (installed === "1") {
      const path = existsSync(resolve("dist/api/002_agents.sql"))
        ? "dist/api/002_agents.sql"
        : "apps/api/migrations/002_agents.sql";
      await c.query(await readFile(path, "utf8"));
    } else if (installed !== "1,2" && installed !== "1,2,3")
      throw new Error("Nicht unterstützter Migrationsstand.");
    if (installed !== "1,2,3") {
      const path = existsSync(resolve("dist/api/003_offline.sql"))
        ? "dist/api/003_offline.sql"
        : "apps/api/migrations/003_offline.sql";
      await c.query(await readFile(path, "utf8"));
    }
  });
}
