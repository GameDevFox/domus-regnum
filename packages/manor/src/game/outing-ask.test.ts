import { describe, expect, it } from "vitest";

import { asleep } from "./bedtime";
import { walkMinutes } from "./country";
import { HOME_NEXT, errandCost, outingOf, shoppingMinutes } from "./outing";
import { gather, goTo, sellInTown, sendToTown } from "./outing-send";
import { queueReturn } from "./outing-queue";
import { answer, tell } from "./outing-tell";
import { FULL, FULL_AT, atMost, forestKnown } from "./outing-kit";
import { outingStatus } from "./outing-status";
import { priceOf } from "./sales";
import { comeHome, home, inHouse, quiet, run, until } from "./test-kit";
import { BEDTIME, DAY, ERRAND_SACKS, HOUR, WAKE } from "./tuning";
import type { Game, Outing } from "./types";

// Someone out with nothing left to do asks what she is to do next, and time stands still until
// she is told; unless the return was asked for beforehand, or she must leave to be in by bed.

const TOWN = walkMinutes("town");
const sage = (game: Game): Outing => outingOf(game, "sage") as Outing;
/** Run until someone asks. */
const asked = (game: Game, within = 6 * HOUR): void => until(game, () => game.asks.length > 0, within);

describe("she asks what next", () => {
  it("with a ware bought: it is hers, its price was paid as she was sent, and she has not turned for home", () => {
    const game = quiet();
    game.coin = 100;
    sendToTown(game, "sage");
    expect(game.coin).toBe(100 - errandCost());
    asked(game);
    expect(game.asks).toEqual([{ who: "sage", place: "town", why: "done", did: { doing: "buy", ware: "flour" } }]);
    expect(game.clock).toBeCloseTo(sage(game).arrive + shoppingMinutes(), 0);
    expect(sage(game)).toMatchObject({ bought: { flour: ERRAND_SACKS }, buys: null, homeward: false, doing: null });
    expect(outingStatus(game, sage(game))).toEqual({ is: "asking", at: "town" });
    // Time stands still while she asks.
    const { clock } = game;
    run(game, 30);
    expect(game.clock).toBe(clock);
  });

  it("with goods sold: the coin is in her purse, and none of them is left in her basket", () => {
    const game = quiet();
    game.stock.herbs = 5;
    sellInTown(game, "sage", "herbs");
    asked(game);
    expect(game.asks).toEqual([{ who: "sage", place: "town", why: "done", did: { doing: "sell", good: "herbs" } }]);
    expect(sage(game)).toMatchObject({ purse: 5 * priceOf("herbs"), basket: {} });
  });

  it("with her basket full, however long she might have gathered", () => {
    const game = forestKnown();
    gather(game, "sage", "forest", atMost(8 * HOUR));
    asked(game);
    expect(game.asks).toEqual([{ who: "sage", place: "forest", why: "full", did: { doing: "gather" } }]);
    expect(game.clock).toBeCloseTo(sage(game).arrive + FULL_AT, 0);
    expect(sage(game).basket).toEqual(FULL);
  });

  it("with her time at it up, gathering or exploring: the limit is of the one thing", () => {
    const game = forestKnown();
    gather(game, "sage", "forest", atMost(30));
    asked(game);
    expect(game.asks).toEqual([{ who: "sage", place: "forest", why: "time", did: { doing: "gather" } }]);
    expect(game.clock).toBeCloseTo(sage(game).arrive + 30, 0);
    expect(sage(game).basket).toEqual({ berries: 3, herbs: 1 });
    // Told to explore, she has another thirty minutes at that, from now.
    const told = game.clock;
    expect(answer(game, "explore")).toBe(true);
    expect(sage(game).depart).toBeCloseTo(told + 30, 6);
    asked(game);
    expect(game.asks).toMatchObject([{ who: "sage", place: "forest" }]);
    // (Ten minutes of the way on is not as a rule enough to find it: but if it was, she asks having found it.)
    expect(["time", "found"]).toContain(game.asks[0].why);
  });

  it("come to a place she was only told to go to: with nothing to do there, she asks at once", () => {
    const game = forestKnown();
    expect(goTo(game, "sage", "forest")).toBe(true);
    expect(sage(game)).toMatchObject({ doing: null, depart: sage(game).arrive });
    asked(game);
    expect(game.asks).toEqual([{ who: "sage", place: "forest", why: "arrived" }]);
    expect(game.clock).toBeCloseTo(sage(game).arrive, 0);
    expect(game.explored.forest).toBeUndefined();
  });

  it("come to a place not yet found, she finds it and asks of that", () => {
    const game = quiet();
    goTo(game, "sage", "lake");
    asked(game);
    expect(game.asks).toEqual([{ who: "sage", place: "lake", why: "place" }]);
    expect(game.places.lake).toBe("found");
  });

  it("two of them, in turn: the first to ask is answered first, and the other asks after", () => {
    const game = forestKnown();
    gather(game, "sage", "forest", atMost(30));
    gather(game, "rose", "forest", atMost(30));
    asked(game);
    const first = game.asks[0].who;
    // (Both may ask in the same moment: then both questions stand, in the order they were asked.)
    expect(answer(game, "home")).toBe(true);
    expect(outingOf(game, first)?.homeward).toBe(true);
    asked(game, 60);
    const second = game.asks[0].who;
    expect(second).not.toBe(first);
    expect(new Set([first, second])).toEqual(new Set(["sage", "rose"]));
    expect(outingOf(game, second)?.homeward).toBe(false);
    expect(answer(game, "home")).toBe(true);
    expect(game.asks).toEqual([]);
    home(game, first, 2 * HOUR);
    home(game, second, 2 * HOUR);
  });
});

