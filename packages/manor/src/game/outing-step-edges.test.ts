import { describe, expect, it } from "vitest";

import { isIdle } from "../space";
import { outingOf } from "./outing";
import { atMost, forestKnown } from "./outing-kit";
import { explore } from "./outing-send";
import { stepOuting } from "./outing-step";
import { person, until } from "./test-kit";
import { DRIVE_MINUTES, HOUR } from "./tuning";
import type { Game, Outing } from "./types";

// An outing minute by minute (outing-step.ts), at the moments where it changes hands: she is
// seen on the drive a walk before she is due at the door, comes in with what she has, and what
// she has is carried to its shelf or is the house's at once. The outing is a real one, sent from
// the house; it is stopped at the moment wanted and altered to make that moment plain.

const NO_STAND_DOWN = (): void => undefined;

/** Sage sent to the forest and home again; run until she is at the front door again, idle, with nothing yet done of what she brings in. */
const atTheDoor = (): { game: Game; outing: Outing } => {
  const game = forestKnown();
  explore(game, "sage", "forest", atMost(10, true));
  const outing = outingOf(game, "sage") as Outing;
  const actor = person(game, "sage");
  until(game, () => outing.state === "coming" && isIdle(actor), 4 * HOUR);
  return { game, outing };
};

/** Sage sent to the forest, out at the gate and on the road: nothing yet decided about when she is seen on the drive. */
const onTheRoad = (): { game: Game; outing: Outing } => {
  const game = forestKnown();
  explore(game, "sage", "forest", atMost(10, true));
  const outing = outingOf(game, "sage") as Outing;
  until(game, () => outing.state === "away" && outing.gone !== null, 4 * HOUR);
  // Due at the place a long way off, so that nothing is done there while this is looked at.
  outing.arrive = game.clock + 10 * HOUR;
  return { game, outing };
};

describe("coming in at the door", () => {
  it("has her read a book once for each she bought, and the books are gone from her hands", () => {
    const { game, outing } = atTheDoor();
    outing.bought = { almanac: 2 };
    stepOuting(game, outing, NO_STAND_DOWN);
    expect(game.garden.known.length).toBe(3);
    expect(outing.bought.almanac).toBeUndefined();
  });

  it("makes what she gathered the house's at once where there is no shelf for it, and she is done", () => {
    const { game, outing } = atTheDoor();
    delete game.world.plan.stores.berries;
    outing.basket = { berries: 2 };
    outing.purse = 0;
    const before = game.stock.berries;
    stepOuting(game, outing, NO_STAND_DOWN);
    expect(game.stock.berries).toBe(before + 2);
    expect(game.outings).not.toContain(outing);
  });

  it("carries what the garden bears to the pantry's spare shelf, and it is the house's when it is set down", () => {
    const { game, outing } = atTheDoor();
    outing.basket = { carrot: 2 };
    outing.purse = 0;
    stepOuting(game, outing, NO_STAND_DOWN);
    expect(outing.state).toBe("returning");
    expect(game.stock.carrot).toBe(0);
    expect(game.outings).toContain(outing);
  });

  it("is the house's coin that she carried, and none is left in her purse", () => {
    const { game, outing } = atTheDoor();
    outing.purse = 12;
    const before = game.coin;
    stepOuting(game, outing, NO_STAND_DOWN);
    expect(game.coin).toBe(before + 12);
    expect(outing.purse).toBe(0);
  });
});

describe("being seen on the drive again", () => {
  it("is when the clock is a walk up the drive from the door, to the minute, and her figure is on the property again", () => {
    const { game, outing } = onTheRoad();
    outing.homeward = true;
    outing.back = game.clock + DRIVE_MINUTES + 1;
    stepOuting(game, outing, NO_STAND_DOWN);
    expect(outing.state).toBe("away");
    outing.back = game.clock + DRIVE_MINUTES;
    stepOuting(game, outing, NO_STAND_DOWN);
    expect(outing.state).toBe("coming");
    expect(outing.gone).toBeNull();
  });

  it("is not while she has not turned for home, however late the clock is", () => {
    const { game, outing } = onTheRoad();
    outing.homeward = false;
    outing.back = game.clock - 5;
    stepOuting(game, outing, NO_STAND_DOWN);
    expect(outing.state).toBe("away");
    expect(outing.gone).not.toBeNull();
  });

  it("is not a place to be found at when she is bound for home: she is not made to arrive at the house", () => {
    const { game, outing } = onTheRoad();
    outing.to = "manor";
    outing.arrive = game.clock;
    outing.homeward = true;
    outing.back = game.clock + 5 * HOUR;
    const feats = game.feats.length;
    stepOuting(game, outing, NO_STAND_DOWN);
    expect(game.feats.length).toBe(feats);
    expect(game.asks).toEqual([]);
  });
});
