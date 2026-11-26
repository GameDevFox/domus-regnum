import { describe, expect, it } from "vitest";

import { assign } from "./game";
import { MAIN_DECK, PLACES } from "./country";
import { CROP_IDS, FIRST_CROP } from "./garden";
import { anyUnknown, reveal, revealSays, revealableOf } from "./dev";
import { newSearch, thingId, wayId, writtenAt } from "./discovery";
import { intelBook, intelOf, listedIn, slotsOf, tally } from "./intel";
import type { IntelEntry } from "./intel";
import { creditLoaves } from "./mastery";
import { gameAt, until } from "./test-kit";
import { HOUR, MASTERY_LOAVES, PIE_BERRIES } from "./tuning";
import type { Game } from "./types";
import { CLOTHING_IDS } from "./wares";

/** A game as it begins: with no shop in town found. (The tests' shared game knows them all.) */
const newcomer = (): Game => {
  const game = gameAt();
  game.shops = [];
  return game;
};

// Intel: everything there is to know, and how much of it the house knows.

const entry = (game: Game, kind: IntelEntry["kind"], id: string): IntelEntry => {
  const found = intelBook(game).find((e) => e.kind === kind && e.id === id);
  if (!found) throw new Error(`no such entry: ${kind} ${id}`);
  return found;
};
const known = (game: Game): string[] => intelBook(game).filter((e) => e.known).map((e) => `${e.kind}:${e.id}`);

describe("a new game", () => {
  it("knows the house, the town, coin, flour, the first crop and how to bake bread, and nothing else", () => {
    expect(known(newcomer())).toEqual(["place:manor", "place:town", "thing:coin", "thing:flour", `crop:${FIRST_CROP}`, "recipe:bread"]);
  });

  it("lists everything else there is to know as not yet known: places, things, crops, recipes, abilities and inventions", () => {
    const listed = listedIn(intelBook(newcomer()));
    const others = CROP_IDS.filter((crop) => crop !== FIRST_CROP).map((crop) => `crop:${crop}`);
    expect(listed.filter((e) => !e.known).map((e) => `${e.kind}:${e.id}`)).toEqual(["place:forest", "place:lake", "place:caves", "thing:berries", "thing:herbs", ...CLOTHING_IDS.map((id) => `thing:${id}`), ...others, "recipe:pie", "ability:bread", "invention:dumbwaiter", "invention:everwarm", "invention:till"]);
    expect(tally(intelBook(newcomer()))).toEqual({ known: 6, of: 15 + CLOTHING_IDS.length + CROP_IDS.length, hidden: 0 });
  });

  it("does not list what is hidden: no question mark stands for the tablet, and it is not counted", () => {
    const game = gameAt();
    expect(entry(game, "thing", "tablet")).toMatchObject({ hidden: true, known: false });
    expect(listedIn(intelBook(game)).some((e) => e.id === "tablet")).toBe(false);
    // …unless everything is asked for, for trying things out: then it is listed, still not known.
    expect(listedIn(intelBook(game), true).find((e) => e.id === "tablet")).toMatchObject({ hidden: true, known: false });
    expect(tally(listedIn(intelBook(game), true))).toEqual(tally(intelBook(game)));
  });
});

