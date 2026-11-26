import { describe, expect, it } from "vitest";

import { BAKE_IDS } from "./bakes";
import { THING_IDS } from "./country";
import { CURIO_IDS } from "./curios";
import { createGame } from "./game";
import { CROP_IDS } from "./garden";
import { intelBook } from "./intel";
import { ITEMS, ITEM_IDS } from "./items";
import { gameAt } from "./test-kit";
import type { Game } from "./types";
import { CLOTHING_IDS, takeIn } from "./wares";

// Everything the house can have a number of is one list (items.ts), which the inventory and the
// intel menu are made from: nothing the house can hold is off it, and everything on it is in both.

/** A record of numbers, with something in it. */
const isCounts = (value: unknown): value is Record<string, number> => typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length > 0 && Object.values(value).every((n) => typeof n === "number");
/**
 * The records of numbers a game has that are not things held: each is named here with what it
 * is. A record that is neither here nor made of items fails the test below: a new store of
 * things is put on the list of items, and anything else is named here.
 */
const NOT_THINGS_HELD: Partial<Record<keyof Game, string>> = {
  baked: "the loaves each of the household has baked, towards the mastery of bread",
  explored: "the minutes of exploring done at each place",
  turns: "whose turn it is at each round of chores",
  today: "the day's own counts, of what was sold and who went without",
};
/** A game with something of everything in it: so that every store it has is seen to hold something. */
const stocked = (): Game => {
  const game = gameAt();
  for (const id of ITEM_IDS) {
    if (id in game.stock) game.stock[id as keyof Game["stock"]] = 3;
    if (id in game.shelf) game.shelf[id as keyof Game["shelf"]] = 3;
    if (id in game.wardrobe) game.wardrobe[id as keyof Game["wardrobe"]] = 3;
  }
  game.curios = [...CURIO_IDS];
  Object.assign(game, { baked: { evelyn: 4 }, explored: { forest: 12 } });
  return game;
};

describe("the list of items", () => {
  it("has everything the house can hold: coin, flour, what is baked, gathered and grown, what there is to wear, and what is come upon", () => {
    expect([...ITEM_IDS].sort()).toEqual(["coin", "flour", ...BAKE_IDS, ...THING_IDS, ...CROP_IDS, ...CLOTHING_IDS, ...CURIO_IDS].sort());
    for (const id of ITEM_IDS) expect(ITEMS[id]).toMatchObject({ id, name: expect.any(String), glyph: expect.any(String), held: expect.any(String) });
    // No two are called the same in the inventory.
    expect(new Set(ITEM_IDS.map((id) => ITEMS[id].held)).size).toBe(ITEM_IDS.length);
  });

  it("covers every store of the game's that counts things: a record of numbers in a game is made of items, or is named as something else", () => {
    for (const game of [createGame(undefined, 1), stocked()]) {
      for (const [field, value] of Object.entries(game)) {
        if (!isCounts(value) || field in NOT_THINGS_HELD) continue;
        for (const key of Object.keys(value)) expect(ITEM_IDS, `game.${field}.${key} is counted, and is not on the list of items`).toContain(key);
      }
    }
    // (And the stores there are, are seen: the test is not passing for want of anything to look at.)
    expect(Object.entries(stocked()).filter(([field, value]) => isCounts(value) && !(field in NOT_THINGS_HELD)).map(([field]) => field).sort()).toEqual(["shelf", "stock", "wardrobe"]);
  });

  it("says how many of each the house has, from where it is kept", () => {
    const game = stocked();
    game.coin = 41;
    game.flour = 7;
    expect(ITEMS.coin.count(game)).toBe(41);
    expect(ITEMS.flour.count(game)).toBe(7);
    for (const id of [...BAKE_IDS, ...THING_IDS, ...CROP_IDS, ...CLOTHING_IDS]) expect(ITEMS[id].count(game), id).toBe(3);
    expect(ITEMS.tablet.count(game)).toBe(1);
    game.wardrobe.boots = 0;
    game.curios = [];
    expect([ITEMS.boots.count(game), ITEMS.tablet.count(game)]).toEqual([0, 0]);
  });

  it("is on the house's books from when the house has it: coin, flour and loaves from the first, the rest once there is some", () => {
    const game = gameAt();
    const shown = (): string[] => ITEM_IDS.filter((id) => ITEMS[id].shown?.(game) ?? true);
    expect(shown()).toEqual(["coin", "flour", "bread"]);
    // Something to wear, bought and brought home, is on the books: as anything is.
    takeIn(game, "boots", 1);
    game.stock.potato = 2;
    game.shelf.pie = 1;
    game.finds.forest = ["herbs"];
    game.curios.push("tablet");
    expect(shown()).toEqual(["coin", "flour", "bread", "pie", "herbs", "potato", "boots", "tablet"]);
    expect(ITEMS.boots.held).toBe("Boots put by");
  });

  it("is spoken of in the intel menu, every one: on the page its kind is of, by an entry of its own id", () => {
    for (const game of [createGame(undefined, 1), stocked()]) {
      const book = intelBook(game);
      for (const id of ITEM_IDS) expect(book.filter((entry) => entry.kind === ITEMS[id].intel.kind && entry.id === id).length, `${id}, under ${ITEMS[id].intel.kind}`).toBe(1);
    }
  });

  it("is known in the intel menu once the house has it, whatever it is", () => {
    const game = stocked();
    // (With no shop in town found: what is to wear is known of because the house has some, however it came by it.)
    game.shops = [];
    game.garden.known = [...CROP_IDS];
    game.recipes = [...BAKE_IDS];
    game.finds.forest = [...THING_IDS];
    const book = intelBook(game);
    for (const id of ITEM_IDS) expect(book.find((entry) => entry.kind === ITEMS[id].intel.kind && entry.id === id)?.known, id).toBe(true);
    // What is to wear says how many the house has.
    expect(book.find((entry) => entry.id === "gloves")?.says).toContain("The house has 3");
  });
});
