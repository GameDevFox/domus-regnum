import { describe, expect, it } from "vitest";

import { walkMinutes, wayBetween } from "./country";
import { moreToFind } from "./discovery";
import { USUAL_TERMS, doingsAt, seeksAt, timesOf } from "./outing";
import { explore, gather, sendToTown, whyNotSend } from "./outing-send";
import { atMost, forestFound, forestKnown } from "./outing-kit";
import type { Terms } from "./types";
import { NINE, quiet, until } from "./test-kit";
import { BEDTIME, HOUR, OUTING_LIMITS } from "./tuning";

// An outing to explore a place or gather in it. She is sent to do a thing, not for a length of
// time: it is done when it is done, or when she has been at it as long as she may; then she
// asks what next, or comes home if that was asked for, and she is home in time for bed if she
// was told to be. The walk there and back is before and after.

describe("the way from one place to another", () => {
  it("is by the ways there are, turning off where the two ways from the house part", () => {
    expect(wayBetween("manor", "caves")).toEqual(["manor", "forest", "caves"]);
    expect(wayBetween("caves", "manor")).toEqual(["caves", "forest", "manor"]);
    expect(wayBetween("forest", "lake")).toEqual(["forest", "manor", "lake"]);
    expect(wayBetween("caves", "forest")).toEqual(["caves", "forest"]);
    expect(wayBetween("forest", "caves")).toEqual(["forest", "caves"]);
    expect(wayBetween("town", "town")).toEqual(["town"]);
  });
});

describe("what can be done where", () => {
  it("is buying flour in town, exploring a place not yet found, and nothing at home", () => {
    const game = quiet();
    // (With every shop in the town found: something is bought there, or sold at its stalls; and it is explored still, for whatever there may be.)
    expect(doingsAt(game, "town")).toEqual(["buy", "sell", "explore"]);
    expect(doingsAt(game, "forest")).toEqual(["explore"]);
    expect(doingsAt(game, "manor")).toEqual([]);
  });

  it("is gathering too, once something that can be gathered has been found there: finding the place is not finding what grows in it", () => {
    const game = forestFound();
    expect(doingsAt(game, "forest")).toEqual(["explore"]);
    game.finds.forest = ["herbs"];
    expect(doingsAt(game, "forest")).toEqual(["explore", "gather"]);
  });

  it("is exploring anywhere but home, whether or not anything is left to find: what is hidden is not known to be left", () => {
    const game = forestKnown();
    game.places.lake = "found";
    // The lake has no way on and holds nothing that is seen: it is explored all the same.
    expect(doingsAt(game, "lake")).toEqual(["explore"]);
    // In the forest the way on is still to be found; once it is, there is exploring still, and gathering.
    expect(doingsAt(game, "forest")).toEqual(["explore", "gather"]);
    game.places.caves = "unknown";
    expect(moreToFind(game, "forest")).toBe(false);
    expect(doingsAt(game, "forest")).toEqual(["explore", "gather"]);
    expect(doingsAt(game, "caves")).toEqual(["explore"]);
  });
});

describe("what exploring is out to find", () => {
  it("is the place itself, while it has not been found; then no one thing: what it holds turns up in no set order", () => {
    const game = quiet();
    expect(seeksAt(game, "forest")).toBe("forest");
    game.places.forest = "found";
    expect(seeksAt(game, "forest")).toBeNull();
    game.places.caves = "unknown";
    expect(seeksAt(game, "caves")).toBe("caves");
  });
});

describe("how long she may be", () => {
  const walk = walkMinutes("forest");

  it("is a walk there, as long as she may stay, and a walk home, at the latest", () => {
    expect(timesOf(NINE, "forest", atMost(60))).toEqual({ arrive: NINE + walk, depart: NINE + walk + 60, back: NINE + walk + 60 + walk });
  });

  it("is cut short, told to be home before bed, so that she is at the door by bedtime: a place farther off is left the earlier", () => {
    const evening = BEDTIME - 3 * HOUR;
    const terms: Terms = { limit: 8 * HOUR, homeByBed: true };
    expect(timesOf(evening, "forest", terms)).toMatchObject({ depart: BEDTIME - walk, back: BEDTIME });
    const far = walkMinutes("caves");
    expect(timesOf(evening, "caves", terms)).toMatchObject({ depart: BEDTIME - far, back: BEDTIME });
    expect(far).toBeGreaterThan(walk);
    // With time enough before bed, it is her time there that ends it.
    expect(timesOf(NINE, "forest", { limit: 60, homeByBed: true })).toEqual(timesOf(NINE, "forest", atMost(60)));
  });

  it("is, unless told otherwise, as long as it takes up to the longest there is, and home before bed", () => {
    expect(USUAL_TERMS).toEqual({ limit: OUTING_LIMITS[OUTING_LIMITS.length - 1], homeByBed: true, thenHome: false });
  });
});

describe("sending someone out", () => {
  it("costs no coin, and wants none, where buying flour does", () => {
    const game = quiet();
    game.coin = 0;
    expect(whyNotSend(game, "sage", "explore")).toBeNull();
    expect(whyNotSend(game, "sage", "buy")).toBe("coin");
    expect(whyNotSend(game, "sage")).toBe("coin");
    expect(explore(game, "sage", "forest")).toBe(true);
    expect(game.coin).toBe(0);
  });

  it("is only to a place on the map, only for what can be done there, and only for some time", () => {
    const game = quiet();
    expect(explore(game, "sage", "caves")).toBe(false);
    expect(explore(game, "sage", "manor")).toBe(false);
    expect(explore(game, "sage", "forest", atMost(0))).toBe(false);
    expect(gather(game, "sage", "forest")).toBe(false);
    expect(game.outings).toEqual([]);
  });

  it("is not, to buy, of someone at work at a place; nor of anyone at night", () => {
    const game = forestFound();
    explore(game, "sage", "forest");
    const outing = game.outings[0];
    until(game, () => game.clock >= outing.arrive + 1, 90);
    expect(sendToTown(game, "sage")).toBe(false);
    expect(whyNotSend(game, "sage", "buy")).toBe("out");
    game.clock = BEDTIME;
    expect(explore(game, "rose", "lake", atMost(60))).toBe(false);
    expect(game.outings.length).toBe(1);
  });

  it("is not, told to be home before bed, to a place she would have to leave before she reached it", () => {
    const game = forestFound();
    const walk = walkMinutes("forest");
    const terms: Terms = { limit: 60, homeByBed: true };
    game.clock = BEDTIME - 2 * walk - 1;
    expect(whyNotSend(game, "sage", "explore", { to: "forest", terms })).toBeNull();
    game.clock = BEDTIME - 2 * walk;
    expect(whyNotSend(game, "sage", "explore", { to: "forest", terms })).toBe("late");
    expect(explore(game, "sage", "forest", terms)).toBe(false);
    // Told nothing of bed, she goes.
    expect(explore(game, "sage", "forest", atMost(60))).toBe(true);
  });
});
