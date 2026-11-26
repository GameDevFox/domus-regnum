// What the parts of the page check (bin/check3d-*.ts) share: the `Checks` they are given, opening a
// page with its errors caught, reading the game, running its clock, and waiting.
//
// There are two kinds of waiting, and they are kept apart:
// - `runUntil` (in the page) and `pollUntil` (from here, with the page drawn between goes) STEP THE
//   GAME'S CLOCK until something is so. Nothing waits on the wall clock: the house's time is run on
//   through `window.manor3d.advance`, as fast as the machine can.
// - `shown` waits, polling, for the page to SHOW something, without moving the game's clock, for at
//   most a named time; it returns as soon as it is so.
// - `pageTime`, `redrawn` and `frames` wait for the page's own frames to have gone by, for where there is
//   nothing to wait for but time (a key held, a camera coming to rest, a card's next read of the game).
//   The cards and the dial read the game a few times a second of the page's frame clock, not of the
//   wall clock, so on a busy machine whose frames come slowly these wait longer, and on a quiet one no
//   longer than a fixed pause did.
import type { Browser, Locator, Page } from "@playwright/test";

export type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** The longest one frame counts for on the page's frame clock, in milliseconds: main.ts's own cap on a frame (its `dt`). */
export const PAGE_FRAME_MS = 250;
/** …and on a controller's, which is read once a frame (gamepad.ts, LONGEST_FRAME); and on the keys that slide the view (common-web wasd-pan.ts, its `dt` cap). */
export const PAD_FRAME_MS = 100;
export const KEY_FRAME_MS = 50;
/** A redraw is sure once this much of the page's frame clock has gone by: past the slowest card's "read the game again" (0.25 s: map-view, panel, work-card, book, garden-menu, character-card, place-icons, lab-panel, ask-mark). */
export const REDRAW_MS = 300;
/** Frames that must go by however fast they come: one for the page to read what changed, one to draw it. */
const AT_LEAST_FRAMES = 2;
/** The longest a wait on the page's frames may take, in wall milliseconds, before it gives up and lets the check that follows say what is so. */
const FRAMES_AT_MOST_MS = 60_000;
/** How long the page is given to show something waited for, and how often it is looked at. */
export const SHOWN_MS = 5000;
export const POLL_MS = 50;
/** The longest a page is given to open and publish `window.manor3d`, in milliseconds. */
const OPENED_MS = 60_000;

/**
 * Wait, in the page, until its frames have counted `ms`: each frame's length as the page counts it
 * (never more than `longest`), and at least two frames. This is the page's own time, not the wall's:
 * whatever is reckoned frame by frame (a key or a stick held, a turn or the camera easing to rest, a
 * card's next read of the game) has then gone as far as `ms` of it takes, however slowly the frames
 * come. On a machine that keeps time it is as long as `ms`; on a busy one, as long as it must be.
 * (Not for what the browser times by the wall clock itself: a CSS transition, a `setTimeout`, a fetch.)
 */
export const pageTime = (page: Page, ms: number, longest = PAGE_FRAME_MS): Promise<boolean> =>
  page.evaluate(
    `new Promise((done) => {
      let last = null;
      let run = 0;
      let frames = 0;
      const giveUp = setTimeout(() => done(false), ${FRAMES_AT_MOST_MS});
      const tick = (now) => {
        if (last !== null) run += Math.min(${longest}, now - last);
        last = now;
        frames++;
        if (run >= ${ms} && frames >= ${AT_LEAST_FRAMES}) {
          clearTimeout(giveUp);
          done(true);
        } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })`,
  ) as Promise<boolean>;
/** Wait until every card and the dial have read the game again and been drawn: for after something is changed by hand. */
export const redrawn = (page: Page): Promise<boolean> => pageTime(page, REDRAW_MS);
/** Wait for `n` of the page's frames to go by, however long each takes: for a button that must be seen down in one frame and up in another. */
export const frames = (page: Page, n: number): Promise<boolean> =>
  page.evaluate(
    `new Promise((done) => {
      let left = ${n};
      const giveUp = setTimeout(() => done(false), ${FRAMES_AT_MOST_MS});
      const tick = () => {
        if (--left > 0) return requestAnimationFrame(tick);
        clearTimeout(giveUp);
        done(true);
      };
      requestAnimationFrame(tick);
    })`,
  ) as Promise<boolean>;

/** Wait until something on the page is so, without moving the game's clock, for as long as the page is given to show it (`ms`); then say whether it is. */
export const shown = async (so: () => Promise<boolean>, { ms = SHOWN_MS, poll = POLL_MS } = {}): Promise<boolean> => {
  const by = Date.now() + ms;
  while (Date.now() < by) {
    if (await so()) return true;
    await new Promise((done) => setTimeout(done, poll));
  }
  return so();
};

/** Run the house on, in the page, until something is so: a script with `h` and `game` (and `world`), with no frame drawn between steps. */
export const runUntil = (page: Page, so: string, { step, steps }: { step: number; steps: number }): Promise<boolean> =>
  page.evaluate(`(() => { const h = window.manor3d; const { game, world } = h; for (let n = 0; n < ${steps}; n++) { if (${so}) return true; h.advance(${step}); } return Boolean(${so}); })()`) as Promise<boolean>;
