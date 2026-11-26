import { describe, expect, it } from "vitest";

import { CROPS, CROP_IDS, FIRST_CROP, PLOTS, RUNE_FACTORY, SQUARES, SQUARES_ACROSS, daysLeft, everySquare, isRipe, stepGarden, tend, tendingOf, want, wantAll } from "./garden";
import { ALL, bed, withPotatoes } from "./garden-kit";
import { PLOT_AT, PLOT_SIZE, squareAt } from "./grounds";
import { gameAt } from "./test-kit";
import { DAY } from "./tuning";
import type { Game } from "./types";

// The kitchen garden: plots of squares that are each given a crop, grow by the watered day, and are picked.

/** A new day begins: the squares grow, if they were watered. */
const nextDay = (game: Game): void => {
  game.clock += DAY;
  stepGarden(game);
};
/** Water the first square of a plot and let a day pass, so many times. */
const grow = (game: Game, plot: number, days: number): void => {
  for (let n = 0; n < days; n++) {
    tend(game, plot, 0, "water");
    nextDay(game);
  }
};

describe("the crops", () => {
  it("are Rune Factory 4's list without the turnip, and none of their figures is its figure", () => {
    expect(CROP_IDS).not.toContain("turnip");
    // (Wheat is not of that game's list: its figures are this game's own.)
    for (const id of Object.keys(RUNE_FACTORY) as (keyof typeof RUNE_FACTORY)[]) {
      expect(CROPS[id].days, `${id}: days`).not.toBe(RUNE_FACTORY[id].days);
      expect(CROPS[id].bears, `${id}: what a harvest bears`).not.toBe(RUNE_FACTORY[id].bears);
      // (A crop that never bore again has no such figure to move.)
      if (RUNE_FACTORY[id].again !== null) expect(CROPS[id].again, `${id}: days to bear again`).not.toBe(RUNE_FACTORY[id].again);
      else expect(CROPS[id].again).toBeNull();
    }
  });

  it("go by how the plants really grow: the quick ones quick, the slow ones slow, and none longer than a season", () => {
    const byDays = [...CROP_IDS].sort((a, b) => CROPS[a].days - CROPS[b].days);
    // (Wheat is the quickest of all, and is not as it really grows: it is this game's turnip, and is the author's to make quick.)
    expect(byDays.slice(0, 2)).toEqual(["wheat", "cucumber"]);
    expect(byDays.slice(-2)).toEqual(["yam", "pineapple"]);
    expect(CROPS.pineapple.days).toBeLessThanOrEqual(31);
    // What a real plant gives once is pulled when it is picked; what goes on bearing, bears again.
    expect(CROP_IDS.filter((id) => CROPS[id].again === null)).toEqual(["wheat", "potato", "cabbage", "corn", "pumpkin", "onion", "yam", "carrot"]);
    // One pineapple to a plant; a hill of potatoes.
    expect(CROPS.pineapple.bears).toBe(1);
    expect(CROPS.potato.bears).toBeGreaterThan(CROPS.cabbage.bears);
    for (const id of CROP_IDS) {
      expect(CROPS[id].days).toBeGreaterThan(0);
      expect(CROPS[id].bears).toBeGreaterThan(0);
      // One that bears again does so sooner than it first took.
      expect(CROPS[id].again ?? 0).toBeLessThan(CROPS[id].days);
    }
  });

  it("are known to a new house only as far as the first of them", () => {
    const game = gameAt();
    expect(game.garden.known).toEqual([FIRST_CROP]);
    expect(FIRST_CROP).not.toBe("turnip");
  });
});

