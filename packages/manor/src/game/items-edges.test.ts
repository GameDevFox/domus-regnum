import { describe, expect, it } from "vitest";

import { ITEMS } from "./items";
import { outingOf } from "./outing";
import { sendToTown } from "./outing-send";
import { gameAt } from "./test-kit";

// The house's things, at the edges of what is shown on the books.

describe("the page of things", () => {
  it("shows what is in the pantry though it was never found at a place, and what is worn by how many the house has", () => {
    const game = gameAt();
    expect(ITEMS.berries.shown?.(game)).toBe(false);
    game.stock.berries = 2;
    expect(ITEMS.berries.shown?.(game)).toBe(true);
    const says = (): string[] => {
      const intel = ITEMS.gloves.intel;
      if (intel.kind !== "thing" || intel.is !== "plain") throw new Error("gloves are a plain thing");
      return intel.says(game);
    };
    expect(says()[2]).toBe("The house has none");
    game.wardrobe.gloves = 1;
    expect(says()[2]).toBe("The house has 1");
  });
});

describe("what was come upon and is not yet home", () => {
  it("is on the books from the moment it is found, though the house has none of it yet", () => {
    const game = gameAt();
    sendToTown(game, "sage");
    const outing = outingOf(game, "sage");
    if (!outing) throw new Error("she was not sent");
    expect(ITEMS.tablet.shown?.(game)).toBe(false);
    outing.found.push("tablet");
    expect(ITEMS.tablet.shown?.(game)).toBe(true);
    expect(ITEMS.tablet.count(game)).toBe(0);
  });
});
