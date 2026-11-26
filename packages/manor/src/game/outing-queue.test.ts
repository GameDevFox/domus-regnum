import { describe, expect, it } from "vitest";

import { walkMinutes } from "./country";
import { assign } from "./game";
import { HOME_NEXT, errandCost, outingOf } from "./outing";
import { explore, gather, goTo, sendToTown } from "./outing-send";
import { enqueue, queueReturn, unqueue, whyNotAdd } from "./outing-queue";
import { answer, callHome, cancel, choicesFor } from "./outing-tell";
import { stepsOf } from "./outing-steps";
import { FULL, FULL_AT, atMost, forestKnown } from "./outing-kit";
import { home, quiet, until } from "./test-kit";
import { BEDTIME, ERRAND_SACKS, HOUR } from "./tuning";
import type { Errand, Game, Outing } from "./types";

// Queuing several steps ahead: what she is to do after what she is at, in order. She goes on to
// each as the one before ends, and asks only when all of it has run out; what cannot be done when
// she comes to it stops her, and she asks, skipping nothing.

const HALF_HOUR = 30;
const sage = (game: Game): Outing => outingOf(game, "sage") as Outing;
const asked = (game: Game, within = 6 * HOUR): void => until(game, () => game.asks.length > 0, within);
const EXPLORE_FOREST: Errand = { to: "forest", doing: "explore" };
const GATHER_FOREST: Errand = { to: "forest", doing: "gather" };
const FLOUR: Errand = { to: "town", doing: "buy", ware: "flour" };
/** The forest known, coin to spend, and nobody keeping the shop, so that the coin changes only by what is bought. */
const ready = (): Game => {
  const game = forestKnown();
  assign(game, "rose", null);
  game.coin = 100;
  return game;
};

describe("adding a thing after what she is at", () => {
  it("for someone at home, sends her: the first press is a sending", () => {
    const game = ready();
    expect(enqueue(game, "sage", GATHER_FOREST, atMost(8 * HOUR))).toBe(true);
    expect(sage(game)).toMatchObject({ to: "forest", doing: "gather", queue: [] });
  });

  it("for someone out, puts it at the end of her queue, before the walk home, and pays for nothing yet", () => {
    const game = ready();
    gather(game, "sage", "forest", atMost(8 * HOUR, true));
    expect(enqueue(game, "sage", FLOUR, atMost(8 * HOUR))).toBe(true);
    expect(enqueue(game, "sage", EXPLORE_FOREST, atMost(8 * HOUR))).toBe(true);
    expect(sage(game).queue).toEqual([FLOUR, EXPLORE_FOREST, HOME_NEXT]);
    expect(game.coin).toBe(100);
  });

  it("is refused for someone asking, on her way home, or for a place not on the map; and the rest is asked when she comes to it", () => {
    const game = ready();
    game.coin = 0;
    gather(game, "sage", "forest", atMost(8 * HOUR));
    expect(whyNotAdd(game, "sage", { to: "caves", doing: "explore" }, atMost(HOUR))).toBe("nothing");
    expect(whyNotAdd(game, "sage", { to: "manor", doing: null }, atMost(HOUR))).toBe("nothing");
    // (No coin now: there may be when she comes to it.)
    expect(whyNotAdd(game, "sage", FLOUR, atMost(HOUR))).toBeNull();
    asked(game);
    expect(whyNotAdd(game, "sage", FLOUR, atMost(HOUR))).toBe("out");
    callHome(game, "sage");
    expect(enqueue(game, "sage", FLOUR, atMost(HOUR))).toBe(false);
  });
});

