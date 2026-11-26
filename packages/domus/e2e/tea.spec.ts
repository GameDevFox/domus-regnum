import { test } from "@playwright/test";

// Capture harness for the Tea tab's cue-reading (emote) game. Capture-only, like the rest of the suite —
// PNGs land in e2e/__screenshots__/ for a human to eyeball. No window.domus needed: the Tea tab is plain
// React over the pure engines in src/tea/. (The conversation game was removed 2026-07-03 — recover from
// git history 161207a; local copy in the gitignored tmp/ai-quarantine/.)

const SHOTS = "e2e/__screenshots__";

test("tea — cue-reading: live emote stream", async ({ page }) => {
  await page.goto("/tea/emote"); // cue-reading is the default sub-tab
  await page.getByRole("button", { name: /^Begin/ }).click();
  await page.waitForTimeout(4200); // let the continuous stream run + an injected pattern appear
  await page.screenshot({ path: `${SHOTS}/tea-3-cue-stream.png` });
  // Respond — the buttons are always live during play; this exercises the scoring path.
  await page.getByRole("button", { name: /Refill/ }).click();
  await page.getByRole("button", { name: "Pause" }).waitFor();
});
