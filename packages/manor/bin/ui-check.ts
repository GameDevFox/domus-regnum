// Drive the real page with a real mouse and keyboard and check the controls do what they say.
//   npx tsx bin/ui-check.ts
// Uses its own browser profile, so it never touches anyone's saved game. Exits non-zero on failure.
import { mkdirSync } from "node:fs";

import { chromium } from "@playwright/test";
import type { Page } from "@playwright/test";

const URL = process.env.MANOR_URL ?? "http://127.0.0.1:3011/";
const SETTLE_MS = 700;

type Probe = { phase: string; rooms: Record<string, string | null>; paused: boolean; selection: unknown; coin: number; recipe: string | null; orders: Record<string, string>; maids: number };

const probe = (page: Page): Promise<Probe> =>
  page.evaluate(() => {
    const m = (window as unknown as { manor: { ui: { game: { phase: string; coin: number; maids: { id: string; room: string | null }[]; rooms: { id: string; recipe: string | null; rota: string[] }[]; orders: Record<string, string> }; paused: boolean; selection: unknown } } }).manor;
    const g = m.ui.game;
    return {
      phase: g.phase,
      rooms: Object.fromEntries(g.maids.map((x) => [x.id, x.room])),
      paused: m.ui.paused,
      selection: m.ui.selection,
      coin: g.coin,
      recipe: (g.rooms.find((r) => r.id === "r11")?.rota ?? []).join("+"),
      orders: g.orders,
      maids: g.maids.length,
    };
  });

const centre = async (page: Page, selector: string): Promise<{ x: number; y: number }> => {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`not on screen: ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const results: string[] = [];
let failed = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed += 1;
};

const main = async (): Promise<void> => {
  mkdirSync("shots", { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL);
  // The dev server may push one reload at a page that connects just after an edit: let it settle.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(SETTLE_MS);
  await page.waitForFunction(() => Boolean((window as unknown as { manor?: unknown }).manor));
  await page.evaluate(() => (window as unknown as { manor: { newGame: (seed: number) => void; setUi: (p: object) => void } }).manor.newGame(77));

  // The help sheet shows first for a fresh profile; its button dismisses it.
  await page.evaluate(() => (window as unknown as { manor: { setUi: (p: object) => void } }).manor.setUi({ showHelp: true }));
  await page.getByRole("button", { name: "Open the door" }).click();
  await page.getByRole("button", { name: "Accept" }).first().click();
  check("accepting an invitation reaches the morning", (await probe(page)).phase === "morning");

  // Drag the Master from the laboratory to the shop.
  const from = await centre(page, '[data-maid="lord"]');
  const to = await centre(page, '[data-room="r13"]');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  check("dragging the Master onto the shop posts him there", (await probe(page)).rooms.lord === "r13", JSON.stringify((await probe(page)).rooms));

  // A plain click selects; it does not move anyone.
  const ev = await centre(page, '[data-maid="evelyn"]');
  await page.mouse.click(ev.x, ev.y);
  const afterClick = await probe(page);
  check("clicking a maid selects her and leaves her posted", JSON.stringify(afterClick.selection) === JSON.stringify({ kind: "maid", id: "evelyn" }) && afterClick.rooms.evelyn === "r11");

  // Click the kitchen, switch it to tea from the panel.
  const kitchen = await centre(page, '[data-room="r11"]');
  await page.mouse.click(kitchen.x + 60, kitchen.y - 40);
  await page.getByRole("button", { name: /Tea/ }).first().click();
  check("the panel's recipe button puts tea on the kitchen's rota", (await probe(page)).recipe === "bread+tea");

  // Space opens the house; Space again pauses it.
  await page.keyboard.press("Space");
  check("Space opens the house", (await probe(page)).phase === "day");
  await page.keyboard.press("Space");
  check("Space pauses a running day", (await probe(page)).paused === true);
  await page.keyboard.press("Space");

  // Let a little of the day run for real, then flip a standing order.
  await page.waitForTimeout(2500);
  await page.evaluate(() => (window as unknown as { manor: { advance: (s: number) => void } }).manor.advance(30));
  await page.locator(".stock .order").first().click();
  const orders = (await probe(page)).orders;
  check("clicking a standing order flips it", Object.values(orders).filter((o) => o === "keep").length >= 6, JSON.stringify(orders));

  // Run out the day and buy the first offer.
  await page.evaluate(() => (window as unknown as { manor: { advance: (s: number) => void } }).manor.advance(70));
  const evening = await probe(page);
  check("the day ends in the evening's offers", evening.phase === "offers", evening.phase);
  await page.evaluate(() => {
    (window as unknown as { manor: { ui: { game: { coin: number } } } }).manor.ui.game.coin = 99;
  });
  await page.locator(".offer button.primary").first().click();
  const bought = await probe(page);
  check("buying the first offer (Violet) adds her to the household", bought.maids === 3, `${bought.maids} in household, coin ${bought.coin}`);
  await page.screenshot({ path: "shots/ui-check.png" });
  await page.getByRole("button", { name: /Good night/ }).click();
  check("Good night leads to the next morning", (await probe(page)).phase === "morning");

  check("no page errors", errors.length === 0, errors.join(" | "));
  console.log(results.join("\n"));
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
};

void main();
