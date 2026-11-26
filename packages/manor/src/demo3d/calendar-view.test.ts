import { describe, expect, it } from "vitest";

import { SEASONS, dayOfDate, pageOf } from "../game";
import { legendOf } from "./calendar-view";

// The calendar's legend: only what the page shown holds.

const season = (id: string): number => SEASONS.findIndex((s) => s.id === id);
const FIRST_YEAR = 1;
/** Any day of spring, for the occasion. */
const A_SPRING_DAY = 10;

describe("the calendar's legend", () => {
  it("names a holiday only on the page that holds it", () => {
    expect(legendOf(pageOf(FIRST_YEAR, season("spring")).dates, null)).toBe("Sundays are the Sabbath");
    expect(legendOf(pageOf(FIRST_YEAR, season("winter")).dates, null)).toBe("Sundays are the Sabbath · 🎄 Christmas");
  });

  it("names the house's occasion only on the page whose day it is", () => {
    const spring = season("spring");
    const occasion = dayOfDate(FIRST_YEAR, spring, A_SPRING_DAY);
    expect(legendOf(pageOf(FIRST_YEAR, spring).dates, occasion)).toBe("Sundays are the Sabbath · 🫖 the house's occasion");
    expect(legendOf(pageOf(FIRST_YEAR, season("summer")).dates, occasion)).toBe("Sundays are the Sabbath");
  });
});
