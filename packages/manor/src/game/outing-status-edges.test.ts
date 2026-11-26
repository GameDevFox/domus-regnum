import { describe, expect, it } from "vitest";

import { outingStatus } from "./outing-status";
import { out } from "./outing-kit";
import { gameAt } from "./test-kit";
import type { Outing } from "./types";

// What someone on an outing is at (outing-status.ts), at the clocks where one thing gives way
// to the next, and for outings made up whole so that each is only what it says: bound for a
// place with nothing to do there, told to wait, sent to sell with nothing chosen to sell.

const ARRIVE = 100;
const DEPART = 160;
const BACK = 200;
/** An outing at a place: due there at 100, off home at 160, in at 200, and not turned for home. */
const at = (to: Outing["to"], over: Partial<Outing> = {}): Outing => ({ ...out(to, 0, 0, DEPART - ARRIVE), arrive: ARRIVE, depart: DEPART, back: BACK, homeward: false, ...over });
const statusAt = (outing: Outing, clock: number) => {
  const game = gameAt();
  game.clock = clock;
  return outingStatus(game, outing);
};

describe("the walk", () => {
  it("is out to a place the minutes it has left to go, and idle if there is nothing to do there", () => {
    expect(statusAt(at("forest", { doing: "gather" }), 40)).toEqual({ is: "walking", to: "forest", minutes: 60 });
    expect(statusAt(at("forest", { doing: null }), 40)).toEqual({ is: "walking", to: "forest", minutes: 60, idle: true });
  });

  it("is not idle on the way home, though nothing is chosen for her to do at the house", () => {
    expect(statusAt(at("manor", { doing: null }), 40)).toEqual({ is: "walking", to: "manor", minutes: 60 });
  });

  it("is home as soon as the clock is at the moment she sets off, and not a minute after", () => {
    expect(statusAt(at("forest", { homeward: true }), DEPART - 1)).toMatchObject({ is: "exploring" });
    expect(statusAt(at("forest", { homeward: true }), DEPART)).toEqual({ is: "walking", to: "manor", minutes: BACK - DEPART });
  });
});

describe("at a place", () => {
  it("is waiting, however she was sent, when she was told to stay", () => {
    expect(statusAt(at("forest", { doing: "explore", waits: true }), ARRIVE + 5)).toEqual({ is: "waiting", at: "forest" });
  });

  it("is waiting with nothing chosen to do, though she was not told to stay", () => {
    expect(statusAt(at("forest", { doing: null, waits: false }), ARRIVE + 5)).toEqual({ is: "waiting", at: "forest" });
  });

  it("is exploring when sent to explore, and not told to wait", () => {
    expect(statusAt(at("forest", { doing: "explore" }), ARRIVE + 5)).toEqual({ is: "exploring", at: "forest" });
  });

  it("is selling what she carries, the minutes until it is sold", () => {
    const selling = at("town", { doing: "sell", sells: "berries", basket: { berries: 4 } });
    expect(statusAt(selling, ARRIVE + 10)).toEqual({ is: "selling", at: "town", good: "berries", load: 4, minutes: DEPART - ARRIVE - 10 });
  });

  it("has nothing to sell when sent to sell with nothing chosen: she is not selling", () => {
    expect(statusAt(at("town", { doing: "sell", sells: null }), ARRIVE + 10)).toEqual({ is: "exploring", at: "town" });
  });

  it("is buying what she is to buy, a lot of it, the minutes until it is bought", () => {
    const buying = at("town", { doing: "buy", buys: "almanac" });
    expect(statusAt(buying, ARRIVE + 10)).toEqual({ is: "buying", at: "town", ware: "almanac", load: 1, minutes: DEPART - ARRIVE - 10 });
  });
});
