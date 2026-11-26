// The checks of the 3D demo page that are about a controller: its stick moves the view as
// W A S D do, its triggers turn it as Q and E do, its shoulder buttons go from one of the
// household to the next, and up and down on its directional pad change floor as R and F do. There is no
// controller behind a headless browser, so the page is given one made of plain values, which is
// all the browser's own would be. Run by check3d.ts.
import type { Browser, Page } from "@playwright/test";

import { frames, KEY_FRAME_MS, PAD_FRAME_MS, pageTime } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** How long the stick (or a key) is held over, in milliseconds of the page's own frames, which is what it moves by; and how long a turn or a change of floor takes to finish. */
const HELD_MS = 600;
const SETTLE_MS = 1800;
/** A button is seen down by the page in one frame and let up in another: this many of the page's frames each way, however long they take. */
const BUTTON_FRAMES = 2;
/** The map has been slid when what is looked at has moved this far, in the map's own units (a sheet is one across). */
const SLID = 0.02;
/** The steepest the view may look down on the house: how far from straight down, in radians. */
const STEEPEST = 0.2;
/** Leant half over, the view goes less than this share of how far it goes leant right over (half, on a machine that keeps time). */
const SLOWER = 0.85;
/** The pad's buttons, in the standard layout. */
const BUTTON = { leftShoulder: 4, rightShoulder: 5, leftTrigger: 6, rightTrigger: 7, padUp: 12, padDown: 13, face: [0, 1, 2, 3] };

/** Set the made-up pad: where its stick is, and which buttons are down. */
const pad = (page: Page, stick: [number, number], down: number[] = [], right: [number, number] = [0, 0]): Promise<unknown> =>
  page.evaluate(
    ([axes, held, turn]) => {
      const buttons = Array.from({ length: 16 }, (_, n) => ({ pressed: held.includes(n), touched: held.includes(n), value: held.includes(n) ? 1 : 0 }));
      (window as unknown as { pad: unknown }).pad = { connected: true, mapping: "standard", index: 0, id: "A made-up pad", axes: [...axes, ...turn], buttons };
    },
    [stick, down, right] as [number[], number[], number[]],
  );
/** How far the view is tilted from straight down, in radians: by where the camera is and what it looks at. */
const tilt = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const h = (window as unknown as { manor3d: { targetAt: () => string; cameraAt: () => string } }).manor3d;
    const [tx, ty, tz] = h.targetAt().split(",").map(Number);
    const [cx, cy, cz] = h.cameraAt().split(",").map(Number);
    return Math.acos((cy - ty) / Math.hypot(cx - tx, cy - ty, cz - tz));
  });
const at = (page: Page): Promise<{ target: number[]; azimuth: number; view: string; following: string | null }> =>
  page.evaluate(() => {
    const h = (window as unknown as { manor3d: { targetAt: () => string; azimuth: () => number; view: { peek: () => string }; following: { peek: () => string | null } } }).manor3d;
    return { target: h.targetAt().split(",").map(Number), azimuth: h.azimuth(), view: h.view.peek(), following: h.following.peek() };
  });
/** How far round one heading is from another, in degrees, either way. */
const turned = (from: number, to: number): number => ((to - from + 540) % 360) - 180;

