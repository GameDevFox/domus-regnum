// The checks of the 3D demo page that are about the panel and where the picture is centred. The
// panel stays up over the map (the author's, 2026-11-18: "should always show the left side menu,
// whether we're on the manor screen or the map screen"). The house and the map are centred on the
// window unless told otherwise (the author's, the same day: "New setting (on by default) where
// gameplay view (manor and map) is perfectly centered on the screen at all times regardless of any
// ui elements, their size, or position."); told otherwise, among the settings, both are centred
// in what the panel leaves, and that is kept for the next visit. Run by check3d.ts.
import type { Page } from "playwright";

import { count, frames, noErrors, openPage, shown } from "./check3d-kit";
import type { Checks } from "./check3d-kit";

/** A window too narrow for the panel and the map side by side (under the page's WIDE_SCREEN). */
const NARROW = { width: 800, height: 700 };
/** Folded away, the panel gives the map at least this many pixels more, when the map is centred in what it leaves. */
const ROOM_GIVEN_PX = 100;
/** Frames in which the map would have moved, had the panel's folding moved it. */
const FRAMES_TO_MOVE = 4;
/** Nearer the middle than this, in pixels, is in the middle. */
const IN_THE_MIDDLE_PX = 1;
/** What the setting's row on the card says, each way. */
const CENTRED = "View: Centred";
const BESIDE = "View: Beside the Panel";

type Box = { left: number; right: number; top: number; bottom: number };
const boxOf = (page: Page, selector: string): Promise<Box> => page.locator(selector).first().evaluate((node) => (({ left, right, top, bottom }) => ({ left, right, top, bottom }))(node.getBoundingClientRect()));
/** Whether what is on top at the middle of `selector` is within `within`. */
const onTop = (page: Page, selector: string, within: string): Promise<boolean> =>
  page.evaluate(`(() => { const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2); return Boolean(top && top.closest(${JSON.stringify(within)})); })()`) as Promise<boolean>;
/** The left edge of the leftmost place on the map. */
const leftmost = (page: Page): Promise<number> => page.evaluate(() => Math.min(...[...document.querySelectorAll("[data-place]")].map((node) => node.getBoundingClientRect().left)));
/** Where on the window the point of the map that is looked at is drawn: the middle of the frame the map is seen through. */
const lookedAt = (page: Page): Promise<{ x: number; y: number }> =>
  page.evaluate(`(() => { const look = window.manor3d.map.look(); const sheet = document.querySelector(".map-sheet").getBoundingClientRect(); return { x: sheet.left + look.x * look.scale, y: sheet.top + look.y * look.scale }; })()`) as Promise<{ x: number; y: number }>;
const slidAside = (page: Page): Promise<number> => page.evaluate(`window.manor3d.slidAside()`) as Promise<number>;
const openMap = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "Open the map" }).click();
  await page.getByRole("dialog", { name: "The map" }).waitFor();
};

