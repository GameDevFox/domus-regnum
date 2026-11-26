// The checks of the 3D demo page that are about the intel menu and the first hidden find: the
// menu lists everything there is to know, known or a question mark; a stone tablet is come upon
// while gathering, is nowhere until then, and can be looked at and read once it is home.
// Run by check3d.ts.
import type { Browser, Page } from "@playwright/test";

import { pageTime } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** Time for the page to be redrawn after something is changed: the menu is read from the game a few times a second. */
const REDRAWN_MS = 500;
/** Seconds of the house's time run at a go while something is waited for, and how many goes at the most. */
const STEP = 2;
const STEPS = 150;
/** The Deseret alphabet's block in Unicode, capitals and small letters. */
const DESERET_BLOCK = "[\\u{10400}-\\u{1044F}]";
/** How opaque a drawn pixel must be to count as ink, and how many a line of writing has at the least. */
const INK_ALPHA = 64;
const MIN_INK = 500;

/** Where a Deseret letter is in the page as text or in an attribute that could be read out of it ("none" if nowhere): the writing is to be a picture, read only by eye. */
const deseretInPage = (page: Page): Promise<string> =>
  page.evaluate((block) => {
    const letter = new RegExp(block, "u");
    if (!letter.test(document.documentElement.outerHTML)) return "none";
    const at = [...document.querySelectorAll("*")].find((node) => ["aria-label", "title", "alt"].some((name) => letter.test(node.getAttribute(name) ?? "")) || [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && letter.test(child.textContent ?? "")));
    return at ? `in a ${at.tagName.toLowerCase()}.${at.className}` : "in the page's markup";
  }, DESERET_BLOCK);

const until = async (page: Page, so: string): Promise<boolean> => {
  for (let n = 0; n < STEPS; n++) {
    if (await page.evaluate(`(() => { const { game } = window.manor3d; return ${so}; })()`)) return true;
    await page.evaluate(`window.manor3d.advance(${STEP})`);
  }
  return false;
};

