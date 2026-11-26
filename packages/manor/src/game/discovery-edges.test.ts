import { describe, expect, it } from "vitest";

import { MAIN_DECK, RARE_DECK } from "./country";
import { combed, comeUponNext, curioId, draw, nearness, newSearch, retune } from "./discovery";
import type { Searching } from "./discovery";
import { gameAt } from "./test-kit";

// The edges of how a draw is made and read back (discovery.ts), where the ordinary tests went
// by the middle of the road: dice that land exactly on a boundary, a pool that is drained
// without its thing being found, and a deck with nothing in it at all.

const deck = (dials: Pick<Searching, "finds" | "blanks" | "aimed" | "stray" | "aim">): Searching => ({ id: MAIN_DECK, gather: 0, ...dials });
const NOTHING_FOUND = (): boolean => false;

describe("a draw, at the edges of the dice", () => {
  const TWO: Searching = deck({ finds: [{ id: "a", pool: 1, need: 1, lingers: false }, { id: "b", pool: 1, need: 1, lingers: false }], blanks: 0, aimed: 1, stray: 0, aim: "rolled" });

  it("is of the first thing when the dice are low and of the second when they are high", () => {
    expect(draw(newSearch(TWO), TWO, { aimed: 1, stray: 0 }, NOTHING_FOUND, () => 0.1)).toEqual(["a"]);
    expect(draw(newSearch(TWO), TWO, { aimed: 1, stray: 0 }, NOTHING_FOUND, () => 0.9)).toEqual(["b"]);
  });

  it("gives the point on the border between two pools to the one above it", () => {
    // Two points in all, and the dice at a half: the first point is a's, the second b's, and a half of two is the second's first edge.
    expect(draw(newSearch(TWO), TWO, { aimed: 1, stray: 0 }, NOTHING_FOUND, () => 0.5)).toEqual(["b"]);
  });

  it("gives the last of them for dice at the very top of their range", () => {
    expect(draw(newSearch(TWO), TWO, { aimed: 1, stray: 0 }, NOTHING_FOUND, () => 1)).toEqual(["b"]);
  });

  it("does not roll the dice at all once there is nothing left to draw", () => {
    const search = newSearch(TWO);
    search.left.a = 0;
    search.left.b = 0;
    let rolls = 0;
    draw(search, TWO, { aimed: 0, stray: 3 }, NOTHING_FOUND, () => (rolls += 1, 0.5));
    expect(rolls).toBe(0);
  });

  it("leaves a pool that holds fewer points than its thing needs alone once it is empty", () => {
    // `a` can never be found (it needs two points and has one): once its point is drawn it is no longer drawn at.
    const short: Searching = deck({ finds: [{ id: "a", pool: 1, need: 2, lingers: false }, { id: "b", pool: 1, need: 1, lingers: false }], blanks: 0, aimed: 5, stray: 0, aim: "rolled" });
    const search = newSearch(short);
    expect(draw(search, short, { aimed: 5, stray: 0 }, NOTHING_FOUND, () => 0.3)).toEqual(["b"]);
    expect(search.left).toEqual({ a: 0, b: 0 });
    expect(search.got).toEqual({ a: 1, b: 1 });
  });

  it("lets go of what it was on to once that is found", () => {
    const one: Searching = deck({ finds: [{ id: "a", pool: 5, need: 1, lingers: false }], blanks: 0, aimed: 1, stray: 0, aim: "nearest" });
    const search = newSearch(one);
    expect(draw(search, one, { aimed: 1, stray: 0 }, NOTHING_FOUND, () => 0)).toEqual(["a"]);
    expect(search.target).toBeNull();
  });

  it("keeps what it is on to while it is not found", () => {
    const one: Searching = deck({ finds: [{ id: "a", pool: 5, need: 3, lingers: false }], blanks: 0, aimed: 1, stray: 0, aim: "nearest" });
    const search = newSearch(one);
    draw(search, one, { aimed: 1, stray: 0 }, NOTHING_FOUND, () => 0);
    expect(search.target).toBe("a");
  });
});

describe("what is read back of a search", () => {
  const game = gameAt();

  it("says how near to found what is not a thing of the place at all: not near", () => {
    expect(nearness(game, "forest", "thing:nonesuch")).toBe(0);
  });

  it("calls a deck with nothing in it and no blanks wholly gone over", () => {
    const emptied = gameAt();
    retune(emptied, "manor", MAIN_DECK, { id: MAIN_DECK, finds: [], blanks: 0, aimed: 0, stray: 0, aim: "rolled", gather: 0 });
    expect(combed(emptied, "manor")).toBe(1);
  });

  it("puts back the points a thing still needs, however few are left", () => {
    const tablet = curioId("tablet");
    comeUponNext(game, "forest", tablet);
    const search = game.searches.forest?.[RARE_DECK];
    expect(search?.left[tablet]).toBe(1);
    if (search) search.left[tablet] = 0;
    comeUponNext(game, "forest", tablet);
    expect(game.searches.forest?.[RARE_DECK]?.left[tablet]).toBe(1);
  });
});