describe("what comes to be known", () => {
  it("is a place, when it has been found; and says how far it is and what has been found there", () => {
    const game = gameAt();
    game.places.forest = "found";
    expect(entry(game, "place", "forest")).toMatchObject({ known: true, says: ["38 minutes' walk from the house"] });
    game.finds.forest = ["berries", "herbs"];
    game.places.caves = "unknown";
    expect(entry(game, "place", "forest").says).toEqual(["38 minutes' walk from the house", "Berries and herbs can be gathered here", "A way leads on to a place not yet visited"]);
    game.places.caves = "found";
    expect(entry(game, "place", "forest").says[2]).toBe("A way leads on to the caves");
    // Of the town, what each shop found in it sells (shops.test.ts has the finding of them).
    expect(entry(game, "place", "town").says).toContain("The miller's: flour is bought here, 4 sacks at a time");
  });

  it("is a thing, when it has been gathered somewhere; and says where, and what it goes into once that is known", () => {
    const game = gameAt();
    expect(entry(game, "thing", "berries").known).toBe(false);
    game.places.forest = "found";
    game.finds.forest = ["berries"];
    expect(entry(game, "thing", "berries")).toMatchObject({ known: true, says: ["Gathered at the forest"] });
    expect(entry(game, "thing", "herbs").known).toBe(false);
    game.recipes.push("pie");
    expect(entry(game, "thing", "berries").says).toEqual(["Gathered at the forest", "Goes into berry pie"]);
  });

  it("is a recipe, when a batch of it has come out of the oven", () => {
    const game = gameAt();
    assign(game, "rose", null);
    game.shelf.bread = 0;
    game.stock.berries = PIE_BERRIES;
    expect(entry(game, "recipe", "pie").known).toBe(false);
    until(game, () => game.shelf.pie > 0, 4 * HOUR);
    expect(entry(game, "recipe", "pie")).toMatchObject({ known: true, says: ["A sack of flour and 2 lots of berries make 3 pies", "Sold at 9 coin each"] });
    expect(game.recipes).toEqual(["bread", "pie"]);
    // A recipe is learned once: the batches after the first teach nothing new.
    until(game, () => game.shelf.bread > 0, 4 * HOUR);
    expect(game.recipes).toEqual(["bread", "pie"]);
    expect(entry(game, "recipe", "bread").says[0]).toBe("A sack of flour makes 4 loaves");
  });

  it("is an ability, when someone has earned it; and says who has", () => {
    const game = gameAt();
    expect(entry(game, "ability", "bread").known).toBe(false);
    creditLoaves(game, "evelyn", MASTERY_LOAVES);
    expect(entry(game, "ability", "bread")).toMatchObject({ known: true });
    expect(entry(game, "ability", "bread").says[1]).toBe("Evelyn has it");
    creditLoaves(game, "sage", MASTERY_LOAVES);
    expect(entry(game, "ability", "bread").says[1]).toBe("Evelyn and Sage have it");
  });

  it("is a crop, when the house knows how to grow it; and says how long it takes and what it bears", () => {
    const game = gameAt();
    // Wheat, which a new game knows: what a square of it bears is flour, by the sack.
    expect(entry(game, "crop", "wheat")).toMatchObject({ known: true, says: ["Grown in the kitchen garden", "Ripe 3 watered days after it is sown; a square of a plot bears 2 sacks of flour", "It is pulled when it is picked, and sown again"] });
    // …and of any other, itself: potatoes, which it does not know yet.
    expect(entry(game, "crop", "potato")).toMatchObject({ known: false, says: ["Grown in the kitchen garden", "Ripe 9 watered days after it is sown; a square of a plot bears 5", "It is pulled when it is picked, and sown again"] });
    expect(entry(game, "crop", "cucumber").known).toBe(false);
    reveal(game, { kind: "crop", id: "cucumber" });
    reveal(game, { kind: "crop", id: "cucumber" });
    expect(game.garden.known).toEqual(["wheat", "cucumber"]);
    expect(entry(game, "crop", "cucumber")).toMatchObject({ known: true });
    expect(entry(game, "crop", "cucumber").says[2]).toBe("Picked, it bears again in 3 days");
  });

  it("is an invention, when the Master has made it", () => {
    const game = gameAt();
    game.devices = ["till"];
    expect(known(game)).toContain("invention:till");
    expect(entry(game, "invention", "dumbwaiter").known).toBe(false);
  });

  it("is what was hidden, when it is come upon: then it is listed, and counted over and above", () => {
    const game = gameAt();
    const before = tally(intelBook(game));
    game.curios.push("tablet");
    expect(listedIn(intelBook(game)).some((e) => e.id === "tablet")).toBe(true);
    expect(tally(intelBook(game))).toEqual({ ...before, hidden: 1 });
    expect(entry(game, "thing", "tablet")).toMatchObject({ curio: "tablet", says: ["Come upon at the forest", "It is in the house"] });
  });
});

