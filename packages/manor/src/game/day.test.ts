import { describe, expect, it } from "vitest";

import { floorOf } from "../space";
import { dayOf, isNight, minuteOfDay, nextWake, shopHours, timeText } from "./clock";
import { asleep } from "./bedtime";
import { assign, createGame, stepGame } from "./game";
import { BEDTIME, DAY, HOUR, LOAVES_PER_SACK, MINUTES_PER_SECOND, NIGHT_SECONDS, SHOP_OPENS, SHOP_SHUTS, START, START_FLOUR, WAKE } from "./tuning";
import type { Game } from "./types";

const HZ = 60;
const run = (game: Game, seconds: number): void => {
  for (let i = 0; i < seconds * HZ; i++) stepGame(game, 1 / HZ);
};
const until = (game: Game, so: () => boolean, withinSeconds = 120): void => {
  for (let i = 0; i < withinSeconds * HZ; i++) {
    if (so()) return;
    stepGame(game, 1 / HZ);
  }
  throw new Error("it never happened");
};
const person = (game: Game, id: string) => {
  const actor = game.world.actors.find((a) => a.id === id);
  if (!actor) throw new Error(`nobody called ${id}`);
  return actor;
};
/** A game with the clock put to a time of the first day. */
const gameAt = (minute: number): Game => {
  const game = createGame();
  game.clock = minute;
  game.shelf.bread = 0;
  return game;
};

describe("the clock", () => {
  it("reads minutes since the first midnight as a day and a time", () => {
    expect([dayOf(WAKE), minuteOfDay(WAKE), timeText(WAKE)]).toEqual([1, 6 * HOUR, "06:00"]);
    expect([dayOf(DAY + 13 * HOUR + 5), timeText(DAY + 13 * HOUR + 5)]).toEqual([2, "13:05"]);
    expect([dayOf(DAY - 1), timeText(DAY - 1)]).toEqual([1, "23:59"]);
    expect([dayOf(DAY), timeText(DAY)]).toEqual([2, "00:00"]);
  });

  it("calls it night from bedtime until the house wakes, across midnight", () => {
    expect([BEDTIME - 1, BEDTIME, DAY - 1, DAY, DAY + WAKE - 1, DAY + WAKE].map(isNight)).toEqual([false, true, true, true, true, false]);
  });

  it("keeps shop hours from opening up to closing, the same every day", () => {
    expect([SHOP_OPENS - 1, SHOP_OPENS, SHOP_SHUTS - 1, SHOP_SHUTS, DAY + SHOP_OPENS].map(shopHours)).toEqual([false, true, true, false, true]);
  });

  it("finds the next waking: tomorrow's from the evening, today's from the small hours", () => {
    expect(nextWake(BEDTIME + 20)).toBe(DAY + WAKE);
    expect(nextWake(DAY + 3 * HOUR)).toBe(DAY + WAKE);
    expect(nextWake(WAKE)).toBe(DAY + WAKE);
  });
});

describe("the day", () => {
  it("begins at eight on the first morning, in full day, and a second of the house's time is a minute of it", () => {
    const game = createGame();
    expect([dayOf(game.clock), timeText(game.clock)]).toEqual([1, "08:00"]);
    run(game, 90);
    expect(game.clock).toBeCloseTo(START + 90, 6);
  });

  it("brings customers only in shop hours", () => {
    const game = createGame();
    until(game, () => game.clock >= SHOP_OPENS - 1, 200);
    expect(game.arrivals).toBe(0);
    run(game, 60);
    expect(game.arrivals).toBeGreaterThan(2);

    const evening = gameAt(SHOP_SHUTS - 30);
    run(evening, 30);
    const came = evening.arrivals;
    expect(came).toBeGreaterThan(0);
    run(evening, 90);
    expect(evening.arrivals).toBe(came);
    // Whoever was inside at closing has been served, or has given up and gone.
    expect(evening.customers).toEqual([]);
  });
});

