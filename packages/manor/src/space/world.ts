import { doorsOf, findWay, shut, stepDoors } from "./doors";
import type { Door, Swing } from "./doors";
import { buildNav } from "./nav";
import type { Nav } from "./nav";
import { straightRoute } from "./route";
import { flightAt, treadHeight } from "./stairs";
import { FACE_ANGLE, FLOOR_ORDER } from "./types";
import type { FloorId, Plan, Pos, Spot } from "./types";
import { createWalker, setRoute, stepWalker, turnToward } from "./walker";
import { roomAt, roomRects } from "./walls";
import type { Walker } from "./walker";

// People in the house and what they have been told to do. This is the seam the game will plug
// into: the game says "go to this spot, take that, work for so long" with `giveOrders`, and the
// house answers with real walks. The demo's script (script.ts) is just one caller of it.

export type Order =
  | { do: "go"; spot: string }
  /** Walk straight through these points, at the height she is at: for out of doors, where there is no floor to find a way across. */
  | { do: "path"; points: { x: number; z: number }[] }
  /** Turn to face a point. */
  | { do: "face"; x: number; z: number }
  | { do: "take"; goods: string }
  | { do: "put" }
  | { do: "work"; seconds: number; label: string };

export type Actor = {
  id: string;
  name: string;
  /** Which picture to draw them with. */
  sprite: string;
  walker: Walker;
  orders: Order[];
  /** Orders waiting for her to step off a stair before they replace the ones she has. */
  next: Order[] | null;
  carrying: string | null;
  /** Seconds left of the task in hand, and what it is. */
  busy: number;
  label: string | null;
  /** The way she turns to once she has arrived. */
  faceTo: number | null;
  /** Metres stepped aside, to her own right, to let someone pass. */
  sidestep: number;
  /** Metres walked and errands finished, for the curious. */
  walked: number;
  errands: number;
};

export type World = {
  plan: Plan;
  nav: Nav;
  spots: Map<string, Spot>;
  actors: Actor[];
  /** The doors of the house, and how each stands (doors.ts). */
  doors: Door[];
  swings: Swing[];
  t: number;
};

/** How quickly someone turns on the spot to face what they are using, per second. */
const SETTLE_TURN_RATE = 7;
const Y_EPS = 1e-3;
/** How far ahead someone notices another person, in metres. */
const NOTICE_DISTANCE = 1.8;
/** How far to the right each of two people steps to pass: together, a body's width. */
const SIDESTEP = 0.27;
/** Metres per second that the step aside is taken and given back. */
const SIDESTEP_SPEED = 0.9;
/** Nearer than this to the back of someone going the same way, she slows to their pace. */
const FOLLOWING_DISTANCE = 0.85;
/** People on different storeys do not see each other. */
const SAME_STOREY = 0.6;
/** How far ahead "in front" is, as a cosine: within about 70 degrees of where she is heading. */
const IN_FRONT = 0.35;
/** How far either side of a doorway someone coming in from out of doors walks to, in metres: off the step outside, and clear of the wall inside. */
const DOORSTEP = 0.6;

export const createWorld = (plan: Plan): World => {
  const doors = doorsOf(plan);
  return { plan, nav: buildNav(plan), spots: new Map(plan.spots.map((s) => [s.id, s])), actors: [], doors, swings: doors.map(shut), t: 0 };
};

export const spotOf = (world: World, id: string): Spot => {
  const spot = world.spots.get(id);
  if (!spot) throw new Error(`No such spot: ${id}`);
  return spot;
};

export const addActor = (world: World, id: string, name: string, sprite: string, spotId: string): Actor => {
  const spot = spotOf(world, spotId);
  const walker = createWalker({ x: spot.x, y: world.plan.storeys[spot.floor].y, z: spot.z }, FACE_ANGLE[spot.face]);
  const actor: Actor = { id, name, sprite, walker, orders: [], next: null, carrying: null, busy: 0, label: null, faceTo: null, sidestep: 0, walked: 0, errands: 0 };
  world.actors.push(actor);
  return actor;
};

/** Someone comes onto the scene at any point of the ground, in the house or out of it: a visitor at the gate. */
export const addActorAt = (world: World, id: string, name: string, sprite: string, at: { x: number; z: number }, heading = 0): Actor => {
  const actor: Actor = { id, name, sprite, walker: createWalker({ x: at.x, y: world.plan.storeys.ground.y, z: at.z }, heading), orders: [], next: null, carrying: null, busy: 0, label: null, faceTo: null, sidestep: 0, walked: 0, errands: 0 };
  world.actors.push(actor);
  return actor;
};

/** Someone leaves the house for good: a customer going out of the door. */
export const removeActor = (world: World, id: string): void => {
  const at = world.actors.findIndex((a) => a.id === id);
  if (at !== -1) world.actors.splice(at, 1);
};

/** Someone goes out of the house for a while, from where she stands: she is no longer in it, and is handed back to whoever sent her. */
export const stepOut = (world: World, id: string): Actor | null => {
  const at = world.actors.findIndex((a) => a.id === id);
  return at === -1 ? null : world.actors.splice(at, 1)[0];
};

