import { describe, expect, it } from "vitest";

import { assign } from "./game";
import { errandCost, isAsking, outingOf } from "./outing";
import { explore, gather, send, whyNotSend } from "./outing-send";
import { sendParty, whyNotParty } from "./outing-party";
import { enqueue } from "./outing-queue";
import { atPlace } from "./outing-place";
import { callHome, cancel, tell } from "./outing-tell";
import { FULL, atMost, forestKnown } from "./outing-kit";
import { priceOf } from "./sales";
import { home, until } from "./test-kit";
import { BASKET_HOLDS, ERRAND_SACKS, HOUR } from "./tuning";
import type { Errand, Game, Outing } from "./types";

// Several people sent out together, as one party: one road, one set of clocks, one queue and
// one question; a basket each, a purchase once, and what is done to one done to all.

const PARTY = ["sage", "rose"];
const of = (game: Game, id: string): Outing => outingOf(game, id) as Outing;
const asked = (game: Game, within = 6 * HOUR): void => until(game, () => game.asks.length > 0, within);
const GATHER_FOREST: Errand = { to: "forest", doing: "gather" };
const FLOUR: Errand = { to: "town", doing: "buy", ware: "flour" };
/** The forest known, coin to spend, and nobody keeping the shop, so that the coin changes only by what is bought. */
const ready = (): Game => {
  const game = forestKnown();
  assign(game, "rose", null);
  game.coin = 100;
  return game;
};

describe("sending a party", () => {
  it("sends each of them, on the same road and clocks, each knowing her party", () => {
    const game = ready();
    expect(sendParty(game, PARTY, GATHER_FOREST, atMost(8 * HOUR))).toBe(true);
    expect(of(game, "sage")).toMatchObject({ to: "forest", doing: "gather", party: PARTY });
    expect(of(game, "rose")).toMatchObject({ to: "forest", doing: "gather", party: PARTY, arrive: of(game, "sage").arrive });
  });

  it("is from the house only: someone out already cannot be one of it", () => {
    const game = ready();
    explore(game, "sage", "forest");
    expect(whyNotParty(game, PARTY, GATHER_FOREST, atMost(HOUR))).toBe("out");
    expect(sendParty(game, PARTY, GATHER_FOREST, atMost(HOUR))).toBe(false);
  });

  it("of one, is a sending as it always was", () => {
    const game = ready();
    expect(sendParty(game, ["sage"], GATHER_FOREST, atMost(HOUR))).toBe(true);
    expect(of(game, "sage").party).toBeUndefined();
  });

  it("named twice, she is one of it once: the ware is paid for once, as it is bought", () => {
    const game = ready();
    expect(sendParty(game, ["sage", "sage"], FLOUR, atMost(HOUR))).toBe(true);
    expect(game.coin).toBe(100 - errandCost());
    expect(of(game, "sage").party).toBeUndefined();
    expect(sendParty(game, ["rose", "sage", "rose"], FLOUR, atMost(HOUR))).toBe(false);
    callHome(game, "sage");
    expect(sendParty(game, ["rose", "sage", "rose"], FLOUR, atMost(HOUR))).toBe(true);
    expect(game.coin).toBe(100 - errandCost());
    expect(of(game, "rose").party).toEqual(PARTY.slice().reverse());
  });

  it("sets out when the last of it is out at the gate", () => {
    const game = ready();
    sendParty(game, PARTY, GATHER_FOREST, atMost(HOUR));
    until(game, () => PARTY.every((id) => of(game, id).left !== null), HOUR);
    expect(of(game, "sage").left).toBe(of(game, "rose").left);
  });
});

