import { describe, expect, it } from "vitest";

import { playsWholeDays } from "../test-timeout";
import { HOUSE } from "./house-plan";
import { CAST, runScript } from "./script";
import { nav, spot } from "./space-kit";
import { flightAt, stepsOf } from "./stairs";
import type { FloorId, Pos } from "./types";
import { GROUNDS, addActor, addActorAt, createWorld, dropAt, floorOf, giveOrders, standingAt, stepWorld } from "./world";

playsWholeDays();

// The world at work: the household fetching, carrying and setting down, and people out of doors.

describe("the household at work", () => {
  it("fetches from the right shelf, carries, and sets down", () => {
    const world = createWorld(HOUSE);
    const maid = addActor(world, "m", "Maid", "evelyn", "kitchen.table.n");
    giveOrders(world, "m", [{ do: "go", spot: "pantry.jam" }, { do: "take", goods: "jam" }, { do: "go", spot: "shop.shelf" }, { do: "put" }]);
    let carriedAtPantryDoor = false;
    for (let i = 0; i < 60 * 60 && maid.errands === 0; i++) {
      stepWorld(world, 1 / 60);
      if (maid.carrying === "jam" && maid.walker.pos.z > 8) carriedAtPantryDoor = true;
    }
    expect(maid.errands).toBe(1);
    expect(carriedAtPantryDoor).toBe(true);
    expect(maid.carrying).toBeNull();
    expect(maid.walker.pos.x).toBeCloseTo(spot("shop.shelf").x);
    expect(maid.walked).toBeGreaterThan(10);
  });

  it("stands on the treads of a stair, never sunk into them", () => {
    const world = createWorld(HOUSE);
    const maid = addActor(world, "m", "Maid", "evelyn", "hall.door");
    giveOrders(world, "m", [{ do: "go", spot: "landing.window" }]);
    const heights = new Set<string>();
    for (let i = 0; i < 60 * 40 && maid.errands === 0; i++) {
      stepWorld(world, 1 / 60);
      if (!maid.walker.onStair) continue;
      const at = standingAt(world, maid);
      // The walk is a slope; the feet are on whichever step is under them, which is never below the slope.
      expect(at.y).toBeGreaterThanOrEqual(maid.walker.pos.y - 1e-9);
      heights.add(at.y.toFixed(4));
    }
    const main = flightAt(HOUSE, { x: 8.875, y: 1, z: 8 });
    expect(main?.id).toBe("main");
    // She stood on every step of the flight, and nowhere in between.
    expect(heights.size).toBe(stepsOf(HOUSE, HOUSE.stairs[0]));
  });

  it("finishes the stair before obeying new orders", () => {
    const world = createWorld(HOUSE);
    const maid = addActor(world, "m", "Maid", "evelyn", "hall.door");
    giveOrders(world, "m", [{ do: "go", spot: "landing.window" }]);
    while (!maid.walker.onStair) stepWorld(world, 1 / 60);
    giveOrders(world, "m", [{ do: "go", spot: "hall.door" }]);
    stepWorld(world, 1 / 60);
    expect(maid.walker.onStair).toBe(true);
    while (floorOf(world, maid) === null) stepWorld(world, 1 / 60);
    expect(floorOf(world, maid)).toBe("first");
    for (let i = 0; i < 60 * 60 && maid.errands === 0; i++) stepWorld(world, 1 / 60);
    expect(floorOf(world, maid)).toBe("ground");
  });

  it("has two people meeting in the hall step round each other", () => {
    const world = createWorld(HOUSE);
    const a = addActor(world, "a", "A", "evelyn", "hall.door");
    const b = addActor(world, "b", "B", "maid-rose", "passage.sideboard");
    giveOrders(world, "a", [{ do: "go", spot: "passage.sideboard" }]);
    giveOrders(world, "b", [{ do: "go", spot: "hall.door" }]);
    let nearestPaths = Infinity;
    let nearestBodies = Infinity;
    for (let i = 0; i < 60 * 30 && (a.errands === 0 || b.errands === 0); i++) {
      stepWorld(world, 1 / 60);
      const pa = standingAt(world, a);
      const pb = standingAt(world, b);
      nearestPaths = Math.min(nearestPaths, Math.hypot(a.walker.pos.x - b.walker.pos.x, a.walker.pos.z - b.walker.pos.z));
      nearestBodies = Math.min(nearestBodies, Math.hypot(pa.x - pb.x, pa.z - pb.z));
    }
    expect(a.errands).toBe(1);
    expect(b.errands).toBe(1);
    // Their routes run through each other; they do not.
    expect(nearestPaths).toBeLessThan(0.2);
    expect(nearestBodies).toBeGreaterThan(0.4);
    // And once past, each is back on her own line.
    expect(a.sidestep).toBe(0);
  });

  it("keeps the whole cast busy on every storey for ten minutes", () => {
    const world = createWorld(HOUSE);
    for (const c of CAST) addActor(world, c.id, c.name, c.sprite, c.start);
    const script = runScript(world);
    const seen = new Map<string, Set<FloorId>>(CAST.map((c) => [c.id, new Set<FloorId>()]));
    for (let i = 0; i < 60 * 600; i++) {
      script.step();
      stepWorld(world, 1 / 60);
      for (const a of world.actors) {
        const floor = floorOf(world, a);
        if (floor) seen.get(a.id)?.add(floor);
        const at = standingAt(world, a);
        const here: Pos | null = floor ? { floor, x: at.x, z: at.z } : null;
        if (here) expect(nav.fits(here.floor, here.x, here.z), `${a.name} is off the floor`).toBe(true);
      }
    }
    for (const a of world.actors) expect(a.errands, `${a.name} finished nothing`).toBeGreaterThan(4);
    expect(seen.get("master")?.size).toBe(3);
    expect(seen.get("rose")?.has("cellar")).toBe(true);
  });
});

