import { describe, expect, it } from "vitest";

import { MAIN_DECK } from "./country";
import type { Searching } from "./discovery";
import { dice, oddsOf } from "./odds";
import type { OddsOf } from "./odds";

// The reckoning of odds (odds.ts), at the figures where an off-by-one would hide: the minute
// by which a share of games had found something, the longest a game is played, and the dice.

const deck = (finds: { id: string; pool: number }[], blanks: number, stray: number): Searching => ({ id: MAIN_DECK, finds: finds.map((f) => ({ ...f, need: 1, lingers: false })), blanks, aimed: 0, stray, aim: "rolled", gather: 0 });
const SHARES: [keyof Pick<OddsOf, "early" | "typical" | "late">, number][] = [["early", 0.1], ["typical", 0.5], ["late", 0.9]];

describe("the dice", () => {
  it("fall as they have always fallen for a seed, and differently for another", () => {
    // (mulberry32: these are its first figures for these seeds.)
    expect(dice(1)()).toBeCloseTo(0.6270739405881613, 12);
    expect(dice(42)()).toBeCloseTo(0.6011037519201636, 12);
    expect(dice(1)()).not.toBeCloseTo(dice(2)(), 6);
  });
});

describe("the minute by which a share of games has found something", () => {
  // Two things in a place, each found by the first draw or the second: an even chance.
  const TWO = deck([{ id: "x", pool: 1 }, { id: "y", pool: 1 }], 0, 1);

  it("is the first minute at which at least that share of games had found it, and no earlier", () => {
    // Several numbers of games, so that the share of them is a whole number of games in some and not in others.
    for (let games = 201; games <= 240; games++) {
      for (const seed of [1, 2, 3]) {
        const { of, games: played } = oddsOf([TWO], { how: "explore", games, seed });
        for (const one of of) {
          for (const [name, share] of SHARES) {
            const minute = one[name];
            expect(minute, `${one.id} ${name} over ${played} games, seed ${seed}`).not.toBeNull();
            expect(one.by[minute as number]).toBeGreaterThanOrEqual(share);
            expect(one.by[(minute as number) - 1]).toBeLessThan(share);
          }
        }
      }
    }
  });

  it("is not given for a share of games that did not find it, however near", () => {
    // Only a game's first minute is played, and the thing is found in it about half the time: so sometimes in half the games or more, and sometimes in less.
    let counted = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const [one] = oddsOf([deck([{ id: "x", pool: 1 }], 1, 1)], { how: "explore", games: 200, seed, longest: 1 }).of;
      const found = one.by[one.by.length - 1];
      for (const [name, share] of SHARES) expect(one[name] === null, `${name}, seed ${seed}, found in ${found} of games`).toBe(found < share);
      if (found === 0.5) counted += 1;
    }
    // (Seeds that came out exactly at a half are the ones this is about.)
    expect(counted).toBeGreaterThan(0);
  });
});

describe("how long a game is played", () => {
  it("goes on until every point of the place has been drawn, when the draws a minute do not divide them", () => {
    // Three points, two draws a minute: two minutes, not one. (Three of three are needed for it to be found.)
    const odd: Searching = { id: MAIN_DECK, finds: [{ id: "x", pool: 3, need: 3, lingers: false }], blanks: 0, aimed: 0, stray: 2, aim: "rolled", gather: 0 };
    const { of, minutes } = oddsOf([odd], { how: "explore", games: 200 });
    expect(of[0].never).toBe(0);
    expect(minutes).toBe(2);
    expect(of[0].by).toEqual([0, 0, 1]);
  });
});
