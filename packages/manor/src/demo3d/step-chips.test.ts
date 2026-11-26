import { describe, expect, it } from "vitest";

import { HOME_NEXT, enqueue, gather, outingOf, sendToTown } from "../game";
import type { Game } from "../game";
import { atMost, forestKnown } from "../game/outing-kit";
import { HOUR } from "../game/tuning";
import { quiet, until } from "../game/test-kit";
import { pressStep, stepChips } from "./step-chips";

// Someone's steps as chips: what each says, how far on it is, and what pressing it does.

const shape = (game: Game, id = "sage"): string[] => stepChips(game, id).map((chip) => `${chip.is}:${chip.state}:${chip.press ?? "-"}${chip.lit === undefined ? "" : chip.lit ? ":lit" : ":unlit"}`);
const there = (game: Game): void => until(game, () => game.clock >= (outingOf(game, "sage")?.arrive ?? Infinity), 3 * HOUR);

describe("her steps", () => {
  it("are nothing for someone in the house", () => {
    expect(stepChips(quiet(), "sage")).toEqual([]);
  });

  it("sent with nothing asked of the return: the walk under way, what she is to do to come, and the walk home unlit, to be asked for", () => {
    const game = forestKnown();
    gather(game, "sage", "forest", atMost(30));
    expect(shape(game)).toEqual(["walk:now:-", "do:next:cancel", "home:next:queue:unlit"]);
    const [walk, todo, home] = stepChips(game, "sage");
    expect(walk.says).toBe("Walk to the forest: under way");
    expect(todo).toMatchObject({ glyph: "🧺", says: "Gather at the forest: to come. Press to cancel it: she goes on there, and asks what next when she is there" });
    expect(home.says).toBe("Home when it is done: not asked for, so she asks what next. Press to have her come home when it is done, without asking");
  });

  it("the walk home, pressed, is asked for and lit; pressed again, it is not", () => {
    const game = forestKnown();
    gather(game, "sage", "forest", atMost(30));
    expect(pressStep(game, "sage", "queue")).toBe(true);
    expect(outingOf(game, "sage")?.queue).toEqual([HOME_NEXT]);
    expect(shape(game)).toEqual(["walk:now:-", "do:next:cancel", "home:next:unqueue:lit"]);
    expect(pressStep(game, "sage", "unqueue")).toBe(true);
    expect(outingOf(game, "sage")?.queue).toEqual([]);
    expect(shape(game).at(-1)).toBe("home:next:queue:unlit");
  });

  it("what she is doing, pressed, is cancelled: she stops and asks, and the walk home then brings her home now", () => {
    const game = forestKnown();
    gather(game, "sage", "forest", atMost(8 * HOUR));
    there(game);
    expect(shape(game)).toEqual(["walk:done:-", "do:now:cancel", "home:next:queue:unlit"]);
    expect(pressStep(game, "sage", "cancel")).toBe(true);
    expect(game.asks).toMatchObject([{ who: "sage", why: "stopped" }]);
    expect(shape(game)).toEqual(["walk:done:-", "ask:now:-", "home:next:home:unlit"]);
    expect(pressStep(game, "sage", "home")).toBe(true);
    expect(game.asks).toEqual([]);
    expect(shape(game)).toEqual(["walk:done:-", "home:now:-:lit"]);
  });

  it("buying says what, by its own picture", () => {
    const game = quiet();
    game.coin = 100;
    sendToTown(game, "sage");
    expect(stepChips(game, "sage")[1]).toMatchObject({ is: "do", glyph: "🌾", says: "Buy flour: to come. Press to cancel it: she goes on there, and asks what next when she is there" });
  });

  it("what is queued follows, in order, each pressable to take it out, with its place where it is another than the step's before", () => {
    const game = forestKnown();
    game.coin = 100;
    gather(game, "sage", "forest", atMost(30, true));
    enqueue(game, "sage", { to: "forest", doing: "explore" }, atMost(30));
    enqueue(game, "sage", { to: "town", doing: "buy", ware: "flour" }, atMost(30));
    expect(shape(game)).toEqual(["walk:now:-", "do:next:cancel", "then:next:drop", "then:next:drop", "home:next:unqueue:lit"]);
    const [, todo, explore, flour] = stepChips(game, "sage");
    expect(todo.says).toBe("Gather at the forest: to come. Press to cancel it: she goes on to what is queued after it");
    expect(explore).toMatchObject({ glyph: "🧭", index: 0, says: "Then: Explore the forest. Press to take it out" });
    expect(explore.place).toBeUndefined();
    expect(flour).toMatchObject({ glyph: "🌾", index: 1, place: "town", says: "Then: Buy flour at the town. Press to take it out" });
    expect(pressStep(game, "sage", "drop", 0)).toBe(true);
    expect(stepChips(game, "sage")[2]).toMatchObject({ index: 0, place: "town" });
  });
});
