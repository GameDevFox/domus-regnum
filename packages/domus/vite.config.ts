import path from "path";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// `vitest/config`'s defineConfig is vite's plus the `test` field — reuses the resolve.alias
// below, so tests get the same @kitsune source resolution as the app with no extra mapping.
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3003,
    host: true,
    allowedHosts: true,
    // Docs/notes aren't app source — editing them shouldn't trigger a browser reload. Only
    // files under src/ (and other real assets) should drive HMR.
    watch: {
      ignored: ["**/TODO.md", "**/NIGHT-LOG.md", "**/docs/**", "**/*.log"],
    },
  },
  // Headless unit tests (the agent sim) run in node — no jsdom/canvas needed. Scope to src so the
  // Playwright e2e specs under e2e/ (which import @playwright/test) aren't swept into the vitest run.
  test: { environment: "node", include: ["src/**/*.{test,spec}.ts"] },
  resolve: {
    // One `three` instance shared with the common-web reactive lib (animate's instanceof).
    dedupe: ["three"],
    alias: [
      // shadcn/ui convention: `@/x` -> `src/x`.
      {
        find: /^@\/(.+)$/,
        replacement: path.resolve(__dirname, "src/$1"),
      },
      {
        // Public subpath entry: maps to the package's source (no build step), like the published
        // "@kitsune/vn/three" export. Must precede the generic /vn/(.+) rule below.
        find: "@kitsune/vn/three",
        replacement: path.resolve(__dirname, "../vn/src/three/index.ts"),
      },
      {
        find: /^@kitsune\/vn\/(.+)$/,
        replacement: path.resolve(__dirname, "../vn/$1"),
      },
      {
        find: "@kitsune/vn",
        replacement: path.resolve(__dirname, "../vn/src/index.ts"),
      },
      {
        find: /^@kitsune\/common-web\/(.+)$/,
        replacement: path.resolve(__dirname, "../common-web/$1"),
      },
      {
        find: /^@kitsune\/common\/(.+)$/,
        replacement: path.resolve(__dirname, "../common/$1"),
      },
      {
        find: "@kitsune/common-web",
        replacement: path.resolve(__dirname, "../common-web/src/index.ts"),
      },
      {
        find: "@kitsune/common",
        replacement: path.resolve(__dirname, "../common/src/index.ts"),
      },
    ],
  },
});
