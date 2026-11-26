import { describe, expect, it } from "vitest";

import { CROP_IDS, FIRST_CROP } from "./garden";
import { assign } from "./game";
import { DEVICES, invent } from "./lab";
import { backAt, errandCost, outingOf } from "./outing";
import { sendToTown, whyNotSend } from "./outing-send";
import { outingStatus } from "./outing-status";
import { statsOf } from "./person";
import { NINE, gameAt, until } from "./test-kit";
import { ERRAND_SACKS, FLOUR_COST, START_FLOUR, TREATISE_SHARE } from "./tuning";
import type { Game } from "./types";
import { CLOTHING_IDS, SHOPS, WARES, WARE_IDS, needless, nextCrop, takeIn, waresOf } from "./wares";

// What is sold in town, and an errand for something other than flour.

/** Nine in the morning, coin to spend, and nobody baking. */
const quiet = (): Game => {
  const game = gameAt(NINE);
  game.coin = 100;
  assign(game, "evelyn", null);
  return game;
};
/** Run until she is home and has put down what she brought. */
const home = (game: Game, id: string): void => until(game, () => outingOf(game, id) === undefined, 400);

describe("the shops in town", () => {
  it("are the miller's, a book shop and a clothes shop, with two stalls that buy among them; and every ware is sold at one of the three", () => {
    expect(SHOPS.map((s) => s.id)).toEqual(["miller", "greengrocer", "books", "herbalist", "clothes"]);
    // The stalls sell nothing to the house (they buy of it: sales.test.ts), and the three shops buy nothing.
    expect(SHOPS.filter((s) => s.buys.length > 0).map((s) => s.id)).toEqual(["greengrocer", "herbalist"]);
    expect(waresOf("greengrocer")).toEqual([]);
    expect(waresOf("herbalist")).toEqual([]);
    expect(waresOf("miller").map((w) => w.id)).toEqual(["flour"]);
    expect(waresOf("books").map((w) => w.id)).toEqual(["almanac", "treatise"]);
    // One plain thing of each kind to wear.
    expect(waresOf("clothes").map((w) => w.id)).toEqual(["gloves", "boots", "shoes", "clothing", "glasses"]);
    expect(waresOf("clothes").map((w) => w.id)).toEqual(CLOTHING_IDS);
    expect(SHOPS.flatMap((s) => waresOf(s.id)).map((w) => w.id)).toEqual(WARE_IDS);
  });

  it("sell flour as the errand always bought it: four sacks for what four sacks cost", () => {
    expect(WARES.flour).toMatchObject({ price: ERRAND_SACKS * FLOUR_COST, lot: ERRAND_SACKS });
    expect(errandCost()).toBe(WARES.flour.price);
    expect(errandCost("boots")).toBe(WARES.boots.price);
  });
});

describe("an errand into town for something other than flour", () => {
  it("takes the ware's price with her, is as long as any errand, and she is seen to be buying it", () => {
    const game = quiet();
    expect(sendToTown(game, "sage", "gloves", true)).toBe(true);
    expect(game.coin).toBe(100 - WARES.gloves.price);
    expect(outingOf(game, "sage")).toMatchObject({ to: "town", doing: "buy", buys: "gloves", bought: {}, back: backAt(NINE) });
    until(game, () => outingStatus(game, outingOf(game, "sage")!).is === "buying", 400);
    expect(outingStatus(game, outingOf(game, "sage")!)).toMatchObject({ is: "buying", at: "town", ware: "gloves", load: 1 });
    // They are hers once they are bought, and not before.
    expect(statsOf(game, "sage").carrying).toEqual([]);
    until(game, () => outingOf(game, "sage")!.homeward, 400);
    expect(outingOf(game, "sage")).toMatchObject({ buys: null, bought: { gloves: 1 } });
    expect(statsOf(game, "sage").carrying).toEqual([{ goods: "gloves", count: 1 }]);
  });

  it("wants the coin for that ware, not for flour", () => {
    const game = quiet();
    game.coin = WARES.flour.price;
    expect(whyNotSend(game, "sage", "buy", undefined, "boots")).toBe("coin");
    expect(sendToTown(game, "sage", "boots", true)).toBe(false);
    expect(game.coin).toBe(WARES.flour.price);
    expect(whyNotSend(game, "sage", "buy", undefined, "flour")).toBeNull();
  });

  it("something to wear is put by the moment she is in at the door, with nothing to carry through the house; and no flour comes of it", () => {
    const game = quiet();
    sendToTown(game, "sage", "boots", true);
    until(game, () => outingOf(game, "sage")?.state === "coming", 400);
    expect(game.wardrobe.boots).toBe(0);
    home(game, "sage");
    expect(game.wardrobe).toEqual({ gloves: 0, boots: 1, shoes: 0, clothing: 0, glasses: 0 });
    expect(game.flour).toBe(START_FLOUR);
    expect(statsOf(game, "sage").carrying).toEqual([]);
    // A second pair is a second pair.
    sendToTown(game, "sage", "boots", true);
    home(game, "sage");
    expect(game.wardrobe.boots).toBe(2);
  });

  it("flour is still carried through to the pantry before it is the kitchen's", () => {
    const game = quiet();
    sendToTown(game, "sage", "flour", true);
    until(game, () => outingOf(game, "sage")?.state === "returning", 400);
    expect(game.flour).toBe(START_FLOUR);
    home(game, "sage");
    expect(game.flour).toBe(START_FLOUR + ERRAND_SACKS);
  });
});

