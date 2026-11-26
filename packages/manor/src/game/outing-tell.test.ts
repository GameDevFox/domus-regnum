import { describe, expect, it } from "vitest";

import { assign } from "./game";
import { CROP_IDS } from "./garden";
import { errandCost, outingOf } from "./outing";
import { explore, gather, goTo, sellInTown, sendToTown } from "./outing-send";
import { answer, cancel, choicesFor, tell, whyNotTell } from "./outing-tell";
import type { Told } from "./outing-tell";
import { FULL, atMost, forestKnown } from "./outing-kit";
import { priceOf } from "./sales";
import { home, inHouse, quiet, run, until } from "./test-kit";
import { BEDTIME, ERRAND_SACKS, HOUR, START_FLOUR } from "./tuning";
import type { Game, Outing } from "./types";
import { WARES } from "./wares";

// What someone asking, or waiting at a place, can be told: each choice, why one cannot be done,
// and what each does to the house's coin, her basket and what she has bought.

const sage = (game: Game): Outing => outingOf(game, "sage") as Outing;
const asked = (game: Game, within = 6 * HOUR): void => until(game, () => game.asks.length > 0, within);
const tolds = (game: Game, id = "sage"): Told[] => choicesFor(game, id).map((choice) => choice.told);
const whyOf = (game: Game, told: Told): string | null => choicesFor(game, "sage").find((choice) => JSON.stringify(choice.told) === JSON.stringify(told))?.why ?? null;

/** Sage in the forest with a full basket, asking. */
const fullInTheForest = (): Game => {
  const game = forestKnown();
  gather(game, "sage", "forest", atMost(8 * HOUR));
  asked(game);
  return game;
};

/** Sage in town, her flour bought, asking; with so much coin in the house, and nobody keeping the shop to add to it. */
const inTown = (coin: number): Game => {
  const game = quiet();
  assign(game, "rose", null);
  game.coin = coin;
  sendToTown(game, "sage");
  asked(game);
  return game;
};

describe("what she can be told", () => {
  it("at the forest with her basket full: explore, gather (but her basket is full), go on to the other places on the map, stay, or come home", () => {
    const game = fullInTheForest();
    expect(tolds(game)).toEqual(["explore", "gather", { go: "town" }, { go: "lake" }, "stay", "home"]);
    expect(whyOf(game, "gather")).toBe("full");
    expect(answer(game, "gather")).toBe(false);
    expect(game.asks.length).toBe(1);
    expect(whyOf(game, { go: "town" })).toBeNull();
  });

  it("in town: explore, every ware of every shop found, go on, stay, or come home; and nothing for anyone not asking or waiting", () => {
    const game = inTown(100);
    const wares = tolds(game).filter((told) => typeof told === "object" && "buy" in told);
    expect(wares).toEqual(Object.values(WARES).map((ware) => ({ buy: ware.id })));
    expect(tolds(game)).toContain("explore");
    expect(tolds(game)).not.toContain("gather");
    expect(choicesFor(game, "rose")).toEqual([]);
    expect(whyNotTell(game, "rose", "home")).toBe("nobody");
  });

  it("a ware is refused without the coin for it, or with no use for it; the question stands", () => {
    const game = inTown(errandCost());
    expect(game.coin).toBe(0);
    expect(whyOf(game, { buy: "flour" })).toBe("coin");
    expect(tell(game, "sage", { buy: "flour" })).toBe(false);
    game.garden.known = [...CROP_IDS];
    game.coin = 100;
    expect(whyOf(game, { buy: "almanac" })).toBe("needless");
    expect(game.asks.length).toBe(1);
  });

  it("selling is offered only of what she carries, at a stall that has been found", () => {
    const game = inTown(100);
    expect(tolds(game).some((told) => typeof told === "object" && "sell" in told)).toBe(false);
    expect(whyNotTell(game, "sage", { sell: "berries" })).toBe("nothing");
    expect(tell(game, "sage", { sell: "berries" })).toBe(false);
    sage(game).basket = { berries: 2 };
    game.shops = game.shops.filter((shop) => shop !== "greengrocer");
    expect(whyNotTell(game, "sage", { sell: "berries" })).toBe("shop");
    expect(tolds(game).some((told) => typeof told === "object" && "sell" in told)).toBe(false);
  });

  it("going on is refused where she could not be and home again before bed, told to be", () => {
    const game = forestKnown();
    game.clock = BEDTIME - 2 * HOUR;
    goTo(game, "sage", "forest", { limit: 8 * HOUR, homeByBed: true });
    asked(game);
    // The lake is the other side of the house: a walk back and out again, and home, is more than she has.
    expect(whyOf(game, { go: "lake" })).toBe("late");
    expect(tell(game, "sage", { go: "lake" })).toBe(false);
  });
});

