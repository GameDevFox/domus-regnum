import { describe, expect, it } from "vitest";

import { isNight } from "./clock";
import { HOME, PLACE_IDS, THING_IDS } from "./country";
import { assign } from "./game";
import { outingOf } from "./outing";
import { explore, goTo } from "./outing-send";
import { queueReturn } from "./outing-queue";
import { cancel, choicesFor, tell, whyNotTell } from "./outing-tell";
import type { Told } from "./outing-tell";
import { stepsOf } from "./outing-steps";
import { atMost } from "./outing-kit";
import { quiet, run, until } from "./test-kit";
import { HOUR, WAKE } from "./tuning";
import type { Game, Outing } from "./types";
import { WARE_IDS } from "./wares";

// What she is told stands as it says: told to stay, she stays, and her steps say no more; the
// walk home asked for while she waits is taken at once; nothing is asked at night, cancelled or
// not; and she can be told only what she is offered.

const sage = (game: Game): Outing => outingOf(game, "sage") as Outing;
const asked = (game: Game, within = 6 * HOUR): void => until(game, () => game.asks.length > 0, within);
const EVENING = 20 * HOUR;

describe("told to stay", () => {
  it("she waits, and the return asked for before is no longer to come, nor shown", () => {
    const game = quiet();
    explore(game, "sage", "forest", atMost(HOUR, true));
    asked(game);
    expect(game.asks[0]).toMatchObject({ why: "place" });
    expect(tell(game, "sage", "stay")).toBe(true);
    expect(sage(game).queue).toEqual([]);
    expect(stepsOf(game, "sage").map((step) => step.is)).toEqual(["walk", "wait"]);
  });

  it("the walk home asked for while she waits, with nothing else to do first, is taken at once", () => {
    const game = quiet();
    goTo(game, "sage", "town", atMost(HOUR));
    asked(game);
    tell(game, "sage", "stay");
    expect(queueReturn(game, "sage", true)).toBe(true);
    expect(sage(game).homeward).toBe(true);
  });
});

describe("at night", () => {
  it("cancelled, she asks nothing until the house wakes, and the night goes on", () => {
    const game = quiet();
    assign(game, "rose", null);
    game.clock = EVENING;
    explore(game, "sage", "town", atMost(8 * HOUR));
    until(game, () => isNight(game.clock), 4 * HOUR);
    expect(cancel(game, "sage")).toBe(true);
    const { clock } = game;
    run(game, 1);
    expect(game.asks).toEqual([]);
    expect(game.clock).toBeGreaterThan(clock);
    until(game, () => game.asks.length > 0, 2 * HOUR);
    expect(isNight(game.clock)).toBe(false);
    expect(game.clock % (24 * HOUR)).toBeGreaterThanOrEqual(WAKE);
    expect(game.asks[0]).toMatchObject({ who: "sage", why: "stopped" });
  });
});

describe("what she can be told", () => {
  /** Everything there is to be told, offered anywhere or not. */
  const everything: Told[] = ["explore", "gather", "home", "stay", "on", ...WARE_IDS.map((buy) => ({ buy })), ...THING_IDS.map((sell) => ({ sell })), ...PLACE_IDS.map((go) => ({ go }))];

  it("is only what she is offered, at every place, asking or waiting", () => {
    for (const place of PLACE_IDS.filter((id) => id !== HOME)) {
      for (const waiting of [false, true]) {
        const game = quiet();
        game.coin = 1000;
        for (const id of PLACE_IDS) game.places[id] = "found";
        goTo(game, "sage", place, atMost(HOUR));
        asked(game);
        if (waiting) tell(game, "sage", "stay");
        const offered = choicesFor(game, "sage").filter((choice) => choice.why === null).map((choice) => JSON.stringify(choice.told));
        for (const told of everything) expect(whyNotTell(game, "sage", told) === null, `${JSON.stringify(told)} at ${place}${waiting ? ", waiting" : ""}`).toBe(offered.includes(JSON.stringify(told)));
      }
    }
  });
});
