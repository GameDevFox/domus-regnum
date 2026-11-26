import { describe, expect, it } from "vitest";

import { MAIN_DECK, PLACES, RARE_DECK } from "./country";
import type { PlaceId } from "./country";
import { CURIOS } from "./curios";
import { combed, isFoundAt, nearness, newSearch, putBack, retune, searchFor, searchingAt, shopId, thingId, wayId, writtenAt } from "./discovery";
import type { Searching } from "./discovery";
import { createGame } from "./game";
import { outingOf } from "./outing";
import { explore } from "./outing-send";
import { gameAt, until } from "./test-kit";
import { HOUR } from "./tuning";
import type { Game } from "./types";
import { SHOPS } from "./wares";

// A place's dials set anew while a game is going (the dev menu's odds window): the edit is the
// game's own (`game.dials`), and the tables the code was written with are never written into, so
// no other game sees it, and no test needs to put anything back after it.

/** A place's main deck, in a game. */
const mainOf = (game: Game, place: PlaceId): Searching => searchingAt(game, place).find((one) => one.id === MAIN_DECK) as Searching;
/** The forest's main deck as it is written, but for the way on, which is as plentiful as the berries and needs one point. */
const easy = (): Searching => {
  const main = writtenAt("forest").find((one) => one.id === MAIN_DECK) as Searching;
  return { ...main, finds: main.finds.map((f) => (f.id === wayId("caves") ? { ...f, pool: 200, need: 1 } : f)) };
};
/** The forest's main deck with nothing in it to find: every one of its points a blank. */
const allBlanks = (): Searching => {
  const main = writtenAt("forest").find((one) => one.id === MAIN_DECK) as Searching;
  return { ...main, blanks: 328, finds: main.finds.map((f) => ({ ...f, pool: 0 })) };
};
/** A game at nine with the forest found, the same dice every time. */
const inTheForest = (): Game => {
  const game = gameAt(9 * HOUR);
  game.places.forest = "found";
  return game;
};
/** The forest explored a minute at a time: what was found, and at which minute. */
const exploredFor = (game: Game, minutes: number): { id: string; at: number }[] =>
  Array.from({ length: minutes }, (_, n) => searchFor(game, "sage", "forest", 1, "explore").map((id) => ({ id, at: n + 1 }))).flat();
const minuteOf = (found: { id: string; at: number }[], id: string): number => found.find((f) => f.id === id)?.at ?? Infinity;
/** Everything the tables of the code say of what is to be found: so that it can be seen to be as it was. */
const tables = (): string => JSON.stringify([PLACES, SHOPS, CURIOS]);
/** The tables as they were before any test here ran. */
const AS_LOADED = tables();

