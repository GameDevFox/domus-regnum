import type { Bar, Nav } from "./nav";
import { findRoute, pointAlong } from "./route";
import type { Route } from "./route";
import type { FloorId, Opening, Plan, Pos } from "./types";
import type { Walker } from "./walker";

// The doors of the house swing (the author's asking, 2026-11-14: "Doors that swing open before
// people pass through them. For now, doors can open EITHER way for convenience"). Every doorway
// has a leaf, shut while nobody is at it. It opens ahead of whoever's way goes through it, away
// from her, whichever side she comes from; stays open while she is in the way of its closing;
// and shuts behind her. Nothing here stops anyone: a door is seen, and walked through as the
// doorway always was. But a way is found that goes round where its leaves will stand, where
// there is one (the author's, later the same day: "route AROUND open doors where possible
// instead of THROUGH them"): `findWay`, at the foot of this file.

/** A door: a doorway of the plan, with the middle of it on the ground (x and z) and the height of the floor it stands on. */
export type Door = Opening & { x: number; y: number; z: number };

/** How a door stands: how far open, from 0 shut to 1 open; and which way it swings, towards the high side of its wall's line (1) or the low (-1). */
export type Swing = { open: number; side: 1 | -1 };

/** A door opens when someone's way goes through it within this many metres of where she is… */
export const OPENS_AHEAD = 1.4;
/** …and is still hers when she is no more than this far past it. */
const HELD_BEHIND = 0.5;
/** How long a door takes to swing open, or shut, in seconds. */
export const SWING_SECONDS = 0.4;
/** A way is looked along this finely for where it goes through a door, in metres. */
const LOOK_STEP = 0.1;
/** People on another storey are not at this door. */
const SAME_STOREY = 0.6;
/** A doorway wider than this has two leaves, hinged at either side; a narrower one has one. */
const DOUBLE_OVER = 1.2;
/** A door is not shut on someone: it stays open while anyone is within this of where its leaves swing, in metres. */
const CLEAR_OF_LEAF = 0.3;

export const doorOf = (opening: Opening, y: number): Door => ({ ...opening, y, x: opening.axis === "x" ? opening.pos : opening.at, z: opening.axis === "x" ? opening.at : opening.pos });

export const doorsOf = (plan: Plan): Door[] => plan.openings.filter((o) => o.kind === "door").map((o) => doorOf(o, plan.storeys[o.floor].y));

export const shut = (): Swing => ({ open: 0, side: 1 });

/** How many leaves a door has, and how long each is: how far it reaches from its hinge. */
export const leavesOf = (door: Door): { count: 1 | 2; reach: number } => (door.width > DOUBLE_OVER ? { count: 2, reach: door.width / 2 } : { count: 1, reach: door.width });

/** Where a door's leaves hang: for each, the end of the doorway its hinge is at, along the wall, and which way along the wall the leaf reaches from there when it is shut (1 up it, -1 down it). */
export const hingesOf = (door: Door): { at: number; reaches: 1 | -1 }[] => {
  const low = { at: door.pos - door.width / 2, reaches: 1 as const };
  const high = { at: door.pos + door.width / 2, reaches: -1 as const };
  return leavesOf(door).count === 2 ? [low, high] : [door.hinge === "high" ? high : low];
};

/** A point as a door sees it: how far along its wall, and how far off the wall's line (to the high side, positive). */
const seenBy = (door: Door, at: { x: number; z: number }): { along: number; off: number } => (door.axis === "x" ? { along: at.x, off: at.z - door.at } : { along: at.z, off: at.x - door.at });

/** Which way a step from one point to the next goes through a door, as the door sees the points: from one side of its wall's line to the other, within the doorway. Null if it does not. */
const crossing = (door: Door, last: { along: number; off: number }, at: { along: number; off: number }): 1 | -1 | null => {
  if (last.off === at.off || last.off * at.off > 0) return null;
  const share = last.off / (last.off - at.off);
  return Math.abs(last.along + (at.along - last.along) * share - door.pos) <= door.width / 2 ? (at.off > last.off ? 1 : -1) : null;
};

/**
 * Which way someone is going through a door, if her way goes through it close ahead of her or
 * has just: 1 towards the high side of the wall's line, -1 towards the low. Null if it does not.
 */
export const goingThrough = (door: Door, walker: Walker): 1 | -1 | null => {
  const { route } = walker;
  if (!route || Math.abs(walker.pos.y - door.y) > SAME_STOREY) return null;
  // (No way goes through a door that is farther off than the way is looked along. Asked of every door for everyone walking, many times a second: so it is asked cheaply.)
  const far = OPENS_AHEAD + door.width;
  if (Math.abs(walker.pos.x - door.x) > far || Math.abs(walker.pos.z - door.z) > far) return null;
  const to = Math.min(route.length, walker.s + OPENS_AHEAD);
  let last = seenBy(door, pointAlong(route, Math.max(0, walker.s - HELD_BEHIND)).pos);
  for (let s = Math.max(0, walker.s - HELD_BEHIND) + LOOK_STEP; ; s += LOOK_STEP) {
    const at = seenBy(door, pointAlong(route, Math.min(s, to)).pos);
    const through = crossing(door, last, at);
    if (through !== null) return through;
    if (s >= to) return null;
    last = at;
  }
};

