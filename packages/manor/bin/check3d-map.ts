// The checks of the 3D demo page that are about the map: it opens over the whole window, shows what the
// house knows of the country, can be drawn near and no farther back than what is on it, and
// shows whoever is out of doors on her way. Run by check3d.ts.
import type { Browser, Page } from "@playwright/test";

import { KEY_FRAME_MS, pageTime } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

type Look = { x: number; y: number; scale: number; farthest: number } | null;

/** Time for the map to be redrawn after something is changed: it is drawn once a frame. */
const REDRAWN_MS = 250;
/** Scales nearer each other than this are the same. */
const SAME_SCALE = 1;
/** Seconds of the house's time to run at a go while waiting for her to be out of the door, and how many goes: a second at a time, so that she is caught near the start of her walk. */
const LOOK_EVERY = 1;
const LOOKS = 60;
/** Seconds further along the way she is looked for again: few, so that she has not arrived. */
const A_LITTLE_ON = 3;
/** How long the pictures may take to come, on a page only just opened. */
const PICTURES_MS = 5000;
/** Minutes before she is due at the door at which she is half way home: half the walk. */
const HALF_WAY_HOME = 20;
/** How near the corner of the window the map's way out is, in pixels. */
const CORNER_PX = 60;
/** A smaller window than the checks run in. */
const SMALLER = { width: 1000, height: 600 };
/** How far from a place's own point someone going about it may be, across the sheet and down it, in the sheet's pixels; and where town lies down the sheet. */
const WANDER_PX = { across: 40, down: 24 };
const TOWN_Y = 800;
/** The house's own point on the sheet; and how far from its own point the way to a place stops, for the house and for the town: where she is first and last seen on it. */
const MANOR = { x: 500, y: 520 };
const MANOR_CLEAR_PX = 62.5;
const TOWN_CLEAR_PX = 49;
/** How near its own point she is as she arrives at a place, in the sheet's pixels. */
const ARRIVES_PX = 3;
/** She is watched going about a place this many times, this many of the house's seconds apart: a stop of hers is longer than two looks. */
const WATCHES = 16;
const WATCH_EVERY = 1.5;
/** Spots nearer each other than this, in the sheet's pixels, are the same spot. */
const SAME_SPOT_PX = 0.01;
/** Her first walk in a place is watched this closely: this many looks, this many of the house's seconds apart, all within it. */
const STEP_LOOKS = 18;
const STEP_EVERY = 0.1;
/** A step lifts her off the line she walks by more than this, in the sheet's pixels, at its height. */
const STEP_PX = 2;
/** Minutes' walk from the house to town. */
const TOWN_WALK = 40;
/** She has walked at least this far by the end of those looks, in the sheet's pixels; and no one look is this far on from the last. */
const WALKED_PX = 8;
/** How long a key is held down. */
const KEY_HELD_MS = 300;
/** Seconds for her to be in at the door once she is due. */
const HOME_AND_A_BIT = 10;

const look = (page: Page): Promise<Look> => page.evaluate(`window.manor3d.map.look()`) as Promise<Look>;
/** Where a token or a piece is set down on the sheet, in the sheet's own pixels. */
const setAt = async (page: Page, selector: string): Promise<{ x: number; y: number } | null> =>
  (await page.locator(selector).count()) === 0 ? null : page.locator(selector).evaluate((node) => ({ x: parseFloat((node as HTMLElement).style.left), y: parseFloat((node as HTMLElement).style.top) }));

