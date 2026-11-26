// The checks of the 3D demo page that are about the doors: a leaf in every doorway, shut and as
// high as its wall while nobody is at it; opening ahead of whoever walks through, away from
// her, and then at its full height; shut and low again behind her; and see-through while it
// stands open in the way of whoever is followed. Run by check3d.ts.
import type { Browser, Page } from "@playwright/test";

import { pageTime } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

type Leaf = { name: string; floor: string; open: number; side: number; turned: number | null; up: number | null; /** Where the middle of its first leaf is, on the ground; and of each of its leaves. */ end: { x: number; z: number } | null; ends: { x: number; z: number }[]; /** Where its first leaf hangs from. */ hinge: { x: number; z: number } | null };

/** Time for a few frames to be drawn; and for the camera to come to rest on whoever is followed. */
const DRAWN_MS = 400;
const FOLLOWED_MS = 2600;
const DRAWN_TRIES = 20;
/** The game is run on a thirtieth of a second at a go while something is watched for, and so many goes at the most. */
const TICK = 1 / 30;
const TICKS = 3000;
/** How far a door swings open, in radians: a little short of square to its wall. */
const OPEN_ANGLE = Math.PI * 0.47;
/** The door between the hall and the parlour: in the wall at x = 12, its middle at z = 9; and the front door, in the wall at z = 12, its middle at x = 10. */
const PARLOUR = "door ground z 12 9";
const FRONT = "door ground x 12 10";
/** The hall's door to the shop (its doorway from z = 10.5 to 11.5), hung from its high end; and the kitchen's to the shop (from x = 2.75 to 3.75), hung from its low end: each just inside its frame. */
const HALL_SHOP = "door ground z 8 11";
const KITCHEN_SHOP = "door ground x 7 3.25";
const HALL_SHOP_HINGE_Z = 11.43;
const KITCHEN_SHOP_HINGE_X = 2.82;
/** How high above the floor the middle of a leaf's upper part is, in metres. */
const UPPER_MIDDLE = 1.45;

const LEAVES = `(() => { const h = window.manor3d; const THREE_V = h.scene.position.constructor; return h.world.doors.map((d, n) => {
  const name = "door " + d.floor + " " + d.axis + " " + d.at + " " + d.pos;
  const leaf = h.scene.getObjectByName(name + " leaf");
  const upper = h.scene.getObjectByName(name + " upper");
  const end = leaf ? leaf.children[0].getWorldPosition(new THREE_V()) : null;
  const ends = leaf ? leaf.parent.children.map((pivot) => pivot.children[0].getWorldPosition(new THREE_V())).map((at) => ({ x: at.x, z: at.z })) : [];
  const hung = leaf ? leaf.getWorldPosition(new THREE_V()) : null;
  return { hinge: hung && { x: hung.x, z: hung.z }, ends, name, floor: d.floor, open: h.world.swings[n].open, side: h.world.swings[n].side, turned: leaf ? leaf.rotation.y : null, up: upper ? (upper.visible ? upper.scale.y : 0) : null, end: end && { x: end.x, z: end.z } };
}); })()`;

