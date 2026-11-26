import { defineConfig } from "vitest/config";

// Globals on: the suites were written under jest (describe/it/expect as globals) and run
// unchanged under vitest. jsdom isn't needed — everything here is headless Three/math.
export default defineConfig({
  test: { globals: true },
});