describe("a party at a place", () => {
  it("gathering: each fills her own basket, and they are done when every basket is full; two bring home twice the lots", () => {
    const game = ready();
    sendParty(game, PARTY, GATHER_FOREST, atMost(8 * HOUR, true));
    until(game, () => PARTY.every((id) => !outingOf(game, id)), 6 * HOUR);
    expect(game.stock).toMatchObject({ berries: 2 * FULL.berries, herbs: 2 * FULL.herbs });
  });

  it("gathering, is not done while one basket has room: she who began with less room waits for the rest", () => {
    const game = ready();
    sendParty(game, PARTY, GATHER_FOREST, atMost(8 * HOUR));
    const half = { herbs: BASKET_HOLDS / 2 };
    Object.assign(of(game, "rose"), { basket: { ...half }, kept: { ...half } });
    asked(game);
    expect(of(game, "sage").basket).toEqual(FULL);
  });

  it("asks once, for all of it, and is answered for all by an answer to any of it", () => {
    const game = ready();
    sendParty(game, PARTY, GATHER_FOREST, atMost(8 * HOUR));
    asked(game);
    expect(game.asks).toEqual([{ who: "sage", with: ["rose"], place: "forest", why: "full", did: { doing: "gather" } }]);
    expect(PARTY.every((id) => isAsking(game, id))).toBe(true);
    expect(tell(game, "rose", "stay")).toBe(true);
    expect(game.asks).toEqual([]);
    expect(PARTY.every((id) => of(game, id).waits)).toBe(true);
    expect(of(game, "rose").basket).toEqual(FULL);
  });

  it("buys a ware once, for the party: paid once, and the first of it has it", () => {
    const game = ready();
    sendParty(game, PARTY, FLOUR, atMost(HOUR));
    expect(game.coin).toBe(100 - errandCost());
    asked(game);
    expect(game.asks[0]).toMatchObject({ who: "sage", with: ["rose"], why: "done" });
    expect(of(game, "sage").bought).toEqual({ flour: ERRAND_SACKS });
    expect(of(game, "rose").bought).toEqual({});
  });

  it("called home before the ware is bought, has its price back once", () => {
    const game = ready();
    sendParty(game, PARTY, FLOUR, atMost(HOUR));
    callHome(game, "rose");
    expect(game.coin).toBe(100);
  });

  it("is not at the place until every one of it is out at the gate", () => {
    const game = ready();
    sendParty(game, PARTY, GATHER_FOREST, atMost(8 * HOUR));
    until(game, () => PARTY.every((id) => of(game, id).state === "away"), HOUR);
    of(game, "rose").state = "leaving";
    game.clock = of(game, "sage").arrive + HOUR;
    atPlace(game, of(game, "sage"));
    expect(of(game, "sage").spent).toBe(0);
    of(game, "rose").state = "away";
    atPlace(game, of(game, "sage"));
    expect(of(game, "sage").spent).toBeGreaterThan(0);
  });

  it("sells all the party carries of the goods: sent from the house, each takes a basketful", () => {
    const game = ready();
    game.stock.herbs = 2 * BASKET_HOLDS;
    sendParty(game, PARTY, { to: "town", doing: "sell", good: "herbs" }, atMost(HOUR, true));
    expect(game.stock.herbs).toBe(0);
    const coin = game.coin;
    until(game, () => PARTY.every((id) => !outingOf(game, id)), 4 * HOUR);
    expect(game.coin).toBe(coin + 2 * BASKET_HOLDS * priceOf("herbs"));
  });

  it("waiting in town, sells what any one of it carries", () => {
    const game = ready();
    sendParty(game, PARTY, { to: "town", doing: null }, atMost(HOUR));
    asked(game);
    tell(game, "sage", "stay");
    of(game, "sage").basket = { herbs: 3 };
    expect(tell(game, "rose", { sell: "herbs" })).toBe(true);
    asked(game);
    expect(of(game, "sage").purse).toBe(3 * priceOf("herbs"));
  });
});

describe("what is done to one of a party", () => {
  it("is done to all of it: calling her home, cancelling, re-sending and queuing", () => {
    const game = ready();
    sendParty(game, PARTY, GATHER_FOREST, atMost(8 * HOUR));
    until(game, () => game.clock >= of(game, "sage").arrive + 15, 3 * HOUR);
    expect(enqueue(game, "rose", FLOUR, atMost(HOUR))).toBe(true);
    expect(of(game, "sage").queue).toEqual([FLOUR]);
    expect(cancel(game, "rose")).toBe(true);
    expect(PARTY.map((id) => of(game, id).to)).toEqual(["town", "town"]);
    expect(gather(game, "sage", "forest", atMost(HOUR))).toBe(true);
    expect(PARTY.map((id) => of(game, id).doing)).toEqual(["gather", "gather"]);
    expect(callHome(game, "sage")).toBe(true);
    expect(PARTY.every((id) => of(game, id).homeward)).toBe(true);
    home(game, "sage", 2 * HOUR);
    home(game, "rose", HOUR);
  });
});

