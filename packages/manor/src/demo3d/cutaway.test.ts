import { describe, expect, it } from "vitest";

import { HOUSE, deriveWalls, roomRects } from "../space";
import type { FloorId, Rect, Wall } from "../space";
import { DROPS_ABOVE, RISES_BELOW, RISES_TURNED, RISE_AFTER, STAYS_TURNED, hiddenFloor, overlap, settle, shadowOf, standsNext, turnedAway } from "./cutaway";
import type { Eye, Rise, Span } from "./cutaway";
import { RAIL, TOP, WALL } from "./cutaway-kit";

/** A camera to the south of it, as far above the wall's top as the top is above the rail: the shadow reaches as far beyond the wall as the camera is before it. */
const SOUTH: Eye = { x: 2, y: TOP + (TOP - RAIL), z: 10 };
const NORTH_ROOM: Rect = { x: -10, z: -5, w: 20, d: 5 };
const SOUTH_ROOM: Rect = { x: -10, z: 0, w: 20, d: 5 };

describe("the shadow of a wall, with the camera for a lamp", () => {
  it("starts at the wall and spreads away from the camera", () => {
    const [a, b, beyondB, beyondA] = shadowOf(WALL, SOUTH, RAIL, TOP);
    expect([a, b]).toEqual([
      { x: 0, z: 0 },
      { x: 4, z: 0 },
    ]);
    expect([beyondB.x, beyondB.z, beyondA.x, beyondA.z].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([6, -10, -2, -10]);
  });

  it("covers a room beyond the wall, and none of a room on the camera's side", () => {
    // Four metres wide at the wall and six where the room ends, five metres on.
    expect(hiddenFloor(WALL, SOUTH, RAIL, TOP, [NORTH_ROOM])).toBeCloseTo(25);
    expect(hiddenFloor(WALL, SOUTH, RAIL, TOP, [SOUTH_ROOM])).toBe(0);
  });

  it("adds up over several rooms and counts only the part inside each", () => {
    const strip: Rect = { x: 0, z: -1, w: 1, d: 1 };
    const corner: Rect = { x: 3, z: -1, w: 5, d: 1 };
    expect(overlap(shadowOf(WALL, SOUTH, RAIL, TOP), strip)).toBeCloseTo(1);
    // The shadow's east edge leans out a fifth of a metre for each metre it runs.
    expect(hiddenFloor(WALL, SOUTH, RAIL, TOP, [strip, corner])).toBeCloseTo(1 + 1.1);
  });

  it("is shorter from a steeper camera", () => {
    const steep: Eye = { ...SOUTH, y: SOUTH.y * 3 };
    expect(hiddenFloor(WALL, steep, RAIL, TOP, [NORTH_ROOM])).toBeLessThan(hiddenFloor(WALL, SOUTH, RAIL, TOP, [NORTH_ROOM]) / 2);
  });

  it("stays finite when the camera is no higher than the top of the wall", () => {
    const level: Eye = { ...SOUTH, y: TOP };
    const hidden = hiddenFloor(WALL, level, RAIL, TOP, [NORTH_ROOM]);
    expect(Number.isFinite(hidden)).toBe(true);
    expect(hidden).toBeGreaterThan(20);
  });

  it("works the same for a wall running north to south", () => {
    const wall: Span = { axis: "z", at: 0, from: 0, to: 4 };
    const east: Eye = { x: 10, y: SOUTH.y, z: 2 };
    expect(hiddenFloor(wall, east, RAIL, TOP, [{ x: -5, z: -10, w: 5, d: 20 }])).toBeCloseTo(25);
  });
});

describe("how far a wall is turned away from the camera", () => {
  // WALL runs east along z = 0; say the garden is to its north, as for a back wall.
  const NORTH_IS_OUT = -1;
  const from = (x: number, z: number): number => turnedAway(WALL, NORTH_IS_OUT, { x, y: 10, z });

  it("is squarely away from in front of it, squarely towards from behind it", () => {
    expect(from(2, 10)).toBe(1);
    expect(from(2, -10)).toBe(-1);
  });

  it("is nothing from end-on, and a little from a little to one side of that", () => {
    expect(from(20, 0)).toBeCloseTo(0);
    // Sixteen metres past its east end and one to the south: the sine of about three and a half degrees.
    expect(from(20, 1)).toBeCloseTo(1 / Math.hypot(1, 16));
    expect(from(20, -1)).toBeCloseTo(-1 / Math.hypot(1, 16));
  });

  it("is measured from the nearer end, and the other way round when the garden is on the other side", () => {
    expect(from(-6, 6)).toBeCloseTo(Math.SQRT1_2);
    expect(turnedAway(WALL, 1, { x: -6, y: 10, z: 6 })).toBeCloseTo(-Math.SQRT1_2);
  });

  it("works the same for a wall running north to south", () => {
    const wall: Span = { axis: "z", at: 0, from: 0, to: 4 };
    // The garden to its west: seen from the east it is turned away.
    expect(turnedAway(wall, -1, { x: 10, y: 10, z: 2 })).toBe(1);
    expect(turnedAway(wall, -1, { x: 3, y: 10, z: 8 })).toBeCloseTo(3 / 5);
  });
});

describe("whether a wall is wanted standing", () => {
  const AWAY = 1;

  it("comes down only once it hides more than a little, and goes back up only once it hides next to nothing", () => {
    const between = (DROPS_ABOVE + RISES_BELOW) / 2;
    expect(standsNext(true, 0, AWAY)).toBe(true);
    expect(standsNext(true, between, AWAY)).toBe(true);
    expect(standsNext(true, DROPS_ABOVE * 2, AWAY)).toBe(false);
    expect(standsNext(false, between, AWAY)).toBe(false);
    expect(standsNext(false, 0, AWAY)).toBe(true);
  });

  it("is not wanted nearly end-on, however little it hides: it must be turned clearly away to rise, and a little less to stay", () => {
    const between = (RISES_TURNED + STAYS_TURNED) / 2;
    expect(standsNext(false, 0, 0)).toBe(false);
    expect(standsNext(false, 0, between)).toBe(false);
    expect(standsNext(false, 0, RISES_TURNED + 0.01)).toBe(true);
    expect(standsNext(true, 0, between)).toBe(true);
    expect(standsNext(true, 0, STAYS_TURNED - 0.01)).toBe(false);
    expect(standsNext(true, 0, -1)).toBe(false);
  });
});

describe("a wall rising and dropping", () => {
  const STEP = RISE_AFTER / 5;

  it("rises only once it has been wanted for a moment, and drops at once", () => {
    const wall: Rise = { wanted: true, waited: 0, standing: false };
    for (let i = 0; i < 4; i++) settle(wall, STEP);
    expect(wall.standing).toBe(false);
    for (let i = 0; i < 2; i++) settle(wall, STEP);
    expect(wall.standing).toBe(true);
    wall.wanted = false;
    settle(wall, STEP);
    expect(wall.standing).toBe(false);
  });

  it("does not rise for a flicker: wanted for less than the moment, it stays down, and the wait starts again", () => {
    const wall: Rise = { wanted: false, waited: 0, standing: false };
    for (let round = 0; round < 3; round++) {
      wall.wanted = true;
      for (let i = 0; i < 4; i++) settle(wall, STEP);
      expect(wall.standing, `flicker ${round + 1}`).toBe(false);
      wall.wanted = false;
      settle(wall, STEP);
    }
  });

  it("stays up while it goes on being wanted", () => {
    const wall: Rise = { wanted: true, waited: 0, standing: true };
    settle(wall, STEP);
    expect(wall.standing).toBe(true);
  });
});

describe("the house's own walls, from the four diagonal views", () => {
  const walls = deriveWalls(HOUSE);
  const DISTANCE = 30;
  const POLAR = 0.9;
  const MIDDLE = { x: 9, z: 6 };
  const DIAGONALS = { southEast: 45, northEast: 135, northWest: 225, southWest: 315 };
  const eyeFrom = (degrees: number, polar = POLAR): Eye => {
    const azimuth = (degrees * Math.PI) / 180;
    const flat = Math.sin(polar) * DISTANCE;
    return { x: MIDDLE.x + Math.sin(azimuth) * flat, y: Math.cos(polar) * DISTANCE, z: MIDDLE.z + Math.cos(azimuth) * flat };
  };
  const wall = (floor: FloorId, axis: "x" | "z", at: number, from: number, to: number): Wall => {
    const found = walls.find((w) => w.floor === floor && w.axis === axis && w.at === at && w.from === from && w.to === to);
    if (!found) throw new Error(`no wall ${floor} ${axis} ${at} ${from}-${to}`);
    return found;
  };
  const hides = (w: Wall, eye: Eye): number => {
    const storey = HOUSE.storeys[w.floor];
    const rooms = HOUSE.rooms.filter((r) => r.floor === w.floor).flatMap(roomRects);
    return hiddenFloor(w, { ...eye, y: eye.y + storey.y }, storey.y + RAIL, storey.y + storey.height, rooms);
  };
  const outside = walls.filter((w) => (w.low === null || w.high === null) && !w.openings.some((o) => o.kind === "glass"));
  /** Whether a wall that is down would rise, seen from here. */
  const stands = (w: Wall, eye: Eye): boolean => standsNext(false, hides(w, eye), turnedAway(w, w.low === null ? -1 : 1, { ...eye, y: eye.y + HOUSE.storeys[w.floor].y }));

  it("leaves the back wall of the kitchen standing from the front, and takes it down from behind", () => {
    const back = wall("ground", "x", 1, 2, 8);
    expect(stands(back, eyeFrom(DIAGONALS.southEast))).toBe(true);
    expect(stands(back, eyeFrom(DIAGONALS.southWest))).toBe(true);
    expect(stands(back, eyeFrom(DIAGONALS.northEast))).toBe(false);
    expect(stands(back, eyeFrom(DIAGONALS.northWest))).toBe(false);
  });

  it("takes down the shop's side wall when the pantry is behind it, though it faces away", () => {
    const side = wall("ground", "z", 2, 7, 12);
    expect(stands(side, eyeFrom(DIAGONALS.southEast))).toBe(false);
    // From the other front corner there is only garden behind it.
    expect(stands(side, eyeFrom(DIAGONALS.northEast))).toBe(true);
  });

  it("takes down the laboratory's wall in front of the undercroft", () => {
    const south = wall("cellar", "x", 6, 12, 19);
    expect(stands(south, eyeFrom(DIAGONALS.northEast))).toBe(false);
    expect(stands(south, eyeFrom(DIAGONALS.northWest))).toBe(true);
  });

  it("leaves no standing wall hiding a room, on any storey from any diagonal", () => {
    for (const degrees of Object.values(DIAGONALS)) {
      for (const w of walls.filter((x) => x.low === null || x.high === null)) {
        const hidden = hides(w, eyeFrom(degrees));
        expect(stands(w, eyeFrom(degrees)) && hidden > DROPS_ABOVE, `${w.floor} ${w.axis} ${w.at} ${w.from}-${w.to} from ${degrees}`).toBe(false);
      }
    }
  });

  it("has no wall that flicks up for a few degrees as the view turns right round", () => {
    // The two the author saw from the front of the house: either side of the parlour's bay.
    const byTheFireplace = wall("ground", "z", 18, 6, 7.5);
    const byTheFrontCorner = wall("ground", "z", 18, 10.5, 12);
    for (let degrees = 0; degrees <= 40; degrees++) {
      expect(stands(byTheFrontCorner, eyeFrom(degrees)), `by the front corner, from ${degrees}`).toBe(false);
      expect(stands(byTheFireplace, eyeFrom(degrees)), `by the fireplace, from ${degrees}`).toBe(false);
    }
    const FLICKER = 10;
    const flickers: string[] = [];
    for (const w of outside) {
      const up = Array.from({ length: 360 }, (_, degrees) => stands(w, eyeFrom(degrees)));
      const start = up.indexOf(false);
      if (start === -1) continue;
      let run = 0;
      for (let i = 1; i <= 360; i++) {
        if (up[(start + i) % 360]) run++;
        else {
          if (run > 0 && run < FLICKER) flickers.push(`${w.floor} ${w.axis} ${w.at} ${w.from}-${w.to}: up for ${run} degrees ending at ${(start + i + 359) % 360}`);
          run = 0;
        }
      }
    }
    expect(flickers).toEqual([]);
  });

  it("still leaves every storey some wall for a backdrop from every diagonal", () => {
    for (const floor of ["cellar", "ground", "first"] as FloorId[]) {
      for (const degrees of Object.values(DIAGONALS)) {
        const up = walls.filter((w) => w.floor === floor && (w.low === null || w.high === null) && stands(w, eyeFrom(degrees)));
        expect(up.length, `${floor} from ${degrees}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
