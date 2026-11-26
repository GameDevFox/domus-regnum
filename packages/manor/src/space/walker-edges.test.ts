import { describe, expect, it } from "vitest";

import { straightRoute } from "./route";
import { STAIR_SPEED, WALK_SPEED, createWalker, setRoute, stepWalker, turnToward } from "./walker";

// Someone walking, at the edges of the rules: the pace asked, a corner too sharp for the usual share, the end of a route.

/** The share of her speed someone keeps through the sharpest turn there is (the walker's own figure). */
const CORNER_SHARE = 0.55;

/** The walk south from the origin, so many metres; a walker made at the origin faces south. */
const south = (metres: number) => straightRoute([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: metres }]);
/** A walk south and straight back: a turn right about, a way along. */
const thereAndBack = (metres: number) => straightRoute([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: metres }, { x: 0, y: 0, z: 0 }]);

/** A walker set off along a route, one second being enough to reach whatever speed the walk allows. */
const setOff = (route: ReturnType<typeof south>, pace?: number) => {
  const walker = createWalker({ x: 0, y: 0, z: 0 });
  setRoute(walker, route);
  stepWalker(walker, 1, pace);
  return walker;
};

describe("a walker", () => {
  it("walks at the pace asked of her: half the pace is half the speed", () => {
    expect(setOff(south(30)).speed).toBeCloseTo(WALK_SPEED);
    expect(setOff(south(30), 0.5).speed).toBeCloseTo(WALK_SPEED / 2);
  });

  it("is slowed to stop where the route ends, and not made to run at the end of a short one", () => {
    expect(setOff(south(0.2)).speed).toBeLessThan(WALK_SPEED);
  });

  it("is never farther along a route than its end, however long a step she is given", () => {
    const route = south(1);
    const walker = setOff(route);
    expect(walker.s).toBe(route.length);
    expect(walker.pos.z).toBeCloseTo(1);
  });

  it("is brought to a stop, with nothing under her feet but the floor, when she arrives", () => {
    const route = south(1);
    const walker = setOff(route);
    walker.onStair = true;
    expect(stepWalker(walker, 1)).toBe(true);
    expect(walker.route).toBeNull();
    expect(walker.speed).toBe(0);
    expect(walker.onStair).toBe(false);
  });

  it("stops at once, and is done, when she has no route", () => {
    const walker = createWalker({ x: 0, y: 0, z: 0 });
    walker.speed = 1;
    expect(stepWalker(walker, 1)).toBe(true);
    expect(walker.speed).toBe(0);
  });

  it("keeps some share of her speed through a turn right about, and no less than through a right angle's worth", () => {
    // (The turn is a quarter of a turn's share at most, so a turn back on herself costs what a corner square to her way does.)
    const walker = createWalker({ x: 0, y: 0, z: 0 });
    setRoute(walker, thereAndBack(5));
    Object.assign(walker, { s: 4.8 });
    walker.pos = { x: 0, y: 0, z: 4.8 };
    stepWalker(walker, 1);
    expect(walker.speed).toBeCloseTo(WALK_SPEED * CORNER_SHARE);
  });

  it("goes slowly, and not backwards or not at all, while she faces right away from her way", () => {
    const walker = createWalker({ x: 0, y: 0, z: 0 }, Math.PI);
    setRoute(walker, south(30));
    stepWalker(walker, 1);
    expect(walker.speed).toBeGreaterThan(0);
    expect(walker.speed).toBeLessThan(WALK_SPEED / 2);
  });

  it("is slower on a stair", () => {
    const walker = createWalker({ x: 0, y: 0, z: 0 });
    setRoute(walker, { ...south(30), stair: [false, true] });
    stepWalker(walker, 1);
    expect(walker.speed).toBeCloseTo(STAIR_SPEED);
  });
});

describe("turning", () => {
  it("is to where she is looking, by a share of what is left, and no farther: it does not overshoot a little way off", () => {
    expect(turnToward(0, 0.1, 9, 0.5)).toBeCloseTo(0.1);
    expect(turnToward(0, -0.1, 9, 0.5)).toBeCloseTo(-0.1);
  });
});
