import { describe, expect, it } from "vitest";

import { dayOf, minuteOfDay, nextBedtime, nextWake, timeText } from "./clock";
import { BEDTIME, DAY, HOUR, WAKE } from "./tuning";

// Where the clock's arithmetic is easiest to get wrong: at an edge, and before the game began.

describe("the next bedtime", () => {
  it("is tonight's from the afternoon, and tomorrow's once it is bedtime itself", () => {
    expect(nextBedtime(15 * HOUR)).toBe(BEDTIME);
    expect(nextBedtime(BEDTIME - 1)).toBe(BEDTIME);
    expect(nextBedtime(BEDTIME)).toBe(DAY + BEDTIME);
    expect(nextBedtime(DAY + 3 * HOUR)).toBe(DAY + BEDTIME);
  });
});

describe("the next waking", () => {
  it("is tomorrow's, not this moment's, at the very waking", () => {
    expect(nextWake(WAKE - 1)).toBe(WAKE);
    expect(nextWake(WAKE)).toBe(DAY + WAKE);
  });
});

describe("a clock from before the game began", () => {
  it("still reads as a time of day and a day", () => {
    expect(minuteOfDay(-1)).toBe(DAY - 1);
    expect(minuteOfDay(-DAY - 5)).toBe(DAY - 5);
    expect(timeText(-1)).toBe("23:59");
    expect(dayOf(-1)).toBe(0);
  });
});

describe("the time shown", () => {
  it("is of the minute that has begun, not the nearest: 13:05 and a half is still 13:05", () => {
    expect(timeText(13 * HOUR + 5.6)).toBe("13:05");
    expect(timeText(13 * HOUR + 59.9)).toBe("13:59");
  });
});
