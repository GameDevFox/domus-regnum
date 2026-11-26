import { describe, expect, it } from "vitest";

import { HOUSE, deriveWalls, roomRects } from "../space";
import type { Wall } from "../space";
import { DROPS_ABOVE, HIDES_AT_MOST, RISES_TURNED, allowance, flooredOf, hiddenCounted, hiddenFloor, hidesLittle, standsAbout, standsOver, turnedAway, watchedStorey } from "./cutaway";
import type { Eye, Floored } from "./cutaway";

// A wall may hide a share of a room and stand (cutaway.ts). The house is the real one, and the
// camera goes round it as the page's does: tilted 0.9 rad from straight down, 34 m from the middle.

const RAIL = 0.9;
const TOP = HOUSE.storeys.ground.height;
const TILT = 0.9;
const FAR = 34;
const MIDDLE = { x: 9, z: 6 };
/** What the page allows on a first visit: a twentieth of a room. */
const SHARE = 0.05;
/** The camera from a side, in degrees: 0 is due south of the house, 90 due east. */
const eyeFrom = (degrees: number): Eye => {
  const azimuth = (degrees * Math.PI) / 180;
  return { x: MIDDLE.x + FAR * Math.sin(TILT) * Math.sin(azimuth), y: FAR * Math.cos(TILT), z: MIDDLE.z + FAR * Math.sin(TILT) * Math.cos(azimuth) };
};
/** Every degree of a full turn. */
const ALL_ROUND = Array.from({ length: 360 }, (_, n) => n);
const SOUTH_WEST = 315;

const WALLS = deriveWalls(HOUSE);
const wall = (axis: "x" | "z", at: number, from: number, to: number): Wall => {
  const found = WALLS.find((w) => w.floor === "ground" && w.axis === axis && w.at === at && w.from === from && w.to === to);
  if (!found) throw new Error(`no wall ${axis} ${at} ${from}-${to}`);
  return found;
};
const GROUND: Floored[] = HOUSE.rooms.filter((r) => r.floor === "ground").map(flooredOf);
const outwardOf = (w: Wall): 1 | -1 => (w.low === null ? -1 : 1);
/** Whether an outside wall that stands goes on standing, the whole storey looked over from a side. */
const stands = (w: Wall, degrees: number, share: number, people: Eye[] = []): boolean => standsOver(true, w, outwardOf(w), eyeFrom(degrees), people, RAIL, TOP, GROUND, share);
/** The sides from which a wall is turned away from the camera, and so might stand at all. */
const awayFrom = (w: Wall): number[] => ALL_ROUND.filter((d) => turnedAway(w, outwardOf(w), eyeFrom(d)) > RISES_TURNED);

const PASSAGE_BACK = wall("x", 1, 8, 12);
const SHOP_FRONT_WEST = wall("x", 12, 2, 4.5);
const SHOP_FRONT_EAST = wall("x", 12, 7, 8);
const KITCHEN_WEST = wall("z", 2, 1, 3);

describe("what a wall may hide of a room", () => {
  it("is the share of the room, but never less than any wall may hide, nor more than the most", () => {
    expect(allowance(12, SHARE)).toBeCloseTo(0.6);
    expect(allowance(30, SHARE)).toBeCloseTo(1.5);
    expect(allowance(42, SHARE)).toBe(HIDES_AT_MOST);
    expect(allowance(1, SHARE)).toBe(DROPS_ABOVE);
    expect(allowance(42, 0)).toBe(DROPS_ABOVE);
  });

  it("with no share allowed, a wall is counted as hiding the floor it hides, as before", () => {
    for (const w of [PASSAGE_BACK, SHOP_FRONT_WEST, KITCHEN_WEST]) {
      for (const degrees of [30, 135, SOUTH_WEST]) {
        const eye = eyeFrom(degrees);
        const floor = hiddenFloor(w, eye, RAIL, TOP, HOUSE.rooms.filter((r) => r.floor === "ground").flatMap(roomRects));
        expect(hiddenCounted(w, eye, RAIL, TOP, GROUND, 0)).toBeCloseTo(floor);
      }
    }
    // (And there is something to count: from the south-west the passage's back wall hides a corner of the dining room.)
    expect(hiddenCounted(PASSAGE_BACK, eyeFrom(SOUTH_WEST), RAIL, TOP, GROUND, 0)).toBeGreaterThan(DROPS_ABOVE);
  });

  it("is counted room by room: what a wall hides of a room within its allowance is not counted at all, and only the little over it is", () => {
    // A room of 40 m², which may have 2 m² hidden, and a wall that hides a strip of it.
    const eye: Eye = { x: 2, y: 3.3 + (3.3 - RAIL), z: 10 };
    const span = { axis: "x" as const, at: 0, from: 0, to: 4 };
    const roomHiding = (deep: number): Floored => ({ rects: [{ x: 0, z: -deep, w: 4, d: deep }], area: 40 });
    const counted = (rooms: Floored[]): number => hiddenCounted(span, eye, RAIL, 3.3, rooms, SHARE);
    expect(hiddenFloor(span, eye, RAIL, 3.3, roomHiding(0.25).rects)).toBeCloseTo(1);
    // 1 m² of it, or of each of two such rooms: nothing is counted, and the wall stands, or rises if it was down.
    expect(counted([roomHiding(0.25)])).toBe(0);
    expect(counted([roomHiding(0.25), roomHiding(0.25)])).toBe(0);
    expect(hidesLittle(false, counted([roomHiding(0.25), roomHiding(0.25)]))).toBe(true);
    // 1.96 m²: just within what it may. A wall that is up stays up; one that is down does not rise for so near a thing.
    expect(counted([roomHiding(0.49)])).toBeCloseTo(DROPS_ABOVE - 0.04);
    expect(hidesLittle(true, counted([roomHiding(0.49)]))).toBe(true);
    expect(hidesLittle(false, counted([roomHiding(0.49)]))).toBe(false);
    // 2.2 m²: more than it may, and it comes down.
    expect(hidesLittle(true, counted([roomHiding(0.55)]))).toBe(false);
    // …and it rises again a little under what it may hide, not far under: at 1.8 m² it is up whichever way it came.
    expect(hidesLittle(false, counted([roomHiding(0.45)]))).toBe(true);
  });
});

