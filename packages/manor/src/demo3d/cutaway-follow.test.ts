import { describe, expect, it } from "vitest";

import { HOUSE, deriveWalls } from "../space";
import type { FloorId, Wall } from "../space";
import { DOORWAY_REACH, SIGHT_DROPS, SIGHT_RISES, blocksSight, flooredOf, roomsAbout, standsAbout, standsClearOf, watchedIndoors, watchedOne } from "./cutaway";
import type { Eye, Span } from "./cutaway";
import { RAIL, TOP, WALL } from "./cutaway-kit";

// The walls that come down around someone followed: one between the camera and her, the rooms she is in, and the walls about them.

/** No share of a room may be hidden: a wall comes down for next to nothing, as these were first written for. (What a share allows is tolerance.test.ts.) */
const NO_SHARE = 0;

describe("a wall between the camera and someone followed", () => {
  // WALL runs east along z = 0, from x = 0 to 4. The camera is to its south, ten metres off and ten up.
  const EYE: Eye = { x: 2, y: 10, z: 10 };
  const at = (x: number, y: number, z: number): Eye => ({ x, y, z });
  const blocks = (point: Eye, margin = 0): boolean => blocksSight(WALL, EYE, point, RAIL, TOP, margin);

  it("is in the way of a point a little beyond it, where the line of sight passes between its rail and its top", () => {
    // Two metres beyond the wall at floor level: the line crosses the wall at a height of two metres.
    expect(blocks(at(2, 0, -2.5))).toBe(true);
  });

  it("is not in the way of a point on the camera's side of it, however near", () => {
    expect(blocks(at(2, 0, 0.3))).toBe(false);
    expect(blocks(at(2, 1.7, 3))).toBe(false);
    // From a low camera the line to her head, carried on past her, would meet the wall behind her: it does not count.
    expect(blocksSight(WALL, { x: 2, y: 2, z: 10 }, at(2, 1.7, 3), RAIL, TOP, 0)).toBe(false);
  });

  it("is not in the way when the line of sight passes over its top, or under its rail", () => {
    // Far beyond the wall the line crosses it high up; right behind it, the line comes in under the rail.
    expect(blocks(at(2, 0, -6))).toBe(false);
    expect(blocks(at(2, 0, -0.5))).toBe(false);
    // …though her head, right behind it, is hidden by it.
    expect(blocks(at(2, 1.7, -0.5))).toBe(true);
  });

  it("is not in the way of a line that passes its end, unless within the margin asked for", () => {
    // The line to this point crosses z = 0 at x = 4.4: just past the wall's east end.
    const past = at(5, 0, -2.5);
    expect(blocks(past)).toBe(false);
    expect(blocks(past, 0.3)).toBe(false);
    expect(blocks(past, 0.5)).toBe(true);
    // And the same past its west end: this line crosses at x = -0.4.
    const west = at(-1, 0, -2.5);
    expect(blocks(west)).toBe(false);
    expect(blocks(west, 0.5)).toBe(true);
  });

  it("is not in the way from behind the camera, nor when the camera looks along it", () => {
    // The camera has the wall behind it and looks away, almost level: the line carried backwards would meet the wall.
    expect(blocksSight(WALL, { x: 2, y: 2, z: -5 }, at(2, 1.9, -8), RAIL, TOP, 0)).toBe(false);
    expect(blocksSight(WALL, { x: -5, y: 2, z: 0 }, at(8, 2, 0), RAIL, TOP, 0)).toBe(false);
  });

  it("works the same for a wall running north to south", () => {
    const wall: Span = { axis: "z", at: 0, from: 0, to: 4 };
    expect(blocksSight(wall, { x: 10, y: 10, z: 2 }, at(-2.5, 0, 2), RAIL, TOP, 0)).toBe(true);
    expect(blocksSight(wall, { x: 10, y: 10, z: 2 }, at(-2.5, 0, 7), RAIL, TOP, 0)).toBe(false);
  });

  it("is wanted standing unless it hides any of her: her feet, her waist or her head", () => {
    expect(standsClearOf(true, WALL, EYE, at(2, 0, -2.5), RAIL, TOP)).toBe(false);
    // Only her head is behind it here.
    expect(standsClearOf(true, WALL, EYE, at(2, 0, -0.5), RAIL, TOP)).toBe(false);
    expect(standsClearOf(true, WALL, EYE, at(2, 0, 3), RAIL, TOP)).toBe(true);
    expect(standsClearOf(true, WALL, EYE, at(2, 0, -8), RAIL, TOP)).toBe(true);
  });

  it("drops when she comes near the line past its end, and rises only once she is well clear of it", () => {
    // How far past the wall's east end the line of sight to her feet crosses its line.
    const crossing = (past: number): Eye => at(2 + (4 + past - 2) / 0.8, 0, -2.5);
    const between = (SIGHT_DROPS + SIGHT_RISES) / 2;
    expect(standsClearOf(true, WALL, EYE, crossing(between), RAIL, TOP)).toBe(true);
    expect(standsClearOf(false, WALL, EYE, crossing(between), RAIL, TOP)).toBe(false);
    expect(standsClearOf(true, WALL, EYE, crossing(SIGHT_DROPS - 0.05), RAIL, TOP)).toBe(false);
    expect(standsClearOf(false, WALL, EYE, crossing(SIGHT_RISES + 0.05), RAIL, TOP)).toBe(true);
  });
});