describe("a plot", () => {
  it("is one of four, each of six squares, three across and two deep: every one empty at first and wanting nothing", () => {
    const game = withPotatoes();
    expect(game.garden.plots.length).toBe(PLOTS);
    expect(PLOTS).toBe(PLOT_AT.length);
    expect(SQUARES).toBe(6);
    expect(everySquare(game).length).toBe(ALL);
    for (const plot of game.garden.plots) {
      expect(plot.squares.length).toBe(SQUARES);
      for (const square of plot.squares) {
        expect(square).toEqual({ crop: null, wanted: null, grown: 0, watered: false });
        expect(tendingOf(square)).toBeNull();
      }
    }
    // No two squares are one object: what is done to one is not done to another.
    expect(new Set(everySquare(game).map((s) => s.bed)).size).toBe(ALL);
  });

  it("has its squares lying within it, row by row from the north-west, none on another", () => {
    for (let plot = 0; plot < PLOTS; plot++) {
      const at = Array.from({ length: SQUARES }, (_, square) => squareAt(plot, square));
      for (const point of at) {
        expect(Math.abs(point.x - PLOT_AT[plot].x)).toBeLessThan(PLOT_SIZE.w / 2);
        expect(Math.abs(point.z - PLOT_AT[plot].z)).toBeLessThan(PLOT_SIZE.d / 2);
      }
      expect(new Set(at.map((point) => `${point.x.toFixed(3)},${point.z.toFixed(3)}`)).size).toBe(SQUARES);
      // The first is the north-west corner; the next is east of it; the next row is south of it.
      expect(at[0].x).toBeLessThan(PLOT_AT[plot].x);
      expect(at[0].z).toBeLessThan(PLOT_AT[plot].z);
      expect(at[1].x).toBeGreaterThan(at[0].x);
      expect(at[1].z).toBe(at[0].z);
      expect(at[SQUARES_ACROSS].x).toBe(at[0].x);
      expect(at[SQUARES_ACROSS].z).toBeGreaterThan(at[0].z);
    }
  });

  it("can have a different crop in each of its squares: what is done to one is not done to the next", () => {
    const game = withPotatoes();
    game.garden.known.push("cabbage");
    want(game, 0, 0, "potato");
    want(game, 0, 1, "cabbage");
    tend(game, 0, 0, "sow");
    tend(game, 0, 1, "sow");
    tend(game, 0, 1, "water");
    nextDay(game);
    expect(bed(game, 0, 0)).toMatchObject({ crop: "potato", grown: 0 });
    expect(bed(game, 0, 1)).toMatchObject({ crop: "cabbage", grown: 1 });
    expect(bed(game, 0, 2)).toEqual({ crop: null, wanted: null, grown: 0, watered: false });
    expect(bed(game, 1, 0).wanted).toBeNull();
  });

  it("can be given one crop in all its squares at once, or none: a crop the house does not know, in none of them", () => {
    const game = withPotatoes();
    expect(wantAll(game, 2, "potato")).toBe(true);
    expect(game.garden.plots[2].squares.every((square) => square.wanted === "potato")).toBe(true);
    expect(everySquare(game).filter((s) => s.bed.wanted !== null).length).toBe(SQUARES);
    expect(wantAll(game, 2, "pineapple")).toBe(false);
    expect(game.garden.plots[2].squares.every((square) => square.wanted === "potato")).toBe(true);
    expect(wantAll(game, 9, "potato")).toBe(false);
    expect(wantAll(game, 2, null)).toBe(true);
    expect(everySquare(game).every((s) => s.bed.wanted === null)).toBe(true);
  });
});

