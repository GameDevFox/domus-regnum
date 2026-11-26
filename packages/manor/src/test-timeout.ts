import { vi } from "vitest";

// For a test file that plays the house out for hours or days at a time (soak.test.ts, hands.test.ts, …).
// Such a test takes one to four seconds on a quiet machine and has taken over twelve on one busy with other
// work, where vitest's five-second default failed it though nothing was wrong. A hang still fails: the bound
// is generous, not gone.

/** The longest one test that plays out whole days may take, in milliseconds: some four times the slowest seen on a busy machine (12.7 s, soak seed 1, load 35, 2026-11-17). */
export const WHOLE_DAYS_MS = 60_000;

/** Give every test in this file the bound of one that plays out whole days. Called once, at the top of the file. */
export const playsWholeDays = (): void => vi.setConfig({ testTimeout: WHOLE_DAYS_MS });
