import { describe, expect, it } from "vitest";

import { USUAL_TERMS, enqueue, goTo, isAsking, outingOf, queueReturn, tell } from "../game";
import { quiet, until } from "../game/test-kit";
import { heldFor, stillWaiting } from "./stay-hold";

// Told to stay, time stands until she is given something to do, or the card it is given from is put away.

/** Sage in town, asking what next, having been sent only to go there. */
const askingInTown = () => {
  const game = quiet();
  expect(goTo(game, "sage", "town")).toBe(true);
  until(game, () => isAsking(game, "sage"), 600);
  return game;
};

describe("time held for someone told to stay", () => {
  it("is not held for someone at home, on her way, or still asking", () => {
    const game = quiet();
    expect(stillWaiting(game, "sage")).toBe(false);
    const asking = askingInTown();
    expect(stillWaiting(asking, "sage")).toBe(false);
  });

  it("is held once she is told to stay, while a card is up to give her something from", () => {
    const game = askingInTown();
    expect(tell(game, "sage", "stay")).toBe(true);
    expect(stillWaiting(game, "sage")).toBe(true);
    expect(heldFor(game, "sage", true)).toBe(true);
  });

  it("is let go when the card is put away, and is nobody's when nobody was told to stay", () => {
    const game = askingInTown();
    tell(game, "sage", "stay");
    expect(heldFor(game, "sage", false)).toBe(false);
    expect(heldFor(game, null, true)).toBe(false);
  });

  it("is let go when she is called home", () => {
    const game = askingInTown();
    tell(game, "sage", "stay");
    expect(tell(game, "sage", "home")).toBe(true);
    expect(heldFor(game, "sage", true)).toBe(false);
  });

  it("is let go when she is given something to do there, or something is queued for her", () => {
    const sent = askingInTown();
    tell(sent, "sage", "stay");
    expect(tell(sent, "sage", "explore")).toBe(true);
    expect(outingOf(sent, "sage")?.doing).toBe("explore");
    expect(heldFor(sent, "sage", true)).toBe(false);

    const queued = askingInTown();
    tell(queued, "sage", "stay");
    expect(enqueue(queued, "sage", { to: "town", doing: "explore" }, USUAL_TERMS)).toBe(true);
    expect(heldFor(queued, "sage", true)).toBe(false);
  });

  it("is let go when the walk home is asked for: with nothing else to do first, she turns for home", () => {
    const game = askingInTown();
    tell(game, "sage", "stay");
    expect(queueReturn(game, "sage", true)).toBe(true);
    expect(heldFor(game, "sage", true)).toBe(false);
  });
});
