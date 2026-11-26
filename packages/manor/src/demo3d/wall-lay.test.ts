import { BoxGeometry, Mesh } from "three";
import type { Group, Material, MeshLambertMaterial, Object3D } from "three";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { Scope } from "@scene-lib/scope";

import { FLOOR_ORDER, HOUSE, deriveWalls, stairWells } from "../space";
import type { FloorId } from "../space";
import { CUT_HEIGHT, StoreyShell, WALL_THICKNESS } from "./shell";

// The pattern on a wall is one pattern, however many boxes the wall is built of: it does not begin again beside a window, above a door,
// or at the rail. Every wall of the real house is built here and each of its faces looked at, corner by corner.

/** The corners of a box's front (+Z) and back (-Z) faces, as BoxGeometry lists them, and which of a box's six skins each wears. */
const FACES = { front: { first: 16, skin: 4, side: 1 }, back: { first: 20, skin: 5, side: -1 } } as const;
const CORNERS = 4;
/** A corner's place in a pattern is kept as a 32-bit figure: two are the same when this close. */
const CLOSE = 1e-4;

type Corner = { x: number; y: number; u: number; v: number; upper: boolean };
type Face = { wall: string; face: keyof typeof FACES; pattern: string; corners: Corner[] };

/** A canvas that takes paint and keeps none: the patterns are not looked at here, only where they are laid. */
const blankDocument = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => undefined, set: () => true }) }) };

const stretchesOf = (part: Object3D): Mesh<BoxGeometry, Material[]>[] =>
  part.children.filter((o): o is Mesh<BoxGeometry, Material[]> => o instanceof Mesh && o.geometry instanceof BoxGeometry && Array.isArray(o.material) && Math.abs(o.geometry.parameters.depth - WALL_THICKNESS) < CLOSE);

/** Every patterned face of every wall of a storey: each corner of each box of it, by where it is along the wall and above the floor. */
const facesOf = (floor: FloorId): Face[] => {
  const walls = deriveWalls(HOUSE);
  const shell = StoreyShell(Scope(), { plan: HOUSE, floor, walls, wells: stairWells(HOUSE, floor) });
  return shell.uppers.flatMap(({ object, wall }) => {
    // A wall's lower part is put on the storey just before its upper part.
    const lower = shell.mesh.children[shell.mesh.children.indexOf(object) - 1] as Group;
    return (["front", "back"] as const).flatMap((face): Face[] => {
      const { first, skin } = FACES[face];
      const corners: Corner[] = [];
      let pattern = "";
      for (const [part, upper] of [[lower, false], [object, true]] as [Group, boolean][]) {
        for (const box of stretchesOf(part)) {
          const map = (box.material[skin] as MeshLambertMaterial).map;
          if (!map) continue;
          pattern = pattern || map.name.split(":").slice(0, 2).join(":");
          const { position, uv } = box.geometry.attributes;
          for (let i = first; i < first + CORNERS; i++) corners.push({ x: box.position.x + position.getX(i), y: box.position.y + position.getY(i) + (upper ? CUT_HEIGHT : 0), u: uv.getX(i), v: uv.getY(i), upper });
        }
      }
      return corners.length > 0 ? [{ wall: `${floor} ${wall.axis} at ${wall.at} from ${wall.from} to ${wall.to}`, face, pattern, corners }] : [];
    });
  });
};

/** The values a figure takes over some corners, each once: one value when the pattern is one. */
const spread = (corners: Corner[], of: (c: Corner) => number): number[] => corners.map(of).reduce<number[]>((seen, n) => (seen.some((s) => Math.abs(s - n) < CLOSE) ? seen : [...seen, n]), []);

describe("the pattern on a wall", () => {
  let faces: Face[] = [];
  beforeAll(() => {
    vi.stubGlobal("document", blankDocument);
    faces = FLOOR_ORDER.flatMap(facesOf);
  });

  it("is looked at on walls with windows and doors in them, inside and out", () => {
    expect(faces.length).toBeGreaterThan(40);
    expect(faces.some((f) => f.pattern === "other:brick" && f.corners.length > CORNERS * 4)).toBe(true);
    expect(faces.some((f) => f.pattern.startsWith("paper:") && f.corners.length > CORNERS * 4)).toBe(true);
  });

  it("runs straight along the wall, through every box of it, on the front and on the back", () => {
    for (const { wall, face, corners } of faces) expect(spread(corners, (c) => c.u - FACES[face].side * c.x), `${wall}, ${face}`).toHaveLength(1);
  });

  it("is at one height in every box of a wall's upper part, and of its lower: over a door and over a window as beside them", () => {
    for (const { wall, face, corners } of faces) {
      for (const upper of [false, true]) expect(spread(corners.filter((c) => c.upper === upper), (c) => c.v - c.y).length, `${wall}, ${face}, ${upper ? "upper" : "lower"}`).toBeLessThanOrEqual(1);
    }
  });

  it("is laid from the ground up where it is brick: through the rail, and from storey to storey", () => {
    for (const floor of FLOOR_ORDER) {
      for (const { wall, face, corners } of facesOf(floor).filter((f) => f.pattern === "other:brick")) {
        const [from, ...others] = spread(corners, (c) => c.v - c.y);
        expect(others, `${wall}, ${face}`).toHaveLength(0);
        expect(from).toBeCloseTo(HOUSE.storeys[floor].y);
      }
    }
  });

  it("is laid from the floor, through the rail, where it is courses of stone or tiles; and from the rail where it is paper over panelling", () => {
    const through = faces.filter((f) => f.pattern === "paper:stone" || f.pattern === "paper:tile");
    const papered = faces.filter((f) => f.pattern.startsWith("paper:") && !through.includes(f));
    expect(through.length).toBeGreaterThan(0);
    expect(papered.length).toBeGreaterThan(0);
    for (const { wall, face, corners } of through) expect(spread(corners, (c) => c.v - c.y).map((n) => Math.round(n / CLOSE) * CLOSE + 0), `${wall}, ${face}`).toEqual([0]);
    for (const { wall, face, corners } of papered) {
      expect(spread(corners.filter((c) => !c.upper), (c) => c.v - c.y).map((n) => Math.round(n / CLOSE) * CLOSE + 0), `${wall}, ${face}, lower`).toEqual([0]);
      const above = spread(corners.filter((c) => c.upper), (c) => c.v - c.y);
      if (above.length > 0) expect(above[0], `${wall}, ${face}, upper`).toBeCloseTo(-CUT_HEIGHT);
      expect(above.length, `${wall}, ${face}, upper`).toBeLessThanOrEqual(1);
    }
  });
});
