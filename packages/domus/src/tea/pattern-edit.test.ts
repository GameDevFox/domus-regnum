import { describe, expect, it } from "vitest";

import {
  addInto,
  addTop,
  canMove,
  canUnwrap,
  canWrap,
  deleteAt,
  eAlt,
  eAny,
  eFixed,
  getAt,
  insertAfter,
  moveAt,
  canShift,
  parentKind,
  type Path,
  shiftAt,
  toAstList,
  toEList,
  unwrapAt,
  wrapAt,
} from "./pattern-edit";
import { enumerate, type PatternNode, WILDCARD } from "./pattern-notation";

const fixed = (s: string): PatternNode => ({ kind: "fixed", symbol: s });
const setOf = (nodes: PatternNode[]) => new Set(enumerate({ id: "x", intent: "x", nodes }).map((s) => s.join("-")));

describe("toE / toAst round-trip (incl. deep nesting)", () => {
  it("preserves optional ▸ repeat ▸ any", () => {
    const nodes: PatternNode[] = [
      fixed("🥄"),
      {
        kind: "optional",
        nodes: [{ kind: "repeat", nodes: [{ kind: "anyOf", symbols: ["☕", "🟫"] }], min: 1, max: 2 }],
      },
    ];
    expect(toAstList(toEList(nodes))).toEqual(nodes);
  });
});

describe("deleteAt", () => {
  it("removes a top-level element", () => {
    const body = toEList([fixed("🥄"), fixed("☕"), fixed("🟫")]);
    expect(toAstList(deleteAt(body, [1]))).toEqual([fixed("🥄"), fixed("🟫")]);
  });

  it("removes one alternative inside an any (group survives)", () => {
    const body = toEList([fixed("🥄"), { kind: "anyOf", symbols: ["☕", "🟫"] }]);
    const after = toAstList(deleteAt(body, [1, 0])); // delete the ☕ alternative
    expect(after).toEqual([fixed("🥄"), { kind: "anyOf", symbols: ["🟫"] }]);
  });

  it("prunes an emptied group entirely", () => {
    const body = toEList([fixed("🥄"), { kind: "anyOf", symbols: ["☕"] }]);
    expect(toAstList(deleteAt(body, [1, 0]))).toEqual([fixed("🥄")]); // any → empty → dropped
  });

  it("prunes an optional whose only child is deleted", () => {
    const body = toEList([{ kind: "optional", nodes: [fixed("☕")] }]);
    expect(deleteAt(body, [0, 0])).toEqual([]); // child gone → optional dropped
  });
});

describe("moveAt / canMove", () => {
  const body = toEList([fixed("🥄"), fixed("☕"), fixed("🟫")]);
  it("swaps with the right neighbour", () => {
    expect(toAstList(moveAt(body, [0], 1))).toEqual([fixed("☕"), fixed("🥄"), fixed("🟫")]);
  });
  it("is a no-op past the edge", () => {
    expect(toAstList(moveAt(body, [0], -1))).toEqual([fixed("🥄"), fixed("☕"), fixed("🟫")]);
    expect(canMove(body, [0], -1)).toBe(false);
    expect(canMove(body, [0], 1)).toBe(true);
    expect(canMove(body, [2], 1)).toBe(false);
  });
});

describe("addInto / addTop", () => {
  it("appends a member into an anyOrder", () => {
    const body = toEList([{ kind: "anyOrder", nodes: [fixed("☕"), fixed("🟫")] }]);
    const after = toAstList(addInto(body, [0], eFixed("🥄")));
    expect(setOf(after)).toEqual(setOf([{ kind: "anyOrder", nodes: [fixed("☕"), fixed("🟫"), fixed("🥄")] }]));
  });
  it("appends an alternative into an any", () => {
    const body = toEList([{ kind: "anyOf", symbols: ["☕"] }]);
    expect(toAstList(addInto(body, [0], eAlt("🟫")))).toEqual([{ kind: "anyOf", symbols: ["☕", "🟫"] }]);
  });
  it("addTop appends at the end of the sequence (new group defaults to a wildcard)", () => {
    expect(toAstList(addTop(toEList([fixed("🥄")]), eAny()))).toEqual([
      fixed("🥄"),
      { kind: "anyOf", symbols: [WILDCARD] },
    ]);
  });
});

describe("wrapAt — builds nesting", () => {
  it("wraps a node in repeat then optional", () => {
    let body = toEList([{ kind: "anyOf", symbols: ["☕", "🟫"] }]);
    body = wrapAt(body, [0], "repeat");
    body = wrapAt(body, [0], "optional");
    expect(toAstList(body)).toEqual([
      { kind: "optional", nodes: [{ kind: "repeat", nodes: [{ kind: "anyOf", symbols: ["☕", "🟫"] }], min: 1, max: 2 }] },
    ]);
  });

  it("wraps an emote in anyOrder, and a plain emote in anyOf", () => {
    expect(toAstList(wrapAt(toEList([fixed("🥄")]), [0], "anyOrder"))).toEqual([
      { kind: "anyOrder", nodes: [fixed("🥄")] },
    ]);
    expect(toAstList(wrapAt(toEList([fixed("🥄")]), [0], "anyOf"))).toEqual([{ kind: "anyOf", symbols: ["🥄"] }]);
  });

  it("canWrap: anyOf only wraps a plain emote; an alt can't be wrapped", () => {
    const body = toEList([fixed("🥄"), { kind: "anyOf", symbols: ["☕", "🟫"] }]);
    expect(canWrap(body, [0], "anyOf")).toBe(true); // fixed emote
    expect(canWrap(body, [1], "anyOf")).toBe(false); // the anyOf group itself
    expect(canWrap(body, [1, 0], "optional")).toBe(false); // an alt
    expect(canWrap(body, [1], "optional")).toBe(true);
  });
});

