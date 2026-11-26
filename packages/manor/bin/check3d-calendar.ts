// The checks of the 3D demo page that are about the calendar: the day at the head of the clock
// is a leaf that opens it, a season is a page with a week to a row, the Sabbaths and Christmas
// are on it, and so is the day of the house's occasion once one is chosen. Run by check3d.ts.
import type { Browser } from "@playwright/test";

import { pageTime } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** Time for the page to be redrawn after the game has been changed. */
const REDRAWN_MS = 300;
/** Minutes in a day. */
const DAY = 24 * 60;
/** A page with more squares than this (the seven names of the days, and five rows of seven) takes a sixth row. */
const SIX_ROWS_FROM = 7 + 5 * 7;
/** How wide a column of the calendar is, about, for telling which column a day stands in. */
const COLUMNS = 7;

export const checkCalendar = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${base}demo3d.html?help=0`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  await page.evaluate(`window.manor3d.paused.set(true)`);
  const leaf = page.getByRole("button", { name: /^Calendar:/ });
  const calendar = page.getByRole("dialog", { name: "Calendar" });
  const title = calendar.locator(".calendar-title");
  const day = (n: number) => calendar.locator(`.calendar-day[data-day="${n}"]`);
  /** Which column of the seven a day stands in, counting the first as 0. */
  const column = async (n: number): Promise<number> => {
    const grid = await calendar.locator(".calendar-grid").boundingBox();
    const cell = await day(n).boundingBox();
    return grid && cell ? Math.round(((cell.x - grid.x) / grid.width) * COLUMNS) : -1;
  };

  check(`the day at the head of the clock is a leaf of the calendar: the first day of the first season (${await leaf.getAttribute("aria-label")})`, (await leaf.textContent()) === "1" && (await leaf.getAttribute("aria-label")) === "Calendar: Monday, Spring 1, year 1" && (await leaf.getAttribute("data-season")) === "spring");
  await leaf.click();
  check(`pressing it opens the calendar at the season it is (${await title.textContent()})`, (await calendar.count()) === 1 && ((await title.textContent()) ?? "").includes("Spring · Year 1") && (await calendar.locator(".calendar-day").count()) === 30);
  check(`its legend names only what the page holds: Spring has no Christmas (${await calendar.locator(".calendar-legend").textContent()})`, (await calendar.locator(".calendar-legend").textContent()) === "Sundays are the Sabbath");
  const unnamed = await calendar.locator(".calendar-top button").evaluateAll((nodes) => nodes.filter((node) => node.textContent !== "Today" && (!node.getAttribute("title") || node.getAttribute("title") !== node.getAttribute("aria-label"))).map((node) => `${node.textContent}: "${node.getAttribute("aria-label")}" / "${node.getAttribute("title")}"`));
  check(`its ‹, › and Close each say the same in their name and their tooltip (${unnamed.join("; ") || "all do"})`, unnamed.length === 0 && (await calendar.locator(".calendar-top button").count()) === 4);
  check("today is marked, and it is the only day that is", ((await day(1).getAttribute("class")) ?? "").includes("today") && (await calendar.locator(".calendar-day.today").count()) === 1);
  check("a week is a row: the first day is a Monday, in the first column, and the seventh is in the last", (await column(1)) === 0 && (await column(7)) === 6 && (await column(8)) === 0);
  check("the Sundays are the Sabbath, and are marked so", (await calendar.locator(".calendar-day.sabbath").count()) === 4 && ((await day(7).getAttribute("aria-label")) ?? "").includes("the Sabbath") && !((await day(8).getAttribute("class")) ?? "").includes("sabbath"));

  // The week runs on: the next season begins on the day after this one ends.
  await calendar.getByRole("button", { name: "The season after" }).click();
  check(`the next page is the next season, which begins where the week had got to: thirty days on from a Monday is a Wednesday (${await title.textContent()})`, ((await title.textContent()) ?? "").includes("Summer · Year 1") && (await calendar.locator(".calendar-day").count()) === 31 && (await column(1)) === 2 && (await calendar.locator(".calendar-day.today").count()) === 0);
  await calendar.getByRole("button", { name: "The season after" }).click();
  await calendar.getByRole("button", { name: "The season after" }).click();
  check(`Christmas is Winter 25 (${await day(25).getAttribute("aria-label")})`, ((await title.textContent()) ?? "").includes("Winter") && ((await day(25).textContent()) ?? "").includes("🎄") && ((await day(25).getAttribute("aria-label")) ?? "").includes("Christmas") && !((await day(24).textContent()) ?? "").includes("🎄"));
  check(`…and Winter's legend names it (${await calendar.locator(".calendar-legend").textContent()})`, ((await calendar.locator(".calendar-legend").textContent()) ?? "").includes("🎄 Christmas"));
  const first = await column(25);
  await calendar.getByRole("button", { name: "The season after" }).click();
  check("the page after the last season is the first season of the next year", ((await title.textContent()) ?? "").includes("Spring · Year 2"));
  // A season that takes six rows is longer at the foot: the buttons that turn the pages are where they were.
  const turner = calendar.getByRole("button", { name: "The season after" });
  const fiveRows = { at: await turner.boundingBox(), card: await calendar.boundingBox(), days: await calendar.locator(".calendar-grid > *").count() };
  await turner.click();
  const sixRows = { at: await turner.boundingBox(), card: await calendar.boundingBox(), days: await calendar.locator(".calendar-grid > *").count() };
  check(`a season of six rows hangs from the same place as one of five, and is longer at the foot: the button that turned to it has not moved (${fiveRows.card?.height.toFixed(0)} px tall, then ${sixRows.card?.height.toFixed(0)})`, fiveRows.at !== null && sixRows.at !== null && fiveRows.card !== null && sixRows.card !== null && sixRows.days > SIX_ROWS_FROM && fiveRows.days <= SIX_ROWS_FROM && sixRows.at.x === fiveRows.at.x && sixRows.at.y === fiveRows.at.y && sixRows.card.y === fiveRows.card.y && sixRows.card.height > fiveRows.card.height + 20);
  for (let n = 0; n < 2; n++) await turner.click();
  check(`…and next year Christmas falls on another day of the week (column ${first}, then ${await column(25)})`, ((await title.textContent()) ?? "").includes("Winter · Year 2") && (await column(25)) !== first);
  await calendar.getByRole("button", { name: "Today" }).click();
  check("Today turns back to the season it is", ((await title.textContent()) ?? "").includes("Spring · Year 1"));
  await calendar.getByRole("button", { name: "The season before" }).click();
  check("there is no page before the first", ((await title.textContent()) ?? "").includes("Spring · Year 1"));

  // The house's occasion is on it from the day it is chosen; and the days go by.
  check("no occasion is on it before one is chosen", !((await calendar.locator(".calendar-legend").textContent()) ?? "").includes("occasion") && (await calendar.locator(".calendar-marks").allTextContents()).join("") === "");
  // (Ten on the third morning is after the first caller is due: he is marked as having been, so that his scene does not begin over the calendar.)
  await page.evaluate(`(() => { const { game } = window.manor3d; game.goal = "tea"; game.occasionDay = 9; game.seen.push("first-caller"); game.clock = ${2 * DAY + 10 * 60}; })()`);
  await pageTime(page, REDRAWN_MS);
  check(`chosen, the occasion is marked on its day (${await day(9).getAttribute("aria-label")})`, ((await day(9).textContent()) ?? "").includes("🫖") && ((await day(9).getAttribute("aria-label")) ?? "").includes("occasion") && ((await calendar.locator(".calendar-legend").textContent()) ?? "").includes("occasion"));
  check("two days on, today is the third, the days gone by are faint, and the leaf says so", ((await day(3).getAttribute("class")) ?? "").includes("today") && (await calendar.locator(".calendar-day.past").count()) === 2 && (await leaf.textContent()) === "3" && ((await leaf.getAttribute("aria-label")) ?? "").includes("Wednesday, Spring 3"));

  // With the dev menu unlocked, a right-click on a day to come runs the game on to the morning of it.
  const clock = (): Promise<number> => page.evaluate(`window.manor3d.game.clock`) as Promise<number>;
  const was = await clock();
  await day(5).click({ button: "right" });
  check("without the dev menu a right-click on a day does nothing", (await clock()) === was);
  // (The first caller's scene is due on this day: it is marked as seen, so that the days can be run through.)
  await page.evaluate(`(() => { window.manor3d.dev.unlocked.set(true); window.manor3d.game.seen.push("first-caller"); })()`);
  await day(2).click({ button: "right" });
  check("with it, a right-click on a day gone by does nothing either", (await clock()) === was);
  const sold = (await page.evaluate(`window.manor3d.game.sold`)) as number;
  await day(5).click({ button: "right" });
  await pageTime(page, REDRAWN_MS);
  check(`…and on a day to come it runs the game on to that morning, with all that happens between (${((await clock()) / DAY).toFixed(2)} days in; ${await leaf.getAttribute("aria-label")})`, Math.abs((await clock()) - (4 * DAY + 6 * 60)) < 1 && ((await page.evaluate(`window.manor3d.game.sold`)) as number) > sold && ((await day(5).getAttribute("class")) ?? "").includes("today") && (await leaf.textContent()) === "5");

  await page.keyboard.press("Escape");
  check("Esc shuts it", (await calendar.count()) === 0);
  await page.keyboard.press("c");
  check("C opens it", (await calendar.count()) === 1);
  await calendar.getByRole("button", { name: "Close" }).click();
  check(`the calendar throws no errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, (await calendar.count()) === 0 && errors.length === 0);
  // A run that a scene stops short: the calendar gets out of the scene's way.
  await page.evaluate(`(() => { const { game } = window.manor3d; game.seen = game.seen.filter((id) => id !== "first-caller"); game.clock = Math.floor(game.clock / ${DAY}) * ${DAY} + 9.5 * 60; })()`);
  await page.keyboard.press("c");
  await day(9).click({ button: "right" });
  await pageTime(page, REDRAWN_MS);
  // (The scene the run stopped at is begun after the black: curtain.ts.)
  await page.waitForFunction(() => (window as unknown as { manor3d: { game: { scene: unknown } } }).manor3d.game.scene !== null, undefined, { timeout: 10000 }).catch(() => null);
  check("a run on to a day that a scene stops short leaves the scene to be seen: the calendar is put away", (await calendar.count()) === 0 && ((await page.evaluate(`window.manor3d.game.scene?.scene.id ?? null`)) as string | null) === "first-caller");
  await page.close();
};
