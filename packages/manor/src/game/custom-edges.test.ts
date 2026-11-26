import { describe, expect, it } from "vitest";

import { newMorning } from "./custom";
import { gameAt } from "./test-kit";
import { CUSTOM_STEP } from "./tuning";

// How yesterday's trade is reckoned up as the house wakes (custom.ts): the custom grows for a
// shop that sold something and sent nobody away, and for no other.

/** A game whose yesterday was so many sold and so many sent away; and the custom it had. */
const after = (sold: number, lost: number): { custom: number; today: { sold: number; lost: number }; before: number } => {
  const game = gameAt();
  game.today = { sold, lost };
  const before = game.custom;
  newMorning(game);
  return { custom: game.custom, today: game.today, before };
};

describe("the custom of the shop, as the house wakes", () => {
  it("grows by a step for a day on which something was sold and nobody was sent away", () => {
    const { custom, before } = after(5, 0);
    expect(custom).toBe(before + CUSTOM_STEP);
  });

  it("stays as it was for a day on which one went without, however much was sold", () => {
    const { custom, before } = after(5, 1);
    expect(custom).toBe(before);
    expect(after(5, 3).custom).toBe(before);
  });

  it("stays as it was for a day on which nothing was sold, and nobody was sent away either", () => {
    const { custom, before } = after(0, 0);
    expect(custom).toBe(before);
  });

  it("starts the next day's reckoning from nothing, whichever way yesterday went", () => {
    for (const [sold, lost] of [[5, 0], [5, 2], [0, 0], [0, 4]]) expect(after(sold, lost).today).toEqual({ sold: 0, lost: 0 });
  });
});