describe("getAt", () => {
  it("addresses nested nodes by path", () => {
    const body = toEList([fixed("🥄"), { kind: "anyOrder", nodes: [fixed("☕"), fixed("🟫")] }]);
    expect(getAt(body, [1, 1])?.sym).toBe("🟫");
    expect(getAt(body, [9] as Path)).toBeNull();
  });
});

describe("insertAfter / parentKind", () => {
  it("inserts a sibling to the right of a top-level element", () => {
    const body = toEList([fixed("🥄"), fixed("🟫")]);
    expect(toAstList(insertAfter(body, [0], eFixed("☕")))).toEqual([fixed("🥄"), fixed("☕"), fixed("🟫")]);
  });

  it("inserts a sibling inside a nested group", () => {
    const body = toEList([{ kind: "anyOrder", nodes: [fixed("☕"), fixed("🟫")] }]);
    const after = toAstList(insertAfter(body, [0, 0], eFixed("🥄"))); // after ☕ inside the group
    expect(setOf(after)).toEqual(setOf([{ kind: "anyOrder", nodes: [fixed("☕"), fixed("🥄"), fixed("🟫")] }]));
  });

  it("reports the containing list's kind", () => {
    const body = toEList([fixed("🥄"), { kind: "anyOf", symbols: ["☕", "🟫"] }]);
    expect(parentKind(body, [0])).toBe("root");
    expect(parentKind(body, [1, 0])).toBe("anyOf");
  });
});

describe("unwrapAt / canUnwrap", () => {
  it("lifts an optional's child up", () => {
    const body = toEList([fixed("🥄"), { kind: "optional", nodes: [fixed("☕")] }]);
    expect(toAstList(unwrapAt(body, [1]))).toEqual([fixed("🥄"), fixed("☕")]);
  });

  it("lifts an anyOrder's members up into the sequence", () => {
    const body = toEList([{ kind: "anyOrder", nodes: [fixed("☕"), fixed("🟫")] }]);
    expect(toAstList(unwrapAt(body, [0]))).toEqual([fixed("☕"), fixed("🟫")]);
  });

  it("turns an anyOf's alternatives into plain emotes", () => {
    const body = toEList([{ kind: "anyOf", symbols: ["☕", "🟫"] }]);
    expect(toAstList(unwrapAt(body, [0]))).toEqual([fixed("☕"), fixed("🟫")]);
  });

  it("unwraps a nested group, keeping the outer wrapper", () => {
    const body = toEList([
      fixed("🥄"),
      { kind: "optional", nodes: [{ kind: "repeat", nodes: [{ kind: "anyOf", symbols: ["☕", "🟫"] }], min: 1, max: 2 }] },
    ]);
    // unwrap the repeat (at [1,0]) → optional now wraps the anyOf directly
    expect(toAstList(unwrapAt(body, [1, 0]))).toEqual([
      fixed("🥄"),
      { kind: "optional", nodes: [{ kind: "anyOf", symbols: ["☕", "🟫"] }] },
    ]);
  });

  it("canUnwrap: only groups, and never inside an anyOf; sequence parents absorb any number", () => {
    const body = toEList([fixed("🥄"), { kind: "anyOrder", nodes: [fixed("☕"), fixed("🟫")] }]);
    expect(canUnwrap(body, [0])).toBe(false); // a leaf
    expect(canUnwrap(body, [1])).toBe(true); // anyOrder at root
    // an optional now holds a sequence, so unwrapping a multi-member group into it is fine
    const nested = toEList([{ kind: "optional", nodes: [{ kind: "anyOrder", nodes: [fixed("☕"), fixed("🟫")] }] }]);
    expect(canUnwrap(nested, [0, 0])).toBe(true);
    expect(toAstList(unwrapAt(nested, [0, 0]))).toEqual([{ kind: "optional", nodes: [fixed("☕"), fixed("🟫")] }]);
  });
});

