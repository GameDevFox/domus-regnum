import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { buildGridNav } from "./grid-nav";

describe("buildGridNav", () => {
  it("lays out cols*rows nodes on the XZ plane", () => {
    const { nav, nodes } = buildGridNav(3, 3);
    expect(nav.nodeIds).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(nodes).toHaveLength(9);
    expect(nav.positionOf(0)).toEqual(new Vector3(0, 0, 0));
    expect(nav.positionOf(4)).toEqual(new Vector3(1, 0, 1)); // center
    expect(nav.positionOf(8)).toEqual(new Vector3(2, 0, 2)); // far corner
  });

  it("emits one wireframe edge per 4-connected link", () => {
    // right edges: (cols-1)*rows = 6; down edges: cols*(rows-1) = 6
    expect(buildGridNav(3, 3).edges).toHaveLength(12);
  });

  it("finds a path corner-to-corner, inclusive of both ends", () => {
    const { nav } = buildGridNav(3, 3);
    const path = nav.findPath(0, 8);
    expect(path[0]).toEqual(new Vector3(0, 0, 0));
    expect(path[path.length - 1]).toEqual(new Vector3(2, 0, 2));
    expect(path).toHaveLength(5); // 4 grid steps -> 5 nodes
  });

  it("returns a single point for a same-node path", () => {
    const { nav } = buildGridNav(3, 3);
    expect(nav.findPath(4, 4)).toEqual([new Vector3(1, 0, 1)]);
  });
});
