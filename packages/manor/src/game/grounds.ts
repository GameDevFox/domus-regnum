import { addActorAt, giveOrders, go, spotOf } from "../space";
import type { Actor, Order, World } from "../space";
import { SQUARES_ACROSS, SQUARES_DEEP } from "./garden";
import { SPOT } from "./tuning";

// The grounds, as far as the rules know them: where the property is come onto, and the ways from
// there to the doors of the house. A visitor is seen from the moment she is on the property, not
// from the moment she is at the door: she comes in at the gate and walks up, and walks off the
// same way. (The author's asking, 2026-11-13: it "gives the player more time to anticipate
// guests".) The household, going out to a place on the map, walk down the drive to the gate
// and are gone there, and come home by it (the author's, 2026-11-14).
//
// The points are the gravel's, as the garden is drawn (src/demo3d/exterior.ts).

type Point = { x: number; z: number };

/** The gate at the foot of the drive, and the foot of the steps to the front door. */
export const GATE: Point = { x: 10, z: 21.6 };
export const FRONT_STEPS: Point = { x: 10, z: 12.9 };
/** Where the drive meets the walk along the shop front, and where that walk meets the steps to the shop's door. */
const DRIVE_HEAD: Point = { x: 10, z: 13.7 };
const SHOP_STEPS: Point = { x: 3.25, z: 13.7 };
/** The end of the path from the kitchen's back door, where the carter's cart stands in the lane. */
const LANE: Point = { x: 3.25, z: -5 };

/**
 * The kitchen garden behind the house: where its four plots are (they are drawn there:
 * src/demo3d/exterior.ts), the aisle between its two rows, from which every plot is seen to,
 * and where that aisle meets the path from the back door.
 */
export const PLOT_AT: Point[] = [{ x: 5.5, z: -2 }, { x: 5.5, z: -4.6 }, { x: 8.6, z: -2 }, { x: 8.6, z: -4.6 }];
/** How big a plot is, in metres: across (east and west) and deep (north and south). */
export const PLOT_SIZE = { w: 2.4, d: 1.9 };
/** The middle of one square of a plot: they lie row by row from the north-west. */
export const squareAt = (plot: number, square: number): Point => ({
  x: PLOT_AT[plot].x + ((square % SQUARES_ACROSS) + 0.5 - SQUARES_ACROSS / 2) * (PLOT_SIZE.w / SQUARES_ACROSS),
  z: PLOT_AT[plot].z + (Math.floor(square / SQUARES_ACROSS) + 0.5 - SQUARES_DEEP / 2) * (PLOT_SIZE.d / SQUARES_DEEP),
});
const AISLE_Z = -3.3;
export const AISLE_FOOT: Point = { x: 3.25, z: AISLE_Z };
/** Where someone stands to see to a plot: in the aisle, beside it. */
export const standAt = (plot: number): Point => ({ x: PLOT_AT[plot].x, z: AISLE_Z });
/** The way the gardener walks, from the back door's step to the far end of the aisle: for whoever checks that she keeps to it. */
export const GARDEN_WAY: Point[] = [{ x: AISLE_FOOT.x, z: 1 }, AISLE_FOOT, { x: Math.max(...PLOT_AT.map((plot) => plot.x)), z: AISLE_Z }];

/** A way onto the property and up to a door: the points walked out of doors, from the edge of the property, and the spot just inside the door. */
export type Approach = { way: Point[]; door: string };

export const APPROACHES = {
  /** Custom for the shop: in at the gate, up the drive, and along the shop front to its street door. */
  shop: { way: [GATE, DRIVE_HEAD, SHOP_STEPS], door: SPOT.door },
  /** The household, and callers: in at the gate and up the drive to the front door. */
  front: { way: [GATE], door: SPOT.frontDoor },
  /** Tradesmen: from the lane, up the back path to the kitchen's door. */
  back: { way: [LANE], door: SPOT.backDoor },
} satisfies Record<string, Approach>;

/** Visitors keep this far to their own right of the middle of a way, in metres: so those coming and those going pass, and do not walk through each other. */
const KEEP_RIGHT = 0.3;

/** The points of a line, walked in the order given, each moved to the walker's own right of it: a line beside the line. */
export const toTheRight = (line: Point[]): Point[] =>
  line.map((point, n) => {
    // The right of each stretch that meets here: west when she walks south.
    const rights = [line[n - 1] && [line[n - 1], point], line[n + 1] && [point, line[n + 1]]]
      .filter((stretch): stretch is Point[] => Boolean(stretch))
      .map(([a, b]) => ({ x: -(b.z - a.z) / Math.hypot(b.x - a.x, b.z - a.z), z: (b.x - a.x) / Math.hypot(b.x - a.x, b.z - a.z) }));
    const sum = rights.reduce((s, r) => ({ x: s.x + r.x, z: s.z + r.z }), { x: 0, z: 0 });
    // At a corner the two meet: the point that is the same distance to the right of both.
    const meet = rights.length === 2 ? 1 + rights[0].x * rights[1].x + rights[0].z * rights[1].z : 1;
    return { x: point.x + (sum.x / meet) * KEEP_RIGHT, z: point.z + (sum.z / meet) * KEEP_RIGHT };
  });

/** Which way one point lies from another, as a heading: 0 looks south. */
const headingTo = (from: Point, to: Point): number => Math.atan2(to.x - from.x, to.z - from.z);

const doorOf = (world: World, approach: Approach): Point => {
  const door = spotOf(world, approach.door);
  return { x: door.x, z: door.z };
};

/** The points walked from the edge of the property in at a door: to her right of the way all the way up, and in at the middle of the door. */
export const wayIn = (world: World, approach: Approach): Point[] => {
  const door = doorOf(world, approach);
  return [...toTheRight([...approach.way, door]).slice(0, -1), door];
};

/**
 * A visitor comes onto the property where a way begins, walks up it and in at its door, and then
 * does as she is told in the house.
 */
export const comeBy = (world: World, approach: Approach, visitor: { id: string; name: string; sprite: string }, then: Order[] = []): Actor => {
  const [from, ...points] = wayIn(world, approach);
  const actor = addActorAt(world, visitor.id, visitor.name, visitor.sprite, from, headingTo(from, points[0]));
  giveOrders(world, visitor.id, [{ do: "path", points }, ...then]);
  return actor;
};

/** The orders that take a visitor out at the door and off the property, the way she came: on the other side of it, which is her right now. */
export const goBy = (world: World, approach: Approach): Order[] => [go(approach.door), { do: "path", points: toTheRight([doorOf(world, approach), ...[...approach.way].reverse()]).slice(1) }];