/** Whether someone is where a door's leaves swing as it stands open: in the doorway, or on the side it opens to, within reach of a leaf. */
export const inTheWay = (door: Door, swing: Swing, walker: Walker): boolean => {
  if (Math.abs(walker.pos.y - door.y) > SAME_STOREY) return false;
  const { along, off } = seenBy(door, walker.pos);
  const beyond = off * swing.side;
  return Math.abs(along - door.pos) <= door.width / 2 + CLEAR_OF_LEAF && beyond >= -CLEAR_OF_LEAF && beyond <= leavesOf(door).reach + CLEAR_OF_LEAF;
};

/** Move every door on by a moment: open ahead of whoever is going through it, away from her, and shut again when nobody is at it. */
export const stepDoors = (doors: Door[], swings: Swing[], walkers: Walker[], dt: number): void => {
  const walking = walkers.filter((walker) => walker.route !== null);
  doors.forEach((door, n) => {
    const swing = swings[n];
    // (Most doors, most of the time: shut, and nobody walking anywhere.)
    if (swing.open === 0 && walking.length === 0) return;
    const going = walking.reduce<1 | -1 | null>((found, walker) => found ?? goingThrough(door, walker), null);
    // Shut, it opens the way she is going; once it has begun to open it keeps to that way until it is shut again.
    if (going !== null && swing.open === 0) swing.side = going;
    const wanted = going !== null || (swing.open > 0 && walkers.some((walker) => inTheWay(door, swing, walker)));
    swing.open = Math.max(0, Math.min(1, swing.open + (wanted ? dt : -dt) / SWING_SECONDS));
  });
};

// Round the leaves. A door that stands open has its leaves out in the room, square to the
// wall at the jambs they hang from; a way that turns towards a hinge just past a door would go
// through one. So a way is found twice: once as it always was; and, if that way passes where
// a leaf will stand, again with that ground barred. If there is no way round, the first is kept.

/** How near the line of an open leaf someone's middle may come: half a body's width, and a little. */
const LEAF_CLEARANCE = 0.25;
/** A way round is taken if it is no more than this much longer than the way through, in metres: farther than that is not going round a door but going another way. */
const MOST_OUT_OF_THE_WAY = 2;
/** A door that stands open now is gone round by someone setting out within this of it: by the time anyone farther off is there, it has shut. */
const OPEN_NOW_WITHIN = 3;
/** A way is looked along this finely for whether it passes where a leaf will stand, in metres. */
const WAY_STEP = 0.1;

/** Whether a point is where an open door's leaves stand, or too near them for a body: the door being open to that side. */
export const underLeaves = (door: Door, side: 1 | -1, x: number, z: number): boolean => {
  const { along, off } = seenBy(door, { x, z });
  const beyond = off * side;
  if (beyond <= 0 || beyond > leavesOf(door).reach + LEAF_CLEARANCE) return false;
  // Open, a leaf stands square to the wall at the end of the doorway it hangs from.
  return hingesOf(door).some((hinge) => Math.abs(along - hinge.at) <= LEAF_CLEARANCE);
};

/** The doors a way goes through, in the order it comes to them, each with the side it is gone through towards. */
export const doorsOn = (doors: Door[], route: Route): { door: Door; side: 1 | -1 }[] =>
  route.points.slice(1).flatMap((to, n) => {
    const from = route.points[n];
    return doors.flatMap((door) => {
      if (Math.abs(from.y - door.y) > SAME_STOREY || Math.abs(to.y - door.y) > SAME_STOREY) return [];
      const side = crossing(door, seenBy(door, from), seenBy(door, to));
      return side === null ? [] : [{ door, side }];
    });
  });

/**
 * The ground someone setting out on a way is not to walk over: where the leaves of the doors
 * her way goes through will stand, open for her; and where those of a door near her stand
 * open now. Null if there is none.
 */
export const leavesToRound = (doors: Door[], swings: Swing[], route: Route, from: { x: number; z: number }): Bar | null => {
  const open = new Map<Door, 1 | -1>();
  // A door that is open keeps to the way it opened: its leaves are where they are, whichever way she goes through.
  doors.forEach((door, n) => {
    if (swings[n].open > 0 && Math.hypot(from.x - door.x, from.z - door.z) <= OPEN_NOW_WITHIN) open.set(door, swings[n].side);
  });
  // (One on her way that stands open farther off will have shut, and will open for her as she comes to it.)
  for (const { door, side } of doorsOn(doors, route)) if (!open.has(door)) open.set(door, side);
  if (open.size === 0) return null;
  const standing = [...open];
  return (floor, x, z) => standing.some(([door, side]) => door.floor === floor && underLeaves(door, side, x, z));
};

/** Whether a way passes over barred ground anywhere along it. (A stair is on no storey, and so over none.) */
export const passesOver = (nav: Nav, route: Route, bar: Bar): boolean => {
  const floors = Object.entries(nav.plan.storeys) as [FloorId, { y: number }][];
  for (let s = 0; s <= route.length; s += WAY_STEP) {
    const { pos } = pointAlong(route, s);
    const floor = floors.find(([, storey]) => Math.abs(storey.y - pos.y) < 1e-6)?.[0];
    if (floor && bar(floor, pos.x, pos.z)) return true;
  }
  return false;
};

/**
 * The walk from one place to another, round the leaves of the doors it goes through, where
 * there is a way round them; or null when there is no way at all.
 */
export const findWay = (nav: Nav, doors: Door[], swings: Swing[], from: Pos, to: Pos): Route | null => {
  const plain = findRoute(nav, from, to);
  if (!plain) return null;
  const bar = leavesToRound(doors, swings, plain, from);
  if (!bar || !passesOver(nav, plain, bar)) return plain;
  const round = findRoute(nav, from, to, bar);
  return round && round.length <= plain.length + MOST_OUT_OF_THE_WAY ? round : plain;
};
