import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadVault } from "./vault.js";
import { assignedAddress, certificateInfo } from "./network.js";

export class StartupError extends Error {}
export const onlinePreparation =
  "Onlinevorbereitung: Inhaltspaket (.snpkg), Serverschlüssel und zielgebundenen Anmeldestand exportieren. Der Online-Server benötigt den Offline-Exportweg ab Schema 3; Schema 2 reicht nicht. Aktualisierung separat mit Backup/Restore und Betreiberfreigabe durchführen. Vorbereitete lokale Anmeldung benötigt danach kein Internet.";

// Read only: no initialization, schema migration, account disclosure or remote request.
export async function startupStatus(root: string, packageRoot: string) {
  const lines: string[] = [];
  if (!existsSync(join(root, "server.dpapi"))) {
    const partial = [
      "server.pfx",
      "server.cer",
      "server.sntarget",
      "accounts.sqlite",
      "init.lock",
    ].some((name) => existsSync(join(root, name)));
    return {
      ready: false,
      lines: [
        partial
          ? "Profil: teilweise vorhanden. Vorhandene Dateien und Schlüssel erhalten; Anleitung.md prüfen, nicht erneut einrichten."
          : "Profil: fehlt. Im Startmenü '1 - Lokalen Server einrichten' öffnen, danach Inhaltspaket importieren.",
        onlinePreparation,
      ],
    };
  }
  let v;
  try {
    v = await loadVault(root);
  } catch {
    return {
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
  if (!existsSync(accountFile)) {
    ready = false;
    lines.push(
      "Anmeldestand: fehlt. Erst Inhaltspaket und Serverschlüssel, dann '3 - Anmeldestand importieren' öffnen.",
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
    if (existsSync(join(packageRoot, "packages.sqlite"))) {
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
    certificateInfo(await readFile(join(root, "server.cer")), v.origin);
    if (!existsSync(join(root, "server.pfx"))) throw new Error();
    lines.push(
      "HTTPS-Zertifikat: Adress-/Gültigkeitsprüfung bestanden. Vertrauen auf jedem Client anhand Anleitung.md separat prüfen.",
    );
  } catch {
    ready = false;
    lines.push(
      "HTTPS-Zertifikat: fehlt, ungültig oder passt nicht zur Adresse. 'Netzwerk prüfen' und Anleitung.md öffnen; vorhandene Schlüssel erhalten.",
    );
  }
  if (!ready) lines.push(onlinePreparation);
  return { ready, lines };
}

export function printStartupStatus(
  result: Awaited<ReturnType<typeof startupStatus>>,
) {
  console.log(
    "ShowNight · lokale Einrichtung · keine Live-/Geräteausgabe · Mail aus",
  );
  result.lines.forEach((line) => console.log(line));
  console.log(
    "Dienst: Diese Statusprüfung startet keinen Server und prüft keinen laufenden Listener. Nach vollständiger Vorbereitung 'ShowNight Streaming starten' öffnen; das Serverfenster geöffnet lassen.",
  );
}
