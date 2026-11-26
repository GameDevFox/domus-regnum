// The checks of the 3D demo page that are about the kitchen garden: its own menu, with four
// plots of six squares, where it is said what is to be sown; whoever has the garden going out
// to sow and water; what stands in the squares as it grows; and the harvest brought in to the
// pantry. Run by check3d.ts.
import type { Browser, Page } from "@playwright/test";

import { pageTime } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** Time for the menu and the panel to be read again from the game: they are looked to a few times a second. */
const READ_MS = 500;
/** Seconds of the house's time run at a go while something is waited for, and how many goes at the most. */
const STEP = 1;
const STEPS = 400;
/** The squares of a plot; and the plants in one square: two across and two deep. */
const SQUARES = 6;
const PLANTS = 4;
/** How far the last square of the last plot lies from the first square of the first, in metres. */
const FAR_SQUARE = { east: 4.7, north: 1.65 };
/** A phone's screen, upright; and how near the middle of two things must be to count as the same, in pixels. */
const NARROW = { width: 400, height: 800 };
const SAME_PX = 1;
/** How long a press may wait for what it is on to be free to be pressed, and for the card to show what came of it. */
const PRESS_MS = 3000;
/** How far beside the garden's card the house is looked for (px). */
const BESIDE_PX = 30;
/** How far below the ground floor the grounds lie, in metres. */
const GROUNDS_BELOW = 0.29;
/** The house's back wall, as a line across the plan: north of it is out of doors. */
const BACK = 1;

const until = async (page: Page, so: string): Promise<boolean> => {
  for (let n = 0; n < STEPS; n++) {
    if (await page.evaluate(`(() => { const { game, world } = window.manor3d; return ${so}; })()`)) return true;
    await page.evaluate(`window.manor3d.advance(${STEP})`);
  }
  return false;
};
/** How many things stand in the plots, as they are drawn. */
const standing = (page: Page): Promise<number> => page.evaluate(`window.manor3d.scene.getObjectByName("garden-beds").children.length`) as Promise<number>;

/** The icon is still when it has moved less than this, in pixels, in this long; and how many times that is looked for. */
const STILL_PX = 1;
const STILL_MS = 200;
const STILL_TRIES = 20;

