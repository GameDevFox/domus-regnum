import { describe, expect, it } from "vitest";

import { outOfDoors } from "../space";
import { assign, needOf } from "./game";
import { CROPS, SQUARES, everySquare, isRipe, want } from "./garden";
import { ALL, bed, withPotatoes } from "./garden-kit";
import { PLOT_AT } from "./grounds";
import { outingOf } from "./outing";
import { sendToTown } from "./outing-send";
import { isAt } from "./place";
import { NINE, gameAt, person, roomOf, run, until, whereSheMayBe } from "./test-kit";
import { DAY, HOUR } from "./tuning";
import type { Game, GardenTask } from "./types";

// Whoever has the garden: what she does among the plots, and when, as the household's gardener.

describe("whoever has the garden", () => {
  /** Nine in the morning, nobody baking, Sage given the garden, and potatoes wanted in so many squares, from the first. */
  const garden = (squares: number): Game => {
    const game = withPotatoes(NINE);
    assign(game, "evelyn", null);
    for (let n = 0; n < squares; n++) want(game, Math.floor(n / SQUARES), n % SQUARES, "potato");
    assign(game, "sage", "garden");
    return game;
  };
  const task = (game: Game): GardenTask => game.tasks.sage as GardenTask;

  it("is one person: given to another, the first is taken off it", () => {
    const game = garden(0);
    assign(game, "rose", "garden");
    expect(game.posts).toMatchObject({ rose: "garden" });
    expect(game.posts.sage).toBeUndefined();
  });

  it("goes out at the kitchen's back door and along the aisle, sows each square that wants it and waters it, and comes in again: never off her way", () => {
    const game = garden(ALL);
    let out = false;
    until(game, () => {
      const sage = person(game, "sage");
      out ||= outOfDoors(game.world, sage);
      expect(whereSheMayBe(game, sage), "the gardener is off her way").toBe(true);
      return everySquare(game).every(({ bed: square }) => square.crop === "potato" && square.watered) && !outOfDoors(game.world, sage);
    }, 10 * 60);
    expect(out).toBe(true);
    expect(roomOf(game, "sage")).toBeDefined();
  });

  it("sees to every square of a plot from the one place in the aisle beside it: she walks to a plot, not to each square", () => {
    const game = garden(SQUARES);
    until(game, () => task(game)?.plot === 0 && person(game, "sage").label !== null, 10 * 60);
    const from = { ...person(game, "sage").walker.pos };
    const walked = person(game, "sage").walked;
    until(game, () => task(game)?.square === SQUARES - 1 && task(game)?.step === "water", 10 * 60);
    expect(person(game, "sage").walker.pos).toEqual(from);
    expect(person(game, "sage").walked).toBe(walked);
    // Every square before the last is sown and watered by then.
    expect(game.garden.plots[0].squares.slice(0, -1).every((square) => square.crop === "potato" && square.watered)).toBe(true);
  });

  it("brings in what every square bore: a plot of potatoes is six squares' worth", () => {
    const game = garden(0);
    game.garden.plots[0].squares = Array.from({ length: SQUARES }, () => ({ crop: "potato" as const, wanted: null, grown: CROPS.potato.days, watered: false }));
    until(game, () => game.stock.potato > 0, 10 * 60);
    expect(game.stock.potato).toBe(SQUARES * CROPS.potato.bears);
  });

  it("stands in the aisle beside the plot she is seeing to, facing it", () => {
    const game = garden(ALL);
    until(game, () => task(game)?.plot === 3 && person(game, "sage").label !== null, 10 * 60);
    // (She turns to it as she sets to work.)
    run(game, 2);
    const { pos, heading } = person(game, "sage").walker;
    expect(pos.x).toBeCloseTo(PLOT_AT[3].x, 1);
    expect(pos.z).toBeCloseTo(-3.3, 1);
    // The fourth plot is to the north of the aisle: she faces north.
    expect(Math.cos(heading)).toBeLessThan(-0.9);
    expect(person(game, "sage").label).toMatch(/sowing|watering/);
  });

  it("with nothing in the garden to see to, does the housework like anyone without a job, and wants for nothing", () => {
    const game = garden(0);
    run(game, 60);
    expect(outOfDoors(game.world, person(game, "sage"))).toBe(false);
    expect(person(game, "sage").walked).toBeGreaterThan(3);
    // (With the shop's shelf bare and someone at the counter, it is the shopkeeper who wants for loaves, not she.)
    game.shelf = { bread: 0, pie: 0 };
    game.customers.push({ id: "someone", place: 0, state: "waiting", waited: 0 });
    until(game, () => game.tasks.sage?.step === null, 60);
    expect(needOf(game, "sage")).toBeNull();
  });

  it("waters every day, so that what was sown is ripe in as many days as it takes; picks it, and carries it in to its shelf in the pantry", () => {
    const game = garden(1);
    until(game, () => bed(game).crop === "potato" && bed(game).watered, 10 * 60);
    // The days go by: she sees to it each morning.
    for (let day = 0; day < CROPS.potato.days; day++) {
      game.clock = Math.floor(game.clock / DAY) * DAY + DAY + NINE;
      // (A moment for the new day to begin: yesterday's watering is yesterday's.)
      run(game, 0.1);
      expect(bed(game).grown).toBe(day + 1);
      until(game, () => bed(game).watered || isRipe(bed(game)), 10 * 60);
    }
    until(game, () => task(game)?.has.potato === CROPS.potato.bears, 10 * 60);
    expect(person(game, "sage").carrying).toBe("potato");
    expect(game.stock.potato).toBe(0);
    until(game, () => game.stock.potato > 0, 10 * 60);
    expect(game.stock.potato).toBe(CROPS.potato.bears);
    expect(isAt(game.world, person(game, "sage"), game.world.plan.stores.produce)).toBe(true);
    expect(person(game, "sage").carrying).toBeNull();
    expect(task(game).has).toEqual({});
  });

  it("brings wheat in as flour: a square's two sacks are in the pantry with the rest of the flour, and nothing is kept as wheat", () => {
    const game = gameAt(NINE);
    for (const id of game.household) assign(game, id, id === "sage" ? "garden" : null);
    // Three squares of ripe wheat, wanted no more: she pulls them and brings them in.
    for (const square of [0, 1, 2]) game.garden.plots[0].squares[square] = { crop: "wheat", wanted: null, grown: CROPS.wheat.days, watered: false };
    const flour = game.flour;
    until(game, () => game.garden.plots[0].squares.every((square) => square.crop === null) && game.tasks.sage?.job === "garden" && game.tasks.sage.step === null && !outOfDoors(game.world, person(game, "sage")) && person(game, "sage").carrying === null, 20 * 60);
    expect(game.flour).toBe(flour + 3 * CROPS.wheat.bears);
    expect(game.stock.wheat).toBe(0);
    // (Potatoes, in the same hands, are kept as potatoes.)
    game.garden.plots[0].squares[0] = { crop: "potato", wanted: null, grown: CROPS.potato.days, watered: false };
    until(game, () => game.stock.potato === CROPS.potato.bears, 20 * 60);
    expect(game.flour).toBe(flour + 3 * CROPS.wheat.bears);
  });

  it("taken off the garden while she is out among the plots, leaves what she was at, comes in, and only then is free of it", () => {
    const game = garden(ALL);
    until(game, () => outOfDoors(game.world, person(game, "sage")) && task(game).step === "sow", 10 * 60);
    const sown = everySquare(game).filter((s) => s.bed.crop !== null).length;
    assign(game, "sage", null);
    expect(task(game)).toMatchObject({ last: true, step: null, plot: null, square: null });
    until(game, () => game.tasks.sage === undefined, 5 * 60);
    expect(outOfDoors(game.world, person(game, "sage"))).toBe(false);
    // What she was in the middle of was not done by her leaving it.
    expect(everySquare(game).filter((s) => s.bed.crop !== null).length).toBe(sown);
  });

  it("sent on an outing while she is out among the plots, comes in first, and goes out at the front door like anyone", () => {
    const game = garden(ALL);
    game.coin = 100;
    until(game, () => outOfDoors(game.world, person(game, "sage")), 10 * 60);
    expect(sendToTown(game, "sage")).toBe(true);
    until(game, () => {
      const sage = game.world.actors.find((a) => a.id === "sage");
      if (sage) expect(whereSheMayBe(game, sage), "she is off her way").toBe(true);
      return outingOf(game, "sage")?.state === "away";
    }, 10 * 60);
    expect(game.tasks.sage).toBeUndefined();
    // Her job is hers again when she is home.
    expect(game.posts.sage).toBe("garden");
  });

  it("taken off it in the house with something picked still in her arms, puts it on its shelf first: it is not lost", () => {
    const game = garden(1);
    game.garden.plots[0].squares[0] = { crop: "potato", wanted: "potato", grown: CROPS.potato.days, watered: false };
    until(game, () => task(game)?.step === "in" && !outOfDoors(game.world, person(game, "sage")), 10 * 60);
    expect(task(game).has.potato).toBe(CROPS.potato.bears);
    assign(game, "sage", null);
    expect(task(game).last).toBe(true);
    until(game, () => game.tasks.sage === undefined, 5 * 60);
    expect(game.stock.potato).toBe(CROPS.potato.bears);
  });

  it("taken off it in the house with empty hands, is free of it at once", () => {
    const game = garden(0);
    run(game, 5);
    assign(game, "sage", null);
    expect(game.tasks.sage).toBeUndefined();
  });

  it("comes in at night before she goes up to bed, and is the gardener again in the morning", () => {
    const game = garden(ALL);
    until(game, () => task(game)?.plot === 3 && person(game, "sage").label !== null, 10 * 60);
    // Bedtime finds her at the far end of the aisle.
    game.clock = 22 * HOUR;
    until(game, () => {
      // She comes in by the path and the door: not across the lawn and through the wall.
      expect(whereSheMayBe(game, person(game, "sage")), "she is off her way to bed").toBe(true);
      return game.abed.sage === "in";
    }, 20 * 60);
    expect(game.posts.sage).toBe("garden");
    until(game, () => game.clock > DAY + 7 * HOUR && game.tasks.sage?.job === "garden", 20 * 60);
  });
});
