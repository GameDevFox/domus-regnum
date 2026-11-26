import { describe, expect, it } from "vitest";

import { NOBODY, viewAcross } from "./follow-across";

// Whoever is followed is followed from the house to the map and back.

describe("the view, as whoever is followed leaves the property or comes home", () => {
  it("goes to the map as she goes out at the gate, and to the house as she comes in at it", () => {
    expect(viewAcross({ id: "sage", abroad: false }, { id: "sage", abroad: true })).toBe("map");
    expect(viewAcross({ id: "sage", abroad: true }, { id: "sage", abroad: false })).toBe("house");
  });

  it("stays where it is while she stays where she is, at home or out", () => {
    expect(viewAcross({ id: "sage", abroad: false }, { id: "sage", abroad: false })).toBeNull();
    expect(viewAcross({ id: "sage", abroad: true }, { id: "sage", abroad: true })).toBeNull();
  });

  it("is not moved by someone else being chosen, wherever she is, nor by nobody being followed", () => {
    expect(viewAcross({ id: "rose", abroad: false }, { id: "sage", abroad: true })).toBeNull();
    expect(viewAcross(NOBODY, { id: "sage", abroad: true })).toBeNull();
    expect(viewAcross({ id: "sage", abroad: true }, NOBODY)).toBeNull();
    expect(viewAcross(NOBODY, NOBODY)).toBeNull();
  });
});
