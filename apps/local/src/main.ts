import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { join, resolve } from "node:path";
import { secureDirectory } from "../../agent/src/identity.js";
import { PackageStore } from "./store.js";

async function main() {
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA)
    throw new Error("Windows benötigt.");
  const root = join(process.env.LOCALAPPDATA, "ShowNight", "local-packages");
  await secureDirectory(root);
  const store = new PackageStore(root);
  console.log(
    "ShowNight Paketablage 0.3.0 · lokal ohne Internet · keine Liveaktivierung/Ausgabe",
  );
  try {
    const mode = process.argv[2] ?? "list";
    if (mode === "import") {
      let path = process.argv[3];
      if (!path) {
        const ui = createInterface({ input: stdin, output: stdout });
        try {
          path = await ui.question("Heruntergeladene .snpkg-Datei (Pfad): ");
        } finally {
          ui.close();
        }
      }
      const result = await store.importArchive(
        resolve(path.trim().replace(/^"(.*)"$/, "$1")),
      );
      console.log(
        result.status === "imported"
          ? "Paket vollständig importiert; nicht live aktiviert."
          : "Identisches geprüftes Paket bereits vorhanden.",
      );
    } else if (mode === "list") {
      const packages = store.list();
      console.table(
        packages.map((p) => ({
          Paket: p.id,
          Veranstaltung: p.name,
          Revision: p.eventRevision,
          Shows: p.shows,
          Medien: p.media,
        })),
      );
      if (!packages.length) console.log("Noch keine Pakete importiert.");
    } else if (mode === "check-all") {
      for (const p of store.list()) {
        const r = await store.verify(p.id);
        console.log(
          `${p.name}: ${r.status === "valid" ? "vollständig geprüft" : "nicht vollständig"}`,
        );
        for (const error of r.errors) console.log(error);
        if (r.status !== "valid") process.exitCode = 1;
      }
    } else throw new Error("Unbekannter Modus.");
  } finally {
    store.close();
  }
}
main().catch(() => {
  console.error(
    "Paketablage fehlgeschlagen. Dateiformat, Vollständigkeit, Prüfsummen und lokalen Speicher prüfen. Vorhandene Pakete bleiben erhalten.",
  );
  process.exitCode = 1;
});