describe("a place's dials set anew while a game is going", () => {
  it("are the deck's from then on, in that game: the pools and needs of what is in it, its blanks, and its draws a minute of exploring and gathering", () => {
    const game = gameAt();
    retune(game, "forest", MAIN_DECK, { ...easy(), blanks: 50, stray: 9, aimed: 2, aim: "nearest", gather: 3 });
    expect(mainOf(game, "forest")).toMatchObject({ blanks: 50, stray: 9, aimed: 2, aim: "nearest", gather: 3 });
    expect(mainOf(game, "forest").finds.find((f) => f.id === wayId("caves"))).toMatchObject({ pool: 200, need: 1, lingers: false });
    // What was not spoken of is as it was; and so is every other deck, and every other place.
    expect(mainOf(game, "forest").finds.find((f) => f.id === thingId("berries"))).toMatchObject({ pool: 200, need: 40, lingers: true });
    expect(searchingAt(game, "forest").find((one) => one.id === RARE_DECK)).toEqual(writtenAt("forest").find((one) => one.id === RARE_DECK));
    expect(searchingAt(game, "town")).toEqual(writtenAt("town"));
    // A shop's are set the same way.
    retune(game, "town", MAIN_DECK, { ...mainOf(game, "town"), finds: mainOf(game, "town").finds.map((f) => (f.id === shopId("herbalist") ? { ...f, pool: 30 } : f)) });
    expect(mainOf(game, "town").finds.find((f) => f.id === shopId("herbalist"))?.pool).toBe(30);
  });

  it("are that game's alone: not another game's made after it, nor a game's that has none, and the code's tables are as they were", () => {
    const edited = gameAt();
    retune(edited, "forest", MAIN_DECK, { ...easy(), blanks: 50, gather: 3 });
    retune(edited, "forest", RARE_DECK, { ...(writtenAt("forest").find((one) => one.id === RARE_DECK) as Searching), stray: 7 });
    retune(edited, "town", MAIN_DECK, { ...mainOf(edited, "town"), finds: mainOf(edited, "town").finds.map((f) => ({ ...f, pool: 1 })) });
    for (const other of [createGame(undefined, 1), gameAt()]) {
      expect(searchingAt(other, "forest")).toEqual(writtenAt("forest"));
      expect(searchingAt(other, "town")).toEqual(writtenAt("town"));
    }
    expect(mainOf(edited, "forest")).not.toEqual(mainOf(gameAt(), "forest"));
    expect(tables()).toBe(AS_LOADED);
  });

  it("are not shared with whoever is given them: changing what was given, or what is read back, changes nothing in the game", () => {
    const game = gameAt();
    const given = easy();
    retune(game, "forest", MAIN_DECK, given);
    given.blanks = 999;
    (given.finds[0] as { pool: number }).pool = 999;
    mainOf(game, "forest").finds[0].pool = 999;
    expect(mainOf(game, "forest")).toEqual(easy());
  });

  it("are of pools and needs and draws only: whether a thing's pool stays in the draw, and whether it is hidden, go by what it is", () => {
    const game = gameAt();
    const rare = writtenAt("forest").find((one) => one.id === RARE_DECK) as Searching;
    retune(game, "forest", MAIN_DECK, { ...easy(), finds: easy().finds.map((f) => ({ ...f, lingers: !f.lingers, hidden: true })) });
    retune(game, "forest", RARE_DECK, { ...rare, finds: rare.finds.map((f) => ({ id: f.id, pool: 2, need: 1, lingers: true })) });
    expect(searchingAt(game, "forest").map((deck) => deck.finds.map(({ id, lingers, hidden }) => ({ id, lingers, hidden })))).toEqual(writtenAt("forest").map((deck) => deck.finds.map(({ id, lingers, hidden }) => ({ id, lingers, hidden }))));
  });

  it("are what is read back of a search: how near a thing is to found goes by its need in that game, and how much of a deck has been gone over by its points", () => {
    const game = inTheForest();
    const main = easy();
    retune(game, "forest", MAIN_DECK, { ...main, blanks: 100, finds: main.finds.map((f) => (f.id === thingId("berries") ? { ...f, need: 80 } : f)) });
    const search = newSearch(mainOf(game, "forest"));
    game.searches.forest = { [MAIN_DECK]: search };
    search.got[thingId("berries")] = 40;
    search.blanks = 50;
    // Forty of the eighty it now needs, where forty of the forty written would be found.
    expect(nearness(game, "forest", thingId("berries"))).toBe(0.5);
    // Fifty of its hundred blanks drawn, and every other point still to draw: 200 berries, 120 herbs, 200 of the way on.
    expect(combed(game, "forest")).toBeCloseTo(50 / (50 + 50 + 200 + 120 + 200), 9);
  });

  it("change what is found, and when, in that game: a deck made all blanks finds nothing, and a pool made plentiful is found sooner, with the same dice", () => {
    const written = exploredFor(inTheForest(), 90);
    expect(written.map((f) => f.id)).toEqual(expect.arrayContaining([thingId("berries"), thingId("herbs"), wayId("caves")]));
    // All blanks: nothing of the main deck turns up in an hour and a half.
    const blank = inTheForest();
    retune(blank, "forest", MAIN_DECK, allBlanks());
    expect(exploredFor(blank, 90).filter((f) => f.id !== "curio:tablet")).toEqual([]);
    // The way on made plentiful and needing a point: found in the first minutes, where it is found late as it is written.
    const plenty = inTheForest();
    retune(plenty, "forest", MAIN_DECK, easy());
    const soon = minuteOf(exploredFor(plenty, 90), wayId("caves"));
    expect(soon).toBeLessThan(5);
    expect(minuteOf(written, wayId("caves"))).toBeGreaterThan(soon * 4);
  });

  it("begin the search of the deck afresh, with what has been found there still found; and the game goes by them at once", () => {
    const game = inTheForest();
    game.finds.forest = ["berries"];
    game.searches.forest = { [MAIN_DECK]: newSearch(mainOf(game, "forest")) };
    game.searches.town = { [MAIN_DECK]: newSearch(mainOf(game, "town")) };
    retune(game, "forest", MAIN_DECK, easy());
    expect(game.searches.forest[MAIN_DECK]).toBeUndefined();
    expect(combed(game, "forest")).toBe(0);
    expect(isFoundAt(game, "forest", thingId("berries"))).toBe(true);
    // The town's search is none of its business.
    expect(game.searches.town[MAIN_DECK]).toBeDefined();
    // She finds the way on in the first minutes of an outing.
    explore(game, "sage", "forest", { limit: 8 * HOUR, homeByBed: false });
    const outing = outingOf(game, "sage");
    until(game, () => (outing?.news ?? 0) > 0 && game.asks.length > 0, 4 * HOUR);
    expect(game.places.caves).toBe("unknown");
    expect(game.explored.forest ?? 0).toBeLessThan(6);
  });

  it("set as the code has them, leave no edit in the game", () => {
    const game = gameAt();
    retune(game, "forest", MAIN_DECK, easy());
    retune(game, "forest", MAIN_DECK, writtenAt("forest")[0]);
    expect(game.dials).toEqual({});
  });

  // (Nothing copies or saves a whole game today: its world holds a graph of functions. The edits are plain data, so whatever comes to save a game carries them as they are.)
  it("are plain data, kept whole when written out and read back; and a game given them searches as the one they were made in", () => {
    const game = gameAt();
    retune(game, "forest", MAIN_DECK, easy());
    const other = gameAt();
    other.dials = JSON.parse(JSON.stringify(game.dials)) as Game["dials"];
    expect(searchingAt(other, "forest")).toEqual(searchingAt(game, "forest"));
    // And an edit of the one is not the other's.
    retune(other, "forest", MAIN_DECK, allBlanks());
    expect(mainOf(game, "forest")).toEqual(easy());
  });
});

