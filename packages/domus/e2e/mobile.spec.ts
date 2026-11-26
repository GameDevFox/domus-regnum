import { test, expect, devices } from "@playwright/test";

// The touch (mobile) control scheme for the Builder: a centre reticle is the cursor and an on-screen
// action bar acts at it, replacing the desktop hover + click + right-drag model. Emulated on Pixel 5
// so `(pointer: coarse)` is true (which is what flips domus onto the touch scheme).
test.use({ ...devices["Pixel 5"] });

test("builder (touch) — reticle + action bar stamps a block at the reticle", async ({ page }) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean((window as unknown as { domus?: unknown }).domus), null, {
    timeout: 30_000,
  });
  await expect(page.locator(".path-debug-canvas canvas")).toBeVisible();

  // The on-screen action bar only renders on coarse-pointer devices — its presence proves touch mode.
  await expect(page.getByRole("button", { name: "Eyedrop" })).toBeVisible();

  page.on("dialog", (d) => d.accept()); // New now asks "are you sure?"
  await page.getByRole("button", { name: "Files" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "New" }).click();
  await expect(page.getByText(/·\s*0\s*blocks/)).toBeVisible();

  // Pick a block from the palette (the corner toggle opens it). `floor` is first in the list, so it's
  // always in view (no scroll). The primary action then reads "Place".
  await page.getByRole("button", { name: "Toggle block palette" }).tap();
  const floor = page.getByRole("button", { name: "floor", exact: true });
  await expect(floor).toBeVisible();
  await floor.tap();
  await page.getByRole("button", { name: "Toggle block palette" }).tap(); // close the palette
  const place = page.getByRole("button", { name: "Place", exact: true });
  await expect(place).toBeVisible();

  // Tapping Place stamps the floor at the centre reticle → the block count goes 0 → 1.
  await place.tap();
  await expect(page.getByText(/·\s*1\s*blocks/)).toBeVisible();
});
