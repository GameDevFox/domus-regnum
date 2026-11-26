import { describe, expect, it } from "vitest";

import { HOME_NEXT } from "./outing";
import { out } from "./outing-kit";
import { stepsOf } from "./outing-steps";
import { gameAt } from "./test-kit";
import type { Game, Outing } from "./types";

// An outing as a short list of steps (outing-steps.ts), for outings made up whole: which of
// them is under way at the clock where she arrives and where she sets off, what is said of
// her while she is on the property, and what is shown of what is queued.

const ARRIVE = 100;
const DEPART = 160;
const BACK = 200;
/** Sage's outing to a place: due there at 100, off home at 160, in at 200; not turned for home, and not asked about. */
const sent = (to: Outing["to"], over: Partial<Outing> = {}): Outing => ({ ...out(to, 0, 0, DEPART - ARRIVE), arrive: ARRIVE, depart: DEPART, back: BACK, homeward: false, ...over });
/** A game with the outing in it at a clock. */
const at = (outing: Outing, clock: number): Game => {
  const game = gameAt();
  game.clock = clock;
  game.outings.push(outing);
  return game;
};

describe("the steps of someone out on the road", () => {
  it("are the walk to the place, and what she is to do there, to come", () => {
    expect(stepsOf(at(sent("forest"), 50), "sage")).toEqual([
      { is: "walk", to: "forest", state: "now" },
      { is: "do", doing: "explore", at: "forest", ware: null, good: null, state: "next" },
    ]);
  });

  it("have the walk done and the doing under way from the moment she is due there", () => {
    expect(stepsOf(at(sent("forest"), ARRIVE - 1), "sage")[0]).toMatchObject({ is: "walk", state: "now" });
    expect(stepsOf(at(sent("forest"), ARRIVE), "sage")).toEqual([
      { is: "walk", to: "forest", state: "done" },
      { is: "do", doing: "explore", at: "forest", ware: null, good: null, state: "now" },
    ]);
  });

  it("have the walk still to be done for someone not yet out of the door, whatever the clock", () => {
    const leaving = sent("forest", { state: "leaving" });
    expect(stepsOf(at(leaving, ARRIVE + 30), "sage")[0]).toEqual({ is: "walk", to: "forest", state: "now" });
  });

  it("are only the walk home for someone coming in, or in and carrying, or bound for home", () => {
    const home = [{ is: "home", state: "now" }];
    expect(stepsOf(at(sent("forest", { state: "coming" }), 50), "sage")).toEqual(home);
    expect(stepsOf(at(sent("forest", { state: "returning" }), 50), "sage")).toEqual(home);
    expect(stepsOf(at(sent("manor"), 50), "sage")).toEqual(home);
  });

  it("are nothing for someone who is not out", () => {
    expect(stepsOf(gameAt(), "sage")).toEqual([]);
  });
});

describe("what she is waiting on at the place", () => {
  it("is for the answer, while she asks, and not once she has set off home", () => {
    const asking = (outing: Outing, clock: number): Game => {
      const game = at(outing, clock);
      game.asks.push({ who: "sage", place: outing.to, why: "done" });
      return game;
    };
    expect(stepsOf(asking(sent("forest"), ARRIVE + 5), "sage").map((s) => s.is)).toEqual(["walk", "do", "ask"]);
    expect(stepsOf(asking(sent("forest", { homeward: true }), ARRIVE + 5), "sage").map((s) => s.is)).toEqual(["walk", "do", "home"]);
  });

  it("is for what she is told, while she waits there, and only once she is there", () => {
    expect(stepsOf(at(sent("forest", { waits: true, doing: null }), ARRIVE + 5), "sage").map((s) => s.is)).toEqual(["walk", "wait"]);
    expect(stepsOf(at(sent("forest", { waits: true, doing: null }), ARRIVE - 5), "sage").map((s) => s.is)).toEqual(["walk"]);
    expect(stepsOf(at(sent("forest", { waits: true, doing: null, homeward: true }), ARRIVE + 5), "sage").map((s) => s.is)).toEqual(["walk", "home"]);
  });
});

describe("what is queued after it", () => {
  it("is each errand by its place in the queue, and the walk home as it is", () => {
    const outing = sent("forest", { queue: [{ to: "town", doing: "buy", ware: "treatise" }, { to: "lake", doing: "explore" }, HOME_NEXT] });
    expect(stepsOf(at(outing, 50), "sage").slice(2)).toEqual([
      { is: "then", doing: "buy", at: "town", ware: "treatise", good: null, index: 0, state: "next" },
      { is: "then", doing: "explore", at: "lake", ware: null, good: null, index: 1, state: "next" },
      { is: "home", state: "next" },
    ]);
  });

  it("buys flour when no ware is named, and names a ware only for a purchase", () => {
    const outing = sent("forest", { queue: [{ to: "town", doing: "buy" }, { to: "town", doing: "sell", good: "berries", ware: "almanac" }] });
    const [buy, sell] = stepsOf(at(outing, 50), "sage").slice(2);
    expect(buy).toMatchObject({ doing: "buy", ware: "flour", good: null });
    expect(sell).toMatchObject({ doing: "sell", ware: null, good: "berries" });
  });
});

describe("the walk home", () => {
  it("is to come while she is at the place, and under way from the moment she sets off", () => {
    expect(stepsOf(at(sent("forest", { homeward: true }), DEPART - 1), "sage").at(-1)).toEqual({ is: "home", state: "next" });
    expect(stepsOf(at(sent("forest", { homeward: true }), DEPART), "sage").at(-1)).toEqual({ is: "home", state: "now" });
  });
});
