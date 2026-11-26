// The checks of the 3D demo page that are about queuing several steps ahead: the ➕ toggle on a
// place's card, lit from card to card, which adds what her face is pressed for after what she is
// at; her steps in the list of the household, which show all that is queued with the piece of its
// place, and take a step out when it is pressed; her going on through the queue and coming home
// without asking; and her stopping to ask, with why, when what is queued next cannot be done.
// Run by check3d.ts.
import type { Page } from "@playwright/test";

import { read, rules, runUntil, shown as shownWithin, titleOf } from "./check3d-kit";
import type { Checks } from "./check3d-kit";

/** Seconds of the house's time run at a go while something is waited for, and how many goes at the most. */
const STEP = 5;
const STEPS = 400;
/** How long the page is given to show something that is waited for: its cards are read again a few times a second. */
const SHOWN_MS = 5000;
const POLL_MS = 100;
/** Longer than the map takes to look again at the question asked, and open itself for one that is another (map-view.ts). */
const MAP_LOOKS_MS = 1000;
/** A lot of flour, in sacks. */
const FLOUR_LOT = 4;
/** What a lot of flour costs. */
const FLOUR_PRICE = 12;

/** Run the house on, in the page, until something is so: a script with `h` and `game`. */
const until = (page: Page, so: string): Promise<boolean> => runUntil(page, so, { step: STEP, steps: STEPS });
/** Wait until something on the page is so, for as long as the page is given to show it. */
const shown = (so: () => Promise<boolean>): Promise<boolean> => shownWithin(so, { ms: SHOWN_MS, poll: POLL_MS });

