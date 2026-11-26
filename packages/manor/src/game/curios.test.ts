import { describe, expect, it } from "vitest";

import { RARE_DECK } from "./country";
import { CURIOS, curioFound, curiosAt } from "./curios";
import { runDev } from "./dev";
import { comeUponNext, curioId, moreToFind, writtenAt } from "./discovery";
import { slotsOf } from "./intel";
import { lotsOf, outingOf } from "./outing";
import { explore, gather } from "./outing-send";
import { answer } from "./outing-tell";
import { atMost, forestKnown } from "./outing-kit";
import { home, until } from "./test-kit";
import { HOUR } from "./tuning";
import type { Game, Outing } from "./types";

// A curio lies hidden at a place, a thing to be found there like any other: its points are in a
// deck of their own, drawn from every minute anyone is there. Nobody knows of it until it is come
// upon; whoever comes upon it brings it home, and then it is in the house.

const TABLET = curioId("tablet");
const sage = (game: Game): Outing => outingOf(game, "sage") as Outing;
/** The forest found and what grows there known, with the tablet's deck so drawn down that its next draw comes upon it. */
const nextDraw = (): Game => {
  const game = forestKnown();
  comeUponNext(game, "forest", TABLET);
  return game;
};

describe("where a curio lies", () => {
  it("is in a deck of its own at its place: the tablet one point needing one, hidden, among the forest's rare deck's 1079 dead ends", () => {
    expect(curiosAt("forest")).toEqual(["tablet"]);
    expect(curiosAt("town")).toEqual([]);
    const rare = writtenAt("forest").find((deck) => deck.id === RARE_DECK);
    expect(rare).toEqual({ id: RARE_DECK, finds: [{ id: TABLET, pool: 1, need: 1, lingers: false, hidden: true }], blanks: 1079, aimed: 0, stray: 2, gather: 1, aim: "rolled" });
    // (It is in no other deck: the forest's own things are where they always were.)
    expect(writtenAt("forest").filter((deck) => deck.finds.some((find) => find.id === TABLET))).toHaveLength(1);
  });

  it("is not among what is left to find there: with all else found, nothing is, the tablet still lying where it lies", () => {
    const game = forestKnown();
    game.places.caves = "unknown";
    expect(curioFound(game, "tablet")).toBe(false);
    expect(moreToFind(game, "forest")).toBe(false);
    // …and has no slot on the place's card, until it is found.
    expect(slotsOf(game, "forest").some((slot) => slot.is === "curio")).toBe(false);
    game.places.caves = undefined;
    expect(moreToFind(game, "forest")).toBe(true);
  });
});

describe("coming upon a curio", () => {
  it("exploring, she has it with her, it is marked, and she asks what she is to do next, saying what she came upon", () => {
    const game = nextDraw();
    explore(game, "sage", "forest", atMost(4 * HOUR));
    until(game, () => game.asks.length > 0, 3 * HOUR);
    expect(game.asks).toEqual([{ who: "sage", place: "forest", why: "found", news: [TABLET] }]);
    expect(sage(game).found).toEqual(["tablet"]);
    expect(game.feats.filter((f) => f.what === "curio")).toMatchObject([{ who: "sage", place: "forest", curio: "tablet" }]);
    expect(curioFound(game, "tablet")).toBe(true);
    // It is not in the house until she is.
    expect(game.curios).toEqual([]);
    answer(game, "home");
    home(game, "sage", 3 * HOUR);
    expect(game.curios).toEqual(["tablet"]);
  });

  it("gathering, she has it with her and does not ask: she goes on filling her basket", () => {
    const game = nextDraw();
    gather(game, "sage", "forest", atMost(4 * HOUR));
    until(game, () => sage(game).found.length > 0, 3 * HOUR);
    expect(sage(game).found).toEqual(["tablet"]);
    expect(lotsOf(sage(game).basket)).toBe(0);
    expect(game.asks).toEqual([]);
    until(game, () => lotsOf(sage(game).basket) > 0, HOUR);
    expect(game.asks).toEqual([]);
    expect(sage(game).done).toBe(false);
  });

  it("brings it home: it is in the house from the moment she is in at the door", () => {
    const game = nextDraw();
    gather(game, "sage", "forest", atMost(30, true));
    until(game, () => sage(game).state === "returning", 4 * HOUR);
    expect(game.curios).toEqual(["tablet"]);
    expect(sage(game).found).toEqual([]);
    home(game, "sage", HOUR);
    expect(game.curios).toEqual(["tablet"]);
  });

  it("happens once: what is drawn of its deck after it is only dead ends", () => {
    const game = nextDraw();
    gather(game, "sage", "forest", atMost(60, true));
    home(game, "sage", 6 * HOUR);
    comeUponNext(game, "forest", TABLET);
    gather(game, "rose", "forest", atMost(60, true));
    home(game, "rose", 6 * HOUR);
    expect(game.curios).toEqual(["tablet"]);
    expect(game.feats.filter((f) => f.what === "curio").length).toBe(1);
  });

  it("comes home with her however she comes home: called back at once, she has it", () => {
    const game = nextDraw();
    gather(game, "sage", "forest", atMost(4 * HOUR));
    until(game, () => sage(game).found.length === 1, 3 * HOUR);
    runDev(game, "home");
    until(game, () => outingOf(game, "sage")?.state !== "away" && outingOf(game, "sage")?.state !== "coming", 60);
    expect(game.curios).toEqual(["tablet"]);
  });
});

describe("for trying it out", () => {
  it("a command has the next draw at the curio's place come upon it", () => {
    const game = forestKnown();
    expect(runDev(game, "tablet")).toBe(true);
    gather(game, "sage", "forest", atMost(30));
    until(game, () => game.clock >= sage(game).arrive + 1, 3 * HOUR);
    expect(sage(game).found).toEqual(["tablet"]);
  });

  it("the tablet has something written on it, in the Deseret alphabet's capitals and nothing else", () => {
    expect(CURIOS.tablet.lines.length).toBeGreaterThan(0);
    const marks = CURIOS.tablet.lines.flatMap((line) => [...line.replaceAll(" ", "")].map((mark) => mark.codePointAt(0) ?? 0));
    expect(marks.length).toBeGreaterThan(10);
    expect(Math.min(...marks)).toBeGreaterThanOrEqual(0x10400);
    expect(Math.max(...marks)).toBeLessThanOrEqual(0x10427);
  });
});
