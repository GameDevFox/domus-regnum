import { BEDTIME, DAY, WAKE, isNight, minuteOfDay } from "../game";

// The clock at the top of the screen, as arithmetic: where along the day's arch the sun stands.

export type DialMark = {
  /** 0 at the left end of the arch to 1 at the right. By day the left end is waking and the right is bedtime. */
  along: number;
  /** 0 on the horizon to 1 at the top of the arch. */
  up: number;
  night: boolean;
};

/**
 * Where the mark is at a time of day. By day the sun goes evenly from left to right, so an hour
 * is the same length wherever it falls, and rises to the top in the middle of the waking day. By
 * night the moon goes back along the horizon, from where the sun set to where it will rise.
 */
export const dialAt = (clock: number): DialMark => {
  const minute = minuteOfDay(clock);
  if (!isNight(minute)) {
    const along = (minute - WAKE) / (BEDTIME - WAKE);
    return { along, up: Math.sin(Math.PI * along), night: false };
  }
  const intoNight = (minute - BEDTIME + DAY) % DAY;
  return { along: 1 - intoNight / (DAY - BEDTIME + WAKE), up: 0, night: true };
};

/** A stretch of the arch, in the same measure as `along`. */
export type DialSpan = { from: number; to: number; /** Whether the stretch ends within this waking day, or runs on past bedtime. */ ends: boolean };

/**
 * The part of a stretch of time that falls in the waking day the clock is in: something begun at
 * one clock and due at another, as a length of the arch. Null by night, and when none of it is
 * in this day.
 */
export const spanOnDial = (from: number, to: number, clock: number): DialSpan | null => {
  if (isNight(clock)) return null;
  const midnight = clock - minuteOfDay(clock);
  const [first, last] = [midnight + WAKE, midnight + BEDTIME];
  const [a, b] = [Math.max(from, first), Math.min(to, last)];
  if (b <= a) return null;
  const along = (at: number): number => (at - first) / (last - first);
  return { from: along(a), to: along(b), ends: to <= last };
};
