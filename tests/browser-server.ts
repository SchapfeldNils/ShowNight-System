import { writeFile } from "node:fs/promises";
import { fixture } from "./fixture.js";
import { workerTick } from "../apps/api/src/worker.js";
const f = await fixture(55434);
await writeFile(
  ".local/browser-credentials.json",
  JSON.stringify({
    login: "admin",
    password: f.adminPassword,
    png: f.demoPng.toString("base64"),
  }),
  { mode: 0o600 },
);
await f.app.listen({ host: "127.0.0.1", port: 3000 });
let working = false;
const timer = setInterval(() => {
  if (!working) {
    working = true;
    void workerTick(f.db, f.cfg)
      .catch(() => {})
      .finally(() => {
        working = false;
      });
  }
}, 500);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    clearInterval(timer);
    void f.close().then(() => process.exit(0));
  });
