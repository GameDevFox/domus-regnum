import { test, expect } from "@playwright/test";

// The Game Demo's sim control: a tri-state (off → trash-haul → Tidy House → off) that only appears
// while the Builder Room is shown, and stops/hides when the room is hidden.
test("game tab — sim tri-state, shown only with the Builder Room", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { domus?: unknown }).domus), null, {
    timeout: 30_000,
  });

  const cycle = page.getByRole("button", { name: "Cycle simulation (off / trash / tidy)" });
  await expect(cycle).toBeHidden(); // room hidden by default → no sim control

  await page.keyboard.press("b"); // show the Builder Room
  await expect(cycle).toBeVisible();
  await expect(cycle).toHaveAttribute("title", /Sim: off/);

  // Tapping cycles off → trash → tidy → off.
  await cycle.click();
  await expect(cycle).toHaveAttribute("title", /Trash-haul/);
  await cycle.click();
  await expect(cycle).toHaveAttribute("title", /Tidy House/);
  await cycle.click();
  await expect(cycle).toHaveAttribute("title", /Sim: off/);

  // Hiding the room stops any running sim and hides the control; showing it again starts at off.
  await cycle.click(); // run trash
  await expect(cycle).toHaveAttribute("title", /Trash-haul/);
  await page.keyboard.press("b"); // hide the room
  await expect(cycle).toBeHidden();
  await page.keyboard.press("b"); // show again
  await expect(cycle).toHaveAttribute("title", /Sim: off/); // sim was stopped, not resumed
});
