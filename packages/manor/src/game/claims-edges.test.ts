import { describe, expect, it } from "vitest";

import { claim, release, releaseAll } from "./claims";
import { gameAt } from "./test-kit";

// The places one person uses at a time: whose they are, who may give them up, and what is given up with a person.

describe("a claim", () => {
  it("is taken by whoever asks first, and taken again by her without harm", () => {
    const game = gameAt();
    expect(claim(game, "oven", "evelyn")).toBe(true);
    expect(claim(game, "oven", "evelyn")).toBe(true);
    expect(game.claims.oven).toBe("evelyn");
  });

  it("is not given to a second person while it is held", () => {
    const game = gameAt();
    claim(game, "oven", "evelyn");
    expect(claim(game, "oven", "rose")).toBe(false);
    expect(game.claims.oven).toBe("evelyn");
  });

  it("is given up only by whoever holds it", () => {
    const game = gameAt();
    claim(game, "oven", "evelyn");
    release(game, "oven", "rose");
    expect(game.claims.oven).toBe("evelyn");
    release(game, "oven", "evelyn");
    expect(game.claims.oven).toBeUndefined();
    expect(claim(game, "oven", "rose")).toBe(true);
  });

  it("is given up with everything else someone held, and nobody else's goes with it", () => {
    const game = gameAt();
    claim(game, "oven", "evelyn");
    claim(game, "table.1", "evelyn");
    claim(game, "table.2", "rose");
    claim(game, "table.3", "evelyn");
    releaseAll(game, "evelyn");
    expect(game.claims).toEqual({ "table.2": "rose" });
  });
});
