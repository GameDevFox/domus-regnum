import { describe, expect, it } from "vitest";

import type { Ask, Game } from "../game";
import { askLine, namesSay, toldKey } from "./ask-says";

// Why someone out of doors asks what she is to do next, in a line.

/** As much of a game as the words want: which places have been found. */
const game = { places: { manor: "found", town: "found", forest: "found", lake: "unknown" } } as unknown as Game;
const line = (ask: Omit<Ask, "who">): string => askLine(game, { who: "sage", ...ask });

describe("why she asks", () => {
  it("having bought or sold something, says what", () => {
    expect(line({ place: "town", why: "done", did: { doing: "buy", ware: "flour" } })).toBe("Sage has bought flour");
    expect(line({ place: "town", why: "done", did: { doing: "buy", ware: "almanac" } })).toBe("Sage has bought a gardener's almanac");
    expect(line({ place: "town", why: "done", did: { doing: "sell", good: "berries" } })).toBe("Sage has sold berries");
    expect(line({ place: "town", why: "done" })).toBe("Sage is done");
  });

  it("with her basket full, or her time at something up, says so, and what it was", () => {
    expect(askLine(game, { who: "rose", place: "forest", why: "full", did: { doing: "gather" } })).toBe("Rose's basket is full");
    expect(line({ place: "forest", why: "time", did: { doing: "explore" } })).toBe("Sage's time exploring is up");
    expect(line({ place: "forest", why: "time", did: { doing: "gather" } })).toBe("Sage's time gathering is up");
  });

  it("come where she was only told to go, or stopped, says that", () => {
    expect(line({ place: "forest", why: "arrived" })).toBe("Sage has come to the forest");
    expect(line({ place: "town", why: "stopped", did: { doing: "sell", good: "herbs" } })).toBe("Sage has stopped selling herbs");
    expect(line({ place: "forest", why: "stopped", did: { doing: "gather" } })).toBe("Sage has stopped gathering");
  });

  it("having found the place, or something there, names it", () => {
    expect(line({ place: "forest", why: "place" })).toBe("Sage has found the forest");
    expect(line({ place: "forest", why: "found", news: ["berries"] })).toBe("Sage has found berries at the forest");
    expect(line({ place: "forest", why: "found", news: ["way:caves"] })).toBe("Sage has found a way on at the forest");
  });
});

describe("why a party asks", () => {
  it("names them all, in the words for more than one", () => {
    expect(line({ with: ["rose"], place: "town", why: "done", did: { doing: "buy", ware: "flour" } })).toBe("Sage and Rose have bought flour");
    expect(line({ with: ["rose", "evelyn"], place: "forest", why: "full", did: { doing: "gather" } })).toBe("Sage, Rose and Evelyn's baskets are full");
    expect(line({ with: ["rose"], place: "forest", why: "found", news: ["berries"] })).toBe("Sage and Rose have found berries at the forest");
  });

  it("names the Master as he is named inside a sentence, after the first name, and as he is at its head", () => {
    expect(line({ with: ["master"], place: "town", why: "done", did: { doing: "buy", ware: "flour" } })).toBe("Sage and the Master have bought flour");
    expect(askLine(game, { who: "master", with: ["sage"], place: "town", why: "done", did: { doing: "buy", ware: "flour" } })).toBe("The Master and Sage have bought flour");
    // (Inside a sentence, the first is named so too.)
    expect(namesSay(["master", "sage"], true)).toBe("the Master and Sage");
  });
});

describe("why she asks with something still queued", () => {
  it("says what she cannot do", () => {
    expect(line({ place: "forest", why: "stuck", stuck: { next: { to: "town", doing: "buy", ware: "flour" }, why: "coin" } })).toBe("Sage cannot buy flour at the town");
    expect(line({ place: "town", why: "stuck", stuck: { next: { to: "forest", doing: "gather" }, why: "nothing" } })).toBe("Sage cannot gather at the forest");
  });
});

describe("what she can be told", () => {
  it("has a key for the page's checks", () => {
    expect([toldKey("explore"), toldKey({ buy: "flour" }), toldKey({ sell: "herbs" }), toldKey({ go: "lake" })]).toEqual(["explore", "buy:flour", "sell:herbs", "go:lake"]);
  });
});
