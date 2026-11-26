import { describe, expect, it } from "vitest";

import { walkMinutes } from "./country";
import { assign } from "./game";
import { errandCost, outingOf } from "./outing";
import { explore, gather, goTo, sendToTown, whyNotSend } from "./outing-send";
import { answer, callHome, cancel, tell } from "./outing-tell";
import { stepsOf } from "./outing-steps";
import { atMost, forestKnown } from "./outing-kit";
import { whereabouts } from "./road";
import { home, inHouse, quiet, run, until } from "./test-kit";
import { ERRAND_SACKS, HOUR, START_FLOUR } from "./tuning";
import type { Game, Outing } from "./types";

// Calling someone home, cancelling what she is to do, sending her elsewhere while she is out,
// giving her a job at the house; and her steps, as they are listed for whoever shows them.

const FOREST = walkMinutes("forest");
const sage = (game: Game): Outing => outingOf(game, "sage") as Outing;
const asked = (game: Game, within = 6 * HOUR): void => until(game, () => game.asks.length > 0, within);
/** Run until she is out at the gate and so far along her road there, from 0 to 1. */
const along = (game: Game, share: number): void => until(game, () => sage(game).state === "away" && game.clock >= (sage(game).left ?? Infinity) + share * (sage(game).arrive - (sage(game).left ?? 0)), 3 * HOUR);
/** A little way along: out at the gate, and not yet there. */
const SETTING_OUT = 0.1;
const HALF_WAY = 0.5;
/** A game with coin to spend and nobody keeping the shop, so that the coin changes only by what is bought. */
const shut = (): Game => {
  const game = quiet();
  assign(game, "rose", null);
  game.coin = 100;
  return game;
};

describe("calling her home", () => {
  it("on the road out: she turns round where she is and walks home from there, and never reaches the place", () => {
    const game = quiet();
    explore(game, "sage", "forest");
    along(game, HALF_WAY);
    const turned = game.clock;
    expect(callHome(game, "sage")).toBe(true);
    expect(sage(game)).toMatchObject({ to: "manor", homeward: true, doing: null, turned: { via: ["manor"] } });
    expect(sage(game).arrive - turned).toBeLessThan(FOREST);
    expect(whereabouts(sage(game), game.clock)).toMatchObject({ from: "manor", to: "forest" });
    home(game, "sage", 2 * HOUR);
    expect(game.places.forest).toBe("unknown");
    expect(game.clock - turned).toBeLessThan(FOREST);
  });

  it("at a place, at work: she leaves now, with what she has", () => {
    const game = forestKnown();
    gather(game, "sage", "forest", atMost(8 * HOUR));
    until(game, () => (sage(game).basket.berries ?? 0) >= 2, 3 * HOUR);
    expect(callHome(game, "sage")).toBe(true);
    expect(sage(game)).toMatchObject({ homeward: true, depart: game.clock });
    home(game, "sage", 2 * HOUR);
    expect(game.stock.berries).toBe(2);
  });

  it("mid-purchase: the ware is not bought, and its price is the house's again", () => {
    const game = shut();
    sendToTown(game, "sage");
    until(game, () => game.clock >= sage(game).arrive + 5, 3 * HOUR);
    expect(game.coin).toBe(100 - errandCost());
    expect(callHome(game, "sage")).toBe(true);
    expect(game.coin).toBe(100);
    home(game, "sage", 2 * HOUR);
    expect(game.flour).toBe(START_FLOUR);
  });

  it("asking: it is as being told to come home", () => {
    const game = forestKnown();
    goTo(game, "sage", "forest");
    asked(game);
    expect(callHome(game, "sage")).toBe(true);
    expect(game.asks).toEqual([]);
    expect(sage(game).homeward).toBe(true);
  });

  it("not yet set off for the door: she goes nowhere, and the coin is the house's again", () => {
    const game = shut();
    sendToTown(game, "sage");
    expect(callHome(game, "sage")).toBe(true);
    expect(game.outings).toEqual([]);
    expect(game.coin).toBe(100);
  });

  it("does nothing for someone coming up the drive, or home", () => {
    const game = forestKnown();
    gather(game, "sage", "forest", atMost(10, true));
    until(game, () => sage(game).state === "coming", 3 * HOUR);
    expect(callHome(game, "sage")).toBe(false);
    expect(callHome(game, "rose")).toBe(false);
  });
});

describe("cancelling", () => {
  it("on her way: she goes on, comes there with nothing to do, and asks; a purchase not made is refunded", () => {
    const game = shut();
    sendToTown(game, "sage", "flour");
    along(game, SETTING_OUT);
    expect(cancel(game, "sage")).toBe(true);
    expect(game.coin).toBe(100);
    expect(sage(game)).toMatchObject({ to: "town", doing: null, buys: null, queue: [] });
    asked(game);
    expect(game.asks).toEqual([{ who: "sage", place: "town", why: "arrived" }]);
  });

  it("at work: she stops now and asks; and asking, there is nothing to cancel", () => {
    const game = forestKnown();
    gather(game, "sage", "forest", atMost(8 * HOUR));
    until(game, () => game.clock >= sage(game).arrive + 15, 3 * HOUR);
    expect(cancel(game, "sage")).toBe(true);
    expect(game.asks).toEqual([{ who: "sage", place: "forest", why: "stopped", did: { doing: "gather" } }]);
    expect(sage(game).basket).toEqual({ berries: 1 });
    expect(cancel(game, "sage")).toBe(false);
    expect(cancel(game, "rose")).toBe(false);
  });
});

