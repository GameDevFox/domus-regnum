import { describe, expect, it } from "vitest";

import { walkMinutes } from "./country";
import { MAIN_DECK } from "./country";
import { combed, retune, targetsAt, writtenAt } from "./discovery";
import type { Searching } from "./discovery";
import { assign } from "./game";
import { outingOf } from "./outing";
import { explore, gather, goTo, sendToTown } from "./outing-send";
import { answer } from "./outing-tell";
import { outingStatus } from "./outing-status";
import { NINE, gameAt, run, until } from "./test-kit";
import { BASKET_HOLDS, BERRY_MINUTES, ERRAND_SACKS, HOUR } from "./tuning";
import type { Game, Outing } from "./types";

// What someone on an outing is at, this minute: bound somewhere and so many minutes off it, or
// at a place and so far on with what she is doing there.

/** Nine in the morning, nobody baking, and the forest found. */
const forestFound = (): Game => {
  const game = gameAt(NINE);
  assign(game, "evelyn", null);
  game.places.forest = "found";
  // (What can be gathered there is known too: it is found by exploring now, and these are about what comes after.)
  game.finds.forest = ["berries", "herbs"];
  return game;
};
const sage = (game: Game): Outing => outingOf(game, "sage") as Outing;
const status = (game: Game) => outingStatus(game, sage(game));
/** Run until she is at the place, and so many minutes more. */
const thereFor = (game: Game, minutes: number): void => {
  until(game, () => game.clock >= sage(game).arrive, 3 * HOUR);
  run(game, minutes);
};

describe("what someone on an outing is at", () => {
  it("is leaving the house until she is out of the door", () => {
    const game = forestFound();
    gather(game, "sage", "forest");
    expect(status(game)).toEqual({ is: "leaving" });
  });

  it("on the way there, is where she is bound and how many minutes off it is, fewer as she goes", () => {
    const game = forestFound();
    gather(game, "sage", "forest");
    until(game, () => sage(game).state === "away");
    const first = status(game);
    expect(first).toEqual({ is: "walking", to: "forest", minutes: sage(game).arrive - game.clock });
    run(game, 10);
    expect(status(game)).toMatchObject({ is: "walking", to: "forest", minutes: expect.closeTo((first as { minutes: number }).minutes - 10, 1) });
  });

  it("on the way to a place with nothing chosen to do there, says so; and there, she is waiting once told to stay", () => {
    const game = forestFound();
    goTo(game, "sage", "forest");
    until(game, () => sage(game).state === "away");
    expect(status(game)).toEqual({ is: "walking", to: "forest", minutes: sage(game).arrive - game.clock, idle: true });
    until(game, () => game.asks.length > 0, 2 * HOUR);
    expect(answer(game, "stay")).toBe(true);
    expect(status(game)).toEqual({ is: "waiting", at: "forest" });
  });

  it("gathering, is what is in her basket, kind by kind, and how many lots that is of how many it holds", () => {
    const game = forestFound();
    gather(game, "sage", "forest");
    thereFor(game, BERRY_MINUTES / 2);
    expect(status(game)).toEqual({ is: "gathering", at: "forest", picked: [], load: 0, holds: BASKET_HOLDS });
    run(game, BERRY_MINUTES);
    expect(status(game)).toEqual({ is: "gathering", at: "forest", picked: [{ thing: "berries", lots: 1 }], load: 1, holds: BASKET_HOLDS });
    // Thirty-five minutes in: three lots of berries, and the first of herbs.
    run(game, BERRY_MINUTES * 2);
    expect(status(game)).toEqual({ is: "gathering", at: "forest", picked: [{ thing: "berries", lots: 3 }, { thing: "herbs", lots: 1 }], load: 4, holds: BASKET_HOLDS });
  });

  it("on the way home, is bound for the house and so many minutes off it; and then in the house, carrying what she has to its shelf", () => {
    const game = forestFound();
    gather(game, "sage", "forest", { limit: 30, homeByBed: false, thenHome: true });
    thereFor(game, 31);
    expect(status(game)).toEqual({ is: "walking", to: "manor", minutes: sage(game).back - game.clock });
    expect((status(game) as { minutes: number }).minutes).toBeCloseTo(walkMinutes("forest") - 1, 0);
    until(game, () => sage(game).state === "returning", 2 * HOUR);
    expect(status(game)).toEqual({ is: "returning" });
  });

  /** One of the forest's decks as it is written. */
  const written = (id: string): Searching => writtenAt("forest").find((deck) => deck.id === id) as Searching;

  // (The author's list, 2026-11-16: "Let's disable exploration progress under the character for now. We can keep it on the card icons.")
  it("exploring, is exploring and no more, in every case: with several things left to find, with one, and with the search aimed at one", () => {
    const several = forestFound();
    several.finds.forest = ["berries"];
    explore(several, "sage", "forest");
    thereFor(several, 5);
    expect(status(several)).toEqual({ is: "exploring", at: "forest" });
    // (Only the way on is left.)
    const one = forestFound();
    explore(one, "sage", "forest");
    thereFor(one, 10);
    expect(combed(one, "forest")).toBeGreaterThan(0);
    expect(outingStatus(one, outingOf(one, "sage") as Outing)).toEqual({ is: "exploring", at: "forest" });
    const aimed = forestFound();
    aimed.finds.forest = [];
    retune(aimed, "forest", MAIN_DECK, { ...written(MAIN_DECK), aimed: 2, stray: 0 });
    explore(aimed, "sage", "forest");
    thereFor(aimed, 2);
    expect(targetsAt(aimed, "forest").length).toBeGreaterThan(0);
    expect(outingStatus(aimed, outingOf(aimed, "sage") as Outing)).toEqual({ is: "exploring", at: "forest" });
  });

  it("come to a place nobody had been to, is asking what she is to do; and told, is doing it", () => {
    const game = gameAt(NINE);
    assign(game, "evelyn", null);
    explore(game, "sage", "forest");
    thereFor(game, 1);
    expect(status(game)).toEqual({ is: "asking", at: "forest" });
    // Nothing has been found there to gather yet: exploring is all she can be told to do, beside coming home.
    expect(answer(game, "gather")).toBe(false);
    expect(answer(game, "explore")).toBe(true);
    expect(status(game)).toMatchObject({ is: "exploring", at: "forest" });
  });

  it("asks, when her time at it is up; told to stay, is waiting there, and goes on waiting as time goes on", () => {
    const game = forestFound();
    gather(game, "sage", "forest", { limit: 30, homeByBed: false });
    thereFor(game, 31);
    expect(status(game)).toEqual({ is: "asking", at: "forest" });
    expect(answer(game, "stay")).toBe(true);
    expect(status(game)).toEqual({ is: "waiting", at: "forest" });
    run(game, HOUR);
    expect(status(game)).toEqual({ is: "waiting", at: "forest" });
    expect(game.asks).toEqual([]);
  });

  it("in town for flour, is buying so many sacks, and so many minutes from setting off home", () => {
    const game = forestFound();
    sendToTown(game, "sage");
    thereFor(game, 5);
    expect(status(game)).toEqual({ is: "buying", at: "town", ware: "flour", load: ERRAND_SACKS, minutes: sage(game).depart - game.clock });
    expect((status(game) as { minutes: number }).minutes).toBeGreaterThan(0);
  });
});
