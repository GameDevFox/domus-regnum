import { describe, expect, it } from "vitest";

import { MAIN_DECK, RARE_DECK } from "./country";
import type { PlaceId } from "./country";
import { combed, curioId, draw, newSearch, retune, searchFor, shopId, thingId, wayId, writtenAt } from "./discovery";
import type { Searching } from "./discovery";
import { dice } from "./odds";
import { gameAt } from "./test-kit";
import { GATHER_DRAWS, HOUR } from "./tuning";

// How what a place holds is found: pools of points, drawn and not put back (discovery.ts). These
// are about the drawing itself, with dice of their own; what an outing makes of it is in
// outing.test.ts and shops.test.ts; a place's dials set anew in a game are in discovery-dials.test.ts.

/** A place explored a minute at a time until nothing is left to find: what was found, and at which minute. */
const explored = (searching: Searching, seed: number, draws = { aimed: searching.aimed, stray: searching.stray }): { id: string; at: number }[] => {
  const search = newSearch(searching);
  const chance = dice(seed);
  const found: { id: string; at: number }[] = [];
  const LONGEST = 5000;
  for (let minute = 1; minute <= LONGEST && found.length < searching.finds.length; minute++) {
    for (const id of draw(search, searching, draws, (other) => found.some((f) => f.id === other), chance)) found.push({ id, at: minute });
  }
  return found;
};
/** A deck of a made-up place: the main one, with the usual draw a minute of gathering. */
const deck = (dials: Omit<Searching, "id" | "gather">): Searching => ({ id: MAIN_DECK, gather: GATHER_DRAWS, ...dials });
/** A place's main deck, as the code has it. */
const mainOf = (place: PlaceId): Searching => writtenAt(place).find((one) => one.id === MAIN_DECK) as Searching;
const middle = (list: number[]): number => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
const GAMES = 400;
const games = <T>(play: (seed: number) => T): T[] => Array.from({ length: GAMES }, (_, n) => play(n + 1));