describe("buying, in town", () => {
  it("draws on the house's coin at that moment: buying twice is two prices, and two lots of the ware she brings home", () => {
    const game = inTown(100);
    expect(game.coin).toBe(100 - errandCost());
    expect(tell(game, "sage", { buy: "flour" })).toBe(true);
    expect(game.coin).toBe(100 - 2 * errandCost());
    expect(sage(game)).toMatchObject({ doing: "buy", buys: "flour", bought: { flour: ERRAND_SACKS } });
    asked(game);
    expect(sage(game).bought).toEqual({ flour: 2 * ERRAND_SACKS });
    expect(answer(game, { buy: "boots" })).toBe(true);
    asked(game);
    expect(answer(game, "home")).toBe(true);
    home(game, "sage", 2 * HOUR);
    expect(game.flour).toBe(START_FLOUR + 2 * ERRAND_SACKS);
    expect(game.wardrobe.boots).toBe(1);
  });
});

describe("going on, and selling what she carries", () => {
  it("from the forest to the town past the house, without going in: she sells what she gathered, the coin is the house's when she is in, and what she did not sell goes to the pantry", () => {
    const game = fullInTheForest();
    const coin = game.coin;
    expect(tell(game, "sage", { go: "town" })).toBe(true);
    expect(sage(game)).toMatchObject({ to: "town", doing: null, turned: { from: { at: "forest" }, via: ["forest", "manor", "town"] } });
    until(game, () => {
      expect(inHouse(game, "sage")).toBe(false);
      return game.asks.length > 0;
    }, 3 * HOUR);
    expect(game.asks).toEqual([{ who: "sage", place: "town", why: "arrived" }]);
    expect(tolds(game)).toEqual(expect.arrayContaining([{ sell: "berries" }, { sell: "herbs" }]));
    expect(tell(game, "sage", { sell: "berries" })).toBe(true);
    asked(game);
    expect(sage(game)).toMatchObject({ purse: FULL.berries * priceOf("berries"), basket: { herbs: FULL.herbs } });
    expect(game.coin).toBeGreaterThanOrEqual(coin);
    const before = game.coin;
    expect(answer(game, "home")).toBe(true);
    until(game, () => sage(game).state === "returning", 2 * HOUR);
    expect(game.coin - before).toBeGreaterThanOrEqual(FULL.berries * priceOf("berries"));
    home(game, "sage", HOUR);
    expect(game.stock).toMatchObject({ berries: 0, herbs: FULL.herbs });
  });

  it("taken from the pantry to sell and not sold, goods go back to the pantry", () => {
    const game = quiet();
    game.stock.herbs = 5;
    const coin = game.coin;
    sellInTown(game, "sage", "herbs");
    expect(game.stock.herbs).toBe(0);
    until(game, () => game.clock >= sage(game).arrive + 1, 3 * HOUR);
    // Stopped before it is sold, she asks; told to come home, she brings them back.
    expect(cancel(game, "sage")).toBe(true);
    expect(game.asks).toEqual([{ who: "sage", place: "town", why: "stopped", did: { doing: "sell", good: "herbs" } }]);
    expect(sage(game)).toMatchObject({ purse: 0, basket: { herbs: 5 } });
    expect(answer(game, "home")).toBe(true);
    home(game, "sage", 2 * HOUR);
    expect(game.stock.herbs).toBe(5);
    expect(game.coin).toBeGreaterThanOrEqual(coin);
  });
});

describe("staying where she is", () => {
  it("waits there, and asks nothing more; given work at that place, she begins at once", () => {
    const game = forestKnown();
    goTo(game, "sage", "forest");
    asked(game);
    expect(answer(game, "stay")).toBe(true);
    expect(sage(game)).toMatchObject({ waits: true });
    run(game, HOUR);
    expect(game.asks).toEqual([]);
    expect(choicesFor(game, "sage").map((choice) => choice.told)).not.toContain("stay");
    expect(gather(game, "sage", "forest", atMost(30))).toBe(true);
    expect(sage(game)).toMatchObject({ doing: "gather", waits: false, arrive: game.clock, turned: null });
    asked(game);
    expect(game.asks).toEqual([{ who: "sage", place: "forest", why: "time", did: { doing: "gather" } }]);
    expect(sage(game).basket).toEqual({ berries: 3, herbs: 1 });
  });

  it("given work at another place, she goes on there by the roads and does it", () => {
    const game = forestKnown();
    goTo(game, "sage", "forest");
    asked(game);
    tell(game, "sage", "stay");
    expect(explore(game, "sage", "lake", atMost(30))).toBe(true);
    expect(sage(game)).toMatchObject({ to: "lake", doing: "explore", turned: { from: { at: "forest" }, via: ["forest", "manor", "lake"] } });
    asked(game);
    expect(game.asks).toEqual([{ who: "sage", place: "lake", why: "place" }]);
  });

  it("told to stay, she can be told what to do there without being asked", () => {
    const game = inTown(100);
    expect(tell(game, "sage", "stay")).toBe(true);
    expect(whyNotTell(game, "sage", "stay")).toBe("out");
    expect(tell(game, "sage", { buy: "gloves" })).toBe(true);
    expect(game.coin).toBe(100 - errandCost() - WARES.gloves.price);
  });
});
