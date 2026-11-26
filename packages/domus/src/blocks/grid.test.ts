import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { r90 } from "@kitsune/common";

import {
  cellCenter,
  cellEdgeKey,
  edgeKey,
  edgeMidpoint,
  edgeRotationY,
  facingRotationY,
  opposite,
  step,
} from "./grid";

describe("grid", () => {
  it("steps to the neighbouring cell in each direction", () => {
    expect(step([2, 3], "N")).toEqual([2, 2]);
    expect(step([2, 3], "S")).toEqual([2, 4]);
    expect(step([2, 3], "E")).toEqual([3, 3]);
    expect(step([2, 3], "W")).toEqual([1, 3]);
  });

  it("knows opposite directions", () => {
    expect(opposite("N")).toBe("S");
    expect(opposite("E")).toBe("W");
  });

  it("places cell centers on the XZ plane at tile spacing", () => {
    expect(cellCenter([0, 0], 2)).toEqual(new Vector3(0, 0, 0));
    expect(cellCenter([3, 1], 2)).toEqual(new Vector3(6, 0, 2));
  });

  it("puts edge midpoints half a tile off the cell center", () => {
    expect(edgeMidpoint([1, 1], "N", 2)).toEqual(new Vector3(2, 0, 1)); // -Z half tile
    expect(edgeMidpoint([1, 1], "S", 2)).toEqual(new Vector3(2, 0, 3));
    expect(edgeMidpoint([1, 1], "E", 2)).toEqual(new Vector3(3, 0, 2));
    expect(edgeMidpoint([1, 1], "W", 2)).toEqual(new Vector3(1, 0, 2));
  });

  it("rotates E/W wall slabs 90° and leaves N/S unrotated", () => {
    expect(edgeRotationY("N")).toBe(0);
    expect(edgeRotationY("S")).toBe(0);
    expect(edgeRotationY("E")).toBe(r90);
    expect(edgeRotationY("W")).toBe(r90);
  });

  it("faces props S at zero rotation, CCW from there (S→E→N→W)", () => {
    expect(facingRotationY("S")).toBe(0);
    expect(facingRotationY("E")).toBe(r90);
    expect(facingRotationY("N")).toBe(r90 * 2);
    expect(facingRotationY("W")).toBe(r90 * 3);
  });

  it("canonicalizes an edge key regardless of which side names it", () => {
    // The E edge of [1,1] and the W edge of [2,1] are the same physical edge.
    expect(cellEdgeKey([1, 1], "E")).toBe(cellEdgeKey([2, 1], "W"));
    // edgeKey is order-independent.
    expect(edgeKey([1, 1], [2, 1])).toBe(edgeKey([2, 1], [1, 1]));
  });
});