describe("going on to what is queued", () => {
  it("at the same place: she begins it at once, without asking", () => {
    const game = ready();
    gather(game, "sage", "forest", atMost(8 * HOUR));
    enqueue(game, "sage", EXPLORE_FOREST, atMost(HOUR));
    const { arrive } = sage(game);
    until(game, () => sage(game).doing === "explore", 6 * HOUR);
    expect(game.asks).toEqual([]);
    expect(sage(game).basket).toEqual(FULL);
    expect(game.clock).toBeCloseTo(arrive + FULL_AT, 0);
    expect(sage(game).queue).toEqual([]);
  });

  it("elsewhere: she walks on there, past the house without going in, and the ware is paid for when she comes to it", () => {
    const game = ready();
    gather(game, "sage", "forest", atMost(8 * HOUR));
    enqueue(game, "sage", FLOUR, atMost(8 * HOUR));
    until(game, () => sage(game).to === "town", 6 * HOUR);
    // On her way: going there first, the purchase still to come.
    expect(sage(game)).toMatchObject({ doing: null, state: "away", queue: [FLOUR], turned: { via: ["forest", "manor", "town"] } });
    expect(game.coin).toBe(100);
    until(game, () => sage(game).doing === "buy", 2 * HOUR);
    expect(game.coin).toBe(100 - errandCost());
    asked(game);
    expect(game.asks).toEqual([{ who: "sage", place: "town", why: "done", did: { doing: "buy", ware: "flour" } }]);
    expect(sage(game)).toMatchObject({ bought: { flour: ERRAND_SACKS }, basket: FULL });
  });

  it("asks only when all of it has run out; and, the walk home queued last, comes home without asking", () => {
    const game = ready();
    gather(game, "sage", "forest", atMost(8 * HOUR));
    enqueue(game, "sage", FLOUR, atMost(8 * HOUR));
    queueReturn(game, "sage", true);
    until(game, () => {
      expect(game.asks).toEqual([]);
      return outingOf(game, "sage") === undefined;
    }, 8 * HOUR);
    expect(game.stock).toMatchObject(FULL);
  });

  it("cannot be done when she comes to it: she stops there and asks why, and skips nothing", () => {
    const game = ready();
    gather(game, "sage", "forest", atMost(8 * HOUR));
    enqueue(game, "sage", FLOUR, atMost(8 * HOUR));
    enqueue(game, "sage", EXPLORE_FOREST, atMost(HOUR));
    game.coin = 0;
    asked(game);
    expect(game.asks).toEqual([{ who: "sage", place: "forest", why: "stuck", did: { doing: "gather" }, stuck: { next: FLOUR, why: "coin", plain: "full" } }]);
    expect(sage(game).queue).toEqual([FLOUR, EXPLORE_FOREST]);
    // Told to go on with it, she cannot yet; with coin, she goes.
    expect(choicesFor(game, "sage").find((c) => c.told === "on")).toEqual({ told: "on", why: "coin" });
    game.coin = 100;
    expect(answer(game, "on")).toBe(true);
    expect(sage(game)).toMatchObject({ to: "town", queue: [FLOUR, EXPLORE_FOREST] });
  });

  it("with nothing found there to gather when she comes to it, she asks", () => {
    const game = ready();
    game.finds.forest = [];
    sendToTown(game, "sage");
    enqueue(game, "sage", GATHER_FOREST, atMost(HOUR));
    asked(game);
    expect(game.asks[0]).toMatchObject({ why: "stuck", stuck: { next: GATHER_FOREST, why: "nothing" } });
  });

  it("sent to do something at a place not yet found, she asks on finding it, and what she was sent for waits first in her queue: going on does it", () => {
    const game = quiet();
    game.coin = 100;
    explore(game, "sage", "forest", atMost(2 * HOUR));
    enqueue(game, "sage", FLOUR, atMost(HOUR));
    asked(game);
    expect(game.asks).toEqual([{ who: "sage", place: "forest", why: "place" }]);
    expect(sage(game).queue).toEqual([{ ...EXPLORE_FOREST, carried: true }, FLOUR]);
    expect(choicesFor(game, "sage").find((c) => c.told === "on")).toEqual({ told: "on", why: null });
    // Her steps still show it: after her asking, the exploring, and then the town.
    expect(stepsOf(game, "sage").map((step) => (step.is === "then" ? `then:${step.doing}` : step.is))).toEqual(["walk", "ask", "then:explore", "then:buy"]);
    expect(answer(game, "on")).toBe(true);
    // (On the terms she was sent on: as long as she may stay, from now.)
    expect(sage(game)).toMatchObject({ to: "forest", doing: "explore", queue: [FLOUR], depart: game.clock + 2 * HOUR });
  });

  it("sent only to go to a place not yet found, nothing waits for her on finding it: going on is not offered", () => {
    const game = quiet();
    goTo(game, "sage", "forest", atMost(HOUR));
    asked(game);
    expect(game.asks).toEqual([{ who: "sage", place: "forest", why: "place" }]);
    expect(sage(game).queue).toEqual([]);
    expect(choicesFor(game, "sage").some((c) => c.told === "on")).toBe(false);
  });

  it("on finding a place, she asks as she always has, and her queue waits for her to be told to go on", () => {
    const game = quiet();
    game.coin = 100;
    goTo(game, "sage", "forest", atMost(HOUR));
    enqueue(game, "sage", FLOUR, atMost(HOUR));
    asked(game);
    expect(game.asks).toEqual([{ who: "sage", place: "forest", why: "place" }]);
    expect(sage(game).queue).toEqual([FLOUR]);
    expect(answer(game, "on")).toBe(true);
    expect(sage(game)).toMatchObject({ to: "town", doing: null, queue: [FLOUR] });
  });

  // Found by a review, 2026-11-16: the step taken out was any exploring or gathering first in line there, the player's own among them.
  it("sent only to go, with exploring the place queued by the player, told to go elsewhere on finding it, she keeps that step", () => {
    const game = quiet();
    goTo(game, "sage", "forest", atMost(4 * HOUR));
    enqueue(game, "sage", EXPLORE_FOREST, atMost(HOUR));
    asked(game);
    expect(sage(game).queue).toEqual([EXPLORE_FOREST]);
    expect(answer(game, { go: "town" })).toBe(true);
    expect(sage(game)).toMatchObject({ to: "town", queue: [EXPLORE_FOREST] });
  });

  it("with only a going to where she is queued, going on is not offered: there is nothing to go on to, and the question stands", () => {
    const game = quiet();
    goTo(game, "sage", "forest", atMost(HOUR));
    enqueue(game, "sage", { to: "forest", doing: null }, atMost(HOUR));
    asked(game);
    expect(game.asks).toEqual([{ who: "sage", place: "forest", why: "place" }]);
    expect(choicesFor(game, "sage").some((c) => c.told === "on")).toBe(false);
    expect(answer(game, "on")).toBe(false);
    expect(game.asks).toEqual([{ who: "sage", place: "forest", why: "place" }]);
  });

  it("with a going to where she is queued before something else, going on skips it and goes on to the rest", () => {
    const game = quiet();
    game.coin = 100;
    goTo(game, "sage", "forest", atMost(HOUR));
    enqueue(game, "sage", { to: "forest", doing: null }, atMost(HOUR));
    enqueue(game, "sage", FLOUR, atMost(HOUR));
    asked(game);
    expect(choicesFor(game, "sage").find((c) => c.told === "on")).toEqual({ told: "on", why: null });
    expect(answer(game, "on")).toBe(true);
    expect(sage(game)).toMatchObject({ to: "town", doing: null, queue: [FLOUR] });
  });

  it("with a going to where she is and then the walk home queued, going on is not offered: that is told as coming home", () => {
    const game = quiet();
    goTo(game, "sage", "forest", atMost(HOUR, true));
    enqueue(game, "sage", { to: "forest", doing: null }, atMost(HOUR));
    asked(game);
    expect(sage(game).queue).toEqual([{ to: "forest", doing: null }, HOME_NEXT]);
    expect(choicesFor(game, "sage").some((c) => c.told === "on")).toBe(false);
  });
});

