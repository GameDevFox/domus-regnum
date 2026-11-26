// The check of how work is given out on the 3D demo page: from the place it is done, not from
// the person (src/demo3d/work.ts and what it puts up). The icons over the places, their cards,
// the faces on them, and the badge and ring of each row of the household's list. Run by check3d.ts.
import type { Browser, Page } from "@playwright/test";

import { pageTime } from "./check3d-kit";
import { KEEP_LISTENERS, heldOnGone } from "./check3d-listeners";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** Time for the list and the cards to be read again from the game: they are looked to a few times a second. */
const READ_MS = 500;
/** Seconds of the house's time run at a go while something is waited for, and how many goes at the most. */
const STEP = 2;
const STEPS = 200;
/** Time for the view to close in on someone followed, and to draw back when she is let go. */
const FOLLOWED_MS = 2500;
/** How long a card is waited for after the press that should open it. */
const PRESS_MS = 3000;
/** How many times the icons are looked at for their swelling, and how long apart: a breath is 1.6 s. */
const BREATHS = 6;
const BREATH_MS = 300;
/** Seconds of the house's time run on while she is at the last step of a batch, which takes her about ten. */
const LAST_STEP_ON = 4;
/** How long the ring is waited for to close when what she was at is done, and then to open again. */
const CLOSED_MS = 5000;
/** How many times the Master's measure is filled and emptied again, to see the offers drawn afresh. */
const REDRAWS = 3;

type Icon = { job: string; workers: number; open: boolean; shown: boolean; swollen: number };

const icons = (page: Page): Promise<Icon[]> => page.evaluate(`window.manor3d.work.icons()`) as Promise<Icon[]>;
const iconOf = async (page: Page, job: string): Promise<Icon> => (await icons(page)).find((i) => i.job === job) ?? { job, workers: -1, open: false, shown: false, swollen: 0 };
/** Press the icon that floats over a place, where it is on the screen. */
const pressIcon = async (page: Page, job: string): Promise<void> => {
  const at = (await page.evaluate(`window.manor3d.named("place-${job}")`)) as { x: number; y: number };
  await page.mouse.click(at.x, at.y);
};
const posts = (page: Page): Promise<Record<string, string | undefined>> => page.evaluate(`({ ...window.manor3d.game.posts })`) as Promise<Record<string, string | undefined>>;
const until = (page: Page, so: string): Promise<boolean> => page.evaluate(`(() => { const h = window.manor3d; const { game } = h; for (let n = 0; n < ${STEPS}; n++) { if (${so}) return true; h.advance(${STEP}); } return Boolean(${so}); })()`) as Promise<boolean>;

