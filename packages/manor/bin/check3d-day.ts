// The checks of the 3D demo page that are about the time of day: the dial, the light, bedtime,
// the night, and the clock in the hall. Run by check3d.ts.
import type { Browser, Page } from "@playwright/test";

import { pageTime } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** Time for a frame or two to be drawn after the day has been moved on by hand. */
const DRAWN_MS = 400;
const TWO_TURNS = Math.PI * 2;
/** How near a hand must be to where it should point, in radians: about a minute on the face. */
const HAND_SLACK = 0.12;

/** What a script can see of the light: read from what is drawn, not from the arithmetic that set it. */
type Lit = { sun: number; glow: number; flame: number; flamesDrawn: boolean; lights: number; figureBlue: number; inner: string };
/** The red and the blue of a colour as the page gives it: "rgb(61 74 102)". */
const redAndBlue = (colour: string): [number, number] => {
  const [red, , blue] = (colour.match(/\d+/g) ?? []).map(Number);
  return [red ?? 0, blue ?? 0];
};

// Written as text for the page to run: a named function compiled here would not exist there.
const LIT = `(() => {
  const h = window.manor3d;
  let sun = 0;
  let glow = 0;
  let flame = 0;
  let flamesDrawn = false;
  let lights = 0;
  h.scene.traverse((o) => {
    if (o.isDirectionalLight) sun = o.intensity;
    // A window's glass glows of itself when the lamps are lit; a lamp's flame is a picture, drawn only when it is alight.
    if (o.isMesh && !Array.isArray(o.material) && o.material.emissive) glow = Math.max(glow, o.material.emissive.r);
    // (The icons over the places of work are pictures that face the camera too, and are no flames: place-icons.ts.)
    if (o.isSprite && o.material.visible && !o.name.startsWith("place-")) {
      flamesDrawn = true;
      flame = Math.max(flame, o.material.opacity);
    }
  });
  // The fires and lamps throwing light just now: those on a storey that is drawn, and lit.
  h.scene.traverseVisible((o) => { if (o.isPointLight) lights += 1; });
  const card = h.scene.getObjectsByProperty("isMesh", true).find((o) => o.material.map && o.material.alphaTest > 0 && o.material.type === "MeshBasicMaterial" && o.geometry.type === "PlaneGeometry" && o.material.map.image && o.material.map.image.width > 64);
  return { sun, glow, flame, flamesDrawn, lights, figureBlue: card ? card.material.color.b : -1, inner: getComputedStyle(document.documentElement).getPropertyValue("--sky-inner") };
})()`;