describe("how much of a place is known", () => {
  it("is nothing until it is found, and then the share of its question marks that are answered", () => {
    const game = gameAt();
    game.places.forest = "unknown";
    expect(intelOf(game, "forest")).toBe(0);
    game.places.forest = "found";
    expect(intelOf(game, "forest")).toBe(0);
    game.finds.forest = ["berries"];
    expect(intelOf(game, "forest")).toBeCloseTo(1 / 3, 9);
    game.places.caves = "unknown";
    game.finds.forest = ["berries", "herbs"];
    expect(intelOf(game, "forest")).toBe(1);
  });

  it("is the whole for a found place with no question marks", () => {
    const game = gameAt();
    expect(intelOf(game, "town")).toBe(1);
    // (On the map as a question mark, the lake is not known at all.)
    expect(intelOf(game, "lake")).toBe(0);
    game.places.lake = "found";
    expect(intelOf(game, "lake")).toBe(1);
  });

  it("is over the whole when what is hidden there has been found, which weighs what one question mark does: four thirds for three marks and one hidden", () => {
    const game = gameAt();
    game.places.forest = "found";
    game.places.caves = "unknown";
    game.finds.forest = ["berries", "herbs"];
    game.curios.push("tablet");
    expect(intelOf(game, "forest")).toBeCloseTo(4 / 3, 9);
    // …and it counts before the rest is known too: the way on, and the tablet.
    game.finds.forest = [];
    expect(intelOf(game, "forest")).toBeCloseTo(2 / 3, 9);
  });

  it("is twice the whole for a hidden find at a place with no question marks, where there is nothing else to weigh it by", () => {
    const game = gameAt();
    game.places.forest = "found";
    const { leads, holds } = PLACES.forest;
    Object.assign(PLACES.forest, { leads: [], holds: [] });
    try {
      expect(intelOf(game, "forest")).toBe(1);
      game.curios.push("tablet");
      expect(intelOf(game, "forest")).toBe(2);
    } finally {
      Object.assign(PLACES.forest, { leads, holds });
    }
  });
});

describe("what there is to find at a place, mark by mark", () => {
  it("is a way on for each there is, and a thing for each it holds: none of them found at first", () => {
    const game = gameAt();
    game.places.forest = "found";
    expect(slotsOf(game, "forest")).toEqual([
      { is: "way", to: "caves", on: null, got: 0, sought: false },
      { is: "thing", thing: "berries", known: false, got: 0, sought: false },
      { is: "thing", thing: "herbs", known: false, got: 0, sought: false },
    ]);
    expect(slotsOf(game, "lake")).toEqual([]);
  });

  it("shows each as far as it has been found, by its own points: so many come upon of so many needed; then a way on is on the map, then visited", () => {
    const game = gameAt();
    game.places.forest = "found";
    // Two of the six points the way on needs have been come upon, and ten of the berries' forty; the herbs are known.
    const search = newSearch(writtenAt("forest")[0]);
    search.got = { [wayId("caves")]: 2, [thingId("berries")]: 10, [thingId("herbs")]: 3 };
    game.searches.forest = { [MAIN_DECK]: search };
    game.finds.forest = ["herbs"];
    expect(slotsOf(game, "forest")).toMatchObject([
      { on: null, got: expect.closeTo(1 / 3, 6), sought: false },
      { thing: "berries", known: false, got: expect.closeTo(1 / 4, 6) },
      { thing: "herbs", known: true, got: 1 },
    ]);
    // What an aimed search is on to is marked as sought.
    search.target = thingId("berries");
    expect(slotsOf(game, "forest").map((slot) => "sought" in slot && slot.sought)).toEqual([false, true, false]);
    game.places.caves = "unknown";
    expect(slotsOf(game, "forest")[0]).toEqual({ is: "way", to: "caves", on: "unknown", got: 1, sought: false });
    game.places.caves = "found";
    expect(slotsOf(game, "forest")[0]).toMatchObject({ on: "found" });
  });

  it("has what was hidden there among them only once it has been come upon", () => {
    const game = gameAt();
    game.places.forest = "found";
    expect(slotsOf(game, "forest").some((slot) => slot.is === "curio")).toBe(false);
    // (Asked for everything, as when things are being tried out, it is there, marked as not yet found.)
    expect(slotsOf(game, "forest", true)[3]).toEqual({ is: "curio", curio: "tablet", found: false });
    expect(slotsOf(game, "lake", true)).toEqual([]);
    game.curios.push("tablet");
    expect(slotsOf(game, "forest")[3]).toEqual({ is: "curio", curio: "tablet", found: true });
    expect(slotsOf(game, "forest", true)).toEqual(slotsOf(game, "forest"));
  });
});

