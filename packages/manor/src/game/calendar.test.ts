import { describe, expect, it } from "vitest";

import { HOLIDAYS, SEASONS, WEEK, WEEKDAYS, YEAR_DAYS, dateAt, dateOfDay, dateSays, dateText, dayOfDate, holidayOn, isSabbath, pageBeside, pageOf } from "./calendar";
import { DAY, HOUR } from "./tuning";

// The calendar: seasons in place of months, weeks that run on without a break, and holidays
// that keep their date and not their day of the week.

describe("a date", () => {
  it("is a season and a day of it: the game begins on the first day of the first season, a Monday", () => {
    const first = dateOfDay(1);
    expect(first).toEqual({ year: 1, season: 0, day: 1, weekday: 0 });
    expect(dateText(first)).toBe("Spring 1");
    expect(dateSays(first)).toBe("Monday, Spring 1, year 1");
  });

  it("is read from the game's clock, and changes at midnight", () => {
    expect(dateText(dateAt(8 * HOUR))).toBe("Spring 1");
    expect(dateText(dateAt(DAY - 1))).toBe("Spring 1");
    expect(dateText(dateAt(DAY))).toBe("Spring 2");
  });

  it("goes from the last day of a season to the first of the next, and from the last of the year to the first of the next year", () => {
    const [spring, summer] = SEASONS;
    expect(dateText(dateOfDay(spring.days))).toBe(`Spring ${spring.days}`);
    expect(dateText(dateOfDay(spring.days + 1))).toBe("Summer 1");
    expect(dateText(dateOfDay(spring.days + summer.days))).toBe(`Summer ${summer.days}`);
    expect(dateOfDay(YEAR_DAYS)).toMatchObject({ year: 1, season: SEASONS.length - 1, day: SEASONS[SEASONS.length - 1].days });
    expect(dateOfDay(YEAR_DAYS + 1)).toMatchObject({ year: 2, season: 0, day: 1 });
  });

  it("can be turned back into the count of days it is, for every day of two years", () => {
    for (let count = 1; count <= YEAR_DAYS * 2; count++) {
      const { year, season, day } = dateOfDay(count);
      expect(dayOfDate(year, season, day)).toBe(count);
    }
  });

  it("has seasons of thirty or thirty-one days", () => {
    for (const season of SEASONS) expect([30, 31]).toContain(season.days);
  });
});

describe("the week", () => {
  it("is seven days and runs on without a break, through the end of a season and of a year", () => {
    for (let count = 1; count < YEAR_DAYS * 2; count++) expect(dateOfDay(count + 1).weekday).toBe((dateOfDay(count).weekday + 1) % WEEK);
  });

  it("ends in the Sabbath: every seventh day from the first Sunday", () => {
    expect(WEEKDAYS[WEEK - 1]).toBe("Sunday");
    expect(isSabbath(dateOfDay(7))).toBe(true);
    expect(isSabbath(dateOfDay(14))).toBe(true);
    expect([1, 2, 3, 4, 5, 6, 8].some((count) => isSabbath(dateOfDay(count)))).toBe(false);
  });

  it("so a season begins on whatever day follows the last one's end, not always on the same one", () => {
    const firsts = SEASONS.map((_, season) => pageOf(1, season).lead);
    expect(firsts[0]).toBe(0);
    expect(firsts[1]).toBe(SEASONS[0].days % WEEK);
    expect(new Set(firsts).size).toBeGreaterThan(1);
  });
});

describe("a holiday", () => {
  it("is the same date every year: Christmas is Winter 25", () => {
    const winter = SEASONS.findIndex((s) => s.id === "winter");
    for (const year of [1, 2, 3]) expect(holidayOn(dateOfDay(dayOfDate(year, winter, 25)))?.name).toBe("Christmas");
    expect(holidayOn(dateOfDay(dayOfDate(1, winter, 24)))).toBeUndefined();
    expect(holidayOn(dateOfDay(dayOfDate(1, 0, 25)))).toBeUndefined();
    expect(HOLIDAYS.map((h) => `${h.season} ${h.day}`)).toContain("winter 25");
  });

  it("falls on a different day of the week from one year to the next", () => {
    const winter = SEASONS.findIndex((s) => s.id === "winter");
    const days = [1, 2, 3].map((year) => dateOfDay(dayOfDate(year, winter, 25)).weekday);
    expect(days[1]).toBe((days[0] + YEAR_DAYS) % WEEK);
    expect(new Set(days).size).toBe(3);
  });
});

describe("a page of the calendar", () => {
  it("is one season of one year: every day of it in order, and which day of the week it starts on", () => {
    const page = pageOf(1, 1);
    expect(page.dates.length).toBe(SEASONS[1].days);
    expect(page.dates[0]).toMatchObject({ season: 1, day: 1 });
    expect(page.dates[page.dates.length - 1].day).toBe(SEASONS[1].days);
    expect(page.lead).toBe(page.dates[0].weekday);
  });

  it("turns to the season after and the season before, round the end of the year", () => {
    expect(pageBeside(1, 0, 1)).toEqual({ year: 1, season: 1 });
    expect(pageBeside(1, SEASONS.length - 1, 1)).toEqual({ year: 2, season: 0 });
    expect(pageBeside(2, 0, -1)).toEqual({ year: 1, season: SEASONS.length - 1 });
    expect(pageBeside(1, 2, -1)).toEqual({ year: 1, season: 1 });
  });
});
