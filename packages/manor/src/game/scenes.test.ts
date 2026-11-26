import { describe, expect, it } from "vitest";

import { advance, choose } from "../cutscene";
import { createGame, stepGame } from "./game";
import { SCENES } from "./scenes";
import { DAY, HOUR, OCCASION_AFTER_DAYS } from "./tuning";
import type { Game } from "./types";

// The scenes the game plays: when the first caller comes, what stands still while he is there,
// and what the house has chosen when he has gone.

const HZ = 60;
const run = (game: Game, seconds: number): void => {
  for (let i = 0; i < seconds * HZ; i++) stepGame(game, 1 / HZ);
};
const until = (game: Game, so: () => boolean, within = 180): void => {
  for (let i = 0; i < within * HZ; i++) {
    if (so()) return;
    stepGame(game, 1 / HZ);
  }
  throw new Error("it never happened");
};
/** The second morning, a little before ten. */
const secondMorning = (): Game => {
  const game = createGame();
  game.clock = DAY + 10 * HOUR - 2;
  return game;
};
const priest = (game: Game) => game.world.actors.find((a) => a.id === "priest");
/** Pass lines until the scene waits for something else, or is over. */
const hear = (game: Game): string[] => {
  const said: string[] = [];
  for (let n = 0; n < 40 && game.scene; n++) {
    until(game, () => !game.scene || game.scene.waiting?.for === "advance" || game.scene.waiting?.for === "choice");
    if (game.scene?.waiting?.for !== "advance") break;
    said.push(`${game.scene.line?.who ?? "-"}: ${game.scene.line?.text ?? ""}`);
    advance(game.scene);
  }
  return said;
};

describe("the first caller", () => {
  it("does not come on the first day, however late it gets", () => {
    const game = createGame();
    game.clock = 20 * HOUR;
    run(game, 30);
    expect(game.scene).toBeNull();
    expect(game.seen).toEqual([]);
  });

  it("comes on the second morning at ten: he is at the gate, out of doors, and the scene has the house", () => {
    const game = secondMorning();
    run(game, 1);
    expect(game.scene).toBeNull();
    until(game, () => game.scene !== null, 5);
    run(game, 0.1);
    expect(game.seen).toEqual(["first-caller"]);
    expect(priest(game)).toMatchObject({ name: "The young priest", sprite: "townsman" });
    // South of the front door, which is the house's southernmost wall: in the garden.
    expect(priest(game)?.walker.pos.z).toBeGreaterThan(20);
    expect(game.scene?.focus).toBe("priest");
  });

  it("holds the clock and the house's own doings while it plays, and only the people in it move", () => {
    const game = secondMorning();
    until(game, () => game.scene !== null, 5);
    const { clock, sold, flour } = game;
    const loaves = game.shelf.bread;
    const gate = priest(game)?.walker.pos.z ?? 0;
    run(game, 4);
    expect(game.clock).toBe(clock);
    expect([game.sold, game.shelf.bread, game.flour]).toEqual([sold, loaves, flour]);
    expect(priest(game)?.walker.pos.z).toBeLessThan(gate - 3);
  });

  it("brings him up the drive to the steps and the Master to the door, and then they speak", () => {
    const game = secondMorning();
    until(game, () => game.scene?.line != null, 120);
    expect(priest(game)?.walker.pos.z).toBeCloseTo(12.9, 1);
    const master = game.world.actors.find((a) => a.id === "master");
    const door = game.world.spots.get("hall.door");
    expect(master?.walker.pos.x).toBeCloseTo(door?.x ?? 0, 1);
    expect(master?.walker.pos.z).toBeCloseTo(door?.z ?? 0, 1);
    expect(game.scene?.line?.who).toBe("priest");
    expect(game.scene?.sides).toEqual({ left: null, right: "priest" });
  });

  it("asks which occasion the house will take on, remembers the answer, sees him off, and lets time go on", () => {
    for (const [n, goal] of [[0, "tea"], [1, "squire"]] as const) {
      const game = secondMorning();
      until(game, () => game.scene !== null, 5);
      const before = hear(game);
      expect(before.length).toBeGreaterThan(3);
      expect(game.scene?.waiting).toMatchObject({ for: "choice" });
      expect(game.goal).toBeNull();
      expect(game.occasionDay).toBeNull();
      if (!game.scene) throw new Error("the scene is over before it asked");
      expect(choose(game.scene, n)).toBe(true);
      const after = hear(game);
      expect(after.length).toBeGreaterThan(1);
      until(game, () => game.scene === null, 60);
      expect(game.goal).toBe(goal);
      // It is to be held a week from the day he called: the second day, so the ninth.
      expect(game.occasionDay).toBe(2 + OCCASION_AFTER_DAYS);
      expect(priest(game)).toBeUndefined();
      const { clock } = game;
      run(game, 2);
      expect(game.clock).toBeCloseTo(clock + 2, 3);
    }
  });

  it("comes once", () => {
    const game = secondMorning();
    until(game, () => game.scene !== null, 5);
    hear(game);
    if (game.scene) choose(game.scene, 0);
    hear(game);
    until(game, () => game.scene === null, 60);
    run(game, 30);
    expect(game.scene).toBeNull();
    expect(game.seen).toEqual(["first-caller"]);
  });

  it("does not finish what the Master was at behind his back: it waits for him, as he left it", () => {
    const game = secondMorning();
    game.posts.master = "bake";
    until(game, () => game.tasks.master !== undefined, 5);
    until(game, () => game.scene !== null, 10);
    const task = structuredClone(game.tasks.master);
    const { flour } = game;
    run(game, 20);
    expect(game.scene).not.toBeNull();
    expect([game.tasks.master, game.flour]).toEqual([task, flour]);
  });
});

describe("the scenes there are", () => {
  it("each has a name of its own", () => {
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(SCENES.length);
  });
});
