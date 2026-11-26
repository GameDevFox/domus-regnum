import { describe, expect, it } from "vitest";

import { resolveMeasure } from "../types";

import { mergeRanges, resolveOpening, resolveSideHoles, splitRuns } from "./openings";

// resolveSideHoles returns { ranges, touchesStart, touchesEnd }; these cases only assert the ranges.
const resolveHoles = (specs: unknown, side: string, length: number): [number, number][] =>
  resolveSideHoles(specs, side, length).ranges;

describe("resolveMeasure / resolveOpening", () => {
  it("resolves scale·L + offset, unclamped", () => {
    expect(resolveMeasure({ scale: 0.5, offset: 0 }, 6)).toBe(3);
    expect(resolveMeasure({ scale: 0, offset: 0.9 }, 6)).toBe(0.9);
    expect(resolveMeasure({ scale: 1, offset: -0.5 }, 6)).toBe(5.5); // right-aligned w/ margin
    expect(resolveMeasure({ scale: -0.25, offset: 10 }, 6)).toBe(8.5); // negative scale is legal
  });

  it("centers the hole on pos and clamps overhang to the side", () => {
    expect(resolveOpening({ scale: 0.5, offset: 0 }, { scale: 0, offset: 1 }, 6)).toEqual([
      2.5, 3.5,
    ]);
    // Hole centered at the very end: half of it overhangs → clamped.
    expect(resolveOpening({ scale: 1, offset: 0 }, { scale: 0, offset: 1 }, 6)).toEqual([5.5, 6]);
  });

  it("rejects degenerate holes (too narrow, fully outside)", () => {
    expect(resolveOpening({ scale: 0.5, offset: 0 }, { scale: 0, offset: 0.01 }, 6)).toBeNull();
    expect(resolveOpening({ scale: 0, offset: -5 }, { scale: 0, offset: 1 }, 6)).toBeNull();
  });

  it("a door that scales with the wall", () => {
    const size = { scale: 0.25, offset: 0 };
    expect(resolveOpening({ scale: 0.5, offset: 0 }, size, 4)).toEqual([1.5, 2.5]); // 1 m on 4 m
    expect(resolveOpening({ scale: 0.5, offset: 0 }, size, 8)).toEqual([3, 5]); // 2 m on 8 m
  });
});

describe("mergeRanges", () => {
  it("sorts and merges overlapping/touching ranges", () => {
    expect(
      mergeRanges([
        [4, 5],
        [1, 2],
        [1.5, 2.5],
        [2.5, 3],
      ]),
    ).toEqual([
      [1, 3],
      [4, 5],
    ]);
  });
});

