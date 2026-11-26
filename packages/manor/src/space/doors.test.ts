import { describe, expect, it } from "vitest";

import { playsWholeDays } from "../test-timeout";
import { OPENS_AHEAD, SWING_SECONDS, doorOf, doorsOf, doorsOn, findWay, goingThrough, hingesOf, inTheWay, leavesOf, leavesToRound, passesOver, shut, stepDoors, underLeaves } from "./doors";
import type { Door, Swing } from "./doors";
import { HOUSE } from "./house-plan";
import { buildNav } from "./nav";
import { findRoute, straightRoute } from "./route";
import { CAST, runScript } from "./script";
import { createWalker, setRoute } from "./walker";
import type { Walker } from "./walker";
import { addActor, createWorld, giveOrders, stepWorld } from "./world";
import type { World } from "./world";

playsWholeDays();

// The doors of the house: shut while nobody is at them, open ahead of whoever goes through,
// away from her, and shut again behind her.

const HZ = 60;
/** The share of everyone's walking that may be spent under the leaf of an open door: next to none. */
const UNDER_A_LEAF = 0.004;
/** A door in a wall that runs north and south at x = 2, its doorway from z = -0.5 to 0.5, on the ground. */
const DOOR: Door = doorOf({ kind: "door", floor: "ground", axis: "z", at: 2, pos: 0, width: 1 }, 0);
/** Someone so far along a straight walk from one point of the ground to another. */
const walking = (from: [number, number], to: [number, number], s: number, y = 0): Walker => {
  const walker = createWalker({ x: from[0], y, z: from[1] });
  setRoute(walker, straightRoute([{ x: from[0], y, z: from[1] }, { x: to[0], y, z: to[1] }]));
  const share = s / Math.hypot(to[0] - from[0], to[1] - from[1]);
  Object.assign(walker, { s, pos: { x: from[0] + (to[0] - from[0]) * share, y, z: from[1] + (to[1] - from[1]) * share } });
  return walker;
};
/** A door of the house, by where it is. */
const doorAt = (world: World, axis: "x" | "z", at: number, pos: number): number => {
  const n = world.doors.findIndex((d) => d.floor === "ground" && d.axis === axis && d.at === at && d.pos === pos);
  if (n === -1) throw new Error("no such door");
  return n;
};

describe("the doors of the house", () => {
  it("are every doorway of the plan, each with a leaf that is shut at first", () => {
    const world = createWorld(HOUSE);
    expect(world.doors.length).toBe(HOUSE.openings.filter((o) => o.kind === "door").length);
    expect(world.doors.length).toBeGreaterThan(15);
    expect(world.swings.length).toBe(world.doors.length);
    expect(world.swings.every((swing) => swing.open === 0)).toBe(true);
    for (const door of doorsOf(HOUSE)) {
      expect(door.y).toBe(HOUSE.storeys[door.floor].y);
      // The middle of it is on its wall's line, so far along.
      expect(door.axis === "x" ? [door.x, door.z] : [door.z, door.x]).toEqual([door.pos, door.at]);
    }
    // No two doors share how they stand.
    expect(new Set(world.swings).size).toBe(world.swings.length);
  });

  it("have one leaf, or two where the doorway is wide: each reaching half of it", () => {
    expect(leavesOf(DOOR)).toEqual({ count: 1, reach: 1 });
    expect(leavesOf({ ...DOOR, width: 1.5 })).toEqual({ count: 2, reach: 0.75 });
  });

  it("hang from the low end of the doorway unless the plan says the high; and a wide one from both", () => {
    expect(hingesOf(DOOR)).toEqual([{ at: -0.5, reaches: 1 }]);
    expect(hingesOf({ ...DOOR, hinge: "high" })).toEqual([{ at: 0.5, reaches: -1 }]);
    expect(hingesOf({ ...DOOR, width: 1.5, hinge: "high" })).toEqual([{ at: -0.75, reaches: 1 }, { at: 0.75, reaches: -1 }]);
  });
});