describe("a draw", () => {
  const ONE: Searching = deck({ finds: [{ id: "a", pool: 3, need: 2, lingers: false }], blanks: 0, aimed: 0, stray: 1, aim: "rolled" });

  it("takes a point from a pool, and finds the thing once as many as it needs have been come upon", () => {
    const search = newSearch(ONE);
    expect(draw(search, ONE, { aimed: 0, stray: 1 }, () => false, dice(1))).toEqual([]);
    expect(search).toMatchObject({ left: { a: 2 }, got: { a: 1 } });
    expect(draw(search, ONE, { aimed: 0, stray: 1 }, () => false, dice(1))).toEqual(["a"]);
    expect(search).toMatchObject({ left: { a: 1 }, got: { a: 2 } });
  });

  it("does not find again what is known already, by whatever means it was", () => {
    const search = newSearch(ONE);
    expect(draw(search, ONE, { aimed: 0, stray: 3 }, () => true, dice(1))).toEqual([]);
    // (Nor draws from its pool: found, and not one that lingers, it is out of the draw.)
    expect(search.left.a).toBe(3);
  });

  it("is of a blank as often as there are blanks among the points, and a blank counts towards nothing", () => {
    const blanks: Searching = deck({ finds: [{ id: "a", pool: 1, need: 1, lingers: false }], blanks: 9, aimed: 0, stray: 1, aim: "rolled" });
    const firsts = games((seed) => explored(blanks, seed)[0].at);
    // One point in ten: found on the first draw a tenth of the time, and by the tenth always.
    expect(firsts.filter((at) => at === 1).length / GAMES).toBeCloseTo(0.1, 1);
    expect(Math.max(...firsts)).toBeLessThanOrEqual(10);
    expect(middle(firsts)).toBeGreaterThanOrEqual(4);
  });

  it("puts nothing back: with every point drawn, everything is found, whatever the dice", () => {
    const some: Searching = deck({ finds: [{ id: "a", pool: 5, need: 5, lingers: true }, { id: "b", pool: 2, need: 1, lingers: false }], blanks: 13, aimed: 0, stray: 1, aim: "rolled" });
    for (const found of games((seed) => explored(some, seed))) {
      expect(found.map((f) => f.id).sort()).toEqual(["a", "b"]);
      expect(Math.max(...found.map((f) => f.at))).toBeLessThanOrEqual(20);
    }
  });

  it("is still of a found thing's pool where it lingers, and so is slower to find the rest; and not where it does not", () => {
    const pair = (lingers: boolean): Searching => deck({ finds: [{ id: "common", pool: 40, need: 1, lingers }, { id: "rare", pool: 2, need: 2, lingers: false }], blanks: 0, aimed: 0, stray: 1, aim: "rolled" });
    const rareAt = (lingers: boolean): number => middle(games((seed) => explored(pair(lingers), seed).find((f) => f.id === "rare")?.at ?? 0));
    // Out of the draw, the common thing leaves only the rare one's two points: found two draws after it.
    expect(rareAt(false)).toBeLessThanOrEqual(4);
    // Left in, its forty points are still in the way.
    expect(rareAt(true)).toBeGreaterThan(20);
  });

  it("aimed, is of the one thing she is on to until it is found: the metronome, a thing every so many draws", () => {
    const aimed: Searching = deck({ finds: [{ id: "a", pool: 10, need: 10, lingers: false }, { id: "b", pool: 10, need: 10, lingers: false }], blanks: 100, aimed: 1, stray: 0, aim: "rolled" });
    for (const found of games((seed) => explored(aimed, seed))) expect(found.map((f) => f.at)).toEqual([10, 20]);
    const search = newSearch(aimed);
    draw(search, aimed, { aimed: 3, stray: 0 }, () => false, dice(7));
    // Three draws, all of one pool; and that one is what she is on to.
    expect(Object.values(search.got)).toEqual([3]);
    expect(search.target).toBe(Object.keys(search.got)[0]);
  });

  it("aimed at the nearest to found, takes up what stray draws have begun, whatever the dice", () => {
    const nearest: Searching = deck({ finds: [{ id: "a", pool: 10, need: 10, lingers: false }, { id: "b", pool: 10, need: 10, lingers: false }], blanks: 0, aimed: 1, stray: 0, aim: "nearest" });
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const search = newSearch(nearest);
      search.got.b = 4;
      search.left.b = 6;
      draw(search, nearest, { aimed: 2, stray: 0 }, () => false, dice(seed));
      expect(search, `seed ${seed}`).toMatchObject({ target: "b", got: { b: 6 } });
    }
  });

  it("aimed at one rolled for, is on to each as often as its share of the points left: the plentiful oftener, and not always", () => {
    const rolled: Searching = deck({ finds: [{ id: "scarce", pool: 10, need: 10, lingers: false }, { id: "plenty", pool: 30, need: 10, lingers: false }], blanks: 0, aimed: 1, stray: 0, aim: "rolled" });
    const firsts = games((seed) => explored(rolled, seed)[0].id);
    // Thirty of the forty points are the plentiful one's: it is the first she is on to three times in four.
    expect(firsts.filter((id) => id === "plenty").length / GAMES).toBeCloseTo(0.75, 1);
  });
});

describe("the forest", () => {
  const forest = mainOf("forest");
  const at = (found: { id: string; at: number }[], id: string): number => found.find((f) => f.id === id)?.at ?? 0;

  it("gives up its berries first as a rule, then its herbs, and the way on last: but in no set order", () => {
    const played = games((seed) => explored(forest, seed));
    const berries = played.map((found) => at(found, thingId("berries")));
    const herbs = played.map((found) => at(found, thingId("herbs")));
    const caves = played.map((found) => at(found, wayId("caves")));
    expect(middle(berries)).toBeGreaterThan(12);
    expect(middle(berries)).toBeLessThan(22);
    expect(middle(herbs)).toBeGreaterThan(22);
    expect(middle(herbs)).toBeLessThan(34);
    expect(middle(caves)).toBeGreaterThan(40);
    // The way on is found before the herbs now and then, by luck; and not often.
    const lucky = played.filter((found) => at(found, wayId("caves")) < at(found, thingId("herbs"))).length / GAMES;
    expect(lucky).toBeGreaterThan(0);
    expect(lucky).toBeLessThan(0.15);
    // Its 328 points last 82 minutes at four a minute.
    expect(Math.max(...caves, ...herbs, ...berries)).toBeLessThanOrEqual(82);
  });

  it("is learnt a quarter as fast by gathering in it: a draw a minute, and never aimed", () => {
    const berries = games((seed) => at(explored(forest, seed, { aimed: 0, stray: 1 }), thingId("berries")));
    expect(middle(berries)).toBeGreaterThan(4 * 12);
    expect(middle(berries)).toBeLessThan(4 * 22);
  });
});