describe("a place put back as the code has it", () => {
  it("is searched exactly as it is written: the same finds at the same minutes, and the same searches, as a game that was never edited", () => {
    const edited = inTheForest();
    retune(edited, "forest", MAIN_DECK, easy());
    retune(edited, "forest", RARE_DECK, { ...(writtenAt("forest").find((one) => one.id === RARE_DECK) as Searching), stray: 7 });
    putBack(edited, "forest");
    expect(edited.dials).toEqual({});
    expect(searchingAt(edited, "forest")).toEqual(writtenAt("forest"));
    const never = inTheForest();
    expect(exploredFor(edited, 120)).toEqual(exploredFor(never, 120));
    expect(edited.searches).toEqual(never.searches);
  });

  it("searches afresh only the decks that had been edited; the others are as far on as they were, and other places' edits stay", () => {
    const game = inTheForest();
    searchFor(game, "sage", "forest", 5, "explore");
    retune(game, "forest", MAIN_DECK, easy());
    retune(game, "town", MAIN_DECK, { ...mainOf(game, "town"), blanks: 1 });
    searchFor(game, "sage", "forest", 5, "explore");
    const rare = structuredClone(game.searches.forest?.[RARE_DECK]);
    putBack(game, "forest");
    expect(game.searches.forest?.[MAIN_DECK]).toBeUndefined();
    expect(game.searches.forest?.[RARE_DECK]).toEqual(rare);
    expect(mainOf(game, "town").blanks).toBe(1);
  });
});

describe("the code's tables of what is to be found", () => {
  it("cannot be written into: the types say so", () => {
    // Never called: only the type checker reads these, and each line of them must be refused.
    const writes = (): void => {
      // @ts-expect-error a place's way on is as the code has it
      PLACES.forest.leads[0].pool = 1;
      // @ts-expect-error a place's holding is as the code has it
      PLACES.forest.holds[0].need = 1;
      // @ts-expect-error a place's deck is as the code has it
      PLACES.forest.decks[MAIN_DECK].blanks = 1;
      // @ts-expect-error a place has the decks the code gives it
      PLACES.forest.decks[RARE_DECK] = { blanks: 0, aimed: 0, stray: 0, aim: "rolled", gather: 0 };
      // @ts-expect-error a place's ways on are as the code has them
      PLACES.forest.leads.push({ to: "lake", pool: 1, need: 1 });
      // @ts-expect-error a shop is as the code has it
      SHOPS[0].pool = 1;
      // @ts-expect-error a curio is as the code has it
      CURIOS.tablet.need = 2;
    };
    expect(typeof writes).toBe("function");
  });
});