export const checkMapPanel = async (checks: Checks): Promise<void> => {
  const { check, viewport } = checks;
  const { page, errors } = await openPage(checks, "help=0");
  const middle = { x: viewport.width / 2, y: viewport.height / 2 };

  // A first visit: the house and the map are centred on the window, whatever the panel does.
  check(`on a first visit the picture of the house is centred on the window: it is not slid aside for the panel (${await slidAside(page)} px)`, (await slidAside(page)) === 0);
  await openMap(page);
  const panel = await boxOf(page, "#panel");
  check("with the map open the panel is still up, over the map", await onTop(page, "#panel", "#panel"));
  check("…and can be pressed: its fold button is on top where it is", await onTop(page, ".panel-fold", ".panel-fold"));
  const centre = await lookedAt(page);
  check(`…and the map is centred on the window (what is looked at is drawn at ${centre.x.toFixed(1)}, ${centre.y.toFixed(1)}; the middle is ${middle.x}, ${middle.y})`, Math.abs(centre.x - middle.x) < IN_THE_MIDDLE_PX && Math.abs(centre.y - middle.y) < IN_THE_MIDDLE_PX);
  await page.locator('button[data-place="town"]').click();
  await page.locator(".map-card").waitFor();
  const card = await boxOf(page, ".map-card");
  check(`a place's card is put up beside the panel, not under it (from ${Math.round(card.left)}, the panel to ${Math.round(panel.right)})`, card.left >= panel.right && (await onTop(page, ".map-card-close", ".map-card")));
  await page.locator(".map-card-close").click();
  const whole = await leftmost(page);
  await page.getByRole("button", { name: "Fold the panel away" }).click();
  await shown(async () => (await boxOf(page, "#panel")).right < panel.right);
  // (The map hears of the panel's new size a frame after it has it: it is given the frames to have moved, were it going to.)
  await frames(page, FRAMES_TO_MOVE);
  const foldedCentre = await lookedAt(page);
  check(`folding the panel away moves neither: the map is where it was (${foldedCentre.x.toFixed(1)}), and the house is not slid`, Math.abs(foldedCentre.x - middle.x) < IN_THE_MIDDLE_PX && Math.abs((await leftmost(page)) - whole) < IN_THE_MIDDLE_PX && (await slidAside(page)) === 0);
  await page.getByRole("button", { name: "Open the panel" }).click();
  await page.keyboard.press("Escape");

  // Among the settings it can be told to centre both in what the panel leaves, as the page did before.
  await page.getByRole("button", { name: "Settings" }).click();
  const row = page.locator("#settings-centre-says");
  const toggle = page.locator(".centre-button");
  check(`the settings have the choice, named for the way it is (${await row.textContent()}), and its button is not pressed`, (await row.textContent()) === CENTRED && (await toggle.getAttribute("aria-pressed")) === "false" && ((await toggle.getAttribute("aria-label")) ?? "").startsWith("The view is centred on the screen."));
  await toggle.click();
  check(`pressed, it is the other way (${await row.textContent()}), and the house is slid aside for the panel at once (${await slidAside(page)} px)`, (await row.textContent()) === BESIDE && (await toggle.getAttribute("aria-pressed")) === "true" && (await slidAside(page)) > 0);
  await page.keyboard.press("Escape");
  const open = await slidAside(page);
  await openMap(page);
  const beside = await leftmost(page);
  check(`the map, opened, then has every place clear of the panel (the leftmost at ${Math.round(beside)}, the panel to ${Math.round(panel.right)})`, beside >= panel.right);
  const besideCentre = await lookedAt(page);
  const rest = (panel.right + viewport.width) / 2;
  check(`…and is centred in what the panel leaves of the window (${besideCentre.x.toFixed(1)}; the middle of the rest is about ${Math.round(rest)})`, besideCentre.x > middle.x && Math.abs(besideCentre.x - rest) < panel.right / 4);
  await page.getByRole("button", { name: "Fold the panel away" }).click();
  const given = await shown(async () => (await leftmost(page)) <= beside - ROOM_GIVEN_PX);
  const folded = await boxOf(page, "#panel");
  check(`folding the panel away gives its room to the map (the leftmost place at ${Math.round(await leftmost(page))}) and to the house (${await slidAside(page)} px aside, from ${open})`, given && (await leftmost(page)) >= folded.right && (await slidAside(page)) < open && (await slidAside(page)) > 0);
  await page.getByRole("button", { name: "Open the panel" }).click();
  const taken = await shown(async () => Math.abs((await leftmost(page)) - beside) < IN_THE_MIDDLE_PX);
  check(`…and opening it takes the room back (the leftmost place at ${Math.round(await leftmost(page))}, the house ${await slidAside(page)} px aside)`, taken && (await slidAside(page)) === open);

  // The choice is kept for the next visit.
  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  await page.evaluate(`window.manor3d.paused.set(true)`);
  check(`the choice is kept: the next time the page is opened the house is slid aside for the panel (${await slidAside(page)} px)`, (await slidAside(page)) === open);
  await page.getByRole("button", { name: "Settings" }).click();
  check("…and the settings say so", (await row.textContent()) === BESIDE && (await toggle.getAttribute("aria-pressed")) === "true");
  await toggle.click();
  check("pressed again, both are centred on the window again", (await row.textContent()) === CENTRED && (await slidAside(page)) === 0);
  await page.keyboard.press("Escape");
  await openMap(page);
  const again = await lookedAt(page);
  check(`…the map too (${again.x.toFixed(1)})`, Math.abs(again.x - middle.x) < IN_THE_MIDDLE_PX);

  // Someone at home, pressed on the panel, is gone to: the map is put away, as her key does it.
  await page.locator("#cast .follow").nth(1).click();
  check("someone at home, pressed on the panel over the map, is gone to: the map is put away and she is followed", (await count(page, ".map-frame")) === 0 && (await page.evaluate(`window.manor3d.following.peek()`)) !== null);

  // On a window too narrow for both, the map lies over the panel, as it did.
  await page.setViewportSize(NARROW);
  await openMap(page);
  check("on a narrow window the map lies over the panel", await shown(() => onTop(page, "#panel", ".map-frame")));
  const narrow = await lookedAt(page);
  check(`…and is centred on it (${narrow.x.toFixed(1)} of ${NARROW.width})`, Math.abs(narrow.x - NARROW.width / 2) < IN_THE_MIDDLE_PX);

  noErrors(check, errors, "the panel, and where the picture is centred");
  await page.close();

  // The page's address can open it the second way, whatever the browser remembers: for the checks of that way.
  const { page: asked } = await openPage(checks, "help=0&centre=0");
  check(`the page's address can ask for the second way (?centre=0): the house is slid aside (${await slidAside(asked)} px)`, (await slidAside(asked)) > 0);
  await asked.getByRole("button", { name: "Settings" }).click();
  check("…which is not taken for a choice: nothing is kept of it", (await asked.evaluate(`localStorage.getItem("manor3d.view.beside-panel")`)) === null && (await asked.locator("#settings-centre-says").textContent()) === BESIDE);
  await asked.close();
};
