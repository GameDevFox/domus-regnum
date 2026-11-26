import { describe, expect, it } from "vitest";

import type { Eye } from "./cutaway";
import { CLEARS_BEYOND, FADES_WITHIN, crossesBox, fadesNext } from "./fade";
import type { Box } from "./fade";

/** A cupboard: a metre wide and half a metre deep, two metres tall, standing on the floor just north of z = 0. */
const CUPBOARD: Box = { min: { x: 0, y: 0, z: -0.5 }, max: { x: 1, y: 2, z: 0 } };
const at = (x: number, y: number, z: number): Eye => ({ x, y, z });
/** A camera to the south, five metres off and five up. */
const EYE = at(0.5, 5, 5);

describe("the line of sight and a box", () => {
  it("passes through a box that stands between the two ends", () => {
    // To a point a metre behind the cupboard, on the floor: the line is a metre up as it reaches the cupboard's back.
    expect(crossesBox(EYE, at(0.5, 0, -1.5), CUPBOARD, 0)).toBe(true);
  });

  it("does not pass through a box that is beyond the far end, or behind the near one", () => {
    expect(crossesBox(EYE, at(0.5, 0, 1), CUPBOARD, 0)).toBe(false);
    expect(crossesBox(at(0.5, 1, -3), at(0.5, 1, -6), CUPBOARD, 0)).toBe(false);
  });

  it("passes over a box that is not tall enough to reach it", () => {
    const table: Box = { min: CUPBOARD.min, max: { ...CUPBOARD.max, y: 0.8 } };
    // The line to her head, standing just behind: it clears the table and meets the cupboard.
    expect(crossesBox(EYE, at(0.5, 1.7, -0.7), table, 0)).toBe(false);
    expect(crossesBox(EYE, at(0.5, 1.7, -0.7), CUPBOARD, 0)).toBe(true);
  });

  it("misses a box it passes to one side of, unless within the margin asked for", () => {
    // Straight down the line x = 1.3: a third of a metre east of the cupboard.
    const from = at(1.3, 5, 5);
    const to = at(1.3, 0, -1.5);
    expect(crossesBox(from, to, CUPBOARD, 0)).toBe(false);
    expect(crossesBox(from, to, CUPBOARD, 0.2)).toBe(false);
    expect(crossesBox(from, to, CUPBOARD, 0.4)).toBe(true);
    // And the same to the west.
    expect(crossesBox(at(-0.3, 5, 5), at(-0.3, 0, -1.5), CUPBOARD, 0)).toBe(false);
    expect(crossesBox(at(-0.3, 5, 5), at(-0.3, 0, -1.5), CUPBOARD, 0.4)).toBe(true);
  });

  it("handles a line that runs square to an axis", () => {
    // Level and due north through the middle of the cupboard; then the same line a metre too far east.
    expect(crossesBox(at(0.5, 1, 5), at(0.5, 1, -5), CUPBOARD, 0)).toBe(true);
    expect(crossesBox(at(2, 1, 5), at(2, 1, -5), CUPBOARD, 0)).toBe(false);
    // Straight down on to its top, and straight down beside it.
    expect(crossesBox(at(0.5, 9, -0.25), at(0.5, 0, -0.25), CUPBOARD, 0)).toBe(true);
    expect(crossesBox(at(0.5, 9, 3), at(0.5, 0, 3), CUPBOARD, 0)).toBe(false);
  });
});

