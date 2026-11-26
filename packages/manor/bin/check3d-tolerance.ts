// The check of how much of a room a wall may hide and still stand, on the 3D demo page
// (src/demo3d/cutaway.ts, wall-tolerance.ts): the two walls the author named stand, nobody is
// hidden by what is allowed, and the dev menu's slider for it works and is remembered. Run by check3d.ts.
import type { Browser } from "@playwright/test";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** The camera's sides, in degrees (0 is due south of the house, 90 due east); and how it is tilted and how far off, as the page begins. */
const SOUTH_WEST = 315;
const NORTH_EAST = 135;
const TILT = 0.9;
const FAR = 30;
/** Walls of the ground floor, each as the page names it: the back of the passage between the kitchen and the dining room, and the shop's front east of its window. */
const PASSAGE_BACK = "x 1 8-12";
const SHOP_FRONT = "x 12 7-8";
/** The kitchen's west wall, which from the north-east hides a good part of the pantry beyond it. */
const KITCHEN_WEST = "z 2 1-3";
/** The corner of the dining room that the passage's back wall hides from the south-west; and the far side of that room, which it does not. */
const IN_THE_CORNER = { x: 12.3, z: 0.5 };
const ACROSS_THE_ROOM = { x: 17, z: 4 };
/** What a first visit has, and what the check moves the slider to (hundredths of a room). */
const FIRST = 5;
const MOVED = 10;

export const checkTolerance = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  // One browser context, so that what it remembers lasts from one opening of the page to the next.
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const open = async (more = ""): Promise<void> => {
    // (The whole storey is looked over: which outside walls stand is then the camera's to say, and the tolerance's.)
    await page.goto(`${base}demo3d.html?view=ground&rooms=all&help=0${more}`);
    await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
    await page.evaluate(`window.manor3d.paused.set(true)`);
  };
  /** The walls standing on the ground floor, seen from a side, once they have all finished rising and dropping. */
  const standing = (degrees: number): Promise<string[]> => page.evaluate(`(() => { const h = window.manor3d; h.aim(${(degrees * Math.PI) / 180}, ${TILT}, ${FAR}); h.settle(); h.settle(); return h.standing("ground"); })()`) as Promise<string[]>;
  /** The same, with the view left where it is: for what changes without the camera moving. */
  const standingStill = (): Promise<string[]> => page.evaluate(`(() => { const h = window.manor3d; h.settle(); h.settle(); return h.standing("ground"); })()`) as Promise<string[]>;
  const allowed = async (): Promise<number> => Math.round(((await page.evaluate(`window.manor3d.tolerance.peek()`)) as number) * 1000) / 10;
  const allow = (percent: number): Promise<void> => page.evaluate(`window.manor3d.tolerance.set(${percent / 100})`) as Promise<void>;
  const stand = (id: string, at: { x: number; z: number }): Promise<void> => page.evaluate(`import("/src/space/index.ts").then(({ addActorAt }) => { const { world } = window.manor3d; addActorAt(world, "${id}", "A caller", world.actors[0].sprite, ${JSON.stringify(at)}); })`) as Promise<void>;
  const gone = (id: string): Promise<void> => page.evaluate(`import("/src/space/index.ts").then(({ removeActor }) => removeActor(window.manor3d.world, "${id}"))`) as Promise<void>;

  await open();
  check(`on a first visit a wall may hide a twentieth of a room (${await allowed()}%)`, (await allowed()) === FIRST);
  const southWest = await standing(SOUTH_WEST);
  const northEast = await standing(NORTH_EAST);
  check("from the south-west the passage's back wall stands, though it hides a corner of the dining room", southWest.includes(PASSAGE_BACK));
  check("from the north-east the shop's front beside its window stands, though it hides some of the bay the window is in", northEast.includes(SHOP_FRONT));
  check("…while the kitchen's west wall, which hides a good part of the pantry from there, is down all the same", !northEast.includes(KITCHEN_WEST));
  await allow(0);
  const strict = [await standing(SOUTH_WEST), await standing(NORTH_EAST)];
  check("with nothing allowed, both come down, as they did before", !strict[0].includes(PASSAGE_BACK) && !strict[1].includes(SHOP_FRONT));
  await allow(FIRST);
  check("…and allowed again, the passage's stands again from the same place: it does not hang on which way the view came round", (await standing(SOUTH_WEST)).includes(PASSAGE_BACK));

  await allow(0);
  const stillDown = await standingStill();
  await allow(FIRST);
  check("the walls answer to the number as it is changed, with the view left where it is: down at nothing, and up again", !stillDown.includes(PASSAGE_BACK) && (await standingStill()).includes(PASSAGE_BACK));

  // Nobody is hidden by what is allowed.
  await stand("check-diner", ACROSS_THE_ROOM);
  check("someone across the dining room, whom that wall does not hide, leaves it standing", (await standing(SOUTH_WEST)).includes(PASSAGE_BACK));
  await stand("check-caller", IN_THE_CORNER);
  check("someone in the corner it hides brings it down: nobody is hidden by what is allowed", !(await standing(SOUTH_WEST)).includes(PASSAGE_BACK));
  await gone("check-caller");
  await gone("check-diner");
  check("…and it stands again once she has gone", (await standing(SOUTH_WEST)).includes(PASSAGE_BACK));

  // The dev menu's slider.
  await open("&dev=1");
  await page.getByRole("button", { name: "Dev menu", exact: true }).click();
  const slider = page.getByRole("slider", { name: "How much of a room a wall may hide and still stand" });
  const says = page.locator(".dev-slider-says");
  check(`the dev menu has a slider for it, which stands at what is allowed and says so (${await says.textContent()})`, (await slider.inputValue()) === String(FIRST) && (await says.textContent()) === `${FIRST}% of a room`);
  await slider.fill(String(MOVED));
  check(`moved, it allows that much, and says so (${await says.textContent()}; ${await allowed()}%)`, (await allowed()) === MOVED && (await says.textContent()) === `${MOVED}% of a room`);
  await slider.fill("0");
  await page.keyboard.press("Escape");
  check("moved to nothing, the passage's back wall comes down from the south-west", (await allowed()) === 0 && !(await standing(SOUTH_WEST)).includes(PASSAGE_BACK));
  await open();
  check(`what was chosen is kept: the next time the page is opened, it is still nothing (${await allowed()}%)`, (await allowed()) === 0 && !(await standing(SOUTH_WEST)).includes(PASSAGE_BACK));
  await open(`&tolerance=${MOVED}`);
  check(`asked for in the page's address, that is what is allowed, whatever is kept (${await allowed()}%)`, (await allowed()) === MOVED && (await standing(SOUTH_WEST)).includes(PASSAGE_BACK));
  await open();
  check(`…and nothing is kept of that (${await allowed()}%)`, (await allowed()) === 0);
  check("the tolerance throws no errors", errors.length === 0);
  await context.close();
};
