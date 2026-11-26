// The checks of the 3D demo page that are about calling someone out of doors: a question put
// aside and brought back from the clock or her row; the return asked for beforehand, from a
// place's card and from her steps; her menu on the map, with Return home, from the road and from
// a place; and three small things beside them: the faster speeds on the clock in dev mode, the
// Master's key and the dev menu's, and the work cards for someone who is out. Run by check3d.ts.
import type { Page } from "@playwright/test";

import { pageTime, read, rules, runUntil, shown as shownWithin, titleOf } from "./check3d-kit";
import type { Checks } from "./check3d-kit";
import { COUNT_LAYOUT_READS, countFrom, counted } from "./check3d-layout";
import { KEEP_LISTENERS, heldOnGone } from "./check3d-listeners";

/** Seconds of the house's time run at a go while something is waited for, and how many goes at the most. */
const STEP = 5;
const STEPS = 300;
/** How long the page is given to show something that is waited for: it is read again from the game a few times a second. */
const SHOWN_MS = 5000;
const POLL_MS = 100;
/** How long the page is watched for, and how long her walk is let run while her menu is up (seconds of the house's time). */
const LOOKED_MS = 1000;
const WALKED_S = 20;
/** Long enough for the map to have been opened again of itself, were it going to be. */
const LEFT_SHUT_MS = 1200;

/** Run the house on, in the page, until something is so: a script with `h` and `game`. */
const until = (page: Page, so: string): Promise<boolean> => runUntil(page, so, { step: STEP, steps: STEPS });
/** Wait until something on the page is so, for as long as the page is given to show it. */
const shown = (so: () => Promise<boolean>): Promise<boolean> => shownWithin(so, { ms: SHOWN_MS, poll: POLL_MS });