/** Run the house on from here, a step at a time, until something is so; with `drawn`, the page is let redraw after every step, for a test of what it shows. */
export const pollUntil = async (page: Page, so: string | (() => Promise<boolean>), { step, steps, drawn = false }: { step: number; steps: number; drawn?: boolean }): Promise<boolean> => {
  const now = typeof so === "string" ? async () => Boolean(await page.evaluate(`(() => { const { game, world } = window.manor3d; return ${so}; })()`)) : so;
  for (let n = 0; n < steps; n++) {
    if (await now()) return true;
    await advance(page, step);
    if (drawn) await redrawn(page);
  }
  return now();
};
/** Run the house on by so many seconds, as the page does. */
export const advance = (page: Page, seconds: number): Promise<unknown> => page.evaluate(`window.manor3d.advance(${seconds})`);
/** Run it on to a moment of the clock, in minutes (a second of `advance` is a minute of the house's). */
export const advanceTo = async (page: Page, clock: number): Promise<unknown> => advance(page, Math.max(0, clock - ((await read(page, "game.clock")) as number)));

/** Read something of the game: a script with `game`. */
export const read = (page: Page, js: string): Promise<unknown> => page.evaluate(`(() => { const { game } = window.manor3d; return ${js}; })()`);
/** Do something by the rules themselves: a script with `G`, the game's own functions, and `game`. */
export const rules = (page: Page, js: string): Promise<unknown> => page.evaluate(`import("/src/game/index.ts").then((G) => { const { game } = window.manor3d; return ${js}; })`);
/** One field of someone's outing, or the whole of it. */
export const outingOf = (page: Page, who: string, field?: string): Promise<unknown> => read(page, `game.outings.find((o) => o.who === "${who}")${field ? `?.${field}` : ""}`);
/** Wait until the house has asked what next of someone, running its clock on. */
export const answered = (page: Page, { step, steps }: { step: number; steps: number }): Promise<boolean> => runUntil(page, "game.asks.length > 0", { step, steps });
/** How many of something are on the page. */
export const count = (page: Page, selector: string): Promise<number> => page.locator(selector).count();
/** The title of something on the page, or "". */
export const titleOf = async (node: Locator): Promise<string> => (await node.getAttribute("title")) ?? "";

/** Open the demo page at `query`, catching its errors (and, with `console`, its console's), until `window.manor3d` is there; paused unless told otherwise. */
export const openPage = async ({ browser, base, viewport }: Checks, query: string, { paused = true, console: alsoConsole = false } = {}): Promise<{ page: Page; errors: string[] }> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  if (alsoConsole)
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
  await page.goto(`${base}demo3d.html?${query}`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d), undefined, { timeout: OPENED_MS });
  if (paused) await page.evaluate(`window.manor3d.paused.set(true)`);
  return { page, errors };
};
/** The closing check of a part: no errors on its page. */
export const noErrors = (check: Checks["check"], errors: string[], what: string): void => check(`${what}${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, errors.length === 0);

/** The things on the map that the checks press and read. */
export const Locators = (page: Page) => ({
  card: (place: string) => page.locator(`.map-card[data-card="${place}"]`),
  face: (who: string) => page.locator(`.map-card .who[data-who="${who}"]`),
  doing: (what: string) => page.locator(`.map-card .map-doing[data-doing="${what}"]`),
  token: (who: string) => page.locator(`.map-token[data-who="${who}"]`),
  steps: (who: string) => page.locator(".person", { hasText: who }).locator(".steps"),
  ask: page.locator(".map-ask"),
  told: (answer: string) => page.locator(`.map-ask [data-told="${answer}"]`),
});
/** Open the map on a place's card. */
export const openCard = async (page: Page, place: string, { ms = SHOWN_MS } = {}): Promise<void> => {
  await page.evaluate(`window.manor3d.map.open.set(true)`);
  await page.locator(`button[data-place="${place}"]`).click();
  await page.locator(`.map-card[data-card="${place}"]`).waitFor({ timeout: ms });
};

/** Every shop in town, found. */
const ALL_SHOPS = ["miller", "greengrocer", "books", "herbalist", "clothes"];
/** What grows in the forest, once it is found. */
const FOREST_FINDS = ["berries", "herbs"];
/** Set the world up as a part wants it: every shop found, the forest found with what grows in it, coin, and some of the household given no work. */
export const setUp = {
  world: (page: Page, { shops = true, forest = false, coin, idle = [] }: { shops?: boolean; forest?: boolean; coin?: number; idle?: string[] }): Promise<unknown> =>
    rules(
      page,
      `(${[
        shops ? `game.shops.push(${ALL_SHOPS.map((s) => JSON.stringify(s)).join(", ")})` : "0",
        forest ? `game.places.forest = "found", game.finds.forest = ${JSON.stringify(FOREST_FINDS)}` : "0",
        coin === undefined ? "0" : `game.coin = ${coin}`,
        ...idle.map((who) => `G.assign(game, ${JSON.stringify(who)}, null)`),
      ].join(", ")})`,
    ),
};