describe("the town", () => {
  const town = mainOf("town");
  const played = games((seed) => explored(town, seed));

  it("gives up most of its shops early, and the last is a hunt: the first within a quarter of an hour as a rule, the last an hour or more in", () => {
    const nth = (n: number): number => middle(played.map((found) => found[n].at));
    expect(nth(0)).toBeLessThan(15);
    expect(nth(1)).toBeLessThan(30);
    expect(nth(4)).toBeGreaterThan(55);
    // Each gap is longer than the one before it, as a rule.
    expect(nth(4) - nth(3)).toBeGreaterThan(nth(1) - nth(0));
    // Its 600 points last two and a half hours at four a minute.
    expect(Math.max(...played.map((found) => found[4].at))).toBeLessThanOrEqual(150);
  });

  it("gives them up in no set order: the miller's first far oftener than the herbalist's stall, which is tucked away and is the last as often as not", () => {
    const share = (n: number, shop: string): number => played.filter((found) => found[n].id === shop).length / GAMES;
    // Six of the seventeen points that find a shop are the miller's, and one is the herbalist's.
    expect(share(0, shopId("miller"))).toBeCloseTo(6 / 17, 1);
    expect(share(0, shopId("herbalist"))).toBeCloseTo(1 / 17, 1);
    expect(share(4, shopId("herbalist"))).toBeGreaterThan(0.45);
    expect(share(4, shopId("miller"))).toBeLessThan(0.1);
    expect(new Set(played.map((found) => found[0].id)).size).toBe(5);
  });

  it("is gone over wholly once nothing is left in it to draw: the points of the shops known, out of the draw, count neither way", () => {
    const game = gameAt(9 * HOUR);
    // Four of the shops known, and of the town's points only the herbalist's one left to draw.
    game.shops = game.shops.filter((id) => id !== "herbalist");
    const search = newSearch(town);
    search.blanks = 0;
    game.searches.town = { [MAIN_DECK]: search };
    const blanks = town.blanks;
    const herbalist = town.finds.find((f) => f.id === shopId("herbalist"))?.pool ?? 0;
    expect(combed(game, "town")).toBeCloseTo(blanks / (blanks + herbalist), 9);
    search.left[shopId("herbalist")] = 0;
    expect(combed(game, "town")).toBe(1);
  });
});


describe("a place of several decks", () => {
  /** The points drawn so far of one deck of the forest, blanks and all. */
  const drawn = (game: ReturnType<typeof gameAt>, id: string): number => {
    const written = writtenAt("forest").find((one) => one.id === id) as Searching;
    const search = game.searches.forest?.[id];
    return search ? written.blanks - search.blanks + written.finds.reduce((sum, f) => sum + f.pool - search.left[f.id], 0) : 0;
  };

  it("has each of them draw its own every minute, at its own rates, exploring and gathering: the forest's main deck four a minute and one, its rare deck two and one", () => {
    const game = gameAt(9 * HOUR);
    game.places.forest = "found";
    searchFor(game, "sage", "forest", 10, "explore");
    expect(drawn(game, MAIN_DECK)).toBe(40);
    expect(drawn(game, RARE_DECK)).toBe(20);
    searchFor(game, "sage", "forest", 10, "gather");
    expect(drawn(game, MAIN_DECK)).toBe(50);
    expect(drawn(game, RARE_DECK)).toBe(30);
  });

  it("knows nothing of one another: a deck's rates changed, the others draw as they did; and each is searched afresh on its own", () => {
    const game = gameAt(9 * HOUR);
    game.places.forest = "found";
    searchFor(game, "sage", "forest", 5, "explore");
    const rare = writtenAt("forest").find((one) => one.id === RARE_DECK) as Searching;
    retune(game, "forest", RARE_DECK, { ...rare, stray: 7 });
    // The rare deck is searched afresh; the main one is as far on as it was.
    expect(game.searches.forest?.[RARE_DECK]).toBeUndefined();
    expect(drawn(game, MAIN_DECK)).toBe(20);
    searchFor(game, "sage", "forest", 5, "explore");
    expect(drawn(game, MAIN_DECK)).toBe(40);
    expect(drawn(game, RARE_DECK)).toBe(35);
  });

  it("gives back what any of them finds", () => {
    const game = gameAt(9 * HOUR);
    game.places.forest = "found";
    // Every point of the rare deck but the tablet's drawn already: the next draw of it is the tablet.
    const rare = (game.searches.forest = { [RARE_DECK]: newSearch(writtenAt("forest").find((one) => one.id === RARE_DECK) as Searching) })[RARE_DECK];
    rare.blanks = 0;
    expect(searchFor(game, "sage", "forest", 1, "gather")).toEqual([curioId("tablet")]);
  });
});