describe("the rooms someone followed is in", () => {
  const about = (x: number, z: number, floor: FloorId = "ground"): string[] => roomsAbout(HOUSE, floor, { x, z }).map((r) => r.id).sort();

  it("is the room she stands in", () => {
    expect(about(5, 3.2)).toEqual(["kitchen"]);
    expect(about(5.5, 8.75)).toEqual(["shop"]);
    expect(about(15, 3, "cellar")).toEqual(["laboratory"]);
  });

  it("is that room when she is in its bay window, or on the stair that stands in it", () => {
    expect(about(5.75, 12.4)).toEqual(["shop"]);
    // A corner of the parlour's bay, away from its window.
    expect(about(18.4, 7.8)).toEqual(["parlour"]);
    // The main stair climbs through the hall.
    expect(about(8.875, 8)).toEqual(["hall"]);
  });

  it("is both rooms while she is in the doorway between them, and one again once she is through", () => {
    // The door between the kitchen and the pantry is in the wall x = 2, at z = 5.
    expect(about(2.3, 5)).toEqual(["kitchen", "pantry"]);
    expect(about(1.7, 5)).toEqual(["kitchen", "pantry"]);
    expect(about(2 + DOORWAY_REACH + 0.1, 5)).toEqual(["kitchen"]);
    expect(about(2 - DOORWAY_REACH - 0.1, 5)).toEqual(["pantry"]);
  });

  it("is not the next room merely because she is close to the wall between them", () => {
    // Against the same wall, but well along from the door.
    expect(about(2.3, 3.2)).toEqual(["kitchen"]);
  });

  it("does not take a door on another storey for a doorway", () => {
    // The door between the landing and the dormitory is on the first floor, at x = 8, z = 3: the kitchen and passage have their own there.
    expect(about(7.7, 3, "first")).toEqual(["dormitory", "landing"]);
    expect(about(7.7, 3, "cellar")).toEqual(["store"]);
    // The cellar's door between the undercroft and the store is under the wall between the kitchen and the hall, which has none there.
    expect(about(7.7, 4.75)).toEqual(["kitchen"]);
  });
});

