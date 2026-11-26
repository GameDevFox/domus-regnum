import { describe, expect, it } from "vitest";

import { CURIO_IDS } from "./curios";
import { intelBook } from "./intel";
import type { IntelEntry } from "./intel";
import { outingOf } from "./outing";
import { sendToTown } from "./outing-send";
import { gameAt } from "./test-kit";
import { SHOP_IDS } from "./wares";
import { walkMinutes } from "./country";
import type { Game } from "./types";

// What the house knows, at the edges of what is shown: the house itself, the town with a shop left to find, one thing found, and what is on its way home.

const entry = (game: Game, kind: IntelEntry["kind"], id: string): IntelEntry => {
  const found = intelBook(game).find((e) => e.kind === kind && e.id === id);
  if (!found) throw new Error(`no such entry: ${kind} ${id}`);
  return found;
};

/** A game with the tablet found by someone not yet home with it: it is in her basket, and not in the house. */
const tabletOnItsWay = (): Game => {
  const game = gameAt();
  sendToTown(game, "sage");
  const outing = outingOf(game, "sage");
  if (!outing) throw new Error("she was not sent");
  outing.found.push("tablet");
  return game;
};

describe("the page of places", () => {
  it("calls the house home, and says how far off the town is", () => {
    const game = gameAt();
    expect(entry(game, "place", "manor").says[0]).toBe("Home");
    expect(entry(game, "place", "town").says[0]).toBe(`${walkMinutes("town")} minutes' walk from the house`);
  });

  it("says there is more to the town while a shop in it is not found, and not once every one is", () => {
    const game = gameAt();
    game.shops = SHOP_IDS.slice(1);
    expect(entry(game, "place", "town").says).toContain("Not all of it has been looked into");
    game.shops = [...SHOP_IDS];
    expect(entry(game, "place", "town").says).not.toContain("Not all of it has been looked into");
  });

  it("says what is gathered at a place, if it is only the one thing", () => {
    const game = gameAt();
    game.places.forest = "found";
    game.finds.forest = ["berries"];
    expect(entry(game, "place", "forest").says).toContain("Berries can be gathered here");
  });
});

describe("the page of recipes", () => {
  it("has bread before the berry pie", () => {
    const recipes = intelBook(gameAt()).filter((e) => e.kind === "recipe");
    expect(recipes.map((e) => e.id)).toEqual(["bread", "pie"]);
  });
});

describe("what was come upon and is not yet home", () => {
  it("is known of from the moment it is found, and is said to be on its way", () => {
    const game = tabletOnItsWay();
    expect(CURIO_IDS).toContain("tablet");
    expect(entry(game, "thing", "tablet")).toMatchObject({ known: true, hidden: true });
    expect(entry(game, "thing", "tablet").says).toContain("It is on its way home");
  });
});
