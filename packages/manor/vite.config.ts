import { resolve } from "path";

import react from "@vitejs/plugin-react";
// `vitest/config`'s defineConfig is vite's plus the `test` field.
import { defineConfig } from "vitest/config";

const DEV_PORT = 3011;

// The live site serves this package under a sub-path (domus's publish.sh sets MANOR_BASE=/manor/).
const BASE = process.env.MANOR_BASE ?? "/";

export default defineConfig({
  base: BASE,
  plugins: [react()],
  resolve: {
    // The 3D demo is written against the repo's reactive scene lib (docs/three-hmr.md).
    alias: { "@scene-lib": resolve(__dirname, "../common-web/src") },
    // One `three` shared between the lib and this package's own code.
    dedupe: ["three"],
  },
  // Two pages: the 2D prototype (index.html) and the 3D game (demo3d.html).
  build: { rollupOptions: { input: { index: resolve(__dirname, "index.html"), demo3d: resolve(__dirname, "demo3d.html") } } },
  server: {
    port: DEV_PORT,
    strictPort: true,
    host: true,
    allowedHosts: true,
    // Notes and logs aren't app source — editing them shouldn't reload the browser.
    watch: { ignored: ["**/*.md", "**/notes/**", "**/*.log"] },
  },
  // The sim is headless and deterministic: tests run in node, no DOM needed.
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
