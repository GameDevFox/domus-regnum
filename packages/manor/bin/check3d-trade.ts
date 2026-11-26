// The checks of the 3D demo page that are about the game's trade: jobs and who holds them, the
// ledger, and the custom the shop has. Run by check3d.ts.
import type { Browser, Page } from "@playwright/test";

import { pageTime, shown } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** Time for the panel to be redrawn after the game has been changed by hand: it reads the game a few times a second. */
const REDRAWN_MS = 400;
/** Seconds of the house's time to run at a go while waiting for something to be seen. */
const LOOK_EVERY = 5;
const LOOKS = 40;
/** How long the list of the household is waited for to say what is now so. */
const LISTED_MS = 5000;
/** Longer than a feat's card stays on the screen. */
const CARD_GONE_MS = 6500;

type Books = { coin: number; flour: number; sold: number; custom: number; posts: Record<string, string | undefined> };

const open = async (browser: Browser, base: string, viewport: Checks["viewport"], query: string): Promise<Page> => {
  const page = await browser.newPage({ viewport });
  await page.goto(`${base}demo3d.html?help=0&${query}`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  // (The town's shops are found to begin with, as they were when this was written: the finding of them is check3d-shops.ts's.)
  await page.evaluate(`window.manor3d.game.shops.push("miller", "greengrocer", "books", "herbalist", "clothes")`);
  // The clock is stopped, so that nothing is sold between one look and the next.
  await page.evaluate(`window.manor3d.paused.set(true)`);
  return page;
};

export const checkTrade = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await open(browser, base, viewport, "view=ground");
  const books = (): Promise<Books> =>
    page.evaluate(() => {
      const { coin, flour, sold, custom, posts } = (window as unknown as { manor3d: { game: Books } }).manor3d.game;
      return { coin, flour, sold, custom, posts: { ...posts } };
    });
  /** Someone's face on the card of a place of work, which is where work is given ("Baking: Sage"): the card is opened first, if it is not open already. */
  const face = async (name: string) => {
    await page.evaluate(`window.manor3d.work.open.${name.startsWith("Baking") ? "bake" : "shop"}.set(true)`);
    return page.getByRole("button", { name });
  };
  const pressed = async (name: string): Promise<string | null> => (await face(name)).getAttribute("aria-pressed");
  /** The badge of what someone is at, in the list of the household. */
  const badge = (who: string) => page.locator(".person", { hasText: who }).locator(".work");
  const tally = (name: RegExp): Promise<string | null> => page.getByRole("img", { name }).getAttribute("aria-label");

  const measure = page.getByRole("progressbar");
  check(`the measure of the Master's work is on the panel from the start, and nothing is offered yet (${await measure.getAttribute("aria-label")})`, ((await measure.getAttribute("aria-label")) ?? "").startsWith("The Master's work in his laboratory: 0 of 60 minutes") && (await page.locator(".offer").count()) === 0);

  // Flour is ordered: paid for at once, cart and all, and brought some hours later by a carter who is seen to come.
  const opening = await books();
  check("it opens with Evelyn baking and Rose keeping the shop", opening.posts.evelyn === "bake" && opening.posts.rose === "shop");
  const order = page.getByRole("button", { name: /^Order 4 sacks of flour/ });
  check("with too little coin, flour cannot be ordered", await order.isDisabled());
  await page.evaluate(() => {
    (window as unknown as { manor3d: { game: { coin: number } } }).manor3d.game.coin = 100;
  });
  await pageTime(page, REDRAWN_MS);
  await order.click();
  await pageTime(page, REDRAWN_MS);
  const ordered = await books();
  check(`ordering four sacks takes their price and the cart's at once, and puts nothing in the pantry yet (${ordered.coin} coin)`, ordered.coin === 100 - 4 * 3 - 6 && ordered.flour === opening.flour);
  // (Waited for: the ledger is read again from the game as the page is drawn, which on a slow page is not at once.)
  await page.getByRole("img", { name: `Coin: ${ordered.coin}`, exact: true }).waitFor({ timeout: LISTED_MS }).catch(() => undefined);
  check(`the ledger shows the coin there is now (${await tally(/^Coin:/)})`, (await tally(/^Coin:/)) === `Coin: ${ordered.coin}`);
  const due = await page.getByRole("listitem").getAttribute("aria-label");
  check(`what is on its way is listed under Buy, with when it is due (${due})`, due === "4 sacks of flour, due at 11:00");
  const onDial = await page.getByRole("img", { name: /^Day / }).getAttribute("aria-label");
  check(`…and drawn on the dial as a stretch of the day (${onDial})`, (await page.locator(".dial-plan").count()) === 1 && (await page.locator(".dial-plan-glyph").count()) === 1 && (onDial ?? "").includes("4 sacks of flour on their way"));
  // Three hours on, the carter is in the house with it; a minute after, it is on the shelf and he has
  // gone. The baker goes on using flour meanwhile, a sack or two in that minute.
  await page.evaluate(`window.manor3d.advance(3 * 60 + 3)`);
  await pageTime(page, REDRAWN_MS);
  const carter = (await page.evaluate(`window.manor3d.shown().filter((id) => id.startsWith("carter-")).length`)) as number;
  const before = await books();
  check("three hours on, the carter is seen in the house, and the flour is not yet on the shelf", carter === 1 && before.flour <= opening.flour);
  await page.evaluate(`window.manor3d.advance(60)`);
  await shown(async () => (await page.getByRole("listitem").count()) === 0 && (await page.locator(".dial-plan").count()) === 0, { ms: LISTED_MS });
  const after = await books();
  const left = (await page.evaluate(`window.manor3d.world.actors.filter((a) => a.id.startsWith("carter-")).length`)) as number;
  check(`a minute later it is in the pantry, and he has gone (${before.flour} sacks, then ${after.flour})`, after.flour >= before.flour + 2 && left === 0 && (await page.getByRole("listitem").count()) === 0 && (await page.locator(".dial-plan").count()) === 0);

  // A mastery is marked when it comes: a card under the clock, a star beside her name, and it is said how far the others have to go.
  const star = page.locator(".person", { hasText: "Evelyn" }).locator(".badge");
  check("nobody has a mastery to begin with", (await page.locator(".feat").count()) === 0 && !(await star.isVisible()));
  check("how far someone has to go is said of her face on the kitchen's card", ((await (await face("Baking: Sage")).getAttribute("title")) ?? "").includes("0 of 100 loaves"));
  await page.evaluate(`(() => {
    const h = window.manor3d;
    h.game.baked.evelyn = 96;
    for (let n = 0; n < ${LOOKS} && h.game.feats.length === 0; n++) h.advance(${LOOK_EVERY});
  })()`);
  await pageTime(page, REDRAWN_MS);
  const marked = await page.locator(".feat").getAttribute("aria-label").catch(() => null);
  check(`her hundredth loaf is marked with a card that says whose it is (${marked})`, (marked ?? "").startsWith("Evelyn has baked 100 loaves"));
  check("…and from then on there is a star beside her name", (await star.isVisible()) && (await star.textContent()) === "⭐");
  await page.waitForTimeout(CARD_GONE_MS);
  check("the card goes away of itself, and the star stays", (await page.locator(".feat").count()) === 0 && (await star.isVisible()));

  // An errand into town is given on the town's card, and the dial says how long it is before and after it is given.
  // Nobody bakes meanwhile, so that the flour on the shelf changes only by what she brings.
  await (await face("Baking: Evelyn")).click();
  // (She is sent from the town's card on the map, which is where an errand is given now: the map is opened for it, and shut again.)
  await page.keyboard.press("m");
  await page.locator('[data-place="town"]').click();
  const send = page.locator('.map-card .who[data-who="sage"]');
  // (The return is asked for beforehand, so that she comes home with the flour when it is bought, without asking: this is about the errand.)
  await page.locator(".map-then").click();
  await send.hover();
  await pageTime(page, REDRAWN_MS);
  check(`with the pointer on her face on the town's card, the dial shows how long she would be gone (${await send.getAttribute("title")})`, (await page.locator(".dial-plan-errand.ghost").count()) === 1 && /Back at \d\d:\d\d$/.test((await send.getAttribute("title")) ?? ""));
  const purse = await books();
  await send.click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await pageTime(page, REDRAWN_MS);
  const sent = await books();
  check("sending her takes the coin for four sacks, and no more", sent.coin === purse.coin - 4 * 3);
  check(`…her badge in the list says she is out, and the dial shows her errand in earnest (${await badge("Sage").textContent()})`, (await badge("Sage").textContent()) === "🗺️" && (await page.locator(".map-veil").count()) === 0 && (await page.locator(".dial-plan-errand:not(.ghost)").count()) === 1 && (await page.locator(".dial-plan.ghost").count()) === 0);
  // A badge with nothing to count has no ring in it, seen or unseen; one with something to count (her errand, say) has.
  const rings = (await page.evaluate(`[...document.querySelectorAll(".person .work")].map((w) => [w.dataset.share, w.querySelectorAll(".work-ring").length])`)) as [string, number][];
  check(`…and a badge with nothing counted has no ring in it, while one with something counted has (${JSON.stringify(rings)})`, rings.some(([share]) => share === "") && rings.every(([share, n]) => n === (share === "" ? 0 : 1)) && rings.some(([share]) => share !== ""));
  // (Until she is out at the gate, however far from the door she was when she was sent: not for a fixed while.)
  await page.evaluate(`(() => { const h = window.manor3d; for (let n = 0; n < ${LOOKS} && h.game.outings[0]?.state !== "away"; n++) h.advance(${LOOK_EVERY}); })()`);
  await pageTime(page, REDRAWN_MS);
  const gone = (await page.evaluate(`window.manor3d.world.actors.some((a) => a.id === "sage")`)) as boolean;
  // (The list is read again from the game a few times a second of the page's own time, which runs slow when the page is slow to draw: it is waited for, not given a fixed while.)
  await page.locator(".person", { hasText: "Sage" }).locator(".doing").filter({ hasText: /🚶|🌾/ }).waitFor({ timeout: LISTED_MS }).catch(() => undefined);
  const listed = await page.locator(".person", { hasText: "Sage" }).locator(".doing").textContent();
  // (A part of a minute is a minute; and sums of minutes come out a hair long.)
  const shouldSay = (await page.evaluate(`(() => { const { game } = window.manor3d; const [o] = game.outings; return game.clock < o.arrive ? "🚶 " + Math.max(1, Math.ceil(o.arrive - game.clock - 1e-6)) + " min" : "🌾 ×4"; })()`)) as string;
  const outNow = (await page.evaluate(`JSON.stringify(window.manor3d.game.outings.map((o) => [o.who, o.state, o.doing]))`)) as string;
  check(`she walks out at the front door and is gone from the house; the list says what she is at: how far off town is, or what she is buying there (${listed}; outings: ${outNow})`, !gone && listed === shouldSay && /^(🚶 \d+ min|🌾 ×4)$/.test(listed ?? ""));
  const away = await books();
  await page.evaluate(`window.manor3d.advance(2 * 60 + 15)`);
  await pageTime(page, REDRAWN_MS);
  const home = await books();
  // In the house again, wherever her housework has since taken her.
  const back = (await page.evaluate(`window.manor3d.world.actors.some((a) => a.id === "sage")`)) as boolean;
  check(`two hours on she is home, and what she bought is in the pantry (${away.flour} sacks, then ${home.flour})`, back && home.flour === away.flour + 4 && (await badge("Sage").textContent()) !== "🗺️" && (await page.locator(".dial-plan-errand").count()) === 0);
  await (await face("Baking: Evelyn")).click();

  // Inventions: the Master's work fills a measure; full, it offers the devices; one chosen is made and seen in its room.
  const inScene = (name: string): Promise<boolean> => page.evaluate(`Boolean(window.manor3d.scene.getObjectByName("${name}"))`) as Promise<boolean>;
  // By now, hours into the day, his measure may have filled of itself: it is put back to just short of full.
  await page.evaluate(`(() => {
    const h = window.manor3d;
    h.game.lab = { progress: 59.5, needed: 60, ready: false };
    for (let n = 0; n < ${LOOKS * 3} && !h.game.lab.ready; n++) h.advance(${LOOK_EVERY});
  })()`);
  await pageTime(page, REDRAWN_MS);
  // The newest card: one from his measure filling of itself a moment ago may still be on the screen.
  const ready = await page.locator(".feat").last().getAttribute("aria-label").catch(() => null);
  check(`when it is full a card says so, and the three devices are offered (${ready})`, (ready ?? "").startsWith("The Master has an invention ready") && (await page.locator(".offer").count()) === 3 && (await measure.getAttribute("aria-label")) === "An invention is ready: choose which");
  check("…and none of them is in the house yet", !(await inScene("device.dumbwaiter")) && !(await inScene("device.till")));
  await page.getByRole("button", { name: /^Make the dumbwaiter/ }).click();
  await pageTime(page, REDRAWN_MS);
  const lab = (await page.evaluate(`JSON.stringify([window.manor3d.game.devices, window.manor3d.game.lab])`)) as string;
  check(`choosing the dumbwaiter makes it: the measure is empty, and the next takes twice as long (${lab})`, lab === '[["dumbwaiter"],{"progress":0,"needed":120,"ready":false}]');
  check("…it is listed as made, and nothing more is offered", (await page.getByRole("listitem", { name: /^Made: the dumbwaiter/ }).count()) === 1 && (await page.locator(".offer").count()) === 0);
  check("…and it stands in the kitchen, with the other two still not in the house", (await inScene("device.dumbwaiter")) && !(await inScene("device.everwarm")) && !(await inScene("device.till")));

  // The baking is shared; the shop is kept by one.
  await (await face("Baking: Sage")).click();
  const shared = await books();
  check("giving Sage the baking leaves Evelyn at it too", shared.posts.sage === "bake" && shared.posts.evelyn === "bake");
  check("…and both their buttons are lit", (await pressed("Baking: Sage")) === "true" && (await pressed("Baking: Evelyn")) === "true");
  await (await face("Baking: Sage")).click();
  const taken = await books();
  check("pressing a lit job takes it away, from her alone", taken.posts.sage === undefined && taken.posts.evelyn === "bake");
  await (await face("Keeping the shop: Sage")).click();
  const kept = await books();
  check("the shop is kept by one: giving it to Sage takes it from Rose", kept.posts.sage === "shop" && kept.posts.rose === undefined);
  check("…and her button is lit, and Rose's is not", (await pressed("Keeping the shop: Sage")) === "true" && (await pressed("Keeping the shop: Rose")) === "false");

  // Three bakers and one oven: before long one of them is seen waiting her turn at it.
  await (await face("Baking: Rose")).click();
  await (await face("Baking: The Master")).click();
  let waiting = "";
  for (let n = 0; n < LOOKS && !waiting.includes("🔥"); n++) {
    // The shelf is kept bare, so that it is the oven they wait for and not room for the loaves.
    await page.evaluate(`(() => { window.manor3d.game.shelf.bread = 0; window.manor3d.advance(${LOOK_EVERY}); })()`);
    await pageTime(page, REDRAWN_MS);
    waiting = (await page.locator(".doing").allTextContents()).join(" | ");
  }
  check(`with three baking, one is seen waiting for the oven (${waiting})`, waiting.includes("🔥"));

  // The shop's custom is on the ledger, and it is reckoned as the house wakes.
  check(`the ledger shows the custom the shop opens with (${await tally(/^Custom,/)})`, ((await tally(/^Custom,/)) ?? "").endsWith(": 1"));
  // The shop is shut first and the counter let empty: someone left standing at it when the clock is put on would go without.
  await (await face("Keeping the shop: Sage")).click();
  await page.evaluate(`window.manor3d.advance(60)`);
  await page.evaluate(`(() => {
    const { game } = window.manor3d;
    game.today = { sold: 5, lost: 0 };
    game.clock = 21 * 60 + 55;
    window.manor3d.advance(120);
  })()`);
  await pageTime(page, REDRAWN_MS);
  const next = await books();
  check(`after a day on which nobody went without, the morning brings more custom (${await tally(/^Custom,/)})`, next.custom === 2 && ((await tally(/^Custom,/)) ?? "").endsWith(": 2"));
  await page.close();
};