describe("the walls around someone followed", () => {
  const walls = deriveWalls(HOUSE);
  const wall = (axis: "x" | "z", at: number, from: number, to: number): Wall => {
    const found = walls.find((w) => w.floor === "ground" && w.axis === axis && w.at === at && w.from === from && w.to === to);
    if (!found) throw new Error(`no wall ${axis} ${at} ${from}-${to}`);
    return found;
  };
  // Rose behind the shop's counter, and the camera twelve metres from her, as when she is followed.
  const ROSE: Eye = { x: 5.5, y: 0, z: 8.75 };
  /** South of the shop's window, on the grass. */
  const IN_THE_GARDEN: Eye = { x: 5, y: 0, z: 15 };
  const eyeFrom = (degrees: number): Eye => {
    const azimuth = (degrees * Math.PI) / 180;
    const flat = Math.sin(0.9) * 12;
    return { x: ROSE.x + Math.sin(azimuth) * flat, y: 1 + Math.cos(0.9) * 12, z: ROSE.z + Math.cos(azimuth) * flat };
  };
  const hers = roomsAbout(HOUSE, "ground", ROSE).map(flooredOf);
  const stands = (w: Wall, degrees: number): boolean => standsAbout(true, w, eyeFrom(degrees), [ROSE], RAIL, HOUSE.storeys.ground.height, hers, NO_SHARE);
  const SOUTH_EAST = 45;
  const NORTH_WEST = 225;
  const shopHall = wall("z", 8, 7, 12);
  const kitchenShop = wall("x", 7, 2, 8);
  const diningParlour = wall("x", 6, 12, 18);

  it("come down where they hide her room, though they do not hide her", () => {
    // From the south-east the wall to the hall is before the shop: it hides the shop's floor, but she is seen over it.
    expect(standsClearOf(true, shopHall, eyeFrom(SOUTH_EAST), ROSE, RAIL, HOUSE.storeys.ground.height)).toBe(true);
    expect(stands(shopHall, SOUTH_EAST)).toBe(false);
    expect(stands(kitchenShop, NORTH_WEST)).toBe(false);
  });

  it("stand on the far side of her room, as its backdrop", () => {
    expect(stands(kitchenShop, SOUTH_EAST)).toBe(true);
    expect(stands(shopHall, NORTH_WEST)).toBe(true);
  });

  it("stand in the rest of the house, inside walls too, whichever side the camera is on", () => {
    expect(stands(diningParlour, SOUTH_EAST)).toBe(true);
    expect(stands(diningParlour, NORTH_WEST)).toBe(true);
  });

  it("come down between the camera and her even where they hide none of her room", () => {
    // No room is hers here: only the line of sight is left to judge by.
    expect(standsAbout(true, shopHall, eyeFrom(SOUTH_EAST), [ROSE], RAIL, HOUSE.storeys.ground.height, [], NO_SHARE)).toBe(true);
    expect(standsAbout(true, kitchenShop, eyeFrom(NORTH_WEST), [ROSE], RAIL, HOUSE.storeys.ground.height, [], NO_SHARE)).toBe(false);
  });

  it("are asked about her alone, in her rooms or out of doors with none", () => {
    expect(watchedOne(HOUSE, "ground", ROSE)).toEqual({ people: [ROSE], rooms: hers });
    expect(watchedOne(HOUSE, "ground", IN_THE_GARDEN)).toEqual({ people: [IN_THE_GARDEN], rooms: [] });
  });

  // With nobody followed, and only the rooms with someone in them opened: the same question, asked of everybody indoors.
  describe("with only the rooms that have someone in them opened", () => {
    const EVELYN: Eye = { x: 5, y: 0, z: 4 };
    const AT_TABLE: Eye = { x: 15, y: 0, z: 3 };
    const BESIDE_ROSE: Eye = { x: 4, y: 0, z: 10 };
    const top = HOUSE.storeys.ground.height;
    const standsFor = (w: Wall, degrees: number, people: Eye[]): boolean => {
      const watched = watchedIndoors(HOUSE, "ground", people);
      return standsAbout(true, w, eyeFrom(degrees), watched.people, RAIL, top, watched.rooms, NO_SHARE);
    };

    it("everybody indoors is to be seen, and the rooms they are in, each room once; whoever is in the garden is not", () => {
      const watched = watchedIndoors(HOUSE, "ground", [ROSE, IN_THE_GARDEN, AT_TABLE, BESIDE_ROSE]);
      expect(watched.people).toEqual([ROSE, AT_TABLE, BESIDE_ROSE]);
      expect(watched.rooms).toEqual([...hers, ...roomsAbout(HOUSE, "ground", AT_TABLE).map(flooredOf)]);
    });

    it("a wall comes down where it hides a room somebody is in, whoever she is", () => {
      expect(standsFor(shopHall, SOUTH_EAST, [EVELYN, ROSE])).toBe(false);
      expect(standsFor(kitchenShop, NORTH_WEST, [EVELYN, ROSE])).toBe(false);
      // The wall between the dining room and the parlour hides the dining room from the south-east: it stands until somebody sits down there.
      expect(standsFor(diningParlour, SOUTH_EAST, [EVELYN, ROSE])).toBe(true);
      expect(standsFor(diningParlour, SOUTH_EAST, [EVELYN, ROSE, AT_TABLE])).toBe(false);
    });

    it("…and comes down between the camera and any one of them, not only the first", () => {
      // No rooms to judge by: the line of sight alone, to the second of two.
      expect(standsAbout(true, kitchenShop, eyeFrom(NORTH_WEST), [AT_TABLE, ROSE], RAIL, top, [], NO_SHARE)).toBe(false);
      expect(standsAbout(true, kitchenShop, eyeFrom(NORTH_WEST), [AT_TABLE], RAIL, top, [], NO_SHARE)).toBe(true);
    });

    it("every wall stands, inside ones too, on a storey with nobody indoors", () => {
      const walls = deriveWalls(HOUSE).filter((w) => w.floor === "ground");
      expect(walls.length).toBeGreaterThan(10);
      for (const degrees of [SOUTH_EAST, NORTH_WEST]) expect(walls.filter((w) => !standsFor(w, degrees, [IN_THE_GARDEN]))).toEqual([]);
    });
  });
});
