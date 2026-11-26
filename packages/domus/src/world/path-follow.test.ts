import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { pathLength, pointAtDistance } from "./path-follow";

const v = (x: number, y = 0, z = 0) => new Vector3(x, y, z);

describe("pathLength", () => {
  it("is 0 for empty and single-point paths", () => {
    expect(pathLength([])).toBe(0);
    expect(pathLength([v(3)])).toBe(0);
  });

  it("sums segment lengths", () => {
    expect(pathLength([v(0), v(3)])).toBe(3);
    expect(pathLength([v(0), v(1), v(1, 1)])).toBe(2); // 1 along x, then 1 along y
  });
});

describe("pointAtDistance", () => {
  const path = [v(0), v(1), v(3)]; // total length 3

  it("returns the start at or before distance 0", () => {
    expect(pointAtDistance(path, 0)).toEqual(v(0));
    expect(pointAtDistance(path, -5)).toEqual(v(0));
  });

  it("returns the end at exactly the path length", () => {
    expect(pointAtDistance(path, 3)).toEqual(v(3));
  });

  it("clamps to the end past the path length", () => {
    expect(pointAtDistance(path, 99)).toEqual(v(3));
  });

  it("interpolates within a segment, across the segment boundary", () => {
    expect(pointAtDistance(path, 0.5)).toEqual(v(0.5)); // first segment
    expect(pointAtDistance(path, 1)).toEqual(v(1)); // exactly the joint
    expect(pointAtDistance(path, 2)).toEqual(v(2)); // halfway along second segment
  });

  it("does not mutate the input path", () => {
    const before = path.map((p) => p.clone());
    pointAtDistance(path, 1.5);
    path.forEach((p, i) => expect(p).toEqual(before[i]));
  });

  it("throws on an empty path", () => {
    expect(() => pointAtDistance([], 1)).toThrow();
  });
});
