// Drive the running game in a headless browser and save screenshots, for looking at it.
//   npx tsx bin/shot.ts <name> [script.js]
// The optional script is evaluated in the page with `manor` (window.manor) in scope and may be
// async. Each run uses a fresh browser profile, so it never touches anyone's saved game.
import { mkdirSync, readFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const URL = process.env.MANOR_URL ?? "http://127.0.0.1:3011/";
const SETTLE_MS = 700;
const VIEW = { width: Number(process.env.W ?? 1440), height: Number(process.env.H ?? 860) };

const [, , name = "shot", scriptPath] = process.argv;
const script = scriptPath ? readFileSync(scriptPath, "utf8") : "";

const main = async (): Promise<void> => {
  mkdirSync("shots", { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEW });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(URL);
  // The dev server may push one reload at a page that connects just after an edit: let it settle.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(SETTLE_MS);
  await page.waitForFunction(() => Boolean((window as unknown as { manor?: unknown }).manor));
  if (script) {
    const result = await page.evaluate(`(async () => { const manor = window.manor; ${script} })()`);
    if (result !== undefined) console.log(JSON.stringify(result));
  }
  await page.waitForTimeout(350);
  await page.screenshot({ path: `shots/${name}.png` });
  if (errors.length) console.log(`PAGE ERRORS:\n${errors.join("\n")}`);
  await browser.close();
};

void main();
