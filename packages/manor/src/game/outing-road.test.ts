import { describe, expect, it } from "vitest";

import { PLACES, walkMinutes } from "./country";
import { assign } from "./game";
import { backAt, errandCost, lotsOf, outingOf, timesFrom, timesOf } from "./outing";
import { explore, gather, sendToTown, whyNotSend } from "./outing-send";
import { atMost, forestKnown, out } from "./outing-kit";
import { whereabouts } from "./road";
import { NINE, comeHome, gameAt, home, inHouse, quiet, run, until } from "./test-kit";
import { BEDTIME, ERRAND_MINUTES, GATHER_LEARNS, HOUR } from "./tuning";
import type { Game, Outing } from "./types";

// Someone out of doors on the way to a place or home from it: where she is on the map, and what becomes of her sent somewhere else on the road.

describe("someone on the road, sent somewhere else", () => {
  const FOREST = walkMinutes("forest");
  const LAKE = walkMinutes("lake");
  /** Sage, out at the gate and so many minutes along the road to the forest. */
  const onTheWay = (game: Game, minutes: number): Outing => {
    explore(game, "sage", "forest", atMost(4 * HOUR));
    const outing = outingOf(game, "sage") as Outing;
    until(game, () => outing.state === "away" && game.clock >= (outing.left ?? Infinity) + minutes * ((outing.arrive - (outing.left ?? 0)) / FOREST), 4 * HOUR);
    return outing;
  };

  it("is turned round where she is: half way to the forest and sent to the lake, she walks back the half she had come and then out to the lake, and is never in the house", () => {
    const game = quiet();
    const outing = onTheWay(game, FOREST / 2);
    expect(whereabouts(outing, game.clock)).toMatchObject({ from: "manor", to: "forest", along: expect.closeTo(0.5, 1) });
    expect(whyNotSend(game, "sage", "explore", { to: "lake", terms: atMost(60) })).toBeNull();
    const turnedAt = game.clock;
    expect(explore(game, "sage", "lake", atMost(60))).toBe(true);
    // The same outing, bound elsewhere: there is still one of her.
    expect(game.outings).toEqual([outing]);
    expect(outing).toMatchObject({ to: "lake", doing: "explore", state: "away", seeks: "lake", done: false, left: turnedAt, turned: { via: ["manor", "lake"] } });
    expect(outing.arrive - turnedAt).toBeCloseTo(FOREST / 2 + LAKE, -0.5);
    expect(outing.depart - outing.arrive).toBe(60);
    expect(outing.back - outing.depart).toBe(LAKE);
    // Back down the road she was on, past the house without going in, and out along the other.
    run(game, 10);
    expect(whereabouts(outing, game.clock)).toMatchObject({ from: "manor", to: "forest", along: expect.closeTo((FOREST / 2 - 10) / FOREST, 1) });
    until(game, () => game.clock >= turnedAt + FOREST / 2 + LAKE / 2, 4 * HOUR);
    expect(outing.state).toBe("away");
    expect(inHouse(game, "sage")).toBe(false);
    expect(whereabouts(outing, game.clock)).toMatchObject({ from: "manor", to: "lake", along: expect.closeTo(0.5, 1) });
    until(game, () => game.asks.length > 0, 4 * HOUR);
    // She is at the lake when she said, and it is found: she asks what she is to do there.
    expect(game.clock).toBeCloseTo(outing.arrive, 0);
    expect(game.asks).toEqual([{ who: "sage", place: "lake", why: "place" }]);
    expect(game.places.lake).toBe("found");
    expect(game.places.forest).toBe("unknown");
    comeHome(game, "sage", 4 * HOUR);
  });

  it("is turned back to the place she has just left: on her way home, she is there again as soon as she has walked back", () => {
    const game = forestKnown();
    explore(game, "sage", "forest", atMost(10, true));
    const outing = outingOf(game, "sage") as Outing;
    until(game, () => game.clock >= outing.depart + 8, 4 * HOUR);
    expect(outing.homeward).toBe(true);
    expect(whereabouts(outing, game.clock)).toMatchObject({ from: "forest", to: "manor" });
    const turnedAt = game.clock;
    expect(gather(game, "sage", "forest", atMost(30, true))).toBe(true);
    expect(outing).toMatchObject({ to: "forest", doing: "gather", homeward: false, turned: { via: ["forest"] } });
    // Eight minutes home from it, she is eight minutes from it.
    expect(outing.arrive - turnedAt).toBeCloseTo(8, 0);
    home(game, "sage", 4 * HOUR);
    expect(game.stock).toMatchObject({ berries: 3, herbs: 1 });
    // The minutes she had explored before are counted once.
    expect(game.explored.forest).toBeCloseTo(10 + 30 * GATHER_LEARNS, 6);
  });

  it("is sent on past where she was bound, by the road she is on: on the way to the forest and sent to the caves beyond it", () => {
    const game = quiet();
    game.places.forest = "found";
    game.places.caves = "unknown";
    const outing = onTheWay(game, FOREST / 2);
    const turnedAt = game.clock;
    expect(explore(game, "sage", "caves", atMost(60))).toBe(true);
    expect(outing.turned?.via).toEqual(["forest", "caves"]);
    expect(outing.arrive - turnedAt).toBeCloseTo(walkMinutes("caves") - FOREST / 2, -0.5);
    until(game, () => game.asks.length > 0, 4 * HOUR);
    expect(game.asks).toEqual([{ who: "sage", place: "caves", why: "place" }]);
    expect(game.places.caves).toBe("found");
  });

  it("is not sent again to where she is bound, for what she is bound there for: she is out, and on her way to it", () => {
    const game = quiet();
    game.places.forest = "found";
    game.finds.forest = ["berries"];
    const outing = onTheWay(game, 10);
    const { arrive } = outing;
    expect(whyNotSend(game, "sage", "explore", { to: "forest", terms: atMost(60) })).toBe("out");
    expect(explore(game, "sage", "forest", atMost(60))).toBe(false);
    expect(outing.arrive).toBe(arrive);
    // For something else there, she can be: to gather, where she was to explore. What is left of the road is walked from where she is.
    const where = whereabouts(outing, game.clock) as { along: number };
    expect(gather(game, "sage", "forest", atMost(60))).toBe(true);
    expect(outing).toMatchObject({ doing: "gather", turned: { via: ["forest"] } });
    expect(outing.arrive - game.clock).toBeCloseTo((1 - where.along) * FOREST, 0);
  });

  it("not yet out at the gate, is sent from the house afresh: the same outing, to the new place", () => {
    const game = quiet();
    explore(game, "sage", "forest", atMost(4 * HOUR));
    const outing = outingOf(game, "sage") as Outing;
    run(game, 2);
    expect(outing.state).toBe("leaving");
    expect(explore(game, "sage", "lake", atMost(30))).toBe(true);
    expect(game.outings).toEqual([outing]);
    expect(outing).toMatchObject({ to: "lake", turned: null, left: null, arrive: game.clock + LAKE, depart: game.clock + LAKE + 30 });
    comeHome(game, "sage", 4 * HOUR);
    expect(game.places.lake).toBe("found");
  });

  it("is not turned while she is at a place, nor on the drive coming in: she is out, as before", () => {
    const game = forestKnown();
    explore(game, "sage", "forest", atMost(20, true));
    const outing = outingOf(game, "sage") as Outing;
    until(game, () => game.clock >= outing.arrive + 5, 4 * HOUR);
    expect(whyNotSend(game, "sage", "explore", { to: "lake", terms: atMost(60) })).toBe("out");
    expect(explore(game, "sage", "lake", atMost(60))).toBe(false);
    expect(outing.to).toBe("forest");
    until(game, () => outing.state === "coming", 4 * HOUR);
    expect(whyNotSend(game, "sage", "explore", { to: "lake", terms: atMost(60) })).toBe("out");
  });

  it("is turned with something in her hands: her basket stays with her; and on her way to buy, the coin for it is the house's again", () => {
    const game = forestKnown();
    gather(game, "sage", "forest", atMost(30, true));
    const outing = outingOf(game, "sage") as Outing;
    until(game, () => game.clock >= outing.depart + 5, 4 * HOUR);
    const basket = { ...outing.basket };
    expect(lotsOf(basket)).toBeGreaterThan(0);
    expect(whyNotSend(game, "sage", "explore", { to: "lake", terms: atMost(60) })).toBeNull();
    expect(explore(game, "sage", "lake", atMost(60))).toBe(true);
    expect(outing).toMatchObject({ to: "lake", basket });
    // Someone on her way to buy is refunded the price as she is sent elsewhere.
    game.coin = 100;
    sendToTown(game, "rose");
    const errand = outingOf(game, "rose") as Outing;
    until(game, () => errand.state === "away", 4 * HOUR);
    expect(game.coin).toBe(100 - errandCost());
    expect(explore(game, "rose", "lake", atMost(60))).toBe(true);
    expect(game.coin).toBe(100);
    expect(errand).toMatchObject({ to: "lake", doing: "explore", buys: null });
  });

  it("is reckoned from where she is: when she would be there", () => {
    const game = quiet();
    // (From the house, it is the walk there.)
    expect(timesFrom(game, "sage", "lake", atMost(60))).toEqual(timesOf(game.clock, "lake", atMost(60)));
    onTheWay(game, FOREST / 2);
    expect(timesFrom(game, "sage", "forest", atMost(60)).arrive - game.clock).toBeCloseTo(FOREST / 2, -0.5);
    expect(timesFrom(game, "sage", "lake", atMost(60)).arrive - game.clock).toBeCloseTo(FOREST / 2 + LAKE, -0.5);
  });

  it("is not turned to where she could not be and home again before bed, told to be: reckoned from where she is", () => {
    // A hundred minutes before bed, and half way to the forest some twenty-five minutes on: the forest ahead can be reached and left in time, and the lake behind her cannot.
    const game = gameAt(BEDTIME - 100);
    assign(game, "evelyn", null);
    onTheWay(game, FOREST / 2);
    const byBed = { limit: 4 * HOUR, homeByBed: true };
    game.finds.forest = ["berries"];
    game.places.forest = "found";
    expect(whyNotSend(game, "sage", "gather", { to: "forest", terms: byBed })).toBeNull();
    expect(whyNotSend(game, "sage", "explore", { to: "lake", terms: byBed })).toBe("late");
    expect(explore(game, "sage", "lake", byBed)).toBe(false);
  });
});