describe("out of doors", () => {
  // The front door is in the house's south wall, at z = 12; the drive runs south from it.
  const DOOR = { x: 10, z: 12 };
  const ground = HOUSE.storeys.ground.y;

  it("the earth is lower than the ground floor: by nothing in the house or on a threshold, and by the whole drop at the foot of the steps and beyond", () => {
    const world = createWorld(HOUSE);
    expect(dropAt(world, DOOR.x, DOOR.z - 1)).toBe(0);
    expect(dropAt(world, DOOR.x, DOOR.z)).toBe(0);
    expect(dropAt(world, DOOR.x, DOOR.z + GROUNDS.steps)).toBeCloseTo(GROUNDS.below, 9);
    expect(dropAt(world, DOOR.x, DOOR.z + 8)).toBeCloseTo(GROUNDS.below, 9);
    // On the steps it is between, evenly.
    expect(dropAt(world, DOOR.x, DOOR.z + GROUNDS.steps / 2)).toBeCloseTo(GROUNDS.below / 2, 9);
    // …and off a corner of the house as much as off a wall of it.
    expect(dropAt(world, -3, -3)).toBeCloseTo(GROUNDS.below, 9);
  });

  it("someone on the drive stands on the earth, not in the air at the level of the floor; and someone indoors on the floor", () => {
    const world = createWorld(HOUSE);
    const caller = addActorAt(world, "caller", "A caller", "townsman", { x: DOOR.x, z: DOOR.z + 6 });
    expect(standingAt(world, caller).y).toBeCloseTo(ground - GROUNDS.below, 9);
    // She is still reckoned to be on the ground floor: it is only where her feet are drawn.
    expect(floorOf(world, caller)).toBe("ground");
    expect(caller.walker.pos.y).toBe(ground);
    const maid = addActor(world, "sage", "Sage", "maid", "hall.door");
    expect(standingAt(world, maid).y).toBe(ground);
  });

  // Found by a bug hunt, 2026-11-16: told to go to a spot in the house from out among the garden plots, she was given no way, and the order was dropped without a word.
  it("someone out of doors sent to a spot in the house is not left where she is: she comes in at the nearest door, and on to it", () => {
    for (const [from, to] of [[{ x: 5.5, z: -3.3 }, "hall.door"], [{ x: DOOR.x, z: DOOR.z + 6 }, "parlour.piano"], [{ x: -3, z: -3 }, "kitchen.oven"]] as const) {
      const world = createWorld(HOUSE);
      const her = addActorAt(world, "her", "Her", "maid", from);
      giveOrders(world, "her", [{ do: "go", spot: to }]);
      for (let i = 0; i < 60 * 60 && her.errands === 0; i++) stepWorld(world, 1 / 60);
      expect(her.errands, `from ${from.x}, ${from.z}`).toBe(1);
      expect(Math.hypot(her.walker.pos.x - spot(to).x, her.walker.pos.z - spot(to).z), `from ${from.x}, ${from.z} to ${to}`).toBeLessThan(0.05);
    }
  });

  it("she comes down the steps as she walks away from the door, and up them as she comes back", () => {
    const world = createWorld(HOUSE);
    const caller = addActorAt(world, "caller", "A caller", "townsman", DOOR);
    giveOrders(world, "caller", [{ do: "path", points: [{ x: DOOR.x, z: DOOR.z + 3 }] }]);
    let last = standingAt(world, caller).y;
    expect(last).toBe(ground);
    for (let i = 0; i < 60 * 6; i++) {
      stepWorld(world, 1 / 60);
      const now = standingAt(world, caller).y;
      // Never up, on the way out; and never a jump.
      expect(now).toBeLessThanOrEqual(last + 1e-9);
      expect(last - now).toBeLessThan(0.02);
      last = now;
    }
    expect(last).toBeCloseTo(ground - GROUNDS.below, 9);
  });
});