/** She comes in again where she went out, the same person, with nothing in hand to do, facing the way given. */
export const stepIn = (world: World, actor: Actor, heading: number): void => {
  actor.orders = [];
  actor.next = null;
  actor.busy = 0;
  actor.label = null;
  actor.faceTo = null;
  actor.sidestep = 0;
  actor.walker.heading = heading;
  actor.walker.speed = 0;
  setRoute(actor.walker, null);
  if (!world.actors.includes(actor)) world.actors.push(actor);
};

/** The storey someone is standing on, or null while they are between two on a stair. */
export const floorOf = (world: World, actor: Actor): FloorId | null => FLOOR_ORDER.find((f) => Math.abs(world.plan.storeys[f].y - actor.walker.pos.y) < Y_EPS) ?? null;

/** Whether someone is out of doors: on the ground, and in no room of the house. A visitor on the drive is. */
export const outOfDoors = (world: World, actor: Actor): boolean => floorOf(world, actor) === "ground" && roomAt(world.plan, "ground", actor.walker.pos.x, actor.walker.pos.z) === null;

/** Tell someone what to do. New orders replace old ones; she finishes a stair before turning back. */
export const giveOrders = (world: World, actorId: string, orders: Order[]): void => {
  const actor = world.actors.find((a) => a.id === actorId);
  if (!actor) throw new Error(`No such person: ${actorId}`);
  actor.next = [...orders];
};

/** Finish the order in hand and start the one after it. */
const advance = (world: World, actor: Actor): void => {
  actor.orders.shift();
  if (actor.orders.length === 0) actor.errands += 1;
  else begin(world, actor);
};

/**
 * The way in from out of doors, where there is no floor to find a way across: straight to the
 * step outside the nearest door of the house, and through it. Null for someone in the house.
 */
const wayInFrom = (world: World, actor: Actor): Order | null => {
  if (!outOfDoors(world, actor)) return null;
  const { x, z } = actor.walker.pos;
  const ways = world.doors
    .filter((door) => door.kind === "door" && door.floor === "ground")
    .map((door) => {
      // Either side of the doorway, square to its wall: one side is out of doors, the other in the house.
      const side = (by: number) => (door.axis === "x" ? { x: door.x, z: door.z + by } : { x: door.x + by, z: door.z });
      const [outside, inside] = roomAt(world.plan, "ground", side(DOORSTEP).x, side(DOORSTEP).z) === null ? [side(DOORSTEP), side(-DOORSTEP)] : [side(-DOORSTEP), side(DOORSTEP)];
      return { outside, inside, far: Math.hypot(outside.x - x, outside.z - z) };
    })
    // (A door between two rooms has no outside.)
    .filter((way) => roomAt(world.plan, "ground", way.outside.x, way.outside.z) === null && roomAt(world.plan, "ground", way.inside.x, way.inside.z) !== null)
    .sort((a, b) => a.far - b.far);
  return ways[0] ? { do: "path", points: [ways[0].outside, ways[0].inside] } : null;
};

const begin = (world: World, actor: Actor): void => {
  const order = actor.orders[0];
  if (!order) return;
  if (order.do === "go") {
    const floor = floorOf(world, actor);
    const spot = spotOf(world, order.spot);
    const from: Pos = { floor: floor ?? spot.floor, x: actor.walker.pos.x, z: actor.walker.pos.z };
    // (Round where the leaves of the doors on the way will stand open, where there is a way round: doors.ts.)
    const route = findWay(world.nav, world.doors, world.swings, from, spot);
    // Out of doors, with no floor to find a way across: in at the nearest door first, and on from there.
    const wayIn = route ? null : wayInFrom(world, actor);
    if (wayIn) {
      actor.orders.unshift(wayIn);
      begin(world, actor);
    }
    // No way there: drop the order rather than stand for ever.
    else if (!route) advance(world, actor);
    else {
      setRoute(actor.walker, route);
      actor.faceTo = null;
      actor.label = null;
    }
  } else if (order.do === "path") {
    const { y } = actor.walker.pos;
    setRoute(actor.walker, straightRoute([{ ...actor.walker.pos }, ...order.points.map((p) => ({ x: p.x, y, z: p.z }))]));
    actor.faceTo = null;
    actor.label = null;
  } else if (order.do === "face") {
    // Which way a point lies, as a heading: 0 looks south (+z), a quarter turn looks east (+x).
    actor.faceTo = Math.atan2(order.x - actor.walker.pos.x, order.z - actor.walker.pos.z);
    advance(world, actor);
  } else if (order.do === "work") {
    actor.busy = order.seconds;
    actor.label = order.label;
  } else {
    actor.carrying = order.do === "take" ? order.goods : null;
    advance(world, actor);
  }
};

/**
 * Notice the people ahead. Someone coming the other way, or standing in the way, is passed on
 * the right; someone walking the same way is fallen in behind. Returns the pace to walk at.
 */
