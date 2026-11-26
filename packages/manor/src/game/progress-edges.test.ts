import { describe, expect, it } from "vitest";

import { outingOf } from "./outing";
import { sendToTown } from "./outing-send";
import { NEARING_SECONDS, nearing, progressOf } from "./progress";
import { gameAt } from "./test-kit";
import { BEDTIME, DAY, WAKE } from "./tuning";
import type { Game } from "./types";

// The rings round the household's faces, at their edges: before an outing was begun and after it ought to be done, and the night from bedtime.

/** A game with the sage sent into town. */
const sent = (): { game: Game; sent: number; back: number } => {
  const game = gameAt();
  sendToTown(game, "sage");
  const outing = outingOf(game, "sage");
  if (!outing) throw new Error("she was not sent");
  return { game, sent: outing.sent, back: outing.back };
};

describe("how near the end of the last step she is", () => {
  it("is where the steps left it with no time at it, and never less for a clock that has gone back", () => {
    expect(nearing(0.5, 0)).toBe(0.5);
    expect(nearing(0.5, -5)).toBe(0.5);
    expect(nearing(0.5, NEARING_SECONDS)).toBeGreaterThan(0.5);
    expect(nearing(0.5, 100 * NEARING_SECONDS)).toBeLessThan(1 + 1e-9);
  });
});

describe("how far through an outing she is", () => {
  it("is none before she was sent and the whole after she is due home", () => {
    const run = sent();
    run.game.clock = run.sent - 10;
    expect(progressOf(run.game, "sage")?.share).toBe(0);
    run.game.clock = run.back + 1000;
    expect(progressOf(run.game, "sage")?.share).toBe(1);
  });

  it("is half way at half the time", () => {
    const run = sent();
    run.game.clock = (run.sent + run.back) / 2;
    expect(progressOf(run.game, "sage")?.share).toBeCloseTo(0.5);
  });

  it("is a share of a minute for an outing due home the minute it began, and not nothing divided by nothing", () => {
    const run = sent();
    const outing = outingOf(run.game, "sage");
    if (!outing) throw new Error("she was not sent");
    outing.back = outing.sent;
    run.game.clock = outing.sent;
    expect(progressOf(run.game, "sage")?.share).toBe(0);
    run.game.clock = outing.sent + 0.5;
    expect(progressOf(run.game, "sage")?.share).toBe(0.5);
  });
});

describe("how far through the night she is", () => {
  const NIGHT = DAY - BEDTIME + WAKE;
  const abed = (clock: number): number | null | undefined => {
    const game = gameAt();
    game.abed.sage = "in";
    game.clock = clock;
    return progressOf(game, "sage")?.share;
  };

  it("is none at bedtime itself, half at the middle of the night, across midnight, and the whole at waking", () => {
    expect(abed(BEDTIME)).toBe(0);
    expect(abed(BEDTIME + NIGHT / 2)).toBeCloseTo(0.5);
    expect(abed(DAY + WAKE)).toBe(1);
  });
});