describe("adding into a repeat/optional (ordered sequence, regex `(…)×n`)", () => {
  it("selecting the wildcard inside a repeat and adding lands the emote INSIDE, to its right", () => {
    // the reported scenario: repeat spawns with a single wildcard; adding an emote should extend the
    // sequence inside the repeat, not escape to the right of it
    const body = toEList([{ kind: "repeat", nodes: [{ kind: "wildcard" }], min: 1, max: 2 }]);
    const after = insertAfter(body, [0, 0], eFixed("☕")); // after the wildcard, inside the repeat
    expect(toAstList(after)).toEqual([{ kind: "repeat", nodes: [{ kind: "wildcard" }, fixed("☕")], min: 1, max: 2 }]);
  });

  it("addInto appends to a repeat's sequence and the whole thing stays self-consistent", () => {
    const body = toEList([{ kind: "repeat", nodes: [fixed("☕")], min: 2, max: 2 }]);
    const after = addInto(body, [0], eFixed("🟫"));
    expect(toAstList(after)).toEqual([{ kind: "repeat", nodes: [fixed("☕"), fixed("🟫")], min: 2, max: 2 }]);
    expect(after).toEqual(toEList(toAstList(after))); // no hidden/dropped structure
  });

  it("enumerate expands a repeated two-emote sequence as ABAB", () => {
    const p = { id: "x", intent: "x", nodes: [{ kind: "repeat" as const, nodes: [fixed("A"), fixed("B")], min: 2, max: 2 }] };
    expect(enumerate(p)).toEqual([["A", "B", "A", "B"]]);
  });
});

describe("shiftAt / canShift — one-column shift through structure", () => {
  const ao = (...syms: string[]) => ({ kind: "anyOrder" as const, nodes: syms.map(fixed) });

  it("swaps with an adjacent leaf", () => {
    const body = toEList([fixed("A"), fixed("B"), fixed("C")]);
    const r = shiftAt(body, [1], 1);
    expect(toAstList(r.body)).toEqual([fixed("A"), fixed("C"), fixed("B")]);
    expect(r.path).toEqual([2]);
    expect(getAt(r.body, r.path)?.sym).toBe("B"); // returned path tracks the moved element
  });

  it("descends into a container on the right, becoming its FIRST child", () => {
    const body = toEList([fixed("A"), ao("B", "C")]);
    const r = shiftAt(body, [0], 1);
    expect(toAstList(r.body)).toEqual([ao("A", "B", "C")]);
    expect(r.path).toEqual([0, 0]);
    expect(getAt(r.body, r.path)?.sym).toBe("A");
  });

  it("descends into a container on the left, becoming its LAST child", () => {
    const body = toEList([ao("B", "C"), fixed("A")]);
    const r = shiftAt(body, [1], -1);
    expect(toAstList(r.body)).toEqual([ao("B", "C", "A")]);
    expect(r.path).toEqual([0, 2]);
    expect(getAt(r.body, r.path)?.sym).toBe("A");
  });

  it("pops out of the container's right end to sit just after it", () => {
    const body = toEList([ao("B", "A"), fixed("C")]); // A is last inside the anyOrder
    const r = shiftAt(body, [0, 1], 1);
    expect(toAstList(r.body)).toEqual([ao("B"), fixed("A"), fixed("C")]);
    expect(getAt(r.body, r.path)?.sym).toBe("A");
  });

  it("pops out of the left end to sit just before it", () => {
    const body = toEList([fixed("C"), ao("A", "B")]); // A is first inside the anyOrder
    const r = shiftAt(body, [1, 0], -1);
    expect(toAstList(r.body)).toEqual([fixed("C"), fixed("A"), ao("B")]);
    expect(getAt(r.body, r.path)?.sym).toBe("A");
  });

  it("drops an emptied container when its sole child pops out", () => {
    const body = toEList([{ kind: "optional", nodes: [fixed("A")] }, fixed("B")]);
    const r = shiftAt(body, [0, 0], 1); // A is the only child of the optional
    expect(toAstList(r.body)).toEqual([fixed("A"), fixed("B")]); // optional gone
    expect(r.path).toEqual([0]);
  });

  it("treats an anyOf as one opaque slot (swaps past, does not descend)", () => {
    const body = toEList([fixed("A"), { kind: "anyOf", symbols: ["X", "Y"] }]);
    const r = shiftAt(body, [0], 1);
    expect(toAstList(r.body)).toEqual([{ kind: "anyOf", symbols: ["X", "Y"] }, fixed("A")]);
    expect(r.path).toEqual([1]);
  });

  it("an alt swaps within its anyOf but can't leave it", () => {
    const body = toEList([{ kind: "anyOf", symbols: ["X", "Y"] }]);
    const r = shiftAt(body, [0, 0], 1); // swap the two alternatives
    expect(toAstList(r.body)).toEqual([{ kind: "anyOf", symbols: ["Y", "X"] }]);
    expect(canShift(body, [0, 1], 1)).toBe(false); // last alt at the anyOf edge → no pop-out
  });

  it("is a no-op at the root edge", () => {
    const body = toEList([fixed("A"), fixed("B")]);
    expect(canShift(body, [1], 1)).toBe(false);
    expect(shiftAt(body, [1], 1).body).toEqual(body);
  });

  it("round trip: descend then pop back restores the original", () => {
    const body = toEList([fixed("A"), ao("B", "C"), fixed("D")]);
    const right = shiftAt(body, [0], 1); // A descends into the anyOrder (first child)
    const back = shiftAt(right.body, right.path, -1); // A pops back out to the left
    expect(toAstList(back.body)).toEqual(toAstList(body));
  });
});
