import { describe, expect, it } from "vitest";

import {
  enumerate,
  isFinite_,
  type NotatedPattern,
  parsePattern,
  type PatternNode,
  serializePattern,
  WILDCARD,
} from "./pattern-notation";

const p = (nodes: PatternNode[]): NotatedPattern => ({ id: "p", intent: "x", nodes });
const fixed = (symbol: string): PatternNode => ({ kind: "fixed", symbol });

// stringify each sequence for order-insensitive set comparison
const set = (seqs: string[][]) => new Set(seqs.map((s) => s.join("-")));

describe("enumerate — fixed", () => {
  it("a fixed sequence has exactly one valid combination", () => {
    expect(enumerate(p([fixed("A"), fixed("B"), fixed("C")]))).toEqual([["A", "B", "C"]]);
  });
});

describe("enumerate — anyOf (the A then any-of-B/C/D example)", () => {
  it("expands to one combination per alternative", () => {
    const got = enumerate(p([fixed("A"), { kind: "anyOf", symbols: ["B", "C", "D"] }]));
    expect(set(got)).toEqual(set([["A", "B"], ["A", "C"], ["A", "D"]]));
  });
});

describe("enumerate — optional", () => {
  it("yields both with and without the optional slot", () => {
    const got = enumerate(p([fixed("A"), { kind: "optional", nodes: [fixed("B")] }, fixed("C")]));
    expect(set(got)).toEqual(set([["A", "C"], ["A", "B", "C"]]));
  });
});

describe("enumerate — anyOrder", () => {
  it("yields every permutation of the members", () => {
    const got = enumerate(p([{ kind: "anyOrder", nodes: [fixed("A"), fixed("B"), fixed("C")] }]));
    expect(set(got)).toEqual(
      set([
        ["A", "B", "C"],
        ["A", "C", "B"],
        ["B", "A", "C"],
        ["B", "C", "A"],
        ["C", "A", "B"],
        ["C", "B", "A"],
      ]),
    );
  });

  it("composes with a fixed prefix (clear = spoon then {saucer,table} any order)", () => {
    const got = enumerate(
      p([fixed("spoon"), { kind: "anyOrder", nodes: [fixed("saucer"), fixed("table")] }]),
    );
    expect(set(got)).toEqual(set([["spoon", "saucer", "table"], ["spoon", "table", "saucer"]]));
  });
});

describe("enumerate — wildcard", () => {
  it("emits the wildcard sentinel in its slot", () => {
    expect(enumerate(p([fixed("A"), { kind: "wildcard" }]))).toEqual([["A", WILDCARD]]);
  });
});

describe("enumerate — repeat (bounded min..max)", () => {
  it("a 0..3 range includes the empty case up to the max", () => {
    const got = enumerate(p([{ kind: "repeat", nodes: [fixed("A")], min: 0, max: 3 }]));
    expect(set(got)).toEqual(set([[], ["A"], ["A", "A"], ["A", "A", "A"]]));
  });
  it("a 1..3 range excludes the empty case", () => {
    const got = enumerate(p([{ kind: "repeat", nodes: [fixed("A")], min: 1, max: 3 }]));
    expect(set(got)).toEqual(set([["A"], ["A", "A"], ["A", "A", "A"]]));
  });
  it("min===max is an exact count", () => {
    const got = enumerate(p([{ kind: "repeat", nodes: [fixed("A")], min: 3, max: 3 }]));
    expect(set(got)).toEqual(set([["A", "A", "A"]]));
  });
});

describe("isFinite_", () => {
  it("is always true now that repeat is bounded", () => {
    expect(isFinite_(p([fixed("A"), { kind: "anyOf", symbols: ["B", "C"] }]))).toBe(true);
    expect(isFinite_(p([{ kind: "repeat", nodes: [fixed("A")], min: 0, max: 3 }]))).toBe(true);
  });
});

describe("parsePattern / serializePattern", () => {
  it("parses each element kind", () => {
    const r = parsePattern('["🥄", {"anyOrder":["☕","🟫"]}]');
    expect(r.ok).toBe(true);
    if (r.ok) expect(set(enumerate(r.pattern))).toEqual(set([["🥄","☕","🟫"],["🥄","🟫","☕"]]));
  });

  it("handles any / optional / wildcard / repeat / anchors", () => {
    expect((parsePattern('["🥄",{"any":["☕","🟫"]}]') as any).ok).toBe(true);
    expect((parsePattern('["🥄",{"optional":"☕"},"🟫"]') as any).ok).toBe(true);
    expect((parsePattern('["🥄",{"wildcard":true}]') as any).ok).toBe(true);
    expect((parsePattern('["🥄",{"repeat":"☕","min":1}]') as any).ok).toBe(true);
    const anchored = parsePattern('["^","🥄","$"]');
    expect(anchored.ok).toBe(true);
    if (anchored.ok) {
      expect(anchored.pattern.startAnchored).toBe(true);
      expect(anchored.pattern.endAnchored).toBe(true);
    }
  });

  it("flags invalid input", () => {
    expect(parsePattern("not json").ok).toBe(false);
    expect(parsePattern('{"a":1}').ok).toBe(false); // not an array
    expect(parsePattern("[]").ok).toBe(false); // empty
    expect(parsePattern('[{"bogus":1}]').ok).toBe(false); // unknown element
    expect(parsePattern('[{"any":[]}]').ok).toBe(false); // empty any
    expect(parsePattern('[{"repeat":"☕","min":2,"max":1}]').ok).toBe(false); // max < min
    expect(parsePattern('[{"repeat":"☕","max":0}]').ok).toBe(false); // max < 1
  });

  it("round-trips serialize → parse", () => {
    const r1 = parsePattern('["🥄",{"anyOrder":["☕","🟫"]},{"optional":"🟫"}]');
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      const json = serializePattern(r1.pattern);
      const r2 = parsePattern(json);
      expect(r2.ok).toBe(true);
      if (r2.ok) expect(set(enumerate(r2.pattern))).toEqual(set(enumerate(r1.pattern)));
    }
  });
});
