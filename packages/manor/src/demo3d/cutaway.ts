import { inRect, roomAt, roomRects } from "../space";
import type { Axis, FloorId, Plan, Rect, Room } from "../space";

// Which outside walls must come down so you can see in. Put a lamp where the camera is: a wall
// may stand only if its shadow falls on no room. A wall on the far side of a plain box throws its
// shadow into the garden and stands; in a house with wings, a wall that faces away can still
// throw it across the next room, and that one comes down. The shadow is measured at rail height,
// where the cut is made, so somebody standing close behind a wall counts as well as the floor.
//
// A wall seen almost end-on throws a sliver of a shadow that covers next to nothing, so by the
// shadow alone it would flick up as the view turned past it and drop again a degree later. Two
// things stop that: a wall must be turned clearly away from the camera to stand, and it rises
// only once it has been wanted for a moment.
//
// That is the rule for looking over the whole storey. Following one person asks the same
// question of a smaller place: every wall stands, inside ones too, except those whose shadow
// falls on the room she is in, so that the whole of her room can be seen and the rest of the
// house stands round it. (A wall between the camera and her comes down too, which matters on a
// stair or in a doorway.) What a wall is asked changes; how it then rises and drops does not.
//
// The same question can be asked of everybody indoors at once, with nobody followed: every wall
// stands but those that hide a room somebody is in, or hide her. A room with nobody in it stays
// shut. (That is a choice among the settings: room-toggle.ts.)
//
// A wall may hide a little of a room and stand: a share of that room's floor (`share`, which the
// page says: wall-tolerance.ts), so that the corner of a big room does not cost a whole wall. That
// is safe because nobody is ever hidden by it: whichever way the storey is looked into, a wall
// between the camera and someone indoors comes down whatever it hides of the floor.

export type Point = { x: number; z: number };
export type Eye = { x: number; y: number; z: number };
/** A stretch of wall on the plan: along X at a fixed Z for axis "x", along Z at a fixed X for "z". */
export type Span = { axis: Axis; at: number; from: number; to: number };

/** No shadow is followed further than this: longer than the house, and finite when the camera is level with a wall's top. */
const MAX_REACH = 40;
/** The camera counts as at least this far above the top of a wall. */
const EYE_CLEAR = 0.05;
/** A standing wall comes down once it hides more than this much of a room, in square metres… */
export const DROPS_ABOVE = 0.12;
/** …and goes back up only once it hides less than this, so it cannot dither between the two. */
export const RISES_BELOW = 0.05;
/** To rise, a wall must be turned away from the camera by more than this (the sine of about ten degrees)… */
export const RISES_TURNED = 0.17;
/** …and it stays up until it is turned away by less than this (about seven). */
export const STAYS_TURNED = 0.12;
/** Seconds a wall must be wanted, without a break, before it rises. Dropping is at once. */
export const RISE_AFTER = 0.25;

/** However big the room, a wall that hides more of it than this comes down (m²). */
export const HIDES_AT_MOST = 2;

/** A room as the rule sees it: the pieces of its floor, and how much floor that is in all (m²). */
export type Floored = { rects: Rect[]; area: number };

export const flooredOf = (room: Room): Floored => {
  const rects = roomRects(room);
  return { rects, area: rects.reduce((sum, r) => sum + r.w * r.d, 0) };
};

/** How much of a room of this size a wall may hide and still stand: the share of it, but never less than any wall may hide, nor more than the most. */
export const allowance = (area: number, share: number): number => Math.max(DROPS_ABOVE, Math.min(share * area, HIDES_AT_MOST));

/** Where the top of a wall, over `foot`, throws its shadow on the level of the rail. */
const thrown = (foot: Point, eye: Eye, rail: number, top: number): Point => {
  const dx = foot.x - eye.x;
  const dz = foot.z - eye.z;
  const far = Math.hypot(dx, dz);
  const stretch = Math.min((top - rail) / Math.max(eye.y - top, EYE_CLEAR), far > 0 ? MAX_REACH / far : 0);
  return { x: foot.x + dx * stretch, z: foot.z + dz * stretch };
};

/** The shadow of a wall's upper part on the level of the rail: a four-sided shape starting at the wall. */
export const shadowOf = (span: Span, eye: Eye, rail: number, top: number): Point[] => {
  const a: Point = span.axis === "x" ? { x: span.from, z: span.at } : { x: span.at, z: span.from };
  const b: Point = span.axis === "x" ? { x: span.to, z: span.at } : { x: span.at, z: span.to };
  return [a, b, thrown(b, eye, rail, top), thrown(a, eye, rail, top)];
};