describe("someone's way through a door", () => {
  it("is seen when it goes through close ahead of her, and which way: not from farther off", () => {
    expect(goingThrough(DOOR, walking([0, 0], [4, 0], 0))).toBeNull();
    expect(goingThrough(DOOR, walking([0, 0], [4, 0], 2 - OPENS_AHEAD - 0.2))).toBeNull();
    expect(goingThrough(DOOR, walking([0, 0], [4, 0], 2 - OPENS_AHEAD + 0.2))).toBe(1);
    expect(goingThrough(DOOR, walking([0, 0], [4, 0], 1.9))).toBe(1);
    expect(goingThrough(DOOR, walking([4, 0], [0, 0], 1.9))).toBe(-1);
  });

  it("is still hers just past the door, and not once she is well past", () => {
    expect(goingThrough(DOOR, walking([0, 0], [4, 0], 2.3))).toBe(1);
    expect(goingThrough(DOOR, walking([0, 0], [4, 0], 2.8))).toBeNull();
  });

  it("is not seen when she walks past the doorway, along the wall or beside it; nor from another storey; nor standing still", () => {
    // Along the wall, a little way off it.
    expect(goingThrough(DOOR, walking([1.6, -2], [1.6, 2], 2))).toBeNull();
    // Through the wall's line, but beside the doorway.
    expect(goingThrough(DOOR, walking([1, 0.8], [3, 0.8], 0.9))).toBeNull();
    expect(goingThrough(DOOR, walking([0, 0], [4, 0], 1.9, 3))).toBeNull();
    expect(goingThrough(DOOR, createWalker({ x: 1.9, y: 0, z: 0 }))).toBeNull();
  });

  it("is seen for a door in a wall that runs the other way", () => {
    const across = doorOf({ ...DOOR, axis: "x", at: 2, pos: 0 }, 0);
    expect(goingThrough(across, walking([0, 0], [0, 4], 1.5))).toBe(1);
    expect(goingThrough(across, walking([0, 4], [0, 0], 1.5))).toBe(-1);
    expect(goingThrough(across, walking([0, 0], [4, 0], 1.5))).toBeNull();
  });
});

describe("a door", () => {
  /** Step one door for so many seconds with these people about. */
  const step = (swing: Swing, walkers: Walker[], seconds: number): void => {
    for (let n = 0; n < Math.round(seconds * HZ); n++) stepDoors([DOOR], [swing], walkers, 1 / HZ);
  };

  it("opens away from whoever is going through it, in as long as a swing takes, and shuts again as quickly when nobody is at it", () => {
    const swing = shut();
    step(swing, [walking([0, 0], [4, 0], 1.5)], SWING_SECONDS / 2);
    expect(swing.open).toBeCloseTo(0.5, 1);
    expect(swing.side).toBe(1);
    step(swing, [walking([0, 0], [4, 0], 1.5)], SWING_SECONDS);
    expect(swing.open).toBe(1);
    step(swing, [], SWING_SECONDS / 2);
    expect(swing.open).toBeCloseTo(0.5, 1);
    step(swing, [], SWING_SECONDS);
    expect(swing.open).toBe(0);
    expect(swing.side).toBe(1);
    // From the other side it opens the other way.
    step(swing, [walking([4, 0], [0, 0], 1.5)], SWING_SECONDS * 1.5);
    expect(swing).toEqual({ open: 1, side: -1 });
  });

  it("keeps to the way it opened until it is shut again, whoever comes from the other side meanwhile", () => {
    const swing = shut();
    step(swing, [walking([0, 0], [4, 0], 1.5)], SWING_SECONDS * 1.5);
    step(swing, [walking([4, 0], [0, 0], 1.5)], SWING_SECONDS);
    expect(swing).toEqual({ open: 1, side: 1 });
  });

  it("is not shut on someone: it stays open while she stands in the doorway, or where its leaf swings", () => {
    const swing: Swing = { open: 1, side: 1 };
    const inDoorway = createWalker({ x: 2, y: 0, z: 0 });
    const besideLeaf = createWalker({ x: 2.8, y: 0, z: 0.3 });
    expect(inTheWay(DOOR, swing, inDoorway)).toBe(true);
    expect(inTheWay(DOOR, swing, besideLeaf)).toBe(true);
    step(swing, [besideLeaf], 2);
    expect(swing.open).toBe(1);
    // On the side it does not open to, clear of the doorway, she is in the way of nothing; nor beyond its leaf's reach; nor upstairs.
    expect(inTheWay(DOOR, swing, createWalker({ x: 1.2, y: 0, z: 0 }))).toBe(false);
    expect(inTheWay(DOOR, swing, createWalker({ x: 3.5, y: 0, z: 0 }))).toBe(false);
    expect(inTheWay(DOOR, swing, createWalker({ x: 2.8, y: 0, z: 1.2 }))).toBe(false);
    expect(inTheWay(DOOR, swing, createWalker({ x: 2, y: 3, z: 0 }))).toBe(false);
    step(swing, [createWalker({ x: 1.2, y: 0, z: 0 })], 2);
    expect(swing.open).toBe(0);
  });

  it("is not opened by someone only standing where its leaf would swing, nor by someone walking along the wall there", () => {
    const swing = shut();
    step(swing, [createWalker({ x: 2.3, y: 0, z: 0 })], 2);
    expect(swing.open).toBe(0);
    for (let s = 0; s <= 4; s += 0.1) {
      step(swing, [walking([2.4, -2], [2.4, 2], s)], 0.1);
      expect(swing.open, `she is ${s.toFixed(1)} m along the wall`).toBe(0);
    }
  });
});