export const checkQueue = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // (Opened with the map centred in what the panel leaves, not on the window as a first visit has it: on a window this wide the forest would lie under the panel, where it cannot be pressed. check3d-map-panel.ts looks at the first visit's way.)
  await page.goto(`${base}demo3d.html?help=0&view=ground&centre=0`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  // (Every shop in town found, the forest and what grows in it, and coin to spend; nobody bakes or keeps the shop, so that the flour and the coin change only by what is bought.)
  await rules(page, `(game.shops.push("miller", "greengrocer", "books", "herbalist", "clothes"), game.places.forest = "found", game.finds.forest = ["berries", "herbs"], game.coin = 200, G.assign(game, "evelyn", null), G.assign(game, "rose", null))`);
  await page.evaluate(`window.manor3d.paused.set(true)`);
  const card = (place: string) => page.locator(`.map-card[data-card="${place}"]`);
  const face = (who: string) => page.locator(`.map-card .who[data-who="${who}"]`);
  const doing = (what: string) => page.locator(`.map-card .map-doing[data-doing="${what}"]`);
  const then = page.locator('.map-card [data-mode="then"]');
  const ask = page.locator(".map-ask");
  const steps = (who: string) => page.locator(".person", { hasText: who }).locator(".steps");
  const queue = (who: string): Promise<unknown> => read(page, `JSON.stringify(game.outings.find((o) => o.who === "${who}")?.queue ?? null)`);
  const openCard = async (place: string): Promise<void> => {
    await page.evaluate(`window.manor3d.map.open.set(true)`);
    await page.locator(`button[data-place="${place}"]`).click();
    await card(place).waitFor({ timeout: SHOWN_MS });
  };

  // Sent to gather, as ever; then ➕ lit, her face says it adds.
  await openCard("forest");
  await doing("gather").click();
  const unlit = (await then.getAttribute("aria-pressed")) === "false";
  await face("sage").click();
  await then.click();
  const adds = await shown(async () => (await then.getAttribute("aria-pressed")) === "true" && (await titleOf(face("sage"))).startsWith("Add after what she is at: Gather: Sage"));
  check(`➕ on a place's card is unlit until pressed; lit, the face of someone out says pressing her adds it after what she is at (${await titleOf(face("sage"))})`, unlit && adds && (await read(page, `game.outings.find((o) => o.who === "sage")?.doing`)) === "gather");
  // Someone out is told from someone at home by how her face looks, not only by its title: the map in its corner, as on her badge in the panel.
  const outMark = (who: string): Promise<string> => face(who).evaluate((node) => getComputedStyle(node, "::before").content);
  check(`…and her face is marked out, by the map in its corner, where a face at home is not (${await outMark("sage")}, ${await outMark("rose")})`, (await face("sage").getAttribute("class"))?.includes("out") === true && (await outMark("sage")).includes("🗺") && !(await face("rose").getAttribute("class"))?.includes("out") && (await outMark("rose")) === "none");
  // Lit, the longest stay and the bed are not in the page: what is added is done on the terms of the outing it joins. The return asked for is, as it is queued.
  const stays = page.locator(".map-card .map-stay");
  const bed = page.locator(".map-card .map-card-stays .map-bed:not(.map-then)");
  const backChip = page.locator(".map-card .map-card-stays .map-then");
  const termsGone = await shown(async () => (await stays.count()) > 0 && (await stays.evaluateAll((nodes) => nodes.every((node) => (node as HTMLElement).offsetParent === null))) && (await bed.isHidden()) && (await backChip.isVisible()));
  check(`…lit, the stay-length chips and the bed are taken out of the card, the return asked for kept (${await stays.count()} stays)`, termsGone);

  // From another card, still lit: flour is queued, and not paid for yet.
  await card("forest").locator(".map-card-close").click();
  await openCard("town");
  const stillLit = (await then.getAttribute("aria-pressed")) === "true";
  await doing("buy").click();
  const coin = (await read(page, "game.coin")) as number;
  await face("sage").click();
  const flourQueued = (await queue("sage")) === JSON.stringify([{ to: "town", doing: "buy", ware: "flour" }]);
  check(`…it stays lit from card to card; pressed from the town's card it queues the flour after the gathering, and nothing is paid yet (${await queue("sage")})`, stillLit && flourQueued && (await read(page, "game.coin")) === coin);
  await card("town").locator(".map-card-close").click();
  await openCard("forest");
  await doing("explore").click();
  await face("sage").click();
  await then.click();
  const termsBack = await shown(async () => (await stays.evaluateAll((nodes) => nodes.every((node) => (node as HTMLElement).offsetParent !== null))) && (await bed.isVisible()));
  check("…and goes out only when pressed again, the stay-length chips and the bed back on the card", (await then.getAttribute("aria-pressed")) === "false" && termsBack);

  // Her steps show all of it, each with the piece of its place where that changes; a step pressed is taken out.
  await page.evaluate(`window.manor3d.map.open.set(false)`);
  const queued = steps("Sage").locator('button[data-step="then"]');
  const both = await shown(async () => (await queued.count()) === 2);
  const [first, second] = [queued.nth(0), queued.nth(1)];
  const pictured = (await first.locator("img.step-place").count()) === 1 && (await second.locator("img.step-place").count()) === 1;
  check(`her steps show all that is queued, in order, each with its place's piece where it is another than the step's before (${await titleOf(first)}; ${await titleOf(second)})`, both && pictured && (await titleOf(first)) === "Then: Buy flour at the town. Press to take it out" && (await titleOf(second)) === "Then: Explore the forest. Press to take it out");
  await second.click();
  check("…and a queued step pressed is taken out", await shown(async () => (await queued.count()) === 1 && (await queue("sage")) === JSON.stringify([{ to: "town", doing: "buy", ware: "flour" }])));

  // The walk home queued last: she gathers, goes on to town past the house, buys, and comes home without asking.
  await steps("Sage").locator('button[data-step="home"]').click();
  const flour = (await read(page, "game.flour")) as number;
  const home = await until(page, `game.asks.length > 0 || !game.outings.some((o) => o.who === "sage")`);
  check(`with the walk home queued last she goes through it all and comes home without asking, the flour bought on the way (${await read(page, "game.flour")} sacks, ${await read(page, "game.coin")} coin)`, home && (await read(page, "game.asks.length")) === 0 && (await read(page, "game.flour")) === flour + FLOUR_LOT && (await read(page, "game.coin")) === coin - FLOUR_PRICE);

  // What is queued next cannot be done when she comes to it: she asks, and says why.
  await rules(page, `(G.gather(game, "rose", "forest", { limit: 480, homeByBed: false }), G.enqueue(game, "rose", { to: "town", doing: "buy", ware: "flour" }, { limit: 480, homeByBed: false }), G.enqueue(game, "rose", { to: "town", doing: "buy", ware: "almanac" }, { limit: 480, homeByBed: false }), G.enqueue(game, "rose", { to: "forest", doing: "explore" }, { limit: 480, homeByBed: false }), game.coin = 0)`);
  await until(page, `game.asks.length > 0`);
  const stuck = await shown(async () => (await ask.count()) === 1 && (await ask.getAttribute("aria-label")) === "Rose cannot buy flour at the town");
  const on = ask.locator('[data-told="on"]');
  check(`what is queued next cannot be done: she asks, the line says what, a line under it why, and ⏭️ to go on with it is disabled with why (${await ask.getAttribute("aria-label")}; ${await ask.locator(".map-ask-why").textContent()})`, stuck && (await ask.locator(".map-ask-why").textContent()) === "There is not the coin for it." && (await on.isDisabled()) && (await titleOf(on)).endsWith("There is not the coin for it"));
  // The step she is stuck on taken out: the question is about what is next now. First, with the map open (as anything that takes it out while she asks), the flour: she is stuck on the almanac, which cannot be bought either; then, from her steps, the almanac: exploring the forest is next, which can be done, and ⏭️ goes on to it.
  const takeOutOfSteps = async (): Promise<void> => {
    // (Let the map see the question as it stands first, or it opens itself again over her steps: it looks a few times a second.)
    await new Promise((done) => setTimeout(done, MAP_LOOKS_MS));
    await page.evaluate(`window.manor3d.map.open.set(false)`);
    await steps("Rose").locator('button[data-step="then"]').first().click();
    // (The map opens of itself for a question that is another; for the same one, it is opened again.)
    await page.evaluate(`window.manor3d.map.open.set(true)`);
  };
  await rules(page, `G.unqueue(game, "rose", 0)`);
  const almanac = await shown(async () => (await ask.count()) === 1 && (await ask.getAttribute("aria-label")) === "Rose cannot buy a gardener's almanac at the town");
  check(`…the step she is stuck on taken out, she is stuck on what is next now, if that cannot be done either (${await ask.getAttribute("aria-label")})`, almanac && (await on.isDisabled()));
  await takeOutOfSteps();
  const afresh = await shown(async () => (await ask.count()) === 1 && (await ask.getAttribute("aria-label")) === "Rose's basket is full" && (await on.count()) === 1 && (await on.isEnabled()));
  check(`…the step she is stuck on taken out, the question is about what is next now: no longer stuck, she asks as she would have, and ⏭️ goes on to the exploring queued after it (${await ask.getAttribute("aria-label")}; ⏭️ ${(await on.count()) === 1 ? ((await on.isEnabled()) ? "enabled" : "disabled") : "gone"})`, afresh && (await ask.locator(".map-ask-why").count()) === 0);
  // Asking so, the exploring taken out too, with the map open: nothing is left to go on to, and ⏭️ is gone from the question.
  await rules(page, `G.unqueue(game, "rose", 0)`);
  const noOn = await shown(async () => (await ask.count()) === 1 && (await on.count()) === 0);
  check(`…and the last step taken out, ⏭️ is gone from the question (${await ask.locator(".map-ask-choice").evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.told).join())})`, noOn && (await ask.getAttribute("aria-label")) === "Rose's basket is full");
  await ask.locator('[data-told="home"]').click();
  await until(page, `game.outings.length === 0`);

  check(`no errors on the page${errors.length ? `: ${errors.join(" | ")}` : ""}`, errors.length === 0);
  await page.close();
};
