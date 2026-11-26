import { describe, expect, it } from "vitest";

import { SEASONS, WEEK, YEAR_DAYS, dateOfDay } from "./calendar";

// The calendar at its edges: a day before the game began.

describe("the date before the first day", () => {
  it("is the last day of the year before: the round of seasons runs backwards as well as on", () => {
    const winter = SEASONS.length - 1;
    expect(dateOfDay(0)).toEqual({ year: 0, season: winter, day: SEASONS[winter].days, weekday: WEEK - 1 });
    expect(dateOfDay(1 - YEAR_DAYS)).toMatchObject({ year: 0, season: 0, day: 1 });
    expect(dateOfDay(-5).weekday).toBe(1);
  });
});
