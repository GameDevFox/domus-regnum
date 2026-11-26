import { describe, expect, it } from "vitest";

import { playsWholeDays } from "../test-timeout";
import { anyUnknown, reveal } from "./dev";
import { MAIN_DECK, walkMinutes } from "./country";
import { combed } from "./discovery";
import { createGame } from "./game";
import { intelBook, intelOf, slotsOf } from "./intel";
import { doingsAt, outingOf } from "./outing";
import { explore, sendToTown, whyNotSend } from "./outing-send";
import { answer } from "./outing-tell";
import { outingStatus } from "./outing-status";
import { comeHome, gameAt, until } from "./test-kit";
import { HOUR, SHOP_OPENS } from "./tuning";
import type { Game, Outing } from "./types";
import { SHOPS, SHOP_IDS, knowsShop, shopsLeft } from "./wares";

playsWholeDays();

// The town's shops are not known when a game begins: each is found by exploring the town (wares.ts), in no set
// order: a few points each among the town's six hundred, any one of which finds its shop (discovery.ts).

/** A game at nine in the morning that knows none of the shops, as a new one does not. */
const newcomer = (): Game => {
  const game = gameAt(SHOP_OPENS);
  game.shops = [];
  game.coin = 500;
  return game;
};
/** Home again: told to come home whenever she asks what she is to do, as she does on finding a shop with more of the town to explore. */
const home = (game: Game, id: string): void => comeHome(game, id, 8 * HOUR);
const townSays = (game: Game): string[] => intelBook(game).find((e) => e.kind === "place" && e.id === "town")?.says ?? [];

describe("a new game", () => {
  it("knows the town and none of its shops: nothing can be bought there, and the town is to be explored", () => {
    const game = createGame();
    expect(game.places.town).toBe("found");
    expect(game.shops).toEqual([]);
    expect(doingsAt(game, "town")).toEqual(["explore"]);
    expect(whyNotSend(game, "sage", "buy")).toBe("shop");
    expect(sendToTown(game, "sage")).toBe(false);
    expect(game.outings).toEqual([]);
    expect(townSays(game)).toContain("Not all of it has been looked into");
    expect(townSays(game).some((line) => line.includes("lour"))).toBe(false);
  });

  it("has a question mark on the town for each shop there is, none of them nearer to found than another", () => {
    const game = newcomer();
    const slots = slotsOf(game, "town");
    expect(slots).toEqual(SHOPS.map((shop) => ({ is: "shop", shop: shop.id, known: false, got: 0, sought: false })));
    expect(intelOf(game, "town")).toBe(0);
    expect(shopsLeft(game).map((s) => s.id)).toEqual(SHOP_IDS);
  });
});

/** The town's points, shops' and blanks together; and how long they last at exploring's four draws a minute. */
const TOWN_POINTS = 600;
const TOWN_MINUTES = TOWN_POINTS / 4;
/** Explore the town, an outing at a time, until every shop is found: the shops in the order they were, and the minutes of exploring each had taken by then. */
const findAll = (game: Game): { order: string[]; after: number[] } => {
  const after: number[] = [];
  for (let n = 0; n < 2 * SHOPS.length && shopsLeft(game).length > 0; n++) {
    const had = game.shops.length;
    explore(game, "sage", "town", { limit: 8 * HOUR, homeByBed: false });
    comeHome(game, "sage", 30 * HOUR);
    if (game.shops.length > had) after.push(game.explored.town ?? 0);
    // (An outing ends with the day's light sometimes: the night is let pass before the next.)
    until(game, () => game.clock % (24 * HOUR) >= SHOP_OPENS && game.clock % (24 * HOUR) < 12 * HOUR, 30 * HOUR);
  }
  return { order: [...game.shops], after };
};

/** Whole games are played out here, several of them: longer than a test is given as a rule. */
const WHOLE_GAMES_MS = 60_000;