describe("in the house", () => {
  /** How far someone is from a door's line, and whether she is within its doorway. */
  const at = (door: Door, pos: { x: number; z: number }): { off: number; within: boolean } => (door.axis === "x" ? { off: pos.z - door.at, within: Math.abs(pos.x - door.pos) <= door.width / 2 } : { off: pos.x - door.at, within: Math.abs(pos.z - door.pos) <= door.width / 2 });

  it("the door between the hall and the parlour opens ahead of someone walking through, towards the parlour, is wide open as she passes, and shuts behind her; and no other door stirs", () => {
    const world = createWorld(HOUSE);
    const maid = addActor(world, "m", "Maid", "evelyn", "hall.door");
    const door = doorAt(world, "z", 12, 9);
    giveOrders(world, "m", [{ do: "go", spot: "parlour.table" }]);
    const stirred = new Set<number>();
    let openedAt: number | null = null;
    let through = false;
    for (let i = 0; i < HZ * 30 && maid.errands === 0; i++) {
      const before = maid.walker.pos.x;
      stepWorld(world, 1 / HZ);
      world.swings.forEach((swing, n) => swing.open > 0 && stirred.add(n));
      if (openedAt === null && world.swings[door].open > 0) openedAt = before;
      if (before < 12 && maid.walker.pos.x >= 12) {
        through = true;
        expect(world.swings[door]).toEqual({ open: 1, side: 1 });
      }
    }
    expect(through).toBe(true);
    // It began to open while she was still short of it, and not from across the hall.
    expect(openedAt).toBeLessThan(12 - 0.5);
    expect(openedAt).toBeGreaterThan(12 - OPENS_AHEAD - 0.1);
    expect([...stirred]).toEqual([door]);
    for (let i = 0; i < HZ * 2; i++) stepWorld(world, 1 / HZ);
    expect(world.swings[door].open).toBe(0);
  });

  it("the same door opens the other way for someone coming out of the parlour", () => {
    const world = createWorld(HOUSE);
    const maid = addActor(world, "m", "Maid", "evelyn", "parlour.table");
    const door = doorAt(world, "z", 12, 9);
    giveOrders(world, "m", [{ do: "go", spot: "hall.door" }]);
    let side = 0;
    for (let i = 0; i < HZ * 30 && maid.errands === 0; i++) {
      stepWorld(world, 1 / HZ);
      if (world.swings[door].open === 1) side = world.swings[door].side;
    }
    expect(side).toBe(-1);
  });

  it("nobody walks through a door that is not open, all through the household's rounds", () => {
    const world = createWorld(HOUSE);
    for (const c of CAST) addActor(world, c.id, c.name, c.sprite, c.start);
    const script = runScript(world);
    let passed = 0;
    for (let i = 0; i < HZ * 400; i++) {
      script.step();
      const before = world.actors.map((a) => ({ ...a.walker.pos }));
      stepWorld(world, 1 / HZ);
      world.actors.forEach((actor, n) => {
        world.doors.forEach((door, d) => {
          if (Math.abs(actor.walker.pos.y - door.y) > 0.3) return;
          const [was, is] = [at(door, before[n]), at(door, actor.walker.pos)];
          if (!is.within || was.off * is.off > 0 || was.off === is.off) return;
          passed += 1;
          // (Which way it stands open is not held to here: two who meet in a doorway find it open the way the first of them went.)
          expect(world.swings[d].open, `${actor.name} walked through a door that was ${Math.round(world.swings[d].open * 100)}% open`).toBeGreaterThan(0.9);
        });
      });
    }
    expect(passed).toBeGreaterThan(20);
  });
});

