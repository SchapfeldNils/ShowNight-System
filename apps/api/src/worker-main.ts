import { setTimeout } from "node:timers/promises";
import { config } from "./config.js";
import { database } from "./db.js";
import { workerTick } from "./worker.js";
const cfg = config(),
  db = database(cfg.DATABASE_URL);
let running = true;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    running = false;
  });
while (running) {
  try {
    await workerTick(db, cfg);
  } catch {
    process.stderr.write(
      "Worker: Abhängigkeit nicht verfügbar; erneuter Versuch.\n",
    );
  }
  await setTimeout(2000);
}
await db.end();
