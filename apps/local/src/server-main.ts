import { readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { serverTrust } from "../../../packages/contracts/src/offline.js";
import { keyFingerprint } from "../../../packages/transfer/src/offline.js";
import { packageHeader } from "../../../packages/transfer/src/archive.js";
import { secureDirectory } from "../../agent/src/identity.js";
import { PackageStore } from "./store.js";
import { LocalAccounts } from "./accounts.js";
import {
  initVault,
  loadVault,
  saveVault,
  boundedJson,
  importAccounts,
} from "./vault.js";
import { localServer } from "./server.js";
async function inputPath(arg?: string) {
  const ui = createInterface({ input: stdin, output: stdout });
  let p = arg;
  try {
    p ??= await ui.question("Dateipfad: ");
  } finally {
    ui.close();
  }
  return resolve(p.trim().replace(/^"(.*)"$/, "$1"));
}
async function main() {
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA)
    throw new Error("Windows erforderlich.");
  const root = join(process.env.LOCALAPPDATA, "ShowNight", "local-server"),
    secrets = join(process.env.LOCALAPPDATA, "ShowNight", "secrets"),
    packageRoot = join(process.env.LOCALAPPDATA, "ShowNight", "local-packages");
  const mode = process.argv[2] ?? "run";
  if (mode === "init") {
    const { vault, recovery } = await initVault(root, secrets);
    const a = new LocalAccounts(root, vault.key);
    try {
      a.configureRecovery(recovery);
    } finally {
      a.close();
    }
    console.log(
      "Lokaler Server eingerichtet. Zielanfrage: " +
        join(root, "server.sntarget"),
    );
    console.log(
      "Zertifikat: " +
        join(root, "server.cer") +
        " · manuell für diesen Benutzer vertrauen.",
    );
    console.log(
      "Wiederherstellungsschlüssel separat sichern: " +
        join(secrets, "local-server-recovery.env"),
    );
    return;
  }
  const v = await loadVault(root);
  if (mode === "trust") {
    const trust = serverTrust.parse(
      await boundedJson(await inputPath(process.argv[3]), 16384),
    );
    if (keyFingerprint(trust.publicKey) !== trust.fingerprint)
      throw new Error("Vertrauensdatei widersprüchlich.");
    if (
      v.trust &&
      (v.trust.fingerprint !== trust.fingerprint ||
        v.trust.serverOrigin !== trust.serverOrigin)
    )
      throw new Error(
        "Server- oder Schlüsselwechsel erfordert gesonderte Einrichtung.",
      );
    await saveVault(root, { ...v, trust });
    console.log(
      "Ausdrücklich importierter Serverschlüssel: " +
        trust.serverOrigin +
        " · " +
        trust.fingerprint,
    );
    return;
  }
  await secureDirectory(packageRoot);
  const packages = new PackageStore(packageRoot),
    a = new LocalAccounts(root, v.key);
  let retained = false;
  try {
    if (mode === "import-auth") {
      const r = await importAccounts(
        await inputPath(process.argv[3]),
        v,
        packages,
        a,
      );
      console.log(
        r.status === "imported"
          ? "Anmeldestand importiert; alle Sitzungen beendet."
          : "Identischer Anmeldestand bereits vorhanden.",
      );
    } else if (mode === "admins") {
      console.table(a.admins());
    } else if (mode === "recover") {
      const file = await readFile(
        join(secrets, "local-server-recovery.env"),
        "utf8",
      );
      const values = Object.fromEntries(
        file
          .split(/\r?\n/)
          .filter((l) => l && !l.startsWith("#"))
          .map((l) => {
            const i = l.indexOf("=");
            return [l.slice(0, i), l.slice(i + 1)];
          }),
      );
      await a.recover(
        values.LOCAL_RECOVERY_KEY ?? "",
        values.LOCAL_RECOVERY_USER ?? "",
        values.LOCAL_RECOVERY_PASSWORD ?? "",
      );
      console.log(
        "Lokales Adminkonto wiederhergestellt. Neues Kennwort und lokale MFA beim nächsten Login verwenden; Datei-Kennwort wieder leeren.",
      );
    } else if (mode === "run") {
      if (!a.meta("snapshot_id")) throw new Error("Anmeldestand fehlt.");
      // Refuse corrupt prepared files before opening any listener.
      for (const p of a.packageBindings())
        if (
          (await packages.verify(p.id)).status !== "valid" ||
          packages.metadata(p.id).manifest.eventId !== p.eventId ||
          packageHeader(packages.metadata(p.id).manifest).hash !== p.manifestSha
        )
          throw new Error("Vorbereitete Inhalte unvollständig.");
      const bundledWeb = join(dirname(fileURLToPath(import.meta.url)), "web");
      const webRoot = existsSync(bundledWeb)
        ? bundledWeb
        : resolve("dist/server/web");
      const server = await localServer(a, packages, v.origin, webRoot, {
        pfx: await readFile(join(root, "server.pfx")),
        passphrase: v.pfxPassword,
        minVersion: "TLSv1.2",
      });
      server.addHook("onClose", async () => {
        a.close();
        packages.close();
      });
      await server.listen({ host: "127.0.0.1", port: 3443 });
      retained = true;
      console.log(
        "ShowNight Offlinevorbereitung · " +
          v.origin +
          " · keine Live-/Geräteausgabe · Mail aus",
      );
      const stop = () => {
        void server.close().catch(() => {
          process.exitCode = 1;
        });
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    } else throw new Error("Unbekannter Modus.");
  } finally {
    if (!retained) {
      a.close();
      packages.close();
    }
  }
}
main().catch(() => {
  console.error(
    "Lokaler Server fehlgeschlagen. Anleitung, vorbereitete Dateien, Rechte und Zertifikat prüfen. Keine Geheimnisse im Chat senden.",
  );
  process.exitCode = 1;
});