export const checkGamepad = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // The page asks the browser for its pads: it is told of the made-up one, once there is one.
  await page.addInitScript(() => {
    navigator.getGamepads = () => [((window as unknown as { pad?: Gamepad }).pad ?? null) as Gamepad | null];
  });
  await page.goto(`${base}demo3d.html?help=0&view=ground`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  await page.evaluate(`window.manor3d.paused.set(true)`);

  // (A page only just opened draws slowly for a moment, and how far the view goes is reckoned frame by frame: it is given that moment.)
  await pageTime(page, SETTLE_MS);

  // The stick: the view moves the way it is leant, and stops when it is let go.
  const start = await at(page);
  await pad(page, [0.1, -0.1]);
  await pageTime(page, HELD_MS, PAD_FRAME_MS);
  const rested = await at(page);
  check("a stick barely off its middle moves nothing", rested.target.join() === start.target.join());
  await page.keyboard.down("d");
  await pageTime(page, HELD_MS, KEY_FRAME_MS);
  await page.keyboard.up("d");
  const byKey = await at(page);
  const keyWay = [byKey.target[0] - rested.target[0], byKey.target[2] - rested.target[2]];
  await pad(page, [1, 0]);
  await pageTime(page, HELD_MS, PAD_FRAME_MS);
  await pad(page, [0, 0]);
  const byStick = await at(page);
  const stickWay = [byStick.target[0] - byKey.target[0], byStick.target[2] - byKey.target[2]];
  const along = (keyWay[0] * stickWay[0] + keyWay[1] * stickWay[1]) / (Math.hypot(...keyWay) * Math.hypot(...stickWay) || 1);
  check(`the stick leant right moves the view the way D does (${Math.hypot(...stickWay).toFixed(1)} m, D ${Math.hypot(...keyWay).toFixed(1)} m)`, Math.hypot(...stickWay) > 1 && along > 0.99);
  await pageTime(page, HELD_MS / 2, PAD_FRAME_MS);
  check("let go, it stops", (await at(page)).target.join() === byStick.target.join());
  // Leant half over it goes slower: measured between two goes leant right over, so that a machine drawing faster or slower as it goes does not tell.
  const went = async (lean: number): Promise<number> => {
    const from = await at(page);
    await pad(page, [lean, 0]);
    await pageTime(page, HELD_MS, PAD_FRAME_MS);
    await pad(page, [0, 0]);
    const to = await at(page);
    return Math.hypot(to.target[0] - from.target[0], to.target[2] - from.target[2]);
  };
  const [full, half, fullAgain] = [await went(1), await went(0.6), await went(1)];
  check(`leant half over, it moves slower than leant right over (${half.toFixed(1)} m, between goes of ${full.toFixed(1)} m and ${fullAgain.toFixed(1)} m)`, half > 0 && half < Math.max(full, fullAgain) * SLOWER);
  await page.evaluate(`window.manor3d.following.set("rose")`);
  await pad(page, [0, 1]);
  await pageTime(page, HELD_MS / 2, PAD_FRAME_MS);
  await pad(page, [0, 0]);
  check("moving the view with the stick lets go of whoever was followed, as the keys do", (await at(page)).following === null);

  // The triggers turn the view, as Q and E do; a button held turns once.
  const before = await at(page);
  await pad(page, [0, 0], [BUTTON.leftTrigger]);
  await pageTime(page, SETTLE_MS);
  const left = await at(page);
  await pageTime(page, SETTLE_MS / 2);
  const still = await at(page);
  await pad(page, [0, 0]);
  check(`the left trigger turns the view to the next diagonal as Q does, once for as long as it is held (${turned(before.azimuth, left.azimuth).toFixed(0)}°)`, Math.abs(Math.abs(turned(before.azimuth, left.azimuth)) - 90) < 2 && Math.abs(turned(left.azimuth, still.azimuth)) < 1);
  await page.keyboard.press("e");
  await pageTime(page, SETTLE_MS);
  const byE = await at(page);
  await page.keyboard.press("q");
  await pageTime(page, SETTLE_MS);
  await pad(page, [0, 0], [BUTTON.rightTrigger]);
  await pageTime(page, SETTLE_MS);
  await pad(page, [0, 0]);
  const right = await at(page);
  check(`the right trigger turns it the other way, as E does (${turned(left.azimuth, right.azimuth).toFixed(0)}°)`, Math.abs(turned(byE.azimuth, right.azimuth)) < 2 && Math.abs(turned(left.azimuth, right.azimuth) + turned(before.azimuth, left.azimuth)) < 2);

  // Up and down on the directional pad change floor, as R and F do; the buttons on its face do nothing.
  await pad(page, [0, 0], [BUTTON.padUp]);
  await frames(page, BUTTON_FRAMES);
  await pad(page, [0, 0]);
  const upOne = await at(page);
  await pad(page, [0, 0], [BUTTON.padDown]);
  await frames(page, BUTTON_FRAMES);
  await pad(page, [0, 0]);
  const downOne = await at(page);
  check(`up on the directional pad goes up a floor as R does, and down comes down again as F does (${right.view} → ${upOne.view} → ${downOne.view})`, right.view === "ground" && upOne.view === "first" && downOne.view === "ground");
  await pad(page, [0, 0], BUTTON.face);
  await frames(page, BUTTON_FRAMES);
  await pad(page, [0, 0]);
  const squeezed = await at(page);
  check("the buttons on its face do nothing", squeezed.view === downOne.view && Math.abs(turned(downOne.azimuth, squeezed.azimuth)) < 1 && squeezed.following === null);

  // The shoulders go from one of the household to the next, as 1, 2, 3 and 4 do, and then to nobody.
  const press = async (button: number): Promise<string | null> => {
    await pad(page, [0, 0], [button]);
    await frames(page, BUTTON_FRAMES);
    await pad(page, [0, 0]);
    await frames(page, BUTTON_FRAMES);
    return (await at(page)).following;
  };
  const onward: (string | null)[] = [];
  for (let n = 0; n < 6; n++) onward.push(await press(BUTTON.rightShoulder));
  check(`the right shoulder goes to the first of the household, then each of the rest in the order of the list, then nobody, then the first again (${onward.map((who) => who ?? "nobody").join(", ")})`, onward.join() === ["master", "evelyn", "rose", "sage", "", "master"].join());
  const back = [await press(BUTTON.leftShoulder), await press(BUTTON.leftShoulder)];
  check(`the left shoulder goes back the other way: to nobody, then the last of the household (${back.map((who) => who ?? "nobody").join(", ")})`, back[0] === null && back[1] === "sage");
  await page.evaluate(`window.manor3d.following.set(null)`);
  await page.evaluate(`window.manor3d.view.set("ground")`);

  // The right stick turns the view about what is looked at, and tilts it: freely, and what is looked at stays put.
  // (The view is still settling to its floor after the last change of one: it is given the time.)
  await pageTime(page, SETTLE_MS);
  const [turnedFrom, tiltedFrom] = [await at(page), await tilt(page)];
  await pad(page, [0, 0], [], [1, 0]);
  await pageTime(page, HELD_MS / 2, PAD_FRAME_MS);
  await pad(page, [0, 0]);
  const turnedTo = await at(page);
  const round = turned(turnedFrom.azimuth, turnedTo.azimuth);
  check(`the right stick leant right turns the house to the right, by as much as it is held and not to the next diagonal (${round.toFixed(0)}°), about what is looked at`, round < -5 && round > -80 && Math.abs(Math.abs(round) - 90) > 5 && turnedTo.target.join() === turnedFrom.target.join() && Math.abs((await tilt(page)) - tiltedFrom) < 0.01);
  await pad(page, [0, 0], [], [0, -1]);
  await pageTime(page, HELD_MS / 2, PAD_FRAME_MS);
  await pad(page, [0, 0]);
  const lower = await tilt(page);
  await pad(page, [0, 0], [], [0, 1]);
  await pageTime(page, HELD_MS * 4, PAD_FRAME_MS);
  await pad(page, [0, 0]);
  const steepest = await tilt(page);
  check(`leant up it brings the view down towards the level, and leant down it goes up over the house, no steeper than a drag can take it (${tiltedFrom.toFixed(2)} → ${lower.toFixed(2)} → ${steepest.toFixed(2)})`, lower > tiltedFrom + 0.05 && Math.abs(steepest - STEEPEST) < 0.01);

  // With the map open the stick slides the map, as W A S D do, and the house's view stays where it was.
  await page.keyboard.press("m");
  await pageTime(page, HELD_MS);
  // (Drawn nearer first, so that there is somewhere to slide to.)
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  await pageTime(page, HELD_MS);
  const look = (): Promise<{ x: number; y: number } | null> => page.evaluate(`window.manor3d.map.look()`) as Promise<{ x: number; y: number } | null>;
  const mapBefore = await look();
  const houseBefore = await at(page);
  await pad(page, [1, 0]);
  await pageTime(page, HELD_MS, PAD_FRAME_MS);
  await pad(page, [0, 0]);
  const mapAfter = await look();
  check(`with the map open the stick slides the map: leant right, what is looked at is farther right (${mapBefore?.x.toFixed(3)} → ${mapAfter?.x.toFixed(3)}), and the house's view is left alone`, mapBefore !== null && mapAfter !== null && mapAfter.x > mapBefore.x + SLID && (await at(page)).target.join() === houseBefore.target.join());
  check(`a controller throws no errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, errors.length === 0);
  // The controls page lists a controller's buttons beside the keys, group by group.
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  const controls = page.getByRole("dialog", { name: "Controls" });
  const groups = await controls.locator(".controls-block .heading").allTextContents();
  const rowOf = async (keys: string): Promise<string> => ((await controls.locator(".controls-row", { has: page.locator(".controls-keys", { hasText: new RegExp(`^${keys}$`) }) }).first().locator(".controls-pad").textContent()) ?? "").trim();
  const shoulders = await controls.locator(".controls-row", { has: page.locator(".controls-pad", { hasText: "LB" }) }).locator(".controls-does").textContent();
  check(`the controls page is in groups (${groups.join(" | ")})`, groups.join("|") === "The view|The household|Time|Menus|Settings");
  check(`…and beside each key is its button on a controller: Q ${await rowOf("Q")}, E ${await rowOf("E")}, R ${await rowOf("R")}, F ${await rowOf("F")}, the sticks, and the shoulders (${shoulders})`, (await rowOf("Q")) === "LT" && (await rowOf("E")) === "RT" && (await rowOf("R")) === "D-pad ↑" && (await rowOf("F")) === "D-pad ↓" && (await rowOf("W A S D  or  arrows")) === "Left stick" && (await rowOf("Drag")) === "Right stick" && (await rowOf("H")) === "" && (shoulders ?? "").includes("household"));
  // Work is given on the place's card, which the badge opens: the card says so, for every place of work, and lists the place on the map once.
  const badges = await controls.locator(".controls-row .controls-keys", { hasText: "by a name" }).allTextContents();
  const mapRows = await controls.locator(".controls-row .controls-keys", { hasText: /^Click a place on the map$/ }).count();
  check(`the controls page says the badges of the baking, the shop, the laboratory and the garden open their cards, and lists a place on the map once (${badges.join(" | ")}; ${mapRows})`, badges.length === 1 && ["🥖", "🛎️", "⚗️", "🌱"].every((glyph) => badges[0].includes(glyph)) && mapRows === 1 && !(await controls.textContent())?.includes("Give them the"));
  await page.keyboard.press("Escape");
  await page.close();
};
