// The checks of the 3D demo page that are about cutscenes: the first caller comes up the drive on
// the second morning, the line being spoken and the speakers' portraits are shown, the scene is
// moved on by a click or a key, a choice is made, and the house goes on when he has gone. The
// scene is staged in a black before it and the house put back in a black after it (curtain.ts):
// nobody but its people is drawn while it plays, the Master starts from his mark, and the clock
// runs at ×1 for it and as fast as it did before after it. All of the page's furniture is put
// away for it and brought back after it, both in the black (ui-layer.ts). Run by check3d.ts.
import type { Browser, Page } from "@playwright/test";

import { pageTime } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** Time for the stage to be redrawn after the scene has moved: it is drawn once a frame. */
const REDRAWN_MS = 300;
/** Time for a portrait to have slid in. */
const SLID_IN_MS = 600;
/** The second morning at ten, in the game's minutes, less a moment. */
const JUST_BEFORE_TEN = 24 * 60 + 10 * 60 - 0.2;
/** Seconds of the house's time to run at a go while waiting for the first line, and how many goes. */
const LOOK_EVERY = 1;
const LOOKS = 90;
/** Real time the page is left to run a scene on its own, in milliseconds: long enough for the caller to walk a few metres at ×1. */
const ON_ITS_OWN_MS = 2000;
/** Lines passed at the most before the scene asks its question, or ends. */
const LINES_AT_MOST = 20;

/** The speed the clock is set to before the scene: not the ordinary one, which a scene is played at. */
const FAST = 4;
/** Where the Master is put for the first caller (src/game/scenes.ts, MASTER_MARK), and how near it counts as on it, in metres. */
const MASTER_MARK = "passage.sideboard";
const ON_THE_MARK = 0.05;
/** How the first caller is looked at: from the south-east, in degrees, and from how far, in metres; and how near counts. */
const SCENE_AZIMUTH = 45;
const SCENE_DISTANCE = 12;
const NEAR_ENOUGH = 0.5;
/** How long the black is waited for, at the most, in milliseconds. */
const BLACK_WAIT_MS = 10000;
/** Nearer black than this is black. */
const BLACK = 0.99;

/** Everyone in the house, in order: where she stands, what she is told and carries, and her task. */
const everyone = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const { game } = (window as unknown as { manor3d: { game: { tasks: Record<string, unknown>; world: { actors: { id: string; walker: { pos: unknown; heading: number }; orders: unknown; carrying: unknown }[] } } } }).manor3d;
    return JSON.stringify(game.world.actors.map((a) => ({ id: a.id, pos: a.walker.pos, heading: a.walker.heading, orders: a.orders, carrying: a.carrying, task: game.tasks[a.id] ?? null })));
  });
/** Watch, frame by frame, how dark the black is at the first frame the scene is playing and at the first frame it is not: what is set up and put back is done in the dark. */
const watchTheBlack = (page: Page): Promise<unknown> =>
  page.evaluate(`(() => {
    window.blackAt = { begun: null, ended: null, away: null, back: null };
    const dark = () => Number(document.querySelector(".curtain")?.style.opacity ?? -1);
    let began = false;
    let was = document.getElementById("ui").hidden;
    const look = () => {
      const playing = window.manor3d.game.scene !== null;
      // (The furniture is looked at each frame too: how dark it was at the frame it was first away, and at the frame it was first back.)
      const hidden = document.getElementById("ui").hidden;
      if (hidden !== was) window.blackAt[hidden ? "away" : "back"] ??= dark();
      was = hidden;
      if (playing && !began) {
        began = true;
        window.blackAt.begun = dark();
      } else if (!playing && began) {
        window.blackAt.ended ??= dark();
        if (window.blackAt.back !== null) return;
      }
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  })()`);
type BlackAt = { begun: number | null; ended: number | null; away: number | null; back: number | null };
const blackAt = (page: Page): Promise<BlackAt> => page.evaluate(`window.blackAt`) as Promise<BlackAt>;
/** The page's standing furniture: what is on show at every moment of an ordinary day (the cards, menus and windows are in the same element, ui-layer.ts). */
const FURNITURE = ["#panel", ".pill-top", ".pill-bottom", ".floors", ".map-widget", ".settings-button"];
/** Which of the furniture is on show; what is on the page itself, outside the one element all of it is in; and whether the picture of the house is slid aside for the panel. */
const furniture = (page: Page): Promise<{ shown: string[]; outside: string[]; slid: boolean }> =>
  page.evaluate(
    `(() => {
      const shown = ${JSON.stringify(FURNITURE)}.filter((s) => { const node = document.querySelector(s); return node !== null && node.getClientRects().length > 0; });
      const outside = [...document.body.children].filter((node) => !["SCRIPT", "STYLE"].includes(node.tagName) && !["stage", "ui", "dev-tools", "loading"].includes(node.id)).map((node) => node.id || node.className);
      return { shown, outside, slid: window.manor3d.slidAside() > 0 };
    })()`,
  ) as Promise<{ shown: string[]; outside: string[]; slid: boolean }>;
