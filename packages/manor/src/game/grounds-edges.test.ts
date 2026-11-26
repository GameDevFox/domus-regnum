import { describe, expect, it } from "vitest";

import { APPROACHES, PLOT_AT, PLOT_SIZE, goBy, squareAt, wayIn } from "./grounds";
import { SQUARES, SQUARES_ACROSS, SQUARES_DEEP } from "./garden";
import { gameAt } from "./test-kit";

// The grounds at their edges: where each square of a plot is, and how many points make the way in and the way out.

describe("a square of a plot", () => {
  it("is in the middle of its share of the plot: the first at the north-west, the last at the south-east, and each the same distance from the next", () => {
    const [x, z] = [PLOT_AT[0].x, PLOT_AT[0].z];
    const stepX = PLOT_SIZE.w / SQUARES_ACROSS;
    const stepZ = PLOT_SIZE.d / SQUARES_DEEP;
    const first = squareAt(0, 0);
    const last = squareAt(0, SQUARES - 1);
    expect(first.x).toBeCloseTo(x - stepX);
    expect(first.z).toBeCloseTo(z - stepZ / 2);
    expect(last.x).toBeCloseTo(x + stepX);
    expect(last.z).toBeCloseTo(z + stepZ / 2);
    expect(squareAt(0, 1).x - first.x).toBeCloseTo(stepX);
    expect(squareAt(0, SQUARES_ACROSS).z - first.z).toBeCloseTo(stepZ);
  });
});

describe("the way in at a door", () => {
  it("is the points of the way, to the visitor's right, and then the middle of the door itself: the door once", () => {
    const { world } = gameAt();
    const points = wayIn(world, APPROACHES.front);
    expect(points).toHaveLength(2);
    expect(wayIn(world, APPROACHES.shop)).toHaveLength(APPROACHES.shop.way.length + 1);
  });
});

describe("the way out at a door", () => {
  it("goes to the door, and then along the way it came by in the other order, not back through the door again", () => {
    const { world } = gameAt();
    const orders = goBy(world, APPROACHES.shop);
    expect(orders).toHaveLength(2);
    const walk = orders[1];
    if (walk.do !== "path") throw new Error("the second order is a walk");
    expect(walk.points).toHaveLength(APPROACHES.shop.way.length);
  });
});