/** Keep the part of a shape on one side of a line square to an axis. */
const clip = (shape: Point[], coord: "x" | "z", limit: number, keepBelow: boolean): Point[] => {
  const inside = (p: Point): boolean => (keepBelow ? p[coord] <= limit : p[coord] >= limit);
  const kept: Point[] = [];
  shape.forEach((p, i) => {
    const q = shape[(i + 1) % shape.length];
    if (inside(p)) kept.push(p);
    if (inside(p) !== inside(q)) {
      const t = (limit - p[coord]) / (q[coord] - p[coord]);
      kept.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
    }
  });
  return kept;
};

const areaOf = (shape: Point[]): number => Math.abs(shape.reduce((sum, p, i) => sum + p.x * shape[(i + 1) % shape.length].z - shape[(i + 1) % shape.length].x * p.z, 0)) / 2;

/** How much of a rectangle a shape covers, in square metres. */
export const overlap = (shape: Point[], r: Rect): number => areaOf(clip(clip(clip(clip(shape, "x", r.x, false), "x", r.x + r.w, true), "z", r.z, false), "z", r.z + r.d, true));

/** How much indoor floor a wall's upper part hides from the camera, in square metres. */
export const hiddenFloor = (span: Span, eye: Eye, rail: number, top: number, rooms: Rect[]): number => {
  const shadow = shadowOf(span, eye, rail, top);
  return rooms.reduce((sum, room) => sum + overlap(shadow, room), 0);
};

/**
 * How much a wall hides, counted against what it may: of each room, only what it hides beyond
 * that room's allowance, less the little any wall may hide (which `hidesLittle` allows for itself),
 * and those added up. So a wall comes down when it hides more of some room than it may, and goes
 * back up as soon as it hides a little less than that: where it stands does not hang on which
 * way the view came round. With no share allowed, it is the floor it hides and no more.
 */
export const hiddenCounted = (span: Span, eye: Eye, rail: number, top: number, rooms: Floored[], share: number): number =>
  rooms.reduce((sum, room) => sum + Math.max(0, hiddenFloor(span, eye, rail, top, room.rects) - (allowance(room.area, share) - DROPS_ABOVE)), 0);

/**
 * How far a wall's outer face is turned away from the camera: 1 squarely away, 0 end-on, -1
 * squarely towards it. `outward` is the side the garden is on: 1 for the high side of the wall's
 * line (south of a wall along X, east of one along Z), -1 for the low. Past either end of the
 * wall the angle is taken from the nearer end, so a long wall is judged by its worst part.
 */
export const turnedAway = (span: Span, outward: 1 | -1, eye: Eye): number => {
  const across = ((span.axis === "x" ? eye.z : eye.x) - span.at) * outward;
  const along = span.axis === "x" ? eye.x : eye.z;
  const beyond = Math.max(0, span.from - along, along - span.to);
  return -across / (Math.hypot(across, beyond) || 1);
};

/** Whether a wall hides little enough to stand, given whether it stood a moment ago and how much it hides now. */
export const hidesLittle = (standing: boolean, hidden: number): boolean => (standing ? hidden <= DROPS_ABOVE : hidden < RISES_BELOW);

/** Whether a wall is wanted standing, given whether it was a moment ago, how much it hides now, and how far it is turned away. */
export const standsNext = (standing: boolean, hidden: number, turned: number): boolean => hidesLittle(standing, hidden) && (standing ? turned >= STAYS_TURNED : turned > RISES_TURNED);

/** Within this of the middle of a doorway, someone is in both of the rooms it joins. */
export const DOORWAY_REACH = 0.8;
/** How far to either side of a doorway to look for the rooms it joins. */
const THROUGH = 0.3;

/**
 * The rooms someone followed is in, on the storey being looked into: the one she stands in, and,
 * while she is in a doorway, the one beyond it as well, so that the room she is walking into is
 * already open when she gets there. A flight of stairs stands in a room, and counts as that room.
 */
export const roomsAbout = (plan: Plan, floor: FloorId, at: Point): Room[] => {
  const about = new Set<Room>(plan.rooms.filter((r) => r.floor === floor && roomRects(r).some((rect) => inRect(rect, at.x, at.z))));
  // A window, or a door to the garden, has only the one room behind it, and so adds nothing.
  for (const door of plan.openings) {
    if (door.floor !== floor) continue;
    const middle = door.axis === "x" ? { x: door.pos, z: door.at } : { x: door.at, z: door.pos };
    if (Math.hypot(at.x - middle.x, at.z - middle.z) > DOORWAY_REACH) continue;
    for (const side of [-THROUGH, THROUGH]) {
      const room = door.axis === "x" ? roomAt(plan, floor, middle.x, middle.z + side) : roomAt(plan, floor, middle.x + side, middle.z);
      if (room) about.add(room);
    }
  }
  return [...about];
};