describe("exploring the town", () => {
  it("finds a shop, and she asks what she is to do next; told to come home, she does: what it sells can be bought now, and the town is still to be explored", () => {
    const game = newcomer();
    expect(explore(game, "sage", "town")).toBe(true);
    expect(outingOf(game, "sage")).toMatchObject({ to: "town", doing: "explore", seeks: null, news: 0, done: false });
    const coin = game.coin;
    until(game, () => game.asks.length > 0, 8 * HOUR);
    expect(game.shops.length).toBe(1);
    const [found] = game.shops;
    expect(game.asks).toEqual([{ who: "sage", place: "town", why: "found", news: [`shop:${found}`] }]);
    // She can be told to explore on, or to come home; but not to gather, which is not done in town.
    expect(answer(game, "gather")).toBe(false);
    expect(answer(game, "home")).toBe(true);
    home(game, "sage");
    expect(game.shops.length).toBe(1);
    expect(SHOP_IDS).toContain(found);
    // Exploring costs nothing. (The shop at home sells the while: the coin is no less, and may be more.)
    expect(game.coin).toBeGreaterThanOrEqual(coin);
    expect(game.feats.filter((f) => f.what === "shop")).toMatchObject([{ who: "sage", shop: found, place: "town" }]);
    expect(doingsAt(game, "town")).toContain("explore");
    expect(townSays(game).some((line) => line.startsWith(SHOPS.find((s) => s.id === found)?.name ?? "?"))).toBe(true);
    // Its question mark is its own now, and the others are as they were.
    expect(slotsOf(game, "town").filter((s) => s.is === "shop" && s.known).length).toBe(1);
  });

  it("has gone over so much of the town, with one shop left to find: of its points not taken out of the draw, the share drawn; and her status says exploring and no more", () => {
    const game = newcomer();
    // (With only the stall that is tucked away left to find, one point among hundreds: so that she is still at it a couple of minutes in.)
    game.shops = SHOP_IDS.filter((id) => id !== "herbalist");
    explore(game, "sage", "town");
    const outing = outingOf(game, "sage") as Outing;
    until(game, () => game.clock >= outing.arrive + 2, 4 * HOUR);
    const status = outingStatus(game, outing);
    // How far on is not said under her (the author's list, 2026-11-16: "Let's disable exploration progress under the character for now. We can keep it on the card icons.").
    expect(status).toEqual({ is: "exploring", at: "town" });
    // Four draws a minute: a couple of minutes in is a hundredth or so of the town.
    expect(combed(game, "town")).toBeGreaterThan(0.01);
    expect(combed(game, "town")).toBeLessThan(0.03);
  });

  it("finds every shop, one to an outing, within the two and a half hours the town's points last, whatever the dice", { timeout: WHOLE_GAMES_MS }, () => {
    for (const seed of [1, 2, 3]) {
      const game = gameAt(SHOP_OPENS, seed);
      game.shops = [];
      const { order, after } = findAll(game);
      expect([...order].sort(), `seed ${seed}`).toEqual([...SHOP_IDS].sort());
      expect(after.length).toBe(SHOPS.length);
      expect(game.explored.town).toBeLessThanOrEqual(TOWN_MINUTES + 1);
      // (Explored still, with nothing left in it that can be seen: what is hidden is not known to be left.)
      expect(doingsAt(game, "town")).toEqual(["buy", "sell", "explore"]);
      expect(intelOf(game, "town")).toBe(1);
      expect(townSays(game)).not.toContain("Not all of it has been looked into");
    }
  });

  it("does not go on looking for a shop that is known: its points are out of the draw, and are never come upon", { timeout: WHOLE_GAMES_MS }, () => {
    const game = newcomer();
    game.shops = ["miller"];
    findAll(game);
    expect([...game.shops].sort()).toEqual([...SHOP_IDS].sort());
    // Every one of the miller's six points is where it was, with hundreds of the town's drawn.
    expect(game.searches.town?.[MAIN_DECK]?.left["shop:miller"]).toBe(SHOPS.find((s) => s.id === "miller")?.pool);
    expect(combed(game, "town")).toBeGreaterThan(0.2);
  });

  it("finds every shop in the one outing, told to explore on each time: she asks at each, the last too, and with nothing left to find explores on until her time there is up", { timeout: WHOLE_GAMES_MS }, () => {
    const game = newcomer();
    const stay = 8 * HOUR;
    explore(game, "sage", "town", { limit: stay, homeByBed: false });
    const { arrive } = outingOf(game, "sage") as Outing;
    let asked = 0;
    until(
      game,
      () => {
        // Told to explore on whenever she finds something; when her time at it is up, to come home.
        if (game.asks.length > 0) {
          const found = game.asks[0].why === "found";
          if (found) asked += 1;
          expect(answer(game, found ? "explore" : "home")).toBe(true);
        }
        return outingOf(game, "sage") === undefined;
      },
      TOWN_MINUTES + stay + 2 * walkMinutes("town") + HOUR,
    );
    expect([...game.shops].sort()).toEqual([...SHOP_IDS].sort());
    expect(asked).toBe(SHOPS.length);
    const shops = game.feats.flatMap((f) => (f.what === "shop" ? [f.at] : []));
    expect(shops.length).toBe(SHOPS.length);
    // Every shop was found within the minutes the town's points last (time stood still while she asked); and, told to explore on after the last, she was at it the whole of the time she might be at one thing.
    expect(Math.max(...shops) - arrive).toBeLessThanOrEqual(TOWN_MINUTES + 1);
    expect(game.explored.town).toBeCloseTo(Math.max(...shops) - arrive + stay, 0);
  });

  it("is not done by buying: an errand to the one shop found finds no other", () => {
    const game = newcomer();
    game.shops = ["miller"];
    for (let n = 0; n < 3; n++) {
      expect(sendToTown(game, "rose", "flour", true)).toBe(true);
      home(game, "rose");
    }
    expect(game.explored.town ?? 0).toBe(0);
    expect(game.shops).toEqual(["miller"]);
  });
});

describe("with the dev menu unlocked", () => {
  it("a shop can be made known, and making every place known finds every shop", () => {
    const game = newcomer();
    reveal(game, { kind: "shop", id: "books" });
    expect(knowsShop(game, "books")).toBe(true);
    expect(game.shops).toEqual(["books"]);
    reveal(game, { kind: "shop", id: "books" });
    expect(game.shops).toEqual(["books"]);
    expect(anyUnknown(game, "place")).toBe(true);
    reveal(game, { kind: "all", of: "place" });
    expect([...game.shops].sort()).toEqual([...SHOP_IDS].sort());
    expect(anyUnknown(game, "place")).toBe(false);
  });
});
