import { describe, expect, it } from "vitest";

import { PAD_ACTIONS, focusAfter, leanOf, newlyDown } from "./gamepad";

// A controller, read as the browser gives it: how far the stick is leant, and which buttons
// have just gone down.

const up = { pressed: false, value: 0 };
const down = { pressed: true, value: 1 };
/** A pad's buttons, all up but these. */
const pad = (...held: number[]) => Array.from({ length: 16 }, (_, n) => (held.includes(n) ? down : up));

describe("how far the stick is leant", () => {
  it("is not at all near the middle, where a stick at rest sits a little off", () => {
    expect(leanOf(0, 0)).toEqual({ x: 0, y: 0 });
    expect(leanOf(0.1, -0.12)).toEqual({ x: 0, y: 0 });
    expect(leanOf(0.2, 0)).toEqual({ x: 0, y: 0 });
  });

  it("rises evenly from there to the full, with no jump as it leaves the middle", () => {
    expect(leanOf(0.21, 0).x).toBeCloseTo(0.0125, 6);
    expect(leanOf(0.6, 0).x).toBeCloseTo(0.5, 6);
    expect(leanOf(1, 0)).toEqual({ x: 1, y: 0 });
    expect(leanOf(0, -1)).toEqual({ x: 0, y: -1 });
  });

  it("keeps its direction, and is never more than the full, whatever the pad says of a corner", () => {
    const corner = leanOf(1, 1);
    expect(Math.hypot(corner.x, corner.y)).toBeCloseTo(1, 9);
    expect(corner.x).toBeCloseTo(corner.y, 9);
    const half = leanOf(-0.3, 0.4);
    expect(half.x / half.y).toBeCloseTo(-0.75, 9);
  });
});

describe("going from one of the household to the next", () => {
  const HOUSEHOLD = ["evelyn", "rose", "sage", "master"];

  it("goes round them in the order of the list, then to nobody, then to the first again", () => {
    const seen: (string | null)[] = [];
    let now: string | null = null;
    for (let n = 0; n < 6; n++) seen.push((now = focusAfter(HOUSEHOLD, now, 1)));
    expect(seen).toEqual(["evelyn", "rose", "sage", "master", null, "evelyn"]);
  });

  it("goes back the other way round: from nobody to the last, and from the first to nobody", () => {
    expect(focusAfter(HOUSEHOLD, null, -1)).toBe("master");
    expect(focusAfter(HOUSEHOLD, "master", -1)).toBe("sage");
    expect(focusAfter(HOUSEHOLD, "evelyn", -1)).toBeNull();
  });

  it("from someone who is not of the household, a customer say, begins as from nobody", () => {
    expect(focusAfter(HOUSEHOLD, "customer-3", 1)).toBe("evelyn");
    expect(focusAfter(HOUSEHOLD, "customer-3", -1)).toBe("master");
  });
});

describe("the buttons", () => {
  it("are bound to actions: the shoulders go from one of the household to the next, the triggers turn the view, and up and down on the directional pad change floor", () => {
    expect(PAD_ACTIONS).toEqual([[4, "focus-previous"], [5, "focus-next"], [6, "turn-anticlockwise"], [7, "turn-clockwise"], [12, "floor-up"], [13, "floor-down"]]);
  });

  it("do their action once when they go down, and not again while they are held", () => {
    const was = new Set<number>();
    expect(newlyDown(pad(), was)).toEqual([]);
    expect(newlyDown(pad(6), was)).toEqual(["turn-anticlockwise"]);
    expect(newlyDown(pad(6), was)).toEqual([]);
    expect(newlyDown(pad(6, 13), was)).toEqual(["floor-down"]);
    expect(newlyDown(pad(), was)).toEqual([]);
    expect(newlyDown(pad(4, 5, 6, 7, 12, 13), was)).toEqual(["focus-previous", "focus-next", "turn-anticlockwise", "turn-clockwise", "floor-up", "floor-down"]);
  });

  it("are not any of the pad's other buttons", () => {
    expect(newlyDown(pad(0, 1, 2, 3, 8, 9, 10, 11, 14, 15), new Set())).toEqual([]);
  });

  it("are up when the pad has no such button", () => {
    expect(newlyDown([], new Set())).toEqual([]);
  });
});