export const checkGarden = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${base}demo3d.html?help=0&view=ground`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  await page.evaluate(`window.manor3d.paused.set(true)`);
  // A new game knows wheat, and that alone: this game's turnip. The rest of this is of a house that knows potatoes alone, as a new one did
  // until 2026-11-16, since it is about how a square is watered, grown and picked, which wheat's three days are too quick to show; wheat has its own part at the end.
  const begins = (await page.evaluate(`window.manor3d.game.garden.known.join()`)) as string;
  check(`a new game knows how to grow wheat, and nothing else (${begins})`, begins === "wheat");
  await page.evaluate(`window.manor3d.game.garden.known = ["potato"]`);
  const menu = page.locator(".garden-card");
  /** The garden's icon, which floats over its plots in the picture: where it is on the screen, and how it stands. */
  const icon = (): Promise<{ x: number; y: number }> => page.evaluate(`window.manor3d.named("place-garden")`) as Promise<{ x: number; y: number }>;
  const iconSays = (): Promise<{ workers: number; open: boolean; shown: boolean }> => page.evaluate(`window.manor3d.work.icons().find((i) => i.job === "garden")`) as Promise<{ workers: number; open: boolean; shown: boolean }>;
  /** Press the icon where it is: once it has stopped moving on the screen, since the view may still be coming to rest when the page is slow. */
  const pressIcon = async (): Promise<void> => {
    let at = await icon();
    for (let n = 0; n < STILL_TRIES; n++) {
      await pageTime(page, STILL_MS);
      const now = await icon();
      const moved = Math.hypot(now.x - at.x, now.y - at.y);
      at = now;
      if (moved < STILL_PX) break;
    }
    await page.mouse.click(at.x, at.y);
  };
  /** A square, by the number of its plot and its own, both counted from one as they are said. */
  const square = (plot: number, n: number) => menu.locator(`.plot[data-plot="${plot - 1}"] .square[data-square="${n - 1}"]`);
  const says = async (plot: number, n: number): Promise<string> => (await square(plot, n).getAttribute("aria-label")) ?? "";
  const all = (plot: number) => menu.locator(`.plot[data-plot="${plot - 1}"] .plot-all`);
  const wanted = (plot: number): Promise<(string | null)[]> => page.evaluate(`window.manor3d.game.garden.plots[${plot - 1}].squares.map((s) => s.wanted)`) as Promise<(string | null)[]>;
  const box = async (plot: number): Promise<{ x: number; y: number }> => (await menu.locator(`.plot[data-plot="${plot - 1}"]`).boundingBox()) ?? { x: 0, y: 0 };

  // The garden has a menu of its own, off the screen until it is asked for.
  check("the garden is not in the panel at the left, nor on the screen at all, until it is asked for: its icon floats over its plots, and there is no button for it by the map", (await page.locator("#garden").count()) === 0 && (await page.locator("#panel .heading").allTextContents()).every((h) => h !== "Garden") && (await menu.count()) === 0 && (await iconSays()).shown && (await page.locator(".garden-button").count()) === 0);
  // The intel menu's button is alone over the map's tile now, and in the middle of it.
  const over = async (): Promise<string> => {
    const [intel, map] = await Promise.all([page.getByRole("button", { name: /^Open the intel menu/ }).boundingBox(), page.locator(".map-widget").boundingBox()]);
    if (!intel || !map) return "not all there";
    const off = intel.x + intel.width / 2 - (map.x + map.width / 2);
    return Math.abs(off) <= SAME_PX && intel.y + intel.height < map.y && intel.x + intel.width <= (page.viewportSize()?.width ?? 0) ? "centred" : `${off.toFixed(1)} px off`;
  };
  check(`the intel menu's button stands over the map's tile, centred on it (${await over()})`, (await over()) === "centred");
  await page.setViewportSize(NARROW);
  check(`…and on a narrow screen too, without going off its edge (${await over()})`, (await over()) === "centred");
  await page.setViewportSize(viewport);
  check("with nobody given the garden, its icon says that nobody works there", (await iconSays()).workers === 0 && !(await iconSays()).open);
  await pressIcon();
  await menu.waitFor();
  check("pressing the icon over the plots opens the garden's card, and the icon is ringed while it is open", (await menu.count()) === 1 && (await page.evaluate(`window.manor3d.work.open.garden.peek()`)) === true);
  check(`it is four plots of six squares, each square empty at first with nothing to be sown (${await says(1, 1)})`, (await menu.locator(".plot").count()) === 4 && (await menu.locator(".square").count()) === 4 * SQUARES && (await menu.locator('.plot[data-plot="0"] .square').count()) === SQUARES && (await says(1, 1)) === "Plot 1, square 1: empty, and nothing is to be sown here" && (await square(1, 1).locator(".square-glyph").textContent()) === "＋" && (await standing(page)) === 0);
  const [first, second, third] = [await box(1), await box(2), await box(3)];
  const house = (await menu.locator(".garden-house").boundingBox()) ?? { x: 0, y: 0 };
  const [corner, next, below] = [await square(1, 1).boundingBox(), await square(1, 2).boundingBox(), await square(1, 4).boundingBox()];
  check("the plots are set out as they are seen from beyond the garden, looking back at the house: the house at the top, the second plot (north of the first) below the first, the third (east of it) to its left", house.y < first.y && second.y > first.y && Math.abs(second.x - first.x) < 1 && third.x < first.x && Math.abs(third.y - first.y) < 1);
  check("and a plot's squares the same way round: its first, the north-west, is at its bottom right, the next to the left of that, the next row above", corner !== null && next !== null && below !== null && next.x < corner.x && Math.abs(next.y - corner.y) < 1 && below.y < corner.y && Math.abs(below.x - corner.x) < 1);
  check(`with nobody given the garden, it says so (${await menu.locator(".garden-keeper").getAttribute("aria-label")})`, (await menu.locator(".garden-keeper").getAttribute("data-who")) === "" && ((await menu.locator(".garden-keeper").getAttribute("aria-label")) ?? "").startsWith("Nobody sees to the garden") && (await menu.locator(".garden-keeper").textContent()) === "No one assigned" && (await menu.locator(".work-keeper-none svg").count()) === 1 && (await menu.locator(".garden-keeper .map-face").count()) === 0);
  const seed = (name: string) => menu.getByRole("button", { name: new RegExp(`^${name}: ripe`) });
  check(`the seeds are the crops the house knows, and the first is taken up (${await seed("Potatoes").getAttribute("aria-label")})`, (await menu.locator(".seed").count()) === 1 && (await seed("Potatoes").getAttribute("aria-pressed")) === "true" && (await seed("Potatoes").getAttribute("aria-label")) === "Potatoes: ripe 9 watered days after sowing; a square bears 5");
  await square(1, 1).click();
  check(`pressing a square says that the crop taken up is to be sown there, and in that square only (${await says(1, 1)})`, (await says(1, 1)) === "Plot 1, square 1: empty: potatoes to be sown here" && (await square(1, 1).locator(".square-glyph").textContent()) === "🥔" && ((await square(1, 1).getAttribute("class")) ?? "").includes("to-sow") && (await says(1, 2)) === "Plot 1, square 2: empty, and nothing is to be sown here" && (await wanted(1)).join() === "potato,,,,,");
  await square(1, 1).click();
  check("pressed again, it is nothing again", (await says(1, 1)) === "Plot 1, square 1: empty, and nothing is to be sown here");
  await all(2).click();
  const whole = await wanted(2);
  await all(2).click();
  check(`a plot's own button says it of every square of the plot at once, and pressed again of none (${await all(2).getAttribute("aria-label")})`, whole.join() === Array(SQUARES).fill("potato").join() && (await wanted(2)).every((w) => w === null) && (await wanted(1)).every((w) => w === null));
  await square(1, 1).click();

  // Someone is given the garden, with the other jobs: she goes out and sows it, and waters it.
  // The garden is a window, and the page about it is as alive as ever: she is given it while it is open.
  const job = page.getByRole("button", { name: "Seeing to the garden: Sage" });
  await job.click({ timeout: PRESS_MS }).catch(() => undefined);
  check("the garden is given as the baking and the shop are, by her face on its card: pressed, her face is lit", (await job.getAttribute("aria-pressed")) === "true" && (await menu.locator(".who").count()) === 4);
  const kept = await menu.locator('.garden-keeper[data-who="sage"]').waitFor({ timeout: PRESS_MS }).then(() => true, () => false);
  check(`that is done with the garden open, which stays open and says whose it now is (${await menu.locator(".garden-keeper").textContent()})`, kept && (await menu.locator(".garden-keeper").textContent()) === "Sage");
  const card = (await menu.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const beside = (await page.evaluate(`document.elementFromPoint(${card.x + card.width + BESIDE_PX}, ${card.y + card.height / 2})?.tagName`)) as string | undefined;
  check(`beside the garden's card it is the house that is pressed, with nothing lying over it (${beside})`, beside === "CANVAS");
  await page.keyboard.press("Escape");
  check("Esc puts the garden away again", (await menu.count()) === 0);
  const out = await until(page, `world.actors.some((a) => a.id === "sage" && a.walker.pos.z < ${BACK})`);
  await pageTime(page, READ_MS);
  check("she goes out at the back door to it, and is seen there", out && ((await page.evaluate(`window.manor3d.shown()`)) as string[]).includes("sage"));
  // Among the plots her feet are on the earth, lower than the floors of the house.
  const atPlot = await until(page, `game.tasks.sage?.plot === 0 && world.actors.find((a) => a.id === "sage").label !== null`);
  await pageTime(page, READ_MS);
  const feet = (await page.evaluate(`[window.manor3d.feetOf("sage"), window.manor3d.feetOf("rose")]`)) as [number | null, number | null];
  check(`…with her feet on the earth, not in the air at the level of the house's floor (${feet[0]?.toFixed(2)} m, against ${feet[1]?.toFixed(2)} m indoors)`, atPlot && feet[0] !== null && feet[1] !== null && Math.abs(feet[1] - feet[0] - GROUNDS_BELOW) < 0.02);
  const sown = await until(page, `game.garden.plots[0].squares[0].crop === "potato" && game.garden.plots[0].squares[0].watered`);
  await page.keyboard.press("g");
  await menu.waitFor();
  await pageTime(page, READ_MS);
  check(`she sows the square and waters it: the garden, opened by its key, says what is in it and how long it has to go, and who sees to it (${await says(1, 1)})`, sown && (await says(1, 1)) === "Plot 1, square 1: potatoes, 9 watered days from ripe, watered today" && ((await square(1, 1).locator(".square-state").textContent()) ?? "").replace(/\s+/g, " ") === "9 💧" && ((await square(1, 1).getAttribute("class")) ?? "").includes("growing") && (await menu.locator(".garden-keeper").getAttribute("data-who")) === "sage");
  check(`what is sown stands in its square, small, and the square's earth is dark with the watering: the squares beside it are bare (${await standing(page)} things)`, (await standing(page)) === PLANTS + 1);

  // Ripe: it is seen to be, she picks it and carries it in, and it is on the house's books.
  await page.evaluate(`window.manor3d.dev.run("ripen")`);
  await pageTime(page, READ_MS);
  check(`ripe, the square says so, and what it bears is seen on the plants (${await says(1, 1)}; ${await standing(page)} things)`, (await says(1, 1)) === "Plot 1, square 1: potatoes, ripe: to be picked" && (await square(1, 1).locator(".square-state").textContent()) === "✓" && ((await square(1, 1).getAttribute("class")) ?? "").includes("ripe") && (await standing(page)) >= PLANTS * 2);
  const carried = await until(page, `world.actors.some((a) => a.id === "sage" && a.carrying === "potato")`);
  const brought = await until(page, `game.stock.potato > 0`);
  await pageTime(page, READ_MS);
  const potatoes = page.getByRole("img", { name: /^Potatoes in the pantry/ });
  check(`she picks it and carries it in to the pantry: the five potatoes of one square, on the house's books (${await potatoes.getAttribute("aria-label").catch(() => null)})`, carried && brought && (await potatoes.getAttribute("aria-label")) === "Potatoes in the pantry: 5");
  const again = await until(page, `game.garden.plots[0].squares[0].crop === "potato" && game.garden.plots[0].squares[0].grown === 0 && game.garden.plots[0].squares[0].watered`);
  check("still wanted there, it is sown again without being asked", again);

  // With more crops known there are more seeds to take up; and the squares of one plot can each have a crop of their own.
  await page.evaluate(`import("/src/game/index.ts").then(({ reveal }) => reveal(window.manor3d.game, { kind: "all", of: "crop" }))`);
  await pageTime(page, READ_MS);
  const seeds = await menu.locator(".seed").count();
  await seed("Cabbages").click();
  await square(2, 1).click();
  await seed("Potatoes").click();
  await square(2, 2).click();
  check(`with more crops known there are more seeds (${seeds}), and two squares of one plot can be given different crops (${await says(2, 1)}; ${await says(2, 2)})`, seeds > 2 && (await seed("Potatoes").getAttribute("aria-pressed")) === "true" && (await seed("Cabbages").getAttribute("aria-pressed")) === "false" && (await says(2, 1)) === "Plot 2, square 1: empty: cabbages to be sown here" && (await says(2, 2)) === "Plot 2, square 2: empty: potatoes to be sown here");
  await seed("Cabbages").click();
  await square(1, 1).click();
  await pageTime(page, READ_MS);
  check(`something else wanted where a crop is growing is sown after that is picked, and the square says so (${await says(1, 1)})`, (await says(1, 1)).endsWith("After this is picked: cabbages") && ((await square(1, 1).locator(".square-next").textContent()) ?? "").includes("🥬"));
  // What grows is drawn in its own square, not in the first of its plot.
  const drawnAt = (): Promise<[number, number][]> => page.evaluate(`window.manor3d.scene.getObjectByName("garden-beds").children.map((c) => [c.position.x, c.position.z])`) as Promise<[number, number][]>;
  const middle = (points: [number, number][]): [number, number] => [points.reduce((sum, at) => sum + at[0], 0) / points.length, points.reduce((sum, at) => sum + at[1], 0) / points.length];
  const one = middle(await drawnAt());
  await page.evaluate(`window.manor3d.game.garden.plots[3].squares[5] = { crop: "potato", wanted: null, grown: 0, watered: false }`);
  await pageTime(page, READ_MS);
  const far = (await drawnAt()).filter((at) => Math.hypot(at[0] - one[0], at[1] - one[1]) > 1);
  const other = far.length ? middle(far) : [0, 0];
  check(`what grows stands in its own square: the last square of the last plot is ${FAR_SQUARE.east} m east and ${FAR_SQUARE.north} m north of the first of the first (${(other[0] - one[0]).toFixed(2)} m, ${(one[1] - other[1]).toFixed(2)} m)`, far.length === PLANTS && Math.abs(other[0] - one[0] - FAR_SQUARE.east) < 0.05 && Math.abs(one[1] - other[1] - FAR_SQUARE.north) < 0.05);
  // Wheat: quick, and what comes of it is flour.
  await page.evaluate(`(() => { const { game } = window.manor3d; game.garden.known = ["wheat", "potato"]; for (const plot of game.garden.plots) for (const [n] of plot.squares.entries()) plot.squares[n] = { crop: null, wanted: null, grown: 0, watered: false }; })()`);
  await pageTime(page, READ_MS);
  if ((await menu.count()) === 0) await page.keyboard.press("g");
  await menu.waitFor();
  check(`wheat is first among the seeds, and says that it is quick and that a square of it bears flour (${await seed("Wheat").getAttribute("aria-label")})`, (await menu.locator(".seed").first().getAttribute("aria-label")) === "Wheat: ripe 3 watered days after sowing; a square bears 2 sacks of flour" && (await seed("Wheat").locator(".seed-glyph").textContent()) === "🌾");
  await page.keyboard.press("Escape");
  // (Nobody bakes meanwhile, so that the flour in the pantry changes only by what she brings in.)
  await page.evaluate(`import("/src/game/index.ts").then(({ assign }) => { const { game } = window.manor3d; for (const id of game.household) if (game.posts[id] === "bake") assign(game, id, null); })`);
  await page.evaluate(`window.manor3d.advance(60)`);
  const flourBefore = (await page.evaluate(`(() => { const { game } = window.manor3d; game.garden.plots[0].squares[0] = { crop: "wheat", wanted: null, grown: 3, watered: false }; return game.flour; })()`)) as number;
  const pulled = await until(page, `game.garden.plots[0].squares[0].crop === null && game.flour > ${flourBefore}`);
  const [flourAfter, wheatKept] = (await page.evaluate(`[window.manor3d.game.flour, window.manor3d.game.stock.wheat]`)) as [number, number];
  check(`a ripe square of wheat, pulled and brought in, is two sacks of flour in the pantry, and no wheat is kept as wheat (${flourBefore} sacks, then ${flourAfter})`, pulled && flourAfter === flourBefore + 2 && wheatKept === 0);
  check(`the garden throws no errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, errors.length === 0);
  await page.close();
};
