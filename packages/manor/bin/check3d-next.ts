// The checks of the 3D demo page that are about what she does next, out of doors: the question
// she asks when she has nothing left to do (its reason in a line, and its two answers, stay and
// come home), and everything else she is told from the place cards while she waits at a place:
// buying twice in town, gathering in the forest and going on to town past the house, selling what
// she carries and coming home with the coin, exploring where she is, and cancelling from her
// steps. Run by check3d.ts.
import type { Page } from "@playwright/test";

import { read, rules, runUntil, shown as shownWithin, titleOf } from "./check3d-kit";
import type { Checks } from "./check3d-kit";

/** Seconds of the house's time run at a go while something is waited for, and how many goes at the most. */
const STEP = 5;
const STEPS = 300;
/** How long the page is given to show something that is waited for: its cards are read again a few times a second. */
const SHOWN_MS = 5000;
const POLL_MS = 100;
/** What a sack of flour costs, and how many a lot of it is; what a lot of berries fetches; a full basket of the forest. */
const FLOUR_LOT = 4;
const FLOUR_PRICE = 12;
const BERRY_PRICE = 3;
const FULL_BERRIES = 9;
const FULL_HERBS = 3;

/** Run the house on, in the page, until something is so: a script with `h` and `game`. */
const until = (page: Page, so: string): Promise<boolean> => runUntil(page, so, { step: STEP, steps: STEPS });
/** Wait until something on the page is so, for as long as the page is given to show it. */
const shown = (so: () => Promise<boolean>): Promise<boolean> => shownWithin(so, { ms: SHOWN_MS, poll: POLL_MS });