const curtainOn = (page: Page): Promise<boolean> => page.evaluate(`window.manor3d.curtain.on()`) as Promise<boolean>;
const curtainGone = (page: Page): Promise<unknown> => page.waitForFunction(() => document.querySelector(".curtain") === null, undefined, { timeout: BLACK_WAIT_MS }).catch(() => null);

type Seen = { clock: number; playing: boolean; line: string | null; who: string | null; waiting: string | null; goal: string | null; priestZ: number | null; sold: number };

const seen = (page: Page): Promise<Seen> =>
  page.evaluate(() => {
    const { game } = (window as unknown as { manor3d: { game: { clock: number; sold: number; goal: string | null; scene: { line: { who: string | null; text: string } | null; waiting: { for: string } | null } | null; world: { actors: { id: string; walker: { pos: { z: number } } }[] } } } }).manor3d;
    const priest = game.world.actors.find((a) => a.id === "priest");
    return { clock: game.clock, playing: game.scene !== null, line: game.scene?.line?.text ?? null, who: game.scene?.line?.who ?? null, waiting: game.scene?.waiting?.for ?? null, goal: game.goal, priestZ: priest ? priest.walker.pos.z : null, sold: game.sold };
  });
const advance = async (page: Page, seconds: number): Promise<void> => {
  await page.evaluate(`window.manor3d.advance(${seconds})`);
  await pageTime(page, REDRAWN_MS);
};

