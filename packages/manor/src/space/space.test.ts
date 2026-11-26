import { describe, expect, it } from "vitest";

import { HOUSE } from "./house-plan";
import { findRoute, pointAlong } from "./route";
import type { Route } from "./route";
import { nav, spot } from "./space-kit";
import type { FloorId } from "./types";
import { STAIR_SPEED, WALK_SPEED, createWalker, setRoute, stepWalker } from "./walker";
import { deriveWalls, roomAt } from "./walls";

const LAMPS = HOUSE.fixtures.filter((f) => f.kind === "lamp" || f.kind === "lampstand");
const route = (from: string, to: string): Route => {
  const r = findRoute(nav, spot(from), spot(to));
  if (!r) throw new Error(`no way from ${from} to ${to}`);
  return r;
};

const SAMPLE = 0.05;
/** Every twentieth of a metre along a route, with the storey it is on (null on a stair). */
const samples = (r: Route): { x: number; y: number; z: number; floor: FloorId | null }[] => {
  const out = [];
  for (let s = 0; s <= r.length; s += SAMPLE) {
    const { pos } = pointAlong(r, s);
    const floor = (Object.keys(HOUSE.storeys) as FloorId[]).find((f) => Math.abs(HOUSE.storeys[f].y - pos.y) < 1e-6) ?? null;
    out.push({ ...pos, floor });
  }
  return out;
};

describe("the walls", () => {
  const walls = deriveWalls(HOUSE);

  it("puts a partition between the kitchen and the pantry and none between a room and its bay", () => {
    const partition = walls.find((w) => w.floor === "ground" && w.axis === "z" && w.at === 2 && w.low === "pantry" && w.high === "kitchen");
    expect(partition).toBeDefined();
    expect(partition?.from).toBe(3);
    expect(partition?.to).toBe(7);
    // The shop's south wall stops either side of its bay window.
    const south = walls.filter((w) => w.floor === "ground" && w.axis === "x" && w.at === 12 && w.low === "shop");
    expect(south.map((w) => [w.from, w.to])).toEqual([[2, 4.5], [7, 8]]);
  });

  it("finds a wall for every door and window", () => {
    const placed = walls.reduce((n, w) => n + w.openings.length, 0);
    expect(placed).toBe(HOUSE.openings.length);
  });
});

