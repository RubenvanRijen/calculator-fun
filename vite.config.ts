import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

/**
 * Vite builds the site and serves it in development. It is the only reason the
 * project can use `@/…` aliases and `.ts` import specifiers: `tsc` never
 * rewrites either, so a bundler has to resolve them.
 */
export default defineConfig({
  root: ".",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./ts", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    // 0.0.0.0 so the port is reachable from outside the container.
    host: "0.0.0.0",
    port: 5173,
    // Bind mounts do not always deliver inotify events; polling is reliable.
    watch: { usePolling: true, interval: 300 },
  },
});