describe("the night", () => {
  it("sends everyone up to a bed of her own", () => {
    const game = gameAt(BEDTIME - 5);
    until(game, () => asleep(game));
    const beds = game.household.map((id) => {
      const { pos } = person(game, id).walker;
      expect(floorOf(game.world, person(game, id)), `${id} is not upstairs`).toBe("first");
      return `${pos.x.toFixed(1)},${pos.z.toFixed(1)}`;
    });
    expect(new Set(beds).size).toBe(game.household.length);
    // Nobody dawdles: the house is asleep within the hour.
    expect(game.clock).toBeLessThan(BEDTIME + HOUR);
  });

  it("is not begun while anyone is still up", () => {
    const game = gameAt(BEDTIME - 5);
    until(game, () => game.abed.sage === "in");
    expect(game.household.some((id) => game.abed[id] !== "in")).toBe(true);
    expect(asleep(game)).toBe(false);
    expect(game.clock).toBeLessThan(BEDTIME + HOUR);
  });

  it("passes in a few seconds with nothing moving, and the house wakes at six the next day", () => {
    const game = gameAt(BEDTIME - 5);
    until(game, () => asleep(game));
    const before = { t: game.world.t, coin: game.coin, flour: game.flour, loaves: game.shelf.bread };
    // Half the night: the small hours, and nobody has stirred.
    run(game, NIGHT_SECONDS / 2);
    expect(isNight(game.clock)).toBe(true);
    expect(asleep(game)).toBe(true);
    expect({ t: game.world.t, coin: game.coin, flour: game.flour, loaves: game.shelf.bread }).toEqual(before);
    run(game, NIGHT_SECONDS / 2 + 0.5);
    expect([dayOf(game.clock), isNight(game.clock)]).toEqual([2, false]);
    expect(minuteOfDay(game.clock)).toBeLessThan(WAKE + 2);
    expect(game.abed).toEqual({});
  });

  // Found by a bug hunt, 2026-11-16: a night in which somebody never got to bed ran on to six at the day's pace, and then nobody woke and the day's trade was never reckoned.
  it("still brings the morning at six to a house that was never all in bed: everyone is up, and yesterday's trade is reckoned", () => {
    const game = gameAt(DAY + WAKE - 0.5);
    for (const id of game.household) game.abed[id] = "in";
    // The Master is still on his way up.
    game.abed.master = "going";
    game.today = { sold: 7, lost: 0 };
    const custom = game.custom;
    expect(asleep(game)).toBe(false);
    run(game, 1);
    expect(isNight(game.clock)).toBe(false);
    expect(game.abed).toEqual({});
    expect(game.today).toEqual({ sold: 0, lost: 0 });
    expect(game.custom).toBeGreaterThan(custom);
  });

  it("leaves everyone her job: in the morning the baker bakes and the shop is kept", () => {
    const game = gameAt(BEDTIME - 5);
    until(game, () => asleep(game));
    expect(game.posts).toEqual({ evelyn: "bake", rose: "shop", master: "lab" });
    until(game, () => game.tasks.evelyn?.step === "knead" && game.tasks.rose?.job === "shop", 60);
    expect(floorOf(game.world, person(game, "evelyn"))).toBe("ground");
  });

  it("lets a baker with loaves in her arms set them on the shelf before she goes up", () => {
    const game = gameAt(SHOP_OPENS);
    assign(game, "rose", null);
    until(game, () => game.tasks.evelyn?.step === "deliver");
    game.clock = BEDTIME;
    until(game, () => asleep(game));
    expect(game.shelf.bread).toBe(LOAVES_PER_SACK);
    expect(game.flour).toBe(START_FLOUR - 1);
    expect(game.posts.evelyn).toBe("bake");
  });

  it("puts the flour back when it falls in the middle of a batch", () => {
    const game = gameAt(SHOP_OPENS);
    until(game, () => game.tasks.evelyn?.step === "knead");
    expect(game.flour).toBe(START_FLOUR - 1);
    game.clock = BEDTIME;
    until(game, () => asleep(game));
    expect([game.flour, game.shelf.bread]).toEqual([START_FLOUR, 0]);
    expect(person(game, "evelyn").carrying).toBeNull();
  });

  it("does not wake anyone given a job in it: she takes it up in the morning", () => {
    const game = gameAt(BEDTIME - 5);
    until(game, () => asleep(game));
    assign(game, "sage", "bake");
    run(game, 1);
    expect(asleep(game)).toBe(true);
    until(game, () => game.tasks.sage?.step === "knead", 60);
    expect(game.posts).toEqual({ evelyn: "bake", sage: "bake", rose: "shop", master: "lab" });
  });

  it("is slept in a bed and nowhere else: called to a job on her way up, she still goes up", () => {
    const game = gameAt(BEDTIME - 5);
    until(game, () => game.abed.sage === "going" && person(game, "sage").walker.speed > 0);
    // The new job stops her where she is, with nothing left to do: that is not being in bed.
    assign(game, "sage", "bake");
    run(game, 1);
    expect(game.abed.sage).toBe("going");
    until(game, () => asleep(game));
    expect(floorOf(game.world, person(game, "sage"))).toBe("first");
  });

  it("comes round: a whole day and a night end at six with everyone up and about", () => {
    const game = createGame();
    const WAKING_SECONDS = (BEDTIME - START + HOUR) / MINUTES_PER_SECOND + NIGHT_SECONDS;
    until(game, () => dayOf(game.clock) === 2 && !isNight(game.clock), WAKING_SECONDS);
    expect(game.sold).toBeGreaterThan(0);
    run(game, 30);
    expect(game.household.every((id) => person(game, id).walked > 0)).toBe(true);
    expect(game.abed).toEqual({});
  });
});
