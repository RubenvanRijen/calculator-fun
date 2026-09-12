import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

/**
 * E2E runs against the real built output served statically -- the same files
 * the Docker image ships -- rather than the Vite dev server, so what is tested
 * is what is deployed.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: process.env["CI"] ? 1 : undefined,
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // Build, then serve the static output exactly as nginx would.
    command: `npm run build && npx serve --no-clipboard --single=false --listen ${PORT} dist`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
