import { describe, expect, it } from "vitest";

import { answerSays, askKey } from "./map-ask";

// The question someone out of doors asks is put up as a card once, and put up afresh for another
// question: by who asks, where, and what she has found there.

describe("the question a card puts", () => {
  it("is nobody's when nobody asks", () => {
    expect(askKey(undefined)).toBe("");
  });

  it("is the same question for the same asking", () => {
    expect(askKey({ who: "sage", place: "forest", why: "found", news: ["thing:berries"] })).toBe(askKey({ who: "sage", place: "forest", why: "found", news: ["thing:berries"] }));
  });

  it("is another question when she asks again at the same place, having found something else: the card is put up afresh", () => {
    const found = askKey({ who: "sage", place: "forest", why: "place" });
    const berries = askKey({ who: "sage", place: "forest", why: "found", news: ["thing:berries"] });
    const herbs = askKey({ who: "sage", place: "forest", why: "found", news: ["thing:herbs"] });
    expect(new Set([found, berries, herbs]).size).toBe(3);
  });

  it("is another question when someone else asks, or at another place", () => {
    expect(askKey({ who: "rose", place: "forest", why: "place" })).not.toBe(askKey({ who: "sage", place: "forest", why: "place" }));
    expect(askKey({ who: "sage", place: "town", why: "place" })).not.toBe(askKey({ who: "sage", place: "forest", why: "place" }));
  });
});

describe("an answer's name", () => {
  it("says why it cannot be done, if it says anything; with no reason in words, its name ends with no dangling full stop", () => {
    expect(answerSays("Come home", null, "sage")).toBe("Come home");
    expect(answerSays("Come home", "nobody", "sage")).toBe("Come home");
    expect(answerSays("Go on with what is queued", "night", "sage")).toBe("Go on with what is queued. Nobody is sent out at night");
    expect(answerSays("Go on with what is queued", "late", "master")).toBe("Go on with what is queued. He could not be there and home again before bed");
  });
});