describe("what drops or takes out the queue", () => {
  it("to be home before bed she turns for home, and what is left of it is dropped", () => {
    const game = ready();
    // (Half an hour there before she must leave: too little to fill her basket.)
    game.clock = BEDTIME - 2 * walkMinutes("forest") - HALF_HOUR;
    gather(game, "sage", "forest", { limit: 8 * HOUR, homeByBed: true });
    enqueue(game, "sage", EXPLORE_FOREST, atMost(8 * HOUR));
    enqueue(game, "sage", FLOUR, atMost(8 * HOUR));
    until(game, () => sage(game).homeward, 4 * HOUR);
    expect(game.asks).toEqual([]);
    expect(sage(game).queue).toEqual([]);
    home(game, "sage", 4 * HOUR);
  });

  it("cancelling what she is at goes on to the next; on the road, with the walk home next, she turns for home where she is", () => {
    const game = ready();
    gather(game, "sage", "forest", atMost(8 * HOUR));
    enqueue(game, "sage", EXPLORE_FOREST, atMost(HOUR));
    until(game, () => game.clock >= sage(game).arrive + 15, 3 * HOUR);
    expect(cancel(game, "sage")).toBe(true);
    expect(sage(game)).toMatchObject({ doing: "explore", queue: [] });
    expect(game.asks).toEqual([]);
    // On the road.
    sendToTown(game, "rose", "flour", true);
    until(game, () => outingOf(game, "rose")?.state === "away" && outingOf(game, "rose")?.left !== null, HOUR);
    expect(cancel(game, "rose")).toBe(true);
    expect(outingOf(game, "rose")).toMatchObject({ to: "manor", homeward: true, queue: [] });
    expect(game.coin).toBe(100);
  });

  it("a step is taken out by its place in the queue; calling her home drops it all", () => {
    const game = ready();
    gather(game, "sage", "forest", atMost(8 * HOUR));
    enqueue(game, "sage", FLOUR, atMost(HOUR));
    enqueue(game, "sage", EXPLORE_FOREST, atMost(HOUR));
    expect(unqueue(game, "sage", 0)).toBe(true);
    expect(sage(game).queue).toEqual([EXPLORE_FOREST]);
    expect(unqueue(game, "sage", 1)).toBe(false);
    until(game, () => sage(game).state === "away", HOUR);
    callHome(game, "sage");
    expect(sage(game).queue).toEqual([]);
  });

  it("asking because what is queued next cannot be done, that step taken out: her question is about what is next now", () => {
    const game = ready();
    game.coin = errandCost();
    const GLOVES: Errand = { to: "town", doing: "buy", ware: "gloves" };
    game.shops.push("miller", "clothes");
    sendToTown(game, "sage");
    enqueue(game, "sage", GLOVES, atMost(HOUR));
    enqueue(game, "sage", { to: "forest", doing: "explore" }, atMost(HOUR));
    enqueue(game, "sage", GATHER_FOREST, atMost(HOUR));
    asked(game);
    expect(game.asks[0]).toMatchObject({ why: "stuck", stuck: { next: GLOVES, why: "coin" } });
    // The gloves taken out, exploring the forest is next, and can be done: she is stuck no longer, and asks as she would have, with ⏭️ to go on.
    expect(unqueue(game, "sage", 0)).toBe(true);
    expect(game.asks).toEqual([{ who: "sage", place: "town", why: "done", did: { doing: "buy", ware: "flour" } }]);
    expect(choicesFor(game, "sage").find((c) => c.told === "on")).toEqual({ told: "on", why: null });
    // (Asking plainly, she is stuck on nothing: a step taken out leaves the question as it is, and ⏭️ says why it cannot go on.)
    game.finds.forest = [];
    expect(unqueue(game, "sage", 0)).toBe(true);
    expect(game.asks).toEqual([{ who: "sage", place: "town", why: "done", did: { doing: "buy", ware: "flour" } }]);
    expect(choicesFor(game, "sage").find((c) => c.told === "on")).toEqual({ told: "on", why: "nothing" });
  });

  it("asking stuck, the step taken out and something else next that cannot be done: she is stuck on that", () => {
    const game = ready();
    game.coin = 0;
    game.shops.push("miller", "books");
    explore(game, "sage", "forest", atMost(HALF_HOUR));
    enqueue(game, "sage", FLOUR, atMost(HOUR));
    enqueue(game, "sage", { to: "town", doing: "buy", ware: "almanac" }, atMost(HOUR));
    asked(game);
    expect(game.asks[0]).toMatchObject({ why: "stuck", stuck: { next: FLOUR, why: "coin" } });
    expect(unqueue(game, "sage", 0)).toBe(true);
    expect(game.asks[0]).toMatchObject({ why: "stuck", stuck: { next: { to: "town", doing: "buy", ware: "almanac" } } });
    // The last taken out, nothing is queued: she asks as she would have.
    expect(unqueue(game, "sage", 0)).toBe(true);
    expect(game.asks).toEqual([{ who: "sage", place: "forest", why: "time", did: { doing: "explore" } }]);
  });

  it("her steps list all that is queued, in order, each by its place in the queue, the walk home last", () => {
    const game = ready();
    gather(game, "sage", "forest", atMost(8 * HOUR, true));
    enqueue(game, "sage", FLOUR, atMost(HOUR));
    expect(stepsOf(game, "sage")).toEqual([
      { is: "walk", to: "forest", state: "now" },
      { is: "do", doing: "gather", at: "forest", ware: null, good: null, state: "next" },
      { is: "then", doing: "buy", at: "town", ware: "flour", good: null, index: 0, state: "next" },
      { is: "home", state: "next" },
    ]);
  });
});
