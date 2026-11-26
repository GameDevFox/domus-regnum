import { describe, expect, it } from "vitest";

import { PLACES, whereabouts } from "../game";
import type { Outing } from "../game";
import { roadFrom } from "../game/road";
import { WALK_MINUTES_PER_SHEET } from "../game/tuning";
import { PIECES } from "./map-art";
import { alongLine, drawnAt, gateOf, wayLine } from "./map-travel";

// Where someone on an outing is drawn: on the way as it is drawn, from the edge of the house's
// piece to the edge of the place's, and from wherever she had got to on the way home.

const far = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
/** An outing that left the house at 0, is at the place from 40 to 100, and is home at 140. */
const outing = (to: Outing["to"]): Outing => ({ who: "sage", to, doing: "explore", state: "away", buys: null, sells: null, terms: { limit: 480, homeByBed: false }, bedBy: null, basket: {}, kept: {}, bought: {}, purse: 0, found: [], homeward: true, waits: false, sent: 0, left: 0, arrive: 40, depart: 100, back: 140, done: false, seeks: null, news: 0, turned: null, counted: 0, spent: 0, setOff: true, gone: null, queue: [] });

describe("a line across the map", () => {
  const line = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }];

  it("is walked evenly from its first point to its last, corner and all", () => {
    expect(alongLine(line, 0)).toEqual({ x: 0, y: 0 });
    expect(alongLine(line, 0.25)).toEqual({ x: 1, y: 0 });
    expect(alongLine(line, 0.75)).toEqual({ x: 3, y: 0 });
    expect(alongLine(line, 0.875)).toEqual({ x: 3, y: 0.5 });
    expect(alongLine(line, 1)).toEqual({ x: 3, y: 1 });
  });

  it("is not run off at either end", () => {
    expect(alongLine(line, -1)).toEqual({ x: 0, y: 0 });
    expect(alongLine(line, 2)).toEqual({ x: 3, y: 1 });
  });
});

describe("the way to a place", () => {
  it("is walked from the edge of the house's piece to the edge of the place's, not from middle to middle", () => {
    const line = wayLine("town");
    expect(line.length).toBe(2);
    expect(far(line[0], PLACES.manor.at)).toBeCloseTo(PIECES.manor.clear, 9);
    expect(far(line[1], PLACES.town.at)).toBeCloseTo(PIECES.town.clear, 9);
    // Each end is on the straight line between the two places, on the side towards the other.
    expect(far(line[0], PLACES.town.at)).toBeCloseTo(far(PLACES.manor.at, PLACES.town.at) - PIECES.manor.clear, 9);
    expect(far(line[1], PLACES.manor.at)).toBeCloseTo(far(PLACES.manor.at, PLACES.town.at) - PIECES.town.clear, 9);
  });

  it("crosses a place that is only passed through", () => {
    const line = wayLine("caves");
    expect(line.length).toBe(3);
    expect(line[1]).toEqual(PLACES.forest.at);
    expect(far(line[2], PLACES.caves.at)).toBeCloseTo(PIECES.caves.clear, 9);
  });

  it("comes into the place at its end: the gate, from the place's own point", () => {
    const gate = gateOf("town");
    expect(Math.hypot(gate.x, gate.y)).toBeCloseTo(PIECES.town.clear, 9);
    // The town lies south-east of the house: she comes into it from the north-west.
    expect(gate.x).toBeLessThan(0);
    expect(gate.y).toBeLessThan(0);
  });
});

