import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  root: resolve("apps/local-web"),
  build: { outDir: resolve("dist/server/web"), emptyOutDir: true },
});