describe("the floor", () => {
  it("has every spot on floor that can be stood on, in a room", () => {
    for (const s of HOUSE.spots) {
      expect(nav.walkable(s.floor, s.x, s.z), `${s.id} is not on floor`).toBe(true);
      expect(roomAt(HOUSE, s.floor, s.x, s.z), `${s.id} is in no room`).not.toBeNull();
    }
  });

  it("keeps a spot for every kind of goods", () => {
    for (const [goods, id] of Object.entries(HOUSE.stores)) expect(HOUSE.spots.some((s) => s.id === id), `${goods} is kept nowhere`).toBe(true);
  });

  it("has a lamp in every room", () => {
    for (const room of HOUSE.rooms) expect(LAMPS.some((l) => l.floor === room.floor && roomAt(HOUSE, room.floor, l.x, l.z)?.id === room.id), `${room.name} has no lamp`).toBe(true);
  });

  it("stands each lamp on a piece of furniture or in a corner, where it is in nobody's way", () => {
    // Nothing is kept clear round a lamp, so the floor is the same with them as without.
    for (const l of LAMPS) expect(l.solid, `${l.id} is walked round`).toBe(false);
    for (const l of LAMPS.filter((f) => f.kind === "lamp")) {
      const under = HOUSE.fixtures.some((f) => f.solid && f.floor === l.floor && Math.abs(l.x - f.x) <= f.w / 2 && Math.abs(l.z - f.z) <= f.d / 2);
      expect(under && (l.lift ?? 0) > 0, `${l.id} stands on nothing`).toBe(true);
    }
    // One on a stand is on the floor: no walk from the middle of each part of the house to any spot comes within a body's width of it.
    const BODY = 0.3;
    const stands = LAMPS.filter((f) => f.kind === "lampstand");
    for (const hub of ["kitchen.table.n", "parlour.table", "dormitory.linen", "lab.bench"]) {
      for (const to of HOUSE.spots) {
        const walk = findRoute(nav, spot(hub), to);
        if (!walk) continue;
        const nearest = Math.min(...samples(walk).flatMap((at) => stands.filter((l) => l.floor === at.floor).map((l) => Math.hypot(at.x - l.x, at.z - l.z))));
        expect(nearest, `the walk from ${hub} to ${to.id} goes through a lamp`).toBeGreaterThan(BODY);
      }
    }
  });

  it("keeps tall furniture from standing in front of a window", () => {
    // The kinds as tall as a person or taller: what would hide a window, not sit under its sill.
    const TALL = ["bookcase", "cupboard", "wardrobe", "shelf", "winerack", "clock", "fireplace"];
    // How near a wall counts as against it, and how much of a window may be overlapped before it counts as covered: metres.
    const AGAINST = 0.7;
    const COVERED = 0.1;
    // Left as it is for the author to decide: the hall clock stands in the corner beside the front door's sidelight.
    const LEFT = ["hall.clock"];
    const blocked: string[] = [];
    for (const w of HOUSE.openings.filter((o) => o.kind !== "door")) {
      for (const f of HOUSE.fixtures.filter((f) => f.floor === w.floor && TALL.includes(f.kind) && !LEFT.includes(f.id))) {
        // Along the wall the window is in, and away from it.
        const [along, away, half] = w.axis === "x" ? [f.x, f.z, f.w / 2] : [f.z, f.x, f.d / 2];
        const overlap = Math.min(along + half, w.pos + w.width / 2) - Math.max(along - half, w.pos - w.width / 2);
        if (Math.abs(away - w.at) < AGAINST && overlap > COVERED) blocked.push(f.id);
      }
    }
    expect(blocked).toEqual([]);
  });

  it("is not floor under the furniture, in the walls, or outside", () => {
    expect(nav.walkable("ground", 5, 4.25)).toBe(false); // the kitchen table
    expect(nav.walkable("ground", 8, 6)).toBe(false); // the wall between kitchen and hall
    expect(nav.walkable("ground", 0, 0)).toBe(false); // the garden
    expect(nav.walkable("ground", 8, 3)).toBe(true); // the doorway in that same wall line
    expect(nav.walkable("first", 8.875, 8)).toBe(false); // the stairwell
    // Beside the flight is kept clear too, so nobody brushes through its balusters: it ends at x = 9.5.
    expect(nav.walkable("ground", 9.7, 8)).toBe(false);
    expect(nav.walkable("ground", 9.95, 8)).toBe(true);
  });
});

