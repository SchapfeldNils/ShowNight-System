import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { userInfo } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { loadVault } from "./vault.js";
import { assignedAddress, certificatePairInfo } from "./network.js";

export class StartupError extends Error {}
export const onlinePreparation =
  "Onlinevorbereitung: Inhaltspaket (.snpkg), Serverschlüssel und zielgebundenen Anmeldestand exportieren. Der Online-Server benötigt den Offline-Exportweg ab Schema 3; Schema 2 reicht nicht. Aktualisierung separat mit Backup/Restore und Betreiberfreigabe durchführen. Vorbereitete lokale Anmeldung benötigt danach kein Internet.";

export type StartupStatus = {
  ready: boolean;
  lines: string[];
  dataRoot: string;
  packageRoot: string;
  origin?: string;
};

// Only ENOENT confirms absence. Access failures and invalid path components must
// never advise initializing a second profile over an inaccessible existing one.
async function pathState(
  path: string,
  kind: "file" | "directory" = "file",
): Promise<"present" | "missing" | "unreadable"> {
  try {
    const value = await stat(path);
    return (kind === "directory" ? value.isDirectory() : value.isFile())
      ? "present"
      : "unreadable";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? "missing"
      : "unreadable";
  }
}

// Read only: no initialization, schema migration, account disclosure or remote request.
export async function startupStatus(
  root: string,
  packageRoot: string,
): Promise<StartupStatus> {
  const paths = { dataRoot: root, packageRoot };
  const lines: string[] = [];
  const rootState = await pathState(root, "directory");
  const profile =
    rootState === "unreadable"
      ? "unreadable"
      : await pathState(join(root, "server.dpapi"));
  if (profile !== "present") {
    const partial = await Promise.all(
      [
        "server.pfx",
        "server.cer",
        "server.sntarget",
        "accounts.sqlite",
        "init.lock",
      ].map((name) => pathState(join(root, name))),
    );
    return {
      ...paths,
      ready: false,
      lines: [
        profile === "unreadable" || partial.includes("unreadable")
          ? "Profil: nicht zugänglich. Angezeigten Datenpfad, Windows-Benutzer und Zugriffsrechte prüfen; vorhandene Einrichtung erhalten und nicht erneut einrichten."
          : partial.includes("present")
            ? "Profil: teilweise vorhanden. Vorhandene Dateien und Schlüssel erhalten; Anleitung.md prüfen, nicht erneut einrichten."
            : "Profil: fehlt am angezeigten Datenpfad. Bei bestehender Einrichtung zuerst Windows-Benutzer und Startkontext prüfen, nicht erneut einrichten. Nur bei tatsächlicher Ersteinrichtung '1 - Lokalen Server einrichten' öffnen, danach Inhaltspaket importieren.",
        onlinePreparation,
      ],
    };
  }
  let v;
  try {
    v = await loadVault(root);
  } catch {
    return {
      ...paths,
      ready: false,
      lines: [
        "Profil: nicht lesbar. Mit dem Windows-Benutzer der Einrichtung starten; Rechte und Anleitung.md prüfen. Vorhandene Schlüssel erhalten.",
      ],
    };
  }
  lines.push("Profil: vorhanden. Serveradresse: " + v.origin);
  let ready = true;
  if (!v.trust) {
    ready = false;
    lines.push(
      "Serverschlüssel: fehlt. '2 - Serverschlüssel importieren' öffnen und Fingerabdruck unabhängig vergleichen.",
    );
  } else lines.push("Serverschlüssel: ausdrücklich importiert.");
  const accountFile = join(root, "accounts.sqlite");
  const accountState = await pathState(accountFile);
  if (accountState === "missing") {
    ready = false;
    lines.push(
      "Anmeldestand: fehlt. Erst Inhaltspaket und Serverschlüssel, dann '3 - Anmeldestand importieren' öffnen.",
    );
  } else if (accountState === "unreadable") {
    ready = false;
    lines.push(
      "Anmeldestand: Kontenablage nicht zugänglich. Angezeigten Datenpfad und Zugriffsrechte prüfen; vorhandene Daten erhalten.",
    );
  } else {
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(accountFile, { readOnly: true });
      if (db.prepare("PRAGMA user_version").get()?.user_version !== 1)
        throw new Error();
      const snapshot = db
        .prepare("SELECT value FROM meta WHERE key='snapshot_id'")
        .get();
      if (!snapshot?.value) {
        ready = false;
        lines.push(
          "Anmeldestand: fehlt. Erst Inhaltspaket und Serverschlüssel, dann '3 - Anmeldestand importieren' öffnen.",
        );
      } else
        lines.push(
          "Anmeldestand: importiert. Kennwort, MFA und Rechte werden weiterhin bei Anmeldung geprüft.",
        );
    } catch {
      ready = false;
      lines.push(
        "Anmeldestand: Kontenablage nicht lesbar oder Schema nicht unterstützt. Vorhandene Daten erhalten und Anleitung.md prüfen.",
      );
    } finally {
      db?.close();
    }
  }
  let db: DatabaseSync | undefined;
  try {
    if ((await pathState(packageRoot, "directory")) === "unreadable")
      throw new Error();
    const packageState = await pathState(join(packageRoot, "packages.sqlite"));
    if (packageState === "unreadable") throw new Error();
    if (packageState === "present") {
      db = new DatabaseSync(join(packageRoot, "packages.sqlite"), {
        readOnly: true,
      });
      if (db.prepare("PRAGMA user_version").get()?.user_version !== 1)
        throw new Error();
      const count = Number(
        db.prepare("SELECT count(*) AS n FROM packages").get()?.n,
      );
      lines.push(
        count
          ? "Inhaltspakete: vorhanden. Gebundene Dateien werden vor Dienststart vollständig geprüft."
          : "Inhaltspaket: fehlt. 'Inhaltspaket importieren' öffnen. Ein leerer Vorbereitungsstand enthält keine Veranstaltung.",
      );
    } else
      lines.push("Inhaltspaket: fehlt. 'Inhaltspaket importieren' öffnen.");
  } catch {
    ready = false;
    lines.push(
      "Inhaltspakete: Ablage nicht lesbar oder Schema nicht unterstützt. Daten erhalten und Anleitung.md prüfen.",
    );
  } finally {
    db?.close();
  }
  if (!assignedAddress(v.network?.address ?? "127.0.0.1")) {
    ready = false;
    lines.push(
      "Netzwerkadresse: diesem Rechner nicht zugewiesen. 'Netzwerk prüfen' öffnen; Profil nicht neu initialisieren.",
    );
  }
  try {
    await certificatePairInfo(
      await readFile(join(root, "server.cer")),
      await readFile(join(root, "server.pfx")),
      v.pfxPassword,
      v.origin,
    );
    lines.push(
      "HTTPS-Zertifikat: Adress-/Gültigkeitsprüfung bestanden; CER und PFX samt privatem Schlüssel stimmen überein. Vertrauen auf jedem Client anhand Anleitung.md separat prüfen.",
    );
  } catch {
    ready = false;
    lines.push(
      "HTTPS-Zertifikat: fehlt, ungültig, passt nicht zur Adresse oder CER/PFX/Schlüssel widersprüchlich. 'Netzwerk prüfen' und Anleitung.md öffnen; vorhandene Schlüssel erhalten.",
    );
  }
  if (!ready) lines.push(onlinePreparation);
  return { ...paths, origin: v.origin, ready, lines };
}

export function printStartupStatus(
  result: Awaited<ReturnType<typeof startupStatus>>,
) {
  console.log(
    "ShowNight · lokale Einrichtung · keine Live-/Geräteausgabe · Mail aus",
  );
  let username: string;
  try {
    username = userInfo().username;
  } catch {
    username = "nicht ermittelbar";
  }
  console.log("Windows-Benutzerkontext: " + username);
  console.log("Datenpfad dieses Starts: " + result.dataRoot);
  console.log("Paketpfad dieses Starts: " + result.packageRoot);
  console.log(
    "LOCALAPPDATA dieses Starts: " +
      (process.env.LOCALAPPDATA ?? "nicht gesetzt"),
  );
  result.lines.forEach((line) => console.log(line));
  console.log(
    "Dienst: Diese Statusprüfung startet keinen Server und prüft keinen laufenden Listener. Nach vollständiger Vorbereitung 'ShowNight Streaming starten' öffnen; das Serverfenster geöffnet lassen.",
  );
}
