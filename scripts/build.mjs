import { build } from "esbuild";
import { build as viteBuild } from "vite";
import { mkdir, copyFile } from "node:fs/promises";
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
await copyFile("apps/api/migrations/001_core.sql", "dist/api/001_core.sql");
await viteBuild({ configFile: "apps/web/vite.config.ts" });