describe("whether a tall thing goes see-through", () => {
  const BEHIND = at(0.5, 0, -1.5);

  it("does when it is between the camera and her, and not when she is in front of it or far off to one side", () => {
    expect(fadesNext(false, [CUPBOARD], EYE, BEHIND)).toBe(true);
    expect(fadesNext(false, [CUPBOARD], EYE, at(0.5, 0, 1))).toBe(false);
    expect(fadesNext(false, [CUPBOARD], at(4.5, 5, 5), at(4.5, 0, -1.5))).toBe(false);
  });

  it("does when only her head is behind it", () => {
    // A hood with nothing under it, and her standing just behind: the line to her ankle passes beneath it, the line to her head does not.
    const hood: Box = { min: { x: 0, y: 1.2, z: -0.5 }, max: { x: 1, y: 2, z: 0 } };
    expect(crossesBox(EYE, at(0.5, 0.1, -0.7), hood, 0)).toBe(false);
    expect(fadesNext(false, [hood], EYE, at(0.5, 0, -0.7))).toBe(true);
  });

  it("does when any one of its boxes is in the way", () => {
    const elsewhere: Box = { min: { x: 10, y: 0, z: 10 }, max: { x: 11, y: 2, z: 11 } };
    expect(fadesNext(false, [elsewhere], EYE, BEHIND)).toBe(false);
    expect(fadesNext(false, [elsewhere, CUPBOARD], EYE, BEHIND)).toBe(true);
    expect(fadesNext(false, [], EYE, BEHIND)).toBe(false);
  });

  it("starts when she comes close behind its edge, and stops only once she is well clear of it", () => {
    // Walking east behind it: how far past its east side the line of sight runs.
    const past = (metres: number): [Eye, Eye] => [at(1 + metres, 5, 5), at(1 + metres, 0, -1.5)];
    const between = (FADES_WITHIN + CLEARS_BEYOND) / 2;
    expect(fadesNext(false, [CUPBOARD], ...past(between))).toBe(false);
    expect(fadesNext(true, [CUPBOARD], ...past(between))).toBe(true);
    expect(fadesNext(false, [CUPBOARD], ...past(FADES_WITHIN - 0.03))).toBe(true);
    expect(fadesNext(true, [CUPBOARD], ...past(CLEARS_BEYOND + 0.03))).toBe(false);
  });
});

describe("a stair, and the person on it", () => {
  // A flight like the house's: it climbs north from z = 0, each step a solid block from the floor to its tread.
  const RISE = 0.18;
  const GOING = 0.25;
  const STEPS = 15;
  const FLIGHT: Box[] = Array.from({ length: STEPS }, (_, i) => ({ min: { x: 0, y: 0, z: -(i + 1) * GOING }, max: { x: 1, y: (i + 1) * RISE, z: -i * GOING } }));
  /** Standing in the middle of a step, counted from 1 at the foot. */
  const onStep = (n: number): Eye => at(0.5, n * RISE, -(n - 0.5) * GOING);
  const SOUTH = at(0.5, 8, 8);
  const EAST = at(9, 8, onStep(5).z);
  const SOUTH_EAST = at(7, 8, 5);

  it("stays solid under her, seen from its foot, from its side and from a corner", () => {
    for (const step of [1, 5, 10, STEPS]) {
      for (const eye of [SOUTH, EAST, SOUTH_EAST]) expect(fadesNext(false, FLIGHT, eye, onStep(step)), `on step ${step}`).toBe(false);
    }
  });

  it("stays solid as she steps on at its foot and off at its head", () => {
    // On the floor, a hand's width short of the first step; and on the floor above, just past the last.
    expect(fadesNext(false, FLIGHT, SOUTH, at(0.5, 0, 0.1))).toBe(false);
    expect(fadesNext(false, FLIGHT, SOUTH_EAST, at(0.5, 0, 0.1))).toBe(false);
    expect(fadesNext(false, FLIGHT, SOUTH, at(0.5, STEPS * RISE, -STEPS * GOING - 0.1))).toBe(false);
  });

  it("goes see-through when the steps above her are between the camera and her", () => {
    // A camera low over the head of the flight, looking down it: the upper steps hide all but her head.
    const overTheHead = at(0.5, STEPS * RISE + 0.6, -STEPS * GOING - 3);
    expect(fadesNext(false, FLIGHT, overTheHead, onStep(3))).toBe(true);
  });

  it("goes see-through for someone behind it, as a cupboard does", () => {
    // On the floor beyond its high end, seen from the south: the whole flight is in between.
    expect(fadesNext(false, FLIGHT, SOUTH, at(0.5, 0, -STEPS * GOING - 1))).toBe(true);
    // And beside its high end, seen across it from the east.
    expect(fadesNext(false, FLIGHT, at(9, 6, -3.5), at(-0.6, 0, -3.5))).toBe(true);
  });

  it("is not in the way where it is low: beside its first steps she is seen over them", () => {
    expect(fadesNext(false, FLIGHT, at(9, 6, -0.4), at(-0.6, 0, -0.4))).toBe(false);
  });
});
