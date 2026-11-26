// The check of the 3D demo page that is about time after ✋ on "What next?": told to stay, she is to be given something to do from the
// card that is put up, and time goes on standing still until she is given it, or the card is put away, or the map shut
// (src/demo3d/stay-hold.ts). The page's own clock is left running here, as a player has it: that is what is looked at. Run by check3d.ts.
import type { Page } from "@playwright/test";

import { Locators, noErrors, openPage, pageTime, read, rules, runUntil, shown } from "./check3d-kit";
import type { Checks } from "./check3d-kit";

/** Seconds of the house's time run at a go while she is waited for, and how many goes at the most. */
const STEP = 5;
const STEPS = 300;
/** How long the clock is watched for, to see whether it stands or runs: of the page's own time, at its usual speed a little under a minute of the house's. */
const WATCHED_MS = 800;
/** The least the house's clock moves, in minutes, when it runs for as long as it is watched. */
const RUNS_BY = 0.2;

const clock = (page: Page): Promise<number> => read(page, "game.clock") as Promise<number>;
const staying = (page: Page): Promise<boolean> => page.evaluate(`window.manor3d.map.staying.peek()`) as Promise<boolean>;
/** How far the house's clock moves while it is watched. */
const moved = async (page: Page): Promise<number> => {
  const before = await clock(page);
  await pageTime(page, WATCHED_MS);
  return (await clock(page)) - before;
};
/** Whether the clock looks held: the play sign faint, and no speed lit. */
const looksHeld = (page: Page): Promise<boolean> => page.evaluate(`document.querySelector(".pill-top .held") !== null && document.querySelector('.pill-top [aria-pressed="true"]') === null`) as Promise<boolean>;

export const checkStay = async (checks: Checks): Promise<void> => {
  const { check } = checks;
  const { page, errors } = await openPage(checks, "help=0&view=ground&centre=0", { paused: false });
  const { ask, told, card, doing, face } = Locators(page);
  /** She is sent only to go to town, and the clock run on until she asks there: the map is opened on her question. */
  const asksInTown = async (): Promise<boolean> => (await runUntil(page, "game.asks.length > 0", { step: STEP, steps: STEPS })) && (await shown(async () => (await ask.count()) === 1));

  await rules(page, `(G.assign(game, "evelyn", null), G.goTo(game, "sage", "town"))`);
  const asked = await asksInTown();
  const whileAsked = await moved(page);
  await told("stay").click();
  const held = await shown(async () => (await staying(page)) && (await card("town").count()) === 1);
  const whileHeld = await moved(page);
  check(`told to stay on a running clock, time goes on standing still while the card put up for her is there (the clock moved ${whileAsked.toFixed(2)} min while she asked, ${whileHeld.toFixed(2)} after)`, asked && held && whileAsked === 0 && whileHeld === 0);
  check("…and the clock shows it as it shows a question waiting: its play sign faint, and no speed lit", await looksHeld(page));

  // The card put away, she is left waiting, and time runs.
  await card("town").locator(".map-card-close").click();
  const letGo = await shown(async () => !(await staying(page)));
  const afterShut = await moved(page);
  check(`the card put away, she is left waiting and time runs on (${afterShut.toFixed(2)} min while watched; she ${(await read(page, `game.outings.find((o) => o.who === "sage")?.waits`)) ? "waits" : "does not wait"})`, letGo && afterShut > RUNS_BY && !(await looksHeld(page)));

  // Asking again, and told to stay again: given something to do from the card, time runs with her at it.
  await rules(page, `G.tell(game, "sage", "home")`);
  await runUntil(page, `!game.outings.some((o) => o.who === "sage")`, { step: STEP, steps: STEPS });
  await rules(page, `G.goTo(game, "sage", "town")`);
  const askedAgain = await asksInTown();
  await told("stay").click();
  const heldAgain = await shown(async () => (await staying(page)) && (await card("town").count()) === 1);
  await doing("explore").click();
  await face("sage").click();
  const sent = await shown(async () => !(await staying(page)));
  const afterSent = await moved(page);
  check(`given something to do from the card, time runs on with her at it (${afterSent.toFixed(2)} min while watched; she is at: ${String(await read(page, `game.outings.find((o) => o.who === "sage")?.doing`))})`, askedAgain && heldAgain && sent && afterSent > RUNS_BY && (await read(page, `game.outings.find((o) => o.who === "sage")?.doing`)) === "explore");

  // …and the map shut on a card still up is the card put away.
  await rules(page, `(game.asks.length > 0 || G.tell(game, "sage", "home"))`);
  await runUntil(page, `!game.outings.some((o) => o.who === "sage") || game.asks.length > 0`, { step: STEP, steps: STEPS });
  if ((await read(page, "game.asks.length")) === 0) {
    await rules(page, `G.goTo(game, "sage", "town")`);
    await asksInTown();
  }
  await shown(async () => (await ask.count()) === 1);
  await told("stay").click();
  const heldThird = await shown(async () => staying(page));
  await page.evaluate(`window.manor3d.map.open.set(false)`);
  const shut = await shown(async () => !(await staying(page)));
  const afterMapShut = await moved(page);
  check(`the map shut with her card still up, time runs on (${afterMapShut.toFixed(2)} min while watched)`, heldThird && shut && afterMapShut > RUNS_BY);
  noErrors(check, errors, "the time held for someone told to stay throws no errors");
  await page.close();
};