describe("where an open door's leaves stand", () => {
  it("is square to the wall at the end the leaf hangs from, on the side it is open to, as far out as the leaf reaches and a body's room beside it", () => {
    // Hung from the low end (z = -0.5), open towards the high side of the wall (x > 2).
    expect(underLeaves(DOOR, 1, 2.5, -0.5)).toBe(true);
    expect(underLeaves(DOOR, 1, 2.5, -0.3)).toBe(true);
    expect(underLeaves(DOOR, 1, 3.2, -0.5)).toBe(true);
    // Past its reach; through the middle of the doorway; at the other end; on the other side of the wall.
    expect(underLeaves(DOOR, 1, 3.3, -0.5)).toBe(false);
    expect(underLeaves(DOOR, 1, 2.5, 0)).toBe(false);
    expect(underLeaves(DOOR, 1, 2.5, 0.5)).toBe(false);
    expect(underLeaves(DOOR, 1, 1.5, -0.5)).toBe(false);
    expect(underLeaves(DOOR, -1, 1.5, -0.5)).toBe(true);
  });

  it("is at the other end for a door hung from the high end, and at both for a wide one", () => {
    const high = { ...DOOR, hinge: "high" as const };
    expect(underLeaves(high, 1, 2.5, 0.5)).toBe(true);
    expect(underLeaves(high, 1, 2.5, -0.5)).toBe(false);
    const wide = { ...DOOR, width: 1.5 };
    expect(underLeaves(wide, 1, 2.5, -0.75)).toBe(true);
    expect(underLeaves(wide, 1, 2.5, 0.75)).toBe(true);
    expect(underLeaves(wide, 1, 2.5, 0)).toBe(false);
    // Each leaf of a wide door reaches half of it.
    expect(underLeaves(wide, 1, 3.1, -0.75)).toBe(false);
  });
});

