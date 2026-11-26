import { describe, expect, it } from "vitest";

import { createGame } from "../game/game";
import { shopFacts } from "./work-card";

// The shop's card: what its shelf shows, and when.

const SEED = 1;
const PIE = "🥧";
const BREAD = "🍞";
const PIES_ON_THE_SHELF = 2;

describe("the shop's shelf, on its card", () => {
  it("shows bread from the first, and the pie not at all before the recipe is known", () => {
    const facts = shopFacts(createGame(undefined, SEED));
    expect(facts.some((fact) => fact.says.startsWith(BREAD))).toBe(true);
    expect(facts.some((fact) => fact.says.startsWith(PIE))).toBe(false);
    expect(facts.some((fact) => fact.title.includes("Berry pie"))).toBe(false);
  });

  it("shows the pie, with its price, once the recipe is known", () => {
    const game = createGame(undefined, SEED);
    game.recipes.push("pie");
    const pie = shopFacts(game).find((fact) => fact.says.startsWith(PIE));
    expect(pie?.title).toMatch(/^Berry pie on the shelf: 0, at \d+ coin each$/);
  });

  it("shows the pie when there is one on the shelf, however it came there", () => {
    const game = createGame(undefined, SEED);
    game.shelf.pie = PIES_ON_THE_SHELF;
    expect(shopFacts(game).some((fact) => fact.says === `${PIE} ${PIES_ON_THE_SHELF}`)).toBe(true);
  });
});
