// The checks of the 3D demo page that are about several people sent out together: the 👥 toggle
// on a place's card, with which faces pressed are chosen and the ▶ button sends them as one
// party; the party on the map, its faces together with one slip; its one question, naming them
// all; her menu's Return home, which calls the party home; and each one's steps in the list of
// the household. Run by check3d.ts.
import type { Page } from "@playwright/test";

import { read, rules, runUntil, shown as shownWithin, titleOf } from "./check3d-kit";
import type { Checks } from "./check3d-kit";

/** Seconds of the house's time run at a go while something is waited for, and how many goes at the most. */
const STEP = 5;
const STEPS = 400;
/** How long the page is given to show something that is waited for: its cards are read again a few times a second. */
const SHOWN_MS = 5000;
const POLL_MS = 100;
/** How far apart, in pixels, the faces of a party stand at the most: closer than two people who only stand at the same point. */
const PARTY_APART_PX = 24;
/** The berries in a full basket from the forest. */
const FULL_BERRIES = 9;
/** What a pair of gloves costs: more than the house has left once flour (twelve) is paid for, and no more than it has with that back. */
const GLOVES_PRICE = 20;

/** Run the house on, in the page, until something is so: a script with `h` and `game`. */
const until = (page: Page, so: string): Promise<boolean> => runUntil(page, so, { step: STEP, steps: STEPS });
/** Wait until something on the page is so, for as long as the page is given to show it. */
const shown = (so: () => Promise<boolean>): Promise<boolean> => shownWithin(so, { ms: SHOWN_MS, poll: POLL_MS });

