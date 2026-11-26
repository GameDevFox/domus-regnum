import { describe, expect, it } from "vitest";

import { buildGridNav } from "./grid-nav";
import {
  assignHaulTargets,
  bestDetour,
  PerceivedMaid,
  PerceivedMess,
  withinRadius,
} from "./maid-perception";

// A 5×5 unit grid: node id = r*5 + c at world (c, 0, r). So node 0 = (0,0,0), 1 = (1,0,0),
// 2 = (2,0,0), 12 = (2,0,2), 24 = (4,0,4). Distances are plain Euclidean.
const { nav } = buildGridNav(5, 5);
const maidAt = (id: string, node: number, over: Partial<PerceivedMaid> = {}): PerceivedMaid => ({
  id,
  position: nav.positionOf(node).clone(),
  carrying: [],
  state: "idle",
  ...over,
});
const messAt = (id: string, node: number, state = "dirty"): PerceivedMess => ({ id, node, state });

describe("maid-perception · assignHaulTargets", () => {
  it("a maid notices only trash within her radius (the nearer piece, not the far one)", () => {
    const m = maidAt("m0", 0);
    const near = messAt("near", 1); // dist 1
    const far = messAt("far", 24); // dist ~5.66
    const wide = assignHaulTargets([m], [near, far], nav, 2);
    expect(wide.get("m0")).toBe(near); // sees & targets the near one
    const tight = assignHaulTargets([m], [near, far], nav, 0.5);
    expect(tight.has("m0")).toBe(false); // nothing in range → she'll wander/search
  });

  it("the CLOSEST maid within range claims a piece; the tie breaks by id; no double-target", () => {
    const m0 = maidAt("m0", 0); // dist 1 to the piece
    const m1 = maidAt("m1", 2); // dist 1 to the piece (a tie)
    const piece = messAt("p", 1);
    const a = assignHaulTargets([m0, m1], [piece], nav, 5);
    expect(a.get("m0")).toBe(piece); // tie → lower id wins
    expect(a.has("m1")).toBe(false); // the other maid is free for other work — never the same piece
  });

  it("greedy by distance: two maids take the piece each is nearest to", () => {
    const m0 = maidAt("m0", 0);
    const m1 = maidAt("m1", 2);
    const at0 = messAt("at0", 0); // on m0
    const at2 = messAt("at2", 2); // on m1
    const a = assignHaulTargets([m0, m1], [at0, at2], nav, 5);
    expect(a.get("m0")).toBe(at0);
    expect(a.get("m1")).toBe(at2);
  });

  it("a carrying or working maid is not available — she keeps her hands full", () => {
    const carrying = maidAt("m0", 0, { carrying: [{ id: "x" }] });
    const working = maidAt("m1", 0, { state: "working" });
    const piece = messAt("p", 0); // right on them
    expect(assignHaulTargets([carrying, working], [piece], nav, 5).size).toBe(0);
  });

  it("only DIRTY messes are targeted (carried/clean are ignored)", () => {
    const m = maidAt("m0", 0);
    expect(assignHaulTargets([m], [messAt("c", 1, "carried")], nav, 5).size).toBe(0);
    expect(assignHaulTargets([m], [messAt("done", 1, "clean")], nav, 5).size).toBe(0);
  });

  it("withinRadius is inclusive at the boundary", () => {
    expect(withinRadius(nav.positionOf(0), nav.positionOf(2), 2)).toBe(true); // dist exactly 2
    expect(withinRadius(nav.positionOf(0), nav.positionOf(2), 1.99)).toBe(false);
  });
});

describe("maid-perception · bestDetour", () => {
  // Maid at node 0 carrying something, heading to the station at node 24 (the far diagonal corner).
  const maid = maidAt("m", 0, { carrying: [{ id: "first" }] });
  const station = nav.positionOf(24);

  it("picks a piece on the way and skips a big backtrack", () => {
    const onWay = messAt("onway", 12); // node 12 sits ~on the 0→24 diagonal: ~zero extra distance
    const offWay = messAt("offway", 4); // a side corner: a real backtrack
    expect(bestDetour(maid, [onWay, offWay], station, nav, 10, 1)).toBe(onWay);
  });

  it("declines when the only piece is too far off the path (maxDetour) or out of sight (radius)", () => {
    const offWay = messAt("offway", 4); // a side corner: ~2.3 of real backtrack off the 0→24 route
    expect(bestDetour(maid, [offWay], station, nav, 10, 1)).toBeNull(); // 2.3 backtrack > maxDetour 1
    const onWay = messAt("onway", 12);
    expect(bestDetour(maid, [onWay], station, nav, 1, 5)).toBeNull(); // node 12 is ~2.8 away > radius 1
  });
});
