// The checks of the 3D demo page that are about the card at the right for whoever is being
// followed: who she is, the loaves she has baked, and what she is carrying. Run by check3d.ts.
import type { Browser, Page } from "@playwright/test";

import { pageTime, shown } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** Time for the card to be read again from the game: it is looked to a few times a second. */
const READ_MS = 500;
/** Seconds of the house's time run at a go while something is waited for, and how many goes at the most. */
const STEP = 1;
const STEPS = 200;

const until = async (page: Page, so: string): Promise<boolean> => {
  for (let n = 0; n < STEPS; n++) {
    if (await page.evaluate(`(() => { const { game, world } = window.manor3d; return ${so}; })()`)) return true;
    await page.evaluate(`window.manor3d.advance(${STEP})`);
  }
  return false;
};

export const checkCharacter = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${base}demo3d.html?help=0&view=ground`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  await page.evaluate(`(() => { window.manor3d.paused.set(true); window.manor3d.game.shelf.bread = 0; })()`);
  const card = page.locator(".character-card");
  const stats = (): Promise<string[]> => card.locator(".character-stat").evaluateAll((rows) => rows.map((row) => row.getAttribute("aria-label") ?? ""));
  /** One of her rows, by what it is of: what it says, and what is drawn on it. */
  const says = async (row: "mastery" | "carrying"): Promise<string> => (await card.locator(`.character-${row}`).getAttribute("aria-label")) ?? "";
  const drawn = async (row: "mastery" | "carrying"): Promise<string> => (await card.locator(`.character-${row}`).textContent()) ?? "";
  /** How strongly the mastery's star is drawn: faint until it is earned. */
  const starShown = (): Promise<string> => card.locator(".character-star").evaluate((star) => getComputedStyle(star).opacity);

  check("nobody followed, there is no card", (await card.count()) === 0);
  await page.keyboard.press("1");
  await pageTime(page, READ_MS);
  const box = await card.boundingBox();
  check(`following someone puts her card at the right: her face, her name (${await card.locator(".character-name").textContent()})`, box !== null && box.x > viewport.width / 2 && box.x + box.width <= viewport.width && (await card.locator(".character-name").textContent()) === "Evelyn" && (await card.locator(".character-face").count()) === 1);
  check(`…and what she is carrying; with no loaf baked yet there is no mastery on it at all (${(await stats()).join(" | ")})`, (await stats()).length === 1 && (await says("carrying")) === "Carrying nothing" && (await card.locator(".character-heading").count()) === 0 && (await card.locator(".character-mastery").count()) === 0);

  // She bakes a batch: her arms are full on the way to the shelf, and the loaves are hers once they are on it.
  const carries = await until(page, `game.tasks.evelyn?.has === "bread"`);
  await pageTime(page, READ_MS);
  check(`with a batch out of the oven she is carrying four loaves (${await says("carrying")})`, carries && (await says("carrying")) === "Carrying: bread ×4" && (await drawn("carrying")).includes("🍞 ×4"));
  const set = await until(page, `game.baked.evelyn === 4`);
  await pageTime(page, READ_MS);
  check(`set on the shelf, they are four loaves baked, and her hands are free (${(await stats()).join(" | ")})`, set && (await says("mastery")).startsWith("Loaves baked: 4 of") && (await drawn("mastery")) === "⭐🥖4 / 100" && (await says("carrying")) === "Carrying nothing");
  // What she is mastering is at the foot of the card, under a heading of its own, with a star that is faint until it is earned.
  const order = await card.evaluate((node) => [...node.children].map((child) => child.className.split(" ").pop() ?? ""));
  check(`what she is mastering is at the foot, under "Mastery": a faint star, the loaf, and how far she has got (${order.join(" > ")}; ${await drawn("mastery")}; star ${await starShown()})`, order.join() === "character-top,character-carrying,character-heading,character-mastery" && (await card.locator(".character-heading").textContent()) === "Mastery" && (await drawn("mastery")) === "⭐🥖4 / 100" && Number(await starShown()) < 0.5);
  // The mastery earned: the star is lit, and the count is the loaves alone.
  await page.evaluate(`window.manor3d.dev.run("mastery")`);
  await pageTime(page, READ_MS);
  check(`once she has the mastery its star is lit, and the count is her loaves alone (${await drawn("mastery")}; star ${await starShown()}; ${await says("mastery")})`, (await starShown()) === "1" && /^⭐🥖\d+$/.test(await drawn("mastery")) && (await says("mastery")).endsWith("She has the mastery of bread"));

  // The Master is taller in his picture than the maids are in theirs: his face is cut from higher up it, so that it is his face.
  const cutAt = (): Promise<string> => card.locator(".character-face").evaluate((face) => (face as HTMLElement).style.backgroundPositionY);
  const maidsCut = await cutAt();
  // (The Master is followed by the backtick: person-keys.ts.)
  await page.keyboard.press("`");
  await pageTime(page, READ_MS);
  check(`each face is cut from where that figure's head is: the Master's from higher up his picture than a maid's (${await cutAt()}, against ${maidsCut})`, (await card.locator(".character-name").textContent()) === "The Master" && parseFloat(await cutAt()) < parseFloat(maidsCut) - 5 && Math.abs(parseFloat(maidsCut) - 15.87) < 0.1 && Math.abs(parseFloat(await cutAt()) - 5.95) < 0.1);
  await page.keyboard.press("2");
  await pageTime(page, READ_MS);
  check("following someone else, the card is hers", (await card.count()) === 1 && (await card.locator(".character-name").textContent()) === "Rose" && (await says("mastery")).startsWith("Loaves baked: "));
  // A customer has a card too, with no loaves to her name.
  await until(page, `world.actors.some((a) => a.id.startsWith("customer-"))`);
  await page.evaluate(`window.manor3d.following.set(window.manor3d.world.actors.find((a) => a.id.startsWith("customer-")).id)`);
  await pageTime(page, READ_MS);
  check(`a customer followed has a card too, which says only what she carries (${(await stats()).join(" | ")})`, (await card.locator(".character-name").textContent()) === "A customer" && (await stats()).length === 1 && (await says("carrying")).startsWith("Carrying") && (await card.locator(".character-heading").count()) === 0);
  // With the dev menu unlocked, a mastery not yet begun on is shown for one of the household, and a right-click earns it.
  // (Sage and Rose are as they were on the first morning, with no loaf to their names: everyone was made a master above.)
  await page.evaluate(`(() => { const { game } = window.manor3d; game.baked.sage = 0; game.baked.rose = 0; })()`);
  await page.keyboard.press("3");
  await pageTime(page, READ_MS);
  const before = await card.locator(".character-mastery").count();
  await page.evaluate(`window.manor3d.dev.unlocked.set(true)`);
  await pageTime(page, READ_MS);
  check(`with the dev menu unlocked, the mastery of someone who has baked nothing is on her card all the same, at nothing of what earns it (${await drawn("mastery")})`, before === 0 && (await drawn("mastery")) === "⭐🥖0 / 100" && (await starShown()) !== "1");
  await card.locator(".character-mastery").hover();
  check(`…and its tooltip says what a right-click would do (${await card.locator(".character-mastery").getAttribute("title")})`, ((await card.locator(".character-mastery").getAttribute("title")) ?? "").endsWith("Right-click to reveal: the mastery of bread, for her"));
  await card.locator(".character-mastery").click({ button: "right" });
  await shown(async () => (await starShown()) === "1");
  check(`a right-click on it earns it: its star is lit, and she is a master in the game (${await drawn("mastery")})`, (await starShown()) === "1" && /^⭐🥖\d+$/.test(await drawn("mastery")) && (await page.evaluate(`import("/src/game/index.ts").then(({ isMaster }) => isMaster(window.manor3d.game, window.manor3d.following.peek()))`)) === true);
  await page.evaluate(`window.manor3d.dev.unlocked.set(false)`);
  await page.keyboard.press("2");
  await pageTime(page, READ_MS);
  check("locked again, someone who has baked nothing has no mastery on her card", (await card.locator(".character-mastery").count()) === 0);
  await page.keyboard.press("Escape");
  await pageTime(page, READ_MS);
  check(`let go, the card is gone${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, (await card.count()) === 0 && errors.length === 0);
  await page.close();
};
