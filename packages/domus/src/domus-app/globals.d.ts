import type { domusFlags } from "./flags";
import type { Harness } from "./harness";

// Devtools-exposed window globals (DEV builds only) — augmenting `Window` so the assignment sites
// read/write them directly instead of `window as unknown as {...}` casts. `Kitsune` is declared
// alongside the HMR wiring in index.ts.
declare global {
  interface Window {
    domus?: Harness; // the Playwright/test harness (pause/advance/step/snapshot)
    domusFlags?: typeof domusFlags; // localStorage-backed dev experiment flags
    __vnDebug?: { builds: number; instances: unknown[] }; // VN scene introspection
  }
}
