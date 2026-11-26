import { describe, expect, it } from "vitest";

import { layersOf } from "./floor-layers";

const stack = (storeys: [string, number][]): string[] => layersOf(storeys.map(([id, y]) => ({ id, name: id, y }))).map((l) => `${l.kind}:${l.id}`);

describe("the floor chooser's stack", () => {
  it("is a roof over a ground floor for a house of one storey", () => {
    expect(stack([["ground", 0]])).toEqual(["roof:house", "ground:ground"]);
  });

  it("puts every extra storey between the ground floor and the roof, highest at the top", () => {
    expect(stack([["ground", 0], ["second", 6.5], ["first", 3.3]])).toEqual(["roof:house", "upper:second", "upper:first", "ground:ground"]);
  });

  it("puts cellars under the ground floor, the deepest at the bottom", () => {
    expect(stack([["vault", -5.6], ["ground", 0], ["cellar", -2.7], ["first", 3.3]])).toEqual(["roof:house", "upper:first", "ground:ground", "cellar:cellar", "cellar:vault"]);
  });

  it("makes this house a roof, the first floor, the ground floor and the cellar", () => {
    expect(stack([["cellar", -2.7], ["ground", 0], ["first", 3.3]])).toEqual(["roof:house", "upper:first", "ground:ground", "cellar:cellar"]);
  });
});
