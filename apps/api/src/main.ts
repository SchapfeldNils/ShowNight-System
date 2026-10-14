import { config } from "./config.js";
import { database } from "./db.js";
import { createApp } from "./app.js";
const cfg = config(process.env, false),
  db = database(cfg.DATABASE_URL);
const app = await createApp(db, cfg, true);
await app.listen({ host: cfg.HOST, port: cfg.PORT });
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    void app
      .close()
      .then(() => db.end())
      .then(() => process.exit(0));
  });
