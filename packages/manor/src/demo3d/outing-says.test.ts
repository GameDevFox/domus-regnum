import { describe, expect, it } from "vitest";

import type { Game } from "../game";
import { saleSays, statusSays, statusShort } from "./outing-says";

// What someone on an outing is at, in a few signs and in words.

/** As much of a game as the words want: which places have been found. */
const game = { places: { manor: "found", town: "found", forest: "found", lake: "unknown" } } as unknown as Game;

describe("in a few signs", () => {
  it("on the way, is which way she is bound and how many minutes off: a part of a minute is a minute", () => {
    expect(statusShort({ is: "walking", to: "forest", minutes: 23 })).toBe("🚶 23 min");
    expect(statusShort({ is: "walking", to: "forest", minutes: 22.2 })).toBe("🚶 23 min");
    expect(statusShort({ is: "walking", to: "manor", minutes: 5 })).toBe("🏠 5 min");
    // Sums of minutes come out a hair long, and she is never nothing off.
    expect(statusShort({ is: "walking", to: "manor", minutes: 20 + 1e-9 })).toBe("🏠 20 min");
    expect(statusShort({ is: "walking", to: "manor", minutes: 0 })).toBe("🏠 1 min");
  });

  it("gathering, is what she has and how many of each: an empty basket, until the first lot is picked", () => {
    expect(statusShort({ is: "gathering", at: "forest", picked: [{ thing: "berries", lots: 7 }], load: 7, holds: 12 })).toBe("🫐 ×7");
    expect(statusShort({ is: "gathering", at: "forest", picked: [{ thing: "berries", lots: 7 }, { thing: "herbs", lots: 2 }], load: 9, holds: 12 })).toBe("🫐 ×7 🌿 ×2");
    expect(statusShort({ is: "gathering", at: "forest", picked: [], load: 0, holds: 12 })).toBe("🧺 ×0");
  });

  it("exploring, buying and asking each have their own", () => {
    // Exploring, the compass alone: how far on she is is said on the place's card, not under her.
    expect(statusShort({ is: "exploring", at: "forest" })).toBe("🧭");
    expect(statusShort({ is: "buying", at: "town", ware: "flour", load: 4, minutes: 12 })).toBe("🌾 ×4");
    expect(statusShort({ is: "asking", at: "forest" })).toBe("❓");
  });

  it("is nothing while she is in the house", () => {
    expect(statusShort({ is: "leaving" })).toBe("");
    expect(statusShort({ is: "returning" })).toBe("");
  });
});

describe("in words", () => {
  it("on the way, names where she is bound and how far off it is", () => {
    expect(statusSays(game, { is: "walking", to: "forest", minutes: 22.2 })).toBe("on the way to the forest, 23 minutes off");
    expect(statusSays(game, { is: "walking", to: "manor", minutes: 1 })).toBe("on the way to the manor, 1 minute off");
  });

  it("bound somewhere with nothing chosen to do there, says she will ask there; and waiting at a place, says where", () => {
    expect(statusSays(game, { is: "walking", to: "forest", minutes: 5, idle: true })).toBe("on the way to the forest, 5 minutes off, with nothing chosen to do there: she asks when she is there");
    expect(statusSays(game, { is: "waiting", at: "forest" })).toBe("waiting at the forest");
    expect(statusShort({ is: "waiting", at: "forest" })).toBe("✋");
  });

  it("does not name a place nobody has been to", () => {
    expect(statusSays(game, { is: "walking", to: "lake", minutes: 10 })).toBe("on the way to a place not yet visited, 10 minutes off");
    expect(statusSays(game, { is: "asking", at: "forest" })).toBe("at the forest, asking what she is to do");
  });

  it("at a place, says what she is doing there and how far on she is", () => {
    expect(statusSays(game, { is: "gathering", at: "forest", picked: [{ thing: "berries", lots: 7 }, { thing: "herbs", lots: 1 }], load: 8, holds: 12 })).toBe("at the forest, gathering: 7 lots of berries, 1 lot of herbs; 8 of the 12 her basket holds");
    expect(statusSays(game, { is: "gathering", at: "forest", picked: [], load: 0, holds: 12 })).toBe("at the forest, gathering: nothing yet");
    expect(statusSays(game, { is: "exploring", at: "forest" })).toBe("at the forest, exploring");
    expect(statusSays(game, { is: "buying", at: "town", ware: "flour", load: 4, minutes: 11.5 })).toBe("at the town, buying flour: 4 sacks, and 12 minutes more");
  });

  it("selling, counts what the garden bears one by one and what is gathered in lots", () => {
    expect(statusSays(game, { is: "selling", at: "town", good: "berries", load: 12, minutes: 5 })).toBe("at the town, selling 12 lots of berries, and 5 minutes more there");
    expect(statusSays(game, { is: "selling", at: "town", good: "potato", load: 3, minutes: 5 })).toBe("at the town, selling 3 potatoes, and 5 minutes more there");
  });

  it("what a sale would fetch, on the town's card, counts them the same way", () => {
    expect(saleSays(12, "berries")).toBe("12 lots of berries, at 3 coin each: 36 coin, when she is home");
    expect(saleSays(3, "potato")).toMatch(/^3 potatoes, at \d+ coin each: \d+ coin, when she is home$/);
  });
});
