import { describe, expect, it } from "vitest";

import { flourOnItsWay, orderCost, orderFlour } from "./flour";
import { gameAt } from "./test-kit";

// Ordering flour, at the edges: exactly the coin for it, and not an order for no sacks.

describe("the flour on its way", () => {
  it("is all that is paid for and not yet on the pantry shelf: what the carter is carrying in counts, and what he has set down does not", () => {
    const game = gameAt();
    const delivery = (id: string, sacks: number, state: "coming" | "carrying" | "leaving") => ({ id, sacks, ordered: game.clock, due: game.clock, state });
    game.deliveries.push(delivery("a", 2, "coming"), delivery("b", 3, "carrying"), delivery("c", 5, "leaving"));
    expect(flourOnItsWay(game)).toBe(5);
  });
});

describe("an order of flour", () => {
  it("is taken when the house has exactly the coin for the sacks and the cart", () => {
    const game = gameAt();
    game.coin = orderCost(2);
    expect(orderFlour(game, 2)).toBe(true);
    expect(game.coin).toBe(0);
    expect(game.deliveries).toHaveLength(1);
  });

  it("is not taken a coin short, and costs nothing", () => {
    const game = gameAt();
    game.coin = orderCost(2) - 1;
    expect(orderFlour(game, 2)).toBe(false);
    expect(game.coin).toBe(orderCost(2) - 1);
    expect(game.deliveries).toHaveLength(0);
  });

  it("is not made for no sacks, however much coin there is, for the cart is not sent empty", () => {
    const game = gameAt();
    game.coin = 1000;
    expect(orderFlour(game, 0)).toBe(false);
    expect(game.coin).toBe(1000);
    expect(game.deliveries).toHaveLength(0);
  });
});
