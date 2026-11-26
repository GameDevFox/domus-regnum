// The checks of the 3D demo page that are about the second thing the kitchen bakes: with berries
// in the pantry a baker makes pies, they are on the house's books, and a customer is sold one
// at a pie's price. Run by check3d.ts.
import type { Browser, Page } from "@playwright/test";

import { pageTime } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** Seconds of the house's time run at a go while something is waited for, and how many goes at the most. */
const STEP = 1;
const STEPS = 200;
/** Time for the ledger to be read again: it is looked to a few times a second. */
const READ_MS = 500;
/** What a pie sells for, how many a batch makes, and how many lots of berries a batch takes. */
const PIE_PRICE = 9;
const PIES_PER_BATCH = 3;
const PIE_BERRIES = 2;

type Books = { coin: number; flour: number; berries: number; bread: number; pie: number; sold: number; carried: string[] };
const books = (page: Page): Promise<Books> =>
  page.evaluate(() => {
    const { game, world } = (window as unknown as { manor3d: { game: { coin: number; flour: number; sold: number; stock: { berries: number }; shelf: { bread: number; pie: number } }; world: { actors: { id: string; carrying: string | null }[] } } }).manor3d;
    return { coin: game.coin, flour: game.flour, berries: game.stock.berries, bread: game.shelf.bread, pie: game.shelf.pie, sold: game.sold, carried: world.actors.filter((a) => a.carrying === "pie").map((a) => a.id) };
  });
const until = async (page: Page, so: (now: Books) => boolean): Promise<Books | null> => {
  for (let n = 0; n < STEPS; n++) {
    const now = await books(page);
    if (so(now)) return now;
    await page.evaluate(`window.manor3d.advance(${STEP})`);
  }
  return null;
};

export const checkPie = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${base}demo3d.html?help=0&view=ground`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  await page.evaluate(`window.manor3d.paused.set(true)`);
  const pies = page.getByRole("img", { name: /^Berry pies on the shop's shelf/ });
  check("pies are not on the house's books before one has been baked", (await pies.count()) === 0);

  // Berries in the pantry, a bare shelf, and nobody keeping the shop: the baker's next batch is of pies, and they stay to be counted.
  // (She may have a batch of bread in hand as the page opens: the pies are the batch after it.)
  await page.evaluate(`(async () => { const { game } = window.manor3d; const rules = await import("/src/game/index.ts"); rules.assign(game, "rose", null); game.shelf.bread = 0; game.stock.berries = ${PIE_BERRIES}; })()`);
  const before = await books(page);
  const carried = await until(page, (now) => now.carried.includes("evelyn"));
  check("with berries in the pantry the baker takes them with her flour, and it is pies she carries from the oven", carried !== null && carried.berries === 0 && carried.flour < before.flour);
  const baked = await until(page, (now) => now.pie > 0);
  await pageTime(page, READ_MS);
  check(`a batch is three pies on the shop's shelf, and they are on the house's books (${await pies.getAttribute("aria-label").catch(() => null)})`, baked !== null && baked.pie === PIES_PER_BATCH && (await pies.getAttribute("aria-label")) === `Berry pies on the shop's shelf: ${PIES_PER_BATCH}`);

  // Someone keeps the shop again: the next customer is sold a pie, at a pie's price, though there is bread beside it.
  await page.evaluate(`(async () => { const { game } = window.manor3d; const rules = await import("/src/game/index.ts"); rules.assign(game, "evelyn", null); rules.assign(game, "rose", "shop"); game.shelf.bread = 5; })()`);
  const stocked = await books(page);
  const sold = await until(page, (now) => now.sold > stocked.sold);
  check(`a customer is sold a pie while there is one, at a pie's price, and the bread is left (${sold ? sold.coin - stocked.coin : "nothing"} coin)`, sold !== null && sold.coin === stocked.coin + PIE_PRICE && sold.pie === stocked.pie - 1 && sold.bread === stocked.bread);
  const gone = await until(page, (now) => now.carried.some((id) => id.startsWith("customer-")));
  check("…and she goes off with it", gone !== null);
  check(`the pie throws no errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, errors.length === 0);
  await page.close();
};
