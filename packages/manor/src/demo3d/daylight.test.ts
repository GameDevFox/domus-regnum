import { describe, expect, it } from "vitest";

import { BEDTIME, DAY, DUSK, HOUR, SHOP_OPENS, SHOP_SHUTS, WAKE } from "../game";
import { daylightAt, underground } from "./daylight";
import type { Daylight, Rgb } from "./daylight";
import { dialAt, spanOnDial } from "./dial";

/** How much light there is on the house: what comes from all round, and what comes from the sun or moon. */
const brightness = (light: Daylight): number => light.ambient + light.sunPower;
const NOON = 12 * HOUR;
const colours = (light: Daylight): Rgb[] => [light.sunColor, light.sky, light.ground, light.figures, ...light.backdrop];

describe("the light of the day", () => {
  it("is brightest in the middle of the day and dimmest at night", () => {
    const all = Array.from({ length: DAY }, (_, m) => brightness(daylightAt(m)));
    expect(brightness(daylightAt(NOON))).toBe(Math.max(...all));
    expect(brightness(daylightAt(2 * HOUR))).toBe(Math.min(...all));
  });

  it("leaves moonlight enough to see the garden by: a third of noon, with the lamps to do the rest indoors", () => {
    for (let m = DUSK; m <= BEDTIME; m += 10) expect(brightness(daylightAt(m)) / brightness(daylightAt(NOON)), `at minute ${m}`).toBeGreaterThan(0.3);
  });

  it("makes the night cool: more blue than red in the light from all round, and the other way by day", () => {
    const [night, noon] = [daylightAt(BEDTIME).sky, daylightAt(NOON).sky];
    expect(night[2]).toBeGreaterThan(night[0]);
    expect(noon[0]).toBeGreaterThan(noon[2]);
  });

  it("is the same all through shop hours for the people, who are drawn as they were painted", () => {
    for (let m = SHOP_OPENS; m <= SHOP_SHUTS - 30; m += 30) expect(daylightAt(m).figures, `at minute ${m}`).toEqual([1, 1, 1]);
    expect(daylightAt(BEDTIME).figures[2]).toBeLessThan(1);
  });

  it("never jumps: from one minute to the next, round the whole clock, nothing changes by much", () => {
    const STEP = 0.03;
    for (let m = 0; m < DAY; m++) {
      const [a, b] = [daylightAt(m), daylightAt((m + 1) % DAY)];
      const nums = (l: Daylight): number[] => [l.ambient, l.sunPower, l.lamps, l.sun.x, l.sun.y, l.sun.z, ...colours(l).flat()];
      const [na, nb] = [nums(a), nums(b)];
      na.forEach((v, i) => expect(Math.abs(v - nb[i]), `value ${i} at minute ${m}`).toBeLessThan(STEP));
    }
  });

  it("keeps the sun, and the moon after it, well above the ground, and a unit's length away", () => {
    for (let m = 0; m < DAY; m += 7) {
      const { sun } = daylightAt(m);
      expect(Math.hypot(sun.x, sun.y, sun.z)).toBeCloseTo(1, 6);
      expect(sun.y, `at minute ${m}`).toBeGreaterThan(0.3);
    }
  });

  it("brings the sun up in the east and takes it down in the west", () => {
    expect(daylightAt(WAKE).sun.x).toBeGreaterThan(0.5);
    expect(daylightAt(DUSK).sun.x).toBeLessThan(-0.5);
  });

  it("has the lamps lit from dusk until the house wakes, and out all day", () => {
    for (const m of [DUSK, BEDTIME, 0, 3 * HOUR]) expect(daylightAt(m).lamps, `at minute ${m}`).toBe(1);
    for (const m of [SHOP_OPENS, NOON, SHOP_SHUTS - HOUR]) expect(daylightAt(m).lamps, `at minute ${m}`).toBe(0);
    expect(daylightAt(DUSK - 30).lamps).toBeGreaterThan(0);
    expect(daylightAt(DUSK - 30).lamps).toBeLessThan(1);
  });

  it("floats the house in a blue sky by day, a golden one at sunrise and sunset, and a dark one at night", () => {
    const sky = (minute: number): Rgb => daylightAt(minute).backdrop[0];
    const lightness = ([r, g, b]: Rgb): number => (r + g + b) / 3;
    for (const m of [SHOP_OPENS, NOON, SHOP_SHUTS - HOUR]) expect(sky(m)[2], `at minute ${m}`).toBeGreaterThan(sky(m)[0]);
    for (const m of [WAKE, DUSK]) expect(sky(m)[0], `at minute ${m}`).toBeGreaterThan(sky(m)[2]);
    expect(lightness(sky(NOON))).toBeGreaterThan(lightness(sky(BEDTIME)) * 3);
  });

  it("keeps every colour a colour", () => {
    for (let m = 0; m < DAY; m += 13) for (const c of colours(daylightAt(m))) for (const v of c) expect(v >= 0 && v <= 1).toBe(true);
  });
});