export const checkNext = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}demo3d.html?help=0&view=ground&map=1`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  // (Every shop in town found, the forest and what grows in it, and coin to spend; nobody bakes, so that the flour changes only by what is brought.)
  await rules(page, `(game.shops.push("miller", "greengrocer", "books", "herbalist", "clothes"), game.places.forest = "found", game.finds.forest = ["berries", "herbs"], game.coin = 200, G.assign(game, "evelyn", null))`);
  await page.evaluate(`window.manor3d.paused.set(true)`);
  const ask = page.locator(".map-ask");
  const asked = async (label: string): Promise<boolean> => shown(async () => (await ask.count()) === 1 && (await ask.getAttribute("aria-label")) === label);
  const card = (place: string) => page.locator(`.map-card[data-card="${place}"]`);
  const face = (who: string) => page.locator(`.map-card .who[data-who="${who}"]`);
  const doing = (what: string) => page.locator(`.map-card .map-doing[data-doing="${what}"]`);
  const token = (who: string) => page.locator(`.map-token[data-who="${who}"]`);
  const steps = (who: string) => page.locator(".person", { hasText: who }).locator(".steps");

  // Bought in town: she asks, with a line saying why, and two answers and no more.
  await rules(page, `G.sendToTown(game, "sage")`);
  await until(page, `game.asks.length > 0`);
  const bought = await asked("Sage has bought flour");
  const told = await ask.locator(".map-ask-choice").evaluateAll((nodes) => nodes.map((node) => `${(node as HTMLElement).dataset.told}:${(node as HTMLButtonElement).disabled}`));
  check(`with what she was sent for bought, she asks what next, saying why in a line under her face (${await ask.locator(".map-ask-says").textContent()})`, bought && (await ask.locator(".map-ask-says").textContent()) === "Sage has bought flour.");
  check(`…and the question has two answers, stay and come home, each a picture with its name in its tooltip; nothing the place cards offer is on it (${told.join(", ")})`, told.join() === "stay:false,home:false" && (await ask.locator('[data-told="stay"]').textContent()) === "✋" && (await titleOf(ask.locator('[data-told="home"]'))) === "Come home");

  // Told to stay, she waits, and the town's card is put up at once to give her something to do there.
  await ask.locator('[data-told="stay"]').click();
  const waiting = await shown(async () => (await card("town").count()) === 1 && (await token("sage").getAttribute("aria-label")) === "Sage, waiting at the town" && (await token("sage").locator(".map-token-status").textContent()) === "✋");
  check(`told to stay, the question is gone, she waits (her slip a raised hand), and the card of the place she is at is put up at once (${await token("sage").getAttribute("aria-label")})`, waiting && (await ask.count()) === 0);
  // On it, a ware the house has not the coin for cannot be sent for: her face says why. (The treatise is forty.)
  await page.evaluate(`window.manor3d.game.coin = 30`);
  await card("town").locator('.map-shop[data-shop="books"]').click();
  await card("town").locator('.map-ware[data-ware="treatise"]').click();
  const poor = await shown(async () => (await face("sage").isDisabled()) && (await titleOf(face("sage"))).endsWith("There is not the coin for it"));
  check(`on the town's card a ware there is not the coin for is shown, and her face is disabled with why (${await titleOf(face("sage"))})`, poor);
  await card("town").locator('.map-shop[data-shop="miller"]').click();
  const here = await shown(async () => (await face("sage").isEnabled()) && (await titleOf(face("sage"))).startsWith("Buy flour: Sage. She is here, and begins at once"));
  check(`…flour she can be sent for: waiting in town, her face says she begins at once (${await titleOf(face("sage"))})`, here);
  const sentAt = (await read(page, "game.clock")) as number;
  const coinThen = (await read(page, "game.coin")) as number;
  await face("sage").click();
  const begun = (await read(page, `(({ doing, buys, arrive, waits }) => ({ doing, buys, arrive, waits, coin: game.coin }))(game.outings.find((o) => o.who === "sage"))`)) as { doing: string; buys: string; arrive: number; waits: boolean; coin: number };
  check(`pressed, she buys a second time in the same outing, beginning now with no walk, and its price goes with her (${coinThen}, then ${begun.coin} coin)`, begun.doing === "buy" && begun.buys === "flour" && begun.arrive === sentAt && !begun.waits && begun.coin === coinThen - FLOUR_PRICE);
  await until(page, `game.asks.length > 0`);
  const twice = await asked("Sage has bought flour");
  check(`…and asks again, with two lots of flour with her (${await read(page, `JSON.stringify(game.outings[0].bought)`)})`, twice && (await read(page, `game.outings.find((o) => o.who === "sage").bought.flour`)) === 2 * FLOUR_LOT);
  const flour = (await read(page, "game.flour")) as number;
  await ask.locator('[data-told="home"]').click();
  const home = await until(page, `!game.outings.some((o) => o.who === "sage")`);
  check(`told to come home, she is home with both lots (${flour} sacks, then ${await read(page, "game.flour")})`, home && (await read(page, "game.flour")) === flour + 2 * FLOUR_LOT);

  // Gathering in the forest until her basket is full.
  await page.evaluate(`window.manor3d.map.open.set(true)`);
  await rules(page, `G.gather(game, "rose", "forest", { limit: 480, homeByBed: false })`);
  await until(page, `game.asks.length > 0`);
  check(`with her basket full she asks, and says so (${await ask.getAttribute("aria-label")})`, await asked("Rose's basket is full"));
  await ask.locator('[data-told="stay"]').click();
  await card("forest").waitFor({ timeout: SHOWN_MS });
  // Going on to town from the town's card, first, only to go there: past the house, without going in.
  await page.locator('button[data-place="town"]').click();
  await doing("go").click();
  const goesOn = await shown(async () => (await titleOf(face("rose"))).startsWith("Go: Rose. She is at the forest, and goes on from there"));
  check(`on the town's card, only going there is offered first, and her face says she goes on from the forest (${await titleOf(face("rose"))})`, goesOn && (await page.locator(".map-card .map-doing").first().getAttribute("data-doing")) === "go");
  await face("rose").click();
  const via = (await read(page, `(({ to, doing, turned }) => [to, doing, ...(turned ? turned.via : [])].join())(game.outings.find((o) => o.who === "rose"))`)) as string;
  check(`pressed, she is bound for town with nothing chosen to do there, by the road past the house (${via})`, via === "town,,forest,manor,town");
  await until(page, `game.asks.length > 0`);
  const cameTo = await asked("Rose has come to the town");
  check("…she goes past the house without going in, and asks when she has come to town", cameTo && (await read(page, `game.outings.find((o) => o.who === "rose").state`)) === "away");
  await ask.locator('[data-told="stay"]').click();
  await card("town").waitFor({ timeout: SHOWN_MS });
  // Selling what she has with her: offered on the town's card for her, and for nobody at home, who would sell what the pantry has.
  await doing("sell").click();
  const sells = await shown(async () => ((await card("town").locator('.map-good[data-good="berries"]').textContent()) ?? "").includes(`🧺 ×${FULL_BERRIES}`) && (await titleOf(face("rose"))).startsWith("Sell berries: Rose. She is here, and begins at once"));
  check(`selling, the berries she has with her are shown, and her face says she begins at once (${await card("town").locator('.map-good[data-good="berries"]').textContent()}; ${await titleOf(face("rose"))})`, sells && (await face("evelyn").isDisabled()) && (await titleOf(face("evelyn"))).endsWith("There is none of it in the house to sell"));
  check(`…and what it would fetch is counted in lots (${await titleOf(card("town").locator(".map-card-brings"))})`, (await titleOf(card("town").locator(".map-card-brings"))) === `${FULL_BERRIES} lots of berries, at ${BERRY_PRICE} coin each: ${FULL_BERRIES * BERRY_PRICE} coin, when she is home`);
  await face("rose").click();
  await until(page, `game.asks.length > 0`);
  const sold = await asked("Rose has sold berries");
  const purse = (await read(page, `game.outings.find((o) => o.who === "rose").purse`)) as number;
  check(`…pressed, she sells them and asks again, with the coin in her purse (${purse})`, sold && purse === FULL_BERRIES * BERRY_PRICE);
  const coin = (await read(page, "game.coin")) as number;
  const herbs = (await read(page, "game.stock.herbs")) as number;
  await ask.locator('[data-told="home"]').click();
  const back = await until(page, `!game.outings.some((o) => o.who === "rose")`);
  check(`told to come home, she brings the coin (the shop sells its loaves the while, so the house has that much more at the least), and the herbs she did not sell (${coin} coin, then ${await read(page, "game.coin")})`, back && ((await read(page, "game.coin")) as number) >= coin + purse && (await read(page, "game.stock.herbs")) === herbs + FULL_HERBS);

  // Asking, she is answered first: her face on a place's card is disabled and says so. Selling what she has with her, with the return asked for beforehand, she sells and comes home without asking.
  await rules(page, `G.gather(game, "rose", "forest", { limit: 480, homeByBed: false })`);
  await until(page, `game.asks.length > 0`);
  await ask.waitFor({ timeout: SHOWN_MS });
  // (The town's card may be up still from before: a place pressed from the keyboard again is put away.)
  if ((await card("town").count()) === 0) {
    await page.locator('button[data-place="town"]').focus();
    await page.keyboard.press("Enter");
  }
  await card("town").waitFor({ timeout: SHOWN_MS });
  const answerFirst = await shown(async () => (await face("rose").isDisabled()) && (await titleOf(face("rose"))).endsWith("She is asking what she is to do next: answer her first"));
  check(`asking what next, her face on a place's card is disabled, and says she is to be answered first (${await titleOf(face("rose"))})`, answerFirst);
  await ask.locator('[data-told="stay"]').click();
  await card("forest").waitFor({ timeout: SHOWN_MS });
  await page.locator('button[data-place="town"]').click();
  await doing("go").click();
  await face("rose").click();
  await until(page, `game.asks.length > 0`);
  await ask.waitFor({ timeout: SHOWN_MS });
  await ask.locator('[data-told="stay"]').click();
  await card("town").waitFor({ timeout: SHOWN_MS });
  await doing("sell").click();
  await page.locator(".map-card .map-then").click();
  await face("rose").click();
  const comesHome = await until(page, `game.asks.length > 0 || !game.outings.some((o) => o.who === "rose")`);
  check("waiting in town, told to sell with the return asked for, she sells and comes home without asking", comesHome && (await read(page, "game.asks.length")) === 0 && (await until(page, `!game.outings.some((o) => o.who === "rose")`)) && ((await read(page, "game.coin")) as number) > 0);

  // Her time at something up; then sent from the card of the place she is waiting at, and stopped from her steps.
  await page.evaluate(`window.manor3d.map.open.set(true)`);
  await rules(page, `G.gather(game, "sage", "forest", { limit: 30, homeByBed: false })`);
  await until(page, `game.asks.length > 0`);
  check(`with her time at it up she asks, and says what it was (${await ask.getAttribute("aria-label")})`, await asked("Sage's time gathering is up"));
  await ask.locator('[data-told="stay"]').click();
  await card("forest").waitFor({ timeout: SHOWN_MS });
  await doing("explore").click();
  const atOnce = await shown(async () => (await titleOf(face("sage"))).startsWith("Explore: Sage. She is here, and begins at once"));
  await face("sage").click();
  const exploring = (await read(page, `(({ doing, arrive }) => doing + (arrive === game.clock ? " now" : ""))(game.outings.find((o) => o.who === "sage"))`)) as string;
  check(`from the card of the forest, where she waits, she is sent to explore it and begins at once (${exploring})`, atOnce && exploring === "explore now");
  // (Her steps are in the list of the household, which the map lies over: it is shut to press them.)
  await page.evaluate(`window.manor3d.map.open.set(false)`);
  const doStep = steps("Sage").locator('button[data-step="do"]');
  const cancels = await shown(async () => (await titleOf(doStep)) === "Explore the forest: under way. Press to cancel it: she stops, and asks what next");
  check(`her steps in the list: the walk done, exploring under way, and the walk home not asked for (${await steps("Sage").locator("[data-step]").evaluateAll((nodes) => nodes.map((node) => `${(node as HTMLElement).dataset.step} ${node.className}`).join("; "))})`, cancels && ((await steps("Sage").locator('[data-step="walk"]').getAttribute("class")) ?? "").includes("done") && ((await steps("Sage").locator('[data-step="home"]').getAttribute("class")) ?? "").includes("unlit"));
  await doStep.click();
  check(`pressing what she is doing cancels it: she stops, and asks why (${await ask.getAttribute("aria-label")})`, await asked("Sage has stopped exploring"));
  await ask.locator('[data-told="home"]').click();
  await until(page, `!game.outings.some((o) => o.who === "sage")`);

  // A place not yet found is never named: sent there first, only to go, she is bound for "a place not yet visited", and finds it.
  await page.evaluate(`window.manor3d.map.open.set(true)`);
  await page.locator('button[data-place="lake"]').click();
  await doing("go").click();
  await face("sage").click();
  await until(page, `game.outings.some((o) => o.who === "sage" && o.state === "away")`);
  const bound = await shown(async () => ((await token("sage").getAttribute("aria-label")) ?? "").startsWith("Sage, on the way to a place not yet visited"));
  const dial = (await page.locator(".dial").getAttribute("aria-label")) ?? "";
  check(`sent only to go to a place not yet visited, she is said to be bound for one, by her token and the dial, and the lake is not named (${await token("sage").getAttribute("aria-label")})`, bound && ((await token("sage").getAttribute("aria-label")) ?? "").includes("with nothing chosen to do there") && !dial.toLowerCase().includes("lake") && dial.includes("a place not yet visited"));
  await until(page, `game.asks.length > 0`);
  check(`…there, she has found it, and asks (${await ask.getAttribute("aria-label")})`, await asked("Sage has found the lake"));
  await ask.locator('[data-told="home"]').click();

  // Sent only to go to a place not yet found with only going there queued after it: on finding it she asks, and going on is not offered, there being nothing to go on to. (The lake forgotten again, to be found a second time; and no scene, which the second morning would bring, to stand in the way.)
  await until(page, `!game.outings.some((o) => o.who === "sage")`);
  await rules(page, `(G.SCENES.forEach((s) => game.seen.push(s.id)), game.places.lake = "unknown", G.goTo(game, "rose", "lake", { limit: 480, homeByBed: false, thenHome: false }), G.enqueue(game, "rose", { to: "lake", doing: null }, { limit: 480, homeByBed: false, thenHome: false }))`);
  await until(page, `game.asks.some((a) => a.who === "rose")`);
  const foundAgain = await asked("Rose has found the lake");
  const ends = await ask.locator(".map-ask-choice").evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.told).join());
  check(`with only going where she is queued, on finding the place she asks, and going on is not on the question (${await ask.getAttribute("aria-label")}: ${ends})`, foundAgain && ends === "stay,home");
  // A question that names no step it is stuck on is still put, in a line, and nothing throws.
  const thrown = errors.length;
  await page.evaluate(`(() => { const { game } = window.manor3d; game.asks[0] = { who: "rose", place: "lake", why: "stuck", stuck: { why: "nothing" } }; })()`);
  const cannot = await asked("Rose cannot go on");
  check(`a stuck question with no step named is still put on the map, saying she cannot go on (${await ask.getAttribute("aria-label")})`, cannot && errors.length === thrown);
  await ask.locator('[data-told="home"]').click();

  // Sent from the card to explore a place not yet found (the playtest of 2026-11-17, 1.2): on finding it she asks, the question has ⏭️, and her steps still show the exploring after her asking; ⏭️ sets her to it.
  await until(page, `!game.outings.some((o) => o.who === "rose")`);
  await rules(page, `game.places.lake = "unknown"`);
  if ((await card("lake").count()) === 0) await page.locator('button[data-place="lake"]').click();
  await card("lake").waitFor({ timeout: SHOWN_MS });
  await doing("explore").click();
  await face("rose").click();
  await until(page, `game.asks.some((a) => a.who === "rose")`);
  const carried = await asked("Rose has found the lake");
  const goesOnWith = await ask.locator(".map-ask-choice").evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.told).join());
  const stepsSay = (): Promise<string> => steps("Rose").locator("[data-step]").evaluateAll((nodes) => nodes.map((node) => `${(node as HTMLElement).dataset.step}${node.textContent}`).join(" "));
  const stillShown = await shown(async () => /ask\S* then🧭/.test(await stepsSay()));
  check(`sent to explore a place not yet found, on finding it she asks with ⏭️ to go on, and her steps still show the exploring after her asking (${goesOnWith}; ${await stepsSay()})`, carried && goesOnWith === "stay,on,home" && stillShown);
  await ask.locator('[data-told="on"]').click();
  check("…⏭️ sets her to explore it", await shown(async () => (await read(page, `game.outings.find((o) => o.who === "rose")?.doing`)) === "explore"));
  await rules(page, `G.callHome(game, "rose")`);

  check(`what next throws no errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, errors.length === 0);
  await page.close();
};
