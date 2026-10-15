// Testprozess für tests/local-control.test.ts: öffnet den echten Steuerkanal und
// beendet sich ausschließlich nach einer gültigen Stoppanforderung.
import { startControl } from "../apps/local/src/control.js";

async function main() {
  const root = process.argv[2];
  if (!root) throw new Error("Datenordner fehlt.");
  const control = await startControl({
    root,
    origin: "https://localhost:3443",
    mode: "run",
    onStop: () => {
      void control.close().then(() => {
        console.log("stopped");
        process.exit(0);
      });
    },
  });
  // Hält den Prozess wie ein laufender Server am Leben.
  setInterval(() => {}, 1000);
  console.log("ready");
}
void main();