describe("the light below ground", () => {
  const below = (minute: number): Daylight => underground(daylightAt(minute), true);

  it("is the same at noon as at midnight, with the lamps lit at both", () => {
    // All but the dark behind the house, which is the sky's.
    expect({ ...below(NOON), backdrop: null }).toEqual({ ...below(0), backdrop: null });
    expect(below(NOON).lamps).toBe(1);
  });

  it("is dimmer than the day and brighter than moonlight: a place lit by lamps", () => {
    expect(brightness(below(NOON))).toBeLessThan(brightness(daylightAt(NOON)));
    expect(brightness(below(0))).toBeGreaterThan(brightness(daylightAt(0)));
  });

  it("leaves the dark behind the house to the hour", () => {
    expect(below(NOON).backdrop).toEqual(daylightAt(NOON).backdrop);
    expect(below(0).backdrop).toEqual(daylightAt(0).backdrop);
  });

  it("has its lamps out while the house sleeps, and is otherwise as it was", () => {
    const asleep = underground(daylightAt(0), false);
    expect(asleep.lamps).toBe(0);
    expect({ ...asleep, lamps: 1 }).toEqual(below(0));
  });

  it("comes from a unit's length away, like the sun", () => {
    const { sun } = below(NOON);
    expect(Math.hypot(sun.x, sun.y, sun.z)).toBeCloseTo(1, 6);
  });
});

describe("the dial", () => {
  const MIDDAY = (WAKE + BEDTIME) / 2;

  it("carries the sun from the left at waking, over the top, to the right at bedtime", () => {
    expect(dialAt(WAKE)).toEqual({ along: 0, up: 0, night: false });
    const top = dialAt(MIDDAY);
    expect([top.along, top.night]).toEqual([0.5, false]);
    expect(top.up).toBeCloseTo(1, 6);
    const last = dialAt(BEDTIME - 1);
    expect(last.along).toBeGreaterThan(0.99);
    expect(last.up).toBeLessThan(0.01);
  });

  it("moves evenly along: an hour is the same length wherever in the day it falls", () => {
    const hour = (from: number): number => dialAt(from + HOUR).along - dialAt(from).along;
    expect(hour(WAKE)).toBeCloseTo(hour(15 * HOUR), 9);
    expect(hour(WAKE)).toBeCloseTo(HOUR / (BEDTIME - WAKE), 9);
  });

  it("shows the night as night, with the moon going back to where the sun will rise", () => {
    expect(dialAt(BEDTIME)).toEqual({ along: 1, up: 0, night: true });
    const small = dialAt(2 * HOUR);
    expect([small.night, small.along]).toEqual([true, 0.5]);
    expect(dialAt(WAKE - 1).along).toBeLessThan(0.01);
  });

  it("draws something begun and due today as the length of arch between the two", () => {
    const span = spanOnDial(9 * HOUR, 12 * HOUR, 10 * HOUR);
    expect(span).toEqual({ from: dialAt(9 * HOUR).along, to: dialAt(12 * HOUR).along, ends: true });
    // The same on a later day: a day is a day.
    expect(spanOnDial(DAY * 2 + 9 * HOUR, DAY * 2 + 12 * HOUR, DAY * 2 + 10 * HOUR)).toEqual(span);
  });

  it("runs something due after bedtime on to the end of the arch, and says it does not end today", () => {
    const span = spanOnDial(20 * HOUR, DAY + 7 * HOUR, 20 * HOUR);
    expect(span?.to).toBe(1);
    expect(span?.ends).toBe(false);
    // The next morning, what is left of it is drawn from waking.
    expect(spanOnDial(20 * HOUR, DAY + 7 * HOUR, DAY + WAKE + 5)).toEqual({ from: 0, to: dialAt(7 * HOUR).along, ends: true });
  });

  it("draws nothing by night, nor for what is all in another day", () => {
    expect(spanOnDial(20 * HOUR, DAY + 7 * HOUR, 23 * HOUR)).toBeNull();
    expect(spanOnDial(DAY + 9 * HOUR, DAY + 12 * HOUR, 10 * HOUR)).toBeNull();
    expect(spanOnDial(9 * HOUR, 10 * HOUR, 11 * HOUR)).toEqual({ from: dialAt(9 * HOUR).along, to: dialAt(10 * HOUR).along, ends: true });
  });
});