describe("sent elsewhere while she is out", () => {
  it("mid-errand: the price of what she was to buy is the house's again, and what she is sent to buy now leaves it", () => {
    const game = shut();
    sendToTown(game, "sage");
    along(game, SETTING_OUT);
    expect(explore(game, "sage", "forest")).toBe(true);
    expect(game.coin).toBe(100);
    expect(sendToTown(game, "sage", "boots")).toBe(true);
    expect(game.coin).toBe(70);
    expect(sage(game)).toMatchObject({ to: "town", doing: "buy", buys: "boots" });
    // …but not again to what she is already on her way to do.
    expect(whyNotSend(game, "sage", "buy", { to: "town", terms: sage(game).terms }, "boots")).toBe("out");
    expect(sendToTown(game, "sage", "boots")).toBe(false);
  });

  it("only to go, from the house or from the road: she arrives with nothing to do, and asks", () => {
    const game = forestKnown();
    expect(goTo(game, "sage", "forest")).toBe(true);
    along(game, SETTING_OUT);
    expect(goTo(game, "sage", "lake")).toBe(true);
    expect(sage(game)).toMatchObject({ to: "lake", doing: null, turned: { via: ["manor", "lake"] } });
    asked(game);
    expect(game.asks).toEqual([{ who: "sage", place: "lake", why: "place" }]);
    expect(game.places.forest).toBe("found");
  });
});

describe("given a job at the house while she is out", () => {
  it("exploring where there is nothing left to find, she is called home, and takes it up once she is in", () => {
    const game = forestKnown();
    game.places.caves = "unknown";
    explore(game, "sage", "forest", atMost(8 * HOUR));
    until(game, () => game.clock >= sage(game).arrive + 10, 3 * HOUR);
    expect(assign(game, "sage", "garden")).toBe(true);
    expect(sage(game).homeward).toBe(true);
    home(game, "sage", 2 * HOUR);
    until(game, () => game.tasks.sage?.job === "garden", 5);
  });

  it("only the Master is called home to the laboratory: nobody else is given it", () => {
    const game = forestKnown();
    explore(game, "sage", "forest", atMost(8 * HOUR));
    run(game, 5);
    expect(assign(game, "sage", "lab")).toBe(false);
    expect(sage(game).homeward).toBe(false);
  });
});

describe("her steps", () => {
  it("through an errand with the return asked for: the walk, the buying, the walk home, each done, under way or to come", () => {
    const game = shut();
    sendToTown(game, "sage", "flour", true);
    const errand = [{ is: "walk", to: "town", state: "now" }, { is: "do", doing: "buy", at: "town", ware: "flour", good: null, state: "next" }, { is: "home", state: "next" }];
    expect(stepsOf(game, "sage")).toEqual(errand);
    along(game, SETTING_OUT);
    expect(stepsOf(game, "sage")).toEqual(errand);
    until(game, () => game.clock >= sage(game).arrive + 1, 3 * HOUR);
    expect(stepsOf(game, "sage")).toEqual([{ is: "walk", to: "town", state: "done" }, { is: "do", doing: "buy", at: "town", ware: "flour", good: null, state: "now" }, { is: "home", state: "next" }]);
    until(game, () => sage(game).homeward, 3 * HOUR);
    expect(stepsOf(game, "sage")).toEqual([{ is: "walk", to: "town", state: "done" }, { is: "do", doing: "buy", at: "town", ware: null, good: null, state: "done" }, { is: "home", state: "now" }]);
    until(game, () => sage(game).state === "coming", 3 * HOUR);
    expect(stepsOf(game, "sage")).toEqual([{ is: "home", state: "now" }]);
    home(game, "sage", HOUR);
    expect(stepsOf(game, "sage")).toEqual([]);
    expect(game.flour).toBe(START_FLOUR + ERRAND_SACKS);
  });

  it("without the return asked for: no walk home until she is told; asking, and waiting, are steps of their own", () => {
    const game = forestKnown();
    goTo(game, "sage", "forest");
    expect(stepsOf(game, "sage")).toEqual([{ is: "walk", to: "forest", state: "now" }]);
    asked(game);
    expect(stepsOf(game, "sage")).toEqual([{ is: "walk", to: "forest", state: "done" }, { is: "ask", at: "forest", state: "now" }]);
    tell(game, "sage", "stay");
    expect(stepsOf(game, "sage")).toEqual([{ is: "walk", to: "forest", state: "done" }, { is: "wait", at: "forest", state: "now" }]);
    expect(answer(game, "home")).toBe(false);
    expect(tell(game, "sage", "home")).toBe(true);
    expect(stepsOf(game, "sage")).toEqual([{ is: "walk", to: "forest", state: "done" }, { is: "home", state: "now" }]);
    expect(inHouse(game, "sage")).toBe(false);
  });
});