describe("a gardener's almanac", () => {
  it("teaches the garden the next crop it does not know, each time one is brought home", () => {
    const game = quiet();
    expect(game.garden.known).toEqual([FIRST_CROP]);
    const next = nextCrop(game);
    expect(next).toBe(CROP_IDS.find((crop) => crop !== FIRST_CROP));
    sendToTown(game, "sage", "almanac", true);
    home(game, "sage");
    expect(game.garden.known).toEqual([FIRST_CROP, next]);
    expect(nextCrop(game)).not.toBe(next);
  });

  it("is of no use once every crop is known, and nobody is sent for one", () => {
    const game = quiet();
    game.garden.known = [...CROP_IDS];
    expect(nextCrop(game)).toBeNull();
    expect(needless(game, "almanac")).toBe(true);
    expect(whyNotSend(game, "sage", "buy", undefined, "almanac")).toBe("needless");
    expect(sendToTown(game, "sage", "almanac", true)).toBe(false);
    expect(game.coin).toBe(100);
    // (Taken in all the same, it teaches nothing and breaks nothing.)
    takeIn(game, "almanac", 1);
    expect(game.garden.known).toEqual(CROP_IDS);
  });
});

describe("a treatise", () => {
  it("adds a share of what the Master's next invention takes, wherever he is", () => {
    const game = quiet();
    const before = game.lab.progress;
    takeIn(game, "treatise", 1);
    expect(game.lab.progress - before).toBeCloseTo(game.lab.needed * TREATISE_SHARE, 9);
    expect(game.lab.ready).toBe(false);
  });

  it("fills the measure when that is all it wanted, and that is marked as his own work is", () => {
    const game = quiet();
    game.lab.progress = game.lab.needed * (1 - TREATISE_SHARE / 2);
    const feats = game.feats.length;
    takeIn(game, "treatise", 1);
    expect(game.lab).toMatchObject({ progress: game.lab.needed, ready: true });
    expect(game.feats.slice(feats)).toMatchObject([{ who: "master", what: "invention" }]);
  });

  it("is of no use while the measure is full, or with nothing left to invent", () => {
    const game = quiet();
    expect(needless(game, "treatise")).toBe(false);
    game.lab.ready = true;
    expect(needless(game, "treatise")).toBe(true);
    expect(whyNotSend(game, "sage", "buy", undefined, "treatise")).toBe("needless");
    for (const device of DEVICES) {
      game.lab.ready = true;
      invent(game, device.id);
    }
    expect(game.lab.ready).toBe(false);
    expect(needless(game, "treatise")).toBe(true);
    const before = game.lab.progress;
    takeIn(game, "treatise", 1);
    expect(game.lab.progress).toBe(before);
  });

  it("nothing else is ever of no use", () => {
    const game = quiet();
    game.garden.known = [...CROP_IDS];
    game.lab.ready = true;
    expect(WARE_IDS.filter((ware) => needless(game, ware))).toEqual(["almanac", "treatise"]);
  });
});
