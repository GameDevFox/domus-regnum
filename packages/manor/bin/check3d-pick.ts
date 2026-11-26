// The check of the 3D demo page that a click finds only someone who can be seen: not a person
// under a floor that is drawn over her. Run by check3d.ts.
import type { Browser } from "@playwright/test";

import { pageTime } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** Time for the view to settle after the storey looked into is changed. */
const SETTLE_MS = 1200;
/** The view is still once someone's place on the screen has moved less than this (px) in this long, looked at up to this many times. */
const STILL_PX = 0.5;
const STILL_MS = 250;
const STILL_TRIES = 40;

type Spot = { x: number; y: number } | null;

export const checkPick = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  // Evelyn begins the day at the kitchen table, on the ground floor, with the maids' dormitory over her.
  const page = await browser.newPage({ viewport });
  await page.goto(`${base}demo3d.html?view=first&help=0`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  await page.evaluate(`window.manor3d.paused.set(true)`);
  await pageTime(page, SETTLE_MS);
  const following = (): Promise<string | null> => page.evaluate(`window.manor3d.following.peek()`) as Promise<string | null>;
  const spot = (): Promise<Spot> => page.evaluate(`window.manor3d.screenOf("evelyn")`) as Promise<Spot>;
  /**
   * Where she is on the screen, once that has stopped changing: the view eases to a storey's height when the storey looked
   * into is changed, and on a slow machine it is still on its way after any fixed wait. A click aimed at where she was a
   * moment ago then lands beside her (which is how this check failed in two full runs of three, 2026-11-16).
   */
  const where = async (): Promise<Spot> => {
    let last = await spot();
    for (let n = 0; n < STILL_TRIES; n++) {
      await pageTime(page, STILL_MS);
      const now = await spot();
      if (last && now && Math.hypot(now.x - last.x, now.y - last.y) < STILL_PX) return now;
      last = now;
    }
    return last;
  };

  const under = await where();
  if (under) await page.mouse.click(under.x, under.y);
  await pageTime(page, 200);
  check(`looking into the first floor, a click where Evelyn stands below it is a click on the floor: nobody is followed (${await following()})`, under !== null && (await following()) === null);

  await page.evaluate(`window.manor3d.view.set("ground")`);
  await pageTime(page, SETTLE_MS);
  const open = await where();
  if (open) await page.mouse.click(open.x, open.y);
  await pageTime(page, 200);
  // (What lies under the click is said too: when this fails, that is the first thing to know.)
  const lies = open ? ((await page.evaluate(`(() => { const e = document.elementFromPoint(${open.x}, ${open.y}); return e ? e.tagName + "." + e.className : "nothing"; })()`)) as string) : "nowhere";
  check(`looking into the ground floor, the same click follows her (${await following()}; at ${open ? `${Math.round(open.x)}, ${Math.round(open.y)}` : "nowhere"} lies ${lies})`, (await following()) === "evelyn");
  await page.close();
};