describe("splitRuns", () => {
  const tile = 0.5;
  const trim = 0.109; // the corner-post pull-back the walls kind uses at thickness 0.2

  it("no holes → one full-side segment with the post trims (old behavior)", () => {
    const segs = splitRuns(6, [], trim, trim, tile);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ startCell: 0, span: 12 });
    expect(segs[0].trimStart).toBeCloseTo(trim);
    expect(segs[0].trimEnd).toBeCloseTo(trim);
  });

  it("a mid-side hole splits into two segments with exact trims", () => {
    const segs = splitRuns(6, [[2.5, 3.5]], trim, trim, tile);
    expect(segs).toHaveLength(2);
    // Left segment: world [trim, 2.5] → cells [0, 5), trimEnd 0 (2.5 is a cell boundary).
    expect(segs[0]).toMatchObject({ startCell: 0, span: 5 });
    expect(segs[0].start).toBeCloseTo(trim);
    expect(segs[0].end).toBeCloseTo(2.5);
    expect(segs[0].trimEnd).toBeCloseTo(0);
    // Right segment: world [3.5, 6−trim] → cells [7, 12).
    expect(segs[1]).toMatchObject({ startCell: 7, span: 5 });
    expect(segs[1].trimStart).toBeCloseTo(0);
    expect(segs[1].trimEnd).toBeCloseTo(trim);
  });

  it("fractional hole edges land in covering cells with trims", () => {
    const segs = splitRuns(6, [[2.3, 3.6]], trim, trim, tile);
    // Left segment ends at 2.3, inside cell 4 → span covers through cell 4, trimEnd 0.2.
    expect(segs[0]).toMatchObject({ startCell: 0, span: 5 });
    expect(segs[0].trimEnd).toBeCloseTo(0.2);
    // Right segment starts at 3.6, inside cell 7 → starts at cell 7 with trimStart 0.1.
    expect(segs[1]).toMatchObject({ startCell: 7, span: 5 });
    expect(segs[1].trimStart).toBeCloseTo(0.1);
  });

  it("a hole swallowing a side end drops that end's segment (and its post trim)", () => {
    const segs = splitRuns(6, [[0, 1.5]], trim, trim, tile);
    expect(segs).toHaveLength(1);
    expect(segs[0].start).toBeCloseTo(1.5);
    expect(segs[0].trimStart).toBeCloseTo(0); // hole edge, not post trim
    expect(segs[0].trimEnd).toBeCloseTo(trim); // far end still meets its post
  });

  it("a hole wider than the side leaves no segments; slivers are dropped", () => {
    expect(splitRuns(6, [[-1, 7]], trim, trim, tile)).toHaveLength(0);
    // Two holes 5 mm apart — the sliver between them is dropped.
    expect(
      splitRuns(
        6,
        [
          [1, 2.0],
          [2.005, 3],
        ],
        trim,
        trim,
        tile,
      ),
    ).toHaveLength(2);
  });

  it("texture anchors: a segment's world start equals startCell·tile + trimStart", () => {
    splitRuns(6, [[1.7, 2.6]], trim, trim, tile).forEach((s) => {
      expect(s.startCell * tile + s.trimStart).toBeCloseTo(s.start);
      expect((s.startCell + s.span) * tile - s.trimEnd).toBeCloseTo(s.end);
    });
  });
});

describe("resolveHoles", () => {
  const door = { side: "N", pos: { scale: 0.5, offset: 0 }, size: { scale: 0, offset: 1 } };

  it("filters by side, resolves, and merges", () => {
    const specs = [door, { ...door, side: "S" }, null, { bogus: true }];
    expect(resolveHoles(specs, "N", 6)).toEqual([[2.5, 3.5]]);
    expect(resolveHoles(specs, "S", 6)).toEqual([[2.5, 3.5]]);
    expect(resolveHoles(specs, "W", 6)).toEqual([]);
  });

  it("tolerates malformed input without throwing", () => {
    expect(resolveHoles("nonsense", "N", 6)).toEqual([]);
    expect(resolveHoles([{ side: "N", pos: { scale: "x" } }], "N", 6)).toEqual([]);
  });
});

describe("resolveSideHoles — corner touches + per-end trims", () => {
  const hole = (posScale: number, width: number, side = "N") => ({
    side,
    pos: { scale: posScale, offset: 0 },
    size: { scale: 0, offset: width },
  });

  it("flags holes whose UNCLAMPED extent reaches a side end (flush counts)", () => {
    expect(resolveSideHoles([hole(0.5, 1)], "N", 6)).toMatchObject({
      touchesStart: false,
      touchesEnd: false,
    });
    expect(resolveSideHoles([hole(1, 1)], "N", 6).touchesEnd).toBe(true); // overhangs
    expect(resolveSideHoles([hole(0, 1)], "N", 6).touchesStart).toBe(true);
    // Flush: a 2 m hole centered at 1 ends exactly at 0 → touching.
    expect(
      resolveSideHoles(
        [{ side: "N", pos: { scale: 0, offset: 1 }, size: { scale: 0, offset: 2 } }],
        "N",
        6,
      ).touchesStart,
    ).toBe(true);
  });

  it("side null skips the side filter (the two-point wall has no sides)", () => {
    expect(resolveSideHoles([hole(0.5, 1, "E")], null, 6).ranges).toEqual([[2.5, 3.5]]);
  });

  it("per-end trims: a killed corner un-trims only its own end", () => {
    const segs = splitRuns(6, [], 0, 0.109, 0.5);
    expect(segs[0].trimStart).toBe(0); // extends to the open vertex
    expect(segs[0].trimEnd).toBeCloseTo(0.109); // still meets the surviving post
  });
});