describe("a square of a plot", () => {

  it("can be given a crop the house knows, and no other; and none at all again", () => {
    const game = withPotatoes();
    expect(want(game, 0, 0, "potato")).toBe(true);
    expect(bed(game).wanted).toBe("potato");
    expect(want(game, 0, 0, "pineapple")).toBe(false);
    expect(bed(game).wanted).toBe("potato");
    expect(want(game, 9, 0, "potato")).toBe(false);
    expect(want(game, 0, SQUARES, "potato")).toBe(false);
    game.garden.known.push("pineapple");
    expect(want(game, 0, 0, "pineapple")).toBe(true);
    expect(want(game, 0, 0, null)).toBe(true);
    expect(bed(game).wanted).toBeNull();
  });

  it("wants sowing when it is empty and a crop is wanted, then watering once a day, then picking when it is ripe", () => {
    const game = withPotatoes();
    want(game, 0, 0, "potato");
    expect(tendingOf(bed(game))).toBe("sow");
    expect(tend(game, 0, 0, "water")).toBeNull();
    expect(bed(game).crop).toBeNull();
    tend(game, 0, 0, "sow");
    expect(bed(game)).toMatchObject({ crop: "potato", grown: 0, watered: false });
    expect(tendingOf(bed(game))).toBe("water");
    tend(game, 0, 0, "water");
    expect(tendingOf(bed(game))).toBeNull();
    nextDay(game);
    expect(bed(game)).toMatchObject({ grown: 1, watered: false });
    expect(tendingOf(bed(game))).toBe("water");
  });

  it("grows a day's worth each day it was watered, and not at all on a day it was not", () => {
    const game = withPotatoes();
    want(game, 0, 0, "potato");
    tend(game, 0, 0, "sow");
    nextDay(game);
    nextDay(game);
    expect(bed(game).grown).toBe(0);
    grow(game, 0, 3);
    expect(bed(game).grown).toBe(3);
    expect(daysLeft(bed(game))).toBe(CROPS.potato.days - 3);
    // Days that pass all at once are each a day: watered for the first, and not for the rest.
    tend(game, 0, 0, "water");
    game.clock += 3 * DAY;
    stepGarden(game);
    expect(bed(game).grown).toBe(4);
  });

  it("is ripe after as many watered days as its crop takes, and waits as it is until it is picked", () => {
    const game = withPotatoes();
    want(game, 0, 0, "potato");
    tend(game, 0, 0, "sow");
    grow(game, 0, CROPS.potato.days - 1);
    expect(isRipe(bed(game))).toBe(false);
    expect(tend(game, 0, 0, "harvest")).toBeNull();
    grow(game, 0, 1);
    expect(isRipe(bed(game))).toBe(true);
    expect(tendingOf(bed(game))).toBe("harvest");
    expect(daysLeft(bed(game))).toBe(0);
    nextDay(game);
    nextDay(game);
    expect(bed(game).grown).toBe(CROPS.potato.days);
  });

  it("picked, gives what its crop bears; and a crop that is pulled leaves it empty, to be sown again if it is still wanted", () => {
    const game = withPotatoes();
    want(game, 0, 0, "potato");
    tend(game, 0, 0, "sow");
    grow(game, 0, CROPS.potato.days);
    expect(tend(game, 0, 0, "harvest")).toEqual({ crop: "potato", count: CROPS.potato.bears });
    expect(bed(game)).toEqual({ crop: null, wanted: "potato", grown: 0, watered: false });
    expect(tendingOf(bed(game))).toBe("sow");
    expect(daysLeft(bed(game))).toBeNull();
  });

  it("with a crop that bears again, is ripe again in as many watered days as that takes, for as long as it is wanted there", () => {
    const game = withPotatoes();
    game.garden.known.push("cucumber");
    want(game, 0, 0, "cucumber");
    tend(game, 0, 0, "sow");
    grow(game, 0, CROPS.cucumber.days);
    expect(tend(game, 0, 0, "harvest")).toEqual({ crop: "cucumber", count: CROPS.cucumber.bears });
    expect(bed(game).crop).toBe("cucumber");
    expect(daysLeft(bed(game))).toBe(CROPS.cucumber.again);
    grow(game, 0, (CROPS.cucumber.again ?? 0) - 1);
    expect(isRipe(bed(game))).toBe(false);
    grow(game, 0, 1);
    expect(isRipe(bed(game))).toBe(true);
    // Something else is wanted there now: it is picked a last time, and the plot is empty for it.
    want(game, 0, 0, "potato");
    expect(tend(game, 0, 0, "harvest")).toEqual({ crop: "cucumber", count: CROPS.cucumber.bears });
    expect(bed(game)).toMatchObject({ crop: null, wanted: "potato" });
  });

  it("is left to ripen when something else is wanted there, and to lie empty when nothing is", () => {
    const game = withPotatoes();
    game.garden.known.push("cabbage");
    want(game, 0, 0, "potato");
    tend(game, 0, 0, "sow");
    want(game, 0, 0, "cabbage");
    expect(bed(game).crop).toBe("potato");
    grow(game, 0, CROPS.potato.days);
    want(game, 0, 0, null);
    tend(game, 0, 0, "harvest");
    expect(tendingOf(bed(game))).toBeNull();
  });
});