const leaves = (page: Page): Promise<Leaf[]> => page.evaluate(LEAVES) as Promise<Leaf[]>;
const leafOf = async (page: Page, name: string): Promise<Leaf> => {
  const found = (await leaves(page)).find((leaf) => leaf.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found;
};
/** A door's leaf once it is drawn as it should be: looked at again for a while, since a busy machine draws few frames a second. */
const drawnAs = async (page: Page, name: string, so: (leaf: Leaf) => boolean): Promise<Leaf> => {
  for (let n = 0; n < DRAWN_TRIES; n++) {
    const leaf = await leafOf(page, name);
    if (so(leaf)) return leaf;
    await pageTime(page, DRAWN_MS / 2);
  }
  return leafOf(page, name);
};
/** Run the game on until something is so, a tick at a time; and say what was so of it then. */
const until = <T>(page: Page, so: string, then = "null"): Promise<{ ok: boolean; then: T }> =>
  page.evaluate(`(() => { const h = window.manor3d; const { game, world } = h; const door = (name) => world.swings[world.doors.findIndex((d) => "door " + d.floor + " " + d.axis + " " + d.at + " " + d.pos === name)]; const who = (id) => world.actors.find((a) => a.id === id);
    for (let n = 0; n < ${TICKS}; n++) { if (${so}) return { ok: true, then: ${then} }; h.advance(${TICK}); }
    return { ok: false, then: ${then} }; })()`) as Promise<{ ok: boolean; then: T }>;

export const checkDoors = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  // (With the whole storey opened, so that the walls between rooms are down whoever is where: the doors are what is looked at here.)
  await page.goto(`${base}demo3d.html?help=0&view=ground&rooms=all`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  await page.evaluate(`window.manor3d.paused.set(true)`);
  await page.evaluate(`window.manor3d.settle()`);
  await pageTime(page, DRAWN_MS);

  // Shut, and as high as its wall.
  const atFirst = await leaves(page);
  check(`every doorway of the house has a leaf, and all are shut (${atFirst.length} doors)`, atFirst.length > 15 && atFirst.every((leaf) => leaf.turned === 0 && leaf.open === 0 && leaf.up !== null));
  const ground = atFirst.filter((leaf) => leaf.floor === "ground");
  const half = ground.filter((leaf) => (leaf.up ?? 1) < 0.01);
  const whole = ground.filter((leaf) => (leaf.up ?? 0) > 0.99);
  check(`a shut door is as high as its wall: a half door where the wall is cut down to the rail, a whole one where the wall stands (${half.length} and ${whole.length} of the ground floor's ${ground.length})`, half.length > 0 && whole.length > 0 && half.length + whole.length === ground.length && half.some((leaf) => leaf.name === PARLOUR));

  // Which end of its doorway a door hangs from is the plan's to say: the low end, unless the high is the better.
  const [toShop, toKitchen] = [atFirst.find((leaf) => leaf.name === HALL_SHOP), atFirst.find((leaf) => leaf.name === KITCHEN_SHOP)];
  check(`a door hangs from the end of its doorway the plan gives it: the hall's door to the shop from its south end, clear of the foot of the stairs (z = ${toShop?.hinge?.z.toFixed(2)}), and the kitchen's to the shop from its west end, as most do (x = ${toKitchen?.hinge?.x.toFixed(2)})`, Math.abs((toShop?.hinge?.z ?? 0) - HALL_SHOP_HINGE_Z) < 0.02 && Math.abs((toKitchen?.hinge?.x ?? 0) - KITCHEN_SHOP_HINGE_X) < 0.02);

  // Someone walks through: it opens ahead of her, away from her, at its full height.
  await page.evaluate(`import("/src/space/index.ts").then((S) => S.giveOrders(window.manor3d.world, "rose", [{ do: "go", spot: "parlour.table" }]))`);
  const stirs = await until<{ x: number; z: number }>(page, `door("${PARLOUR}").open > 0`, `{ x: who("rose").walker.pos.x, z: who("rose").walker.pos.z }`);
  const short = 12 - stirs.then.x;
  check(`the door between the hall and the parlour begins to open while she is still short of it (${short.toFixed(2)} m)`, stirs.ok && short > 0.4 && short < 1.6);
  const opened = await until<number>(page, `door("${PARLOUR}").open === 1`, `who("rose").walker.pos.x`);
  const open = await drawnAs(page, PARLOUR, (leaf) => (leaf.up ?? 0) > 0.99 && leaf.turned !== 0);
  check(`it is wide open before she is through it (she is at x = ${opened.then.toFixed(2)}, and the doorway at 12), turned ${(Math.abs(open.turned ?? 0) / Math.PI).toFixed(2)} of a half turn`, opened.ok && opened.then < 12 && Math.abs(Math.abs(open.turned ?? 0) - OPEN_ANGLE) < 0.01);
  check(`it opens away from her, into the parlour, both its leaves (they are at x = ${open.ends.map((at) => at.x.toFixed(2)).join(" and ")})`, open.side === 1 && open.ends.length === 2 && open.ends.every((at) => at.x > 12.15));
  check(`standing open it is at its full height, though its wall is cut down (${open.up?.toFixed(2)})`, (open.up ?? 0) > 0.99);
  const others = (await leaves(page)).filter((leaf) => leaf.floor === "ground" && leaf.name !== PARLOUR && leaf.open > 0).map((leaf) => leaf.name);
  check(`no door that she is not going through has stirred${others.length ? `: ${others.join(", ")}` : ""}`, others.length === 0);
  const shut = await until<number>(page, `door("${PARLOUR}").open === 0 && who("rose").walker.pos.x > 12`, `who("rose").walker.pos.x`);
  const after = await drawnAs(page, PARLOUR, (leaf) => (leaf.up ?? 1) < 0.01 && leaf.turned === 0);
  check(`it shuts behind her (she is at x = ${shut.then.toFixed(2)}), and is a half door again (${after.up?.toFixed(2)})`, shut.ok && after.turned === 0 && (after.up ?? 1) < 0.01);

  // Standing open in the way of whoever is followed, it is see-through, like any tall thing.
  await page.evaluate(`window.manor3d.following.set("rose")`);
  await pageTime(page, FOLLOWED_MS);
  await page.evaluate(`(() => { const h = window.manor3d; const n = h.world.doors.findIndex((d) => "door " + d.floor + " " + d.axis + " " + d.at + " " + d.pos === "${PARLOUR}"); Object.assign(h.world.swings[n], { open: 1, side: 1 }); })()`);
  await pageTime(page, DRAWN_MS);
  // She is stood so that the line from the camera to her passes through the leaf, above the rail.
  await page.evaluate(`(() => { const h = window.manor3d; const rose = h.world.actors.find((a) => a.id === "rose"); const eye = h.cameraAt().split(",").map(Number);
    const leaf = h.scene.getObjectByName("${PARLOUR} leaf").children[0].getWorldPosition(new h.scene.position.constructor());
    const up = eye[1] - rose.walker.pos.y; const share = ${UPPER_MIDDLE} / up;
    rose.walker.pos.x = leaf.x - (eye[0] - rose.walker.pos.x) * share; rose.walker.pos.z = leaf.z - (eye[2] - rose.walker.pos.z) * share; })()`);
  await pageTime(page, FOLLOWED_MS);
  const faded = (await page.evaluate(`window.manor3d.faded()`)) as string[];
  check(`standing open between the camera and whoever is followed, a door goes see-through (${faded.join(", ") || "nothing is"})`, faded.includes(PARLOUR));
  await page.evaluate(`(() => { const h = window.manor3d; const n = h.world.doors.findIndex((d) => "door " + d.floor + " " + d.axis + " " + d.at + " " + d.pos === "${PARLOUR}"); h.world.swings[n].open = 0; })()`);
  await pageTime(page, FOLLOWED_MS);
  check("shut again, it is solid again", !((await page.evaluate(`window.manor3d.faded()`)) as string[]).includes(PARLOUR));
  await page.evaluate(`window.manor3d.following.set(null)`);

  // An outside door: someone sent to town goes out at the front door, which opens outwards for her and shuts after.
  // (The miller's is found for it: no shop is known as a game begins, and nobody is sent to buy at one that is not: check3d-shops.ts.)
  await page.evaluate(`import("/src/game/index.ts").then((G) => { const { game } = window.manor3d; game.coin = 100; game.shops.push("miller"); G.sendToTown(game, "sage"); })`);
  const out = await until<{ open: number; side: number }>(page, `who("sage") && who("sage").walker.pos.z >= 12`, `{ open: door("${FRONT}").open, side: door("${FRONT}").side }`);
  const front = await drawnAs(page, FRONT, (leaf) => leaf.turned !== 0 && (leaf.up ?? 0) > 0.99);
  check(`the front door is open as she goes out at it, and opens outwards (${Math.round(out.then.open * 100)}% open; its leaf is at z = ${front.end?.z.toFixed(2)}, and the wall at 12)`, out.ok && out.then.open > 0.9 && out.then.side === 1 && (front.end?.z ?? 0) > 12.1);
  const gone = await until<number>(page, `game.outings.some((o) => o.who === "sage" && o.state === "away")`, `door("${FRONT}").open`);
  check("it is shut again by the time she is gone at the gate", gone.ok && gone.then === 0);
  check(`the doors throw no errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, errors.length === 0);
  await page.close();
};
