// The checks of the 3D demo page that are about the dev menu: it is locked until the false book
// in the laboratory is pulled or the page's address says so, its buttons are the game's dev
// commands, and a script reaches the same commands by name. Run by check3d.ts.
import type { Browser, Page } from "@playwright/test";

import { pageTime } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** Looking at the laboratory's bookcase from in front of it, close enough for one book to be pressed. */
const AT_THE_BOOKCASE = "view=cellar&tx=13.75&tz=1.2&az=0.25&polar=1.2&dist=7&help=0";
/** The far corner of the laboratory from its bookcase, on the cellar's floor. */
const OUT_OF_THE_WAY = { x: 18.3, z: 5.3 };
/** Time for the book to have tipped, or stood back. */
const TIPPED_MS = 900;
/** Time for the page to be redrawn after the game has been changed. */
const REDRAWN_MS = 350;
/** How far forward the book tips, in radians, about. */
const TIPPED = 0.42;
/** A colour to repaint a dress in, and the hue it is, in degrees. */
const TEAL = "#2f8f83";
const TEAL_HUE = 173;
/** One of the ready colours under the picker. */
const PLUM = "#a05cd0";
/** How wide the picture of someone who walks the house is, in pixels: a skin made for one is that wide. */
const SPRITE_WIDTH = 256;
/** Time for someone to be repainted: three pictures are fetched and gone over. */
const PAINTED_MS = 1500;
/** The house wakes at six: the second morning, in the game's minutes. */
const SECOND_MORNING = 24 * 60 + 6 * 60;
/** Long enough for the page to open, on a loaded machine. */
const OPENS_MS = 15000;

type Book = { x: number; y: number; tipped: number } | null;

