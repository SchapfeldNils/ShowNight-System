import { build } from "esbuild";
import { build as viteBuild } from "vite";
import { mkdir, copyFile, readdir, unlink } from "node:fs/promises";
await mkdir("dist/api", { recursive: true });
await build({
  entryPoints: [
    "apps/api/src/main.ts",
    "apps/api/src/worker-main.ts",
    "apps/api/src/cli.ts",
  ],
  outdir: "dist/api",
  platform: "node",
  target: "node24",
  bundle: true,
  packages: "external",
  format: "esm",
});
// Remove only previously generated SQL files in this fixed build directory.
for (const file of await readdir("dist/api"))
  if (/^\d{3}_[a-z_]+\.sql$/.test(file)) await unlink("dist/api/" + file);
for (const file of await readdir("apps/api/migrations"))
  if (/^\d{3}_[a-z_]+\.sql$/.test(file))
    await copyFile("apps/api/migrations/" + file, "dist/api/" + file);
await viteBuild({ configFile: "apps/web/vite.config.ts" });
