import { defineConfig } from "vitest/config";

// Dedicated test config so unit tests resolve against the package root and src/ — vite.config.ts
// sets root to demo/ for the demo server, which would otherwise hijack test discovery.
export default defineConfig({
  test: {
    root: __dirname,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
