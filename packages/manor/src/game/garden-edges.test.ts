import { describe, expect, it } from "vitest";

import { CROPS, daysLeft, newGarden, stepGarden, tend, tendingOf } from "./garden";
import { bed, withPotatoes } from "./garden-kit";
import { gameAt } from "./test-kit";
import { DAY } from "./tuning";

// The garden at its edges: what a picked crop leaves behind, what a day does to a square, and what an empty or overgrown one says.

/** A game that knows strawberries, which bear again after three watered days. */
const withStrawberries = () => {
  const game = gameAt();
  game.garden.known.push("strawberry");
  return game;
};

describe("a square's days left", () => {
  it("are none for one that is ripe or past it, and nothing at all for one that is empty", () => {
    const game = gameAt();
    expect(daysLeft(bed(game))).toBeNull();
    Object.assign(bed(game), { crop: "wheat", grown: CROPS.wheat.days - 1 });
    expect(daysLeft(bed(game))).toBe(1);
    bed(game).grown = CROPS.wheat.days;
    expect(daysLeft(bed(game))).toBe(0);
    bed(game).grown = CROPS.wheat.days + 4;
    expect(daysLeft(bed(game))).toBe(0);
  });
});

describe("a ripe square", () => {
  it("is picked though it was watered today: it is ripe whether or not it was", () => {
    const game = gameAt();
    Object.assign(bed(game), { crop: "wheat", grown: CROPS.wheat.days, watered: true });
    expect(tendingOf(bed(game))).toBe("harvest");
    expect(tend(game, 0, 0, "harvest")).toEqual({ crop: "wheat", count: CROPS.wheat.bears });
  });

  it("is left bare and dry when what grew in it is pulled up, even if it was watered that day", () => {
    const game = gameAt();
    Object.assign(bed(game), { crop: "wheat", grown: CROPS.wheat.days, watered: true, wanted: null });
    tend(game, 0, 0, "harvest");
    expect(bed(game)).toEqual({ crop: null, wanted: null, grown: 0, watered: false });
  });

  it("goes on bearing, if it is a crop that does and is still what is wanted, from as many days short of ripe as it takes to bear again", () => {
    const game = withStrawberries();
    const { days, again } = CROPS.strawberry;
    Object.assign(bed(game), { crop: "strawberry", wanted: "strawberry", grown: days });
    tend(game, 0, 0, "harvest");
    expect(bed(game).crop).toBe("strawberry");
    expect(daysLeft(bed(game))).toBe(again);
    expect(tendingOf(bed(game))).toBe("water");
  });
});

describe("the days of the garden", () => {
  it("are counted from the day it was laid out: on that day nothing has yet grown", () => {
    const game = withPotatoes();
    Object.assign(bed(game), { crop: "potato", watered: true });
    stepGarden(game);
    expect(bed(game).grown).toBe(0);
    expect(bed(game).watered).toBe(true);
  });

  it("begin on the day of the clock a garden is laid out at", () => {
    expect(newGarden(3 * DAY + 100).day).toBe(4);
  });

  it("grow what was watered by one day for one day, however many times it is stepped", () => {
    const game = withPotatoes();
    Object.assign(bed(game), { crop: "potato", watered: true });
    game.clock += DAY;
    stepGarden(game);
    stepGarden(game);
    expect(bed(game).grown).toBe(1);
    expect(bed(game).watered).toBe(false);
  });
});
