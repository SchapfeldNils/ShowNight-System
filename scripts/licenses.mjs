import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const found = new Map();
const lock = await readFile("pnpm-lock.yaml", "utf8");
const locked = new Set(
  [...lock.matchAll(/^  '?([^' \r\n]+)'?:\s*$/gm)].map(
    (m) => m[1].split("(")[0],
  ),
);
async function readPackage(dir) {
  try {
    const p = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    if (p.name && p.version && locked.has(p.name + "@" + p.version)) {
      let license =
        p.license ?? p.licenses?.map((x) => x.type).join(" OR ") ?? "UNKNOWN";
      if (license === "UNKNOWN") {
        try {
          const body = await readFile(join(dir, "LICENSE"), "utf8");
          if (body.includes("Permission is hereby granted, free of charge"))
            license = "MIT (LICENSE file)";
        } catch {}
      }
      found.set(p.name + "@" + p.version, {
        name: p.name,
        version: p.version,
        license,
        repository:
          typeof p.repository === "string"
            ? p.repository
            : (p.repository?.url ?? null),
      });
    }
  } catch {}
}
for (const entry of await readdir("node_modules/.pnpm")) {
  const dir = join("node_modules/.pnpm", entry, "node_modules");
  try {
    for (const p of await readdir(dir)) {
      if (p.startsWith("@"))
        for (const child of await readdir(join(dir, p)))
          await readPackage(join(dir, p, child));
      else await readPackage(join(dir, p));
    }
  } catch {}
}
await writeFile(
  "docs/entwicklung/dependency-licenses.json",
  JSON.stringify(
    [...found.values()].sort((a, b) =>
      (a.name + a.version).localeCompare(b.name + b.version),
    ),
    null,
    2,
  ) + "\n",
);
console.log(
  "Installierte Paketlizenzen erfasst. Binärlizenzen separat in lizenzen.md.",
);
