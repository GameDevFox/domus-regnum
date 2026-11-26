import { describe, expect, it } from "vitest";

import { cellCenter } from "../../blocks/grid";
import { FreePlacement, GridPlacement } from "../../blocks/types";

import { isSelectable, isSelectablePlacement, placementFor, spanFor } from "./placement-model";

describe("placement-model", () => {
  it("spanFor: windows span 2 cells, everything else spans 1", () => {
    expect(spanFor("window")).toBe(2);
    expect(spanFor("wall")).toBe(1);
    expect(spanFor("doorway")).toBe(1);
    expect(spanFor("chair")).toBe(1);
  });

  it("isSelectable: everything is grabbable except the floor and auto-derived corners", () => {
    expect(isSelectable("chair")).toBe(true);
    expect(isSelectable("lamp")).toBe(true);
    expect(isSelectable("table")).toBe(true);
    expect(isSelectable("wall")).toBe(true); // structural edges are now grabbable (no erase tool)
    expect(isSelectable("doorway")).toBe(true);
    expect(isSelectable("window")).toBe(true);
    expect(isSelectable("floor")).toBe(false); // clicking the ground shouldn't grab tiles
    expect(isSelectable("corner")).toBe(false); // regenerated from walls
  });

  it("isSelectablePlacement: a region floor is grabbable, a single floor tile is not", () => {
    expect(isSelectablePlacement({ block: "floor", cell: [0, 0], size: [4, 3] })).toBe(true);
    expect(isSelectablePlacement({ block: "floor", cell: [0, 0], size: [1, 1] })).toBe(false);
    expect(isSelectablePlacement({ block: "floor", cell: [0, 0] })).toBe(false); // plain tile
    expect(isSelectablePlacement({ block: "chair", cell: [0, 0] })).toBe(true); // unchanged for props
  });

  it("places an edge block on the cell edge with its span", () => {
    const p = placementFor("wall", [1, 1], "E", 0, 1) as GridPlacement;
    expect(p).toEqual({ block: "wall", cell: [1, 1], edge: "E", span: 1, y: undefined });
    expect((placementFor("window", [0, 0], "N", 0, 1) as GridPlacement).span).toBe(2);
  });

  it("places a free block (light) at the cell center, carrying its world Y", () => {
    const p = placementFor("lamp", [2, 3], "N", 0, 0.5) as FreePlacement;
    const c = cellCenter([2, 3], 0.5);
    expect(p.pos).toEqual([c.x, 0, c.z]);
    expect((placementFor("lamp", [2, 3], "N", 2, 0.5) as FreePlacement).pos[1]).toBe(2);
  });

  it("places a grid prop facing its direction, omitting y when 0 and keeping it otherwise", () => {
    expect(placementFor("chair", [0, 0], "S", 0, 1)).toEqual({
      block: "chair",
      cell: [0, 0],
      face: "S",
      y: undefined,
    });
    const lifted = placementFor("chair", [0, 0], "S", 3.3, 1) as GridPlacement;
    expect(lifted.y).toBe(3.3);
  });
});
