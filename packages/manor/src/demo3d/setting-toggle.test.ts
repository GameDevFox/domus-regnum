import { describe, expect, it } from "vitest";

import { Scope } from "@scene-lib/scope";
import { Value } from "@scene-lib/value";

import { keepChanges } from "./setting-toggle";

// A choice among the settings is kept for the next visit when it is changed, and only then: the
// way a page is opened in (`?rooms=all`, say) is not a choice, and is not kept.

describe("keepChanges", () => {
  it("keeps nothing for the way the page opened in", () => {
    const kept: boolean[] = [];
    keepChanges(Scope(), Value(false), (on) => kept.push(on));
    expect(kept).toEqual([]);
  });

  it("keeps each change, as it is made", () => {
    const kept: boolean[] = [];
    const on = Value(false);
    keepChanges(Scope(), on, (now) => kept.push(now));
    on.set(true);
    on.set(false);
    expect(kept).toEqual([true, false]);
  });
});
