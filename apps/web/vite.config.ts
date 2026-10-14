import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  root: resolve("apps/web"),
  build: { outDir: resolve("dist/web"), emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3000", ws: true },
      "/health": "http://localhost:3000",
    },
  },
});