export const checkScene = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  // (Opened with the picture centred in what the panel leaves, not on the window as a first visit has it: so that the room the panel takes is seen to be given to the scene, and taken back.)
  await page.goto(`${base}demo3d.html?help=0&view=ground&map=1&centre=0`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  await page.evaluate(`window.manor3d.paused.set(true)`);
  await page.evaluate(`window.manor3d.speed.set(${FAST})`);
  const count = (selector: string): Promise<number> => page.locator(selector).count();
  const portrait = (side: string) => page.locator(`.scene-portrait.${side}`);

  check("no scene is playing on the first morning", (await count(".scene")) === 0 && !(await seen(page)).playing);
  const before = await furniture(page);
  check(`on an ordinary day all the page's furniture is on show, nothing is on the page itself but the picture and the furniture, and the picture is slid aside for the panel (${before.shown.join(", ")}${before.outside.length ? `; outside: ${before.outside.join(", ")}` : ""})`, before.shown.length === FURNITURE.length && before.outside.length === 0 && before.slid);
  // (…with a customer coming in at once, so that she is in the house when the scene is due, to be put away with the rest.)
  await page.evaluate(`(() => { window.manor3d.game.clock = ${JUST_BEFORE_TEN}; window.manor3d.game.untilCustomer = 0; })()`);
  await watchTheBlack(page);
  await advance(page, 1);
  // The scene is due: the house stops where it is, and the page goes black before anything of the scene is seen.
  const house = await everyone(page);
  const due = await seen(page);
  // (Run on and looked at again at once, in the same moment of the page: the black is still coming.)
  const held = (await page.evaluate(`(() => { const m = window.manor3d; const clock = m.game.clock; m.advance(2); return { on: m.curtain.on(), moved: m.game.clock !== clock }; })()`)) as { on: boolean; moved: boolean };
  check(`as the scene falls due the house stops, and the black comes before anything of it: nobody new, nobody put away (${JSON.parse(house).length} in the house)`, held.on && !held.moved && !due.playing && due.priestZ === null && JSON.parse(house).length > 4 && (await everyone(page)) === house);
  await page.waitForFunction(() => (window as unknown as { manor3d: { game: { scene: unknown } } }).manor3d.game.scene !== null, undefined, { timeout: BLACK_WAIT_MS }).catch(() => null);
  check(`the scene is staged in the dark: the black is all but whole as it begins (${(await blackAt(page)).begun})`, ((await blackAt(page)).begun ?? 0) >= BLACK);
  await curtainGone(page);
  check("the black is taken out of the page once it has faded in", (await page.locator(".curtain").count()) === 0 && !(await curtainOn(page)));
  const opening = await page.evaluate(`(() => { const { world, shown, azimuth, distance, view } = window.manor3d; const m = world.actors.find((a) => a.id === "master"); const mark = world.spots.get("${MASTER_MARK}"); return { inHouse: world.actors.map((a) => a.id).sort(), shown: shown().sort(), fromMark: Math.hypot(m.walker.pos.x - mark.x, m.walker.pos.z - mark.z), azimuth: azimuth(), distance: distance(), view: view.peek() }; })()`) as { inHouse: string[]; shown: string[]; fromMark: number; azimuth: number; distance: number; view: string };
  check(`while it plays nobody but its people is in the house or drawn (${opening.shown.join(", ")})`, opening.inHouse.join() === "master,priest" && opening.shown.every((id) => id === "master" || id === "priest") && opening.shown.includes("priest"));
  check(`the Master starts from his mark (${opening.fromMark.toFixed(2)} m from it)`, opening.fromMark < ON_THE_MARK);
  check(`it is looked at as it is staged: into the ground floor, from the south-east and close (${opening.azimuth.toFixed(0)}°, ${opening.distance.toFixed(1)} m)`, opening.view === "ground" && Math.abs(opening.azimuth - SCENE_AZIMUTH) < NEAR_ENOUGH && Math.abs(opening.distance - SCENE_DISTANCE) < NEAR_ENOUGH);
  check(`the clock's speed is the ordinary ×1 for the scene (×${await page.evaluate(`window.manor3d.speed.peek()`)})`, (await page.evaluate(`window.manor3d.speed.peek()`)) === 1);
  const during = await furniture(page);
  check(`while it plays all the page's furniture is put away: none of it is on show, and only the scene is on the page with the picture (${during.shown.join(", ") || "none"}; ${during.outside.join(", ")})`, during.shown.length === 0 && during.outside.join() === "scene");
  check(`…it was put away in the dark (${(await blackAt(page)).away}), and the picture has the whole window`, ((await blackAt(page)).away ?? 0) >= BLACK && !during.slid);
  const began = await seen(page);
  check(`on the second morning at ten a scene begins: someone is at the gate, out of doors (${began.priestZ?.toFixed(1)} m south)`, began.playing && (await count(".scene")) === 1 && began.priestZ !== null && began.priestZ > 20);
  check("the map is shut for it, and the view goes to him", (await count(".map-frame")) === 0 && (await page.evaluate(`window.manor3d.following.peek()`)) === "priest");
  check("nothing is being said yet: there is no line, and no portrait", (await page.locator(".scene-box").isHidden()) && (await count(".scene-portrait")) === 0);
  await advance(page, 4);
  const walking = await seen(page);
  check(`he walks up the drive, and the clock and the shop stand still the while (${walking.priestZ?.toFixed(1)} m)`, walking.priestZ !== null && began.priestZ !== null && walking.priestZ < began.priestZ - 3 && walking.clock === began.clock && walking.sold === began.sold);
  await page.keyboard.press("m");
  await page.keyboard.press("1");
  await pageTime(page, REDRAWN_MS);
  check("the page's other keys are not heard while a scene plays", (await count(".map-frame")) === 0 && (await page.evaluate(`window.manor3d.following.peek()`)) === "priest");

  // The first line: who speaks is named, and his portrait comes in at his side.
  let now = await seen(page);
  for (let n = 0; n < LOOKS && now.line === null; n++) {
    await advance(page, LOOK_EVERY);
    now = await seen(page);
  }
  await pageTime(page, SLID_IN_MS);
  check(`when he is at the steps and the Master at the door, he speaks: the line is shown, with his name (${await page.locator(".scene-name").textContent()})`, now.who === "priest" && (await page.locator(".scene-text").textContent()) === now.line && (await page.locator(".scene-name").textContent()) === "The young priest");
  const right = await portrait("right").boundingBox();
  const mirrored = await portrait("right").evaluate((node) => getComputedStyle(node).transform);
  check("his portrait stands at the right, tall, lit, and mirrored to face in", right !== null && right.x > viewport.width / 2 && right.height > viewport.height * 0.6 && ((await portrait("right").getAttribute("class")) ?? "").includes("speaking") && mirrored.startsWith("matrix(-1") && ((await portrait("right").getAttribute("src")) ?? "").endsWith("portraits/priest.webp") && (await count(".scene-portrait.left")) === 0);
  check("the name is at his side of the box", ((await page.locator(".scene-name").getAttribute("class")) ?? "").includes("right"));

  // Moved on by a click anywhere: the Master answers, from the left.
  await page.mouse.click(viewport.width / 2, viewport.height / 3);
  await advance(page, 0.2);
  await pageTime(page, SLID_IN_MS);
  const second = await seen(page);
  const unmirrored = await portrait("left").evaluate((node) => getComputedStyle(node).transform);
  check(`a click anywhere moves it on: the Master answers, his portrait comes in at the left, and the priest's goes into shade (${second.line?.slice(0, 30)}…)`, second.who === "master" && second.line !== now.line && (await page.locator(".scene-name").textContent()) === "The Master" && ((await portrait("left").getAttribute("class")) ?? "").includes("speaking") && !((await portrait("right").getAttribute("class")) ?? "").includes("speaking") && !unmirrored.startsWith("matrix(-1") && !((await page.locator(".scene-name").getAttribute("class")) ?? "").includes("right"));
  await page.keyboard.press("Space");
  await advance(page, 0.2);
  const third = await seen(page);
  // (Time was paused when the scene fell due: the pause is put by for the scene, and Space does not put it back.)
  check("Space moves it on too, and does not stop the clock's own button", third.line !== second.line && third.who === "priest" && (await page.evaluate(`window.manor3d.paused.peek()`)) === false);

  // On to the question.
  for (let n = 0; n < LINES_AT_MOST && (await seen(page)).waiting === "advance"; n++) {
    await page.keyboard.press("Enter");
    await advance(page, 0.2);
  }
  const asking = await seen(page);
  // (The buttons are put up on the frame after the question is reached: they are given that frame.)
  await page.waitForFunction(() => document.querySelectorAll(".scene-choice").length > 0, undefined, { timeout: 5000 }).catch(() => null);
  const answers = await page.locator(".scene-choice").allTextContents();
  check(`the scene asks which occasion the house will take on, with each answer a button (${answers.length} answers)`, asking.waiting === "choice" && answers.length === 2 && answers[0].includes("afternoon tea") && asking.goal === null);
  await page.mouse.click(viewport.width / 2, 40);
  await advance(page, 0.2);
  check("a click elsewhere does not pass the question by", (await seen(page)).waiting === "choice");
  await page.locator(".scene-choice").first().click();
  await advance(page, 0.2);
  await page.waitForFunction(() => document.querySelectorAll(".scene-choice").length === 0, undefined, { timeout: 5000 }).catch(() => null);
  const chosen = await seen(page);
  check("pressing an answer takes it: the buttons go, and the scene goes on with what the answer holds", (await count(".scene-choice")) === 0 && chosen.waiting === "advance" && chosen.line !== asking.line);
  for (let n = 0; n < LINES_AT_MOST && (await seen(page)).waiting === "advance"; n++) {
    await page.keyboard.press("Enter");
    await advance(page, 0.2);
  }
  // He walks off down the drive; at the end of the scene the page goes black again, and the house is put back in the dark.
  for (let n = 0; n < LOOKS && !(await curtainOn(page)) && (await seen(page)).playing; n++) await advance(page, LOOK_EVERY);
  await page.waitForFunction(() => (window as unknown as { manor3d: { game: { scene: unknown } } }).manor3d.game.scene === null, undefined, { timeout: BLACK_WAIT_MS }).catch(() => null);
  const over = await seen(page);
  // (The scene's own page furniture is taken away on the frame after the scene ends: it is given that frame, however long it takes on a busy machine.)
  await page.waitForFunction(() => document.querySelector(".scene") === null, undefined, { timeout: 5000 }).catch(() => null);
  check(`he goes back down the drive and is gone, the scene is over, and the house has chosen (${over.goal})`, !over.playing && over.priestZ === null && over.goal === "tea" && (await count(".scene")) === 0);
  check(`the house is put back in the dark: the black is all but whole as the scene ends (${(await blackAt(page)).ended})`, ((await blackAt(page)).ended ?? 0) >= BLACK);
  await curtainGone(page);
  check("…and the black is taken out of the page again once it has faded in", (await page.locator(".curtain").count()) === 0 && !(await curtainOn(page)));
  check("everyone is back where she was, at what she was doing and with what she carried, and nobody else is there", (await everyone(page)) === house);
  const back = await furniture(page);
  check(`the page's furniture is back, all of it (${back.shown.length} of ${FURNITURE.length}${back.outside.length ? `; outside: ${back.outside.join(", ")}` : ""}; slid ${back.slid}), brought back in the dark (${(await blackAt(page)).back}), and the picture is slid aside for the panel again`, back.shown.length === FURNITURE.length && back.outside.length === 0 && back.slid && ((await blackAt(page)).back ?? 0) >= BLACK);
  check(`the clock's speed is given back as it was (×${await page.evaluate(`window.manor3d.speed.peek()`)})`, (await page.evaluate(`window.manor3d.speed.peek()`)) === FAST);
  await advance(page, 3);
  const after = await seen(page);
  check("time goes on again, and everyone goes on with what she was at; and nobody is followed", after.clock > over.clock && (await everyone(page)) !== house && (await page.evaluate(`window.manor3d.following.peek()`)) === null);
  await page.keyboard.press("m");
  check("the page's keys are heard again", (await count(".map-frame")) === 1);

  // A scene is plain data: one made here on the spot plays like any other. It looks at someone who stays when it is over.
  await page.evaluate(`window.manor3d.game.scene = { scene: { id: "made-here", cast: {}, steps: [] }, frames: [{ steps: [{ do: "focus", who: "evelyn" }, { do: "say", who: null, text: "A line nobody speaks." }], at: 0 }], waiting: null, line: null, sides: { left: null, right: null }, focus: null, vars: {}, done: false }`);
  await advance(page, 0.2);
  check("a scene made of plain data plays: its own voice has no name and no portrait, and the view goes where it looks", (await page.locator(".scene-text").textContent()) === "A line nobody speaks." && (await page.locator(".scene-name").isHidden()) && (await count(".scene-portrait")) === 0 && (await page.evaluate(`window.manor3d.following.peek()`)) === "evelyn" && (await count(".map-frame")) === 0);
  await page.keyboard.press("Enter");
  await advance(page, 0.2);
  check("when it is over the view lets go of whoever it was looking at, though she is still there", (await count(".scene")) === 0 && (await page.evaluate(`window.manor3d.following.peek()`)) === null);

  // Found by a review, 2026-11-16: played from the dev menu while time was paused, a scene was staged and never moved, and nothing on the page could free it.
  // The pause is put by for it in the black, as the speed is, and given back after. (Nothing here runs the house on: only the page's own loop.)
  check("time is paused before the dev menu plays the scene again", (await page.evaluate(`window.manor3d.paused.peek()`)) === true);
  await page.evaluate(`window.manor3d.dev.run("play:first-caller")`);
  await page.waitForFunction(() => (window as unknown as { manor3d: { game: { scene: unknown } } }).manor3d.game.scene !== null, undefined, { timeout: BLACK_WAIT_MS }).catch(() => null);
  await curtainGone(page);
  const pausedFrom = await seen(page);
  await pageTime(page, ON_ITS_OWN_MS);
  const pausedOn = await seen(page);
  check(`played while paused, the scene plays of itself: he walks up the drive (${pausedFrom.priestZ?.toFixed(1)} m to ${pausedOn.priestZ?.toFixed(1)} m)`, pausedOn.playing && pausedFrom.priestZ !== null && pausedOn.priestZ !== null && pausedOn.priestZ < pausedFrom.priestZ - 1);
  for (let n = 0; n < LOOKS * 2 && (await seen(page)).playing && !(await curtainOn(page)); n++) {
    const { waiting } = await seen(page);
    if (waiting === "choice") await page.locator(".scene-choice").first().click();
    else if (waiting === "advance") await page.keyboard.press("Enter");
    else await advance(page, LOOK_EVERY);
  }
  await page.waitForFunction(() => (window as unknown as { manor3d: { game: { scene: unknown } } }).manor3d.game.scene === null, undefined, { timeout: BLACK_WAIT_MS }).catch(() => null);
  await curtainGone(page);
  check("…and when it is over, time is paused again, as it was", !(await seen(page)).playing && (await page.evaluate(`window.manor3d.paused.peek()`)) === true);

  check(`the scene throws no errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, errors.length === 0);
  await page.close();
};
