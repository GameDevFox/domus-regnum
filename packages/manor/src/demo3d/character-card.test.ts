import { describe, expect, it } from "vitest";

import { carryingText } from "./character-card";

// What someone carries, in words: by the names the house knows things by.

describe("what she is carrying, in words", () => {
  it("names each thing, not its id, with how many", () => {
    expect(carryingText([{ goods: "bread", count: 4 }])).toBe("Carrying: bread ×4");
    expect(carryingText([{ goods: "teapot", count: 1 }, { goods: "flour", count: 2 }])).toBe("Carrying: teapot ×1, flour ×2");
    // (Where a thing's id is not its name.)
    expect(carryingText([{ goods: "pie", count: 3 }, { goods: "potato", count: 2 }])).toBe("Carrying: berry pie ×3, potatoes ×2");
  });

  it("says nothing is carried when nothing is", () => {
    expect(carryingText([])).toBe("Carrying nothing");
  });
});
