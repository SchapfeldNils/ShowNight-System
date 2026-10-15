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
import { LocalAccounts, OfflineLoginConflict } from "./accounts.js";
import {
  initVault,
  loadVault,
  saveVault,
  boundedJson,
  importAccounts,
} from "./vault.js";
import { localServer } from "./server.js";
import { lanSetup, assignedAddress, certificatePairInfo } from "./network.js";
import { RendererClient, disabledRenderer } from "./renderer.js";
import { StartupError, startupStatus, printStartupStatus } from "./startup.js";
import { createWindowsIoProvider } from "./windows-io.js";
import { requestStop, serviceState, startControl } from "./control.js";
import {
  checkForUpdate,
  installedVersion,
  installDecision,
  preparedUpdate,
  type UpdateStatus,
} from "./updates.js";
import { get as httpsGet } from "node:https";
import { X509Certificate } from "node:crypto";

async function listenerStatus(root: string, origin?: string) {
  if (!origin) return "not-confirmed";
  try {
    const ca = new X509Certificate(
      await readFile(join(root, "server.cer")),
    ).toString();
    return await new Promise<"alive" | "not-confirmed">((done) => {
      const url = new URL("/health/live", origin);
      const request = httpsGet(
        url,
        {
          ca,
          rejectUnauthorized: true,
          timeout: 1500,
          ...(url.hostname === "localhost" ? { family: 4 } : {}),
        },
        (response) => {
          let body = "";
          response.on("data", (chunk) => {
            body += chunk;
            if (body.length > 4096) request.destroy();
          });
          response.on("end", () => {
            try {
              const result = JSON.parse(body);
              done(
                response.statusCode === 200 &&
                  result.status === "alive" &&
                  result.mode === "offline-preparation"
                  ? "alive"
                  : "not-confirmed",
              );
            } catch {
              done("not-confirmed");
            }
          });
          response.on("error", () => done("not-confirmed"));
        },
      );
      request.on("timeout", () => request.destroy());
      request.on("error", () => done("not-confirmed"));
      const deadline = setTimeout(() => {
        done("not-confirmed");
        request.destroy();
      }, 2000);
      request.on("close", () => clearTimeout(deadline));
    });
  } catch {
    return "not-confirmed";
  }
}
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
  if (mode === "stop") {
    // Issue #32: nur den eigenen Server über den lokalen Steuerkanal beenden.
    const stopped = await requestStop(root);
    console.log(stopped.message);
    process.exitCode = stopped.result === "failed" ? 2 : 0;
    return;
  }
  if (
    mode === "status-json" ||
    mode === "status" ||
    mode === "run" ||
    mode === "run-renderer"
  ) {
    const status = await startupStatus(root, packageRoot);
    if (mode === "status-json") {
      console.log(
        JSON.stringify({
          ...status,
          listener: await listenerStatus(root, status.origin),
          service: await serviceState(root),
        }),
      );
      return;
    }
    if (mode === "status" || !status.ready) {
      printStartupStatus(status);
      if (mode === "status") {
        const service = await serviceState(root);
        console.log(
          service.state === "running"
            ? "Dienst: läuft seit " +
                new Date(service.startedAt).toLocaleString("de-DE") +
                ". Beenden über 'Server stoppen'."
            : service.state === "stale"
              ? "Dienst: gestoppt (veralteter Laufzustand eines früheren Starts)."
              : service.state === "unreadable"
                ? "Dienst: Laufzustand nicht lesbar; Datenordner und Rechte prüfen."
                : "Dienst: gestoppt.",
        );
      }
      if (mode !== "status") {
        console.log(
          "Dienst nicht gestartet: oben genannte Voraussetzungen zuerst vervollständigen.",
        );
        process.exitCode = 1;
      }
      return;
    }
  }
  if (mode === "init" || mode === "init-lan") {
    const network =
      mode === "init-lan"
        ? lanSetup.parse(
            await boundedJson(await inputPath(process.argv[3]), 4096),
          )
        : undefined;
    const { vault, recovery } = await initVault(root, secrets, network);
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
    console.log(
      "Serveradresse: " +
        vault.origin +
        " · Zertifikatvertrauen und Firewall separat einrichten.",
    );
    return;
  }
  const v = await loadVault(root);
  const updateDir = join(process.env.LOCALAPPDATA, "ShowNight", "updates");
  const checkUpdates = async (download = true): Promise<UpdateStatus> => {
    if (!v.trust)
      return {
        state: "not-configured",
        message:
          "Serverschlüssel fehlt; Updateprüfung erst nach '2 - Serverschlüssel importieren'.",
      };
    await secureDirectory(updateDir);
    return checkForUpdate({
      origin: v.trust.serverOrigin,
      publicKey: v.trust.publicKey,
      current: await installedVersion(),
      dir: updateDir,
      download,
    });
  };
  if (mode === "update-check") {
    // Issue #33: prüfen und geprüft herunterladen, niemals installieren.
    console.log(JSON.stringify(await checkUpdates()));
    return;
  }
  if (mode === "update-prepare") {
    // Review PR #52: Installation nur nach erfolgreicher Online-Bestätigung genau
    // dieser Version; ohne Verbindung oder bei zurückgezogener Version nicht.
    // Prüft nur, lädt nichts herunter.
    const online = await checkUpdates(false);
    const prepared = v.trust
      ? await preparedUpdate(
          updateDir,
          await installedVersion(),
          v.trust.publicKey,
        )
      : null;
    const decision = installDecision(online, prepared);
    console.log(JSON.stringify(decision));
    if (!decision.ok) process.exitCode = 1;
    return;
  }
  if (mode === "import-package") {
    const archive = await inputPath(process.argv[3]);
    await secureDirectory(packageRoot);
    const packages = new PackageStore(packageRoot);
    try {
      const result = await packages.importArchive(archive);
      console.log(
        "Inhaltspaket geprüft und importiert: " +
          result.id +
          " · keine Liveaktivierung.",
      );
    } finally {
      packages.close();
    }
    return;
  }
  if (mode === "network-check") {
    console.log(
      JSON.stringify(
        {
          mode: v.network ? "lan-preparation" : "loopback-preparation",
          origin: v.origin,
          bindAddress: v.network?.address ?? "127.0.0.1",
          addressAssigned: assignedAddress(v.network?.address ?? "127.0.0.1"),
          certificate: await certificatePairInfo(
            await readFile(join(root, "server.cer")),
            await readFile(join(root, "server.pfx")),
            v.pfxPassword,
            v.origin,
          ),
          firewall: "manuell prüfen",
          clientTrust: "auf jedem Client manuell prüfen",
          liveEnabled: false,
          mailEnabled: false,
        },
        null,
        2,
      ),
    );
    return;
  }
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
  let renderer = disabledRenderer;
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
    } else if (mode === "run" || mode === "run-renderer") {
      const bindAddress = v.network?.address ?? "127.0.0.1";
      if (!assignedAddress(bindAddress))
        throw new Error(
          "Eingerichtete Netzwerkadresse ist diesem Rechner nicht zugewiesen.",
        );
      const serverPfx = await readFile(join(root, "server.pfx"));
      await certificatePairInfo(
        await readFile(join(root, "server.cer")),
        serverPfx,
        v.pfxPassword,
        v.origin,
      );
      if (!a.meta("snapshot_id"))
        throw new StartupError(
          "Anmeldestand fehlt. '3 - Anmeldestand importieren' öffnen.",
        );
      // Refuse corrupt prepared files before opening any listener.
      try {
        for (const p of a.packageBindings())
          if (
            (await packages.verify(p.id)).status !== "valid" ||
            packages.metadata(p.id).manifest.eventId !== p.eventId ||
            packageHeader(packages.metadata(p.id).manifest).hash !==
              p.manifestSha
          )
            throw new Error();
      } catch {
        throw new StartupError(
          "Inhaltspaket fehlt, ist verändert oder unvollständig. Das zum Anmeldestand passende Original über 'Inhaltspaket importieren' laden; bestehenden Stand erhalten.",
        );
      }
      const bundledWeb = join(dirname(fileURLToPath(import.meta.url)), "web");
      const webRoot = existsSync(bundledWeb)
        ? bundledWeb
        : resolve("dist/server/web");
      if (mode === "run-renderer") {
        const bundledNative = join(
          dirname(fileURLToPath(import.meta.url)),
          "renderer",
        );
        const client = new RendererClient(
          existsSync(bundledNative)
            ? bundledNative
            : resolve("dist/renderer-windows"),
          join(process.env.LOCALAPPDATA, "ShowNight", "renderer-diagnostics"),
        );
        await client.start();
        renderer = client;
      }
      const server = await localServer(
        a,
        packages,
        v.origin,
        webRoot,
        {
          pfx: serverPfx,
          passphrase: v.pfxPassword,
          minVersion: "TLSv1.2",
        },
        true,
        renderer,
        createWindowsIoProvider(),
      );
      server.addHook("onClose", async () => {
        await renderer.close();
        a.close();
        packages.close();
      });
      await server.listen({ host: bindAddress, port: 3443 });
      retained = true;
      let stopping = false;
      let control: Awaited<ReturnType<typeof startControl>> | undefined;
      const stop = () => {
        if (stopping) return;
        stopping = true;
        console.log("Server wird geordnet beendet …");
        // Review PR #51: Frist vor dem Warten auf server.close() setzen. Hängende
        // Verbindungen (z. B. LAN-Clients ohne Abschluss) dürfen das Ende nicht verhindern.
        setTimeout(() => {
          server.server.closeAllConnections();
          setTimeout(() => process.exit(), 2000).unref();
        }, 8000).unref();
        void Promise.resolve(control?.close())
          .then(() => server.close())
          .then(() => console.log("Server beendet."))
          .catch(() => {
            process.exitCode = 1;
          })
          .finally(() => {
            // Alle eigenen Ressourcen sind geschlossen. Verbliebene fremde Handles
            // dürfen das Ende nicht verhindern.
            setTimeout(() => process.exit(), 5000).unref();
          });
      };
      try {
        // Lokaler, tokengeschützter Steuerkanal für 'Server stoppen' und den Installer.
        control = await startControl({
          root,
          origin: v.origin,
          mode,
          onStop: stop,
        });
      } catch (error) {
        // Ohne Steuerkanal nicht weiterlaufen: sonst wäre kein regulärer Stopp möglich.
        await server.close();
        throw error;
      }
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      // Issue #33: regelmäßig prüfen und herunterladen, niemals selbst installieren.
      const updateTimer = setInterval(
        () => {
          void checkUpdates()
            .then((status) => {
              if (status.state === "ready")
                console.log(
                  "Softwareupdate " +
                    status.version +
                    " bereit. Installation über die Serveroberfläche nach Bestätigung.",
                );
            })
            .catch(() => {});
        },
        6 * 60 * 60 * 1000,
      );
      // unref: der Zeitgeber hält einen gestoppten Server nicht am Leben.
      updateTimer.unref();
      console.log(
        "ShowNight Offlinevorbereitung · " +
          v.origin +
          " · keine Live-/Geräteausgabe · Mail aus",
      );
    } else throw new Error("Unbekannter Modus.");
  } finally {
    if (!retained) {
      await renderer.close();
      a.close();
      packages.close();
    }
  }
}
main().catch((error: unknown) => {
  if (error instanceof StartupError || error instanceof OfflineLoginConflict)
    console.error(error.message);
  else if ((error as NodeJS.ErrnoException)?.code === "EADDRINUSE")
    console.error(
      "Dienst nicht gestartet: Port 3443 bereits belegt. Vorhandenes Serverfenster prüfen; keinen fremden Prozess beenden.",
    );
  else if ((error as NodeJS.ErrnoException)?.code === "EACCES")
    console.error(
      "Dienst oder Dateizugriff verweigert. Windows-Benutzer, Dateirechte und Anleitung.md prüfen.",
    );
  else
    console.error(
      "Lokaler Server fehlgeschlagen. Anleitung, vorbereitete Dateien, Rechte und Zertifikat prüfen. Keine Geheimnisse im Chat senden.",
    );
  process.exitCode = 1;
});
