import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { Nav } from "./nav";
import { nearestEntity, nearestNode } from "./nearest";

const at = (x: number, z: number) => new Vector3(x, 0, z);

describe("nearestEntity", () => {
  it("picks the closest candidate by squared distance", () => {
    const a = { id: "a", position: at(5, 0) };
    const b = { id: "b", position: at(1, 0) };
    expect(nearestEntity([a, b], at(0, 0))).toBe(b);
  });

  it("breaks distance ties by id, deterministically", () => {
    const z = { id: "z", position: at(1, 0) };
    const a = { id: "a", position: at(-1, 0) };
    expect(nearestEntity([z, a], at(0, 0))).toBe(a);
    expect(nearestEntity([a, z], at(0, 0))).toBe(a); // order-independent
  });

  it("returns null for no candidates", () => {
    expect(nearestEntity([], at(0, 0))).toBeNull();
  });
});

describe("nearestNode", () => {
  const nav: Nav = {
    nodeIds: [1, 2, 3],
    positionOf: (id) => at(Number(id), 0),
    findPath: () => [],
  };

  it("resolves positions through the nav port and tie-breaks by stringified id", () => {
    expect(nearestNode([3, 2], at(0, 0), nav)).toBe(2);
    expect(nearestNode([], at(0, 0), nav)).toBeNull();
  });
});
