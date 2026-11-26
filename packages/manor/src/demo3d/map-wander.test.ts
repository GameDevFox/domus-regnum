import { describe, expect, it } from "vitest";

import { WANDER, roundOf, wanderAt, wanderReach } from "./map-wander";

// Going about a place on the map: straight walks from spot to spot of it at one pace, a stop at
// each, and a step in the walking; the same every time for the same minute.

const { ROUND_MINUTES, REST_MINUTES, LEAST_WALK, STEP_LIFT } = WANDER;
/** Every tenth of a minute for five hours: fine enough to see every walk and every stop, over several rounds. */
const MOMENTS = Array.from({ length: 3000 }, (_, n) => n / 10);
const PLACES = ["forest", "town", "caves", "lake"] as const;
const ROUNDS = Array.from({ length: 40 }, (_, n) => n);
const length = (w: { from: { x: number; y: number }; to: { x: number; y: number } }): number => Math.hypot(w.to.x - w.from.x, w.to.y - w.from.y);

describe("someone going about a place", () => {
  it("is in the same spot for the same minute, and each person is on a round of her own", () => {
    expect(wanderAt("sage", "forest", 23.4)).toEqual(wanderAt("sage", "forest", 23.4));
    expect(wanderAt("sage", "forest", 23.4)).not.toEqual(wanderAt("rose", "forest", 23.4));
  });

  it("is at the place's own point as she arrives, and sets off from it", () => {
    expect(wanderAt("sage", "forest", 0)).toEqual({ x: 0, y: 0, lift: 0 });
    const soon = wanderAt("sage", "forest", 1);
    expect(Math.hypot(soon.x, soon.y)).toBeGreaterThan(0);
  });

  it("keeps to the ground of the place", () => {
    for (const place of PLACES) {
      const reach = wanderReach(place);
      for (const minutes of MOMENTS) {
        const at = wanderAt("sage", place, minutes);
        expect(Math.hypot(at.x / reach.across, at.y / reach.down)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("never jumps, from one round to the next either: from one moment to the next she has moved a little or not at all", () => {
    let last = wanderAt("sage", "forest", MOMENTS[0]);
    let farthest = 0;
    for (const minutes of MOMENTS.slice(1)) {
      const at = wanderAt("sage", "forest", minutes);
      farthest = Math.max(farthest, Math.hypot(at.x - last.x, at.y - last.y));
      last = at;
    }
    // A tenth of a minute is a small share of a walk across the place.
    expect(farthest).toBeLessThan(wanderReach("forest").across * 0.05);
    expect(farthest).toBeGreaterThan(0);
  });

  it("costs the same however long she has been there", () => {
    // A year of minutes on: a round is worked out from its own start.
    const late = wanderAt("sage", "forest", 365 * 24 * 60 + 17.5);
    expect(Number.isFinite(late.x) && Number.isFinite(late.y)).toBe(true);
  });
});

describe("a round of hers", () => {
  it("begins and ends at the place's own point, each walk beginning where the last ended, within the round", () => {
    for (const round of ROUNDS) {
      const walks = roundOf("sage", "forest", round);
      expect(walks.length).toBeGreaterThan(2);
      expect(walks[0].from).toEqual({ x: 0, y: 0 });
      expect(walks[walks.length - 1].to).toEqual({ x: 0, y: 0 });
      expect(walks[walks.length - 1].end).toBeLessThanOrEqual(ROUND_MINUTES);
      walks.slice(1).forEach((walk, n) => expect(walk.from).toEqual(walks[n].to));
    }
  });

  it("is not the round before it over again", () => {
    expect(roundOf("sage", "forest", 1)).not.toEqual(roundOf("sage", "forest", 0));
  });

  it("has no walk that is a shuffle on the spot", () => {
    for (const place of PLACES) for (const round of ROUNDS) for (const walk of roundOf("sage", place, round)) expect(length(walk)).toBeGreaterThanOrEqual(LEAST_WALK - 1e-9);
  });

  it("is walked at one pace across the paper: a walk twice as long takes twice the time", () => {
    const walks = ROUNDS.flatMap((round) => roundOf("sage", "forest", round));
    const reach = wanderReach("forest");
    const onPaper = (w: { from: { x: number; y: number }; to: { x: number; y: number } }): number => Math.hypot((w.to.x - w.from.x) * reach.across, (w.to.y - w.from.y) * reach.down);
    const paces = walks.map((walk) => onPaper(walk) / (walk.end - walk.start));
    for (const pace of paces) expect(pace).toBeCloseTo(paces[0], 9);
    // …and they are not all of a length.
    const lengths = walks.map(length);
    expect(Math.max(...lengths)).toBeGreaterThan(Math.min(...lengths) * 2);
  });

  it("has a stop after each walk but the last", () => {
    for (const round of ROUNDS) {
      const walks = roundOf("sage", "forest", round);
      walks.slice(1).forEach((walk, n) => expect(walk.start - walks[n].end).toBeCloseTo(REST_MINUTES, 9));
    }
  });
});

describe("coming into a place", () => {
  /** She comes in from the east: the end of the way is this far from the place's own point. */
  const GATE = { x: 0.05, y: 0.01 };

  it("she is at the end of the way as she arrives, and her first walk is from there into the place", () => {
    expect(wanderAt("sage", "forest", 0, GATE)).toEqual({ ...GATE, lift: 0 });
    const reach = wanderReach("forest");
    const [first] = roundOf("sage", "forest", 0, GATE);
    expect(first.from.x * reach.across).toBeCloseTo(GATE.x, 9);
    expect(first.from.y * reach.down).toBeCloseTo(GATE.y, 9);
    // It ends on the ground of the place.
    expect(Math.hypot(first.to.x, first.to.y)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("she never jumps on the way in, nor from the first round to the next: the rounds after the first begin at the place's own point, as they always did", () => {
    let last = wanderAt("sage", "forest", 0, GATE);
    for (const minutes of MOMENTS.slice(1)) {
      const at = wanderAt("sage", "forest", minutes, GATE);
      expect(Math.hypot(at.x - last.x, at.y - last.y)).toBeLessThan(wanderReach("forest").across * 0.05);
      last = at;
    }
    expect(roundOf("sage", "forest", 1, GATE)).toEqual(roundOf("sage", "forest", 1));
    const round = roundOf("sage", "forest", 0, GATE);
    expect(round[round.length - 1].to).toEqual({ x: 0, y: 0 });
  });
});

describe("a walk of hers", () => {
  const [, walk] = roundOf("sage", "forest", 3);
  const during = (share: number) => wanderAt("sage", "forest", 3 * ROUND_MINUTES + walk.start + (walk.end - walk.start) * share);
  const reach = wanderReach("forest");

  it("is a straight line from its spot to the next, covered evenly", () => {
    const [a, b, c] = [0.25, 0.5, 0.75].map(during);
    expect(b.x - a.x).toBeCloseTo(c.x - b.x, 12);
    expect(b.y - a.y).toBeCloseTo(c.y - b.y, 12);
    expect(during(0).x).toBeCloseTo(walk.from.x * reach.across, 12);
    expect(during(1).y).toBeCloseTo(walk.to.y * reach.down, 12);
    expect(Math.hypot(c.x - a.x, c.y - a.y)).toBeGreaterThan(0);
  });

  it("ends in a stop: she stands at its end until the next begins", () => {
    const stood = [0.5, REST_MINUTES - 0.5].map((after) => wanderAt("sage", "forest", 3 * ROUND_MINUTES + walk.end + after));
    expect(stood[0]).toEqual(stood[1]);
    expect(stood[0]).toEqual({ x: walk.to.x * reach.across, y: walk.to.y * reach.down, lift: 0 });
  });

  it("is stepped: she is lifted a little and set down again, several times, and has both feet down when she stands", () => {
    const lifts = Array.from({ length: 400 }, (_, n) => during(n / 400).lift);
    expect(Math.max(...lifts)).toBeGreaterThan(STEP_LIFT * 0.9);
    expect(Math.max(...lifts)).toBeLessThanOrEqual(STEP_LIFT);
    expect(during(0).lift).toBeCloseTo(0, 9);
    // Each time she comes down is the end of a step.
    const landings = lifts.filter((lift, n) => n > 0 && n < lifts.length - 1 && lift < lifts[n - 1] && lift <= lifts[n + 1]).length;
    expect(landings).toBeGreaterThanOrEqual(2);
  });
});
