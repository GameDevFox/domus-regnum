import { describe, expect, it } from "vitest";

import { asleep } from "./bedtime";
import { lotsIn, walkMinutes } from "./country";
import { combed } from "./discovery";
import { gathersIn, lotsOf, outingOf } from "./outing";
import { explore, gather, sendToTown } from "./outing-send";
import { answer } from "./outing-tell";
import { FOREST_POINTS, FULL, FULL_AT, NOTHING, atMost, forestFound, forestKnown } from "./outing-kit";
import { isAt } from "./place";
import { NINE, home, inHouse, person, quiet, roomOf, run, until } from "./test-kit";
import { BASKET_HOLDS, BEDTIME, BERRY_MINUTES, DAY, GATHER_LEARNS, HERB_MINUTES, HOUR, START_FLOUR, WAKE } from "./tuning";
import type { Outing } from "./types";

// Gathering in a place, and bringing the basket home (sent with the return asked for: else she
// asks what next when it is full, outing-ask.test.ts); and an outing that runs into the night.

describe("gathering", () => {
  it("is not of a place that has not been found, nor of one that holds nothing, nor of one where nothing to gather has been found yet", () => {
    const game = quiet();
    expect(gather(game, "sage", "forest")).toBe(false);
    game.places.forest = "found";
    game.places.lake = "found";
    expect(gather(game, "sage", "lake")).toBe(false);
    // The forest is found, and what grows in it is not: it is to be explored first.
    expect(gather(game, "sage", "forest")).toBe(false);
    game.finds.forest = ["berries"];
    expect(gather(game, "sage", "forest")).toBe(true);
    expect(outingOf(game, "sage")).toMatchObject({ doing: "gather", basket: {}, kept: {}, done: false });
  });

  it("picks a lot of each thing the place holds every so many minutes, each at its own pace", () => {
    expect(gathersIn(forestKnown(), "forest", BERRY_MINUTES - 1)).toEqual({});
    expect(gathersIn(forestKnown(), "forest", BERRY_MINUTES)).toEqual({ berries: 1 });
    // Herbs are slower in the finding: the first lot of them comes with the berries well begun.
    expect(gathersIn(forestKnown(), "forest", HERB_MINUTES - 1)).toEqual({ berries: 2 });
    expect(gathersIn(forestKnown(), "forest", HERB_MINUTES)).toEqual({ berries: 2, herbs: 1 });
    // Minutes are summed a step at a time: a hair short of thirty is thirty.
    expect(gathersIn(forestKnown(), "forest", 3 * BERRY_MINUTES - 1e-9)).toEqual({ berries: 3, herbs: 1 });
    expect(gathersIn(forestKnown(), "lake", 100 * BERRY_MINUTES)).toEqual({});
    // Only what has been found there is picked: with the berries alone known, the herbs are walked past.
    const berriesOnly = forestFound();
    berriesOnly.finds.forest = ["berries"];
    expect(gathersIn(berriesOnly, "forest", HERB_MINUTES)).toEqual({ berries: 2 });
    expect(gathersIn(forestFound(), "forest", 100 * BERRY_MINUTES)).toEqual({});
  });

  it("picks no more than the basket holds, of all kinds together: what is picked first is what is in it", () => {
    expect(lotsIn(FULL)).toBe(BASKET_HOLDS);
    expect(gathersIn(forestKnown(), "forest", FULL_AT - 1)).toEqual({ berries: FULL.berries - 1, herbs: FULL.herbs });
    expect(gathersIn(forestKnown(), "forest", FULL_AT)).toEqual(FULL);
    expect(gathersIn(forestKnown(), "forest", 100 * BERRY_MINUTES)).toEqual(FULL);
  });

  it("goes on until the basket is full, and then she comes home with it, however long she might have stayed", () => {
    const game = forestKnown();
    gather(game, "sage", "forest", atMost(8 * HOUR, true));
    const outing = outingOf(game, "sage") as Outing;
    until(game, () => outing.state === "returning", 6 * HOUR);
    expect(outing.done).toBe(true);
    expect(game.clock).toBeCloseTo(NINE + 2 * walkMinutes("forest") + FULL_AT, 0);
    expect(person(game, "sage").carrying).toBe("berries");
    expect(game.stock).toMatchObject(NOTHING);
    // Each kind to its own shelf, one after another: the berries first, at the shelf they are kept on, which is not the flour's.
    until(game, () => person(game, "sage").carrying === "herbs", 60);
    expect(isAt(game.world, person(game, "sage"), game.world.plan.stores.berries)).toBe(true);
    expect(isAt(game.world, person(game, "sage"), game.world.plan.stores.flour)).toBe(false);
    expect(game.stock).toMatchObject(NOTHING);
    home(game, "sage", 60);
    expect(roomOf(game, "sage")).toBe("pantry");
    expect(isAt(game.world, person(game, "sage"), game.world.plan.stores.herbs)).toBe(true);
    expect(game.world.plan.stores.herbs).not.toBe(game.world.plan.stores.berries);
    expect(game.stock).toMatchObject(FULL);
    expect(game.flour).toBe(START_FLOUR);
    expect(person(game, "sage").carrying).toBeNull();
  });

  it("brings what she has when her time is up first: half an hour is three lots of berries and one of herbs", () => {
    const game = forestKnown();
    gather(game, "sage", "forest", atMost(30, true));
    home(game, "sage", 240);
    expect(game.stock).toMatchObject({ berries: 3, herbs: 1 });
  });

  it("comes home empty-handed from a stay too short to pick anything, and is done at the door", () => {
    const game = forestKnown();
    gather(game, "sage", "forest", atMost(BERRY_MINUTES - 1, true));
    home(game, "sage", 180);
    expect(roomOf(game, "sage")).toBe("hall");
    expect(game.stock).toMatchObject(NOTHING);
  });

  it("picks only what has been found there, and finds nothing by picking it: what is known is known already", () => {
    const game = forestFound();
    game.finds.forest = ["berries"];
    gather(game, "sage", "forest", atMost(30, true));
    home(game, "sage", 180);
    // Half an hour is three lots of berries; the herbs that grow there too are not hers to pick until they are found.
    expect(game.stock).toMatchObject({ berries: 3, herbs: 0 });
    expect(game.feats.filter((f) => f.what === "thing" && f.thing === "berries")).toEqual([]);
  });

  it("learns a little of the place the while: a quarter of what exploring would, a draw a minute for exploring's four", () => {
    const game = forestKnown();
    gather(game, "sage", "forest", atMost(20, true));
    home(game, "sage", 240);
    expect(game.explored.forest).toBeCloseTo(20 * GATHER_LEARNS, 6);
    expect(combed(game, "forest")).toBeCloseTo(20 / FOREST_POINTS, 6);
  });

  it("may find what is left to find by being about the place long enough: the herbs, by someone who came for the berries", () => {
    const game = forestFound();
    game.finds.forest = ["berries"];
    // (However long it takes: a basket at a time, until the herbs turn up. The forest's points last 328 minutes of gathering at the most.)
    for (let n = 0; n < 8 && !(game.finds.forest ?? []).includes("herbs"); n++) {
      gather(game, "sage", "forest", atMost(8 * HOUR, true));
      home(game, "sage", 12 * HOUR);
    }
    expect(game.finds.forest).toContain("herbs");
    expect(game.feats.filter((f) => f.what === "thing")).toMatchObject([{ who: "sage", place: "forest", thing: "herbs" }]);
  });

  it("is the only way anything is brought home: exploring picks nothing", () => {
    const game = forestKnown();
    explore(game, "sage", "forest", atMost(10, true));
    home(game, "sage", 240);
    expect(game.stock).toMatchObject(NOTHING);
  });
});

