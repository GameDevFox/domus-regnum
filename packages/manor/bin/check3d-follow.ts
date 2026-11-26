// The checks of the 3D demo page that follow one person, each on a page of its own: at a fixed
// moment of the day, what gets out of her way and whether she stays in sight on a stair; and, sent
// out, whether she is followed from the house to the map and home again. Run by check3d.ts.
import type { Browser, Page } from "@playwright/test";

import { pageTime } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** Time for the camera to finish drifting to someone followed, with the day stopped. */
const CAMERA_SETTLE_MS = 1500;
/** How far above someone's feet the camera aims, and how near that it must be to count: metres. */
const EYE_LIFT = 1;
const AIM_SLACK = 0.3;
// Seconds into the day (seed 1) at which the Master, going about his own day, is…
/** …on the last steps up out of the cellar: above its ceiling, under the ground floor. */
const UP_LAST_STEPS = 14.3;
/** …standing in the hall, off the stair. */
const UP_ARRIVED = 16;
/** …halfway down the cellar stair again. (He is on it from 40.2 s to 46.3 s, since his walks go round the leaves of the doors he passes: a second later than before they did.) */
const DOWN_HALFWAY = 43.2;
const CELLAR_STAIR = "stair.cellar";
/** A camera low over the head of a flight, looking down it: its tilt from straight down in radians, and how far off it is in metres. */
const LOW_TILT = 1.3;
const CLOSE = 12;
/** Time for the map and its card to be redrawn after something is changed. */
const REDRAWN_MS = 350;
/** Seconds of the house's time to run at a go while waiting for something to be seen, and how many goes. */
const LOOK_EVERY = 5;
const LOOKS = 60;
/** Time for the camera to come to rest on whoever is followed. */
const FOLLOWED_MS = 2600;
/** South of this line across the plan is the drive, well clear of the house's front, in metres. */
const DRIVE_Z = 15;

type Seen = { y: number; view: string; shown: boolean; aimY: number };

const advance = async (page: Page, seconds: number): Promise<void> => {
  await page.evaluate(`window.manor3d.advance(${seconds})`);
  await pageTime(page, REDRAWN_MS);
};
/** Run the house on, a little at a time, until something is so. */
const until = async (page: Page, so: () => Promise<boolean>): Promise<boolean> => {
  for (let n = 0; n < LOOKS; n++) {
    if (await so()) return true;
    await advance(page, LOOK_EVERY);
  }
  return so();
};

export const checkFollowed = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  // Tall furniture in the way of someone followed goes see-through, and comes back when she is let go.
  // Evelyn at the oven, seen from the north: its chimney is between the camera and her; the range's hood, beside it, is not.
  const NORTH = 180;
  const oven = await browser.newPage({ viewport });
  await oven.goto(`${base}demo3d.html?view=ground&help=0&follow=evelyn&az=${(NORTH * Math.PI) / 180}`);
  await oven.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  const atTheOven = await oven.evaluate(`(() => {
    const h = window.manor3d;
    h.paused.set(true);
    const evelyn = h.world.actors.find((a) => a.id === "evelyn");
    for (let i = 0; i < 6000 && evelyn.label !== "baking"; i++) h.advance(0.02);
    return evelyn.label === "baking";
  })()`);
  await pageTime(oven, 2000);
  const seeThrough = (): Promise<string[]> => oven.evaluate(() => (window as unknown as { manor3d: { faded: () => string[] } }).manor3d.faded());
  const ghosts = await seeThrough();
  check(`with Evelyn at the oven, seen from behind it, its chimney is see-through (${ghosts.join(", ") || "nothing is"})`, Boolean(atTheOven) && ghosts.includes("kitchen.oven"));
  check("…and the range's hood beside it, which is not in the way, is not", !ghosts.includes("kitchen.range"));
  await oven.keyboard.press("Escape");
  await pageTime(oven, 1000);
  check("letting go of her makes everything solid again", (await seeThrough()).length === 0);
  await oven.close();

  // Someone followed stays in sight on a stair, the cellar's too: the view goes down with him as he
  // steps onto it, comes up once he is off it, and the camera keeps to the height he is at.
  const stair = await browser.newPage({ viewport });
  await stair.goto(`${base}demo3d.html?view=cellar&help=0&follow=master`);
  await stair.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  /** Run the day on to a given second of it and stop it there: the same moment every time. */
  // Written as text for the page to run: a named function compiled here would not exist there.
  const seenAt = (seconds: number): Promise<Seen> =>
    stair.evaluate(`(async () => {
      const h = window.manor3d;
      h.paused.set(true);
      h.advance(${seconds} - h.world.t);
      await new Promise((done) => setTimeout(done, ${CAMERA_SETTLE_MS}));
      const master = h.world.actors.find((a) => a.id === "master");
      return { y: master.walker.pos.y, view: h.view.peek(), shown: h.shown().includes("master"), aimY: Number(h.targetAt().split(",")[1]) };
    })()`) as Promise<Seen>;
  const aimedAt = (seen: Seen): boolean => Math.abs(seen.aimY - (seen.y + EYE_LIFT)) < AIM_SLACK;
  const up = await seenAt(UP_LAST_STEPS);
  check(`followed up out of the cellar, the Master is in sight to the last step (at ${up.y.toFixed(2)} m, looking into: ${up.view})`, up.view === "cellar" && up.shown);
  const arrived = await seenAt(UP_ARRIVED);
  check(`…and off the stair, the view comes up to the floor he is on (${arrived.view})`, arrived.view === "ground" && arrived.shown);
  const down = await seenAt(DOWN_HALFWAY);
  check(`followed down again, the view goes to the cellar while he is on its stair, and he is in sight (at ${down.y.toFixed(2)} m, looking into: ${down.view})`, down.view === "cellar" && down.shown);
  check(`…with the camera aimed at the height he is at, not at a floor (aimed at ${down.aimY.toFixed(2)} m)`, aimedAt(down) && aimedAt(up));
  // The stair he is on stays solid under him: its steps are low, to him. Only the steps above him can be in the way.
  const ghostStairs = (): Promise<string[]> => stair.evaluate(() => (window as unknown as { manor3d: { faded: () => string[] } }).manor3d.faded());
  check("…and the stair under him is solid, not see-through", !(await ghostStairs()).includes(CELLAR_STAIR));
  await stair.evaluate(`window.manor3d.aim(${(NORTH * Math.PI) / 180}, ${LOW_TILT}, ${CLOSE})`);
  await pageTime(stair, CAMERA_SETTLE_MS);
  check("…until it is seen from low over its head, looking down it: then the steps above him are in the way, and it is", (await ghostStairs()).includes(CELLAR_STAIR));
  // Choosing a floor by hand that he would not be followed in lets go of him, as it does when he stands on a floor.
  await stair.keyboard.press("r");
  await pageTime(stair, CAMERA_SETTLE_MS);
  const chosen = await stair.evaluate(() => {
    const h = (window as unknown as { manor3d: { view: { peek: () => string }; following: { peek: () => string | null } } }).manor3d;
    return { view: h.view.peek(), following: h.following.peek() };
  });
  check(`…and going up a floor by hand while he is on the cellar stair lets go of him and stays there (${chosen.view})`, chosen.following === null && chosen.view === "ground");
  await stair.close();
};

