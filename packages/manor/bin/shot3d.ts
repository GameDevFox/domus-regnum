// Screenshots of the 3D demo page, for looking at it without a screen.
//   npx tsx bin/shot3d.ts <name> ["view=ground&az=0.7&polar=0.9&dist=34&t=20&follow=evelyn"]
// The query sets the view, the camera (azimuth and tilt in radians, distance in metres, and
// `tx`/`tz` for the point it looks at), how many seconds of the household's day to run first,
// who to follow, and `hour` for the time of the first day to open at (19 is dusk). Needs the dev server.
// A third argument is script for the page to run first, with `h` as its handle (window.manor3d):
//   npx tsx bin/shot3d.ts bakers "view=ground" "h.game.posts.sage = 'bake'; h.advance(60)"
import { mkdirSync } from "node:fs";

import { chromium } from "@playwright/test";

const BASE = process.env.MANOR_URL ?? "http://127.0.0.1:3011/";
const VIEWPORT = { width: Number(process.env.W ?? 1440), height: Number(process.env.H ?? 860) };
/** Time for the sprite pictures to arrive and be drawn. */
const SETTLE_MS = 900;
const READY_TIMEOUT_MS = 15000;

const [, , name = "demo3d", query = "", first = ""] = process.argv;

const main = async (): Promise<void> => {
  mkdirSync("shots", { recursive: true });
  // Software rendering: there is no graphics card behind a headless browser on this machine.
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: VIEWPORT });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  // A fresh browser is a first visit, which is greeted with the list of keys: not what a picture is usually of.
  await page.goto(`${BASE}demo3d.html?${/(^|&)help(=|&|$)/.test(query) ? query : `${query}&help=0`}`);
  await page.waitForLoadState("networkidle");
  try {
    await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d), undefined, { timeout: READY_TIMEOUT_MS });
    await page.waitForTimeout(SETTLE_MS);
    if (first) {
      // It may wait: `await wait(300)` lets the page take a breath, for a button to come alive after coin is given.
      await page.evaluate(`(async () => { const h = window.manor3d; const wait = (ms) => new Promise((done) => setTimeout(done, ms)); ${first} })()`);
      await page.waitForTimeout(SETTLE_MS);
    }
    await page.evaluate(() => (window as unknown as { manor3d: { settle: () => void } }).manor3d.settle());
    await page.screenshot({ path: `shots/${name}.png` });
    console.log(JSON.stringify(await page.evaluate(() => (window as unknown as { manor3d: { cost: () => unknown } }).manor3d.cost())));
  } finally {
    // Whatever went wrong on the page is the answer when the handle never appears.
    if (errors.length) console.log(`PAGE ERRORS:\n${errors.join("\n")}`);
    await browser.close();
  }
};

main().catch((err: unknown) => {
  console.error(String(err));
  process.exit(1);
});
