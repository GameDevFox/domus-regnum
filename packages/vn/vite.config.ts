import path from "path";

import { defineConfig } from "vite";

// Serves the demo/ page (demo/index.html) for manual play and the screenshot harness. The demo
// imports the library straight from ../src, so no build step is needed — Vite handles the TS.
export default defineConfig({
  root: path.resolve(__dirname, "demo"),
  server: {
    port: 3010,
    host: true,
    // Accessed via a local domain name (not just an IP), so don't reject unknown Host headers.
    allowedHosts: true,
    // The demo lives in demo/ but imports from ../src — allow Vite to serve the package root.
    fs: { allow: [path.resolve(__dirname)] },
  },
});