export const checkMap = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${base}demo3d.html?help=0&view=ground`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  // (The town's shops are found to begin with, as they were when this was written: the finding of them is check3d-shops.ts's.)
  await page.evaluate(`window.manor3d.game.shops.push("miller", "greengrocer", "books", "herbalist", "clothes")`);
  await page.evaluate(`window.manor3d.paused.set(true)`);
  const count = (selector: string): Promise<number> => page.locator(selector).count();

  check("the map is shut when the page opens", (await count(".map-frame")) === 0 && (await look(page)) === null);

  // The panel folds away to a narrow stack of what the house has, and opens again; the choice is kept.
  const panel = page.locator("#panel");
  const open = await panel.boundingBox();
  await page.getByRole("button", { name: "Fold the panel away" }).click();
  const folded = await panel.boundingBox();
  const tallies = await page.locator("#ledger .tally:visible").evaluateAll((boxes) => boxes.map((b) => b.getBoundingClientRect()).map((r) => ({ x: Math.round(r.x), y: Math.round(r.y) })));
  check(`the panel folds away to a narrow stack of what the house has (${folded?.width.toFixed(0)} px wide, from ${open?.width.toFixed(0)})`, folded !== null && open !== null && folded.width < open.width / 3 && tallies.length === 3 && tallies.every((t) => t.x === tallies[0].x) && tallies[1].y > tallies[0].y && (await page.locator("#panel .title").isHidden()) && (await page.locator("#panel .heading:visible").count()) === 0);
  // Of the household, folded away, there is each one's face and the badge of what she is at, and no more.
  const shows = async (what: string): Promise<number> => page.locator(`#cast ${what}:visible`).count();
  check(`…and, of the household, each one's face and the badge of what she is at, and nothing else (${await shows(".map-face")} faces, ${await shows(".work")} badges)`, (await shows(".map-face")) === 4 && (await shows(".work")) === 4 && (await shows(".name")) === 0 && (await shows(".doing")) === 0 && (await shows(".key")) === 0);
  await page.getByRole("button", { name: /^Rose/ }).click();
  check("…her face is still the button that follows her, and is called by her name", (await page.evaluate(`window.manor3d.following.peek()`)) === "rose");
  await page.keyboard.press("Escape");
  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  // (The town's shops are found to begin with, as they were when this was written: the finding of them is check3d-shops.ts's.)
  await page.evaluate(`window.manor3d.game.shops.push("miller", "greengrocer", "books", "herbalist", "clothes")`);
  await page.evaluate(`window.manor3d.paused.set(true)`);
  check("…and is still folded the next time the page is opened", ((await panel.getAttribute("class")) ?? "").includes("folded"));
  await page.getByRole("button", { name: "Open the panel" }).click();
  check("…until it is opened again, when each row has her key, then her face, then her name", !((await panel.getAttribute("class")) ?? "").includes("folded") && (await page.locator("#cast").isVisible()) && (await page.locator("#cast .follow .map-face:visible").count()) === 4 && (await page.locator("#cast .name:visible").count()) === 4 && (await page.locator("#cast .follow").first().evaluate((b) => [...b.children].map((c) => c.className.split(" ")[0]).join())) === "key,map-face,name,doing");

  // The way into the map is the map itself, small, in the bottom right corner.
  const widget = await page.getByRole("button", { name: "Open the map" }).boundingBox();
  const help = await page.getByRole("button", { name: "Settings" }).boundingBox();
  check("the map's button is in the bottom right corner, and is the largest button on the screen", widget !== null && help !== null && widget.x + widget.width > viewport.width - CORNER_PX && widget.y + widget.height > viewport.height - CORNER_PX && widget.width >= 2 * help.width);
  await page.getByRole("button", { name: "Open the map" }).click();
  check("its button opens it", (await page.getByRole("dialog", { name: "The map" }).count()) === 1 && (await page.getByRole("button", { name: "Close the map" }).first().getAttribute("aria-pressed")) === "true");

  // It takes the whole window, over the round buttons; the clock stays above it, and the panel (check3d-map-panel.ts).
  const whole = await page.locator(".map-frame").boundingBox();
  check("it takes the whole window", whole !== null && whole.x === 0 && whole.y === 0 && whole.width === viewport.width && whole.height === viewport.height);
  const onTop = (selector: string, within: string): Promise<boolean> =>
    page.evaluate(`(() => { const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2); return Boolean(top && top.closest(${JSON.stringify(within)})); })()`) as Promise<boolean>;
  check("…over the round buttons", (await onTop(".help-button", ".map-frame")) && (await onTop(".walls-button", ".map-frame")));
  check("…with the clock still above it", await onTop(".pill-top .pill-glyph", ".pill-top"));
  const way = await page.locator(".map-close").boundingBox();
  check("its way out is in the top right corner", way !== null && way.x + way.width > viewport.width - CORNER_PX && way.y < CORNER_PX);

  check("the manor and the town are set pieces, each with its name", (await count('.map-place[data-place="manor"] img')) === 1 && (await count('.map-place[data-place="town"] img')) === 1 && (await page.locator(".map-name").allTextContents()).join("|") === "The manor|The town");
  check("the forest and the lake are question marks, and the caves are not on the map", (await count('.map-unknown[data-place="forest"]')) === 1 && (await count('.map-unknown[data-place="lake"]')) === 1 && (await count('[data-place="caves"]')) === 0);
  check("a way is drawn from the manor to each of the three", (await count(".map-way")) === 3);
  // Home is the way back: pressing the manor puts the map away, with no card for it, and the house is looked at again.
  const home = page.locator('button[data-place="manor"]');
  check(`the manor says that pressing it is the way back to the house (${await home.getAttribute("aria-label")})`, (await home.getAttribute("aria-label")) === "The manor: back to the house");
  await home.click();
  check("pressing the manor on the map puts the map away: no card is put up for it, and the house is looked at again", (await page.getByRole("dialog", { name: "The map" }).count()) === 0 && (await count(".map-card")) === 0 && (await page.getByRole("button", { name: "Open the map" }).count()) === 1);
  await page.getByRole("button", { name: "Open the map" }).click();
  await page.getByRole("dialog", { name: "The map" }).waitFor();
  // The page has only just been opened again: its pictures are given a moment to come.
  const loaded = await page
    .waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".map-piece")].every((p) => p.complete && p.naturalWidth > 0), undefined, { timeout: PICTURES_MS })
    .then(() => true)
    .catch(() => false);
  check("the pictures of the pieces are there", loaded);

  // Drawn back no farther than what is on the map.
  const opened = await look(page);
  check(`it opens drawn right back (${opened?.scale.toFixed(0)} of ${opened?.farthest.toFixed(0)})`, opened !== null && Math.abs(opened.scale - opened.farthest) < SAME_SCALE);
  check("…and Farther has nothing left to do", await page.getByRole("button", { name: "Farther" }).isDisabled());
  const box = await page.locator(".map-frame").boundingBox();
  if (!box) throw new Error("the map has no frame");
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.wheel(0, 600);
  await pageTime(page, REDRAWN_MS);
  check("the wheel does not draw it back any farther", Math.abs(((await look(page))?.scale ?? 0) - (opened?.scale ?? -1)) < SAME_SCALE);
  await page.mouse.wheel(0, -400);
  await pageTime(page, REDRAWN_MS);
  const near = await look(page);
  check(`the wheel draws it nearer (${near?.scale.toFixed(0)})`, near !== null && opened !== null && near.scale > opened.scale * 1.3);
  check("…and then Farther can be pressed", await page.getByRole("button", { name: "Farther" }).isEnabled());

  // Slid by hand, and held at the edge of what may be seen.
  await page.mouse.down();
  await page.mouse.move(middle.x - 60, middle.y - 40, { steps: 4 });
  await page.mouse.up();
  const slid = await look(page);
  check("a drag slides it, the map going with the hand", slid !== null && near !== null && Math.abs((slid.x - near.x) * near.scale - 60) < 2 && Math.abs((slid.y - near.y) * near.scale - 40) < 2);
  for (let n = 0; n < 6; n++) {
    await page.mouse.move(middle.x - 200, middle.y);
    await page.mouse.down();
    await page.mouse.move(middle.x + 200, middle.y, { steps: 3 });
    await page.mouse.up();
  }
  const west = await look(page);
  await page.mouse.move(middle.x - 200, middle.y);
  await page.mouse.down();
  await page.mouse.move(middle.x + 200, middle.y, { steps: 3 });
  await page.mouse.up();
  check("…and it stops at the edge of what is on the map", west !== null && Math.abs(((await look(page))?.x ?? 0) - west.x) < 1e-6 && west.x < (near?.x ?? 0));

  await page.keyboard.press("-");
  await page.keyboard.press("-");
  await page.keyboard.press("-");
  await page.keyboard.press("-");
  const back = await look(page);
  check("the - key draws it back, as far as it goes", back !== null && Math.abs(back.scale - back.farthest) < SAME_SCALE);
  await page.getByRole("button", { name: "Nearer" }).click();
  check("the Nearer button draws it nearer", ((await look(page))?.scale ?? 0) > (back?.scale ?? Infinity) * 1.2);
  await page.getByRole("button", { name: "Farther" }).click();

  // A place is found: its piece is set down where its question mark was. (Done by hand here; check3d-outing.ts finds one by sending someone.)
  await page.evaluate(`window.manor3d.game.places.forest = "found"`);
  await pageTime(page, REDRAWN_MS);
  check("a place that is found is a set piece where its question mark was", (await count('.map-place[data-place="forest"] img')) === 1 && (await count('.map-unknown[data-place="forest"]')) === 0 && (await count(".map-way")) === 3);
  // A place farther off comes onto the map: the view may draw back to take it in, and does if it was drawn right back.
  await page.evaluate(`window.manor3d.game.places.caves = "unknown"`);
  await pageTime(page, REDRAWN_MS);
  const wider = await look(page);
  check(`when a place farther off comes onto the map, the view can draw back farther (${wider?.farthest.toFixed(0)} from ${back?.farthest.toFixed(0)})`, wider !== null && back !== null && wider.farthest < back.farthest - SAME_SCALE && Math.abs(wider.scale - wider.farthest) < SAME_SCALE);
  check("…and it is a question mark, with a way to it", (await count('.map-unknown[data-place="caves"]')) === 1 && (await count(".map-way")) === 4);

  // Someone sent into town is seen on her way there, in town, and gone from the map when she is home.
  // (She is sent by the rules themselves: sending her by her face on the town's card is check3d-outing.ts's and check3d-shops.ts's.)
  await page.evaluate(`window.manor3d.game.coin = 100`);
  await pageTime(page, REDRAWN_MS * 2);
  check("nobody is on the map while everybody is at home", (await count(".map-token")) === 0);
  // (With the return asked for beforehand: this is about her walk there and back, and her coming home when it is bought.)
  await page.evaluate(`import("/src/game/index.ts").then(({ sendToTown }) => sendToTown(window.manor3d.game, "sage", "flour", true))`);
  let token = await setAt(page, '.map-token[data-who="sage"]');
  for (let n = 0; n < LOOKS && token === null; n++) {
    await page.evaluate(`window.manor3d.advance(${LOOK_EVERY})`);
    await pageTime(page, REDRAWN_MS);
    token = await setAt(page, '.map-token[data-who="sage"]');
  }
  const manor = await setAt(page, '.map-place[data-place="manor"]');
  const town = await setAt(page, '.map-place[data-place="town"]');
  const outOfHouse = (await page.evaluate(`window.manor3d.world.actors.some((a) => a.id === "sage")`)) === false;
  // (The faces on the map's button are looked to a few times a second, not every frame: they are given time to catch up.)
  await pageTime(page, REDRAWN_MS * 2);
  check("Sage is on the map once she is out of the house, and her face is on the map's button", token !== null && outOfHouse && (await count(".map-widget-out .map-face")) === 1);
  if (!token || !manor || !town) throw new Error("the map is missing Sage, the manor or the town");
  /** The slip under her face, and how many minutes it says she is off. */
  const slip = async (): Promise<string> => (await page.locator('.map-token[data-who="sage"] .map-token-status').textContent()) ?? "";
  const off = async (): Promise<number> => Number(/^\S+ (\d+) min$/.exec(await slip())?.[1] ?? NaN);
  const offAtFirst = await off();
  const slipAtFirst = await slip();
  await page.evaluate(`window.manor3d.advance(${A_LITTLE_ON})`);
  await pageTime(page, REDRAWN_MS);
  const later = await setAt(page, '.map-token[data-who="sage"]');
  // The pieces are set down by their tops, so the way she walks is judged across the map only.
  check("…and she is on the way from the manor towards the town", later !== null && later.x > token.x && later.y > token.y && later.x < town.x);
  check(`…from the edge of the house's piece, where the way is drawn from: she is never seen over the house she has left (${Math.hypot(token.x - MANOR.x, token.y - MANOR.y).toFixed(0)} px from its own point)`, Math.hypot(token.x - MANOR.x, token.y - MANOR.y) >= MANOR_CLEAR_PX - ARRIVES_PX);
  check(`…the slip under her face says how many minutes off she is, fewer as she goes (${slipAtFirst}, then ${await slip()})`, slipAtFirst.startsWith("🚶 ") && offAtFirst > A_LITTLE_ON && offAtFirst <= TOWN_WALK && (await off()) === offAtFirst - A_LITTLE_ON);
  await page.evaluate(`(() => { const { game } = window.manor3d; window.manor3d.advance(game.outings[0].arrive - game.clock); })()`);
  await pageTime(page, REDRAWN_MS);
  const arrived = await setAt(page, '.map-token[data-who="sage"]');
  check(`…and comes into town where the way meets the town's piece, on the side she came from: she is not seen over the town until she is in it (${arrived ? Math.hypot(arrived.x - town.x, arrived.y - TOWN_Y).toFixed(0) : "?"} px from its own point)`, arrived !== null && Math.abs(Math.hypot(arrived.x - town.x, arrived.y - TOWN_Y) - TOWN_CLEAR_PX) < ARRIVES_PX && arrived.x < town.x && arrived.y < TOWN_Y);
  // Her first walk, watched closely: she goes one way all the while, and is lifted off the line of it by her steps.
  const walk: { x: number; y: number }[] = [];
  for (let n = 0; n < STEP_LOOKS; n++) {
    await page.evaluate(`window.manor3d.advance(${STEP_EVERY})`);
    await pageTime(page, REDRAWN_MS);
    const at = await setAt(page, '.map-token[data-who="sage"]');
    if (at) walk.push(at);
  }
  const far = walk.map((at) => (arrived ? Math.hypot(at.x - arrived.x, at.y - arrived.y) : 0));
  /** How far each look is from the straight line between the first and the last of them. */
  const offLine = walk.map((at) => (arrived && walk.length ? Math.abs((at.x - arrived.x) * (walk[walk.length - 1].y - arrived.y) - (at.y - arrived.y) * (walk[walk.length - 1].x - arrived.x)) / (far[far.length - 1] || 1) : 0));
  // (Her step lifts her up the paper: off the line of a walk across it, and by fits and starts along a walk up or down it.)
  const strides = far.map((d, n) => Math.abs(d - (n ? far[n - 1] : 0)));
  const fitful = Math.max(...strides) - Math.min(...strides);
  check(`…and sets off into it at a walk, with a step in it: she is some way on before long (${far[far.length - 1]?.toFixed(0)} px in ${STEP_LOOKS * STEP_EVERY} minutes) and no jump got her there, and her step is seen (${Math.max(...offLine).toFixed(1)} px off the line, ${fitful.toFixed(1)} px between her longest stride and her shortest)`, walk.length === STEP_LOOKS && far[far.length - 1] > WALKED_PX && far[far.length - 1] < WANDER_PX.across + TOWN_CLEAR_PX && strides.every((stride) => stride < WALKED_PX) && (Math.max(...offLine) > STEP_PX || fitful > STEP_PX));
  // She goes about the town: watched for a while, she walks from spot to spot of it and stops at each.
  const seen: { x: number; y: number }[] = [];
  for (let n = 0; n < WATCHES; n++) {
    await page.evaluate(`window.manor3d.advance(${WATCH_EVERY})`);
    await pageTime(page, REDRAWN_MS);
    const at = await setAt(page, '.map-token[data-who="sage"]');
    if (at) seen.push(at);
  }
  const says = await page.locator('.map-token[data-who="sage"]').getAttribute("aria-label");
  const same = (a: { x: number; y: number }, b: { x: number; y: number }): boolean => Math.hypot(a.x - b.x, a.y - b.y) < SAME_SPOT_PX;
  const spots = seen.filter((at, n) => seen.findIndex((other) => same(at, other)) === n).length;
  const stops = seen.filter((at, n) => n > 0 && same(at, seen[n - 1])).length;
  check(`…then in town, where the slip under her face shows what she is buying (${says}; ${await slip()})`, seen.length === WATCHES && /^Sage, at the town, buying flour: 4 sacks, and \d+ minutes more$/.test(says ?? "") && (await slip()) === "🌾 ×4");
  check(`…where she is seen going about: walking from spot to spot (${spots} places in ${WATCHES} looks), stopping at them (${stops} looks stood still), never off the ground of it`, spots > WATCHES / 2 && stops > 0 && seen.every((at) => Math.hypot(at.x - town.x, at.y - TOWN_Y) <= TOWN_CLEAR_PX + STEP_PX * 4) && seen.slice(-4).every((at) => Math.abs(at.x - town.x) <= WANDER_PX.across && Math.abs(at.y - TOWN_Y) <= WANDER_PX.down));
  // Her name in the list, pressed while she is out, opens the map where she is to be found.
  await page.keyboard.press("m");
  await page.getByRole("button", { name: /^Sage/ }).first().click();
  check("pressing her name while she is out opens the map, and follows her on it: her face there is ringed", (await count(".map-frame")) === 1 && (await page.evaluate(`window.manor3d.following.peek()`)) === "sage" && (await count('.map-token.followed[data-who="sage"]')) === 1);
  await page.keyboard.press("m");
  await page.keyboard.press("3");
  check("…and so does her number", (await count(".map-frame")) === 1);
  // From the map, the number of someone who is at home goes back to the house, to her.
  await page.keyboard.press("2");
  check("the number of someone at home shuts the map and follows her about the house", (await count(".map-frame")) === 0 && (await page.evaluate(`window.manor3d.following.peek()`)) === "rose");
  await page.keyboard.press("2");
  check("…and pressed again in the house, lets her go, as it always did", (await page.evaluate(`window.manor3d.following.peek()`)) === null);
  await page.keyboard.press("3");
  check("…and Sage's number goes back to the map, where she is", (await count(".map-frame")) === 1);
  // Twenty minutes before she is due at the door, she is half way home.
  await page.evaluate(`(() => { const { game } = window.manor3d; window.manor3d.advance(game.outings[0].back - ${HALF_WAY_HOME} - game.clock); })()`);
  await pageTime(page, REDRAWN_MS);
  const homeward = await setAt(page, '.map-token[data-who="sage"]');
  const saysThen = await page.locator('.map-token[data-who="sage"]').getAttribute("aria-label");
  check(`…and on the way home when it is time (${saysThen})`, homeward !== null && homeward.x < town.x - 1 && homeward.x > manor.x + 1 && /^Sage, on the way to the manor, (20|21) minutes off$/.test(saysThen ?? "") && /^🏠 (20|21) min$/.test(await slip()));
  await page.evaluate(`window.manor3d.advance(${HALF_WAY_HOME + HOME_AND_A_BIT})`);
  await pageTime(page, REDRAWN_MS);
  check("…and she is off the map when she is home; and since she was followed, the view has gone home with her: the map is shut", (await count(".map-frame")) === 0 && (await page.evaluate(`window.manor3d.world.actors.some((a) => a.id === "sage")`)) === true && (await page.evaluate(`window.manor3d.following.peek()`)) === "sage");
  // (She is let go of, and the map opened again, for what follows.)
  await page.evaluate(`window.manor3d.following.set(null)`);
  await page.keyboard.press("m");
  await pageTime(page, REDRAWN_MS);
  check("opened again, nobody is on it", (await count(".map-frame")) === 1 && (await count(".map-token")) === 0);

  // Time goes on with the map open.
  const clockWas = (await page.evaluate(`window.manor3d.game.clock`)) as number;
  await page.evaluate(`window.manor3d.paused.set(false)`);
  await pageTime(page, 1200);
  await page.evaluate(`window.manor3d.paused.set(true)`);
  check("time goes on while the map is open", ((await page.evaluate(`window.manor3d.game.clock`)) as number) > clockWas);

  // The window is made larger while the map is drawn right back: it still takes in no more than what is on it.
  await page.setViewportSize(SMALLER);
  await pageTime(page, REDRAWN_MS);
  for (let n = 0; n < 4; n++) await page.keyboard.press("-");
  const small = await look(page);
  await page.setViewportSize(viewport);
  await pageTime(page, REDRAWN_MS);
  const large = await look(page);
  check(`in a larger window the map is drawn larger, not farther back (${small?.scale.toFixed(0)} to ${large?.scale.toFixed(0)})`, small !== null && large !== null && large.farthest > small.farthest + SAME_SCALE && Math.abs(large.scale - large.farthest) < SAME_SCALE);

  // Shut and opened again by the keys; it opens where it was being looked at.
  await page.getByRole("button", { name: "Nearer" }).click();
  const left = await look(page);
  await page.keyboard.press("Escape");
  check("Esc shuts it", (await count(".map-frame")) === 0 && (await look(page)) === null);
  const camera = await page.evaluate(`window.manor3d.cameraAt()`);
  await page.keyboard.press("m");
  const again = await look(page);
  check("M opens it again, where it was being looked at", again !== null && left !== null && Math.abs(again.scale - left.scale) < SAME_SCALE && Math.abs(again.x - left.x) < 1e-6);
  // Held for a moment, as a hand holds it: long enough for the house's view to have slid, were it listening.
  await page.keyboard.down("s");
  await pageTime(page, KEY_HELD_MS, KEY_FRAME_MS);
  await page.keyboard.up("s");
  const after = await look(page);
  check("with the map open, the keys that slide the house's view slide the map, and the house stays where it was", after !== null && again !== null && after.y > again.y && (await page.evaluate(`window.manor3d.cameraAt()`)) === camera);
  await page.locator(".map-close").click();
  check("its own × shuts it too", (await count(".map-frame")) === 0);
  check(`the map throws no errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, errors.length === 0);
  await page.close();
};
