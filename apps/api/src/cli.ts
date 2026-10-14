import { config } from "./config.js";
import { database, migrate, transaction } from "./db.js";
import { bootstrap } from "./auth.js";
import { hashPassword } from "./security.js";
import { seedDemo } from "./demo.js";
import { password } from "../../../packages/contracts/src/index.js";
const cfg = config(process.env, false),
  db = database(cfg.DATABASE_URL);
try {
  const command = process.argv[2];
  if (command === "migrate") {
    await migrate(db);
    console.log("Migration 1 geprüft.");
  } else if (command === "bootstrap") {
    await bootstrap(
      db,
      process.env.BOOTSTRAP_LOGIN ?? "",
      process.env.BOOTSTRAP_NAME ?? "Administration",
      process.env.BOOTSTRAP_PASSWORD ?? "",
    );
    console.log("Erstkonto angelegt. Beim ersten Login MFA einrichten.");
  } else if (command === "demo") {
    console.log(await seedDemo(db, cfg));
  } else if (command === "recover") {
    if (process.env.RECOVERY_CONFIRM !== "RESET_MFA_AND_SESSIONS")
      throw new Error(
        "Host-Wiederherstellung benötigt RECOVERY_CONFIRM=RESET_MFA_AND_SESSIONS.",
      );
    const login = process.env.RECOVERY_LOGIN,
      secret = password.parse(process.env.RECOVERY_PASSWORD);
    await transaction(db, async (c) => {
      const r = await c.query(
        "UPDATE users SET password_hash=$2,mfa_secret=NULL,mfa_counter=-1,recovery_hashes='[]' WHERE login=$1 RETURNING id",
        [login, await hashPassword(secret)],
      );
      if (!r.rowCount) throw new Error("Konto fehlt.");
      const uid = r.rows[0].id;
      await c.query("DELETE FROM sessions WHERE user_id=$1", [uid]);
      await c.query("DELETE FROM challenges WHERE user_id=$1", [uid]);
    });
    console.log(
      "Kennwort ersetzt, Sitzungen widerrufen. MFA beim nächsten Login neu einrichten.",
    );
  } else throw new Error("Befehl: migrate | bootstrap | demo | recover");
} catch {
  console.error(
    "Befehl fehlgeschlagen. Konfiguration, Konto und Voraussetzungen prüfen. Keine Zugangsdaten protokolliert.",
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
