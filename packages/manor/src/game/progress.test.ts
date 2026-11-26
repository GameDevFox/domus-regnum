import { describe, expect, it } from "vitest";

import { want } from "./garden";
import { assign, needOf } from "./game";
import { sendToTown } from "./outing-send";
import { nearing, progressOf } from "./progress";
import { gameAt, run, until } from "./test-kit";
import { BEDTIME, HOUR, SHOP_OPENS } from "./tuning";
import type { Game } from "./types";

// How far through what she is at someone is (progress.ts).

const only = (game: Game, id: string, job: "bake" | "shop" | "garden"): void => {
  for (const other of game.household) assign(game, other, other === id ? job : null);
};

describe("how far through her work someone is", () => {
  it("someone with nothing to do is at nothing", () => {
    const game = gameAt(SHOP_OPENS);
    for (const id of game.household) assign(game, id, null);
    run(game, 60);
    expect(progressOf(game, "sage")).toBeNull();
  });

  it("a batch begins at nothing, gains a quarter as each step is done, and begins again at nothing", () => {
    const game = gameAt(SHOP_OPENS);
    game.flour = 100;
    game.shelf.bread = 0;
    only(game, "evelyn", "bake");
    const seen: number[] = [];
    run(game, 2 * HOUR, () => {
      game.shelf.bread = 0;
      const share = progressOf(game, "evelyn")?.share;
      if (share !== null && share !== undefined && share !== seen[seen.length - 1]) seen.push(share);
    });
    // On her way for the flour she is at nothing; a quarter once she has it, a half once it is kneaded, three quarters once it is baked.
    expect([...new Set(seen)].sort()).toEqual([0, 0.25, 0.5, 0.75]);
    until(game, () => game.tasks.evelyn?.job === "bake" && game.tasks.evelyn.step === "fetch", 600);
    expect(progressOf(game, "evelyn")?.share).toBe(0);
    until(game, () => game.tasks.evelyn?.job === "bake" && game.tasks.evelyn.step === "knead", 600);
    expect(progressOf(game, "evelyn")?.share).toBe(0.25);
    // Only with the loaves in her arms is she at the last step of it.
    expect(progressOf(game, "evelyn")?.lastStep).toBe(false);
    until(game, () => game.tasks.evelyn?.job === "bake" && game.tasks.evelyn.step === "deliver", 600);
    expect(progressOf(game, "evelyn")).toEqual({ share: 0.75, waiting: false, lastStep: true });
    expect(Math.max(...seen)).toBeLessThan(1);
    const falls = seen.filter((share, n) => n > 0 && share < seen[n - 1]);
    expect(falls.length).toBeGreaterThan(1);
    // It only ever falls back to nothing: a new batch.
    for (const share of falls) expect(share).toBe(0);
  });

  it("on the last step what is shown goes on towards the whole, ever more slowly, and never gets there", () => {
    expect(nearing(0.75, 0)).toBe(0.75);
    const shown = [1, 2, 4, 8, 16, 60].map((seconds) => nearing(0.75, seconds));
    for (const [n, share] of shown.entries()) {
      expect(share).toBeGreaterThan(n === 0 ? 0.75 : shown[n - 1]);
      expect(share).toBeLessThan(1);
    }
    // After the ten seconds or so that setting a batch on the shelf takes, it is all but whole.
    expect(nearing(0.75, 9.6)).toBeGreaterThan(0.97);
    // Quickly at first: the first second fills more than the fourth does.
    expect(nearing(0.75, 1) - nearing(0.75, 0)).toBeGreaterThan(nearing(0.75, 4) - nearing(0.75, 3));
    // …and from wherever the steps left it: of a thing in two steps, from a half.
    expect(nearing(0.5, 9.6)).toBeGreaterThan(0.95);
    expect(nearing(0.5, 9.6)).toBeLessThan(1);
  });

  it("a baker with no flour is waiting, at the start of a batch", () => {
    const game = gameAt(SHOP_OPENS);
    game.flour = 0;
    only(game, "evelyn", "bake");
    until(game, () => progressOf(game, "evelyn")?.waiting === true, 600);
    expect(progressOf(game, "evelyn")).toEqual({ share: 0, waiting: true, lastStep: false });
  });

  it("a baker waiting her turn at the oven is waiting half way through her batch: at the start of the step she takes up next", () => {
    const game = gameAt(SHOP_OPENS);
    game.flour = 100;
    for (const id of game.household) assign(game, id, id === "rose" ? null : "bake");
    const waitsForOven = (): string | undefined => game.household.find((id) => needOf(game, id) === "oven");
    until(game, () => {
      game.shelf.bread = 0;
      return waitsForOven() !== undefined;
    }, 2 * HOUR);
    expect(progressOf(game, waitsForOven() ?? "")).toEqual({ share: 0.5, waiting: true, lastStep: false });
  });

  it("keeping the shop has no end to measure; with nothing to sell and someone at the counter, she is waiting", () => {
    const game = gameAt(SHOP_OPENS);
    only(game, "rose", "shop");
    run(game, 30);
    expect(progressOf(game, "rose")?.share).toBeNull();
    game.shelf.bread = 0;
    game.shelf.pie = 0;
    until(game, () => progressOf(game, "rose")?.waiting === true, 4 * HOUR);
    expect(progressOf(game, "rose")).toEqual({ share: null, waiting: true, lastStep: false });
  });

  it("the garden's round is the share of the squares in her care that want nothing more today", () => {
    const game = gameAt(SHOP_OPENS);
    only(game, "sage", "garden");
    // Nothing is to be grown: there is no round to be through.
    run(game, 30);
    expect(progressOf(game, "sage")?.share).toBeNull();
    for (const square of [0, 1, 2, 3]) want(game, 0, square, "wheat");
    expect(progressOf(game, "sage")?.share).toBe(0);
    const seen = new Set<number>();
    until(game, () => {
      const share = progressOf(game, "sage")?.share;
      if (typeof share === "number") seen.add(share);
      return share === 1;
    }, 3 * HOUR);
    // Four squares, each sown and then watered: it does not count one done until it wants nothing more.
    expect(progressOf(game, "sage")?.share).toBe(1);
    expect([...seen].sort()).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("an outing is measured against when she is due home at the latest", () => {
    const game = gameAt(SHOP_OPENS);
    game.coin = 1000;
    expect(sendToTown(game, "sage")).toBe(true);
    expect(progressOf(game, "sage")).toEqual({ share: 0, waiting: false, lastStep: false });
    run(game, HOUR);
    const part = progressOf(game, "sage")?.share ?? 0;
    expect(part).toBeGreaterThan(0.3);
    expect(part).toBeLessThan(0.7);
  });

  it("a night's sleep is measured from bedtime to waking", () => {
    const game = gameAt(BEDTIME - 10);
    until(game, () => game.abed.sage === "in", 3 * HOUR);
    const early = progressOf(game, "sage")?.share ?? 1;
    expect(early).toBeLessThan(0.3);
    expect(progressOf(game, "sage")?.waiting).toBe(false);
  });
});
