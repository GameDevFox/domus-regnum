import { Mesh, Object3D } from "three";
import { describe, expect, it } from "vitest";

import { Scope } from "@kitsune/common-web/src/scope";

import { defaultBlocks } from "./block-kinds";

// Total triangles across a built block's meshes (indexed and non-indexed geometry).
const triangles = (root: Object3D): number => {
  let total = 0;
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const g = o.geometry;
    total += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return total;
};

describe("defaultBlocks", () => {
  it("every registered kind builds an Object3D mesh without throwing", () => {
    for (const [id, factory] of Object.entries(defaultBlocks)) {
      const built = factory(Scope(), { tile: 1 });
      expect(built.mesh, `block "${id}" should return a mesh`).toBeInstanceOf(Object3D);
    }
  });

  it("every kind stays within the PS1-density triangle budget", () => {
    // The game's look is PS1/PS2 poly density — curved props use 6-10 cylinder sides and small
    // sphere grids (see furniture.ts). A default-segment SphereGeometry is 960 tris and a 14×12
    // one is 308; this catches any geometry creeping back toward smooth. The ceiling is sized to
    // the stair (18 solid treads ≈ 216), the busiest legitimate block.
    for (const [id, factory] of Object.entries(defaultBlocks)) {
      const built = factory(Scope(), { tile: 1 });
      expect(
        triangles(built.mesh),
        `block "${id}" exceeds the triangle budget`,
      ).toBeLessThanOrEqual(250);
    }
  });

  it("respects color/size params where they apply", () => {
    const wall = defaultBlocks.wall(Scope(), { tile: 2, height: 3 });
    // The wall slab spans the tile in X and the requested height in Y (bottom resting on y=0).
    expect(wall.mesh.position.y).toBe(0);
  });
});
