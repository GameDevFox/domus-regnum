// The check of the 3D demo page's performance graph: shown and hidden by its key and its button,
// and remembered. Run by check3d.ts.
import type { Browser } from "@playwright/test";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

export const checkGraph = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  // One browser context, so that what it remembers lasts from one opening of the page to the next.
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const open = async (): Promise<void> => {
    await page.goto(`${base}demo3d.html?help=0`);
    await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  };
  const graphs = (): Promise<number> => page.locator(".perf-graph").count();
  // By its class, not its name: it is among the settings, and is not on show until their card is opened.
  const button = page.locator(".perf-button");

  await open();
  check("the performance graph is not on the page to begin with", (await graphs()) === 0 && (await button.getAttribute("aria-pressed")) === "false");
  await page.keyboard.press("p");
  check("the P key shows it, and its button is lit", (await graphs()) === 1 && (await button.getAttribute("aria-pressed")) === "true");
  // It draws as it counts: a graph with nothing counted would have no size.
  const box = await page.locator(".perf-graph").boundingBox();
  check("…in the corner at the foot of the screen, on the right", box !== null && box.x > viewport.width / 2 && box.y > viewport.height / 2);
  await open();
  check("…and it is still showing the next time the page is opened", (await graphs()) === 1);
  // Its button is among the settings.
  await page.getByRole("button", { name: "Settings" }).click();
  await button.click();
  check("pressing its button takes it off the page", (await graphs()) === 0);
  await open();
  check("…and it stays off the next time", (await graphs()) === 0);
  await context.close();
};