describe("bedtime", () => {
  const walk = walkMinutes("forest");

  it("told to be home before bed, she leaves in time to be at the door by bedtime, with what she has", () => {
    const game = forestKnown();
    game.clock = BEDTIME - 2 * HOUR;
    gather(game, "sage", "forest", { limit: 8 * HOUR, homeByBed: true });
    const outing = outingOf(game, "sage") as Outing;
    expect(outing).toMatchObject({ depart: BEDTIME - walk, back: BEDTIME });
    until(game, () => outing.state === "away", 90);
    until(game, () => inHouse(game, "sage"), 3 * HOUR);
    expect(game.clock).toBeCloseTo(BEDTIME, 0);
    // Two hours less two walks: forty-four minutes' picking, which is four lots of berries and one of herbs.
    expect(outing.basket).toEqual({ berries: Math.floor((2 * HOUR - 2 * walk) / BERRY_MINUTES), herbs: Math.floor((2 * HOUR - 2 * walk) / HERB_MINUTES) });
    expect(lotsOf(outing.basket)).toBe(5);
    // She turned for home without asking: the times are settled.
    expect(outing).toMatchObject({ homeward: true, done: true });
  });

  it("told nothing of bed, she is out overnight and the house does not wait up: with everyone else in bed the night passes", () => {
    const game = forestKnown();
    game.clock = BEDTIME - HOUR;
    gather(game, "sage", "forest", atMost(8 * HOUR, true));
    until(game, () => asleep(game), 3 * HOUR);
    expect(outingOf(game, "sage")?.state).toBe("away");
    expect(game.household.filter((id) => game.abed[id] === "in").sort()).toEqual(["evelyn", "master", "rose"]);
    until(game, () => game.clock >= DAY + WAKE, 30);
    expect(game.abed).toEqual({});
    // Her basket filled in the night: she is in when the house wakes, or soon after, and it is full.
    home(game, "sage", 2 * HOUR);
    expect(game.stock).toMatchObject(FULL);
  });

  it("what she finds in the night is reckoned when the house wakes: she turns for home then, and is in a walk later", () => {
    const game = forestKnown();
    game.clock = BEDTIME - 10;
    explore(game, "sage", "forest", atMost(8 * HOUR));
    const outing = outingOf(game, "sage") as Outing;
    until(game, () => game.clock >= DAY + WAKE, 4 * HOUR);
    run(game, 1);
    expect(game.places.caves).toBe("unknown");
    // (She asks what she is to do, having found it, and is told to come home.)
    expect(answer(game, "home")).toBe(true);
    run(game, 1);
    expect(outing.done).toBe(true);
    expect(inHouse(game, "sage")).toBe(false);
    until(game, () => inHouse(game, "sage"), 2 * HOUR);
    expect(game.clock).toBeCloseTo(DAY + WAKE + walk, -1);
  });

  it("the night waits for someone still on her way to the door, or in with what she bought", () => {
    const game = quiet();
    game.coin = 100;
    game.clock = BEDTIME - 1;
    sendToTown(game, "sage");
    game.clock = BEDTIME + 1;
    for (const id of ["evelyn", "rose", "master"]) game.abed[id] = "in";
    const outing = outingOf(game, "sage") as Outing;
    expect(outing.state).toBe("leaving");
    expect(asleep(game)).toBe(false);
    outing.state = "returning";
    expect(asleep(game)).toBe(false);
    outing.state = "away";
    expect(asleep(game)).toBe(true);
  });

  it("the day does not pass for an empty house: the night is only at night", () => {
    const game = forestKnown();
    for (const id of game.household) gather(game, id, "forest", atMost(2 * HOUR));
    until(game, () => game.household.every((id) => outingOf(game, id)?.state === "away"), 120);
    expect(asleep(game)).toBe(false);
    const clock = game.clock;
    run(game, 10);
    expect(game.clock).toBeCloseTo(clock + 10, 3);
  });

  it("and the night does pass for one, with everybody out", () => {
    const game = forestKnown();
    game.clock = BEDTIME - HOUR;
    for (const id of game.household) gather(game, id, "forest", atMost(8 * HOUR));
    until(game, () => asleep(game), 3 * HOUR);
    until(game, () => game.clock >= DAY + WAKE, 30);
  });
});