describe("routes", () => {
  it("joins every spot to every other", () => {
    const home = spot("kitchen.table.n");
    for (const s of HOUSE.spots) expect(findRoute(nav, home, s), `no way to ${s.id}`).not.toBeNull();
  });

  it("never leaves the floor between stairs", () => {
    const pairs: [string, string][] = [["pantry.flour", "kitchen.oven"], ["kitchen.range", "parlour.table"], ["store.wine", "dining.sideboard"], ["lab.bench", "study.desk"], ["dormitory.linen", "bedroom.bed"]];
    for (const [a, b] of pairs) {
      for (const p of samples(route(a, b))) {
        if (p.floor) expect(nav.fits(p.floor, p.x, p.z), `${a} → ${b} leaves the floor at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`).toBe(true);
      }
    }
  });

  it("gives the side and the corner of the staircase a body's width", () => {
    const main = HOUSE.stairs.find((s) => s.id === "main");
    if (!main) throw new Error("no main stair");
    const side = main.x + main.width / 2;
    // From the dining room across the hall and round the foot of the flight to the shop door, and others past it.
    for (const [a, b] of [["dining.table.s", "shop.window"], ["passage.sideboard", "shop.counter"], ["parlour.table", "landing.window"]] as [string, string][]) {
      for (const p of samples(route(a, b))) {
        // Only points in the hall to the east of the flight's open side: in front of its foot is where it is stepped on to.
        if (p.floor !== "ground" || p.x <= side) continue;
        const past = Math.max(0, p.z - main.zFoot, main.zHead - p.z);
        expect(Math.hypot(p.x - side, past), `${a} → ${b} brushes the stair at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`).toBeGreaterThan(0.3);
      }
    }
  });

  it("goes round the kitchen table, not through it", () => {
    const r = route("kitchen.table.n", "kitchen.table.s");
    const straight = Math.hypot(spot("kitchen.table.n").x - spot("kitchen.table.s").x, spot("kitchen.table.n").z - spot("kitchen.table.s").z);
    expect(r.length).toBeGreaterThan(straight + 1.5);
  });

  it("makes a different walk of each shelf", () => {
    const flour = route("kitchen.table.n", "pantry.flour").length;
    const honey = route("kitchen.table.n", "pantry.honey").length;
    const bread = route("kitchen.table.n", "pantry.bread").length;
    // The honey is by the door; the flour is at the far end.
    expect(flour - honey).toBeGreaterThan(0.5);
    expect(new Set([flour, honey, bread].map((n) => n.toFixed(2))).size).toBe(3);
    // And the cellar is a good deal further than the pantry.
    expect(route("kitchen.table.n", "store.wine").length).toBeGreaterThan(flour * 2);
  });

  it("takes both flights from the laboratory to the study", () => {
    const r = route("lab.bench", "study.desk");
    expect(r.stair.filter(Boolean).length).toBe(2);
    const ys = samples(r).map((p) => p.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1] - 1e-9);
    expect(ys[0]).toBeCloseTo(HOUSE.storeys.cellar.y);
    expect(ys[ys.length - 1]).toBeCloseTo(HOUSE.storeys.first.y);
  });

  /** The sharpest change of direction at any one point of a route, in degrees. */
  const sharpest = (r: Route): number => {
    let worst = 0;
    for (let i = 2; i < r.points.length; i++) {
      const a = Math.atan2(r.points[i - 1].x - r.points[i - 2].x, r.points[i - 1].z - r.points[i - 2].z);
      const b = Math.atan2(r.points[i].x - r.points[i - 1].x, r.points[i].z - r.points[i - 1].z);
      worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))));
    }
    return (worst * 180) / Math.PI;
  };

  it("rounds its corners: round the table and through two doorways without one sharp turn", () => {
    expect(sharpest(route("kitchen.table.n", "kitchen.table.s"))).toBeLessThan(30);
    expect(sharpest(route("pantry.jam", "shop.counter"))).toBeLessThan(30);
    expect(sharpest(route("kitchen.range", "parlour.table"))).toBeLessThan(45);
    // Stairs are lined up with before they are climbed, so there is no pivot at the bottom step —
    // whichever side they are come at from.
    for (const [from, to] of [["lab.bench", "study.desk"], ["shop.counter", "landing.window"], ["parlour.table", "study.desk"], ["dining.table.s", "store.wine"], ["bedroom.bed", "hall.door"]]) {
      expect(sharpest(route(from, to)), `${from} → ${to}`).toBeLessThan(45);
    }
  });
});

