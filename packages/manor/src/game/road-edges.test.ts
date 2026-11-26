import { describe, expect, it } from "vitest";

import { wayLength } from "./country";
import type { PlaceId } from "./country";
import { out } from "./outing-kit";
import { roadFrom, whereabouts } from "./road";
import type { Outing } from "./types";

// Where someone on the roads is, and the road from there (road.ts), at the places where one leg
// of a way gives on to the next, at the moment she turns for home, and when she has been turned
// on the road. Outings are made up whole, with the clocks set by hand, so that the figures are
// plain.

const SENT = 0;
const ARRIVE = 100;
const DEPART = 160;
const BACK = 200;
/** An outing out at the gate since the clock was 0, due at its place at 100, off home at 160 and in at 200. */
const outTo = (to: PlaceId, over: Partial<Outing> = {}): Outing => ({ ...out(to, SENT, 0, DEPART - ARRIVE), arrive: ARRIVE, depart: DEPART, back: BACK, ...over });
const leg = (a: PlaceId, b: PlaceId): number => wayLength([a, b]);

describe("someone on the road out to a place", () => {
  it("is on the road to the forest a share of the way along it", () => {
    expect(whereabouts(outTo("forest"), 25)).toMatchObject({ from: "manor", to: "forest", along: expect.closeTo(0.25, 9) });
  });

  it("is not on the roads before she has gone out at the gate, nor once she is in", () => {
    expect(whereabouts(outTo("forest", { left: null }), 10)).toBeNull();
    expect(whereabouts(outTo("forest", { state: "coming" }), 10)).toBeNull();
  });

  it("is at the end of one leg, and not at the start of the next, as she comes to the place where they meet", () => {
    // The caves are by way of the forest: at the forest she has walked the whole of the first leg.
    const share = leg("manor", "forest") / wayLength(["manor", "forest", "caves"]);
    expect(whereabouts(outTo("caves"), share * ARRIVE)).toEqual({ from: "manor", to: "forest", along: 1 });
  });

  it("is a share of the way along the second leg once she is past the place where they meet", () => {
    const meet = leg("manor", "forest") / wayLength(["manor", "forest", "caves"]);
    expect(whereabouts(outTo("caves"), (meet + (1 - meet) / 2) * ARRIVE)).toMatchObject({ from: "forest", to: "caves", along: expect.closeTo(0.5, 9) });
  });

  it("is at the place from the moment she is due there, and goes on being there until she turns for home", () => {
    expect(whereabouts(outTo("forest", { homeward: false }), ARRIVE)).toEqual({ at: "forest" });
    expect(whereabouts(outTo("forest", { homeward: false }), DEPART + 50)).toEqual({ at: "forest" });
  });

  it("is at the place until the clock reaches the moment she sets off, and on the road home from that moment", () => {
    expect(whereabouts(outTo("forest"), DEPART - 1)).toEqual({ at: "forest" });
    expect(whereabouts(outTo("forest"), DEPART)).toEqual({ from: "forest", to: "manor", along: 0 });
    expect(whereabouts(outTo("forest"), (DEPART + BACK) / 2)).toMatchObject({ from: "forest", to: "manor", along: expect.closeTo(0.5, 9) });
  });
});

describe("someone turned round on the road", () => {
  /** Out on the road to the forest, a quarter of the way along it, and sent on to the caves: she goes on to the forest and then to the caves. */
  const onwards = (): Outing => outTo("caves", { turned: { from: { from: "manor", to: "forest", along: 0.25 }, via: ["forest", "caves"] } });
  /** The same, sent to the lake: she walks back along the road she was on, and out again by the other. */
  const backwards = (): Outing => outTo("lake", { turned: { from: { from: "manor", to: "forest", along: 0.25 }, via: ["manor", "lake"] } });

  it("goes on in the direction she was walking when the road ahead of her is the way she is sent", () => {
    const left = leg("manor", "forest") * 0.75;
    const total = left + leg("forest", "caves");
    // Half of what is left of the road she was on is walked.
    const half = whereabouts(onwards(), ((left / 2) / total) * ARRIVE);
    expect(half).toMatchObject({ from: "manor", to: "forest", along: expect.closeTo(0.25 + 0.375, 9) });
  });

  it("is at the start of the next leg, not the end of the last, when she has walked exactly what was left of the road she was on", () => {
    const left = leg("manor", "forest") * 0.75;
    const total = left + leg("forest", "caves");
    expect(whereabouts(onwards(), (left / total) * ARRIVE)).toEqual({ from: "forest", to: "caves", along: 0 });
  });

  it("walks back down the road she was on when she is sent the way she came", () => {
    const first = leg("manor", "forest") * 0.25;
    const total = first + leg("manor", "lake");
    expect(whereabouts(backwards(), ((first / 2) / total) * ARRIVE)).toMatchObject({ from: "manor", to: "forest", along: expect.closeTo(0.25 - 0.125, 9) });
  });

  it("is on the new road a share of the way along it after she has turned", () => {
    const first = leg("manor", "forest") * 0.25;
    const rest = leg("manor", "lake");
    const share = (first + rest / 2) / (first + rest);
    expect(whereabouts(backwards(), share * ARRIVE)).toMatchObject({ from: "manor", to: "lake", along: expect.closeTo(0.5, 9) });
  });

  it("is where she was turned, no farther back, for a clock from before she was", () => {
    expect(whereabouts(onwards(), -50)).toEqual({ from: "manor", to: "forest", along: 0.25 });
  });
});

describe("the road from where someone is to a place", () => {
  it("is by the end of her road she is nearer, and the shorter way is chosen when it is the one she is on", () => {
    const nearEnd = roadFrom({ from: "manor", to: "forest", along: 0.9 }, "caves");
    expect(nearEnd.via).toEqual(["forest", "caves"]);
    expect(nearEnd.length).toBeCloseTo(leg("manor", "forest") * 0.1 + leg("forest", "caves"), 9);
    const nearStart = roadFrom({ from: "manor", to: "forest", along: 0.1 }, "lake");
    expect(nearStart.via).toEqual(["manor", "lake"]);
    expect(nearStart.length).toBeCloseTo(leg("manor", "forest") * 0.1 + leg("manor", "lake"), 9);
  });

  it("is a straight way from a place she is at", () => {
    const road = roadFrom({ at: "forest" }, "caves");
    expect(road).toEqual({ via: ["forest", "caves"], length: leg("forest", "caves") });
  });
});