describe("the author's two walls, the whole storey looked over (2026-11-16)", () => {
  it("the passage's back wall came down for a corner of the dining room, from much of the way round", () => {
    const down = awayFrom(PASSAGE_BACK).filter((d) => !stands(PASSAGE_BACK, d, 0));
    expect(down.length).toBeGreaterThan(60);
    expect(down).toContain(SOUTH_WEST);
  });

  it("with a twentieth of a room allowed it stands, wherever it is turned away from the camera", () => {
    expect(awayFrom(PASSAGE_BACK).length).toBeGreaterThan(120);
    for (const d of awayFrom(PASSAGE_BACK)) expect(stands(PASSAGE_BACK, d, SHARE), `from ${d}`).toBe(true);
  });

  it("the shop's front either side of its window came down for the bay the window stands in, and now stands", () => {
    for (const w of [SHOP_FRONT_WEST, SHOP_FRONT_EAST]) {
      expect(awayFrom(w).filter((d) => !stands(w, d, 0)).length).toBeGreaterThan(40);
      for (const d of awayFrom(w)) expect(stands(w, d, SHARE), `${w.from}-${w.to} from ${d}`).toBe(true);
    }
  });

  it("a wall that hides a good part of a room still comes down: the kitchen's west wall, over the pantry", () => {
    const down = awayFrom(KITCHEN_WEST).filter((d) => !stands(KITCHEN_WEST, d, SHARE));
    expect(down.length).toBeGreaterThan(40);
    // …and whatever share is allowed, since it hides more of it than any wall may of any room.
    expect(awayFrom(KITCHEN_WEST).filter((d) => !stands(KITCHEN_WEST, d, 1)).length).toBeGreaterThan(20);
  });

  it("nobody is hidden by what is allowed: with someone in that corner of the dining room, the passage's wall comes down", () => {
    const inTheCorner: Eye = { x: 12.3, y: 0, z: 0.5 };
    const acrossTheRoom: Eye = { x: 17, y: 0, z: 4 };
    expect(stands(PASSAGE_BACK, SOUTH_WEST, SHARE, [])).toBe(true);
    expect(stands(PASSAGE_BACK, SOUTH_WEST, SHARE, [acrossTheRoom])).toBe(true);
    expect(stands(PASSAGE_BACK, SOUTH_WEST, SHARE, [acrossTheRoom, inTheCorner])).toBe(false);
  });

  it("the same holds while someone is followed, or the rooms with people in them are opened: her room's corner does not cost a wall, and she is never hidden", () => {
    const dining = HOUSE.rooms.filter((r) => r.id === "dining").map(flooredOf);
    const inTheCorner: Eye = { x: 12.3, y: 0, z: 0.5 };
    const acrossTheRoom: Eye = { x: 17, y: 0, z: 4 };
    const about = (share: number, people: Eye[]): boolean => standsAbout(true, PASSAGE_BACK, eyeFrom(SOUTH_WEST), people, RAIL, TOP, dining, share);
    expect(about(0, [acrossTheRoom])).toBe(false);
    expect(about(SHARE, [acrossTheRoom])).toBe(true);
    expect(about(SHARE, [inTheCorner])).toBe(false);
  });
});

describe("the whole storey looked over", () => {
  it("has every room of the storey to be seen, and of the people on it those who are indoors", () => {
    const inTheKitchen: Eye = { x: 5, y: 0, z: 4 };
    const onTheGrass: Eye = { x: 5, y: 0, z: 15 };
    const looking = watchedStorey(HOUSE, "ground", [inTheKitchen, onTheGrass]);
    expect(looking.people).toEqual([inTheKitchen]);
    expect(looking.rooms).toEqual(GROUND);
    expect(looking.rooms.length).toBe(HOUSE.rooms.filter((r) => r.floor === "ground").length);
  });
});