export const checkBook = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${base}demo3d.html?help=0&view=ground`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  await page.evaluate(`window.manor3d.paused.set(true)`);
  const book = page.getByRole("dialog", { name: "Intel" });
  const tab = (name: string) => book.getByRole("tab", { name: new RegExp(`^${name}`) });
  const tiles = book.locator(".book-tile");
  const detail = book.locator(".book-detail");
  const count = (selector: string): Promise<number> => page.locator(selector).count();

  // A new game: most of it is question marks.
  await page.getByRole("button", { name: /^Open the intel menu/ }).click();
  check(`the book at the right opens the intel menu, which says how much is known: six things of thirty-four (${await book.locator(".book-tally").textContent()})`, (await book.count()) === 1 && ((await book.locator(".book-tally").textContent()) ?? "").trim() === "6 / 34");
  check(`it has a tab for each kind of thing there is to know (${(await book.getByRole("tab").allTextContents()).join(" | ")})`, (await book.getByRole("tab").allTextContents()).join("|") === "🗺️ Places2/5|🧺 Things2/9|🌱 Crops1/14|🍞 Recipes1/2|⭐ Abilities0/1|⚗️ Inventions0/3");
  check("of places, the house and the town are known and three are question marks, which cannot be pressed", (await tiles.count()) === 5 && (await book.locator('.book-tile[data-known="true"] .book-tile-name').allTextContents()).join("|") === "The manor|The town" && (await book.locator('.book-tile[aria-disabled="true"] .book-unknown').count()) === 3);
  check(`what is known of the one looked at is said beside its picture (${await detail.locator(".book-says").first().textContent()})`, (await detail.locator(".book-name").textContent()) === "The manor" && (await detail.locator(".book-piece").count()) === 1 && (await detail.locator(".book-share").textContent()) === "🔎 100%");
  await book.locator('.book-tile[data-id="town"]').click();
  check("pressing another shows that one: the town, of which nothing is known yet but where it is", (await detail.locator(".book-name").textContent()) === "The town" && (await detail.locator(".book-says").allTextContents()).some((line) => line === "Not all of it has been looked into") && !(await detail.locator(".book-says").allTextContents()).some((line) => line.includes("lour")));
  await tab("Things").click();
  check("of things, coin and flour are known and the rest are question marks, what is to wear among them: nothing stands for what is hidden", (await tiles.count()) === 9 && (await book.locator('.book-tile[data-known="true"] .book-tile-name').allTextContents()).join("|") === "Coin|Flour" && (await count('.book-tile[data-id="tablet"]')) === 0);
  await tab("Recipes").click();
  check("of recipes, bread is known, and what it takes and sells for", (await book.locator('.book-tile[data-known="true"] .book-tile-name').allTextContents()).join("|") === "Bread" && (await detail.locator(".book-says").allTextContents()).join("|") === "A sack of flour makes 4 loaves|Sold at 2 coin each");
  await tab("Abilities").click();
  check("of abilities, none is known yet, and nothing is said of what is not", (await tiles.count()) === 1 && (await book.locator('.book-tile[aria-disabled="true"]').count()) === 1 && (await detail.locator(".book-name").count()) === 0);
  // The intel menu lies over a veil: nothing behind it can be pressed (the garden, a window, is the other way: check3d-garden.ts).
  const under = (await page.evaluate(`(() => { const r = document.querySelector(".panel-fold").getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.className; })()`)) as string | undefined;
  check(`while it is open nothing behind it can be pressed: over the button that folds the household's list lies its veil (${under})`, under === "menu-veil");
  const fold = (await page.locator(".panel-fold").boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  await page.mouse.click(fold.x + fold.width / 2, fold.y + fold.height / 2);
  check("…and a press there, on the veil, shuts it, and does not fold the list", (await book.count()) === 0 && (await page.locator("#panel.folded").count()) === 0);
  await page.keyboard.press("i");
  await book.waitFor();
  // (Someone is being followed about the house: Esc would let her go, if the page under the menu heard it.)
  await page.evaluate(`window.manor3d.following.set("rose")`);
  await page.keyboard.press("Escape");
  check("Esc shuts it, and is heard by nothing under it", (await book.count()) === 0 && (await page.evaluate(`window.manor3d.following.peek()`)) === "rose");
  await page.keyboard.press("i");
  check("I opens it, where it was left", (await book.count()) === 1 && (await tab("Abilities").getAttribute("aria-selected")) === "true");
  // Esc shuts what is on top, not what was opened first: the intel menu opened over the kitchen's card is shut, and the card is left.
  const kitchen = page.locator(".work-card-bake");
  await page.keyboard.press("Escape");
  await page.keyboard.press("k");
  await page.keyboard.press("i");
  const bothUp = (await kitchen.count()) === 1 && (await book.count()) === 1;
  await page.keyboard.press("Escape");
  check(`Esc shuts the intel menu opened over the kitchen's card, and leaves the card (${await book.count()} intel, ${await kitchen.count()} kitchen)`, bothUp && (await book.count()) === 0 && (await kitchen.count()) === 1);
  await page.keyboard.press("Escape");
  // …and the dev menu, drawn over the intel menu, is shut before it.
  await page.evaluate(`window.manor3d.dev.unlocked.set(true)`);
  const devMenu = page.getByRole("dialog", { name: "Dev menu" });
  await page.keyboard.press("i");
  await page.keyboard.press("~");
  const devOver = (await devMenu.count()) === 1 && (await book.count()) === 1 && (await kitchen.count()) === 0;
  await page.keyboard.press("Escape");
  check(`Esc shuts the dev menu over the intel menu, and leaves the intel menu (${await devMenu.count()} dev, ${await book.count()} intel)`, devOver && (await devMenu.count()) === 0 && (await book.count()) === 1);
  await page.evaluate(`window.manor3d.dev.unlocked.set(false)`);

  // Things come to be known as the house comes to know them: an ability, when it is earned.
  await page.evaluate(`(async () => { const { game } = window.manor3d; const rules = await import("/src/game/mastery.ts"); rules.creditLoaves(game, "evelyn", 100); })()`);
  await pageTime(page, REDRAWN_MS);
  check(`an ability is known when someone has earned it, and it says who (${(await detail.locator(".book-says").allTextContents()).join(" | ")})`, (await detail.locator(".book-name").textContent()) === "Mastery of bread" && (await detail.locator(".book-says").allTextContents()).includes("Evelyn has it") && ((await book.locator(".book-tally").textContent()) ?? "").trim() === "7 / 34");

  // The stone tablet: come upon by the next draw of its deck in the forest (the dev menu's command), with the forest found, what grows in it found too, and someone sent to explore there.
  await page.evaluate(`(async () => { const { game, dev } = window.manor3d; const rules = await import("/src/game/index.ts"); game.places.forest = "found"; game.finds.forest = ["berries", "herbs"]; dev.run("tablet"); rules.assign(game, "evelyn", null); rules.explore(game, "sage", "forest", { limit: 30, homeByBed: false }); })()`);
  await tab("Things").click();
  check("before it is come upon, the tablet is nowhere in the menu", (await count('.book-tile[data-id="tablet"]')) === 0);
  const came = await until(page, `game.outings.some((o) => o.found.includes("tablet"))`);
  await pageTime(page, REDRAWN_MS);
  const cards = await page.locator(".feat").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label") ?? ""));
  check(`exploring there, she comes upon it in her first minute: a card under the clock marks it (${cards.find((label) => label.includes("tablet"))})`, came && cards.some((label) => label === "Sage has come upon a stone tablet at the forest, and is bringing it home"));
  // …and she asks what she is to do next, naming it; told, she comes home with it.
  const asks = page.getByRole("alertdialog", { name: "Sage has come upon a stone tablet at the forest" });
  check(`…and she asks what she is to do next, saying what she has come upon (${await asks.locator(".map-ask-says").textContent()})`, (await asks.count()) === 1 && (await asks.locator(".map-ask-says").textContent()) === "Sage has come upon a stone tablet at the forest." && (await asks.locator(".map-ask-find").textContent()) === "🪨");
  await asks.locator('[data-told="home"]').evaluate((b) => (b as HTMLElement).click());
  // (The question put the map up over the menu: it is put away again, as it was before she asked.)
  await page.evaluate(`window.manor3d.map.open.set(false)`);
  await pageTime(page, REDRAWN_MS);
  await book.locator('.book-tile[data-id="tablet"]').click();
  check(`it is in the menu from then, marked as a thing nothing told of, and cannot be looked at until it is home (${(await detail.locator(".book-says").allTextContents()).join(" | ")})`, ((await book.locator('.book-tile[data-id="tablet"]').getAttribute("class")) ?? "").includes("hidden-find") && (await detail.locator(".book-says").allTextContents()).includes("It is on its way home") && (await book.locator(".book-look").isDisabled()) && ((await book.locator(".book-tally").textContent()) ?? "").includes("✨ 1"));
  const home = await until(page, `game.curios.includes("tablet")`);
  await pageTime(page, REDRAWN_MS);
  check("when she is in at the door it is in the house, and can be looked at", home && (await detail.locator(".book-says").allTextContents()).includes("It is in the house") && (await book.locator(".book-look").isEnabled()));
  check(`…and its page in the menu has no Deseret letter in it anywhere (${await deseretInPage(page)})`, (await deseretInPage(page)) === "none");

  // Looking at it: the thing itself, and its writing, which nothing reads for the player.
  await book.locator(".book-look").click();
  const tablet = page.getByRole("dialog", { name: "A stone tablet" });
  await page.waitForFunction(() => document.fonts.status === "loaded");
  await pageTime(page, REDRAWN_MS);
  // The writing is drawn, a picture to a line (carved-writing.ts): each is read back off its canvas, as rows of scanlines with ink in them.
  const read = (await tablet.locator("canvas.reader-line").evaluateAll(
    (lines, inkAlpha) =>
      lines.map((line) => {
        const canvas = line as HTMLCanvasElement;
        const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data ?? new Uint8ClampedArray();
        let ink = 0;
        let bands = 0;
        let inBand = false;
        for (let y = 0; y < canvas.height; y++) {
          let inked = false;
          for (let x = 0; x < canvas.width; x++) {
            if (data[(y * canvas.width + x) * 4 + 3] > inkAlpha) {
              ink++;
              inked = true;
            }
          }
          if (inked && !inBand) bands++;
          inBand = inked;
        }
        return { ink, bands, name: line.getAttribute("aria-label") ?? "", role: line.getAttribute("role"), url: canvas.toDataURL() };
      }),
    INK_ALPHA,
  )) as { ink: number; bands: number; name: string; role: string | null; url: string }[];
  const lettering = (await page.evaluate(`(async () => { const { CURIOS } = await import("/src/game/index.ts"); return CURIOS.tablet.lines.every((line) => document.fonts.check('46px "Noto Sans Deseret"', line)); })()`)) as boolean;
  check(`looking at it shows the tablet with its writing drawn: two lines, each a picture with a row of letters in it (${read.map((r) => `${r.ink} inked pixels in ${r.bands} row`).join(", ")})`, (await tablet.count()) === 1 && read.length === 2 && read.every((r) => r.ink > MIN_INK && r.bands === 1) && read[0].url !== read[1].url);
  check(`…each called by what it is, not what it says (${read[0]?.name})`, read.every((r) => r.role === "img" && r.name === "Writing in an unknown script"));
  check("…in a lettering that has those letters", lettering);
  check(`…and no Deseret letter is anywhere in the page as text, nor in a label or a title (${await deseretInPage(page)})`, (await deseretInPage(page)) === "none");
  check("…and nothing on it says in plain letters what the writing means", !/[A-Za-z]/.test((await tablet.textContent()) ?? "") && (await tablet.locator("[title]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("title") ?? ""))).every((title) => title.startsWith("Put it down")));
  await page.keyboard.press("Escape");
  check("Esc puts it down, and the menu is still open under it, and nothing under that has heard", (await tablet.count()) === 0 && (await book.count()) === 1 && (await page.evaluate(`window.manor3d.following.peek()`)) === "rose");

  // The place it lay at is known past the whole.
  await page.evaluate(`window.manor3d.game.places.caves = "unknown"`);
  await tab("Places").click();
  await book.locator('.book-tile[data-id="forest"]').click();
  await pageTime(page, REDRAWN_MS);
  check(`with all its question marks answered, the forest is known past the whole (${await detail.locator(".book-share").textContent()})`, (await detail.locator(".book-share").textContent()) === "🔎 133%" && ((await detail.locator(".book-share").getAttribute("class")) ?? "").includes("over"));
  await page.keyboard.press("Escape");
  await page.keyboard.press("m");
  await page.locator('button[data-place="forest"]').click();
  await pageTime(page, REDRAWN_MS);
  check(`…and its card on the map says the same, with the tablet beside what was to be found there (${await page.locator(".map-card-share").textContent()})`, (await page.locator(".map-card-share").textContent()) === "133%" && (await count(".map-card .map-curio-slot")) === 1);
  check(`the intel menu throws no errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, errors.length === 0);
  await page.close();
  await checkSlots({ browser, base, viewport, check });
  await checkRevealAll({ browser, base, viewport, check });
};

/** A place's page shows what there is to find there, slot by slot; a found slot leads to its own page; and with the dev menu unlocked a right-click on a question mark makes the thing known, here and on the map. */
const checkSlots = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  await page.goto(`${base}demo3d.html?help=0&view=ground`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  await page.evaluate(`window.manor3d.paused.set(true)`);
  const book = page.getByRole("dialog", { name: "Intel" });
  const tab = (name: string) => book.getByRole("tab", { name: new RegExp(`^${name}`) });
  const tile = (id: string) => book.locator(`.book-tile[data-id="${id}"]`);
  const detail = book.locator(".book-detail");
  const slot = (what: string) => detail.locator(`[data-slot="${what}"]`);
  const game = <T>(field: string): Promise<T> => page.evaluate(`window.manor3d.game.${field}`) as Promise<T>;
  const known = async (id: string): Promise<boolean> => (await tile(id).getAttribute("data-known")) === "true";
  const tallied = async (): Promise<string> => ((await book.locator(".book-tally").textContent()) ?? "").trim();

  // (A question mark says it cannot be pressed, so it is pressed here whether or no.)
  await page.keyboard.press("i");
  await tile("forest").click({ force: true });
  await tile("forest").click({ button: "right", force: true });
  await tile("forest").hover({ force: true });
  const plainTip = await tile("forest").getAttribute("title");
  check("a question mark cannot be pressed, and without the dev menu a right-click on it does nothing", !(await known("forest")) && (await detail.locator(".book-name").textContent()) === "The manor" && (await tallied()) === "6 / 34");
  // Without the dev menu: an unknown thing is a question mark, and the hidden one is not listed.
  await tab("Things").click();
  await pageTime(page, REDRAWN_MS);
  check(`without the dev menu, an unknown thing is a question mark and the tablet is not listed (${await tile("berries").getAttribute("aria-label")})`, (await tile("berries").locator(".book-unknown").count()) === 1 && (await tile("berries").getAttribute("aria-label")) === "Not yet known" && (await tile("berries").locator(".book-tile-name").count()) === 0 && ((await tile("berries").getAttribute("class")) ?? "").split(" ").every((c) => c !== "not-known") && (await tile("tablet").count()) === 0);
  await tab("Places").click();
  await page.evaluate(`window.manor3d.dev.unlocked.set(true)`);
  // With the dev menu unlocked, what is hidden is listed before it is found, marked as not yet come upon; and a right-click finds it.
  await tab("Things").click();
  await pageTime(page, REDRAWN_MS);
  check(`with the dev menu unlocked, what is hidden is shown before it is found, and marked so (${await tile("tablet").getAttribute("aria-label")})`, (await tile("tablet").count()) === 1 && ((await tile("tablet").getAttribute("class")) ?? "").includes("not-found") && (await tile("tablet").getAttribute("aria-label")) === "A stone tablet: hidden, and not yet come upon" && (await tallied()) === "6 / 34");
  const classes = async (id: string): Promise<string[]> => ((await tile(id).getAttribute("class")) ?? "").split(" ");
  check(`with the dev menu unlocked, an ordinary unknown thing shows its name and picture and is marked not yet known, not as hidden (${await tile("berries").getAttribute("aria-label")})`, (await tile("berries").locator(".book-tile-name").textContent()) === "Berries" && (await tile("berries").locator(".book-tile-picture").count()) === 1 && (await tile("berries").locator(".book-unknown").count()) === 0 && (await classes("berries")).includes("not-known") && !(await classes("berries")).includes("not-found") && (await tile("berries").getAttribute("aria-label")) === "Berries: not yet known" && (await tile("berries").getAttribute("title")) === "Berries: not yet known");
  check("…and the hidden one looks different from it: another class and another mark in its corner", (await classes("tablet")).includes("not-found") && !(await classes("tablet")).includes("not-known") && (await tile("tablet").locator(".book-tile-mark").textContent()) !== (await tile("berries").locator(".book-tile-mark").textContent()) && (await tile("tablet").getAttribute("aria-label")) !== (await tile("berries").getAttribute("aria-label")));
  check("…and neither can be pressed to open its page while it is not known", (await tile("berries").getAttribute("aria-disabled")) === "true" && (await tile("tablet").getAttribute("aria-disabled")) === "true");
  await tile("tablet").click({ button: "right", force: true });
  check(`…and a right-click on it has it come upon and in the house (${await tallied()})`, (await known("tablet")) && (await game<string[]>("curios")).join() === "tablet" && (await tallied()).startsWith("6 / 34") && (await tallied()).includes("✨ 1"));
  await page.evaluate(`window.manor3d.game.curios = []`);
  await tab("Places").click();
  await tile("forest").hover({ force: true });
  check(`with the dev menu unlocked, a question mark under the pointer says what a right-click on it would make known; without it, only what it is (${plainTip}; ${await tile("forest").getAttribute("title")})`, plainTip === "Not yet known" && (await tile("forest").getAttribute("title")) === "The forest: not yet known. Right-click to reveal: The forest");
  await tile("forest").click({ button: "right", force: true });
  check(`with the dev menu unlocked, a right-click on a question mark makes the thing known: the forest is found (${await tallied()})`, (await known("forest")) && (await game<string>("places.forest")) === "found" && (await tallied()) === "7 / 34");
  await tile("forest").click();
  check(`a place's page shows what there is to find there, slot by slot, as its card on the map does: a way on and two things, none yet found (${(await detail.locator(".map-slot").allTextContents()).join(" ")}; ${await detail.locator(".book-share").textContent()})`, (await detail.locator(".map-slot:not(.map-curio-slot)").allTextContents()).join("|") === "?|?|?" && (await detail.locator(".map-slot.known").count()) === 0 && (await detail.locator(".book-share").textContent()) === "🔎 0%");
  // What is hidden there has a slot of its own while the dev menu is unlocked, and none without it.
  const hiddenSlot = detail.locator(".map-curio-slot.not-found");
  const withDev = await hiddenSlot.count();
  await page.evaluate(`window.manor3d.dev.unlocked.set(false)`);
  await pageTime(page, REDRAWN_MS);
  const without = await detail.locator(".map-slot").count();
  await page.evaluate(`window.manor3d.dev.unlocked.set(true)`);
  await pageTime(page, REDRAWN_MS);
  check(`with the dev menu unlocked, what is hidden at a place has a question mark of its own among its slots, marked as not yet come upon; without it there are only the three (${without} slots, and ${await detail.locator(".map-slot").count()})`, withDev === 1 && without === 3 && (await detail.locator(".map-slot").count()) === 4 && (await hiddenSlot.textContent()) === "?");
  const tips: string[] = [];
  for (const what of ["way:caves", "thing:berries", "curio:tablet"]) {
    await slot(what).hover();
    tips.push((await slot(what).getAttribute("title")) ?? "");
  }
  check(`each of its question marks says what a right-click would make known (${tips.map((tip) => tip.split("Right-click to reveal: ")[1]).join(" | ")})`, tips.map((tip) => tip.split(". Right-click to reveal: ")[1]).join("|") === "the way on to the caves|Berries, at the forest|A stone tablet");
  await slot("way:caves").hover();
  const again = (await slot("way:caves").getAttribute("title")) ?? "";
  check("under the pointer a second time, it says so once and not twice", again === tips[0] && again.split("Right-click to reveal").length === 2);
  await slot("thing:berries").click();
  check("a slot not yet found leads nowhere", (await detail.locator(".book-name").textContent()) === "The forest");
  await slot("thing:berries").click({ button: "right", force: true });
  check(`a right-click on a slot makes that known too: berries, at the forest (${await detail.locator(".book-share").textContent()})`, (await slot("thing:berries").textContent()) === "🫐" && ((await slot("thing:berries").getAttribute("class")) ?? "").includes("known") && (await detail.locator(".book-share").textContent()) === "🔎 33%" && (await game<string[]>("finds.forest")).join() === "berries");
  await slot("thing:berries").click();
  check(`pressing a found slot goes to the page of what it is: berries, under Things (${await detail.locator(".book-name").textContent()})`, (await tab("Things").getAttribute("aria-selected")) === "true" && (await detail.locator(".book-name").textContent()) === "Berries" && (await detail.locator(".book-says").allTextContents()).includes("Gathered at the forest"));
  await tab("Places").click();
  await tile("forest").click();
  await slot("way:caves").click({ button: "right", force: true });
  check("a way on made known is on the map, as a place not yet visited", (await slot("way:caves").textContent()) === "🗺️" && (await game<string>("places.caves")) === "unknown" && !(await known("caves")));
  await tab("Crops").click();
  await tile("cucumber").click({ button: "right", force: true });
  await tab("Recipes").click();
  await tile("pie").click({ button: "right", force: true });
  await tab("Abilities").click();
  await tile("bread").click({ button: "right", force: true });
  await tab("Inventions").click();
  await tile("till").click({ button: "right", force: true });
  check(`so are a crop, a recipe, an ability and an invention (${await tallied()})`, (await game<string[]>("garden.known")).join() === "wheat,cucumber" && (await game<string[]>("recipes")).includes("pie") && (await game<number>("baked.evelyn")) === 100 && (await game<string[]>("devices")).join() === "till" && (await tallied()) === "12 / 34");

  // On the map: a place's question mark, and the slots on a place's card.
  await page.keyboard.press("Escape");
  await page.keyboard.press("m");
  await page.locator('button[data-place="lake"]').hover({ force: true });
  const lakeTip = await page.locator('button[data-place="lake"]').getAttribute("title");
  await page.locator('button[data-place="lake"]').click({ button: "right", force: true });
  await pageTime(page, REDRAWN_MS);
  check(`on the map, a place's question mark says it too (${lakeTip})`, (lakeTip ?? "").endsWith("Right-click to reveal: The lake"));
  check("on the map, a right-click on a place's question mark finds the place", (await game<string>("places.lake")) === "found" && (await page.locator('.map-place[data-place="lake"] img').count()) === 1);
  await page.locator('button[data-place="forest"]').click();
  await pageTime(page, REDRAWN_MS);
  await page.locator('.map-card [data-slot="thing:herbs"]').click({ button: "right", force: true });
  await pageTime(page, REDRAWN_MS);
  check(`…and on a place's card, a right-click on a slot makes it known (${await page.locator(".map-card-share").textContent()})`, (await page.locator('.map-card [data-slot="thing:herbs"]').textContent()) === "🌿" && (await page.locator(".map-card-share").textContent()) === "100%" && (await game<string[]>("finds.forest")).join() === "berries,herbs");
  const cardHidden = page.locator(".map-card .map-curio-slot.not-found");
  const onCard = await cardHidden.count();
  await cardHidden.hover();
  const cardTip = await cardHidden.getAttribute("title");
  await cardHidden.click({ button: "right" });
  await pageTime(page, REDRAWN_MS);
  check(`its card shows what is hidden there too, and a right-click on that has it come upon: the place is known past the whole (${cardTip}; ${await page.locator(".map-card-share").textContent()})`, onCard === 1 && (cardTip ?? "").endsWith("Right-click to reveal: A stone tablet") && (await game<string[]>("curios")).join() === "tablet" && (await page.locator(".map-card .map-curio-slot.not-found").count()) === 0 && (await page.locator(".map-card .map-curio-slot.known").textContent()) === "🪨" && (await page.locator(".map-card-share").textContent()) === "133%");
  // In town, a question mark for a shop is made known by a right-click too.
  await page.locator('button[data-place="town"]').click();
  await pageTime(page, REDRAWN_MS);
  const shopSlot = page.locator('.map-card [data-slot^="shop:"]').first();
  const shopTip = (await shopSlot.getAttribute("title")) ?? "";
  await shopSlot.click({ button: "right", force: true });
  await pageTime(page, REDRAWN_MS);
  check(`…and in town, a right-click on a shop's question mark finds the shop (${shopTip})`, shopTip.startsWith("A shop, not yet found") && (await game<string[]>("shops")).length === 1);
  await page.close();
};

// With the dev menu unlocked, a right-click on a tab of the intel menu makes all of its kind known, and one on the menu's name everything.
const checkRevealAll = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  await page.goto(`${base}demo3d.html?help=0&view=ground`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  await page.evaluate(`window.manor3d.paused.set(true)`);
  const book = page.getByRole("dialog", { name: "Intel" });
  const tab = (name: string) => book.getByRole("tab", { name: new RegExp(`^${name}`) });
  const name = book.locator(".menu-top .title");
  const counts = async (): Promise<string> => (await book.locator(".book-tab-count").allTextContents()).join(" ");
  const tallied = async (): Promise<string> => ((await book.locator(".book-tally").textContent()) ?? "").trim();
  /** Hold the pointer on something, and read its tooltip. */
  const tip = async (on: ReturnType<typeof tab>): Promise<string> => {
    await on.hover();
    return (await on.getAttribute("title")) ?? "";
  };

  await page.keyboard.press("i");
  const before = await counts();
  await tab("Things").click({ button: "right" });
  await name.click({ button: "right" });
  await pageTime(page, REDRAWN_MS);
  check(`without the dev menu, a right-click on a tab or on the menu's name makes nothing known, and neither offers to (${await counts()})`, (await counts()) === before && (await tip(tab("Things"))) === "" && (await tip(name)) === "");
  await page.evaluate(`window.manor3d.dev.unlocked.set(true)`);
  await pageTime(page, REDRAWN_MS);
  const tabTip = await tip(tab("Things"));
  const nameTip = await tip(name);
  check(`with it unlocked, a tab under the pointer says a right-click makes all of its kind known, and the menu's name everything (${tabTip}; ${nameTip})`, tabTip === "Right-click to reveal: every thing" && nameTip === "Right-click to reveal: everything there is to know");
  await tab("Things").click({ button: "right" });
  await pageTime(page, REDRAWN_MS);
  check(`a right-click on the Things tab makes every thing known, what is hidden among them, and nothing of another kind (${await counts()})`, (await counts()) === "2/5 9/9 ✨ 1/14 1/2 0/1 0/3" && (await page.evaluate(`window.manor3d.game.curios.join()`)) === "tablet");
  check(`…and that tab then offers nothing more (${await tip(tab("Things"))})`, (await tip(tab("Things"))) === "" && (await tab("Things").getAttribute("data-reveal")) === null);
  await name.click({ button: "right" });
  await pageTime(page, REDRAWN_MS);
  check(`a right-click on "Intel" makes everything known (${await counts()}; ${await tallied()})`, (await counts()) === "5/5 9/9 ✨ 14/14 2/2 1/1 3/3" && (await tallied()).startsWith("34 / 34"));
  check(`…and then it offers nothing more either (${await tip(name)})`, (await tip(name)) === "" && (await name.getAttribute("data-reveal")) === null);
  await page.close();
};
