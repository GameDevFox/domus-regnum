// The check of the 3D demo page's choice of which walls come down while nobody is followed: only
// those of the rooms with someone in them ("With Characters", which a first visit has), or those
// of the whole storey ("All Rooms"). Among the settings, by its key, and remembered. Run by
// check3d.ts.
import type { Browser } from "@playwright/test";

import { pageTime } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** The camera's two sides: from the south-east, and from the north-west, in degrees; and how it is tilted and how far off. */
const SOUTH_EAST = 45;
const NORTH_WEST = 225;
const TILT = 0.9;
const FAR = 30;
/** Walls of the ground floor, each as the page names it: axis, where, and from where to where. */
const SHOP_HALL = "z 8 7-12";
const DINING_PARLOUR = "x 6 12-18";
const PARLOUR_FRONT = "x 12 12-18";
const HALL_PARLOUR = "z 12 6-12";
/** Somewhere in the middle of the parlour, and on the grass south of the shop's window. */
const IN_PARLOUR = { x: 15, z: 9 };
const ON_THE_GRASS = { x: 5, z: 15 };

export const checkRooms = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  // One browser context, so that what it remembers lasts from one opening of the page to the next.
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const open = async (): Promise<void> => {
    await page.goto(`${base}demo3d.html?view=ground&help=0`);
    await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
    // Time stands still: everybody stays in the room she is in.
    await page.evaluate(`window.manor3d.paused.set(true)`);
  };
  // By its class, not its name: it is among the settings, and is not on show until their card is opened.
  const button = page.locator(".rooms-button");
  /** The walls standing on the ground floor, seen from a side, once they have all finished rising and dropping. */
  const standing = (degrees: number): Promise<string[]> => page.evaluate(`(() => { const h = window.manor3d; h.aim(${(degrees * Math.PI) / 180}, ${TILT}, ${FAR}); h.settle(); return h.standing("ground"); })()`) as Promise<string[]>;
  /** The rooms of the ground floor with someone in them. */
  const peopled = (): Promise<string[]> => page.evaluate(`import("/src/space/index.ts").then(({ roomAt }) => { const { world } = window.manor3d; return [...new Set(world.actors.filter((a) => a.walker.pos.y === world.plan.storeys.ground.y).map((a) => roomAt(world.plan, "ground", a.walker.pos.x, a.walker.pos.z)?.id ?? "out of doors"))]; })`) as Promise<string[]>;
  /** Someone of the check's own, stood somewhere on the ground floor; and gone again. */
  const stand = (id: string, at: { x: number; z: number }): Promise<void> => page.evaluate(`import("/src/space/index.ts").then(({ addActorAt }) => { const { world } = window.manor3d; addActorAt(world, "${id}", "A caller", world.actors[0].sprite, ${JSON.stringify(at)}); })`) as Promise<void>;
  const gone = (id: string): Promise<void> => page.evaluate(`import("/src/space/index.ts").then(({ removeActor }) => removeActor(window.manor3d.world, "${id}"))`) as Promise<void>;

  await open();
  const rooms = await peopled();
  check(`to begin with someone is in the shop, and nobody in the parlour or the dining room (${rooms.join(", ")})`, rooms.includes("shop") && !rooms.includes("parlour") && !rooms.includes("dining"));
  const byRoom = await standing(SOUTH_EAST);
  check("to begin with only the rooms with someone in them are opened: the walls of the empty parlour stand, inside and out", (await button.getAttribute("aria-pressed")) === "false" && byRoom.includes(DINING_PARLOUR) && byRoom.includes(PARLOUR_FRONT));
  check("…while the wall between the camera and the shop, where someone is, is down", !byRoom.includes(SHOP_HALL));

  // Someone comes into the parlour: its walls come down; she goes, and they stand again.
  await stand("check-caller", IN_PARLOUR);
  const called = await standing(SOUTH_EAST);
  check("someone comes into the parlour, a caller and none of the household: the wall before it comes down", !called.includes(PARLOUR_FRONT));
  await gone("check-caller");
  check("…and stands again once she has gone", (await standing(SOUTH_EAST)).includes(PARLOUR_FRONT));
  // Whoever is out of doors opens nothing.
  await stand("check-stroller", ON_THE_GRASS);
  const strolled = await standing(SOUTH_EAST);
  check("someone on the grass before the house opens nothing: the same walls stand", strolled.join("|") === byRoom.join("|"));
  await gone("check-stroller");

  // Following someone is as it ever was: the question is asked of her room alone.
  await stand("check-caller", IN_PARLOUR);
  check("from the north-west, with someone in the parlour, the hall's wall before the parlour is down", !(await standing(NORTH_WEST)).includes(HALL_PARLOUR));
  await page.evaluate(`window.manor3d.following.set("rose")`);
  await pageTime(page, 2500);
  const followed = (await page.evaluate(`window.manor3d.standing("ground")`)) as string[];
  check("following Rose in the shop is as it ever was: only her room is opened, and that wall stands though someone is in the parlour", followed.includes(HALL_PARLOUR));
  await page.keyboard.press("Escape");
  await pageTime(page, 2500);
  check("…and letting go of her opens the parlour again", !((await page.evaluate(`window.manor3d.standing("ground")`)) as string[]).includes(HALL_PARLOUR));
  await gone("check-caller");

  // The O key: the whole storey is opened.
  await page.keyboard.press("o");
  const whole = await standing(SOUTH_EAST);
  check("the O key opens the whole storey: no inside wall stands, not even between two empty rooms", (await button.getAttribute("aria-pressed")) === "true" && !whole.includes(DINING_PARLOUR) && !whole.includes(SHOP_HALL) && !whole.includes(PARLOUR_FRONT));
  check(`…so fewer walls stand than did (${whole.length}, from ${byRoom.length})`, whole.length < byRoom.length);

  // Remembered; and its button among the settings puts it back, and its row there is named for the way it is.
  await open();
  check("the choice is kept: the next time the page is opened, the whole storey is opened", (await button.getAttribute("aria-pressed")) === "true" && !(await standing(SOUTH_EAST)).includes(DINING_PARLOUR));
  await page.getByRole("button", { name: "Settings" }).click();
  const row = page.locator(".settings-row", { has: button }).locator(".settings-says");
  check(`its button is among the settings, its row named for the way it is, and it says what pressing it does (${await row.textContent()})`, (await page.getByRole("button", { name: /^Every room of the storey is opened/ }).count()) === 1 && (await row.textContent()) === "Wall Hiding: All Rooms" && ((await button.getAttribute("title")) ?? "").endsWith("Press to open only the rooms with someone in them. Key O"));
  await button.click();
  check(`pressing it opens only the rooms with someone in them again, and its row says so (${await row.textContent()})`, (await button.getAttribute("aria-pressed")) === "false" && (await row.textContent()) === "Wall Hiding: With Characters" && ((await button.getAttribute("aria-label")) ?? "").startsWith("Only the rooms with someone in them are opened"));
  // The card is shut by the cross in its corner.
  const cross = page.getByRole("button", { name: "Close the settings" });
  const corner = await cross.boundingBox();
  const cardBox = await page.locator(".settings-card").boundingBox();
  await cross.click();
  check("the settings card has a cross in its top right corner, which shuts it", corner !== null && cardBox !== null && corner.x > cardBox.x + cardBox.width / 2 && corner.y < cardBox.y + cardBox.height / 3 && (await page.locator(".settings-card").isHidden()) && (await page.locator(".settings-card").getByText("Close", { exact: true }).count()) === 0);
  check("…and the parlour's walls stand again", (await standing(SOUTH_EAST)).includes(DINING_PARLOUR));
  await open();
  check("…and that is kept too", (await button.getAttribute("aria-pressed")) === "false" && (await standing(SOUTH_EAST)).includes(DINING_PARLOUR));
  // Asked for in the page's address, the whole storey is opened whatever is remembered, and nothing is remembered of it.
  await page.goto(`${base}demo3d.html?view=ground&help=0&rooms=all`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  await page.evaluate(`window.manor3d.paused.set(true)`);
  check("asked for in the page's address, the whole storey is opened whatever is remembered", !(await standing(SOUTH_EAST)).includes(DINING_PARLOUR) && (await button.getAttribute("aria-pressed")) === "true");
  await open();
  check("…and nothing is remembered of it: opened again without it, only the rooms with someone in them are opened", (await button.getAttribute("aria-pressed")) === "false" && (await standing(SOUTH_EAST)).includes(DINING_PARLOUR));
  await context.close();
};