export const checkParty = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // (Opened with the map centred in what the panel leaves, not on the window as a first visit has it: on a window this wide the forest would lie under the panel, where it cannot be pressed. check3d-map-panel.ts looks at the first visit's way.)
  await page.goto(`${base}demo3d.html?help=0&view=ground&centre=0`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  // (The forest and what grows in it found; nobody bakes or keeps the shop, so that whoever is chosen can go.)
  await rules(page, `(game.places.forest = "found", game.finds.forest = ["berries", "herbs"], G.assign(game, "evelyn", null), G.assign(game, "rose", null))`);
  await page.evaluate(`window.manor3d.paused.set(true)`);
  await page.evaluate(`window.manor3d.map.open.set(true)`);
  await page.locator('button[data-place="forest"]').click();
  const card = page.locator('.map-card[data-card="forest"]');
  await card.waitFor({ timeout: SHOWN_MS });
  const face = (who: string) => card.locator(`.who[data-who="${who}"]`);
  const together = card.locator('[data-mode="together"]');
  const then = card.locator('[data-mode="then"]');
  const send = card.locator('[data-send="party"]');
  const token = (who: string) => page.locator(`.map-token[data-who="${who}"]`);
  const ask = page.locator(".map-ask");
  const outing = (who: string, field: string): Promise<unknown> => read(page, `game.outings.find((o) => o.who === "${who}")?.${field}`);

  await card.locator('.map-doing[data-doing="gather"]').click();
  const hidden = (await send.isHidden()) && (await together.getAttribute("aria-pressed")) === "false";
  await together.click();
  const lit = await shown(async () => (await together.getAttribute("aria-pressed")) === "true" && (await send.isVisible()) && (await send.isDisabled()) && (await then.isDisabled()));
  check(`👥 on a place's card is unlit, and no Send is in the page; lit, Send is there, disabled until someone is chosen, and ➕ is put by (${await titleOf(send)})`, hidden && lit && (await titleOf(send)).endsWith("Choose who is to go, by her face"));
  await face("rose").click();
  await face("sage").click();
  await face("sage").click();
  await face("sage").click();
  const chosen = await shown(async () => (await face("rose").getAttribute("aria-pressed")) === "true" && (await face("sage").getAttribute("aria-pressed")) === "true" && (await send.isEnabled()) && (await send.textContent()) === "▶2");
  check(`…faces pressed are chosen, and pressed again are not; Send says how many and whom (${await titleOf(send)})`, chosen && (await titleOf(send)) === "Send Rose and Sage together, as one party" && (await read(page, "game.outings.length")) === 0);
  await send.click();
  const sent = (await outing("rose", "party.join()")) === "rose,sage" && (await outing("sage", "party.join()")) === "rose,sage";
  check("Send sends them as one party, and none is chosen any more", sent && (await shown(async () => (await face("rose").getAttribute("aria-pressed")) !== "true")));
  check("…and 👥 goes unlit once the party is sent: the next card sends each alone", await shown(async () => (await together.getAttribute("aria-pressed")) === "false" && (await send.isHidden())));
  // (Lit again, to see that the card Stay puts up is never in together mode.)
  if ((await together.getAttribute("aria-pressed")) === "false") await together.click();
  await card.locator(".map-card-close").click();

  // On the map, one party: their faces close together, one slip, one tooltip naming them all.
  await until(page, `game.outings.every((o) => o.state === "away" && o.left !== null)`);
  await page.evaluate(`window.manor3d.advance(${STEP})`);
  const drawn = await shown(async () => (await token("rose").count()) === 1 && (await token("sage").count()) === 1);
  const [a, b] = [await token("rose").boundingBox(), await token("sage").boundingBox()];
  const close = a !== null && b !== null && Math.hypot(a.x - b.x, a.y - b.y) < PARTY_APART_PX;
  const slips = `${await token("rose").locator(".map-token-status").textContent()}|${await token("sage").locator(".map-token-status").textContent()}`;
  check(`on the map the party is drawn as one: faces close together, ringed alike, one slip under the first, one tooltip naming both (${await token("rose").getAttribute("aria-label")}; ${slips})`, drawn && close && (await token("sage").getAttribute("class"))?.includes("party") === true && slips.endsWith("|") && slips.length > 1 && ((await token("sage").getAttribute("aria-label")) ?? "").startsWith("Rose and Sage, "));

  // One question, naming them both.
  await until(page, `game.asks.length > 0`);
  const asked = await shown(async () => (await ask.count()) === 1 && (await ask.getAttribute("aria-label")) === "Rose and Sage's baskets are full");
  check(`they ask once, as a party, with both faces (${await ask.getAttribute("aria-label")})`, asked && (await ask.locator(".map-ask-faces .map-face").count()) === 2 && (await read(page, "game.asks.length")) === 1);
  await ask.locator('[data-told="stay"]').click();
  const stayCard = page.locator('.map-card[data-card="forest"]');
  // (Their baskets are full: exploring is what can be done there now.)
  await stayCard.locator('.map-doing[data-doing="explore"]').click();
  const alone = await shown(async () => (await stayCard.locator('[data-mode="together"]').getAttribute("aria-pressed")) === "false" && (await stayCard.locator('.who[data-who="sage"]').isEnabled()));
  check(`told to stay, the card put up is not in together mode, and her face gives her something to do there (${await titleOf(stayCard.locator('.who[data-who="sage"]'))})`, alone);
  // (The forest's card is put up, to give them something to do there: it is put away to reach their faces.)
  await page.locator(".map-card .map-card-close").click();
  const waiting = (await outing("rose", "waits")) === true && (await outing("sage", "waits")) === true;

  // Each has her steps in the list of the household; her menu's Return home calls the party home.
  await token("sage").click();
  await page.locator('.map-token-menu [data-item="home"]').click();
  check("told to stay, both wait; Return home on one's menu calls the party home", waiting && (await outing("rose", "homeward")) === true && (await outing("sage", "homeward")) === true);
  await page.evaluate(`window.manor3d.map.open.set(false)`);
  const steps = async (who: string): Promise<boolean> => (await page.locator(".person", { hasText: who }).locator(".steps").locator('[data-step="home"]').count()) === 1;
  check("…and each has her own steps in the list of the household", await shown(async () => (await steps("Rose")) && (await steps("Sage"))));
  const home = await until(page, `game.outings.length === 0`);
  check(`each comes in and puts away her own basket: two baskets' worth (${await read(page, "game.stock.berries")} berries)`, home && (await read(page, "game.stock.berries")) === 2 * FULL_BERRIES);

  // A party on its way to buy flour, re-sent from the town's card for gloves, which the price of the flour coming back pays for: either face can be pressed, and says so, and pressed sends the party.
  await rules(page, `(game.shops.push("miller", "clothes"), game.coin = ${GLOVES_PRICE}, G.sendParty(game, ["rose", "sage"], { to: "town", doing: "buy", ware: "flour" }, G.USUAL_TERMS))`);
  await until(page, `game.outings.every((o) => o.state === "away")`);
  await page.evaluate(`window.manor3d.map.open.set(true)`);
  await page.locator('button[data-place="town"]').click();
  const town = page.locator('.map-card[data-card="town"]');
  await town.waitFor({ timeout: SHOWN_MS });
  if ((await town.locator('[data-mode="together"]').getAttribute("aria-pressed")) === "true") await town.locator('[data-mode="together"]').click();
  await town.locator('.map-doing[data-doing="buy"]').click();
  await town.locator('.map-shop[data-shop="clothes"]').click();
  await town.locator('.map-ware[data-ware="gloves"]').click();
  const townFace = (who: string) => town.locator(`.who[data-who="${who}"]`);
  const both = await shown(async () => (await townFace("rose").isEnabled()) && (await townFace("sage").isEnabled()));
  check(`a party on its way to buy, on the town's card: gloves it can pay for with the flour's price back can be sent for from either face, the one who did not pay as well (${await titleOf(townFace("sage"))})`, both);
  await townFace("sage").click();
  check(`…pressed, the party is sent for the gloves, and the price of the flour paid for them (${await read(page, "game.coin")} coin)`, (await outing("rose", "buys")) === "gloves" && (await outing("sage", "buys")) === "gloves" && (await read(page, "game.coin")) === 0);
  await rules(page, `G.callHome(game, "rose")`);
  await until(page, `game.outings.length === 0`);

  check(`no errors on the page${errors.length ? `: ${errors.join(" | ")}` : ""}`, errors.length === 0);
  await page.close();
};
