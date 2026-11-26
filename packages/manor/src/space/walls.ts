import type { Axis, FloorId, Opening, Plan, Rect, Room } from "./types";

// Walls are not drawn up by hand: they are wherever a room ends. An edge with a room on one side
// is an outside wall; with a different room on each side, a partition; with the same room on both
// (a room and its own bay window) there is no wall at all.

export type Wall = {
  floor: FloorId;
  axis: Axis;
  /** The fixed coordinate: a Z for a wall along X, an X for a wall along Z. */
  at: number;
  from: number;
  to: number;
  /** The room on the low side (north of an X wall, west of a Z wall) and on the high side. */
  low: string | null;
  high: string | null;
  openings: Opening[];
};

type Edge = { axis: Axis; at: number; from: number; to: number; room: string; side: "low" | "high" };

const EPS = 1e-6;

const edgesOf = (room: string, r: Rect): Edge[] => [
  // The room lies on the high side of its north and west edges, the low side of its south and east.
  { axis: "x", at: r.z, from: r.x, to: r.x + r.w, room, side: "high" },
  { axis: "x", at: r.z + r.d, from: r.x, to: r.x + r.w, room, side: "low" },
  { axis: "z", at: r.x, from: r.z, to: r.z + r.d, room, side: "high" },
  { axis: "z", at: r.x + r.w, from: r.z, to: r.z + r.d, room, side: "low" },
];

export const roomRects = (room: Room): Rect[] => [room.rect, ...(room.bays ?? [])];

const wallsOnFloor = (floor: FloorId, rooms: Room[], openings: Opening[]): Wall[] => {
  const edges = rooms.flatMap((room) => roomRects(room).flatMap((r) => edgesOf(room.id, r)));
  const lines = new Map<string, Edge[]>();
  for (const e of edges) {
    const key = `${e.axis}:${e.at}`;
    lines.set(key, [...(lines.get(key) ?? []), e]);
  }
  const walls: Wall[] = [];
  for (const group of lines.values()) {
    const { axis, at } = group[0];
    const cuts = [...new Set(group.flatMap((e) => [e.from, e.to]))].sort((a, b) => a - b);
    let open: Wall | null = null;
    for (let i = 0; i + 1 < cuts.length; i++) {
      const mid = (cuts[i] + cuts[i + 1]) / 2;
      const covering = group.filter((e) => e.from < mid && mid < e.to);
      const low = covering.find((e) => e.side === "low")?.room ?? null;
      const high = covering.find((e) => e.side === "high")?.room ?? null;
      const isWall = (low !== null || high !== null) && low !== high;
      if (!isWall) {
        open = null;
        continue;
      }
      // Run on from the last piece when it is the same wall between the same rooms.
      if (open && open.low === low && open.high === high && Math.abs(open.to - cuts[i]) < EPS) open.to = cuts[i + 1];
      else {
        open = { floor, axis, at, from: cuts[i], to: cuts[i + 1], low, high, openings: [] };
        walls.push(open);
      }
    }
  }
  for (const o of openings) {
    const wall = walls.find((w) => w.axis === o.axis && Math.abs(w.at - o.at) < EPS && w.from <= o.pos - o.width / 2 + EPS && o.pos + o.width / 2 <= w.to + EPS);
    if (!wall) throw new Error(`No wall for the ${o.kind} at ${o.axis}=${o.at}, ${o.pos} on the ${floor} floor`);
    wall.openings.push(o);
  }
  return walls;
};

export const deriveWalls = (plan: Plan): Wall[] =>
  (Object.keys(plan.storeys) as FloorId[]).flatMap((floor) =>
    wallsOnFloor(
      floor,
      plan.rooms.filter((r) => r.floor === floor),
      plan.openings.filter((o) => o.floor === floor),
    ),
  );

/**
 * How far along its line a wall is drawn, as a box so thick. Where two walls of one line meet end
 * to end, the line runs on through and they touch. Where a wall only ends, at a corner or against
 * another line, one of the two fills the corner and the other butts against it: a wall along X
 * runs out to the corner and a wall along Z stops short, except that a wall along X which ends
 * against a line along Z that runs on through stops short of it. So no junction is held closed
 * by the end of a wall that crosses it, which would leave a slot when that wall is cut down.
 */
export const drawnSpan = (wall: Wall, others: Wall[], thickness: number): { from: number; to: number } => {
  /** Whether the line of walls along an axis, at a fixed coordinate, runs on through a point along it. */
  const runsThrough = (axis: Axis, at: number, point: number): boolean => {
    const line = others.filter((o) => o.axis === axis && o.at === at);
    return line.some((o) => o.from < point && point < o.to) || (line.some((o) => o.to === point) && line.some((o) => o.from === point));
  };
  const reach = (end: number): number => {
    const own = runsThrough(wall.axis, wall.at, end);
    const across = runsThrough(wall.axis === "x" ? "z" : "x", end, wall.at);
    if (wall.axis === "x") return own ? 0 : across ? -thickness / 2 : thickness / 2;
    // Where both lines run on, the one along X has the crossing.
    return own && !across ? 0 : -thickness / 2;
  };
  return { from: wall.from - reach(wall.from), to: wall.to + reach(wall.to) };
};

/** The solid stretches of a wall: what is left once the doorways are cut out. Windows stay solid. */
export const solidSpans = (wall: Wall): [number, number][] => {
  const doors = wall.openings.filter((o) => o.kind === "door").sort((a, b) => a.pos - b.pos);
  const spans: [number, number][] = [];
  let cursor = wall.from;
  for (const d of doors) {
    const start = d.pos - d.width / 2;
    if (start > cursor + EPS) spans.push([cursor, start]);
    cursor = d.pos + d.width / 2;
  }
  if (wall.to > cursor + EPS) spans.push([cursor, wall.to]);
  return spans;
};

/** Distance from a point to the nearest solid part of a wall. */
export const distanceToWall = (wall: Wall, x: number, z: number): number => {
  const along = wall.axis === "x" ? x : z;
  const across = (wall.axis === "x" ? z : x) - wall.at;
  let best = Infinity;
  for (const [a, b] of solidSpans(wall)) {
    const gap = along < a ? a - along : along > b ? along - b : 0;
    best = Math.min(best, Math.hypot(gap, across));
  }
  return best;
};

export const inRect = (r: Rect, x: number, z: number, margin = 0): boolean => x >= r.x - margin && x <= r.x + r.w + margin && z >= r.z - margin && z <= r.z + r.d + margin;

export const roomAt = (plan: Plan, floor: FloorId, x: number, z: number): Room | null => plan.rooms.find((r) => r.floor === floor && roomRects(r).some((rect) => inRect(rect, x, z))) ?? null;
