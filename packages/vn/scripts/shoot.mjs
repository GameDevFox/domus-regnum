// Screenshot harness for the VN demo. Launches headless Chromium, drives the story through
// window.vn, and writes PNGs to repo-root tmp/vn/ (gitignored scratch — the dev machine is remote,
// so captures are browsed in-tree / via chat). Needs the demo server up on :3010 (yarn demo).
//
//   yarn workspace @kitsune/vn demo     # terminal 1 (vite on :3010)
//   yarn workspace @kitsune/vn shoot    # terminal 2

import { mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const URL = process.env.VN_DEMO_URL ?? "http://localhost:3010/";
const OUT = path.resolve(here, "../../../tmp/vn");

const run = async () => {
  mkdirSync(OUT, { recursive: true });

  // SwiftShader software WebGL so the canvas renders headless without a GPU (as domus's config does).
  const browser = await chromium.launch({
    args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.vn));

  const shot = (name) => page.screenshot({ path: path.join(OUT, name) });
  const advance = () => page.evaluate(() => window.vn.advance());
  const choose = (i) => page.evaluate((n) => window.vn.choose(n), i);
  const settle = () => page.waitForTimeout(250); // let the 200ms sprite transitions finish

  await settle();
  await shot("01-establishing.png"); // establishing line, no one on screen

  // Advancing triggers the show: capture mid-slide (~140ms in) then settled.
  await page.evaluate(() => window.vn.advance());
  await page.waitForTimeout(140);
  await shot("02-sliding-in.png"); // character sliding in from the wings
  await page.waitForTimeout(500);
  await shot("03-entered.png"); // settled into place, speaking ("Hey, thanks…")

  await advance();
  await settle();
  await shot("04-line.png"); // second line ("I've been meaning to ask…")

  await advance();
  await settle();
  await shot("05-menu.png"); // the branching choice menu

  await choose(1);
  await settle();
  await shot("06-branch.png"); // chosen branch, expression swaps

  await advance();
  await settle();
  await shot("07-asks.png"); // back to neutral, the club line

  // Advancing hides her — she curtseys and slides back out the way she came. Catch mid-exit, then gone.
  await page.evaluate(() => window.vn.advance());
  await page.waitForTimeout(380);
  await shot("08-exiting.png"); // sliding out toward the wings
  await page.waitForTimeout(500);
  await shot("09-left.png"); // gone, narration plays

  await advance();
  await settle();
  await shot("10-end.png"); // end of demo

  await browser.close();
  console.log(`Wrote screenshots to ${OUT}`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