const open = async (browser: Browser, base: string, viewport: Checks["viewport"], query: string): Promise<Page> => {
  const page = await browser.newPage({ viewport });
  await page.goto(`${base}demo3d.html?help=0&${query}`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  await pageTime(page, DRAWN_MS);
  return page;
};

export const checkDay = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const dial = (page: Page): Promise<string | null> => page.getByRole("img", { name: /^Day / }).getAttribute("aria-label");

  // A new game begins at eight, in full day, and a second of the house's time is a minute on the dial.
  const sunrise = await open(browser, base, viewport, "view=ground&hour=6");
  const atDawn = (await sunrise.evaluate(LIT)) as Lit;
  await sunrise.close();
  const morning = await open(browser, base, viewport, "view=ground");
  const first = await dial(morning);
  check(`a new game begins at eight on the first morning (${first})`, /^Day 1, 08:0\d$/.test(first ?? ""));
  await morning.evaluate(`(() => { const h = window.manor3d; h.paused.set(true); h.advance(90 - h.world.t); })()`);
  await pageTime(morning, DRAWN_MS);
  const later = await dial(morning);
  const byMorning = (await morning.evaluate(LIT)) as Lit;
  check(`ninety seconds of the house's time later the dial reads half past nine (${later})`, later === "Day 1, 09:30");
  const [dawnRed, dawnBlue] = redAndBlue(atDawn.inner);
  const [dayRed, dayBlue] = redAndBlue(byMorning.inner);
  check(`the sky behind the house is golden at sunrise and blue by half past nine (${atDawn.inner}, then ${byMorning.inner})`, dawnRed > dawnBlue && dayBlue > dayRed);
  check(`…and the people, tinted by the dawn, are by then drawn as painted (${atDawn.figureBlue.toFixed(2)}, ${byMorning.figureBlue.toFixed(2)})`, atDawn.figureBlue < 1 && byMorning.figureBlue === 1);
  await morning.close();

  // The light follows the time: a strong sun and no lamps at noon; a weak moon, lit windows and dimmed people in the evening.
  const noon = await open(browser, base, viewport, "view=ground&hour=12");
  const day = (await noon.evaluate(LIT)) as Lit;
  await noon.close();
  const evening = await open(browser, base, viewport, "view=ground&hour=21");
  const night = (await evening.evaluate(LIT)) as Lit;
  check(`the sun is strong at noon and the moon is weak at nine in the evening (${day.sun.toFixed(2)}, ${night.sun.toFixed(2)})`, day.sun > 1.5 && night.sun < 0.7 && night.sun > 0);
  check(`the windows are dark at noon and lit in the evening (${day.glow.toFixed(2)}, ${night.glow.toFixed(2)})`, day.glow === 0 && night.glow > 0.3);
  check(`the people are drawn as painted at noon and dimmed in the evening (${day.figureBlue.toFixed(2)}, ${night.figureBlue.toFixed(2)})`, day.figureBlue === 1 && night.figureBlue > 0 && night.figureBlue < 0.9);
  check(`the dark behind the house changes with the hour (${day.inner} at noon, ${night.inner} in the evening)`, day.inner !== "" && day.inner !== night.inner);

  // Lamps: out by day, when only the fires throw light; lit in the evening, in the storey looked into and in the garden.
  const LAMPS_ON_THE_GROUND_FLOOR = 7;
  const LAMP_POSTS = 5;
  /** The study's fire is the one upstairs: it is drawn, and so counted, when the first floor is. */
  const FIRES_UPSTAIRS = 1;
  check(`the lamps are out at noon and their flames glow in the evening (${day.flame.toFixed(2)}, ${night.flame.toFixed(2)})`, day.flame === 0 && !day.flamesDrawn && night.flame > 0.5);
  check(`at noon only the fires throw light; in the evening the ground floor's lamps and the garden's do too (${day.lights} lights, then ${night.lights})`, day.lights > 0 && night.lights === day.lights + LAMPS_ON_THE_GROUND_FLOOR + LAMP_POSTS);
  const lightsIn = async (view: string): Promise<number> => {
    await evening.evaluate(`window.manor3d.view.set("${view}")`);
    await pageTime(evening, DRAWN_MS);
    return ((await evening.evaluate(LIT)) as Lit).lights;
  };
  const [whole, back] = [await lightsIn("house"), await lightsIn("ground")];
  check(`with the whole house on show no room's lamp throws light, only the garden's and the fires (${whole} lights, against ${back} looking into the ground floor)`, whole === back - LAMPS_ON_THE_GROUND_FLOOR + FIRES_UPSTAIRS && whole >= LAMP_POSTS);
  const hallLamp = (await evening.evaluate(`window.manor3d.scene.getObjectByName("hall.lamp")?.position.y ?? -1`)) as number;
  check(`the hall's lamp stands on its console, not on the floor under it (${hallLamp.toFixed(2)} m up)`, hallLamp > 0.5);

  // Bedtime: everyone goes up and is no longer drawn; the list and the dial say so.
  const abed = (await evening.evaluate(`(() => {
    const h = window.manor3d;
    h.paused.set(true);
    const inBed = () => h.game.household.every((id) => h.game.abed[id] === "in");
    for (let i = 0; i < 9000 && !inBed(); i++) h.advance(0.02);
    // Look into the floor the beds are on: anyone drawn there would be seen.
    h.view.set("first");
    return inBed();
  })()`)) as boolean;
  await pageTime(evening, DRAWN_MS);
  const drawn = (await evening.evaluate(`window.manor3d.shown()`)) as string[];
  check(`after bedtime the whole household is in bed, and nobody in bed is drawn (still drawn: ${drawn.join(", ") || "nobody"})`, abed && drawn.length === 0);
  check("…the list shows each of them asleep", (await evening.locator(".doing").allTextContents()).every((text) => text.includes("💤")));
  check(`…and the dial shows the night (${await dial(evening)})`, /night$/.test((await dial(evening)) ?? ""));
  // The cellar's lamps are lit at every hour but these: with the house asleep they are out, and only the furnace glows.
  const cellarLights = async (): Promise<Lit> => {
    await evening.evaluate(`window.manor3d.view.set("cellar")`);
    await pageTime(evening, DRAWN_MS);
    return (await evening.evaluate(LIT)) as Lit;
  };
  const asleepBelow = await cellarLights();
  check(`…and with the house asleep the cellar's lamps are out (${asleepBelow.lights} light, flames at ${asleepBelow.flame.toFixed(2)})`, asleepBelow.lights === 1 && asleepBelow.flame === 0);

  // The night passes in a few seconds, and it is six the next morning with everyone up.
  await evening.evaluate(`window.manor3d.advance(8)`);
  await pageTime(evening, DRAWN_MS);
  const dawn = await dial(evening);
  const up = (await evening.evaluate(`window.manor3d.game.household.filter((id) => window.manor3d.game.abed[id]).length`)) as number;
  check(`the night passes in a few seconds: it is just after six on the second day, and everyone is up (${dawn})`, /^Day 2, 06:0\d$/.test(dawn ?? "") && up === 0);
  const awakeBelow = await cellarLights();
  check(`…and the cellar's lamps are lit again (${awakeBelow.lights} lights)`, awakeBelow.lights >= 6 && awakeBelow.flame > 0.5);
  await evening.close();

  // The cellar has no window: looking into it at noon, it is lamplit as it is at night, and the sun is not the sun.
  const below = await open(browser, base, viewport, "view=cellar&hour=12");
  const cellar = (await below.evaluate(LIT)) as Lit;
  await below.close();
  check(`the cellar at noon is lit by its lamps, not by the sun (${cellar.lights} lights, flames at ${cellar.flame.toFixed(2)}, the light overhead at ${cellar.sun.toFixed(2)})`, cellar.lights >= 6 && cellar.flame > 0.5 && cellar.sun < 1);

  // Any clock in the house shows the time: at nine, the hour hand is three quarters round and the minute hand is at twelve.
  const nine = await open(browser, base, viewport, "view=ground&hour=9");
  const hands = (await nine.evaluate(`(() => {
    const h = window.manor3d;
    h.paused.set(true);
    const found = {};
    // A hand that has been fused into the case is no longer there to be turned.
    const read = () => h.scene.traverse((o) => { if (o.userData.hand && o.children.length > 0) found[o.userData.hand] = o.rotation.z; });
    read();
    const first = { ...found, minute: h.game.clock % 60 };
    // Half a minute on: a hand that ticks stands on a whole minute both times; one that slides cannot.
    h.advance(0.5);
    h.settle();
    read();
    return { ...first, later: found.minutes };
  })()`)) as { hours?: number; minutes?: number; minute: number; later?: number };
  // The page ran a moment before it was stopped: allow for the minutes that passed.
  const past = hands.minute / 60;
  const off = (angle: number | undefined, turns: number): number => (angle === undefined ? Infinity : Math.abs(((((-angle - turns * TWO_TURNS) % TWO_TURNS) + TWO_TURNS + Math.PI) % TWO_TURNS) - Math.PI));
  check(`the clock in the hall shows nine o'clock (hands turned ${hands.hours?.toFixed(2)} and ${hands.minutes?.toFixed(2)})`, off(hands.hours, (9 + past) / 12) < HAND_SLACK && off(hands.minutes, past) < HAND_SLACK);
  const minuteShown = (angle: number | undefined): number => (-(angle ?? 0.5) / TWO_TURNS) * 60;
  const onTheMinute = (angle: number | undefined): boolean => Math.abs(minuteShown(angle) - Math.round(minuteShown(angle))) < 1e-6;
  check(`…and its minute hand ticks from minute to minute: it stands on a whole one now and half a minute later (${minuteShown(hands.minutes).toFixed(3)}, ${minuteShown(hands.later).toFixed(3)})`, onTheMinute(hands.minutes) && onTheMinute(hands.later));
  await nine.close();
};
