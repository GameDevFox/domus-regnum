import { describe, expect, it } from "vitest";

import { outOfDoors } from "../space";
import { assign } from "./game";
import { SQUARES, everySquare, want } from "./garden";
import { ALL, withPotatoes } from "./garden-kit";
import { leaveGarden } from "./gardener";
import { NINE, person, run, until } from "./test-kit";
import type { Game, GardenTask } from "./types";

// The gardener at her edges: taken off the garden on her way to a plot, and coming in with her hands empty.

/** Nine in the morning, nobody baking, Sage given the garden, and potatoes wanted in so many squares, from the first. */
const garden = (squares: number): Game => {
  const game = withPotatoes(NINE);
  assign(game, "evelyn", null);
  for (let n = 0; n < squares; n++) want(game, Math.floor(n / SQUARES), n % SQUARES, "potato");
  assign(game, "sage", "garden");
  return game;
};
const task = (game: Game): GardenTask => game.tasks.sage as GardenTask;

describe("a gardener taken off the garden", () => {
  it("stops where she stands, and has only to come in", () => {
    const game = garden(ALL);
    until(game, () => task(game)?.step === "sow" && outOfDoors(game.world, person(game, "sage")), 10 * 60);
    const sage = person(game, "sage");
    expect(sage.orders.length).toBeGreaterThan(0);
    expect(leaveGarden(game, sage, task(game))).toBe(true);
    // (What she was told to do next is taken from her: the next thing she is told is to come in.)
    expect(sage.next).toEqual([]);
    expect(task(game)).toMatchObject({ last: true, step: null, plot: null, square: null });
    // (Asked again, she has already been told: it is still true, and nothing more is done.)
    expect(leaveGarden(game, sage, task(game))).toBe(true);
  });

  it("has nothing to do, and says so, in the house with nothing in her arms", () => {
    const game = garden(0);
    run(game, 1);
    const sage = person(game, "sage");
    expect(outOfDoors(game.world, sage)).toBe(false);
    expect(leaveGarden(game, sage, task(game))).toBe(false);
    expect(task(game).last).toBeFalsy();
  });
});

describe("a gardener whose hands are empty", () => {
  it("does not walk to the pantry to set down what she has not got: she sows and waters, and comes in", () => {
    const game = garden(1);
    const labels = new Set<string>();
    until(
      game,
      () => {
        const label = person(game, "sage").label;
        if (label) labels.add(label);
        return everySquare(game).some(({ bed }) => bed.crop === "potato" && bed.watered) && task(game)?.step === null && !outOfDoors(game.world, person(game, "sage"));
      },
      10 * 60,
    );
    expect(labels.has("sowing")).toBe(true);
    expect(labels.has("watering")).toBe(true);
    expect(labels.has("setting down")).toBe(false);
  });
});
