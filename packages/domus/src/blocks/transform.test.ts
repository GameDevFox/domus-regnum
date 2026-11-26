import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { r90 } from "@kitsune/common";

import { resolveTransform } from "./transform";
import { FreePlacement, GridPlacement } from "./types";

describe("resolveTransform", () => {
  it("passes a free placement through as position + rotation", () => {
    const p: FreePlacement = { block: "lamp", pos: [1.5, 0, 2.5], rotY: r90 };
    expect(resolveTransform(p, 1)).toEqual({ position: new Vector3(1.5, 0, 2.5), rotationY: r90 });
  });

  it("defaults a free placement's rotation to 0", () => {
    const p: FreePlacement = { block: "lamp", pos: [0, 0, 0] };
    expect(resolveTransform(p, 1).rotationY).toBe(0);
  });

  it("centers a grid floor on its cell", () => {
    const p: GridPlacement = { block: "floor", cell: [2, 1] };
    expect(resolveTransform(p, 2)).toEqual({ position: new Vector3(4, 0, 2), rotationY: 0 });
  });

  it("centers a region (size) on its rectangle, not its NW anchor cell", () => {
    // 3×2 region anchored at [0,0]: center cell = (1, 0.5) → world (1, 0, 0.5) at tile 1.
    const p: GridPlacement = { block: "floor", cell: [0, 0], size: [3, 2] };
    expect(resolveTransform(p, 1).position).toEqual(new Vector3(1, 0, 0.5));
    // size [1,1] is identical to no size (the anchor cell center).
    const single: GridPlacement = { block: "floor", cell: [2, 1], size: [1, 1] };
    expect(resolveTransform(single, 2).position).toEqual(new Vector3(4, 0, 2));
  });

  it("sits a grid edge block on the edge and rotates it to run along it", () => {
    const p: GridPlacement = { block: "wall", cell: [1, 1], edge: "E" };
    expect(resolveTransform(p, 2)).toEqual({ position: new Vector3(3, 0, 2), rotationY: r90 });
  });

  it("orients a faced prop without moving it off the cell center", () => {
    const p: GridPlacement = { block: "chair", cell: [0, 0], face: "E" };
    expect(resolveTransform(p, 1)).toEqual({ position: new Vector3(0, 0, 0), rotationY: r90 });
  });

  it("lifts a grid placement to its elevation (multi-level)", () => {
    const floor: GridPlacement = { block: "floor", cell: [2, 1], y: 3.3 };
    expect(resolveTransform(floor, 2).position).toEqual(new Vector3(4, 3.3, 2));
    const wall: GridPlacement = { block: "wall", cell: [1, 1], edge: "E", y: 3.3 };
    expect(resolveTransform(wall, 2).position).toEqual(new Vector3(3, 3.3, 2));
  });
});