describe("where she is drawn", () => {
  it("is nowhere while she is in the house", () => {
    expect(drawnAt({ ...outing("town"), state: "leaving", left: null }, 5)).toBeNull();
    expect(drawnAt({ ...outing("town"), state: "returning" }, 150)).toBeNull();
  });

  it("on the way out, is on the way as it is drawn: at the edge of the house as she leaves it, and at the edge of the place as she reaches it", () => {
    const line = wayLine("town");
    expect(drawnAt(outing("town"), 0)).toEqual({ ...line[0], lift: 0 });
    const half = drawnAt(outing("town"), 20);
    expect(half?.x).toBeCloseTo((line[0].x + line[1].x) / 2, 9);
    expect(half?.y).toBeCloseTo((line[0].y + line[1].y) / 2, 9);
    // Never over the house she has left, nor over the place she has not reached.
    for (let clock = 0; clock < 40; clock++) {
      const at = drawnAt(outing("town"), clock);
      if (!at) throw new Error("she is not drawn");
      expect(far(at, PLACES.manor.at)).toBeGreaterThanOrEqual(PIECES.manor.clear - 1e-9);
      expect(far(at, PLACES.town.at)).toBeGreaterThanOrEqual(PIECES.town.clear - 1e-9);
    }
  });

  it("comes into the place where the way ends, and goes about it from there without a jump", () => {
    const end = wayLine("town")[1];
    const arriving = drawnAt(outing("town"), 40);
    expect(arriving?.x).toBeCloseTo(end.x, 9);
    expect(arriving?.y).toBeCloseTo(end.y, 9);
    let last = arriving ?? end;
    for (let clock = 40.1; clock < 100; clock += 0.1) {
      const at = drawnAt(outing("town"), clock);
      if (!at) throw new Error("she is not drawn");
      expect(far(at, last)).toBeLessThan(0.003);
      last = at;
    }
    // By then she is in the place, not at its edge.
    expect(far(last, PLACES.town.at)).toBeLessThan(PIECES.town.clear);
  });

  it("sets off home from wherever in the place she had got to, with no jump, and is at the edge of the house when she is due", () => {
    const leaving = drawnAt(outing("town"), 100 - 1e-6);
    const left = drawnAt(outing("town"), 100);
    if (!leaving || !left) throw new Error("she is not drawn");
    expect(far(leaving, left)).toBeLessThan(1e-4);
    const home = drawnAt(outing("town"), 140);
    expect(home?.x).toBeCloseTo(wayLine("town")[0].x, 9);
    expect(home?.y).toBeCloseTo(wayLine("town")[0].y, 9);
    // …and she walks towards the house all the way.
    let before = far(left, PLACES.manor.at);
    for (let clock = 101; clock <= 140; clock++) {
      const at = drawnAt(outing("town"), clock);
      if (!at) throw new Error("she is not drawn");
      expect(far(at, PLACES.manor.at)).toBeLessThan(before);
      before = far(at, PLACES.manor.at);
    }
  });
});

describe("someone turned round on the road", () => {
  /** Halfway to the forest at 20 (or so far on the way to somewhere else), and turned there where she is, to a place: as the rules turn her (outing.ts, `sendOut`). */
  const turnedTo = (to: Outing["to"], from: Outing["to"] = "forest", clock = 20): Outing => {
    const bound = outing(from);
    const where = whereabouts(bound, clock);
    if (!where) throw new Error("she is not on the road");
    const road = roadFrom(where, to);
    const arrive = clock + road.length * WALK_MINUTES_PER_SHEET;
    return { ...bound, to, left: clock, arrive, depart: arrive + 60, back: arrive + 120, turned: { from: where, via: road.via } };
  };

  it("is drawn where she was when she was turned, and goes on from there without a jump", () => {
    const was = drawnAt(outing("forest"), 20);
    for (const to of ["forest", "lake", "town"] as const) {
      const turned = turnedTo(to);
      const now = drawnAt(turned, 20);
      if (!was || !now) throw new Error("she is not drawn");
      expect(far(now, was)).toBeLessThan(1e-9);
      let last = now;
      for (let clock = 20.1; clock < turned.arrive; clock += 0.1) {
        const at = drawnAt(turned, clock);
        if (!at) throw new Error("she is not drawn");
        expect(far(at, last)).toBeLessThan(0.003);
        last = at;
      }
    }
  });

  it("walks the road from there to where she is bound, and comes into it where that road ends", () => {
    const back = turnedTo("lake");
    // She makes for the house first, by the way she came: nearer it than she was by halfway.
    const before = drawnAt(back, 20);
    const later = drawnAt(back, 25);
    if (!before || !later) throw new Error("she is not drawn");
    expect(far(later, PLACES.manor.at)).toBeLessThan(far(before, PLACES.manor.at));
    const arriving = drawnAt(back, back.arrive - 1e-6);
    const arrived = drawnAt(back, back.arrive);
    if (!arriving || !arrived) throw new Error("she is not drawn");
    expect(far(arriving, PLACES.lake.at)).toBeCloseTo(PIECES.lake.clear, 4);
    expect(far(arriving, arrived)).toBeLessThan(1e-4);
    // Past the forest on the way to the caves, and turned back to it: she comes into it from the caves' side, and goes about it from there.
    const caves = whereabouts(outing("caves"), 38);
    expect(caves).toMatchObject({ from: "forest", to: "caves" });
    const forest = turnedTo("forest", "caves", 38);
    const coming = drawnAt(forest, forest.arrive - 1e-6);
    const come = drawnAt(forest, forest.arrive);
    if (!coming || !come) throw new Error("she is not drawn");
    expect(far(coming, PLACES.caves.at)).toBeLessThan(far(PLACES.forest.at, PLACES.caves.at));
    expect(far(coming, come)).toBeLessThan(1e-4);
  });
});
