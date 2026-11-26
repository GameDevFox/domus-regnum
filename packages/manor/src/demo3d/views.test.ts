import { describe, expect, it } from "vitest";

import type { FloorId, Stair, Storey } from "../space";
import type { View } from "./house-view";
import { bandOf, lampFloor, stepView, viewFollowing } from "./views";

describe("going up and down floors", () => {
  it("climbs cellar, ground, first, and above the top floor shows the whole house", () => {
    expect(stepView("cellar", 1)).toBe("ground");
    expect(stepView("ground", 1)).toBe("first");
    expect(stepView("first", 1)).toBe("house");
  });

  it("comes back down the same way", () => {
    expect(stepView("house", -1)).toBe("first");
    expect(stepView("first", -1)).toBe("ground");
    expect(stepView("ground", -1)).toBe("cellar");
  });

  it("stops at the top and at the bottom", () => {
    expect(stepView("house", 1)).toBe("house");
    expect(stepView("cellar", -1)).toBe("cellar");
  });
});

const STOREYS: Record<FloorId, Storey> = { cellar: { name: "Cellar", y: -2.7, height: 2.4 }, ground: { name: "Ground floor", y: 0, height: 3 }, first: { name: "First floor", y: 3.3, height: 2.9 } };
const flight = (lower: FloorId, upper: FloorId): Stair => ({ id: `${lower}-${upper}`, lower, upper, x: 0, zFoot: 4, zHead: 0, width: 1 });
const shownAt = (view: View, y: number): boolean => {
  const { low, high } = bandOf(STOREYS, view);
  return y >= low && y < high;
};

describe("who is on show in a view", () => {
  it("is everyone standing on a storey it draws, and nobody on the storey above", () => {
    expect(shownAt("ground", 0)).toBe(true);
    expect(shownAt("ground", 3.3)).toBe(false);
    expect(shownAt("cellar", -2.7)).toBe(true);
    expect(shownAt("cellar", 0)).toBe(false);
    expect(shownAt("first", 0)).toBe(true);
    expect(shownAt("first", 3.3)).toBe(true);
    expect(shownAt("house", 3.3)).toBe(true);
  });

  it("is someone all the way up a stair, through the thickness of the floor above", () => {
    // The ground storey's ceiling is at 3 m and the floor above at 3.3 m: the last steps are between.
    expect(shownAt("ground", 3.2)).toBe(true);
    expect(shownAt("cellar", -0.2)).toBe(true);
  });

  it("is not someone under the storeys it draws", () => {
    expect(shownAt("ground", -1)).toBe(false);
    expect(shownAt("house", -2.7)).toBe(false);
  });

  it("is nobody twice: a height is on show in the cellar or looking into the ground floor, never both", () => {
    for (let y = -2.7; y < 3.2; y += 0.01) expect(shownAt("cellar", y), `at ${y.toFixed(2)} m`).toBe(!shownAt("ground", y));
  });
});

describe("the view that follows someone", () => {
  it("is the storey she stands on", () => {
    expect(viewFollowing("ground", "ground", null)).toBe("ground");
    expect(viewFollowing("first", "ground", null)).toBe("ground");
    expect(viewFollowing("ground", "cellar", null)).toBe("cellar");
    expect(viewFollowing("cellar", "first", null)).toBe("first");
  });

  it("goes down to the cellar as soon as she is on the cellar stair, since nothing above ground draws it", () => {
    expect(viewFollowing("ground", null, flight("cellar", "ground"))).toBe("cellar");
    expect(viewFollowing("first", null, flight("cellar", "ground"))).toBe("cellar");
  });

  it("stays where she set out from while she climbs, until she steps off at the top", () => {
    expect(viewFollowing("cellar", null, flight("cellar", "ground"))).toBe("cellar");
    expect(viewFollowing("ground", null, flight("ground", "first"))).toBe("ground");
  });

  it("goes down to the storey below as soon as she is on the stair down to it, so that it is seen as she comes down", () => {
    expect(viewFollowing("first", null, flight("ground", "first"))).toBe("ground");
  });

  it("comes up out of the cellar for someone on the main stair", () => {
    expect(viewFollowing("cellar", null, flight("ground", "first"))).toBe("ground");
  });

  it("leaves the whole house as it is, wherever she goes", () => {
    expect(viewFollowing("house", "cellar", null)).toBe("house");
    expect(viewFollowing("house", null, flight("cellar", "ground"))).toBe("house");
  });

  it("stays put for someone between storeys on no stair that is known", () => {
    expect(viewFollowing("ground", null, null)).toBe("ground");
  });
});

describe("whose lamps throw light", () => {
  it("is the storey being looked into", () => {
    expect([lampFloor("cellar"), lampFloor("ground"), lampFloor("first")]).toEqual(["cellar", "ground", "first"]);
  });

  it("is nobody's with the whole house on show, its rooms being under their roofs", () => {
    expect(lampFloor("house")).toBeNull();
  });
});