describe("where someone out of doors is", () => {
  const walk = walkMinutes("forest");

  it("is nowhere on the map until she has gone out of the door, nor once she is in again", () => {
    expect(whereabouts({ ...out("forest", NINE, NINE, 60), state: "leaving", left: null }, NINE + 5)).toBeNull();
    expect(whereabouts({ ...out("forest", NINE, NINE, 60), state: "returning" }, NINE + 200)).toBeNull();
  });

  it("is on the way out, then at the place for as long as she was sent, then on the way home", () => {
    const outing = out("forest", NINE, NINE, 60);
    expect(whereabouts(outing, NINE)).toEqual({ from: "manor", to: "forest", along: 0 });
    expect(whereabouts(outing, NINE + walk / 2)).toMatchObject({ from: "manor", to: "forest", along: expect.closeTo(0.5, 6) });
    expect(whereabouts(outing, NINE + walk)).toEqual({ at: "forest" });
    expect(whereabouts(outing, NINE + walk + 59)).toEqual({ at: "forest" });
    expect(whereabouts(outing, NINE + walk + 60 + walk / 2)).toMatchObject({ from: "forest", to: "manor", along: expect.closeTo(0.5, 6) });
    expect(whereabouts(outing, NINE + walk + 60 + walk)).toMatchObject({ from: "forest", to: "manor", along: 1 });
  });

  it("is at the place when she is due there however long she took to reach the door: the road is walked the faster", () => {
    const outing = out("forest", NINE, NINE + 10, 60);
    expect(whereabouts(outing, NINE + 10)).toEqual({ from: "manor", to: "forest", along: 0 });
    expect(whereabouts(outing, NINE + 10 + (walk - 10) / 2)).toMatchObject({ along: expect.closeTo(0.5, 6) });
    expect(whereabouts(outing, NINE + walk)).toEqual({ at: "forest" });
  });

  it("passes each place on the way to one beyond it", () => {
    const outing = out("caves", NINE, NINE, 60);
    const whole = walkMinutes("caves");
    expect(whereabouts(outing, NINE + 1)).toMatchObject({ from: "manor", to: "forest" });
    expect(whereabouts(outing, NINE + whole - 1)).toMatchObject({ from: "forest", to: "caves" });
    expect(whereabouts(outing, NINE + whole + 60 + 1)).toMatchObject({ from: "caves", to: "forest" });
    expect(whereabouts(outing, NINE + whole + 60 + whole - 1)).toMatchObject({ from: "forest", to: "manor" });
    // Half the way there in time is half the way there on the map, whichever leg that falls on.
    const half = whereabouts(outing, NINE + whole / 2) as { from: string; to: string; along: number };
    const legs = [Math.hypot(PLACES.forest.at.x - PLACES.manor.at.x, PLACES.forest.at.y - PLACES.manor.at.y), Math.hypot(PLACES.caves.at.x - PLACES.forest.at.x, PLACES.caves.at.y - PLACES.forest.at.y)];
    const walkedBy = (where: { from: string; along: number }): number => (where.from === "manor" ? where.along * legs[0] : legs[0] + where.along * legs[1]);
    expect(walkedBy(half)).toBeCloseTo((legs[0] + legs[1]) / 2, 6);
    // And nine tenths of the way is on the second leg, as far along it as is left over from the first.
    const nearly = whereabouts(outing, NINE + whole * 0.9) as { from: string; to: string; along: number };
    expect(nearly.from).toBe("forest");
    expect(walkedBy(nearly)).toBeCloseTo((legs[0] + legs[1]) * 0.9, 6);
  });

  it("is at the door, and no farther, if she is looked for after she was due", () => {
    const outing = out("forest", NINE, NINE, 60);
    expect(whereabouts(outing, outing.back + 300)).toEqual({ from: "forest", to: "manor", along: 1 });
  });

  it("is so in the game, for the errand into town as for any outing", () => {
    const game = quiet();
    game.coin = 100;
    sendToTown(game, "sage", "flour", true);
    const outing = game.outings[0];
    expect(outing).toMatchObject({ to: "town", doing: "buy", buys: "flour", back: backAt(NINE), arrive: NINE + walkMinutes("town"), depart: backAt(NINE) - walkMinutes("town") });
    expect(backAt(NINE)).toBe(NINE + ERRAND_MINUTES);
    expect(whereabouts(outing, game.clock)).toBeNull();
    until(game, () => outing.state === "away");
    expect(outing.left).toBe(game.clock);
    expect(whereabouts(outing, game.clock)).toEqual({ from: "manor", to: "town", along: 0 });
    until(game, () => game.clock >= outing.arrive, 90);
    expect(whereabouts(outing, game.clock)).toEqual({ at: "town" });
    until(game, () => outing.state === "returning", ERRAND_MINUTES);
    expect(whereabouts(outing, game.clock)).toBeNull();
  });
});
