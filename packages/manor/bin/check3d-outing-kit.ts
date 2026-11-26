// What the outing checks (check3d-outing.ts, check3d-outing-night.ts) share: the clock's landmarks, the numbers the page's rules give, and the reading of the game from the page.
import type { Page } from "@playwright/test";

import { pageTime } from "./check3d-kit";

/** Time for the map and its card to be redrawn after something is changed. */
export const REDRAWN_MS = 350;
export const DIAL_DRAWN_MS = 5000; // the longest the day dial is waited for to show a plan just made
/** Seconds of the house's time to run at a go while waiting for something to be seen, and how many goes. */
export const LOOK_EVERY = 5;
export const LOOKS = 60;
/** How far a token may seem to move, in pixels, as she is turned round where she is: no farther than a redraw's rounding. */
export const TURN_STILL_PX = 3;
/** How far the pointer is dragged, in pixels: farther than a press may wander. */
export const DRAG_PX = 40;
/** Minutes in a day, and the minute of it the house wakes at. */
export const DAY = 24 * 60;
export const WAKE = 6 * 60;
/** Eight and nine in the evening and bedtime, in minutes after midnight. */
export const EIGHT_AT_NIGHT = 20 * 60;
export const NINE_AT_NIGHT = 21 * 60;
export const BEDTIME = 22 * 60;
/** The walk to the forest, and the longest stay there is, in minutes. */
export const FOREST_WALK = 38;
export const LONGEST = 480;
/** The walk to the lake, in minutes. */
export const LAKE_WALK = 44;
/** The points the way on from the forest needs, of its own, before it is found (country.ts). */
export const WAY_NEEDS = 6;
/** What the forest holds to gather: its picture, the minutes a lot of it takes, and how many lots half an hour is. */
export const HELD: Record<string, { glyph: string; every: number; inHalfHour: number }> = { berries: { glyph: "🫐", every: 10, inHalfHour: 3 }, herbs: { glyph: "🌿", every: 25, inHalfHour: 1 } };
/** A quarter of the minutes spent gathering are learnt of the place. */
export const GATHER_LEARNS = 0.25;
/** Blank points enough that nothing else is drawn in half an hour. */
export const DEAD_ENDS = 10_000_000;

export type Outing = { who: string; to: string; doing: string; state: string; arrive: number; depart: number; back: number; done: boolean; seeks: string | null };
/** Lots of berries to a batch of pies. */
export const PIE_BERRIES = 2;
export type State = { clock: number; coin: number; stock: { berries: number; herbs: number }; places: Record<string, string | undefined>; explored: Record<string, number | undefined>; finds: Record<string, string[] | undefined>; outings: Outing[]; abed: Record<string, string | undefined> };

export const state = (page: Page): Promise<State> =>
  page.evaluate(() => {
    const { clock, coin, stock, places, explored, finds, outings, abed } = (window as unknown as { manor3d: { game: State } }).manor3d.game;
    return { clock, coin, stock: { ...stock }, places: { ...places }, explored: { ...explored }, finds: { forest: [...(finds.forest ?? [])] }, abed: { ...abed }, outings: outings.map(({ who, to, doing, state: s, arrive, depart, back, done, seeks }) => ({ who, to, doing, state: s, arrive, depart, back, done, seeks })) };
  });
export const advance = async (page: Page, seconds: number): Promise<void> => {
  await page.evaluate(`window.manor3d.advance(${seconds})`);
  await pageTime(page, REDRAWN_MS);
};
/** Run the house on, a little at a time, until something is so. */
export const until = async (page: Page, so: () => Promise<boolean>): Promise<boolean> => {
  for (let n = 0; n < LOOKS; n++) {
    if (await so()) return true;
    await advance(page, LOOK_EVERY);
  }
  return so();
};
/** Run it on to a moment of the clock. */
export const advanceTo = async (page: Page, clock: number): Promise<void> => advance(page, Math.max(0, clock - (await state(page)).clock));