/** Whoever is followed is followed from the house to the map as she goes out at the gate, and from the map to the house as she comes home. */
export const checkFollowedAcross = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  await page.goto(`${base}demo3d.html?help=0&view=ground`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  // (The town's shops are found to begin with, as they were when this was written: the finding of them is check3d-shops.ts's.)
  await page.evaluate(`window.manor3d.game.shops.push("miller", "greengrocer", "books", "herbalist", "clothes")`);
  await page.evaluate(`window.manor3d.paused.set(true)`);
  const seen = (): Promise<{ map: number; following: string | null; ringed: number; card: number; shown: boolean; state: string | null; targetZ: number }> =>
    page.evaluate(`(() => { const h = window.manor3d; return { map: document.querySelectorAll(".map-frame").length, following: h.following.peek(), ringed: document.querySelectorAll('.map-token.followed[data-who="sage"]').length, card: document.querySelectorAll('.character-card[data-who="sage"]').length, shown: h.shown().includes("sage"), state: h.game.outings.find((o) => o.who === "sage")?.state ?? null, targetZ: Number(h.targetAt().split(",")[2]) }; })()`) as never;

  await page.evaluate(`import("/src/game/index.ts").then((G) => { const h = window.manor3d; h.game.coin = 100; h.following.set("sage"); G.sendToTown(h.game, "sage", "flour", true); })`);
  await advance(page, 1);
  const leaving = await seen();
  check("someone followed and sent out is followed still as she walks out, in the house's view", leaving.following === "sage" && leaving.map === 0 && leaving.state === "leaving" && leaving.card === 1);
  const gone = await until(page, async () => (await seen()).state === "away");
  await pageTime(page, REDRAWN_MS);
  const out = await seen();
  check("as she goes out at the gate the view follows her to the map: it opens, she is followed still, her face on it is ringed, and her card stays up", gone && out.map === 1 && out.following === "sage" && out.ringed === 1 && out.card === 1);
  const home = await until(page, async () => (await seen()).state === "coming");
  await pageTime(page, REDRAWN_MS);
  const back = await seen();
  check("as she comes in at the gate the view follows her home: the map is shut, and she is seen on the drive, followed", home && back.map === 0 && back.following === "sage" && back.shown && back.card === 1);
  await pageTime(page, FOLLOWED_MS);
  check(`…and the view goes to her there, out by the gate (it looks ${(await seen()).targetZ.toFixed(1)} m south)`, (await seen()).targetZ > DRIVE_Z);

  // On the map, her number lets her go; and let go, she is not brought back to when she comes home.
  await page.evaluate(`import("/src/game/index.ts").then((G) => G.sendToTown(window.manor3d.game, "rose", "flour", true))`);
  await until(page, async () => ((await page.evaluate(`window.manor3d.game.outings.find((o) => o.who === "rose")?.state`)) as string) === "away");
  await page.keyboard.press("2");
  await pageTime(page, REDRAWN_MS);
  const picked = (await page.evaluate(`[window.manor3d.following.peek(), document.querySelectorAll('.map-token.followed[data-who="rose"]').length, document.querySelectorAll(".map-frame").length, document.querySelectorAll('.character-card[data-who="rose"]').length]`)) as [string | null, number, number, number];
  await page.keyboard.press("2");
  await pageTime(page, REDRAWN_MS);
  const dropped = (await page.evaluate(`[window.manor3d.following.peek(), document.querySelectorAll(".map-token.followed").length, document.querySelectorAll(".map-frame").length]`)) as [string | null, number, number];
  check("the number of someone who is out opens the map and follows her on it, with her card at the right; pressed again it lets her go, and the map stays", picked.join() === "rose,1,1,1" && dropped.join() === ",0,1");
  await until(page, async () => ((await page.evaluate(`window.manor3d.game.outings.find((o) => o.who === "rose")?.state ?? "home"`)) as string) !== "away");
  await pageTime(page, REDRAWN_MS);
  check("someone who is not followed comes home without the view going anywhere: the map stays open", (await page.locator(".map-frame").count()) === 1 && (await page.evaluate(`window.manor3d.following.peek()`)) === null);
  await page.close();
};
