import { Mesh, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import { Scope } from "@scene-lib/scope";
import { Value } from "@scene-lib/value";

import type { Rect } from "../space";
import { GRAVEL, Grounds, Roofs } from "./exterior";

/** Whether two rectangles share any ground: touching along an edge is not sharing. */
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;
const area = (r: Rect): number => r.w * r.d;

describe("the gravel", () => {
  it("is laid in lengths none of which lies over another: two at one height on the same ground fight for the same pixels", () => {
    for (const [n, one] of GRAVEL.entries()) for (const other of GRAVEL.slice(n + 1)) expect(overlap(one, other), `${JSON.stringify(one)} and ${JSON.stringify(other)}`).toBe(false);
  });

  it("still covers the drive from the gate to the steps, the walk along the shop front, and the path from the back door", () => {
    const covers = (x: number, z: number): boolean => GRAVEL.some((r) => x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d);
    // Down the middle of the drive, from the gate to the foot of the steps; where it crosses the walk among them.
    for (const z of [21.9, 18, 14.4, 13.7, 13.1, 12.9]) expect(covers(10, z), `the drive at ${z}`).toBe(true);
    for (const x of [1.8, 5, 9, 11]) expect(covers(x, 13.7), `the walk at ${x}`).toBe(true);
    for (const z of [-5.1, -2, 0.7]) expect(covers(3.25, z), `the back path at ${z}`).toBe(true);
    // No more ground than the three were when two of them lay across each other: 1.8 × 9.2, 9.4 × 1.3 and 1.2 × 6, less the crossing.
    expect(GRAVEL.map(area).reduce((sum, a) => sum + a, 0)).toBeCloseTo(1.8 * 9.2 + 9.4 * 1.3 + 1.2 * 6 - 1.8 * 1.3);
  });
});

/** A canvas that takes paint and keeps none: only where a pattern is laid is looked at here. */
const blank: unknown = new Proxy(() => undefined, { get: () => blank, apply: () => blank, set: () => true });
const blankDocument = { createElement: () => ({ width: 0, height: 0, getContext: () => blank }) };
/** Every corner of every mesh under a root that wears a pattern of this name, with where it stands and its place in the pattern. */
const cornersWearing = (root: Mesh["parent"] & object, pattern: string): { at: Vector3; facing: Vector3; u: number; v: number }[] => {
  const corners: { at: Vector3; facing: Vector3; u: number; v: number }[] = [];
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.updateMatrix();
    const { position, normal, uv } = o.geometry.attributes;
    const ranges = o.geometry.groups.length > 0 ? o.geometry.groups : [{ start: 0, count: o.geometry.index ? o.geometry.index.count : position.count, materialIndex: 0 }];
    for (const { start, count, materialIndex } of ranges) {
      // One paint is worn all over; of several, each part wears its own.
      const paint = Array.isArray(o.material) ? o.material[materialIndex ?? 0] : o.material;
      if (paint?.map?.name !== pattern) continue;
      for (let k = start; k < start + count; k++) {
        const i = o.geometry.index ? o.geometry.index.getX(k) : k;
        corners.push({ at: new Vector3().fromBufferAttribute(position, i).applyMatrix4(o.matrix), facing: new Vector3().fromBufferAttribute(normal, i).transformDirection(o.matrix), u: uv.getX(i), v: uv.getY(i) });
      }
    }
  });
  return corners;
};

describe("what is outside the rooms", () => {
  it("carries the walls' courses of brick up into the gables and the chimneys: every course at its height from the ground", () => {
    vi.stubGlobal("document", blankDocument);
    const upright = cornersWearing(Roofs(Scope()).mesh, "other:brick").filter((c) => Math.abs(c.facing.y) < 0.5);
    expect(upright.length).toBeGreaterThan(40);
    for (const c of upright) expect(c.v).toBeCloseTo(c.at.y, 4);
  });

  it("lays the gravel by the ground under it, so that the lengths of a path are one gravel", () => {
    vi.stubGlobal("document", blankDocument);
    const tops = cornersWearing(Grounds(Scope(), { life: Value(0), lit: Value(0) }).mesh, "floor:gravel").filter((c) => c.facing.y > 0.5);
    expect(tops.length).toBeGreaterThanOrEqual(GRAVEL.length * 4);
    for (const c of tops) {
      expect(c.u).toBeCloseTo(c.at.x, 4);
      expect(c.v).toBeCloseTo(c.at.z, 4);
    }
  });
});
