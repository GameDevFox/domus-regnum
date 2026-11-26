import { pointAlong } from "./route";
import type { Route } from "./route";
import type { Vec3 } from "./types";

// Someone walking a route. They gather speed, ease off into a corner, slow on the stairs, and
// stop without a jolt; their heading follows a little behind the path so that turns look turned.

/** Metres per second on the flat and on a stair. */
export const WALK_SPEED = 1.35;
export const STAIR_SPEED = 0.8;
/** Metres per second per second, speeding up and slowing down. */
const ACCELERATION = 3.2;
/** How quickly the body turns to face where it is going, per second. */
const TURN_RATE = 9;
/** The fastest anyone spins, in radians per second: a brisk about-turn, not a snap. */
const MAX_TURN_SPEED = 5.5;
/** How far ahead a walker looks to judge the turn that is coming. */
const LOOK_AHEAD = 0.45;
/** The share of full speed kept through a right-angle turn. */
const CORNER_SPEED = 0.55;
/** The share of full speed someone manages while still facing the wrong way: they turn, then go. */
const PIVOT_SPEED = 0.12;
/** Facing within this of the way she is going costs no speed; by a quarter-turn off she is down to the pivot speed. */
const FACING_FREE = Math.PI / 3;
const FACING_WRONG = Math.PI / 2;
/** How far ahead along the path the body turns to face: a short lead, so it leans into a bend without turning early. */
const HEADING_LEAD = 0.12;
const ARRIVE_EPS = 0.01;

export type Walker = {
  pos: Vec3;
  /** Radians; 0 faces south (+Z), a quarter-turn faces east (+X). */
  heading: number;
  speed: number;
  route: Route | null;
  /** Metres walked along the route. */
  s: number;
  onStair: boolean;
};

export const createWalker = (pos: Vec3, heading = 0): Walker => ({ pos: { ...pos }, heading, speed: 0, route: null, s: 0, onStair: false });

export const setRoute = (w: Walker, route: Route | null): void => {
  w.route = route;
  w.s = 0;
};

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Turn `from` towards `to` by the shortest way: by the share `rate * dt` of what is left, and never faster than a person spins. */
export const turnToward = (from: number, to: number, rate: number, dt: number): number => {
  const limit = MAX_TURN_SPEED * dt;
  const step = wrap(to - from) * Math.min(1, rate * dt);
  return wrap(from + Math.max(-limit, Math.min(limit, step)));
};

/** Move a walker on by `dt` seconds, at the share `pace` of their usual speed. True once the route is finished (or there is none). */
export const stepWalker = (w: Walker, dt: number, pace = 1): boolean => {
  const route = w.route;
  if (!route) {
    w.speed = 0;
    return true;
  }
  const left = route.length - w.s;
  if (left <= ARRIVE_EPS) {
    const end = route.points[route.points.length - 1];
    w.pos = { ...end };
    w.speed = 0;
    w.route = null;
    w.onStair = false;
    return true;
  }
  const here = pointAlong(route, w.s);
  const ahead = pointAlong(route, w.s + LOOK_AHEAD);
  const turn = Math.abs(wrap(ahead.heading - here.heading));
  const cornering = 1 - (1 - CORNER_SPEED) * Math.min(1, turn / (Math.PI / 2));
  // Only someone facing well away from her path is held back: a body a little behind a bend is not.
  const off = Math.abs(wrap(here.heading - w.heading));
  const facing = off <= FACING_FREE ? 1 : Math.max(PIVOT_SPEED, 1 - ((off - FACING_FREE) / (FACING_WRONG - FACING_FREE)) * (1 - PIVOT_SPEED));
  const cruise = (here.onStair ? STAIR_SPEED : WALK_SPEED) * cornering * facing * pace;
  // Never be going faster than can be shed in the distance that is left.
  const braking = Math.sqrt(2 * ACCELERATION * left);
  const want = Math.min(cruise, braking);
  const change = ACCELERATION * dt;
  w.speed = w.speed < want ? Math.min(want, w.speed + change) : Math.max(want, w.speed - change);
  w.s = Math.min(route.length, w.s + w.speed * dt);
  const now = pointAlong(route, w.s);
  w.pos = now.pos;
  w.onStair = now.onStair;
  w.heading = turnToward(w.heading, pointAlong(route, w.s + HEADING_LEAD).heading, TURN_RATE, dt);
  return false;
};
