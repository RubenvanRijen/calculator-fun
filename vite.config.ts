import { defineConfig, type Plugin } from "vite";

/**
 * In dev, point the page at the TypeScript entry instead of the compiled
 * output, so Vite transpiles and hot-reloads it directly and no `tsc --watch`
 * has to run alongside. Production is unaffected: it is built with plain `tsc`
 * into dist/ and served by nginx, with no bundler involved.
 */
function serveTypeScriptFromSource(): Plugin {
  return {
    name: "serve-typescript-from-source",
    apply: "serve",
    // `order: "pre"` runs this before Vite's own HTML plugin registers the
    // script in the module graph, so it never tries to load the unbuilt
    // /dist/index.js and warn about it.
    transformIndexHtml: {
      order: "pre",
      handler: (html) => html.replace("/dist/index.js", "/ts/index.ts"),
    },
  };
}

export default defineConfig({
  root: ".",
  plugins: [serveTypeScriptFromSource()],
  server: {
    // 0.0.0.0 so the port is reachable from outside the container.
    host: "0.0.0.0",
    port: 5173,
    // Bind mounts do not always deliver inotify events; polling is reliable.
    watch: { usePolling: true, interval: 300 },
  },
});