describe("a way round the leaves", () => {
  const nav = buildNav(HOUSE);
  const doors = doorsOf(HOUSE);
  const allShut = doors.map(shut);
  const spot = (id: string) => {
    const found = HOUSE.spots.find((s) => s.id === id);
    if (!found) throw new Error(`no spot ${id}`);
    return found;
  };
  /** The doors a way goes through whose leaves, open for it, it passes under. */
  const under = (route: NonNullable<ReturnType<typeof findRoute>>): string[] => {
    const on = doorsOn(doors, route);
    return on.filter(({ door, side }) => passesOver(nav, route, (floor, x, z) => floor === door.floor && underLeaves(door, side, x, z))).map(({ door }) => `${door.floor} ${door.axis} ${door.at} ${door.pos}`);
  };

  it("knows the doors a way goes through, in order, and which way through each", () => {
    const way = findRoute(nav, spot("hall.door"), spot("parlour.table"));
    if (!way) throw new Error("no way");
    expect(doorsOn(doors, way).map(({ door, side }) => [door.axis, door.at, door.pos, side])).toEqual([["z", 12, 9, 1]]);
    const back = findRoute(nav, spot("parlour.table"), spot("hall.door"));
    if (!back) throw new Error("no way");
    expect(doorsOn(doors, back).map(({ side }) => side)).toEqual([-1]);
    // Up the stairs: the doors of both storeys, and none for the flight between.
    const up = findRoute(nav, spot("kitchen.range"), spot("study.desk"));
    if (!up) throw new Error("no way");
    expect(doorsOn(doors, up).map(({ door }) => door.floor)).toEqual(["ground", "ground", "first"]);
  });

  it("is the way it always was, where that passes under no leaf", () => {
    const plain = findRoute(nav, spot("hall.door"), spot("landing.window"));
    expect(findWay(nav, doors, allShut, spot("hall.door"), spot("landing.window"))).toEqual(plain);
  });

  it("goes round a leaf the plain way would pass under, and is little longer for it", () => {
    // Every walk between two spots, from every other spot: those whose plain way passes under a leaf of a door it goes through.
    let through = 0;
    let plainUnder = 0;
    let stillUnder = 0;
    let worst = 0;
    HOUSE.spots.forEach((from, n) => {
      if (n % 2) return;
      for (const to of HOUSE.spots) {
        const plain = from === to ? null : findRoute(nav, from, to);
        if (!plain || doorsOn(doors, plain).length === 0) continue;
        through += 1;
        const round = findWay(nav, doors, allShut, from, to);
        if (!round) throw new Error("the way was lost");
        if (under(plain).length > 0) plainUnder += 1;
        if (under(round).length > 0) stillUnder += 1;
        worst = Math.max(worst, round.length - plain.length);
        // Round or not, it comes to the same place.
        expect(round.points[round.points.length - 1]).toEqual(plain.points[plain.points.length - 1]);
      }
    });
    expect(through).toBeGreaterThan(1000);
    // The plain way passes under a leaf in a great many of them; the way round, in hardly any (where there is no way round).
    expect(plainUnder).toBeGreaterThan(through / 4);
    expect(stillUnder).toBeLessThanOrEqual(3);
    expect(worst).toBeLessThanOrEqual(2);
  }, 30_000);

  it("keeps to the plain way where the way round would be a long way round: that is not going round a door but going another way", () => {
    // With every door hung from its low end, the leaf of the hall's door to the shop stands across the foot of the stairs: the only way round it is through the kitchen.
    const allLow = doors.map((door) => ({ ...door, hinge: undefined }));
    const [from, to] = [spot("bedroom.bed"), spot("shop.shelf.e")];
    const plain = findRoute(nav, from, to);
    if (!plain) throw new Error("no way");
    const bar = leavesToRound(allLow, allShut, plain, from);
    const longWayRound = bar && findRoute(nav, from, to, bar);
    expect(longWayRound?.length).toBeGreaterThan(plain.length + 4);
    expect(findWay(nav, allLow, allShut, from, to)).toEqual(plain);
  });

  it("goes round a door that stands open near where she sets out, as it stands; and not one that is far off, which will have shut", () => {
    const way = findRoute(nav, spot("hall.door"), spot("landing.window"));
    if (!way) throw new Error("no way");
    const parlour = doors.findIndex((d) => d.floor === "ground" && d.axis === "z" && d.at === 12 && d.pos === 9);
    const open = doors.map((_, n) => (n === parlour ? { open: 1, side: -1 as const } : shut()));
    // The parlour's doors stand open into the hall, two metres or so from the front door: their leaves are barred to her.
    const near = leavesToRound(doors, open, way, spot("hall.door"));
    expect(near?.("ground", 11.5, 8.25)).toBe(true);
    expect(near?.("ground", 12.5, 8.25)).toBe(false);
    expect(near?.("first", 11.5, 8.25)).toBe(false);
    // From the kitchen they are far off, and nothing is barred: her way goes through no door.
    const far = findRoute(nav, spot("kitchen.range"), spot("kitchen.backdoor"));
    if (!far) throw new Error("no way");
    expect(leavesToRound(doors, open, far, spot("kitchen.range"))).toBeNull();
  });

  it("is found over ground that is not barred: round what is, with where she stands and where she is going never barred; and not at all where everything about her goal is", () => {
    const from = spot("hall.door");
    const to = spot("parlour.table");
    const plain = findRoute(nav, from, to);
    // A patch of the parlour just inside its doors, which the plain way crosses.
    const bar = (floor: string, x: number, z: number): boolean => floor === "ground" && x > 12.3 && x < 13.3 && z > 8.6 && z < 9.4;
    const round = findRoute(nav, from, to, bar);
    if (!round || !plain) throw new Error("no way");
    expect(passesOver(nav, plain, bar)).toBe(true);
    expect(passesOver(nav, round, bar)).toBe(false);
    expect(round.length).toBeGreaterThan(plain.length);
    // The very squares she stands on and is going to, barred: she sets out and arrives all the same.
    const ends = [nav.nearest(from), nav.nearest(to)].map((id) => nav.cell(id ?? -1));
    expect(findRoute(nav, from, to, (_floor, x, z) => ends.some((end) => end.x === x && end.z === z))).not.toBeNull();
    // Everything within a stride of where she is going, barred: there is no way to it.
    expect(findRoute(nav, from, to, (_floor, x, z) => Math.hypot(x - to.x, z - to.z) < 1.2)).toBeNull();
    // …and nothing is left barred when the looking is over.
    expect(findRoute(nav, from, to)).toEqual(plain);
  });
});

describe("walking about the house", () => {
  it("hardly anyone is ever under the leaf of a door that stands open, all through the household's rounds", () => {
    const world = createWorld(HOUSE);
    for (const c of CAST) addActor(world, c.id, c.name, c.sprite, c.start);
    const script = runScript(world);
    let under = 0;
    let walking = 0;
    for (let i = 0; i < HZ * 400; i++) {
      script.step();
      stepWorld(world, 1 / HZ);
      for (const actor of world.actors) {
        if (!actor.walker.route) continue;
        walking += 1;
        if (world.doors.some((door, d) => world.swings[d].open > 0.5 && Math.abs(actor.walker.pos.y - door.y) < 0.3 && underLeaves(door, world.swings[d].side, actor.walker.pos.x, actor.walker.pos.z))) under += 1;
      }
    }
    expect(walking).toBeGreaterThan(HZ * 400);
    // (Not never: two who meet at a door find it open the way the first of them went, and the second may have to pass its leaf.)
    expect(under / walking).toBeLessThan(UNDER_A_LEAF);
  });
});
