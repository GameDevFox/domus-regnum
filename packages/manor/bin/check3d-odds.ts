// The checks of the 3D demo page that are about the windows of the dev menu, and the odds of
// discovery among them: what opens into a window of its own is a row of larger buttons at the
// top of the menu; the odds window graphs each place's things against the minutes spent, edits a
// place of the game's live, and keeps areas of one's own that change nothing. Run by check3d.ts.
import type { Browser, Page } from "@playwright/test";

import { pageTime } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** Time for the odds to be reckoned afresh after a change, and drawn. */
const RECKONED_MS = 900;
/** Time for the page to be redrawn after a press. */
const REDRAWN_MS = 300;
/** The way on from the forest, as it is written, and as plentiful as these checks make it. */
const WAY_POOL = 8;
const PLENTY = 200;
/** Gathering draws a minute the forest's rare set is given here, where it is written with one. */
const RARE_GATHER = 5;

export const checkOdds = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  // One browser context, so that what it remembers lasts from one opening of the page to the next.
  const context = await browser.newContext({ viewport });
  const page: Page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const opened = async (): Promise<void> => {
    await page.goto(`${base}demo3d.html?help=0&dev=1`);
    await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
    await page.evaluate(`window.manor3d.paused.set(true)`);
    await page.getByRole("button", { name: "Dev menu" }).click();
  };
  await opened();
  const menu = page.getByRole("dialog", { name: "Dev menu" });
  const room = page.getByRole("dialog", { name: "Discovery odds" });
  const reckoned = (): Promise<void> => page.waitForTimeout(RECKONED_MS);
  /** What the game's own rules have for a place just now, deck by deck, in the game being played; and for its main deck. */
  type Dials = { id: string; blanks: number; gather: number; finds: { id: string; pool: number; need: number }[] };
  const decks = (place: string): Promise<Dials[]> => page.evaluate(`import("/src/game/index.ts").then(({ searchingAt }) => searchingAt(window.manor3d.game, "${place}"))`) as Promise<Dials[]>;
  /** The same, for a new game made on this very page load, beside the one being played: what the code's own tables say. */
  const fresh = (place: string): Promise<Dials[]> => page.evaluate(`import("/src/game/index.ts").then(({ createGame, searchingAt }) => searchingAt(createGame(), "${place}"))`) as Promise<Dials[]>;
  const dials = async (place: string): Promise<Dials> => (await decks(place)).find((deck) => deck.id === "main") as Dials;
  const rare = async (): Promise<Dials> => (await decks("forest")).find((deck) => deck.id === "rare") as Dials;
  const area = (name: string) => room.locator(".odds-area", { hasText: name });
  const rows = room.locator(".odds-table tr[data-bucket]");
  const row = (name: string) => room.locator(".odds-table tr[data-bucket]", { hasText: name });
  /** The minute by which a thing is found as a rule, as its row says. */
  const asARule = async (of: ReturnType<typeof row>): Promise<number> => Number.parseInt((await of.locator(".odds-comes").first().textContent()) ?? "", 10);

  // The menu: what opens into a window is a row of larger buttons at the top, over the sections.
  const windows = await menu.locator(".dev-window-button").allTextContents();
  const firstHeading = await menu.locator(".dev-heading").first().evaluate((node) => node.compareDocumentPosition(document.querySelector(".dev-windows") as Node) & Node.DOCUMENT_POSITION_PRECEDING);
  check(`the dev menu's windows are a row of larger buttons at its top, over its sections: the colour room and the odds (${windows.join(" | ")})`, windows.join("|") === "🎨Colours|🎲Discovery odds" && firstHeading !== 0 && (await menu.locator(".dev-heading", { hasText: "Colours" }).count()) === 0);
  const sizes = (await page.evaluate(`[document.querySelector(".dev-window-button").getBoundingClientRect().height, document.querySelector(".dev-command").getBoundingClientRect().height]`)) as [number, number];
  check(`…and they are larger than the buttons under them (${sizes.map((n) => n.toFixed(0)).join(" against ")} px tall)`, sizes[0] > sizes[1] * 1.3);

  // The odds window: the game's places, and the graph of the one chosen.
  await menu.getByRole("button", { name: /Discovery odds/ }).click();
  await reckoned();
  check(`its button opens the odds, over the menu, with the game's places that hold anything to find (${(await room.locator(".odds-area").allTextContents()).join(" | ")})`, (await room.count()) === 1 && (await room.locator(".odds-area").allTextContents()).join("|") === "The townin the game|The forestin the game" && (await area("The town").getAttribute("aria-pressed")) === "true");
  check(`the town's graph has a line for each of its shops, named in a legend, and a row of the table for each with its dials (${await rows.count()} rows)`, (await room.locator(".odds-line").count()) === 5 && (await room.locator(".odds-legend-item").count()) === 5 && (await rows.count()) === 5 && (await row("The miller's").locator("input[type=number]").first().inputValue()) === "6");
  const miller = await asARule(row("The miller's"));
  const herbalist = await asARule(row("The herbalist's stall"));
  check(`the table says what comes of the dials: the miller's is found in about a quarter of an hour as a rule, the herbalist's stall in an hour or more, and is the last in most games (${miller} and ${herbalist} minutes; last in ${await row("The herbalist's stall").locator(".odds-comes").nth(3).textContent()})`, miller > 8 && miller < 25 && herbalist > 55 && Number.parseInt((await row("The herbalist's stall").locator(".odds-comes").nth(3).textContent()) ?? "", 10) > 45);

  // The readout: the pointer finds a minute, and every line is read at it.
  const box = (await room.locator(".odds-svg").boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await pageTime(page, REDRAWN_MS);
  const read = await room.locator(".odds-readout-row").allTextContents();
  check(`with the pointer on the graph, a rule stands at a minute and a readout says each shop's chance by then, the likeliest first (${await room.locator(".odds-readout-at").textContent()}: ${read.join(", ")})`, (await room.locator(".odds-rule").count()) === 1 && (await room.locator(".odds-dot").count()) === 5 && read.length === 5 && read[0].endsWith("The miller's") && /^After \d+ minutes$/.test((await room.locator(".odds-readout-at").textContent()) ?? ""));
  await page.mouse.move(box.x - 60, box.y - 30);
  await pageTime(page, REDRAWN_MS);
  check("with the pointer off it, the rule and the readout are gone from the page, not hidden in it", (await room.locator(".odds-rule").count()) === 0 && (await room.locator(".odds-readout").count()) === 0 && (await room.locator(".odds-dot").count()) === 0);

  // Gathering: the same place learnt far slower.
  await room.getByRole("button", { name: /Gathering/ }).click();
  await reckoned();
  const slower = await asARule(row("The miller's"));
  check(`looked at as for someone gathering, everything is found far later, and the graph says the minutes are of gathering (${slower} minutes for the miller's)`, slower > miller * 2.5 && ((await room.locator(".odds-axis").textContent()) ?? "").includes("gathering"));
  await room.getByRole("button", { name: /Exploring/ }).click();

  // A place of the game's is edited live.
  await area("The forest").click();
  await reckoned();
  const way = row("The way on");
  const late = await asARule(way);
  const tablet = room.locator('.odds-deck[data-deck="rare"] tr[data-bucket]');
  check(`the forest has two sets of pools, a block each: its three things in the main one, and the stone tablet alone in the rare one (${(await room.locator(".odds-deck-name").allTextContents()).join(" | ")})`, (await room.locator(".odds-deck").count()) === 2 && (await room.locator('.odds-deck[data-deck="main"] tr[data-bucket]').count()) === 3 && (await tablet.count()) === 1 && ((await tablet.textContent()) ?? "").includes("A stone tablet") && (await room.locator('.odds-deck[data-deck="rare"]').getByRole("spinbutton", { name: "Gathering draws a minute" }).inputValue()) === "1");
  check(`the way on is found late as a rule (${late} minutes); what stays in the draw once found is ticked, and is not a dial of a place of the game's`, (await rows.count()) === 4 && late > 40 && (await row("Berries").locator("input[type=checkbox]").isChecked()) && (await row("Berries").locator("input[type=checkbox]").isDisabled()) && !(await way.locator("input[type=checkbox]").isChecked()));
  await page.evaluate(`import("/src/game/index.ts").then(({ newSearch, searchingAt }) => { window.manor3d.game.searches.forest = Object.fromEntries(searchingAt(window.manor3d.game, "forest").map((deck) => [deck.id, newSearch(deck)])); window.manor3d.game.finds.forest = ["berries"]; })`);
  await way.locator("input[type=number]").first().fill(String(PLENTY));
  await way.locator("input[type=number]").nth(1).fill("1");
  await reckoned();
  const soon = await asARule(way);
  const live = (await dials("forest")).finds.find((f) => f.id === "way:caves");
  check(`a figure typed there is the game's at once: the way on, made plentiful, is found in the first minutes (${soon}), and the game's own rules have its ${live?.pool} points`, soon < 5 && live?.pool === PLENTY && live.need === 1);
  check("…that set of pools is searched afresh, the other is as far on as it was, and what had been found there is still found", (await page.evaluate(`window.manor3d.game.searches.forest.main === undefined && window.manor3d.game.searches.forest.rare !== undefined && window.manor3d.game.finds.forest.join() === "berries"`)) === true);
  check("…and the number typed is still in its box, with the box still the one being typed in", (await way.locator("input[type=number]").nth(1).inputValue()) === "1" && (await way.locator("input[type=number]").nth(1).evaluate((node) => node === document.activeElement)));
  // The rare set's own dials are the game's too, and leave the main set as it is.
  await room.locator('.odds-deck[data-deck="rare"]').getByRole("spinbutton", { name: "Gathering draws a minute" }).fill(String(RARE_GATHER));
  await reckoned();
  check(`a figure of the rare set's own is the game's at once, for that set alone (${(await rare()).gather} gathering draws a minute)`, (await rare()).gather === RARE_GATHER && (await dials("forest")).gather === 1);
  // The edits are the game's own: a new game made beside it, on the same page, has the figures the code was written with.
  const beside = await fresh("forest");
  const besideWay = beside.find((deck) => deck.id === "main")?.finds.find((f) => f.id === "way:caves");
  check(`…and they are that game's alone: a new game made on the same page has the way on's ${besideWay?.pool} points and the rare set's ${beside.find((deck) => deck.id === "rare")?.gather} gathering draw, as written`, besideWay?.pool === WAY_POOL && besideWay.need !== 1 && beside.find((deck) => deck.id === "rare")?.gather === 1);
  await room.getByRole("button", { name: "↺ As written" }).click();
  await reckoned();
  check(`"As written" puts the place back as the code has it, every set of pools of it, in the window and in the game (${(await dials("forest")).finds.find((f) => f.id === "way:caves")?.pool} points)`, (await dials("forest")).finds.find((f) => f.id === "way:caves")?.pool === WAY_POOL && (await row("The way on").locator("input[type=number]").first().inputValue()) === String(WAY_POOL) && (await rare()).gather === 1);
  check("…by dropping the game's edits of it: the game holds none", (await page.evaluate(`Object.keys(window.manor3d.game.dials).length`)) === 0);

  // An area of one's own changes nothing in the game.
  const before = JSON.stringify([await decks("forest"), await decks("town")]);
  await room.getByRole("button", { name: "＋ New area" }).click();
  await reckoned();
  check(`a new area is its own, chosen as it is made, with two things to begin with and a line for each (${(await room.locator(".odds-area").allTextContents()).join(" | ")})`, (await area("New area 1").getAttribute("aria-pressed")) === "true" && ((await area("New area 1").textContent()) ?? "").endsWith("its own") && (await rows.count()) === 2 && (await room.locator(".odds-line").count()) === 2);
  await room.getByRole("button", { name: "＋ Add a thing" }).click();
  await reckoned();
  await rows.nth(2).locator(".odds-name").fill("Mushrooms");
  await rows.nth(2).locator("input[type=number]").first().fill("60");
  await rows.nth(2).locator("input[type=checkbox]").check();
  await room.locator("input.odds-area-title").fill("The marsh");
  await reckoned();
  check(`a thing is added to it, named, and given its dials; the area is named; and the graph and the list of areas follow (${(await room.locator(".odds-legend-item").allTextContents()).join(", ")})`, (await rows.count()) === 3 && (await room.locator(".odds-line").count()) === 3 && (await room.locator(".odds-legend-item").allTextContents()).includes("Mushrooms") && (await area("The marsh").count()) === 1 && (await asARule(rows.nth(2))) > 0);
  check(`its figures are set down to be copied out (${(await room.locator(".odds-copy").inputValue()).slice(0, 60)}…)`, (JSON.parse(await room.locator(".odds-copy").inputValue()) as { name: string; decks: Record<string, { finds: { name: string; pool: number; lingers: boolean }[] }> }).decks.main.finds.some((f) => f.name === "Mushrooms" && f.pool === 60 && f.lingers));
  // Another set of pools, beside the first and with a thing of its own; and taken away again.
  await room.getByRole("button", { name: "＋ Add a set of pools" }).click();
  await reckoned();
  check(`it is given another set of pools, a block of its own with a thing in it and a line for that on the graph (${(await room.locator(".odds-deck-name").allTextContents()).join(" | ")})`, (await room.locator(".odds-deck").count()) === 2 && (await room.locator('.odds-deck[data-deck="set 2"] tr[data-bucket]').count()) === 1 && (await room.locator(".odds-line").count()) === 4 && (await asARule(room.locator('.odds-deck[data-deck="set 2"] tr[data-bucket]'))) > 0);
  await room.locator('.odds-deck[data-deck="set 2"]').getByRole("button", { name: "✕ Take this set away" }).click();
  await reckoned();
  check("…and it is taken away again, with what was in it", (await room.locator(".odds-deck").count()) === 1 && (await rows.count()) === 3 && (await room.locator(".odds-line").count()) === 3 && (await room.getByRole("button", { name: "✕ Take this set away" }).count()) === 0);
  check("nothing in the game is changed by it", JSON.stringify([await decks("forest"), await decks("town")]) === before);
  await rows.nth(0).getByRole("button", { name: /^Take / }).click();
  await reckoned();
  check("a thing is taken out of it by the cross on its row, and the others keep their colours", (await rows.count()) === 2 && (await room.locator(".odds-line").count()) === 2 && (await rows.nth(1).locator(".odds-key").evaluate((node) => (node as HTMLElement).style.background)) === "var(--series-3)");

  // A copy of a place of the game's, to try things on.
  await area("The forest").click();
  await room.getByRole("button", { name: "⧉ Copy to a new area" }).click();
  await reckoned();
  check(`a place of the game's is copied to an area of its own, with its things and their figures (${(await room.locator(".odds-area").allTextContents()).join(" | ")})`, (await area("The forest, copy 1").getAttribute("aria-pressed")) === "true" && (await rows.count()) === 4 && (await room.locator(".odds-deck").count()) === 2 && (await rows.nth(1).locator(".odds-name").inputValue()) === "Berries" && (await rows.nth(1).locator("input[type=number]").first().inputValue()) === "200" && !(await rows.nth(1).locator("input[type=checkbox]").isDisabled()));

  // The window has the keys, and Esc puts it away, leaving the menu it was opened from.
  await page.keyboard.press("m");
  await pageTime(page, REDRAWN_MS);
  check("a key pressed in the window is not heard by the house: M does not open the map", (await page.evaluate(`window.manor3d.map.open.peek()`)) === false);
  await page.keyboard.press("Escape");
  await pageTime(page, REDRAWN_MS);
  check("Esc puts the window away, and the menu it was opened from is still there", (await room.count()) === 0 && (await menu.count()) === 1);

  // Areas of one's own are kept in the browser; a place's figures are the code's again. One kept before areas had decks is read as an area of one.
  await page.evaluate(`localStorage.setItem("manor3d.odds.areas", JSON.stringify([...JSON.parse(localStorage.getItem("manor3d.odds.areas")), { id: "own:old", name: "An old area", place: null, buckets: [{ id: "bucket:1", name: "A", glyph: "", slot: 0, pool: 5, need: 1, lingers: false }], blanks: 20, aimed: 0, stray: 4, aim: "rolled" }]))`);
  await opened();
  await menu.getByRole("button", { name: /Discovery odds/ }).click();
  await reckoned();
  check(`opened afresh, the areas of one's own are there as they were left (${(await room.locator(".odds-area").allTextContents()).join(" | ")})`, (await area("The marsh").count()) === 1 && (await area("The forest, copy 1").count()) === 1);
  await area("The marsh").click();
  await reckoned();
  check("…with their things and figures", (await rows.count()) === 2 && (await rows.nth(1).locator(".odds-name").inputValue()) === "Mushrooms" && (await rows.nth(1).locator("input[type=number]").first().inputValue()) === "60");
  await room.getByRole("button", { name: "🗑 Delete this area" }).click();
  await area("An old area").click();
  await reckoned();
  check(`one kept before areas had sets of pools is there, as an area of one set with its thing and its dials (${(await room.locator(".odds-deck-name").allTextContents()).join(" | ")})`, (await room.locator(".odds-deck").count()) === 1 && (await rows.count()) === 1 && (await rows.nth(0).locator("input[type=number]").first().inputValue()) === "5" && (await room.getByRole("spinbutton", { name: "Blank points" }).inputValue()) === "20" && (await room.getByRole("spinbutton", { name: "Gathering draws a minute" }).inputValue()) === "1");
  await room.getByRole("button", { name: "🗑 Delete this area" }).click();
  await area("The forest, copy 1").click();
  await room.getByRole("button", { name: "🗑 Delete this area" }).click();
  await reckoned();
  check(`an area of one's own is deleted, and a place of the game's cannot be (${(await room.locator(".odds-area").allTextContents()).join(" | ")})`, (await room.locator(".odds-area").count()) === 2 && (await room.getByRole("button", { name: "🗑 Delete this area" }).count()) === 0 && (await page.evaluate(`localStorage.getItem("manor3d.odds.areas")`)) === "[]");

  check(`the odds window throws no errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, errors.length === 0);
  await context.close();
};
