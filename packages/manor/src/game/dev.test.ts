import { describe, expect, it } from "vitest";

import { playsWholeDays } from "../test-timeout";
import { DEV_COMMANDS, reveal, runDev, runToDay } from "./dev";
import { onShelf } from "./bakes";
import { CROP_IDS, daysLeft, stepGarden, tend, want } from "./garden";
import { assign, createGame } from "./game";
import { isMaster } from "./mastery";
import { USUAL_TERMS, outingOf } from "./outing";
import { sendParty } from "./outing-party";
import { explore } from "./outing-send";
import { NINE, gameAt, run, until } from "./test-kit";
import { DAY, HOUR, SHOP_SHELF_HOLDS, START_COIN, START_FLOUR, WAKE } from "./tuning";

playsWholeDays();

// The workshop's commands: what each does to the game, by its name.

describe("the workshop's commands", () => {
  it("each has a name of its own, and an unknown name does nothing", () => {
    expect(new Set(DEV_COMMANDS.map((c) => c.id)).size).toBe(DEV_COMMANDS.length);
    const game = gameAt(NINE);
    const before = JSON.stringify({ coin: game.coin, clock: game.clock });
    expect(runDev(game, "no-such-thing")).toBe(false);
    expect(JSON.stringify({ coin: game.coin, clock: game.clock })).toBe(before);
  });

  it("give coin, flour, each thing that is gathered, and loaves up to what the shelf holds", () => {
    const game = gameAt(NINE);
    game.shelf.bread = SHOP_SHELF_HOLDS - 5;
    for (const id of ["coin", "flour", "berries", "herbs", "loaves"]) expect(runDev(game, id)).toBe(true);
    expect(game.coin).toBe(START_COIN + 100);
    expect(game.flour).toBe(START_FLOUR + 12);
    expect(game.stock).toMatchObject({ berries: 12, herbs: 12 });
    expect(game.shelf.bread).toBe(SHOP_SHELF_HOLDS);
  });

  it("give as much as they are told, where it is something given by the amount; and a dozen of a crop if they are told nothing", () => {
    const game = gameAt(NINE);
    runDev(game, "coin", 7);
    runDev(game, "berries", 3);
    runDev(game, "potato");
    runDev(game, "cucumber", 2);
    expect(game.coin).toBe(START_COIN + 7);
    expect(game.stock).toMatchObject({ berries: 3, potato: 12, cucumber: 2 });
  });

  it("give pies too, and no more of them than the shelf has room for beside its loaves", () => {
    const game = gameAt(NINE);
    game.shelf.bread = 2;
    expect(runDev(game, "pies")).toBe(true);
    expect(game.shelf).toEqual({ bread: 2, pie: 12 });
    runDev(game, "pies");
    expect(game.shelf).toEqual({ bread: 2, pie: SHOP_SHELF_HOLDS - 2 });
  });

  it("run an hour of the house's real day: the clock is an hour on, and bread has been sold meanwhile", () => {
    const game = gameAt(NINE);
    runDev(game, "hour");
    expect(game.clock).toBeGreaterThanOrEqual(NINE + HOUR);
    expect(game.clock).toBeLessThan(NINE + HOUR + 0.1);
    expect(game.sold).toBeGreaterThan(0);
  });

  it("run to the next morning, through the night", () => {
    const game = gameAt(NINE);
    runDev(game, "morning");
    expect(game.clock).toBeCloseTo(DAY + WAKE, 0);
    expect(game.abed).toEqual({});
  });

  it("run on to the morning of a day to come, with all that happens between; and leave a day that has begun alone", () => {
    const game = gameAt(NINE);
    runToDay(game, 4);
    expect(game.clock).toBeCloseTo(3 * DAY + WAKE, 0);
    expect(game.sold).toBeGreaterThan(0);
    const there = game.clock;
    runToDay(game, 4);
    runToDay(game, 2);
    expect(game.clock).toBe(there);
  });

  it("run until a scene begins, and stop there: the first caller's, on the second morning", () => {
    const game = createGame();
    runDev(game, "scene");
    // It stops as the scene is due, and the scene is begun at the next moment.
    expect(game.scene).toBeNull();
    expect(game.clock).toBeCloseTo(DAY + 10 * HOUR, 0);
    run(game, 1 / 60);
    expect(game.scene?.scene.id).toBe("first-caller");
    // Running on does nothing while the scene waits for the player.
    until(game, () => game.scene?.waiting?.for === "advance", 120);
    const { clock } = game;
    runDev(game, "hour");
    expect(game.clock).toBe(clock);
  });

  it("stop running when someone asks what she is to do", () => {
    const game = gameAt(NINE);
    explore(game, "sage", "forest");
    runDev(game, "morning");
    expect(game.asks.length).toBe(1);
    expect(game.clock).toBeLessThan(NINE + 2 * HOUR);
  });

  it("play a scene now, on the first day, and again though it has been seen", () => {
    const game = gameAt(NINE);
    expect(game.seen).toContain("first-caller");
    expect(runDev(game, "play:first-caller")).toBe(true);
    // It is begun at the next moment, as a scene that is due is: on the page, after the black.
    expect(game.scene).toBeNull();
    run(game, 0.1);
    expect(game.scene?.scene.id).toBe("first-caller");
    expect(game.world.actors.some((a) => a.id === "priest")).toBe(true);
  });

  it("no longer find every place or teach every crop: the intel menu's tabs do, by a right-click", () => {
    const game = gameAt(NINE);
    expect(runDev(game, "map")).toBe(false);
    expect(runDev(game, "seeds")).toBe(false);
    reveal(game, { kind: "all", of: "place" });
    expect(game.places).toEqual({ manor: "found", town: "found", forest: "found", lake: "found", caves: "found" });
    reveal(game, { kind: "all", of: "crop" });
    expect(game.garden.known).toEqual(CROP_IDS);
  });

  it("bring home whoever is out, at once, and drop whatever she was asking", () => {
    const game = gameAt(NINE);
    explore(game, "sage", "forest");
    until(game, () => game.asks.length > 0, 90);
    runDev(game, "home");
    expect(game.asks).toEqual([]);
    // She is at the gate this moment, and in at the door a walk up the drive later.
    run(game, 1);
    expect(game.world.actors.some((a) => a.id === "sage")).toBe(true);
    until(game, () => outingOf(game, "sage") === undefined, 30);
  });

  it("bring home a party still on its way out of the house, all of it, and anyone still leaving alone", () => {
    const game = gameAt(NINE);
    assign(game, "rose", null);
    sendParty(game, ["sage", "rose"], { to: "forest", doing: "explore" }, USUAL_TERMS);
    // The first of them out at the gate, the other still on the drive.
    until(game, () => game.outings.some((o) => o.state === "away") && game.outings.some((o) => o.state === "leaving"), 60);
    explore(game, "evelyn", "forest");
    runDev(game, "home");
    run(game, 1);
    expect(game.outings.every((o) => o.homeward || o.state !== "away")).toBe(true);
    until(game, () => game.outings.length === 0, 60);
  });

  it("a gift of loaves or pies to a shelf fuller than it holds takes none away", () => {
    const game = gameAt(NINE);
    game.shelf.bread = SHOP_SHELF_HOLDS + 1;
    game.shelf.pie = 1;
    runDev(game, "loaves");
    runDev(game, "pies");
    expect(game.shelf).toEqual({ bread: SHOP_SHELF_HOLDS + 1, pie: 1 });
  });

  it("fill the Master's measure: an invention is ready the next moment he is at work", () => {
    const game = gameAt(NINE);
    runDev(game, "measure");
    expect(game.lab.ready).toBe(false);
    until(game, () => game.lab.ready, 3 * HOUR);
  });

  it("have everyone master bread", () => {
    const game = gameAt(NINE);
    expect(isMaster(game, "sage")).toBe(false);
    runDev(game, "mastery");
    expect(game.household.every((id) => isMaster(game, id))).toBe(true);
  });

  it("a gift of loaves leaves room for a batch already under way", () => {
    const game = gameAt(NINE);
    assign(game, "rose", null);
    until(game, () => game.tasks.evelyn?.job === "bake" && game.tasks.evelyn.has !== null);
    runDev(game, "loaves");
    let most = onShelf(game);
    run(game, 60 * 60, () => (most = Math.max(most, onShelf(game))));
    expect(most).toBeLessThanOrEqual(SHOP_SHELF_HOLDS);
  });

  it("ripening leaves no watering behind: a crop that bears again waits for water after it is picked", () => {
    const game = gameAt(NINE);
    game.garden.known.push("cucumber");
    want(game, 0, 0, "cucumber");
    tend(game, 0, 0, "sow");
    tend(game, 0, 0, "water");
    runDev(game, "ripen");
    expect(tend(game, 0, 0, "harvest")).not.toBeNull();
    const bed = game.garden.plots[0].squares[0];
    const left = daysLeft(bed);
    game.clock += DAY;
    stepGarden(game);
    expect(daysLeft(bed)).toBe(left);
  });

});