describe("making a thing known, for trying things out", () => {
  it("finds a place, and puts a way on onto the map", () => {
    const game = gameAt();
    reveal(game, { kind: "place", id: "forest" });
    expect(game.places.forest).toBe("found");
    reveal(game, { kind: "way", to: "caves" });
    expect(game.places.caves).toBe("unknown");
    // A way to a place already found leaves it found.
    reveal(game, { kind: "place", id: "caves" });
    reveal(game, { kind: "way", to: "caves" });
    expect(game.places.caves).toBe("found");
  });

  it("has a thing gathered: wherever it is, or at the one place asked for, and once", () => {
    const game = gameAt();
    reveal(game, { kind: "thing", id: "berries" });
    reveal(game, { kind: "thing", id: "berries", at: "forest" });
    expect(game.finds).toEqual({ forest: ["berries"] });
    reveal(game, { kind: "thing", id: "herbs", at: "lake" });
    expect(game.finds).toEqual({ forest: ["berries"] });
    // It is known of, though nobody has been where it grows: the place is not named.
    expect(entry(game, "thing", "berries")).toMatchObject({ known: true, says: ["Gathered at a place not yet visited"] });
  });

  it("has what was hidden in the house, as if it had been come upon and brought home: once", () => {
    const game = gameAt();
    reveal(game, { kind: "curio", id: "tablet" });
    reveal(game, { kind: "curio", id: "tablet" });
    expect(game.curios).toEqual(["tablet"]);
    expect(entry(game, "thing", "tablet")).toMatchObject({ known: true });
  });

  it("has a recipe baked, an ability earned by the first who has not got it, and an invention made: each once", () => {
    const game = gameAt();
    reveal(game, { kind: "recipe", id: "pie" });
    reveal(game, { kind: "recipe", id: "pie" });
    expect(game.recipes).toEqual(["bread", "pie"]);
    reveal(game, { kind: "ability", id: "bread" });
    expect(entry(game, "ability", "bread").says[1]).toBe("Evelyn has it");
    expect(game.baked.evelyn).toBe(MASTERY_LOAVES);
    reveal(game, { kind: "ability", id: "bread" });
    expect(entry(game, "ability", "bread").says[1]).toBe("Evelyn and Rose have it");
    reveal(game, { kind: "invention", id: "till" });
    reveal(game, { kind: "invention", id: "till" });
    expect(game.devices).toEqual(["till"]);
    // (Of a game with every shop found: what is to wear is known of with the rest.)
    expect(tally(intelBook(game))).toMatchObject({ known: 9 + CLOTHING_IDS.length });
  });

  it("has the mastery of bread earned by the one of the household it is asked for, whoever comes before her: once, and for nobody who is not of the household", () => {
    const game = gameAt();
    game.baked.sage = 12;
    expect(revealSays(game, { kind: "mastery", who: "sage" })).toBe("the mastery of bread, for her");
    reveal(game, { kind: "mastery", who: "sage" });
    expect(game.baked).toMatchObject({ sage: MASTERY_LOAVES });
    expect(game.baked.evelyn ?? 0).toBe(0);
    expect(entry(game, "ability", "bread").says[1]).toBe("Sage has it");
    game.baked.sage = MASTERY_LOAVES + 30;
    reveal(game, { kind: "mastery", who: "sage" });
    expect(game.baked.sage).toBe(MASTERY_LOAVES + 30);
    reveal(game, { kind: "mastery", who: "a-customer" });
    expect(game.baked["a-customer"]).toBeUndefined();
  });

  it("can be said in a few words, for the question mark that stands for it: a place by its name, a way by where it leads, a thing by where it is gathered", () => {
    const game = gameAt();
    expect(revealSays(game, { kind: "place", id: "forest" })).toBe("The forest");
    expect(revealSays(game, { kind: "way", to: "caves" })).toBe("the way on to the caves");
    expect(revealSays(game, { kind: "thing", id: "berries", at: "forest" })).toBe("Berries, at the forest");
    expect(revealSays(game, { kind: "thing", id: "herbs" })).toBe("Herbs");
    expect(revealSays(game, { kind: "curio", id: "tablet" })).toBe("A stone tablet");
    expect(revealSays(game, { kind: "crop", id: "cucumber" })).toBe("Cucumbers");
    expect(revealSays(game, { kind: "recipe", id: "pie" })).toBe(intelBook(game).find((e) => e.kind === "recipe" && e.id === "pie")?.name);
    expect(revealSays(game, { kind: "invention", id: "till" })).toBe(intelBook(game).find((e) => e.kind === "invention" && e.id === "till")?.name);
  });

  it("has something sold in town known of by finding the shop that sells it: all it sells is known of with it", () => {
    const game = newcomer();
    expect(entry(game, "thing", "boots")).toMatchObject({ known: false, name: "Boots" });
    reveal(game, { kind: "thing", id: "boots" });
    expect(game.shops).toEqual(["clothes"]);
    expect(CLOTHING_IDS.map((id) => entry(game, "thing", id).known)).toEqual(CLOTHING_IDS.map(() => true));
    expect(entry(game, "thing", "boots").says).toEqual(["Bought at the clothes shop in town, for 30 coin", "A plain pair: nothing is made of them yet", "The house has none"]);
    reveal(game, { kind: "thing", id: "boots" });
    expect(game.shops).toEqual(["clothes"]);
  });

  it("is all of one kind at once, what is hidden among them, and nothing of another kind", () => {
    const game = newcomer();
    const before = known(game);
    expect(anyUnknown(game, "thing")).toBe(true);
    reveal(game, { kind: "all", of: "thing" });
    expect(anyUnknown(game, "thing")).toBe(false);
    expect(listedIn(intelBook(game), true).filter((e) => e.kind === "thing").map((e) => [e.id, e.known])).toEqual([["coin", true], ["flour", true], ["berries", true], ["herbs", true], ...CLOTHING_IDS.map((id) => [id, true]), ["tablet", true]]);
    expect(game.curios).toEqual(["tablet"]);
    // Nothing of another kind: the forest those berries grow in is still not found.
    expect(known(game).filter((k) => !k.startsWith("thing:"))).toEqual(before.filter((k) => !k.startsWith("thing:")));
    expect(anyUnknown(game, "place")).toBe(true);
    expect(anyUnknown(game)).toBe(true);
  });

  it("is everything at once: every entry known, and every place known past the whole where something was hidden", () => {
    const game = gameAt();
    reveal(game, { kind: "all" });
    expect(anyUnknown(game)).toBe(false);
    expect(listedIn(intelBook(game), true).filter((e) => !e.known)).toEqual([]);
    expect(intelOf(game, "forest")).toBeCloseTo(4 / 3, 9);
    // Done again, it changes nothing.
    const after = JSON.stringify([game.places, game.finds, game.curios, game.recipes, game.devices, game.garden.known, game.baked]);
    reveal(game, { kind: "all" });
    expect(JSON.stringify([game.places, game.finds, game.curios, game.recipes, game.devices, game.garden.known, game.baked])).toBe(after);
  });

  it("says what all of a kind, or everything, is; and an entry of the menu says what makes it known", () => {
    const game = gameAt();
    expect(revealSays(game, { kind: "all", of: "place" })).toBe("every place");
    expect(revealSays(game, { kind: "all" })).toBe("everything there is to know");
    const entry = (id: string): IntelEntry => listedIn(intelBook(game), true).find((e) => e.id === id) as IntelEntry;
    expect(revealableOf(entry("tablet"))).toEqual({ kind: "curio", id: "tablet" });
    expect(revealableOf(entry("forest"))).toEqual({ kind: "place", id: "forest" });
  });
});