describe("she comes home without asking", () => {
  it("with the return asked for beforehand: when it is done, as she always did", () => {
    const game = forestKnown();
    gather(game, "sage", "forest", atMost(30, true));
    until(game, () => {
      expect(game.asks).toEqual([]);
      return outingOf(game, "sage") === undefined;
    }, 4 * HOUR);
    expect(game.stock).toMatchObject({ berries: 3, herbs: 1 });
  });

  it("asked for once she is out, and no longer: `queueReturn` sets it and clears it", () => {
    const game = quiet();
    game.coin = 100;
    sendToTown(game, "sage");
    expect(sage(game).done).toBe(false);
    expect(queueReturn(game, "sage", true)).toBe(true);
    expect(sage(game)).toMatchObject({ queue: [HOME_NEXT], done: true });
    until(game, () => {
      expect(game.asks).toEqual([]);
      return outingOf(game, "sage") === undefined;
    }, 4 * HOUR);
    // Asked for at sending and then cleared, she asks.
    sendToTown(game, "rose", "flour", true);
    expect(queueReturn(game, "rose", false)).toBe(true);
    asked(game);
    expect(game.asks).toEqual([{ who: "rose", place: "town", why: "done", did: { doing: "buy", ware: "flour" } }]);
    // Nobody out is nobody to ask it of.
    expect(queueReturn(game, "sage", true)).toBe(false);
  });

  it("told to be home before bed: a second thing begun in the evening is cut short so that she is in by bedtime", () => {
    const game = quiet();
    game.coin = 100;
    game.clock = BEDTIME - 3 * HOUR;
    // (Every shop in town found, and nothing else there: exploring it turns nothing up.)
    sendToTown(game, "sage");
    asked(game);
    expect(game.asks[0].why).toBe("done");
    expect(tell(game, "sage", "explore")).toBe(true);
    // Eight hours she might explore; she must leave by a walk before bedtime.
    expect(sage(game).depart).toBeCloseTo(BEDTIME - TOWN, 6);
    until(game, () => {
      expect(game.asks).toEqual([]);
      return inHouse(game, "sage");
    }, 3 * HOUR);
    // In at the door by bedtime, with the flour to carry through.
    expect(game.clock).toBeCloseTo(BEDTIME, 0);
    expect(sage(game)).toMatchObject({ state: "returning", bought: { flour: ERRAND_SACKS } });
  });

  it("told to be home before bed and waiting where she is: she leaves in time", () => {
    const game = forestKnown();
    game.clock = BEDTIME - 2 * HOUR;
    goTo(game, "sage", "forest", { limit: 8 * HOUR, homeByBed: true });
    asked(game);
    expect(answer(game, "stay")).toBe(true);
    until(game, () => {
      expect(game.asks).toEqual([]);
      return outingOf(game, "sage") === undefined;
    }, 3 * HOUR);
    expect(game.clock).toBeCloseTo(BEDTIME, 0);
  });
});

describe("at night", () => {
  it("nothing is asked from bedtime on, while the house is still going up to bed", () => {
    const game = quiet();
    game.coin = 100;
    // Her purchase is done a minute after bedtime.
    game.clock = BEDTIME + 1 - TOWN - shoppingMinutes();
    sendToTown(game, "sage", "flour");
    sage(game).terms.homeByBed = false;
    sage(game).bedBy = null;
    until(game, () => game.clock >= BEDTIME + 2, 3 * HOUR);
    expect(asleep(game)).toBe(false);
    expect(game.asks).toEqual([]);
  });

  it("nothing is asked: what is done in the night is reckoned when the house wakes, and she asks then", () => {
    const game = quiet();
    game.coin = 100;
    // Sent late, told nothing of bed: the purchase is done in the night.
    game.clock = BEDTIME - TOWN - 1;
    sendToTown(game, "sage", "flour");
    // (An errand from the house is sent on the usual terms, home before bed: here she is let stay out.)
    sage(game).terms.homeByBed = false;
    sage(game).bedBy = null;
    until(game, () => asleep(game), 3 * HOUR);
    expect(sage(game).arrive + shoppingMinutes()).toBeLessThan(DAY + WAKE);
    until(game, () => {
      expect(game.asks).toEqual([]);
      return game.clock >= DAY + WAKE;
    }, 30);
    asked(game, 5);
    expect(game.asks).toEqual([{ who: "sage", place: "town", why: "done", did: { doing: "buy", ware: "flour" } }]);
    expect(game.clock).toBeGreaterThanOrEqual(DAY + WAKE);
    comeHome(game, "sage");
  });
});