const mind = (world: World, actor: Actor, dt: number): number => {
  const w = actor.walker;
  const hx = Math.sin(w.heading);
  const hz = Math.cos(w.heading);
  let aside = 0;
  let pace = 1;
  for (const other of world.actors) {
    if (other === actor || Math.abs(other.walker.pos.y - w.pos.y) > SAME_STOREY) continue;
    const dx = other.walker.pos.x - w.pos.x;
    const dz = other.walker.pos.z - w.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > NOTICE_DISTANCE || dist === 0 || (dx * hx + dz * hz) / dist < IN_FRONT) continue;
    const sameWay = other.walker.speed > 0.1 && Math.sin(other.walker.heading) * hx + Math.cos(other.walker.heading) * hz > 0.3;
    if (sameWay) pace = Math.min(pace, Math.max(0.25, (dist - 0.4) / (FOLLOWING_DISTANCE - 0.4)));
    else aside = SIDESTEP;
  }
  const change = SIDESTEP_SPEED * dt;
  actor.sidestep += Math.max(-change, Math.min(change, aside - actor.sidestep));
  return pace;
};

/**
 * The grounds lie lower than the ground floor: by this much, in metres, once someone is this far
 * from the house, which is where the steps at its doors come down to. (As the garden is drawn:
 * the gravel's top.)
 */
export const GROUNDS = { below: 0.29, steps: 0.8 };

/**
 * How far below the ground floor the earth is at a point: nothing in the house or on a
 * threshold, the whole drop by the foot of the steps, and evenly between. Someone out of doors
 * is walked at the level of the ground floor, and stood on the earth.
 */
export const dropAt = (world: World, x: number, z: number): number => {
  const far = Math.min(...world.plan.rooms.filter((room) => room.floor === "ground").flatMap(roomRects).map((r) => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.z - z, 0, z - (r.z + r.d)))));
  return GROUNDS.below * Math.min(1, far / GROUNDS.steps);
};

/** Where someone is drawn: where she is walking, plus any step aside she can make without hitting something. */
export const standingAt = (world: World, actor: Actor): { x: number; y: number; z: number } => {
  const { pos, heading, onStair } = actor.walker;
  // A stair is walked as a slope but stood on as steps: her feet are on the tread, not sunk in it.
  const flight = onStair ? flightAt(world.plan, pos) : null;
  // …and out of doors her feet are on the earth, which is lower than the floor she came off.
  const y = flight ? treadHeight(world.plan, flight, pos.z) : pos.y - (floorOf(world, actor) === "ground" ? dropAt(world, pos.x, pos.z) : 0);
  if (actor.sidestep === 0) return { x: pos.x, y, z: pos.z };
  // Her own right: west when she faces south.
  const x = pos.x - Math.cos(heading) * actor.sidestep;
  const z = pos.z + Math.sin(heading) * actor.sidestep;
  const floor = floorOf(world, actor);
  const free = onStair || (floor !== null && world.nav.fits(floor, x, z));
  return free ? { x, y, z } : { x: pos.x, y, z: pos.z };
};

const stepActor = (world: World, actor: Actor, dt: number): void => {
  const w = actor.walker;
  if (actor.next && !w.onStair) {
    actor.orders = actor.next;
    actor.next = null;
    actor.busy = 0;
    actor.label = null;
    setRoute(w, null);
    begin(world, actor);
  }
  const order = actor.orders[0];
  // Standing still, she steps back into her place.
  if (!order || (order.do !== "go" && order.do !== "path")) actor.sidestep = Math.max(0, actor.sidestep - SIDESTEP_SPEED * dt);
  if (!order) {
    if (actor.faceTo !== null) w.heading = turnToward(w.heading, actor.faceTo, SETTLE_TURN_RATE, dt);
    return;
  }
  if (order.do === "go") {
    const before = w.s;
    const arrived = stepWalker(w, dt, mind(world, actor, dt));
    actor.walked += Math.max(0, w.s - before);
    if (!arrived) return;
    actor.faceTo = FACE_ANGLE[spotOf(world, order.spot).face];
    advance(world, actor);
    return;
  }
  if (order.do === "path") {
    const before = w.s;
    const arrived = stepWalker(w, dt);
    actor.walked += Math.max(0, w.s - before);
    if (arrived) advance(world, actor);
    return;
  }
  if (order.do === "work") {
    if (actor.faceTo !== null) w.heading = turnToward(w.heading, actor.faceTo, SETTLE_TURN_RATE, dt);
    actor.busy -= dt;
    if (actor.busy > 0) return;
    actor.label = null;
    advance(world, actor);
  }
};

export const stepWorld = (world: World, dt: number): void => {
  world.t += dt;
  for (const actor of world.actors) stepActor(world, actor, dt);
  stepDoors(world.doors, world.swings, world.actors.map((actor) => actor.walker), dt);
};

/** True when someone has nothing left to do. */
export const isIdle = (actor: Actor): boolean => actor.orders.length === 0 && actor.next === null;