describe("walking", () => {
  const DT = 1 / 60;

  it("arrives, never faster than a walk, and without a jolt", () => {
    const r = route("pantry.flour", "parlour.table");
    const w = createWalker(r.points[0]);
    setRoute(w, r);
    let last = { ...w.pos };
    let lastSpeed = 0;
    let lastHeading = w.heading;
    let frames = 0;
    let turned = false;
    while (!stepWalker(w, DT)) {
      expect(w.speed).toBeLessThanOrEqual(WALK_SPEED + 1e-9);
      expect(Math.hypot(w.pos.x - last.x, w.pos.z - last.z)).toBeLessThanOrEqual(WALK_SPEED * DT + 1e-6);
      // Speed changes a little at a time: no starting or stopping dead.
      expect(Math.abs(w.speed - lastSpeed)).toBeLessThan(0.1);
      const swing = Math.abs(Math.atan2(Math.sin(w.heading - lastHeading), Math.cos(w.heading - lastHeading)));
      if (frames > 0) expect(swing).toBeLessThan(0.2);
      if (swing > 0.001) turned = true;
      last = { ...w.pos };
      lastSpeed = w.speed;
      lastHeading = w.heading;
      if (++frames > 60 * 120) throw new Error("never arrived");
    }
    expect(turned).toBe(true);
    const end = spot("parlour.table");
    expect(w.pos.x).toBeCloseTo(end.x);
    expect(w.pos.z).toBeCloseTo(end.z);
    // About as long as the distance at a walk, plus a little for corners and stopping.
    expect(frames * DT).toBeGreaterThan(r.length / WALK_SPEED);
    expect(frames * DT).toBeLessThan((r.length / WALK_SPEED) * 1.6 + 2);
  });

  it("turns to face the way before setting off", () => {
    const r = route("hall.door", "passage.sideboard");
    const pathHeading = Math.atan2(r.points[1].x - r.points[0].x, r.points[1].z - r.points[0].z);
    const after = (startHeading: number): { moved: number; turned: number } => {
      const w = createWalker(r.points[0], startHeading);
      setRoute(w, r);
      for (let i = 0; i < 18; i++) stepWalker(w, DT);
      const swing = Math.atan2(Math.sin(w.heading - startHeading), Math.cos(w.heading - startHeading));
      return { moved: w.s, turned: Math.abs(swing) };
    };
    const facingAway = after(pathHeading + Math.PI);
    const facingIt = after(pathHeading);
    // With her back to it she has mostly turned round; facing it she is already well on her way.
    expect(facingAway.turned).toBeGreaterThan(1);
    expect(facingAway.moved).toBeLessThan(0.08);
    expect(facingIt.moved).toBeGreaterThan(0.1);
  });

  it("never slows to a crawl in the middle of a walk, least of all at the foot of a stair", () => {
    // Up and down both flights, coming at each from a different side.
    const walks: [string, string][] = [["shop.counter", "landing.window"], ["parlour.table", "study.desk"], ["dining.table.s", "store.wine"], ["kitchen.range", "lab.bench"], ["bedroom.bed", "hall.door"], ["lab.desk", "dining.sideboard"], ["pantry.flour", "kitchen.oven"]];
    for (const [from, to] of walks) {
      const r = route(from, to);
      const w = createWalker(r.points[0], Math.atan2(r.points[1].x - r.points[0].x, r.points[1].z - r.points[0].z));
      setRoute(w, r);
      let slowest = Infinity;
      let where = 0;
      while (!stepWalker(w, DT)) {
        // Setting off and pulling up are meant to be slow; everything between is not.
        if (w.s < 1 || r.length - w.s < 1) continue;
        if (w.speed < slowest) {
          slowest = w.speed;
          where = w.s;
        }
      }
      expect(slowest, `${from} → ${to} crawls at ${where.toFixed(1)} m of ${r.length.toFixed(1)}`).toBeGreaterThan(0.3);
    }
  });

  it("is slower on the stairs", () => {
    const r = route("hall.door", "landing.window");
    const w = createWalker(r.points[0]);
    setRoute(w, r);
    let fastestOnStair = 0;
    let stairFrames = 0;
    while (!stepWalker(w, DT)) {
      if (!w.onStair) continue;
      stairFrames++;
      // She may still be shedding walking speed on the first tread or two.
      if (stairFrames > 30) fastestOnStair = Math.max(fastestOnStair, w.speed);
    }
    expect(stairFrames).toBeGreaterThan(60);
    expect(fastestOnStair).toBeLessThanOrEqual(STAIR_SPEED + 1e-9);
  });
});
