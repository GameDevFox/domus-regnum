import { Mesh, Vector3 } from "three";
import type { BufferGeometry } from "three";
import { describe, expect, it } from "vitest";

import { gableRoof, laidWhereItStands, metreBox, paintOf } from "./parts";

/** BoxGeometry's faces, each of four corners, in the order it lists them. */
const FIRST_CORNER = { east: 0, west: 4, top: 8, bottom: 12, front: 16, back: 20 } as const;
const CORNERS = 4;

type Corner = { at: Vector3; u: number; v: number };

const cornersOf = (geom: BufferGeometry, first: number, count = CORNERS): Corner[] =>
  Array.from({ length: count }, (_, n) => first + n).map((i) => ({ at: new Vector3().fromBufferAttribute(geom.getAttribute("position"), i), u: geom.getAttribute("uv").getX(i), v: geom.getAttribute("uv").getY(i) }));

describe("a box with a pattern a metre to the tile", () => {
  it("shows a tile a metre wide and a metre high whatever its size", () => {
    const us = cornersOf(metreBox(3, 2, 0.2), FIRST_CORNER.front).map((c) => c.u);
    const vs = cornersOf(metreBox(3, 2, 0.2), FIRST_CORNER.front).map((c) => c.v);
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(3);
    expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(2);
  });

  it("carries the pattern from one stretch of a wall into the next, on the front and on the back", () => {
    // Two stretches of one wall: from 1.5 to 4 along it, and from 4 to 4.75. Each is centred on its own middle.
    const stretches = [{ from: 1.5, to: 4 }, { from: 4, to: 4.75 }];
    for (const face of ["front", "back"] as const) {
      const along = stretches.flatMap(({ from, to }) => cornersOf(metreBox(to - from, 1, 0.2, from), FIRST_CORNER[face]).map((c) => ({ x: c.at.x + (from + to) / 2, u: c.u })));
      // The pattern is one function of how far along the wall a corner is: forwards on the front, and backwards on the back, which is seen from the other side.
      const side = face === "front" ? 1 : -1;
      for (const { x, u } of along) expect(u - side * x).toBeCloseTo(0);
    }
  });

  it("carries it up from one stretch into the one standing on it, and may begin it at one height on the front and another on the back", () => {
    const lower = metreBox(2, 0.9, 0.2, 0, 0);
    const upper = metreBox(2, 2.1, 0.2, 0, { front: 0.9, back: 5 });
    const top = (corners: Corner[]): number => Math.max(...corners.map((c) => c.v));
    const foot = (corners: Corner[]): number => Math.min(...corners.map((c) => c.v));
    expect(foot(cornersOf(upper, FIRST_CORNER.front))).toBeCloseTo(top(cornersOf(lower, FIRST_CORNER.front)));
    expect(foot(cornersOf(upper, FIRST_CORNER.back))).toBeCloseTo(5);
    expect(top(cornersOf(upper, FIRST_CORNER.back))).toBeCloseTo(7.1);
    // One figure is for every upright face.
    for (const face of ["east", "west", "front", "back"] as const) expect(foot(cornersOf(metreBox(1, 1, 1, 0, 3), FIRST_CORNER[face]))).toBeCloseTo(3);
  });
});

describe("a pattern laid by where a thing stands", () => {
  const box = (): Mesh => {
    const mesh = new Mesh(metreBox(2, 3, 4), paintOf("#ffffff"));
    mesh.position.set(10, 20, 30);
    return laidWhereItStands(mesh);
  };
  const placed = (mesh: Mesh, face: keyof typeof FIRST_CORNER): Corner[] => cornersOf(mesh.geometry, FIRST_CORNER[face]).map((c) => ({ ...c, at: c.at.add(mesh.position) }));

  it("counts along each upright face the way it is read from outside, and up from the ground", () => {
    const mesh = box();
    for (const c of placed(mesh, "front")) expect([c.u, c.v]).toEqual([c.at.x, c.at.y]);
    for (const c of placed(mesh, "back")) expect([c.u, c.v]).toEqual([-c.at.x, c.at.y]);
    for (const c of placed(mesh, "east")) expect([c.u, c.v]).toEqual([-c.at.z, c.at.y]);
    for (const c of placed(mesh, "west")) expect([c.u, c.v]).toEqual([c.at.z, c.at.y]);
  });

  it("lays what lies flat by the ground under it", () => {
    for (const c of placed(box(), "top")) expect([c.u, c.v]).toEqual([c.at.x, c.at.z]);
  });

  it("can lay one paint of a thing and leave its others: a roof's gables, and not its slates", () => {
    const untouched = gableRoof(4, 6, 2, "z");
    const roof = new Mesh(gableRoof(4, 6, 2, "z"), [paintOf("#111111"), paintOf("#222222")]);
    roof.position.set(7, 6.2, 3);
    laidWhereItStands(roof, 1);
    const [slates, gables] = roof.geometry.groups;
    expect(cornersOf(roof.geometry, slates.start, slates.count).map((c) => [c.u, c.v])).toEqual(cornersOf(untouched, slates.start, slates.count).map((c) => [c.u, c.v]));
    for (const c of cornersOf(roof.geometry, gables.start, gables.count)) {
      const at = c.at.clone().add(roof.position);
      // The south gable is read from the south, the north one from the north.
      expect(c.u).toBeCloseTo(at.z > roof.position.z ? at.x : -at.x);
      expect(c.v).toBeCloseTo(at.y);
    }
  });
});
