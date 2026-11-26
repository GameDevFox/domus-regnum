import { describe, expect, it } from "vitest";

import { outingOf } from "./outing";
import { sendToTown } from "./outing-send";
import { statsOf } from "./person";
import { gameAt } from "./test-kit";

// What someone is carrying, at the edges: the basket of someone who has not yet left the house.

describe("what someone going out is carrying", () => {
  it("is not what is in her basket until she is out of doors on her way: while she is still leaving she is carrying what she has in her arms", () => {
    const game = gameAt();
    sendToTown(game, "sage");
    const outing = outingOf(game, "sage");
    if (!outing) throw new Error("she was not sent");
    expect(outing.state).toBe("leaving");
    outing.basket.berries = 3;
    expect(statsOf(game, "sage").carrying.some((c) => c.goods === "berries")).toBe(false);
    outing.state = "away";
    expect(statsOf(game, "sage").carrying).toContainEqual({ goods: "berries", count: 3 });
  });
});
