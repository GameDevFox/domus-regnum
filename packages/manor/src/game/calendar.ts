import { dayOf } from "./clock";

// The calendar. There are no months: a year is a round of seasons, each thirty or thirty-one
// days, and a date is a season and a day of it ("Winter 25"). Weeks are seven days and run on
// without a break from one season into the next and from one year into the next, as on a real
// calendar: so a season begins on whatever day follows the last one's end, and a holiday falls
// on a different day of the week each year. The seventh day is the Sabbath.
//
// Everything here is arithmetic on the count of days since the game began (clock.ts, `dayOf`),
// and knows nothing else of the game.

export type SeasonId = "spring" | "summer" | "autumn" | "winter";

// The four seasons are the author's (2026-11-13). Which of them have thirty-one days is a working
// value: the lengths alternate.
export const SEASONS: { id: SeasonId; name: string; glyph: string; days: number }[] = [
  { id: "spring", name: "Spring", glyph: "🌱", days: 30 },
  { id: "summer", name: "Summer", glyph: "☀️", days: 31 },
  { id: "autumn", name: "Autumn", glyph: "🍂", days: 30 },
  { id: "winter", name: "Winter", glyph: "❄️", days: 31 },
];

export const YEAR_DAYS = SEASONS.reduce((sum, season) => sum + season.days, 0);

/** The days of the week, in order: the last is the Sabbath. */
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const WEEK = WEEKDAYS.length;
const SABBATH = WEEK - 1;
/** The day of the week the game's first day is. */
const FIRST_WEEKDAY = 0;

/** A date: the year (the first is 1), the season by its place in the round, the day of the season (the first is 1), and the day of the week by its place in it. */
export type CalendarDate = { year: number; season: number; day: number; weekday: number };

/** The date of a day, by its count since the game began: the first day is 1. */
export const dateOfDay = (count: number): CalendarDate => {
  const since = count - 1;
  let left = ((since % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
  let season = 0;
  while (left >= SEASONS[season].days) left -= SEASONS[season++].days;
  return { year: Math.floor(since / YEAR_DAYS) + 1, season, day: left + 1, weekday: (((since + FIRST_WEEKDAY) % WEEK) + WEEK) % WEEK };
};

/** The date it is, by the game's clock. */
export const dateAt = (clock: number): CalendarDate => dateOfDay(dayOf(clock));

/** The count of days since the game began on which a date falls: the other way about. */
export const dayOfDate = (year: number, season: number, day: number): number => (year - 1) * YEAR_DAYS + SEASONS.slice(0, season).reduce((sum, s) => sum + s.days, 0) + day;

export const isSabbath = (date: CalendarDate): boolean => date.weekday === SABBATH;

/** A date in words: "Winter 25". */
export const dateText = (date: CalendarDate): string => `${SEASONS[date.season].name} ${date.day}`;

/** The same with its day of the week and its year, for a tooltip and a screen reader: "Monday, Spring 1, year 1". */
export const dateSays = (date: CalendarDate): string => `${WEEKDAYS[date.weekday]}, ${dateText(date)}, year ${date.year}`;

/** A day that is the same date every year, whatever day of the week it falls on. */
export type Holiday = { id: string; name: string; glyph: string; season: SeasonId; day: number };

export const HOLIDAYS: Holiday[] = [{ id: "christmas", name: "Christmas", glyph: "🎄", season: "winter", day: 25 }];

/** The holiday a date is, if it is one. */
export const holidayOn = (date: CalendarDate): Holiday | undefined => HOLIDAYS.find((h) => h.season === SEASONS[date.season].id && h.day === date.day);

/** One season of one year, as a calendar's page: which day of the week its first day is, and each of its days. */
export const pageOf = (year: number, season: number): { year: number; season: number; lead: number; dates: CalendarDate[] } => {
  const first = dayOfDate(year, season, 1);
  const dates = Array.from({ length: SEASONS[season].days }, (_, n) => dateOfDay(first + n));
  return { year, season, lead: dates[0].weekday, dates };
};

/** The page before or after a page: the round of seasons turns the year. */
export const pageBeside = (year: number, season: number, by: 1 | -1): { year: number; season: number } => {
  const at = season + by;
  if (at < 0) return { year: year - 1, season: SEASONS.length - 1 };
  return at >= SEASONS.length ? { year: year + 1, season: 0 } : { year, season: at };
};