describe("re-sending a party", () => {
  it("on its way to buy, to buy something else: the price coming back is counted, whichever of it is pressed, and the card's faces agree", () => {
    const game = ready();
    game.shops.push("clothes");
    const GLOVES: Errand = { to: "town", doing: "buy", ware: "gloves" };
    // Flour is twelve, gloves twenty: after the flour, eight, and the twelve to come back.
    game.coin = 20;
    sendParty(game, ["rose", "sage"], FLOUR, atMost(8 * HOUR));
    until(game, () => of(game, "rose").state === "away", HOUR);
    const plan = { to: "town" as const, terms: atMost(8 * HOUR) };
    expect(whyNotSend(game, "rose", "buy", plan, "gloves")).toBeNull();
    expect(whyNotSend(game, "sage", "buy", plan, "gloves")).toBeNull();
    expect(send(game, "sage", GLOVES, atMost(8 * HOUR))).toBe(true);
    expect(game.coin).toBe(0);
    expect(PARTY.map((id) => of(game, id).buys)).toEqual(["gloves", "gloves"]);
  });

  it("a face on the card is as the party is: one with a full basket can be sent to gather with one who has room", () => {
    const game = ready();
    sendParty(game, PARTY, { to: "forest", doing: null }, atMost(8 * HOUR));
    asked(game);
    tell(game, "sage", "stay");
    of(game, "rose").basket = { berries: BASKET_HOLDS };
    const plan = { to: "forest" as const, terms: atMost(8 * HOUR) };
    expect(whyNotSend(game, "rose", "gather", plan)).toBeNull();
    expect(gather(game, "rose", "forest", atMost(8 * HOUR))).toBe(true);
  });
});

describe("leaving a party", () => {
  it("in at the door before the rest, she is of it no longer: sent out alone, her outing is her own, and what is done to the others is not done to her", () => {
    const game = ready();
    // (The flour bought, Sage, who paid, carries it through to its shelf; Rose has nothing to carry, and is in first.)
    sendParty(game, PARTY, FLOUR, atMost(8 * HOUR, true));
    until(game, () => outingOf(game, "rose") === undefined, 4 * HOUR);
    expect(of(game, "sage").state).toBe("returning");
    expect(of(game, "sage").party).toBeUndefined();
    expect(explore(game, "rose", "forest", atMost(2 * HOUR))).toBe(true);
    // Sage, still carrying the flour in, is given a job: she alone is called home for it.
    assign(game, "sage", "bake");
    expect(of(game, "rose")).toMatchObject({ to: "forest", doing: "explore", homeward: false });
    expect(of(game, "rose").party).toBeUndefined();
  });

  it("called home before she has set off for the door, she stays in, and the rest are a party without her", () => {
    const game = ready();
    sendParty(game, ["sage", "rose", "evelyn"], GATHER_FOREST, atMost(8 * HOUR));
    // (Sage and Evelyn have set off for the door; Rose has not, as when she has loaves to carry through first.)
    of(game, "sage").setOff = true;
    of(game, "evelyn").setOff = true;
    expect(callHome(game, "sage")).toBe(true);
    expect(outingOf(game, "rose")).toBeUndefined();
    expect(of(game, "sage").party).toEqual(["sage", "evelyn"]);
    expect(of(game, "evelyn").party).toEqual(["sage", "evelyn"]);
    // Sent out alone again, Rose is not called home with them.
    expect(explore(game, "rose", "forest", atMost(2 * HOUR))).toBe(true);
    callHome(game, "evelyn");
    expect(of(game, "rose")).toMatchObject({ doing: "explore", homeward: false });
  });

  it("the one who paid staying in as the party is called home, the price is back once, not again from the next of it", () => {
    const game = ready();
    sendParty(game, ["rose", "sage"], FLOUR, atMost(HOUR));
    expect(game.coin).toBe(100 - errandCost());
    of(game, "sage").setOff = true;
    expect(callHome(game, "sage")).toBe(true);
    expect(outingOf(game, "rose")).toBeUndefined();
    expect(game.coin).toBe(100);
    expect(of(game, "sage").buys).toBeNull();
  });

  it("refused for one coming in, calling home changes nothing", () => {
    const game = ready();
    sendParty(game, PARTY, FLOUR, atMost(8 * HOUR, true));
    until(game, () => of(game, "sage").state === "coming", 4 * HOUR);
    const coin = game.coin;
    expect(callHome(game, "rose")).toBe(false);
    expect(game.coin).toBe(coin);
  });
});
