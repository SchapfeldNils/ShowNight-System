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
await copyFile("apps/api/migrations/002_agents.sql", "dist/api/002_agents.sql");
await build({
  entryPoints: ["apps/agent/src/main.ts"],
  outfile: "dist/agent/main.js",
  platform: "node",
  target: "node24",
  bundle: true,
  format: "esm",
  banner: {
    js: 'import {createRequire} from "node:module"; const require=createRequire(import.meta.url);',
  },
});
await viteBuild({ configFile: "apps/web/vite.config.ts" });
await mkdir("dist/local", { recursive: true });
await build({
  entryPoints: ["apps/local/src/main.ts"],
  outfile: "dist/local/main.js",
  platform: "node",
  target: "node24",
  bundle: true,
  format: "esm",
});
