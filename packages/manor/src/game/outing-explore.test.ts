import { describe, expect, it } from "vitest";

import { walkMinutes } from "./country";
import { combed, moreToFind } from "./discovery";
import { assign } from "./game";
import { backAt, doingsAt, lotsOf, outingOf } from "./outing";
import { explore, sendToTown } from "./outing-send";
import { answer, choicesFor } from "./outing-tell";
import { FOREST_POINTS, FULL, NOTHING, atMost, forestFound, forestKnown } from "./outing-kit";
import { NINE, comeHome, gameAt, home, inHouse, person, quiet, roomOf, run, until } from "./test-kit";
import { BASKET_HOLDS, BERRY_MINUTES, ERRAND_MINUTES, HERB_MINUTES, HOUR, START_FLOUR } from "./tuning";
import type { Game, Outing } from "./types";

/** What someone asking can be told to do where she is: explore, or gather. */
const staying = (game: Game, id: string): string[] => choicesFor(game, id).flatMap(({ told }) => (told === "explore" || told === "gather" ? [told] : []));

// Exploring a place: finding it, finding what it holds and the ways on from it, and asking what she is to do with each find.

describe("exploring", () => {
  it("of a place not yet found finds it the moment she is there, marks it once, and asks what she is to do: time stands still until she is told", () => {
    const game = quiet();
    explore(game, "sage", "forest", atMost(4 * HOUR));
    const outing = outingOf(game, "sage") as Outing;
    const walk = walkMinutes("forest");
    expect(outing).toMatchObject({ seeks: "forest", done: false, arrive: NINE + walk, depart: NINE + walk + 4 * HOUR });
    until(game, () => game.clock >= outing.arrive - 1, 90);
    expect(game.places.forest).toBe("unknown");
    expect(game.feats).toEqual([]);
    expect(game.asks).toEqual([]);
    until(game, () => game.asks.length > 0, 5);
    expect(game.places.forest).toBe("found");
    expect(game.feats).toMatchObject([{ who: "sage", what: "found", place: "forest" }]);
    expect(game.asks).toEqual([{ who: "sage", place: "forest", why: "place" }]);
    expect(outing.done).toBe(false);
    // Nothing moves while she waits to be told: not the clock, not the house.
    const { clock, sold } = game;
    const evelyn = { ...person(game, "evelyn").walker.pos };
    run(game, 30);
    expect(game.clock).toBe(clock);
    expect(game.sold).toBe(sold);
    expect(person(game, "evelyn").walker.pos).toEqual(evelyn);
    // Told to come home, she turns for home, and time goes on.
    expect(answer(game, "home")).toBe(true);
    expect(game.asks).toEqual([]);
    run(game, 1);
    expect(game.clock).toBeGreaterThan(clock);
    expect(outing.done).toBe(true);
    expect(outing.depart).toBeCloseTo(outing.arrive, 0);
    expect(outing.back).toBeCloseTo(NINE + 2 * walk, 0);
    // Finding the place is not exploring it: no minutes are counted for the visit.
    expect(game.explored.forest).toBeUndefined();
    until(game, () => inHouse(game, "sage"), 90);
    expect(game.clock).toBeCloseTo(NINE + 2 * walk, 0);
    expect(roomOf(game, "sage")).toBe("hall");
    expect(outingOf(game, "sage")).toBeUndefined();
    expect(person(game, "sage").carrying).toBeNull();
    expect(game.flour).toBe(START_FLOUR);
  });

  it("told to explore where she has just found, she stays and goes over the place, bound as she was sent; and asks again with the first thing she finds", () => {
    const game = quiet();
    explore(game, "sage", "forest", atMost(4 * HOUR));
    const outing = outingOf(game, "sage") as Outing;
    const latest = outing.depart;
    until(game, () => game.asks.length > 0, 90);
    expect(game.asks).toEqual([{ who: "sage", place: "forest", why: "place" }]);
    expect(answer(game, "explore")).toBe(true);
    // (Her time at it is counted from when she is told: here, the moment she came.)
    expect(outing).toMatchObject({ doing: "explore", seeks: null, news: 0, turned: null, done: false, depart: expect.closeTo(latest, 0) });
    until(game, () => game.asks.length > 0, 4 * HOUR);
    // Something the forest holds is found, and is marked as hers; and she asks what she is to do, saying what it is.
    const [found] = game.finds.forest ?? [];
    expect(game.feats.filter((f) => f.what === "thing" || f.what === "way")).toMatchObject([{ who: "sage", place: "forest", thing: found }]);
    expect(game.asks).toEqual([{ who: "sage", place: "forest", why: "found", news: [`thing:${found}`] }]);
    // Time stands still until she is told; she has not turned for home.
    const asked = game.clock;
    run(game, 5);
    expect(game.clock).toBe(asked);
    expect(outing).toMatchObject({ done: false, homeward: false });
    // What she has found can be gathered now, and that is among what she can be told.
    expect(answer(game, "home")).toBe(true);
    run(game, 1);
    expect(outing.done).toBe(true);
    expect(outing.depart).toBeLessThan(latest - 2 * HOUR);
    home(game, "sage", 120);
    expect(game.asks).toEqual([]);
  });

  it("told to explore on each time something turns up, she finds everything the forest holds in the one outing, each find asked of in turn", () => {
    const game = forestFound();
    explore(game, "sage", "forest", atMost(8 * HOUR));
    const outing = outingOf(game, "sage") as Outing;
    const asked: string[][] = [];
    until(
      game,
      () => {
        const [ask] = game.asks;
        if (ask) {
          asked.push(ask.news ?? []);
          // (The last of them: told then to come home.)
          expect(answer(game, asked.length < 3 ? "explore" : "home")).toBe(true);
        }
        return outing.done;
      },
      4 * HOUR,
    );
    expect(asked.flat().sort()).toEqual(["thing:berries", "thing:herbs", "way:caves"]);
    expect(asked.every((news) => news.length === 1)).toBe(true);
    expect(outing.depart - outing.arrive).toBeLessThanOrEqual(FOREST_POINTS / 4 + 1);
  });

  it("told to gather what she has just found, she fills her basket with it and brings it home", () => {
    const game = forestFound();
    explore(game, "sage", "forest", atMost(8 * HOUR));
    until(game, () => game.asks.length > 0, 4 * HOUR);
    const [found] = game.finds.forest ?? [];
    expect(answer(game, "gather")).toBe(true);
    expect(outingOf(game, "sage")).toMatchObject({ doing: "gather", basket: {} });
    comeHome(game, "sage", 12 * HOUR);
    // A full basket, most or all of it what she found. (The other thing may turn up while she gathers, and is picked from then.)
    expect(game.stock.berries + game.stock.herbs).toBe(BASKET_HOLDS);
    expect(game.stock[found as "berries" | "herbs"]).toBeGreaterThan(0);
  });

  it("told to gather after exploring a while, she picks from then: the minutes she spent exploring fill nothing", () => {
    const game = forestFound();
    explore(game, "sage", "forest", atMost(8 * HOUR));
    const outing = outingOf(game, "sage") as Outing;
    until(game, () => game.asks.length > 0, 4 * HOUR);
    // (She has been exploring longer than it takes to pick a lot of anything.)
    expect(outing.spent).toBeGreaterThan(BERRY_MINUTES);
    expect(answer(game, "gather")).toBe(true);
    const told = game.clock;
    until(game, () => game.clock >= told + 1, 60);
    expect(lotsOf(outing.basket)).toBe(0);
    until(game, () => lotsOf(outing.basket) > 0, 4 * HOUR);
    // The first lot is picked a whole lot's minutes after she was told: berries every ten, herbs every twenty-five.
    const [first] = Object.keys(outing.basket) as ("berries" | "herbs")[];
    expect(game.clock - told).toBeCloseTo(first === "berries" ? BERRY_MINUTES : HERB_MINUTES, 1);
  });

  it("told to gather where what grows there is known already, she fills her basket and brings it home", () => {
    const game = quiet();
    // (As if it had been made known some other way: a place only just found has nothing known in it to gather.)
    game.finds.forest = ["berries", "herbs"];
    explore(game, "sage", "forest", atMost(4 * HOUR));
    until(game, () => game.asks.length > 0, 90);
    expect(answer(game, "gather")).toBe(true);
    expect(outingOf(game, "sage")).toMatchObject({ doing: "gather", seeks: null });
    comeHome(game, "sage", 5 * HOUR);
    expect(game.stock).toMatchObject(FULL);
  });

  it("is not told what cannot be done there, nor anything when nobody asks", () => {
    const game = quiet();
    expect(answer(game, "home")).toBe(false);
    explore(game, "sage", "forest", atMost(4 * HOUR));
    until(game, () => game.asks.length > 0, 90);
    // Nothing has been found here to gather: there is exploring to do, and no gathering.
    expect(answer(game, "gather")).toBe(false);
    expect(game.asks.length).toBe(1);
    expect(answer(game, "explore")).toBe(true);
  });

  it("is asked by whoever finds the place, and not again by someone who comes to it after", () => {
    const game = quiet();
    explore(game, "sage", "forest", atMost(4 * HOUR));
    run(game, 10);
    explore(game, "rose", "forest", atMost(4 * HOUR));
    until(game, () => game.asks.length > 0, 90);
    expect(game.asks).toEqual([{ who: "sage", place: "forest", why: "place" }]);
    answer(game, "home");
    // Rose was sent to explore it too, and finds it found: she does not ask of the place, but sets about exploring it.
    const rose = outingOf(game, "rose") as Outing;
    until(game, () => game.clock >= rose.arrive + 1 || game.asks.length > 0, 120);
    expect(game.asks.filter((ask) => ask.why === "place")).toEqual([]);
    expect(game.feats.filter((f) => f.what === "found").length).toBe(1);
    comeHome(game, "rose", 8 * HOUR);
  });

  it("asks when something turns up as her time there runs out, saying what turned up: the news comes before the time", () => {
    // How long she explores before the first find, and the same again with only that long to stay: the find falls in her last minute.
    const first = forestFound();
    explore(first, "sage", "forest", atMost(8 * HOUR));
    until(first, () => first.asks.length > 0, 4 * HOUR);
    const stay = Math.ceil((outingOf(first, "sage") as Outing).spent);
    const game = forestFound();
    explore(game, "sage", "forest", atMost(stay));
    const outing = outingOf(game, "sage") as Outing;
    until(game, () => (game.finds.forest ?? []).length > 0, 4 * HOUR);
    expect(game.asks).toMatchObject([{ who: "sage", place: "forest", why: "found" }]);
    expect(outing).toMatchObject({ done: false, homeward: false });
    expect(game.clock).toBeCloseTo(outing.arrive + stay, 0);
    comeHome(game, "sage", 120);
  });

  it("asks on finding a place where nothing is known to be found, there being exploring to be told to do; told to, she explores until her time there is up", () => {
    const game = quiet();
    const stay = 4 * HOUR;
    explore(game, "sage", "lake", atMost(stay));
    const outing = outingOf(game, "sage") as Outing;
    until(game, () => game.asks.length > 0, 90);
    expect(game.asks).toEqual([{ who: "sage", place: "lake", why: "place" }]);
    expect(staying(game, "sage")).toEqual(["explore"]);
    expect(answer(game, "explore")).toBe(true);
    until(game, () => game.clock >= outing.depart, stay + 1);
    // Nothing turned up, and she was not called home by its not turning up: she was there the whole of her time, and asks.
    expect(outing.news).toBe(0);
    expect(game.explored.lake).toBeCloseTo(stay, 0);
    expect(game.asks).toEqual([{ who: "sage", place: "lake", why: "time", did: { doing: "explore" } }]);
    comeHome(game, "sage", 90);
    expect(game.clock).toBeCloseTo(NINE + 2 * walkMinutes("lake") + stay, 0);
  });

  it("of a place that has been found goes on until something there is found; told then to come home, she does, with nothing in her hands", () => {
    const game = forestFound();
    explore(game, "sage", "forest", atMost(8 * HOUR));
    const outing = outingOf(game, "sage") as Outing;
    expect(outing).toMatchObject({ seeks: null, news: 0 });
    until(game, () => outing.news > 0, 4 * HOUR);
    const foundAfter = game.clock - outing.arrive;
    // (Berries and herbs are all about the forest: the first of them is found within the half hour, whatever the dice.)
    expect(foundAfter).toBeGreaterThan(5);
    expect(foundAfter).toBeLessThan(40);
    expect(game.finds.forest?.length).toBe(1);
    expect(answer(game, "home")).toBe(true);
    run(game, 1);
    expect(outing.done).toBe(true);
    expect(outing.depart).toBeCloseTo(outing.arrive + foundAfter, 0);
    home(game, "sage", 120);
    expect(game.clock).toBeCloseTo(NINE + 2 * walkMinutes("forest") + foundAfter, 0);
    expect(game.explored.forest).toBeCloseTo(foundAfter, 0);
    // Nothing is brought home by it.
    expect(game.stock).toMatchObject(NOTHING);
  });

  it("stops when she has been there as long as she may, with every minute of it counted: ten minutes is ten minutes", () => {
    // (Only the way on is left to find, which a few minutes do not find.)
    const game = forestKnown();
    explore(game, "sage", "forest", atMost(10, true));
    const { back } = outingOf(game, "sage") as Outing;
    home(game, "sage", 180);
    expect(game.clock).toBeCloseTo(back, 0);
    expect(back).toBe(NINE + 2 * walkMinutes("forest") + 10);
    expect(game.explored.forest).toBeCloseTo(10, 6);
    expect(game.places.caves).toBeUndefined();
    // Four draws a minute: forty of the forest's points are gone over.
    expect(combed(game, "forest")).toBeCloseTo(40 / FOREST_POINTS, 6);
  });

  it("counts what has been gone over as it is, by whoever does it, over however many visits: nothing is gone over twice", () => {
    const game = forestKnown();
    explore(game, "sage", "forest", atMost(10, true));
    home(game, "sage", 240);
    explore(game, "rose", "forest", atMost(10, true));
    home(game, "rose", 240);
    expect(game.explored.forest).toBeCloseTo(20, 6);
    expect(combed(game, "forest")).toBeCloseTo(80 / FOREST_POINTS, 6);
    // Two there together go over it twice as fast.
    explore(game, "sage", "forest", atMost(10, true));
    explore(game, "rose", "forest", atMost(10, true));
    home(game, "sage", 240);
    home(game, "rose", 60);
    expect(combed(game, "forest")).toBeCloseTo(160 / FOREST_POINTS, 6);
  });

  it("is over, for the forest, within the hour and a half its points last: by then everything it holds is found, whatever the dice", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const game = gameAt(NINE, seed);
      assign(game, "evelyn", null);
      game.places.forest = "found";
      // (An outing may end with the stone tablet, now and then, as well as with one of these: there is room for one more.)
      for (let n = 0; n < 4 && moreToFind(game, "forest"); n++) {
        explore(game, "sage", "forest", { limit: 8 * HOUR, homeByBed: false });
        // (Told to come home each time she asks what she is to do.)
        comeHome(game, "sage", 12 * HOUR);
      }
      expect(moreToFind(game, "forest"), `seed ${seed}`).toBe(false);
      expect(doingsAt(game, "forest")).toEqual(["explore", "gather"]);
      expect([...(game.finds.forest ?? [])].sort()).toEqual(["berries", "herbs"]);
      expect(game.places.caves).toBe("unknown");
      // One find to an outing: three outings, and no more minutes than the pools hold points for.
      expect(game.feats.filter((f) => f.what === "thing" || f.what === "way").length).toBe(3);
      expect(game.explored.forest).toBeLessThanOrEqual(FOREST_POINTS / 4 + 1);
    }
  });

  it("is not done for the others there when one finds the last thing there is to be seen: whoever found it asks, and the other explores on for whatever may be hidden", () => {
    const game = forestKnown();
    const stay = 2 * HOUR;
    explore(game, "sage", "forest", atMost(stay));
    explore(game, "rose", "forest", atMost(stay));
    until(game, () => game.places.caves === "unknown", 4 * HOUR);
    const [sage, rose] = [outingOf(game, "sage") as Outing, outingOf(game, "rose") as Outing];
    const [finder, other] = sage.news > 0 ? [sage, rose] : [rose, sage];
    // One of them found it, and the other did not. The finder asks, and could be told to explore on; she is told to come home.
    expect([finder.news, other.news]).toEqual([1, 0]);
    expect(game.asks).toEqual([{ who: finder.who, place: "forest", why: "found", news: ["way:caves"] }]);
    expect(staying(game, finder.who)).toEqual(["explore", "gather"]);
    expect(answer(game, "home")).toBe(true);
    run(game, 1);
    expect(finder.done).toBe(true);
    // Two of them went over it twice as fast: the forest's points last them forty-one minutes.
    expect(finder.depart - finder.arrive).toBeLessThanOrEqual(FOREST_POINTS / 8 + 1);
    expect(other).toMatchObject({ done: false, depart: other.arrive + stay });
    home(game, finder.who, 120);
    comeHome(game, other.who, stay + 2 * walkMinutes("forest"));
  });

  it("does not count minutes from before she was out of the house, were she ever so slow to the door", () => {
    const game = forestKnown();
    explore(game, "sage", "forest", atMost(12, true));
    const outing = outingOf(game, "sage") as Outing;
    until(game, () => outing.state === "away", 90);
    // As if she had been kept in the house until six minutes after she was due at the forest.
    outing.left = outing.arrive + 6;
    home(game, "sage", 180);
    expect(game.explored.forest).toBeCloseTo(6, 6);
  });

  it("finds nothing by buying flour: time in town is not exploring, and its times are settled as she goes", () => {
    const game = quiet();
    game.coin = 100;
    sendToTown(game, "sage", "flour", true);
    expect(outingOf(game, "sage")).toMatchObject({ done: true, seeks: null, back: backAt(NINE) });
    home(game, "sage", ERRAND_MINUTES + 120);
    expect(game.explored).toEqual({});
    expect(game.feats).toEqual([]);
  });
});
