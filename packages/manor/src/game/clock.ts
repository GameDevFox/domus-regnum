import { BEDTIME, DAY, HOUR, SHOP_OPENS, SHOP_SHUTS, WAKE } from "./tuning";

// Reading the clock. The game keeps one number, minutes since the midnight before its first
// morning; everything here is arithmetic on such a number, and knows nothing else of the game.

/** Minutes after midnight, whatever the day. */
export const minuteOfDay = (clock: number): number => ((clock % DAY) + DAY) % DAY;

/** Which day it is, counting the first as 1. The count goes up at midnight. */
export const dayOf = (clock: number): number => Math.floor(clock / DAY) + 1;

/** From bedtime until the house wakes. */
export const isNight = (clock: number): boolean => {
  const minute = minuteOfDay(clock);
  return minute >= BEDTIME || minute < WAKE;
};

/** While customers come. */
export const shopHours = (clock: number): boolean => {
  const minute = minuteOfDay(clock);
  return minute >= SHOP_OPENS && minute < SHOP_SHUTS;
};

/** The clock at the next bedtime after this moment: tonight's, by day. */
export const nextBedtime = (clock: number): number => {
  const minute = minuteOfDay(clock);
  return clock - minute + (minute < BEDTIME ? BEDTIME : DAY + BEDTIME);
};

/** The clock at the next waking after this moment. */
export const nextWake = (clock: number): number => {
  const minute = minuteOfDay(clock);
  return clock - minute + (minute < WAKE ? WAKE : DAY + WAKE);
};

/** The time as a clock face with figures shows it: 06:00, 13:05. */
export const timeText = (clock: number): string => {
  const minute = Math.floor(minuteOfDay(clock));
  const two = (n: number): string => String(n).padStart(2, "0");
  return `${two(Math.floor(minute / HOUR))}:${two(minute % HOUR)}`;
};
