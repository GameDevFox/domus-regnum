import { describe, expect, it } from "vitest";

import { householdKeys, listed } from "./person-keys";

// The keys that follow the household.

describe("the household's keys", () => {
  it("are 1, 2 and 3 for the maids, in the order of the list, and the backtick for the Master", () => {
    expect(householdKeys(["evelyn", "rose", "sage", "master"])).toEqual(["1", "2", "3", "`"]);
  });

  it("number the rest from 1 wherever the Master stands in the list", () => {
    expect(householdKeys(["master", "evelyn", "rose"])).toEqual(["`", "1", "2"]);
  });
});

// The order the household is listed in on the page.

describe("the household as it is listed", () => {
  it("has the Master at the head, and the rest in the order the game has them", () => {
    expect(listed(["evelyn", "rose", "sage", "master"])).toEqual(["master", "evelyn", "rose", "sage"]);
  });

  it("is the game's own order for a household without him", () => {
    expect(listed(["evelyn", "rose"])).toEqual(["evelyn", "rose"]);
  });

  it("so reads down the list as the keys read along the keyboard: the backtick, then 1, 2, 3", () => {
    expect(householdKeys(listed(["evelyn", "rose", "sage", "master"]))).toEqual(["`", "1", "2", "3"]);
  });
});
