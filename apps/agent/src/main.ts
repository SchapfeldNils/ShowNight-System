import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { join } from "node:path";
import { open, unlink, access } from "node:fs/promises";
import {
  secureDirectory,
  pair,
  saveIdentity,
  loadIdentity,
} from "./identity.js";
import { startAgent } from "./client.js";
import { virtualDjClock } from "./virtualdj.js";
import { localCapabilities } from "./diagnostics.js";
async function main() {
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA)
    throw new Error("Dieser Prototyp benötigt Windows und Node 24.");
  const dir = join(process.env.LOCALAPPDATA, "ShowNight", "agent");
  const mode = process.argv[2] ?? "run";
  if (mode === "pair") {
    await secureDirectory(dir);
    try {
      await access(join(dir, "identity.dpapi"));
      throw new Error("ALREADY_PAIRED");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error(
          "Bereits gepaart. Bestehendes Gerät zuerst bewusst widerrufen; Anleitung beachten.",
        );
    }
    const ui = createInterface({ input: stdin, output: stdout });
    try {
      const server = await ui.question(
        "Serveradresse (vollständiges https://...): ",
      );
      const code = await ui.question("Einmaliger Paarungscode: ");
      const identity = await pair(server.trim(), code.trim());
      await saveIdentity(dir, identity);
      console.log(
        "Gepaart als " +
          identity.profile +
          " · " +
          identity.deviceId +
          ". Jetzt Start.cmd öffnen.",
      );
    } finally {
      ui.close();
    }
  } else if (mode === "check-vdj") {
    const ui = createInterface({ input: stdin, output: stdout });
    try {
      const port = Number(await ui.question("Lokaler Network-Control-Port: "));
      const bearer = await ui.question(
        "Plugin-Authentifizierungsstring (bleibt nur lokal im Speicher): ",
      );
      const result = await virtualDjClock(port, bearer);
      console.log(
        "Leseabfrage bestätigt: " +
          result.clock +
          ". Kein Wiedergabe-/Ton-/Synchronitätsnachweis.",
      );
    } finally {
      ui.close();
    }
  } else if (mode === "run") {
    const identity = await loadIdentity(dir);
    const lock = join(dir, "running.lock");
    const file = await open(lock, "wx").catch(() => {
      throw new Error(
        "Agent läuft bereits oder Sperrdatei nach Absturz vorhanden. Anleitung beachten.",
      );
    });
    await file.writeFile(String(process.pid));
    await file.close();
    const agent = startAgent(
      identity,
      dir,
      (state) => console.log(new Date().toISOString() + " · " + state),
      localCapabilities(
        identity.profile,
        join(process.env.LOCALAPPDATA, "ShowNight", "secrets", "virtualdj.env"),
      ),
    );
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      agent.stop();
      await unlink(lock);
    };
    process.once("SIGINT", () => void stop());
    process.once("SIGTERM", () => void stop());
    process.once("beforeExit", () => void stop());
    console.log(
      "ShowNight Windows-Agent 0.2.1 · " +
        identity.profile +
        " · " +
        identity.server +
        " · keine Bühnenausgabe",
    );
  } else throw new Error("Modus: pair, run oder check-vdj.");
}
main().catch(() => {
  console.error(
    "Agentstart fehlgeschlagen. Server/Paarung, Windows-Schlüsselablage und Sperrdatei prüfen. Keine Zugangsdaten werden protokolliert.",
  );
  process.exitCode = 1;
});
