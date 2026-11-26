// The checks of the 3D demo page that are about the shops in town: the town's card has the
// miller's, a book shop and a clothes shop on it; a shop and one of its wares are chosen, and
// whoever is sent goes for that; a book does what it is for once it is home, and something to
// wear is put by. Run by check3d.ts.
import type { Browser, Page } from "@playwright/test";

import { pageTime } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** Time for the map and its card to be redrawn after something is changed. */
const REDRAWN_MS = 350;
/** Seconds of the house's time to run at a go while waiting for something to be seen, and how many goes. */
const LOOK_EVERY = 5;
const LOOKS = 60;
/** Coin enough for everything here. */
const PLENTY = 200;
const BOOTS_COST = 30;
const ALMANAC_COST = 25;

const until = async (page: Page, so: string): Promise<boolean> => {
  for (let n = 0; n < LOOKS; n++) {
    if (await page.evaluate(`(() => { const { game } = window.manor3d; return ${so}; })()`)) return true;
    await page.evaluate(`window.manor3d.advance(${LOOK_EVERY})`);
  }
  return false;
};

export const checkShops = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${base}demo3d.html?help=0&map=1`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  await page.evaluate(`(() => { window.manor3d.paused.set(true); window.manor3d.game.coin = ${PLENTY}; })()`);
  const game = <T>(field: string): Promise<T> => page.evaluate(`window.manor3d.game.${field}`) as Promise<T>;
  const card = page.locator(".map-card");
  const shop = (id: string) => card.locator(`.map-shop[data-shop="${id}"]`);
  const ware = (id: string) => card.locator(`.map-ware[data-ware="${id}"]`);
  const wares = (): Promise<string[]> => card.locator(".map-ware").evaluateAll((chips) => chips.map((chip) => `${(chip as HTMLElement).dataset.ware}=${chip.textContent}`));
  const face = (id: string) => card.locator(`.who[data-who="${id}"]`);
  const redrawn = async (): Promise<void> => void (await pageTime(page, REDRAWN_MS));

  // A new game knows none of the town's shops: its card has a question mark for each, nothing to buy, and the town to explore.
  await page.locator('[data-place="town"]').click();
  await redrawn();
  const slot = (id: string) => card.locator(`.map-slot[data-slot="shop:${id}"]`);
  check(`on a new game the town's card has no shop on it and nothing to buy: a question mark for each shop there is, none of them next, and the town to be explored (${(await card.locator(".map-slot").allTextContents()).join(" ")})`, (await card.locator(".map-shop").count()) === 0 && (await card.locator(".map-ware").count()) === 0 && (await card.locator(".map-slot").allTextContents()).join("") === "?????" && (await card.locator(".map-doing").allTextContents()).join("|") === "🚶 Go|🧭 Explore" && (await card.locator(".map-slot.sought").count()) === 0 && (await card.locator(".map-card-share").textContent()) === "0%");
  check(`a face on it sends her to explore the town (${await face("sage").getAttribute("aria-label")})`, (await face("sage").getAttribute("aria-label")) === "Explore: Sage");
  await face("sage").click();
  await redrawn();
  check("sent, she is out to explore it, for whatever turns up: no one shop is next", (await game<string | null>("outings[0].seeks")) === null && (await game<string>("outings[0].doing")) === "explore");
  // Finding a shop, she asks what she is to do next, with more of the town to explore; told to come home, she does.
  const asked = await until(page, `game.asks.length === 1`);
  await redrawn();
  const question = page.locator(".map-ask");
  check(`finding a shop she asks what she is to do next, saying what she has found: to stay, or to come home (${await question.getAttribute("aria-label")}: ${(await question.locator(".map-ask-choice").evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.told))).join(" | ")})`, asked && (await game<string[]>("shops")).length === 1 && /^Sage has found the .+ at the town$/.test((await question.getAttribute("aria-label")) ?? "") && (await question.locator(".map-ask-find").count()) === 1 && (await question.locator(".map-ask-choice").evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.told))).join("|") === "stay|home");
  await question.locator('[data-told="home"]').click();
  const foundOne = await until(page, `game.shops.length === 1 && game.outings.length === 0`);
  await redrawn();
  // (The card is left as it was put up, before anything was found: it is made again of itself when what can be done at the place is otherwise.)
  await redrawn();
  // Which shop it is, is the dice's to say: it is found by its points among the town's, in no set order.
  const [first] = await game<string[]>("shops");
  check(`she comes home having found a shop, whichever it was (${first}): its question mark is its picture now, the others are as they were, a fifth of the town is known, and it can be explored on (${(await card.locator(".map-slot").allTextContents()).join(" ")}; ${(await card.locator(".map-doing").allTextContents()).join(" | ")})`, foundOne && ["miller", "greengrocer", "books", "herbalist", "clothes"].includes(first) && (await slot(first).getAttribute("class"))?.includes("known") === true && (await card.locator(".map-slot.known").count()) === 1 && (await card.locator(".map-slot").allTextContents()).filter((text) => text === "?").length === 4 && (await card.locator(".map-card-share").textContent()) === "20%" && (await card.locator('.map-doing[data-doing="explore"]').count()) === 1);
  // What the shop found is for is on the card at once, with the card left open the while (the author's list: "Discovering a shop didn't unlock it's activity on the card. Had to close and open the card again for it to show up").
  const unlocked = ["greengrocer", "herbalist"].includes(first) ? "💰 Sell" : "🧺 Buy";
  check(`…and what it is for is offered on the card, which was not shut and opened again (${unlocked}, among ${(await card.locator(".map-doing").allTextContents()).join(" | ")})`, (await card.locator(".map-doing").allTextContents()).includes(unlocked));
  check(`a card under the clock said so as it happened (${await game<string>("feats.map((f) => f.what + ':' + (f.shop ?? '')).join()")})`, (await game<string>("feats.map((f) => f.what + ':' + (f.shop ?? '')).join()")).includes(`shop:${first}`));
  // (From here on it is the miller's that is known, whichever she found: what follows is about what a found shop does.)
  await page.evaluate(`window.manor3d.game.shops = ["miller"]`);
  await page.locator('[data-place="town"]').click();
  await page.locator('[data-place="town"]').click();
  await redrawn();
  check(`with the miller's found, flour can be bought there, or the town explored on (${(await card.locator(".map-doing").allTextContents()).join(" | ")})`, (await slot("miller").textContent()) === "🌾" && (await card.locator(".map-doing").allTextContents()).join("|") === "🚶 Go|🧺 Buy|🧭 Explore" && (await card.locator(".map-shop").count()) === 1 && (await shop("miller").count()) === 1);
  await card.locator('.map-doing[data-doing="explore"]').click();
  await redrawn();
  check("with the town to be explored chosen, the shops and their wares are put by; with buying chosen, they are there", (await card.locator(".map-wares").isHidden()) && (await card.locator(".map-card-stays").isVisible()));
  await card.locator('.map-doing[data-doing="buy"]').click();
  await redrawn();
  check("…and back", (await card.locator(".map-wares").isVisible()) && (await card.locator(".map-stay").first().isHidden()) && (await card.locator(".map-then").isVisible()));
  // Selling: a stall that deals in a thing buys it of the house, once the stall has been found.
  // (Nobody bakes or keeps the shop at home from here on: a pie takes berries, and a loaf sold is coin, and this is about what is sold in town.)
  await page.evaluate(`import("/src/game/index.ts").then(({ assign }) => { const { game } = window.manor3d; for (const id of game.household) assign(game, id, null); game.shelf.bread = 0; game.shelf.pie = 0; })`);
  await page.evaluate(`window.manor3d.advance(60)`);
  await page.evaluate(`(() => { const { game } = window.manor3d; game.stock.berries = 14; game.stock.herbs = 6; game.shops.push("greengrocer"); })()`);
  await page.locator('[data-place="town"]').click();
  await page.locator('[data-place="town"]').click();
  await redrawn();
  check(`with the greengrocer's stall found, selling is among what is done in town (${(await card.locator(".map-doing").allTextContents()).join(" | ")})`, (await card.locator(".map-doing").allTextContents()).join("|") === "🚶 Go|🧺 Buy|💰 Sell|🧭 Explore" && (await card.locator(".map-shop").count()) === 1);
  await card.locator('.map-doing[data-doing="sell"]').click();
  await redrawn();
  const good = (id: string) => card.locator(`.map-good[data-good="${id}"]`);
  check(`chosen, the card shows the stall and what of its kind the house has, with what one fetches: the berries, and not the herbs, whose stall is not found (${(await card.locator(".map-good").allTextContents()).join(" ")}; ${await card.locator(".map-card-brings").textContent()})`, (await card.locator(".map-stall").count()) === 1 && (await card.locator(".map-good").count()) === 1 && (await good("berries").textContent()) === "🫐×14🪙 3" && (await card.locator(".map-card-brings").textContent()) === "×12 🫐 → 🪙 36" && (await face("sage").getAttribute("aria-label")) === "Sell berries: Sage");
  const before = (await page.evaluate(`[window.manor3d.game.coin, window.manor3d.game.stock.berries]`)) as [number, number];
  // (With the return asked for beforehand: she comes home with it without asking.)
  await card.locator(".map-then").click();
  await face("sage").click();
  await redrawn();
  const taken = (await page.evaluate(`[window.manor3d.game.coin, window.manor3d.game.stock.berries, window.manor3d.game.outings[0]?.doing, window.manor3d.game.outings[0]?.basket.berries]`)) as [number, number, string, number];
  check(`pressing a face sends her to sell them: as many as her basket holds are gone from the pantry, and no coin has come of it yet (${taken[1]} berries left)`, taken[2] === "sell" && taken[3] === 12 && taken[1] === before[1] - 12 && taken[0] === before[0]);
  const start = (await page.evaluate(`window.manor3d.game.coin`)) as number;
  const sold = await until(page, `game.outings.length === 0`);
  check(`home again, what they fetched is the house's: twelve at three coin (${start}, then ${await game<number>("coin")})`, sold && (await game<number>("coin")) === start + 36 && (await game<number>("stock.berries")) === 2);
  await page.evaluate(`window.manor3d.game.shops.push("herbalist")`);
  await page.locator('[data-place="town"]').click();
  await page.locator('[data-place="town"]').click();
  await redrawn();
  await card.locator('.map-doing[data-doing="sell"]').click();
  await redrawn();
  check(`with the herbalist's found too, the herbs can be sold there (${(await card.locator(".map-good").allTextContents()).join(" ")})`, (await card.locator(".map-stall").count()) === 2 && (await good("herbs").textContent()) === "🌿×6🪙 5" && (await good("berries").textContent()) === "🫐×2🪙 3");
  await page.evaluate(`(() => { const { game } = window.manor3d; game.stock.berries = 0; game.stock.herbs = 0; })()`);
  await redrawn();
  await redrawn();
  check(`with none of anything they deal in, there is nothing to send anyone with, and the card says so (${await face("rose").getAttribute("title")})`, (await card.locator(".map-good").count()) === 0 && (await card.locator(".map-nothing").count()) === 1 && (await face("rose").isDisabled()) && ((await face("rose").getAttribute("title")) ?? "").includes("none of it in the house"));
  await card.locator('.map-doing[data-doing="buy"]').click();
  // The rest of this is of a town whose shops have all been found.
  await page.evaluate(`window.manor3d.game.shops.push("books", "clothes")`);
  await page.locator('[data-place="town"]').click();
  await page.locator('[data-place="town"]').click();
  await redrawn();
  const shops = await card.locator(".map-shop").evaluateAll((chips) => chips.map((chip) => `${chip.textContent} ${chip.getAttribute("aria-label")}`));
  check(`the town's card has its shops in a row, each by its picture: the miller's, a book shop and a clothes shop (${shops.join(" | ")})`, shops.join("|") === "🌾 The miller's|📚 The book shop|👗 The clothes shop");
  check(`the miller's is the one chosen to begin with, and flour all it sells (${(await wares()).join(" ")})`, (await shop("miller").getAttribute("aria-selected")) === "true" && (await wares()).join() === "flour=🌾🪙 12" && (await ware("flour").getAttribute("aria-pressed")) === "true");

  await shop("books").click();
  await redrawn();
  check(`the book shop sells an almanac and a treatise, each with its price, and the first is chosen (${(await wares()).join(" ")}; ${await face("sage").getAttribute("aria-label")})`, (await wares()).join() === "almanac=📗🪙 25,treatise=📕🪙 40" && (await ware("almanac").getAttribute("aria-pressed")) === "true" && (await face("sage").getAttribute("aria-label")) === "Buy a gardener's almanac: Sage");
  check(`a ware says what it is and what it is for (${await ware("treatise").getAttribute("title")})`, (await ware("treatise").getAttribute("title")) === "A treatise: 40 coin. Read, it brings the Master's next invention nearer");

  await shop("clothes").click();
  await redrawn();
  check(`the clothes shop sells one plain thing of each kind to wear (${(await wares()).join(" ")})`, (await wares()).join() === "gloves=🧤🪙 20,boots=🥾🪙 30,shoes=👞🪙 25,clothing=👗🪙 40,glasses=👓🪙 35");
  await ware("boots").click();
  await redrawn();
  check(`a ware is chosen by pressing it, and the card says what she would bring and what it costs (${await card.locator(".map-card-brings").textContent()})`, (await ware("boots").getAttribute("aria-pressed")) === "true" && (await ware("gloves").getAttribute("aria-pressed")) === "false" && (await card.locator(".map-card-brings").textContent()) === `×1 🥾  🪙 ${BOOTS_COST}` && (await card.locator(".map-stay").first().isHidden()) && (await card.locator(".map-then").isVisible()));

  // Without the coin for it nobody can be sent, though there is the coin for flour.
  await page.evaluate(`window.manor3d.game.coin = ${BOOTS_COST - 1}`);
  await redrawn();
  await redrawn();
  check(`without the coin for the boots nobody can be sent for them (${await face("sage").getAttribute("title")})`, (await face("sage").isDisabled()) && ((await face("sage").getAttribute("title")) ?? "").includes("coin"));
  await page.evaluate(`window.manor3d.game.coin = ${PLENTY}`);
  await redrawn();
  await redrawn();
  // (With the return asked for beforehand: she comes home with it without asking.)
  await card.locator(".map-then").click();
  await face("sage").click();
  await redrawn();
  const sent = await game<{ who: string; doing: string; buys: string }[]>("outings");
  check(`pressing a face sends her for the ware chosen, and its price goes with her (${JSON.stringify(sent.map((o) => [o.who, o.doing, o.buys]))}; ${await game<number>("coin")} coin)`, sent.length === 1 && sent[0].who === "sage" && sent[0].doing === "buy" && sent[0].buys === "boots" && (await game<number>("coin")) === PLENTY - BOOTS_COST);
  await page.evaluate(`window.manor3d.paused.set(false)`);
  const home = await until(page, `game.outings.length === 0`);
  await redrawn();
  await redrawn();
  check(`home with them, the boots are put by, and their place in the shop says the house has a pair (${await ware("boots").textContent()})`, home && (await game<number>("wardrobe.boots")) === 1 && (await ware("boots").textContent()) === "🥾🪙 30×1" && ((await ware("boots").getAttribute("title")) ?? "").endsWith("The house has 1"));

  // What is put by is in the inventory and the intel menu, as everything the house can hold is (the author's list, 2026-11-16: "Clothing items not showing up in inventory or intel").
  const inventory = page.getByRole("img", { name: /^Boots put by/ });
  const known = (await page.evaluate(`import("/src/game/index.ts").then(({ intelBook }) => intelBook(window.manor3d.game).find((entry) => entry.kind === "thing" && entry.id === "boots"))`)) as { known: boolean; says: string[] } | undefined;
  check(`…they are in the inventory at the top of the panel, and the gloves the house has none of are not (${await inventory.getAttribute("aria-label")})`, (await inventory.getAttribute("aria-label")) === "Boots put by: 1" && (await inventory.isVisible()) === (await page.getByRole("img", { name: /^Coin/ }).isVisible()) && (await page.locator('.tally[title="Gloves put by"]').isHidden()));
  check(`…and the intel menu knows of them, and says how many the house has (${known?.says.join(" | ")})`, known?.known === true && known.says.includes("The house has 1"));

  // A book does what it is for once it is home: the almanac teaches the garden a crop.
  const knew = (await game<string[]>("garden.known")).length;
  await shop("books").click();
  await redrawn();
  // (The shop sells loaves the while, so the coin is read on either side of the press.)
  const coinBefore = await game<number>("coin");
  // (With the return asked for beforehand: she comes home with it without asking.)
  await card.locator(".map-then").click();
  await face("sage").click();
  const paid = coinBefore - (await game<number>("coin"));
  const read = await until(page, `game.outings.length === 0`);
  check(`an almanac costs its own price, and brought home it teaches the garden a crop (${paid} coin; ${knew} known before, ${(await game<string[]>("garden.known")).length} after)`, read && paid === ALMANAC_COST && (await game<string[]>("garden.known")).length === knew + 1);

  // Of no use, a ware is drawn faint and nobody is sent for it.
  await page.evaluate(`import("/src/game/index.ts").then(({ CROP_IDS }) => { window.manor3d.game.garden.known = [...CROP_IDS]; })`);
  await redrawn();
  await redrawn();
  check(`with every crop known an almanac is of no use: it is drawn faint, and nobody can be sent for one (${await face("rose").getAttribute("title")})`, ((await ware("almanac").getAttribute("class")) ?? "").includes("needless") && (await face("rose").isDisabled()) && ((await face("rose").getAttribute("title")) ?? "").includes("no use") && !((await ware("treatise").getAttribute("class")) ?? "").includes("needless"));
  check(`no page errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, errors.length === 0);
  await page.close();
};