export const checkDev = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  // One browser context, so that what it remembers lasts from one opening of the page to the next.
  const context = await browser.newContext({ viewport });
  const page: Page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const open = async (query: string): Promise<void> => {
    await page.goto(`${base}demo3d.html?${query}`);
    await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
    await page.evaluate(`window.manor3d.paused.set(true)`);
    // The Master works in the laboratory, and may be standing between the eye and the bookcase: he is stood in its far corner, out of the way of a press on the book.
    await page.evaluate(`(() => { const master = window.manor3d.world.actors.find((a) => a.id === "master"); if (master) Object.assign(master.walker.pos, ${JSON.stringify(OUT_OF_THE_WAY)}); })()`);
    await page.evaluate(`window.manor3d.settle()`);
    await pageTime(page, REDRAWN_MS);
  };
  const book = (): Promise<Book> => page.evaluate(`window.manor3d.named("secret.book")`) as Promise<Book>;
  const wrench = page.getByRole("button", { name: "Dev menu", exact: true });
  const unlocked = (): Promise<boolean> => page.evaluate(`window.manor3d.dev.unlocked.peek()`) as Promise<boolean>;
  const game = <T>(field: string): Promise<T> => page.evaluate(`window.manor3d.game.${field}`) as Promise<T>;

  await open(AT_THE_BOOKCASE);
  const shut = await book();
  check("the dev menu is locked to begin with: there is no wrench, and the false book stands in its place", (await wrench.count()) === 0 && !(await unlocked()) && shut !== null && Math.abs(shut.tipped) < 0.001);
  if (!shut) throw new Error("there is no false book in the laboratory's bookcase");

  // Pulled, the book tips forward and the menu is unlocked; it is said, and kept.
  await page.mouse.click(shut.x, shut.y - 6);
  await pageTime(page, TIPPED_MS);
  const pulled = await book();
  check(`a press on the false book pulls it: it tips forward, and the dev menu is unlocked (${pulled?.tipped.toFixed(2)} radians)`, pulled !== null && Math.abs(pulled.tipped - TIPPED) < 0.02 && (await unlocked()) && (await wrench.count()) === 1);
  check(`…which a notice says (${await page.locator(".dev-notice").first().textContent()})`, ((await page.locator(".dev-notice").first().textContent()) ?? "").includes("Dev mode enabled") && (await page.evaluate(`window.manor3d.following.peek()`)) === null);
  await open(AT_THE_BOOKCASE);
  await pageTime(page, TIPPED_MS);
  check("it is still unlocked the next time the page is opened, with the book pulled and nothing said", (await unlocked()) && (await wrench.count()) === 1 && Math.abs(((await book())?.tipped ?? 0) - TIPPED) < 0.02 && (await page.locator(".dev-notice").count()) === 0);

  // The wrench is beside the gear, to its left, and its menu is apart from the settings.
  const gearAt = await page.getByRole("button", { name: "Settings" }).boundingBox();
  const wrenchAt = await wrench.boundingBox();
  check("the wrench is to the left of the gear, on the same row", gearAt !== null && wrenchAt !== null && Math.abs(wrenchAt.y - gearAt.y) < 1 && wrenchAt.x + wrenchAt.width <= gearAt.x);

  // The menu: the game's dev commands, each a button.
  await wrench.click();
  const menu = page.getByRole("dialog", { name: "Dev menu" });
  const names = (await page.evaluate(`window.manor3d.dev.list()`)) as string[];
  check(`the wrench opens the menu, with a button for each of the game's dev commands (${names.length})`, (await menu.count()) === 1 && (await menu.locator(".dev-command").count()) >= names.length && names.includes("coin") && names.includes("play:first-caller"));
  // It is a card in the middle of the window, over the rest of the page; Esc, its cross, or a press on the dark round it puts it away.
  const panelAt = await menu.boundingBox();
  check("the menu is in the middle of the window, not hung under the wrench", panelAt !== null && Math.abs(panelAt.x + panelAt.width / 2 - viewport.width / 2) < 2 && Math.abs(panelAt.y + panelAt.height / 2 - viewport.height / 2) < 2 && panelAt.width > 400);
  await page.evaluate(`window.manor3d.following.set("rose")`);
  await page.keyboard.press("Escape");
  check("Esc puts it away, and is heard by nothing under it", (await menu.count()) === 0 && (await page.evaluate(`window.manor3d.following.peek()`)) === "rose");
  await page.evaluate(`window.manor3d.following.set(null)`);
  // (The dev menu is the tilde: the backtick alone follows the Master.)
  await page.keyboard.press("~");
  await page.mouse.click(8, viewport.height / 2);
  const shutByVeil = (await menu.count()) === 0;
  await wrench.click();
  await menu.getByRole("button", { name: "Close the dev menu" }).click();
  check("…and so do a press on the dark round it, and its cross", shutByVeil && (await menu.count()) === 0);
  await wrench.click();
  // Stock: one amount in a box, and a button for each thing, which gives that much of it.
  const amount = menu.getByLabel("How much each button under Stock gives");
  const [coin, flour] = [await game<number>("coin"), await game<number>("flour")];
  await menu.getByRole("button", { name: "Add sacks of flour" }).click();
  check(`under Stock there is one amount, ten to begin with, and a button for each thing that gives that much of it (${await amount.inputValue()})`, (await amount.inputValue()) === "10" && (await game<number>("flour")) === flour + 10 && (await game<number>("coin")) === coin);
  await amount.fill("100");
  await menu.getByRole("button", { name: "Add coin" }).click();
  check("the amount can be changed: a hundred, and the coin's button gives a hundred coin", (await game<number>("coin")) === coin + 100 && (await game<number>("flour")) === flour + 10);
  // What is typed into the box is the box's: the page's own keys are not heard while it has the focus (1 and 2 would follow Evelyn and Rose).
  await amount.fill("");
  await amount.focus();
  await page.keyboard.type("12");
  check(`what is typed into the amount goes into it, and is not taken for the page's keys (${await amount.inputValue()})`, (await amount.inputValue()) === "12" && (await page.evaluate(`window.manor3d.following.peek()`)) === null);
  await amount.fill("100");
  await menu.getByRole("button", { name: "Run to the next morning" }).click();
  check(`running to the next morning plays the day out: it is six on the second day (${(await game<number>("clock")).toFixed(0)})`, Math.abs((await game<number>("clock")) - SECOND_MORNING) < 1 && (await game<number>("sold")) > 0);
  await menu.getByRole("button", { name: /^Play .first-caller/ }).click();
  // (It is begun after the black, and played once the black has gone: curtain.ts.)
  await page.waitForFunction(() => { const m = (window as unknown as { manor3d: { game: { scene: unknown }; curtain: { on: () => boolean } } }).manor3d; return m.game.scene !== null && !m.curtain.on(); }, undefined, { timeout: 10000 }).catch(() => null);
  await page.evaluate(`window.manor3d.advance(0.5)`);
  await pageTime(page, REDRAWN_MS);
  check("a scene is played on the spot, without waiting for its day", (await page.locator(".scene").count()) === 1 && (await game<string | null>("scene.scene.id")) === "first-caller");
  const during = await game<number>("coin");
  const outOfTheWay = (await menu.count()) === 0;
  await wrench.click();
  await menu.getByRole("button", { name: "Add coin" }).click();
  check("…and the menu gets out of the scene's way, and is still to hand over it by its wrench", outOfTheWay && (await game<number>("coin")) === during + 10);
  await wrench.click();
  const shutNow = (await menu.count()) === 0;
  await wrench.click();
  check("…which shuts the menu and opens it again", shutNow && (await menu.count()) === 1);
  const live = page.getByLabel("Live reload in this tab");
  check("this tab's live reload can be switched off, and that lasts while the tab does", (await live.isChecked()) && (await live.isEnabled()));
  await live.uncheck();
  await open(AT_THE_BOOKCASE);
  await wrench.click();
  check("…a reload by hand does not switch it on again", !(await live.isChecked()));
  // Space on the box ticks it, as on any box the focus is brought to other than by the mouse, and does not pause or resume the house as well.
  const pausedThen = await page.evaluate(`window.manor3d.paused.peek()`);
  await live.focus();
  await page.keyboard.press(" ");
  check("Space on the live-reload box ticks it, and does not also pause or resume", (await live.isChecked()) && (await page.evaluate(`window.manor3d.paused.peek()`)) === pausedThen);
  await live.check();

  // Palette swaps: a dress is given another colour, on the figure in the house and in her portrait at once.
  // (A figure wears one face of her picture at a time, so one repainted person is one new skin in the scene.)
  const skins = (): Promise<number> => page.evaluate(`(() => { let n = 0; window.manor3d.scene.traverse((o) => { if (o.material && o.material.map && o.material.map.isCanvasTexture && o.material.map.image.width === ${SPRITE_WIDTH}) n += 1; }); return n; })()`) as Promise<number>;
  /** The middle hue of what is vivid in the lower half of a picture: her dress, by and large. */
  const dressHue = (selector: string): Promise<number> =>
    page.evaluate(`(async () => {
      const picture = document.querySelector(${JSON.stringify(selector)});
      await picture.decode();
      const canvas = document.createElement("canvas");
      canvas.width = picture.naturalWidth;
      canvas.height = picture.naturalHeight;
      const pen = canvas.getContext("2d");
      pen.drawImage(picture, 0, 0);
      const { data } = pen.getImageData(0, Math.floor(canvas.height / 2), canvas.width, Math.floor(canvas.height / 2));
      let x = 0, y = 0;
      for (let at = 0; at < data.length; at += 4) {
        const [r, g, b, a] = [data[at], data[at + 1], data[at + 2], data[at + 3]];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (a < 200 || max === 0 || (max - min) / max < 0.3 || max < 60) continue;
        const sixth = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
        const turn = (sixth * 60 * Math.PI) / 180;
        x += Math.cos(turn);
        y += Math.sin(turn);
      }
      return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    })()`) as Promise<number>;
  // The colour room: opened from the dev menu, with room to see each picture.
  const room = page.getByRole("dialog", { name: "Colours" });
  const big = ".palette-big";
  const person = (name: string) => room.getByRole("button", { name, exact: true });
  const number = room.getByLabel("The colour's number");
  const pickedNow = (): Promise<Record<string, string>> => page.evaluate(`window.manor3d.dev.painted()`) as Promise<Record<string, string>>;
  const openRoom = async (): Promise<void> => {
    await menu.getByRole("button", { name: /Colours/ }).click();
    await pageTime(page, REDRAWN_MS);
  };
  await openRoom();
  check("a button in the dev menu opens the colour room: four people to choose from, and a portrait or a figure of each", (await room.count()) === 1 && (await room.locator(".palette-person").count()) === 4 && (await room.locator(".palette-tabs .chip").allTextContents()).join("|") === "Portrait|Figure" && (await room.locator(".react-colorful").count()) === 1);
  await person("Rose").click();
  await pageTime(page, REDRAWN_MS);
  check(`nobody is repainted to begin with (Rose's dress is about ${(await dressHue(big)).toFixed(0)} degrees: pink)`, (await skins()) === 0 && Math.abs((await dressHue(big)) - 352) < 15 && (await number.inputValue()).toLowerCase() === "d0767b");
  await number.fill(TEAL.slice(1));
  await page.waitForTimeout(PAINTED_MS);
  check(`a colour typed into the picker repaints her portrait in it, large (now about ${(await dressHue(big)).toFixed(0)} degrees: teal)`, (await pickedNow()).rose === TEAL && ((await page.locator(big).getAttribute("src")) ?? "").startsWith("data:image/png") && Math.abs((await dressHue(big)) - TEAL_HUE) < 12);
  check(`…and the figure that walks the house (${await skins()} figure in a new skin)`, (await skins()) === 1);
  const mirrored = async (): Promise<boolean> => (await page.locator(big).evaluate((node) => getComputedStyle(node).transform)).startsWith("matrix(-1");
  const asDrawn = await mirrored();
  await room.getByRole("button", { name: "⇄ Flip" }).click();
  const flippedNow = await mirrored();
  await room.getByRole("button", { name: "⇄ Flip" }).click();
  check("a portrait is flipped to face the other way, and back", !asDrawn && flippedNow && !(await mirrored()));
  // Her figure, turned through the four ways she is seen in the house: two drawings, each as drawn and mirrored.
  await room.getByRole("button", { name: "Figure", exact: true }).click();
  const seen: string[] = [];
  const srcs: string[] = [];
  for (let n = 0; n < 5; n++) {
    seen.push(`${await page.locator(big).getAttribute("data-turn")}${(await mirrored()) ? "m" : ""}`);
    srcs.push((await page.locator(big).getAttribute("src")) ?? "");
    await room.getByRole("button", { name: "Turn her to the right" }).click();
  }
  check(`her figure is shown repainted, and turns through four ways and round again (${seen.join(", ")})`, seen.join(",") === "0,1m,2m,3,0" && srcs.every((src) => src.startsWith("data:image/png")) && srcs[0] === srcs[1] && srcs[2] === srcs[3] && srcs[0] !== srcs[2] && Math.abs((await dressHue(big)) - TEAL_HUE) < 12);
  await room.getByRole("button", { name: "Turn her to the left" }).click();
  check("…and back the other way", (await page.locator(big).getAttribute("data-turn")) === "0");
  // A ready colour, from the row under the picker.
  await room.getByRole("button", { name: PLUM, exact: true }).click();
  await page.waitForTimeout(PAINTED_MS);
  check("a ready colour under the picker is picked by pressing it", (await pickedNow()).rose === PLUM && (await number.inputValue()).toLowerCase() === PLUM.slice(1));
  // The Master's coat has no colour of its own in his portrait: the room says so, and repaints his figure only.
  await person("The Master").click();
  await room.getByRole("button", { name: "Portrait", exact: true }).click();
  await number.fill(TEAL.slice(1));
  await page.waitForTimeout(PAINTED_MS);
  check("the Master's portrait is not repainted, and the room says why; his figure is", (await room.locator(".palette-note").isVisible()) && ((await page.locator(big).getAttribute("src")) ?? "").endsWith("portraits/master.webp") && (await skins()) === 2);
  await room.getByRole("button", { name: "↺ As drawn" }).click();
  await page.waitForTimeout(PAINTED_MS);
  // The room has the keys while it is open.
  await page.keyboard.press("m");
  const noMap = (await page.locator(".map-frame").count()) === 0;
  await page.keyboard.press("Escape");
  check("the room has the keys while it is open, and Esc shuts it", noMap && (await room.count()) === 0 && (await menu.count()) === 1);
  await open(AT_THE_BOOKCASE);
  await page.waitForTimeout(PAINTED_MS);
  check("what was picked is kept: Rose is repainted the next time the page is opened, and the Master is as he was drawn", (await skins()) === 1 && JSON.stringify(await pickedNow()) === JSON.stringify({ rose: PLUM }));
  await wrench.click();
  await openRoom();
  await person("Rose").click();
  await room.getByRole("button", { name: "↺ As drawn" }).click();
  await page.waitForTimeout(PAINTED_MS);
  check("she can be put back as she was drawn", (await skins()) === 0 && ((await page.locator(big).getAttribute("src")) ?? "").endsWith(".webp") && Object.keys(await pickedNow()).length === 0 && (await number.inputValue()).toLowerCase() === "d0767b");
  await room.getByRole("button", { name: "Close the colour room" }).click();

  // A script reaches the same commands by name, with no menu.
  const before = await game<number>("stock.berries");
  const ran = (await page.evaluate(`window.manor3d.dev.run("berries")`)) as boolean;
  check("a script runs a command by its name", ran && (await game<number>("stock.berries")) === before + 12 && (await page.evaluate(`window.manor3d.dev.run("no-such-thing")`)) === false);
  await page.evaluate(`window.manor3d.dev.run("berries", 5)`);
  check("…and can say how much, of a thing that is given by the amount", (await game<number>("stock.berries")) === before + 12 + 5);

  // Locked again: by the menu's own button, or by pressing the book.
  const off = menu.getByRole("button", { name: "Disable Dev Mode" });
  const beside = (await page.evaluate(`(() => { const off = document.querySelector(".dev-off").getBoundingClientRect(); const cross = document.querySelector(".dev-close").getBoundingClientRect(); return [off.right, cross.left, Math.abs(off.top + off.height / 2 - cross.top - cross.height / 2)]; })()`)) as [number, number, number];
  check(`dev mode is put off by a button to the left of the menu's cross, by a wrench with a line through it and its name (${await off.textContent()})`, (await off.count()) === 1 && (await off.locator("svg circle").count()) === 1 && beside[0] <= beside[1] && beside[1] - beside[0] < 20 && beside[2] < 6 && (await menu.getByRole("button", { name: /Lock/ }).count()) === 0);
  await off.click();
  await pageTime(page, TIPPED_MS);
  check(`locked from the menu, the wrench and the menu go, the book stands back, and a notice says so (${await page.locator(".dev-notice").last().textContent()})`, (await wrench.count()) === 0 && (await menu.count()) === 0 && Math.abs((await book())?.tipped ?? 1) < 0.02 && ((await page.locator(".dev-notice").last().textContent()) ?? "").includes("Dev mode disabled"));
  const again = await book();
  if (again) await page.mouse.click(again.x, again.y - 6);
  await pageTime(page, TIPPED_MS);
  check("unlocked again by the book, the wrench is back and the menu waits to be opened", (await wrench.count()) === 1 && (await menu.count()) === 0);
  if (again) await page.mouse.click(again.x, again.y - 6);
  await pageTime(page, TIPPED_MS);
  check("the book is a switch: pressed twice, it is pulled and stood back again", !(await unlocked()) && Math.abs((await book())?.tipped ?? 1) < 0.02);

  // The page's address says, whatever the browser remembers.
  await open(`${AT_THE_BOOKCASE}&dev=true`);
  check("opened with ?dev=true it is unlocked", (await unlocked()) && (await wrench.count()) === 1);
  await open(`${AT_THE_BOOKCASE}&dev=0`);
  check("opened with ?dev=0 it is locked, though it was unlocked a moment ago", !(await unlocked()) && (await wrench.count()) === 0);
  await open("view=ground&help=0&dev=1");
  const hidden = await book();
  if (hidden) await page.mouse.click(hidden.x, hidden.y);
  await pageTime(page, REDRAWN_MS);
  check("the book cannot be pressed through the floor: looking into the ground floor, a press where it is does nothing", await unlocked());

  // What this browser kept of the colours may be anything: what is not a list of colours is let go of, and the page opens all the same.
  await page.evaluate(`localStorage.setItem("manor3d.palette", "null")`);
  await page.goto(`${base}demo3d.html?help=0`);
  const opens = await page
    .waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d), undefined, { timeout: OPENS_MS })
    .then(() => true)
    .catch(() => false);
  check("a kept palette that is not one does not stop the page from opening", opens && JSON.stringify(await page.evaluate(`window.manor3d.dev.painted()`)) === "{}");
  await page.evaluate(`localStorage.removeItem("manor3d.palette")`);

  check(`the dev menu throws no errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, errors.length === 0);
  await context.close();
};
