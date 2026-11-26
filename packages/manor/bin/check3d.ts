// A real-mouse-and-keyboard check of the 3D demo page: every control does what it says, and the
// page throws no errors while the household goes about its day. Needs the dev server.
//   npx tsx bin/check3d.ts
import type { Page } from "@playwright/test";

import { KEY_FRAME_MS, pageTime } from "./check3d-kit";

import { PARTS } from "./check3d-parts";
import { launchBrowser, runParts, workersAsked } from "./check3d-pool";

const BASE = process.env.MANOR_URL ?? "http://127.0.0.1:3011/";
const VIEWPORT = { width: 1280, height: 800 };
/** The share of a room a wall may hide and still stand, on a first visit (src/demo3d/wall-tolerance.ts). */
const FIRST_TOLERANCE = 0.05;
/** Eight in the morning, in minutes after midnight. */
const SHOP_OPENS_MINUTE = 8 * 60;

type Handle = {
  view: { peek: () => string };
  following: { peek: () => string | null };
  paused: { peek: () => boolean };
  world: { t: number; actors: { id: string; walked: number }[] };
  cost: () => { calls: number };
};

const read = <T>(page: Page, fn: (h: Handle) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.manor3d)`) as Promise<T>;
const cameraAt = (page: Page): Promise<string> => page.evaluate(() => (window as unknown as { manor3d: { cameraAt: () => string } }).manor3d.cameraAt());
const distance = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { manor3d: { distance: () => number } }).manor3d.distance());
const targetAt = (page: Page): Promise<string> => page.evaluate(() => (window as unknown as { manor3d: { targetAt: () => string } }).manor3d.targetAt());
const azimuth = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { manor3d: { azimuth: () => number } }).manor3d.azimuth());
/** How far an angle is from the nearest diagonal view (45, 135, 225 or 315 degrees). */
const offDiagonal = (degrees: number): number => Math.abs(((((degrees - 45) % 90) + 90 + 45) % 90) - 45);
const TURN_SETTLE_MS = 1600;
const ZOOM_SETTLE_MS = 2600;

const results: [string, boolean][] = [];
const check = (name: string, ok: boolean): void => {
  results.push([name, ok]);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
};

const main = async (): Promise<void> => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: VIEWPORT });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${BASE}demo3d.html`);
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));

  // A first visit is greeted with the list of keys, until told not to; the tick can be put on and taken off.
  const greeted = async (): Promise<boolean> => (await page.getByRole("dialog").count()) === 1;
  const reopen = async (): Promise<void> => {
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  };
  check("a first visit is greeted with the list of keys", await greeted());
  await page.getByLabel("Don't show again").check();
  await reopen();
  check("ticking \"Don't show again\" keeps it away next time", !(await greeted()));
  await page.keyboard.press("?");
  check("…and the tick is still on when it is asked for", await page.getByLabel("Don't show again").isChecked());
  await page.getByLabel("Don't show again").uncheck();
  await reopen();
  check("unticking it brings the greeting back", await greeted());
  await page.getByLabel("Don't show again").check();
  await page.getByRole("button", { name: "Close" }).click();

  check("opens on the ground floor", (await read(page, (h) => h.view.peek())) === "ground");

  await pageTime(page, 2500);
  const walked = await read(page, (h) => h.world.actors.reduce((sum, a) => sum + a.walked, 0));
  check("the household is walking about", walked > 2);

  // Following someone closes in on them; letting go draws back to where the camera was.
  const far = await distance(page);
  await page.keyboard.press("1");
  await pageTime(page, ZOOM_SETTLE_MS);
  const near = await distance(page);
  check(`following someone zooms in on them (${far.toFixed(0)} m → ${near.toFixed(0)} m)`, near < far - 10 && Math.abs(near - 12) < 0.5);
  await page.keyboard.press("1");
  await pageTime(page, ZOOM_SETTLE_MS);
  const back = await distance(page);
  check(`letting go restores the zoom (${back.toFixed(0)} m)`, Math.abs(back - far) < 0.5);
  await page.getByRole("button", { name: "Ground floor" }).click();

  await page.getByRole("button", { name: "Cellar" }).click();
  check("the Cellar button shows the cellar", (await read(page, (h) => h.view.peek())) === "cellar");
  await page.getByRole("button", { name: "First floor" }).click();
  check("the First floor button shows the first floor", (await read(page, (h) => h.view.peek())) === "first");
  await page.keyboard.press("h");
  check("the H key shows the whole house", (await read(page, (h) => h.view.peek())) === "house");
  await page.getByRole("button", { name: "Ground floor" }).click();

  // R and F climb and descend: cellar, ground, first, and above the top floor the whole house.
  const climb: string[] = [];
  for (const key of ["r", "r", "r", "f", "f", "f", "f"]) {
    await page.keyboard.press(key);
    climb.push(await read(page, (h) => h.view.peek()));
  }
  check(`R and F go up and down the floors (${climb.join(" → ")})`, climb.join(",") === "first,house,house,first,ground,cellar,cellar");
  await page.getByRole("button", { name: "Ground floor" }).click();

  // The Master is at the head of the list with the backtick; the number keys are the maids under him, in the order of the list; and the list says so (person-keys.ts).
  const [head, rose] = [page.locator(".person").nth(0), page.locator(".person").nth(2)];
  const shows = async (row: typeof head): Promise<string> => `${await row.locator(".key").innerText()} ${await row.locator(".name").innerText()}`;
  check(`the Master is at the head of the list with his key, and the second of the maids shows hers, 2 (${await shows(head)}; ${await shows(rose)})`, (await shows(head)) === "` The Master" && (await shows(rose)) === "2 Rose");
  await page.keyboard.press("2");
  check("the 2 key follows the second of the maids", (await read(page, (h) => h.following.peek())) === "rose");
  await page.keyboard.press("`");
  check("the backtick follows the Master", (await read(page, (h) => h.following.peek())) === "master");
  await page.keyboard.press("`");
  check("the same key again lets go", (await read(page, (h) => h.following.peek())) === null);
  await page.getByRole("button", { name: "Ground floor" }).click();

  await page.keyboard.press("?");
  check("the ? key shows the controls", (await page.getByRole("dialog").count()) === 1 && (await page.getByRole("dialog").innerText()).includes("Up a floor"));
  await page.keyboard.press("Escape");
  check("Escape closes it", (await page.getByRole("dialog").count()) === 0);
  // The controls seldom wanted are behind a gear in the top right corner: it opens a card of them.
  const gear = page.getByRole("button", { name: "Settings" });
  const corner = await gear.boundingBox();
  check("the gear is in the top right corner, and nothing else is with it", corner !== null && corner.x > VIEWPORT.width - 80 && corner.y < 40 && !(await page.getByRole("button", { name: /^Controls/ }).isVisible()) && !(await page.getByRole("button", { name: /^Walls / }).isVisible()));
  await gear.click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  check("it opens a card with the controls, the two choices about the walls, where the view is centred and the performance graph on it, each named", (await settings.count()) === 1 && (await settings.getByRole("button", { name: /^Controls/ }).isVisible()) && (await settings.getByRole("button", { name: /^Walls / }).isVisible()) && (await settings.getByRole("button", { name: /^Only the rooms with someone in them/ }).isVisible()) && (await settings.getByRole("button", { name: /performance graph/ }).isVisible()) && (await settings.locator(".settings-says").allTextContents()).join("|") === "Controls|Wall Hiding: Sliding|Wall Hiding: With Characters|View: Centred|Performance");
  await page.keyboard.press("Escape");
  check("Escape puts the card away", (await settings.count()) === 0);
  await gear.click();
  await page.getByRole("button", { name: /^Controls/ }).click();
  const opened = (await page.getByRole("dialog").count()) === 1 && (await page.getByRole("dialog").innerText()).includes("Up a floor");
  await page.getByRole("button", { name: "Close" }).click();
  check("the controls button on it opens the controls in its place, and Close shuts that", opened && (await page.getByRole("dialog").count()) === 0);

  // The floor chooser: a house in section at the bottom left, one layer for each storey and a roof.
  const layers = await page.locator(".floors .storey").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  check(`the floor chooser stacks the roof, the storeys and the cellar (${layers.join(" / ")})`, layers.join(",") === "Whole house,First floor,Ground floor,Cellar");
  const house = await page.locator(".floors").boundingBox();
  check("it sits at the bottom left", house !== null && house.x < 60 && house.y + house.height > VIEWPORT.height - 30);
  const lit = await page.locator(".floors .storey.on").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  check(`only the storey being looked into is lit (${lit.join(", ")})`, lit.join(",") === "Ground floor");
  // The chosen storey is solid and in line with the rest; the others are see-through.
  await pageTime(page, 250);
  const looks = await page.locator(".floors .storey").evaluateAll((els) => els.map((e) => ({ on: e.classList.contains("on"), opacity: Number(getComputedStyle(e).opacity), left: Math.round(e.getBoundingClientRect().left + e.getBoundingClientRect().width / 2) })));
  check("the chosen storey is solid, the others see-through, and none is shifted", looks.every((l) => (l.on ? l.opacity === 1 : l.opacity < 0.6)) && new Set(looks.map((l) => l.left)).size === 1);

  // Time is one control, centred at the foot of the screen.
  const time = await page.getByRole("group", { name: "Time" }).boundingBox();
  check("pause and speed are one control, centred at the top", time !== null && Math.abs(time.x + time.width / 2 - VIEWPORT.width / 2) < 4 && time.y < 40);
  const turning = await page.getByRole("group", { name: "Turn the view" }).boundingBox();
  check("the two turn buttons are centred at the bottom", turning !== null && Math.abs(turning.x + turning.width / 2 - VIEWPORT.width / 2) < 4 && turning.y + turning.height > VIEWPORT.height - 40);
  check("the panel no longer explains the mouse in words", !(await page.locator("#panel").innerText()).includes("Drag"));

  const startedAt = await azimuth(page);
  check(`opens on a diagonal view (${startedAt.toFixed(0)}°)`, offDiagonal(startedAt) < 1);
  await page.keyboard.press("q");
  await pageTime(page, TURN_SETTLE_MS);
  const afterQ = await azimuth(page);
  check(`the Q key turns to the next diagonal (${afterQ.toFixed(0)}°)`, offDiagonal(afterQ) < 1 && Math.abs(afterQ - startedAt) > 80);
  const turned = await cameraAt(page);

  await page.mouse.move(800, 420);
  await page.mouse.down();
  await page.mouse.move(920, 440, { steps: 8 });
  await page.mouse.up();
  await pageTime(page, 300);
  check("dragging turns the view", (await cameraAt(page)) !== turned);
  check("a drag is not a click on someone", (await read(page, (h) => h.following.peek())) === null);
  const odd = await azimuth(page);
  await page.getByRole("button", { name: "Turn clockwise" }).click();
  await pageTime(page, TURN_SETTLE_MS);
  const snapped = await azimuth(page);
  check(`from an odd angle (${odd.toFixed(0)}°) the Turn button lands on a diagonal (${snapped.toFixed(0)}°)`, offDiagonal(odd) > 3 && offDiagonal(snapped) < 1);

  // Back over the picture: the pointer was last on a button in the panel.
  await page.mouse.move(800, 420);
  const zoomedFrom = await cameraAt(page);
  await page.mouse.wheel(0, -600);
  await pageTime(page, 500);
  check("the wheel zooms", (await cameraAt(page)) !== zoomedFrom);

  await page.getByRole("button", { name: /^Rose/ }).click();
  check("clicking a name follows that person", (await read(page, (h) => h.following.peek())) === "rose");
  await page.keyboard.press("Escape");
  check("Escape lets go", (await read(page, (h) => h.following.peek())) === null);

  // From here on it is day: put the clock to the shop's opening. Customers come in shop hours; and at dawn the lamps
  // are still lit, which in a software renderer makes frames slow enough to throw the timed checks below.
  await page.evaluate((opening) => {
    (window as unknown as { manor3d: { game: { clock: number } } }).manor3d.game.clock = opening;
  }, SHOP_OPENS_MINUTE);
  // W A S D slide the view over the floor, at the height it is at, and let go of whoever was followed.
  await page.getByRole("button", { name: /^Rose/ }).click();
  await pageTime(page, 1200);
  // Measured at the point the camera looks at: the camera itself also draws back as the follow is let go.
  const [beforeX, beforeY, beforeZ] = (await targetAt(page)).split(",").map(Number);
  await page.keyboard.down("d");
  await pageTime(page, 500, KEY_FRAME_MS);
  await page.keyboard.up("d");
  await pageTime(page, 200);
  const [afterX, afterY, afterZ] = (await targetAt(page)).split(",").map(Number);
  const slid = Math.hypot(afterX - beforeX, afterZ - beforeZ);
  check(`holding D slides the view sideways (${slid.toFixed(1)} m)`, slid > 1.5);
  check(`…without changing its height (${Math.abs(afterY - beforeY).toFixed(2)} m)`, Math.abs(afterY - beforeY) < 0.15);
  check("…and lets go of the person being followed", (await read(page, (h) => h.following.peek())) === null);

  // Choosing a floor by hand, away from the person followed, lets go of them and stays put.
  await page.getByRole("button", { name: /^Evelyn/ }).click();
  const elsewhere = await read(page, (h) => ((h.world.actors[0] as unknown as { walker: { pos: { y: number } } }).walker.pos.y > 2 ? "ground" : "first"));
  await page.getByRole("button", { name: elsewhere === "first" ? "First floor" : "Ground floor" }).click();
  await pageTime(page, 500);
  check(`choosing another floor by hand lets go of the person followed and stays there (${elsewhere})`, (await read(page, (h) => h.following.peek())) === null && (await read(page, (h) => h.view.peek())) === elsewhere);
  await page.getByRole("button", { name: "Ground floor" }).click();

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const stoppedAt = await read(page, (h) => h.world.t);
  await pageTime(page, 600);
  check("Pause stops the clock", (await read(page, (h) => h.paused.peek())) && (await read(page, (h) => h.world.t)) === stoppedAt);
  // Someone standing at work breathes; paused, nobody does.
  const breaths = (): Promise<string> => page.evaluate(() => (window as unknown as { manor3d: { breathing: () => number[] } }).manor3d.breathing().map((n) => n.toFixed(5)).join(","));
  const heldA = await breaths();
  await pageTime(page, 450);
  check("paused, nobody breathes", (await breaths()) === heldA);

  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);

  await page.keyboard.press(" ");
  await pageTime(page, 400);
  check("Space starts it again", (await read(page, (h) => h.world.t)) > stoppedAt);
  // Running again, before long somebody is at work and breathing. Two people have just been given
  // new work and dropped what they were at, so everyone may be walking for the first few seconds.
  const BREATH_LOOKS = 60;
  const BREATH_LOOK_EVERY_MS = 250;
  const seenBreaths = new Set<string>();
  for (let i = 0; i < BREATH_LOOKS && seenBreaths.size < 2; i++) {
    seenBreaths.add(await breaths());
    await pageTime(page, BREATH_LOOK_EVERY_MS);
  }
  check("running, they breathe again", seenBreaths.size > 1);

  // (These are of the way that opens the whole storey, "All Rooms": the other, which a first visit has, is checked in check3d-rooms.ts.)
  await page.evaluate(`window.manor3d.byRoom.set(false)`);
  // A wall stands only while it hides no room: the shop's side wall faces away from the front-right
  // corner but has the pantry behind it; from the back-right corner it has only garden behind it.
  const standingFrom = (view: string, degrees: number): Promise<string[]> =>
    page.evaluate(
      ([v, az]) => {
        const h = (window as unknown as { manor3d: { view: { set: (v: string) => void }; aim: (az: number, polar: number, dist: number) => void; settle: () => void; standing: (floor: string) => string[] } }).manor3d;
        h.view.set(v as string);
        h.aim(((az as number) * Math.PI) / 180, 0.9, 30);
        h.settle();
        return h.standing(v as string);
      },
      [view, degrees] as const,
    );
  const SHOP_SIDE = "z 2 7-12";
  const KITCHEN_BACK = "x 1 2-8";
  const fromFrontRight = await standingFrom("ground", 45);
  check("from the front right the kitchen's back wall stands", fromFrontRight.includes(KITCHEN_BACK));
  check("…and the shop's side wall is down, with the pantry behind it", !fromFrontRight.includes(SHOP_SIDE));
  check("from the back right the shop's side wall stands again", (await standingFrom("ground", 135)).includes(SHOP_SIDE));
  // (A wall may hide a share of a room and stand, which this one now does: check3d-tolerance.ts. With nothing allowed, the rule under it is as it was.)
  await page.evaluate(`window.manor3d.tolerance.set(0)`);
  check("in the cellar the laboratory's wall is down in front of the undercroft, with nothing allowed to be hidden", !(await standingFrom("cellar", 135)).includes("x 6 12-19"));
  await page.evaluate(`window.manor3d.tolerance.set(${FIRST_TOLERANCE})`);
  // The far side of the parlour's bay, seen from due west on a page nobody has moved about: nearly
  // end-on, with only garden in its shadow. It hides nothing, but it is not turned away, so it is down.
  const END_ON = 268;
  const fresh = await browser.newPage({ viewport: VIEWPORT });
  await fresh.goto(`${BASE}demo3d.html?view=ground&help=0&rooms=all&az=${(END_ON * Math.PI) / 180}`);
  await fresh.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  const endOn = await fresh.evaluate(() => {
    const h = (window as unknown as { manor3d: { settle: () => void; standing: (floor: string) => string[] } }).manor3d;
    h.settle();
    return h.standing("ground");
  });
  // Nearly end-on, a wall hides next to nothing, and yet must not flick up: the two either side of the parlour's bay, from the front.
  // (On the page nobody has moved about, too: from where the first page's camera has been slid to by then, they are not end-on at all, and
  // since a wall may hide a little of a room they then rightly stand. That is what failed this in two full runs of five, 2026-11-16.)
  const fromTheFront = (await fresh.evaluate(`(() => { const h = window.manor3d; h.aim(${(21 * Math.PI) / 180}, 0.9, 30); h.settle(); return h.standing("ground"); })()`)) as string[];
  await fresh.close();
  check(`from the front, the parlour's walls either side of its bay stay down though they are end-on (of them standing: ${fromTheFront.filter((w) => w.startsWith("z 18")).join(", ") || "none"})`, !fromTheFront.includes("z 18 6-7.5") && !fromTheFront.includes("z 18 10.5-12"));
  check("…while the back walls stand", fromTheFront.includes(KITCHEN_BACK));
  check("a wall seen end-on stays down even with nothing behind it", !endOn.includes("x 7.5 18-18.75"));
  check("…while from there the house's east walls stand", endOn.includes("z 19 0-6"));

  // Following someone asks the question of her room alone: every wall stands, inside ones too, but those that
  // hide any of the room she is in. Rose is behind the shop's counter; the camera is to the north-west, over the kitchen.
  const NORTH_WEST = 225;
  const close = await browser.newPage({ viewport: VIEWPORT });
  await close.goto(`${BASE}demo3d.html?view=ground&help=0&rooms=all&follow=rose&az=${(NORTH_WEST * Math.PI) / 180}`);
  await close.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  const standingNow = (): Promise<string[]> => close.evaluate(() => (window as unknown as { manor3d: { standing: (floor: string) => string[] } }).manor3d.standing("ground"));
  await pageTime(close, 2500);
  const around = await standingNow();
  const PANTRY_KITCHEN = "z 2 3-7";
  const KITCHEN_SHOP = "x 7 2-8";
  const PARLOUR_FRONT = "x 12 12-18";
  const SHOP_HALL = "z 8 7-12";
  check("following Rose in the shop, inside walls stand beyond her room: the shop's with the hall", around.includes(SHOP_HALL));
  check("…and outside walls on the camera's side: the back of the kitchen", around.includes(KITCHEN_BACK));
  check("…but not the wall between her room and the camera, the kitchen's with the shop", !around.includes(KITCHEN_SHOP));
  // A wall that hides only a corner of her room, and none of her, stands since a wall may hide a share of a room; with nothing allowed it comes down, as it did.
  const strict = (await close.evaluate(`(() => { const h = window.manor3d; const kept = h.tolerance.peek(); h.tolerance.set(0); h.settle(); const standing = h.standing("ground"); h.tolerance.set(kept); h.settle(); return standing; })()`)) as string[];
  check("…and one that hides only a corner of her room and none of her stands, the pantry's with the kitchen; with nothing allowed to be hidden, it does not", around.includes(PANTRY_KITCHEN) && !strict.includes(PANTRY_KITCHEN));
  await close.keyboard.press("Escape");
  await pageTime(close, 2500);
  const lookingOver = await standingNow();
  check("letting go of her takes the inside walls down again, and the near outside ones", !lookingOver.includes(SHOP_HALL) && !lookingOver.includes(KITCHEN_BACK));
  check("…and leaves the far ones standing", lookingOver.includes(PARLOUR_FRONT));
  await close.close();

  // Follow the Master for a while: he goes from the cellar to the first floor, and the view goes with him.
  await page.getByRole("button", { name: /^The Master/ }).click();
  await page.getByRole("button", { name: "Speed ×4" }).click();
  check("choosing a speed sets it", (await read(page, (h) => (h as unknown as { speed: { peek: () => number } }).speed.peek())) === 4);
  const seen = new Set<string>();
  const sold = (): Promise<number> => page.evaluate(() => (window as unknown as { manor3d: { game: { sold: number } } }).manor3d.game.sold);
  const soldBefore = await sold();
  let mostPeople = 0;
  for (let i = 0; i < 40; i++) {
    await pageTime(page, 500);
    seen.add(await read(page, (h) => h.view.peek()));
    mostPeople = Math.max(mostPeople, await read(page, (h) => h.world.actors.length));
  }
  check(`following the Master changes storey with him (saw: ${[...seen].join(", ")})`, seen.size >= 2);
  check(`customers come into the shop (most people in the house at once: ${mostPeople})`, mostPeople > 4);
  check("…and bread is sold to them", (await sold()) > soldBefore);
  const drawn = await page.evaluate(() => {
    const h = (window as unknown as { manor3d: { breathing: () => number[]; world: { actors: unknown[] } } }).manor3d;
    return { figures: h.breathing().length, people: h.world.actors.length };
  });
  check(`nobody who has left is still drawn (${drawn.figures} drawn, ${drawn.people} in the house)`, drawn.figures === drawn.people);

  // Each of the rest opens pages of its own. This one is done with, and is shut first: left open it goes on being drawn behind every one of
  // theirs, and with no graphics card that halves how fast each of them is drawn, which is what several of their checks then tripped on
  // (a list or a ledger read before the slowed page had drawn it again: five such in the full runs of 2026-11-16).
  await page.close();
  // They have browsers of their own (check3d-pool.ts), one or several side by side; a part that throws is one failed check, and the rest go on.
  await runParts({ parts: PARTS, workers: workersAsked(), base: BASE, viewport: VIEWPORT, check });

  // How the walls come and go: sliding by default; the round button among the settings, or T, has them appear at once.
  const walls = await browser.newPage({ viewport: VIEWPORT });
  const openWalls = async (): Promise<void> => {
    await walls.goto(`${BASE}demo3d.html?view=ground&help=0&rooms=all`);
    await walls.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
    await pageTime(walls, 600);
    // The walls' button is among the settings: the card is opened to reach it, and is left open.
    await walls.getByRole("button", { name: "Settings" }).click();
  };
  /** Turn to another side of the house and watch every frame: was any wall caught part of the way up? */
  // Written as text for the page to run: a named function compiled here would not exist there.
  const caughtSliding = (degrees: number): Promise<boolean> =>
    walls.evaluate(`new Promise((done) => {
      const h = window.manor3d;
      h.aim(${(degrees * Math.PI) / 180}, 0.9, 30);
      let frames = 0;
      let between = false;
      const watch = () => {
        between = between || h.wallHeights("ground").some((v) => v > 0.02 && v < 0.98);
        if (++frames < 45) requestAnimationFrame(watch);
        else done(between);
      };
      requestAnimationFrame(watch);
    })`) as Promise<boolean>;
  await openWalls();
  const wallsButton = walls.getByRole("button", { name: /^Walls / });
  check("walls slide up and down to begin with", (await caughtSliding(135)) && (await wallsButton.getAttribute("aria-pressed")) === "false");
  await wallsButton.click();
  check("pressing the button has them appear at once", (await wallsButton.getAttribute("aria-pressed")) === "true" && !(await caughtSliding(225)) && !(await caughtSliding(315)));
  await openWalls();
  check("…and that is remembered the next time the page is opened", (await wallsButton.getAttribute("aria-pressed")) === "true" && !(await caughtSliding(135)));
  await walls.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  await walls.keyboard.press("t");
  check("the T key puts them back to sliding", (await wallsButton.getAttribute("aria-pressed")) === "false" && (await caughtSliding(225)));
  await walls.close();

  check(`no page errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, errors.length === 0);
  await browser.close();
  const failed = results.filter(([, ok]) => !ok).length;
  console.log(`${results.length - failed} of ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
};

main().catch((err: unknown) => {
  console.error(String(err));
  process.exit(1);
});