export const checkWork = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(KEEP_LISTENERS);
  await page.goto(`${base}demo3d.html?help=0&view=ground`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  // (The town's shops are found to begin with, as they were when this was written: the finding of them is check3d-shops.ts's.)
  await page.evaluate(`window.manor3d.game.shops.push("miller", "greengrocer", "books", "herbalist", "clothes")`);
  await page.evaluate(`window.manor3d.paused.set(true)`);
  await pageTime(page, READ_MS);
  const kitchen = page.locator(".work-card-bake");
  const shop = page.locator(".work-card-shop");
  const garden = page.locator(".garden-card");
  const face = (card: typeof kitchen, who: string) => card.locator(`.who[data-who="${who}"]`);
  const row = (who: string) => page.locator(".person", { hasText: who });
  const badge = (who: string) => row(who).locator(".work");

  // The list of the household: no button for a job in it any more, and a badge of what each is at.
  check("the list of the household has no button for any job, nor one to send anyone for flour", (await page.locator("#cast .job").count()) === 0 && (await page.locator("#cast button").count()) === 2 * 4 && (await page.getByRole("button", { name: /^Send to town/ }).count()) === 0);
  check(`each row has a badge of what she is at: the baking for Evelyn, the shop for Rose, and an empty one for whoever is at nothing (${await badge("Evelyn").textContent()} ${await badge("Rose").textContent()} "${await badge("Sage").textContent()}")`, (await badge("Evelyn").textContent()) === "🥖" && (await badge("Rose").textContent()) === "🛎️" && (await badge("Sage").textContent()) === "" && (await badge("Sage").isDisabled()) && ((await badge("Sage").getAttribute("class")) ?? "").includes("idle"));

  // The icons over the places.
  const first = await icons(page);
  check(`looking into the ground floor, an icon floats over the kitchen, the shop and the garden, each saying how many work there, and the laboratory's is not there, being the cellar's (${first.map((i) => `${i.job} ${i.workers}`).join(", ")})`, first.map((i) => `${i.job} ${i.workers} ${i.shown}`).join("|") === "bake 1 true|shop 1 true|lab 1 false|garden 0 true");
  // A place nobody works at is the one that stands out: its icon swells and settles, where the others are still.
  const sizes: Icon[][] = [];
  for (let n = 0; n < BREATHS; n++) {
    sizes.push(await icons(page));
    await pageTime(page, BREATH_MS);
  }
  const most = (job: string): number => Math.max(...sizes.map((all) => all.find((i) => i.job === job)?.swollen ?? 0));
  check(`the garden, which nobody has, is the one whose icon swells to be noticed; the kitchen's and the shop's are still (${most("garden").toFixed(2)}, ${most("bake").toFixed(2)}, ${most("shop").toFixed(2)})`, most("garden") > 1.05 && most("bake") === 1 && most("shop") === 1);
  for (const [view, says] of [["first", "the floor above"], ["cellar", "the cellar"], ["house", "the whole house, with its roof on"]] as const) {
    await page.evaluate(`window.manor3d.view.set("${view}")`);
    await page.evaluate(`window.manor3d.settle()`);
    const shown = (await icons(page)).filter((i) => i.shown).map((i) => i.job).join();
    check(`looking at ${says}, the kitchen's and the shop's are not there; ${view === "cellar" ? "the laboratory's is, and the garden's is not" : "the garden's still is"} (${shown || "none"})`, shown === (view === "cellar" ? "lab" : "garden"));
  }

  // The laboratory: a job like the rest, at its own place in the cellar, and an alchemist's alone.
  const lab = page.locator(".work-card-lab");
  check(`the Master has the alchemy as the game begins, and his badge says so (${await badge("The Master").textContent()})`, (await posts(page)).master === "lab" && (await badge("The Master").textContent()) === "⚗️");
  await page.evaluate(`window.manor3d.view.set("cellar")`);
  await page.evaluate(`window.manor3d.settle()`);
  await pressIcon(page, "lab");
  await lab.waitFor({ timeout: PRESS_MS }).catch(() => undefined);
  check(`looking into the cellar, the icon over the laboratory opens its card, which says who is at the alchemy and how full the measure is (${await lab.locator(".work-keeper").textContent()}; ${(await lab.locator(".work-fact").allTextContents()).join(" ")})`, (await lab.locator(".title").textContent()) === "Laboratory" && (await lab.locator(".work-keeper").textContent()) === "The Master" && /^⚗️ \d+%$/.test((await lab.locator(".work-fact").first().textContent()) ?? ""));
  check(`only an alchemist can be given it: the Master's face is lit, and the others' cannot be pressed and say why (${await face(lab, "sage").getAttribute("title")})`, (await face(lab, "master").getAttribute("aria-pressed")) === "true" && (await face(lab, "master").isEnabled()) && (await face(lab, "evelyn").isDisabled()) && (await face(lab, "rose").isDisabled()) && (await face(lab, "sage").isDisabled()) && ((await face(lab, "sage").getAttribute("title")) ?? "").includes("Only an alchemist"));
  await face(lab, "master").click();
  await pageTime(page, READ_MS);
  check("pressed, the Master is taken off it: nobody is at the alchemy, and its icon says so", (await posts(page)).master === undefined && (await lab.locator(".work-keeper").textContent()) === "No one assigned" && (await iconOf(page, "lab")).workers === 0 && (await badge("The Master").textContent()) === "");
  await face(lab, "master").click();
  await pageTime(page, READ_MS);
  check("…and pressed again he has it back", (await posts(page)).master === "lab" && (await iconOf(page, "lab")).workers === 1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("l");
  check("the L key opens the laboratory's card from anywhere", (await lab.count()) === 1);
  await page.keyboard.press("Escape");
  await page.evaluate(`window.manor3d.view.set("ground")`);
  await page.evaluate(`window.manor3d.settle()`);

  // Pressing an icon opens that place's card; one card at a time.
  // (Evelyn, in the kitchen, is followed first: a press that went on past the icon to the floor would let go of her.)
  await page.evaluate(`window.manor3d.following.set("evelyn")`);
  await pageTime(page, FOLLOWED_MS);
  await page.evaluate(`window.manor3d.settle()`);
  await pressIcon(page, "bake");
  await kitchen.waitFor({ timeout: PRESS_MS }).catch(() => undefined);
  check(`pressing the icon over the kitchen opens the kitchen's card, which says who bakes (${await kitchen.locator(".work-keeper").textContent()})`, (await kitchen.locator(".title").textContent()) === "Kitchen" && ((await kitchen.locator(".work-keeper").textContent()) ?? "").startsWith("Evelyn") && (await kitchen.locator(".work-count").textContent()) === "1 / 4" && (await iconOf(page, "bake")).open);
  check("…and whoever was followed still is: the press was on the icon, and went no further", (await page.evaluate(`window.manor3d.following.peek()`)) === "evelyn");
  await page.evaluate(`window.manor3d.following.set(null)`);
  await pageTime(page, FOLLOWED_MS);
  check(`it shows what the kitchen has to work with (${(await kitchen.locator(".work-fact").allTextContents()).join(" ")})`, (await kitchen.locator(".work-fact").allTextContents()).join("|") === "🌾 24|→ 🍞 ×4");
  check("each of the household has a face on it; Evelyn's is lit, and Rose's says what she would leave", (await kitchen.locator(".who").count()) === 4 && (await face(kitchen, "evelyn").getAttribute("aria-pressed")) === "true" && (await face(kitchen, "rose").getAttribute("aria-pressed")) === "false" && (await face(kitchen, "rose").locator(".who-doing").textContent()) === "🛎️" && ((await face(kitchen, "rose").getAttribute("title")) ?? "").includes("she leaves the shop for it") && (await face(kitchen, "sage").locator(".who-doing").isHidden()));
  check(`…and the Master's is said of him, not her (${await face(kitchen, "master").getAttribute("title")})`, ((await face(kitchen, "master").getAttribute("title")) ?? "").includes("Press to give it to him: he leaves the laboratory for it") && !/\b(she|her)\b/i.test((await face(kitchen, "master").getAttribute("title")) ?? ""));
  await face(kitchen, "sage").click();
  await pageTime(page, READ_MS);
  check(`pressing a face gives her the work: Sage bakes beside Evelyn, the card counts two, and the icon over the kitchen does (${await kitchen.locator(".work-keeper").textContent()})`, (await posts(page)).sage === "bake" && (await posts(page)).evelyn === "bake" && (await face(kitchen, "sage").getAttribute("aria-pressed")) === "true" && (await kitchen.locator(".work-count").textContent()) === "2 / 4" && (await iconOf(page, "bake")).workers === 2 && (await badge("Sage").textContent()) === "🥖");
  await face(kitchen, "sage").click();
  await pageTime(page, READ_MS);
  check("pressing a lit face takes the work from her, and from her alone", (await posts(page)).sage === undefined && (await posts(page)).evelyn === "bake" && (await badge("Sage").textContent()) === "");
  await page.keyboard.press("b");
  await shop.waitFor();
  check(`the B key opens the shop's card, with bread on its shelf and no pie before the recipe is known, and the kitchen's is shut: one at a time (${(await shop.locator(".work-fact").allTextContents()).join(" ")})`, (await kitchen.count()) === 0 && (await shop.locator(".title").textContent()) === "Shop" && (await shop.locator(".work-count").count()) === 0 && (await shop.locator(".work-fact").count()) === 2 && !(await shop.locator(".work-fact").allTextContents()).join(" ").includes("🥧"));
  await face(shop, "sage").click();
  await pageTime(page, READ_MS);
  check("the shop is kept by one: giving it to Sage takes it from Rose, whose badge is empty again", (await posts(page)).sage === "shop" && (await posts(page)).rose === undefined && (await badge("Rose").textContent()) === "" && (await badge("Sage").textContent()) === "🛎️");
  await face(shop, "sage").click();
  await pageTime(page, READ_MS);
  check(`with nobody keeping it, the card says so in the author's words, and the icon over the shop is grey (${await shop.locator(".work-keeper").textContent()})`, (await shop.locator(".work-keeper").textContent()) === "No one assigned" && (await shop.locator(".work-keeper-none svg").count()) === 1 && (await iconOf(page, "shop")).workers === 0);
  await face(shop, "rose").click();
  await page.keyboard.press("g");
  await garden.waitFor();
  check("the G key opens the garden's card, and the shop's is shut", (await shop.count()) === 0 && (await garden.locator(".who").count()) === 4);
  await page.keyboard.press("Escape");
  check("Esc shuts it", (await garden.count()) === 0);
  await page.keyboard.press("k");
  check("the K key opens the kitchen's card, and pressed again shuts it", (await kitchen.count()) === 1);
  await page.keyboard.press("k");
  check("…and shuts it", (await kitchen.count()) === 0);

  // A badge opens the place she is at it.
  await badge("Evelyn").click();
  await kitchen.waitFor();
  check(`pressing someone's badge opens the place she works at (${await badge("Evelyn").getAttribute("aria-label")})`, (await kitchen.count()) === 1 && ((await badge("Evelyn").getAttribute("aria-label")) ?? "").endsWith("Open the kitchen"));
  await page.keyboard.press("Escape");

  // The ring: how far through what she is at.
  await page.evaluate(`window.manor3d.game.shelf.bread = 0`);
  const begun = await until(page, `game.tasks.evelyn?.step === "knead"`);
  await pageTime(page, READ_MS);
  check(`a ring round her badge says how far through a batch she is, by the steps of it that are done: kneading, she has only fetched the flour, a quarter (${await badge("Evelyn").getAttribute("data-share")}%)`, begun && (await badge("Evelyn").getAttribute("data-share")) === "25" && !((await badge("Evelyn").getAttribute("class")) ?? "").includes("waiting") && ((await badge("Evelyn").getAttribute("aria-label")) ?? "").includes("25% through"));
  // The batch is set on the shelf and the next begun: the ring closes for a moment, and then is empty, with nothing yet done of the new one.
  // With the loaves in her arms she is at the last step: the ring goes on from three quarters towards whole, and does not get there.
  const carrying = await until(page, `game.tasks.evelyn?.step === "deliver"`);
  await pageTime(page, READ_MS);
  const early = Number(await badge("Evelyn").getAttribute("data-share"));
  await page.evaluate(`window.manor3d.advance(${LAST_STEP_ON})`);
  await pageTime(page, READ_MS);
  const late = Number(await badge("Evelyn").getAttribute("data-share"));
  const still = (await page.evaluate(`window.manor3d.game.tasks.evelyn?.step`)) as string;
  check(`carrying the loaves to the shelf, the last step of four, her ring goes on filling from three quarters and stops short of whole (${early}%, then ${late}% a few seconds on)`, carrying && still === "deliver" && early >= 75 && late > early && late > 85 && late < 100);
  const anew = await until(page, `game.tasks.evelyn?.step === "fetch"`);
  // (Waited for, each in its turn: how soon the list is read again hangs on how fast the page is being drawn.)
  const seen = (share: string): Promise<boolean> => row("Evelyn").locator(`.work[data-share="${share}"]`).waitFor({ timeout: CLOSED_MS }).then(() => true, () => false);
  const closed = await seen("100");
  const opened = await seen("0");
  check(`a batch done, the ring is seen to close, and the next begins from nothing: on her way to the pantry there is no ring yet (${closed ? "closed" : "never closed"}, then ${opened ? "empty" : "not empty"})`, anew && closed && opened);
  check("keeping the shop has no end, and no ring: not one in the page at all", (await badge("Rose").getAttribute("data-share")) === "" && (await badge("Rose").locator(".work-ring").count()) === 0);
  await page.evaluate(`window.manor3d.game.flour = 0`);
  const stuck = await until(page, `game.tasks.evelyn?.step === null && game.flour === 0 && game.tasks.evelyn?.next === "fetch"`);
  await page.evaluate(`window.manor3d.advance(${STEP})`);
  await pageTime(page, READ_MS);
  const says = (await row("Evelyn").locator(".doing").textContent()) ?? "";
  check(`with no flour she is stood waiting: her ring is whole and of another colour, and the list says what for in full (${says})`, stuck && ((await badge("Evelyn").getAttribute("class")) ?? "").includes("waiting") && (await badge("Evelyn").getAttribute("data-share")) === "100" && says.includes("waiting for flour"));
  const cut = await row("Evelyn").locator(".doing").evaluate((d) => d.scrollWidth > d.clientWidth);
  check("…and it is not cut short", !cut);

  // The measure full, he waits to be told what it is spent on: his ring is whole, and the list says what he waits for.
  await page.evaluate(`(() => { const { game } = window.manor3d; game.lab.progress = game.lab.needed; game.lab.ready = true; })()`);
  const waits = await until(page, `game.tasks.master?.job === "lab" && game.tasks.master.step === null && game.lab.ready`);
  await page.evaluate(`window.manor3d.advance(${STEP})`);
  await pageTime(page, READ_MS);
  check(`with the measure full, the Master waits for a device to be chosen, and his row and his ring say so (${await row("The Master").locator(".doing").textContent()})`, waits && ((await badge("The Master").getAttribute("class")) ?? "").includes("waiting") && ((await row("The Master").locator(".doing").textContent()) ?? "").includes("waiting for a device to be chosen"));
  await page.evaluate(`(() => { const { game } = window.manor3d; game.lab.progress = 0; game.lab.ready = false; })()`);


  // Out of doors, her badge says so, and opens the map, which is where she is to be found.
  await page.evaluate(`import("/src/game/index.ts").then(({ sendToTown }) => { window.manor3d.game.coin = 100; sendToTown(window.manor3d.game, "sage"); })`);
  await page.evaluate(`window.manor3d.advance(${STEP})`);
  await pageTime(page, READ_MS);
  const outShare = Number(await badge("Sage").getAttribute("data-share"));
  check(`sent into town, Sage's badge says she is out, with a ring for how long she has been against how long she may be (${await badge("Sage").textContent()} ${outShare}%)`, (await badge("Sage").textContent()) === "🗺️" && outShare >= 0 && outShare < 20 && !(await badge("Sage").isDisabled()));
  await badge("Sage").click();
  check("…and pressing it opens the map", (await page.locator(".map-veil").count()) === 1);
  await page.keyboard.press("Escape");

  // The inventions offered are drawn afresh each time the measure fills and empties: what is taken out of the page leaves nothing listening behind.
  for (let n = 0; n < REDRAWS; n++) {
    await page.evaluate(`(() => { const { game } = window.manor3d; game.lab.progress = game.lab.needed; game.lab.ready = true; })()`);
    await pageTime(page, READ_MS);
    if (n === 0) check(`with the measure full, inventions are offered (${await page.locator("#lab .offer").count()})`, (await page.locator("#lab .offer").count()) > 0);
    await page.evaluate(`(() => { const { game } = window.manor3d; game.lab.progress = 0; game.lab.ready = false; })()`);
    await pageTime(page, READ_MS);
  }
  check(`…and no listener is held on an offer that has been taken out of the page (${await heldOnGone(page, ".offer")})`, (await heldOnGone(page, ".offer")) === 0);
  await page.evaluate(`(() => { const { game } = window.manor3d; game.lab.progress = game.lab.needed; game.lab.ready = true; })()`);
  await pageTime(page, READ_MS);
  const made = (await page.evaluate(`window.manor3d.game.devices.length`)) as number;
  await page.locator("#lab .offer").first().click();
  check("…and an offer pressed is made", (await page.evaluate(`window.manor3d.game.devices.length`)) === made + 1);

  check("giving out work throws no errors", errors.length === 0);
  await page.close();
};