/** Heights above her feet at which someone followed must be in view: ankle, waist and head. */
export const BODY_HEIGHTS = [0.1, 0.9, 1.7];
/** A standing wall drops when it comes within this of the line of sight to her, measured along the wall, in metres… */
export const SIGHT_DROPS = 0.5;
/** …and rises again only once it is this far clear of it, so it does not dither as she walks along it. */
export const SIGHT_RISES = 0.9;

/**
 * Whether the upper part of a wall is between the eye and a point: the straight line from one to
 * the other crosses the wall's line between rail and top, within `margin` of the wall's two ends.
 * A wall beyond the point, or behind the eye, is not between them.
 */
export const blocksSight = (span: Span, eye: Eye, point: Eye, rail: number, top: number, margin: number): boolean => {
  const [eyeAcross, pointAcross] = span.axis === "x" ? [eye.z, point.z] : [eye.x, point.x];
  const [eyeAlong, pointAlong] = span.axis === "x" ? [eye.x, point.x] : [eye.z, point.z];
  if (eyeAcross === pointAcross) return false;
  const t = (span.at - eyeAcross) / (pointAcross - eyeAcross);
  if (t <= 0 || t >= 1) return false;
  const along = eyeAlong + (pointAlong - eyeAlong) * t;
  const height = eye.y + (point.y - eye.y) * t;
  return along >= span.from - margin && along <= span.to + margin && height >= rail && height <= top;
};

/** Whether a wall is wanted standing while someone is followed: it is, unless it would hide any of her from the camera. `feet` is where she stands. */
export const standsClearOf = (standing: boolean, span: Span, eye: Eye, feet: Eye, rail: number, top: number): boolean => {
  const margin = standing ? SIGHT_DROPS : SIGHT_RISES;
  return !BODY_HEIGHTS.some((h) => blocksSight(span, eye, { x: feet.x, y: feet.y + h, z: feet.z }, rail, top, margin));
};

/**
 * Whether a wall is wanted standing while certain people are to be seen in their rooms (the one
 * followed, or everybody indoors): it is, unless it hides any of the rooms they are in (`theirs`)
 * or would hide any of them. With nobody to be seen, every wall stands.
 */
export const standsAbout = (standing: boolean, span: Span, eye: Eye, people: Eye[], rail: number, top: number, theirs: Floored[], share: number): boolean =>
  hidesLittle(standing, hiddenCounted(span, eye, rail, top, theirs, share)) && people.every((feet) => standsClearOf(standing, span, eye, feet, rail, top));

/**
 * Whether an outside wall is wanted standing while the whole storey is looked over: it is while
 * it is turned away from the camera, hides little enough of the storey's rooms, and would hide
 * nobody who is indoors. `outward` is the side its garden is on.
 */
export const standsOver = (standing: boolean, span: Span, outward: 1 | -1, eye: Eye, people: Eye[], rail: number, top: number, rooms: Floored[], share: number): boolean =>
  standsNext(standing, hiddenCounted(span, eye, rail, top, rooms, share), turnedAway(span, outward, eye)) && people.every((feet) => standsClearOf(standing, span, eye, feet, rail, top));

/** Who is to be seen, and the rooms that are to be seen with them. */
export type Watched = { people: Eye[]; rooms: Floored[] };

/** Someone followed is to be seen wherever she is: in her rooms, or out of doors with no room at all. */
export const watchedOne = (plan: Plan, floor: FloorId, person: Eye): Watched => ({ people: [person], rooms: roomsAbout(plan, floor, person).map(flooredOf) });

/**
 * Of everybody on a storey, those who are in a room of it, and those rooms, each once however
 * many are in it. Whoever is out of doors is left out: the house is not opened for the garden.
 */
export const watchedIndoors = (plan: Plan, floor: FloorId, people: Eye[]): Watched => {
  const rooms = new Set<Room>();
  const indoors = people.filter((person) => {
    const hers = roomsAbout(plan, floor, person);
    for (const room of hers) rooms.add(room);
    return hers.length > 0;
  });
  return { people: indoors, rooms: [...rooms].map(flooredOf) };
};

/** The whole storey looked over: every room of it is to be seen, and everybody who is indoors on it. */
export const watchedStorey = (plan: Plan, floor: FloorId, people: Eye[]): Watched => ({ people: watchedIndoors(plan, floor, people).people, rooms: plan.rooms.filter((r) => r.floor === floor).map(flooredOf) });

/** A wall as it rises and drops: whether it is wanted standing, for how long it has been, and whether it is up. */
export type Rise = { wanted: boolean; waited: number; standing: boolean };

/** Move a wall on by a moment: it drops as soon as it is not wanted, and rises once it has been wanted for long enough. */
export const settle = (wall: Rise, dt: number): void => {
  wall.waited = wall.wanted ? wall.waited + dt : 0;
  wall.standing = wall.wanted && (wall.standing || wall.waited >= RISE_AFTER);
};
