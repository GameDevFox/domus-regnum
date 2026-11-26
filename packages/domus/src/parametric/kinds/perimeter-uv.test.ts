import { describe, expect, it } from "vitest";

import { Rect } from "../types";

import { perimeterUv } from "./perimeter-uv";

// The wallpaper must flow continuously around both circuits, with the corner posts CONSUMING
// arc length like a real papered pilaster: side start + side length + postSize = next side's
// start, each post face hands off seamlessly to its run, and a post's two faces show
// CONSECUTIVE windows (the same-slice shortcut printed pattern borders twice — "double seams").
describe("perimeterUv", () => {
  // Rects are world METERS (doc v2) — side lengths are direct.
  const cases: { name: string; rect: Rect; post: number }[] = [
    {
      name: "Graph Room (6×5 m)",
      rect: { x: -3, y: 0, z: -2.5, w: 6, d: 5 },
      post: 0.22,
    },
    {
      name: "asymmetric (3×7 m)",
      rect: { x: 2, y: 0, z: 1, w: 3, d: 7 },
      post: 0.32,
    },
  ];

  cases.forEach(({ name, rect, post }) => {
    const w = rect.w;
    const h = rect.d;
    const P = 2 * (w + h) + 4 * post; // posts consume arc length
    const half = post / 2;
    const { sides, corners } = perimeterUv(rect, post);

    it(`interior circuit is continuous, post-spaced — ${name}`, () => {
      // Clockwise N→E→S→W from NW. Interior faces: N.front, E.back, S.back, W.front.
      expect(sides.N.front).toBe(0);
      expect(sides.E.back).toBeCloseTo(sides.N.front + w + post);
      expect(sides.S.back).toBeCloseTo(sides.E.back + h + post);
      expect(sides.W.front).toBeCloseTo(sides.S.back + w + post);
      expect(sides.W.front + h + post).toBeCloseTo(P); // closes the loop
    });

    it(`exterior circuit is continuous, post-spaced — ${name}`, () => {
      // Counterclockwise N→W→S→E from NE. Exterior faces: N.back, W.back, S.front, E.front.
      expect(sides.N.back).toBe(0);
      expect(sides.W.back).toBeCloseTo(sides.N.back + w + post);
      expect(sides.S.front).toBeCloseTo(sides.W.back + h + post);
      expect(sides.E.front).toBeCloseTo(sides.S.front + w + post);
      expect(sides.E.front + h + post).toBeCloseTo(P);
    });

    it(`post faces continue their adjoining sides exactly — ${name}`, () => {
      // Arrival face = [side end − half, side end + half]; departure = [start − half, start + half].
      // Interior, NE corner (arrive along N, depart along E):
      expect(corners.NE.uPosZ).toBeCloseTo(sides.N.front + w - half); // N-plane face continues N
      expect(corners.NE.uNegX).toBeCloseTo(sides.E.back - half); // E-plane face leads into E
      // Exterior, NW corner (arrive along N, depart along W):
      expect(corners.NW.uNegZ).toBeCloseTo(sides.N.back + w - half);
      expect(corners.NW.uNegX).toBeCloseTo(sides.W.back - half);
      // Interior, SW corner (arrive along S, depart along W):
      expect(corners.SW.uNegZ).toBeCloseTo(sides.S.back + w - half);
      expect(corners.SW.uPosX).toBeCloseTo(sides.W.front - half);
      // Exterior, SE corner (arrive along S, depart along E):
      expect(corners.SE.uPosZ).toBeCloseTo(sides.S.front + w - half);
      expect(corners.SE.uPosX).toBeCloseTo(sides.E.front - half);
    });

    it(`a post's two circuit faces are CONSECUTIVE windows, never the same slice — ${name}`, () => {
      // The turn consumes the post's width: departure − arrival = postSize at every corner, on
      // both circuits (the same-slice regression would make these differences 0).
      expect(corners.NE.uNegX - corners.NE.uPosZ).toBeCloseTo(post); // interior turn at NE
      expect(corners.SE.uNegZ - corners.SE.uNegX).toBeCloseTo(post); // interior turn at SE
      expect(corners.SW.uPosX - corners.SW.uNegZ).toBeCloseTo(post); // interior turn at SW
      expect(corners.NW.uNegX - corners.NW.uNegZ).toBeCloseTo(post); // exterior turn at NW
      expect(corners.SW.uPosZ - corners.SW.uNegX).toBeCloseTo(post); // exterior turn at SW
      expect(corners.SE.uPosX - corners.SE.uPosZ).toBeCloseTo(post); // exterior turn at SE
    });
  });
});
