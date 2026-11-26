import { defineConfig, devices } from "@playwright/test";

// Playwright config for the domus visual harness. Lives in e2e/ (outside tsconfig's `include`) so it
// never touches the app's typecheck/build. Run with:
//   yarn add -D @playwright/test && yarn playwright install chromium   # one-time
//   yarn playwright test -c e2e/playwright.config.ts
//
// `webServer` boots the Vite dev server (which exposes window.domus) and waits for it before the
// spec runs. Headless Chromium renders WebGL via SwiftShader — no GPU required.
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  outputDir: "./.playwright-output",
  fullyParallel: false,
  // One worker: the heavy `window.domus.advance(3)` capture renders ~180 frames synchronously and
  // starves (flakes) when several specs contend on the shared dev server / CPU. Reliability over speed.
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3003",
    headless: true,
    // SwiftShader software WebGL — deterministic and GPU-free.
    launchOptions: { args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "yarn vite --port 3003",
    url: "http://localhost:3003",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