export const checkCall = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(KEEP_LISTENERS);
  await page.addInitScript(COUNT_LAYOUT_READS);
  // (Opened with the map centred in what the panel leaves, not on the window as a first visit has it: on a window this wide the forest would lie under the panel, where it cannot be pressed. check3d-map-panel.ts looks at the first visit's way.)
  await page.goto(`${base}demo3d.html?help=0&view=ground&centre=0`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  await rules(page, `(game.shops.push("miller", "greengrocer", "books", "herbalist", "clothes"), game.places.forest = "found", game.finds.forest = ["berries", "herbs"], game.coin = 200)`);
  await page.evaluate(`window.manor3d.paused.set(true)`);
  const map = page.locator(".map-frame");
  const ask = page.locator(".map-ask");
  const mark = page.locator(".pill-ask");
  const token = (who: string) => page.locator(`.map-token[data-who="${who}"]`);
  const menu = page.locator(".map-token-menu");
  const home = menu.locator('[data-item="home"]');
  const steps = (who: string) => page.locator(".person", { hasText: who }).locator(".steps");
  /** Whether the walk home is queued after what she is at (the rules' `queue`): the return asked for beforehand. */
  const HOME_QUEUED = `queue.some((next) => next.to === "manor")`;
  const outing = (who: string, field: string): Promise<unknown> => read(page, `game.outings.find((o) => o.who === "${who}")?.${field}`);

  // A question put aside stays aside: the clock says someone is waiting, and brings it back.
  await rules(page, `G.sendToTown(game, "sage")`);
  await until(page, `game.asks.length > 0`);
  const opened = await shown(async () => (await map.count()) === 1 && (await ask.count()) === 1);
  await page.keyboard.press("Escape");
  await pageTime(page, LEFT_SHUT_MS);
  const aside = (await map.count()) === 0;
  check(`she asks, and the map is opened on her question; shut, it stays shut (${aside})`, opened && aside);
  // (Time is let run: held by her question, it stands still all the same, and the clock is to say so.)
  await page.evaluate(`window.manor3d.paused.set(false)`);
  const pause = page.locator('.pill-top .pill-glyph');
  const lit = await page.locator('.pill-button[aria-label^="Speed"][aria-pressed="true"]').count();
  const marked = await shown(async () => (await mark.isVisible()) && (await titleOf(mark)).startsWith("Sage is waiting to be told what next, and time stands still"));
  check(`…by the clock a mark says she is waiting, and the clock does not look as though time were running: the play sign, held, and no speed lit (${await titleOf(mark)}; ${await pause.textContent()})`, marked && (await pause.textContent()) === "▶" && ((await pause.getAttribute("class")) ?? "").includes("held") && lit === 0);
  check(`…and the play sign is not named Pause: its name says first that time stands still (${await pause.getAttribute("aria-label")})`, ((await pause.getAttribute("aria-label")) ?? "").startsWith("Time stands still"));
  await page.evaluate(`window.manor3d.paused.set(true)`);
  await mark.click();
  check("pressed, the mark opens the map on her question", await shown(async () => (await map.count()) === 1 && (await ask.count()) === 1));
  await page.keyboard.press("Escape");
  await pageTime(page, LEFT_SHUT_MS);
  check(`…and her row says she is asking, and her name brings it back too (${await page.locator(".person", { hasText: "Sage" }).locator(".doing").getAttribute("title")})`, (await map.count()) === 0 && ((await page.locator(".person", { hasText: "Sage" }).locator(".doing").getAttribute("title")) ?? "").includes("press her name to see her question"));
  await page.locator(".person", { hasText: "Sage" }).locator(".follow").click();
  check("…pressed, her name opens the map on it", await shown(async () => (await ask.count()) === 1));
  await ask.locator('[data-told="home"]').click();
  check("answered, the mark is gone", await shown(async () => (await mark.isHidden()) && (await ask.count()) === 0));
  await until(page, `game.outings.length === 0`);

  // The return asked for beforehand: from the place's card, unlit until pressed and put out once she is sent; and from her steps.
  await page.evaluate(`window.manor3d.following.set(null)`);
  await page.evaluate(`window.manor3d.map.open.set(true)`);
  await page.locator('button[data-place="forest"]').click();
  await page.locator('.map-doing[data-doing="go"]').click();
  const then = page.locator(".map-then");
  const face = page.locator('.map-card .who[data-who="rose"]');
  const unlitSays = await shown(async () => (await titleOf(face)).endsWith("Go: Rose. She asks what to do when she is there"));
  const before = `${await then.getAttribute("aria-pressed")} ${await titleOf(face)}`;
  const unlit = (await then.getAttribute("aria-pressed")) === "false" && unlitSays;
  await then.click();
  const litNow = await shown(async () => (await then.getAttribute("aria-pressed")) === "true" && /Go: Rose\. Back by \d\d:\d\d at the latest$/.test(await titleOf(face)));
  check(`the house chip on a place's card is unlit until pressed; lit, her face says when she would be back (${before}; then ${await titleOf(face)})`, unlit && litNow);
  check("…and lit, the chip is drawn lit: its picture says so, beside what its label says", ((await then.getAttribute("class")) ?? "").split(" ").includes("on"));
  await face.click();
  check("sent, she is to come home without asking, and the chip is put out again for the next", (await outing("rose", HOME_QUEUED)) === true && (await then.getAttribute("aria-pressed")) === "false");
  // (Her steps are in the list of the household, which the map lies over: it is shut to press them.)
  await page.evaluate(`window.manor3d.map.open.set(false)`);
  const homeStep = steps("Rose").locator('button[data-step="home"]');
  await homeStep.waitFor({ timeout: SHOWN_MS });
  const stepLit = (await homeStep.getAttribute("aria-pressed")) === "true";
  await homeStep.click();
  const off = (await outing("rose", HOME_QUEUED)) === false && (await shown(async () => (await homeStep.getAttribute("aria-pressed")) === "false" && (await page.locator(".dial-plan-walk.open").count()) === 1));
  check(`her walk home is lit in her steps; pressed, it is asked for no longer, and the dial draws her outing with its end not known (${await titleOf(homeStep)})`, stepLit && off);
  await homeStep.click();
  check("…pressed again, it is asked for again", (await outing("rose", HOME_QUEUED)) === true && (await shown(async () => (await homeStep.getAttribute("aria-pressed")) === "true")));
  const wentAndCame = await until(page, `game.asks.length > 0 || !game.outings.some((o) => o.who === "rose")`);
  check("with it asked for, she goes there, and comes home again without asking", wentAndCame && (await read(page, "game.asks.length")) === 0);

  // Her menu on the map: from the road.
  await page.evaluate(`window.manor3d.map.open.set(true)`);
  await rules(page, `G.goTo(game, "sage", "lake")`);
  await until(page, `game.outings.some((o) => o.who === "sage" && o.state === "away")`);
  await token("sage").waitFor({ timeout: SHOWN_MS });
  await token("sage").click();
  const up = await shown(async () => (await menu.count()) === 1 && (await home.isEnabled()));
  const [faceBox, menuBox] = [await token("sage").boundingBox(), await menu.boundingBox()];
  check(`pressing her face on the map puts up her menu under it, with Return home (${await home.textContent()})`, up && (await home.textContent()) === "🏠Return home" && faceBox !== null && menuBox !== null && menuBox.y > faceBox.y + faceBox.height);
  // While it is up the map does not ask the page where anything is drawn, frame after frame: it knows where her face is from where it put it.
  await countFrom(page);
  await pageTime(page, LOOKED_MS);
  const asked = await counted(page);
  check(`…and while it is up, the map does not lay the page out every frame to set it by her face (${asked.reads} reads in ${asked.frames} frames)`, asked.frames > 0 && asked.reads < asked.frames / 2);
  // It goes with her as she goes.
  await page.evaluate(`window.manor3d.advance(${WALKED_S})`);
  // (Drawn on the next frame, which a loaded machine may be slow to draw.)
  await shown(async () => Math.abs(((await token("sage").boundingBox())?.x ?? 0) - (faceBox?.x ?? 0)) > 1);
  await pageTime(page, LOOKED_MS);
  const [walkedFace, walkedMenu] = [await token("sage").boundingBox(), await menu.boundingBox()];
  check(`…and it keeps under her face as she walks (face ${walkedFace?.x.toFixed(0)}→${(faceBox?.x ?? 0).toFixed(0)}, menu ${walkedMenu?.x.toFixed(0)})`, faceBox !== null && walkedFace !== null && walkedMenu !== null && Math.abs(walkedFace.x - faceBox.x) > 1 && Math.abs(walkedMenu.x + walkedMenu.width / 2 - (walkedFace.x + walkedFace.width / 2)) < 2 && walkedMenu.y > walkedFace.y + walkedFace.height);
  await page.keyboard.press("Escape");
  check("Esc puts it away, and it is gone from the page; the map stays open", (await menu.count()) === 0 && (await map.count()) === 1);
  await token("sage").click();
  const frame = await map.boundingBox();
  if (frame) await page.mouse.click(frame.x + frame.width - 200, frame.y + frame.height - 40);
  check("…and so does a press elsewhere", (await menu.count()) === 0);
  await token("sage").focus();
  await page.keyboard.press("Enter");
  check("from the keyboard her face is pressed as a button is", await shown(async () => (await menu.count()) === 1));
  // Space does the same, and is not heard by the page as well: the house is not paused or set going by it.
  await page.keyboard.press("Escape");
  const pausedThen = await page.evaluate(`window.manor3d.paused.peek()`);
  await token("sage").focus();
  await page.keyboard.press(" ");
  check("Space on her face puts up her menu too, and does not pause or resume the house as well", (await shown(async () => (await menu.count()) === 1)) && (await page.evaluate(`window.manor3d.paused.peek()`)) === pausedThen);
  await home.click();
  check(`Return home turns her for home where she is on the road, and the menu is put away (${await outing("sage", "to")})`, (await outing("sage", "to")) === "manor" && (await outing("sage", "homeward")) === true && (await menu.count()) === 0);
  await token("sage").click();
  const already = await shown(async () => (await home.isDisabled()) && (await titleOf(home)) === "Return home. She is on her way home already");
  check(`…pressed again on her way home, it is disabled, with why (${await titleOf(home)})`, already);
  await page.keyboard.press("Escape");

  // …and from a place, at work there.
  await rules(page, `G.gather(game, "rose", "forest", { limit: 480, homeByBed: false })`);
  await until(page, `(game.outings.find((o) => o.who === "rose")?.arrive ?? Infinity) < game.clock`);
  await token("rose").click();
  await home.click();
  check("at work at a place, Return home has her leave it now", (await outing("rose", "homeward")) === true && ((await outing("rose", "depart")) as number) <= ((await read(page, "game.clock")) as number));
  await until(page, `game.outings.length === 0`);
  // Home again, their faces are taken off the map while it is open: nothing is left listening on them.
  const facesGone = await shown(async () => (await page.locator(".map-token").count()) === 0);
  check(`…and with them home, no listener is held on a face taken off the open map (${await heldOnGone(page, ".map-token")})`, facesGone && (await heldOnGone(page, ".map-token")) === 0);
  await page.evaluate(`window.manor3d.map.open.set(false)`);

  // In dev mode the clock has ×16 and ×64 beside the rest, and the dev menu has them no longer.
  const fast = page.getByRole("button", { name: "Speed ×64" });
  const hiddenFirst = (await fast.isHidden()) && (await page.getByRole("button", { name: "Speed ×16" }).isHidden());
  await page.evaluate(`window.manor3d.dev.unlocked.set(true)`);
  await fast.waitFor({ timeout: SHOWN_MS });
  await fast.click();
  check("×16 and ×64 are on the clock only in dev mode, and pressed run it so fast", hiddenFirst && (await page.evaluate(`window.manor3d.speed.peek()`)) === 64 && (await fast.getAttribute("aria-pressed")) === "true");
  // The button the mouse pressed keeps the focus; Space is still the page's all the same, and pauses, rather than pressing that button again.
  await page.keyboard.press(" ");
  check("Space after a speed is pressed with the mouse pauses, as it always has", (await page.evaluate(`window.manor3d.paused.peek()`)) === true && (await page.evaluate(`document.activeElement?.getAttribute("aria-label")`)) === "Speed ×64");
  await page.evaluate(`window.manor3d.paused.set(true)`);
  // The dev menu is the tilde now; the backtick is the Master's.
  await page.keyboard.press("~");
  const devMenu = page.getByRole("dialog", { name: "Dev menu" });
  const opens = (await devMenu.count()) === 1 && (await devMenu.getByRole("button", { name: /^×(16|64)$/ }).count()) === 0;
  await page.keyboard.press("Escape");
  check(`the dev menu opens with ~ (${await page.locator(".dev-button").getAttribute("title")}), and has no speeds of its own`, opens && (await page.locator(".dev-button").getAttribute("title")) === "Dev menu — key ~ (Shift + `)");
  await page.keyboard.press("`");
  check(`the backtick follows the Master, and does not open the dev menu; his row shows it (${await page.locator(".person", { hasText: "The Master" }).locator(".key").textContent()})`, (await page.evaluate(`window.manor3d.following.peek()`)) === "master" && (await devMenu.count()) === 0 && (await page.locator(".person", { hasText: "The Master" }).locator(".key").textContent()) === "`");
  await page.keyboard.press("1");
  check("1 follows Evelyn, as it did", (await page.evaluate(`window.manor3d.following.peek()`)) === "evelyn");
  await page.evaluate(`window.manor3d.dev.unlocked.set(false)`);
  check("put out of dev mode, the fast speeds go from the clock, and it runs at the fastest of the usual", await shown(async () => (await fast.isHidden()) && (await page.evaluate(`window.manor3d.speed.peek()`)) === 4));
  await page.keyboard.press("?");
  const keys = await page.locator(".controls-keys").allTextContents();
  check(`the list of controls has the Master's key and the dev menu's (${keys.filter((k) => k === "`" || k === "~").join(" ")})`, keys.includes("`") && keys.includes("~"));
  await page.keyboard.press("Escape");

  // Asking, or waiting at a place, her walk home in her steps is pressed to have her come home now.
  await rules(page, `G.goTo(game, "sage", "lake")`);
  // (Her menu, up on the map as she comes to ask: the question's veil lies over the map, and her menu is put away under it, not left to be pressed over it.)
  await until(page, `game.outings.some((o) => o.who === "sage" && o.state === "away")`);
  await page.evaluate(`window.manor3d.map.open.set(true)`);
  await token("sage").waitFor({ timeout: SHOWN_MS });
  await token("sage").click();
  const menuUp = await shown(async () => (await menu.count()) === 1);
  await until(page, `game.asks.length > 0`);
  await ask.waitFor({ timeout: SHOWN_MS });
  check(`a face's menu up on the map is put away when a question is put over the map (${menuUp}, then ${await menu.count()})`, menuUp && (await shown(async () => (await menu.count()) === 0)));
  // (The map was open already as she asked: it is given the moment it takes to see that her question is up, so that it does not open itself again once shut.)
  await pageTime(page, LEFT_SHUT_MS);
  await page.evaluate(`window.manor3d.map.open.set(false)`);
  const homeNow = steps("Sage").locator('button[data-step="home"][data-press="home"]');
  const offered = await shown(async () => (await homeNow.count()) === 1);
  await homeNow.click();
  check(`asking, her walk home in her steps is unlit, and pressed she comes home now (${await outing("sage", "homeward")})`, offered && (await outing("sage", "homeward")) === true);
  await until(page, `game.outings.length === 0`);

  // A work card, for someone out: she comes home for it, and it is not kept from her.
  await rules(page, `G.sendToTown(game, "sage")`);
  await until(page, `game.outings.some((o) => o.who === "sage" && o.state === "away")`);
  await page.evaluate(`window.manor3d.work.open.bake.set(true)`);
  const baker = page.locator('.work-card-bake .who[data-who="sage"]');
  const says = await shown(async () => (await baker.isEnabled()) && (await titleOf(baker)).includes("She is out: she comes home for it"));
  check(`on the kitchen's card her face says she is out and comes home for it (${await titleOf(baker)})`, says);
  await baker.click();
  check("pressed, the work is hers and she is called home", (await read(page, "game.posts.sage")) === "bake" && (await outing("sage", "homeward")) === true);

  check(`calling home throws no errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, errors.length === 0);
  await page.close();
};
