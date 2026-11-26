import { describe, expect, it } from "vitest";

import { confidentIntent, type CuePattern, foldCues, pushCue, readCues, streamIntent } from "./cues";
import { CUE_SEQUENCES } from "./data";

const PATTERNS: CuePattern[] = [
  { id: "refill", intent: "refill", sequences: [["spoon", "saucer"]] },
  {
    id: "clear",
    intent: "clear",
    sequences: [
      ["spoon", "saucer", "table"],
      ["spoon", "table", "saucer"],
    ],
  },
];

describe("readCues", () => {
  it("an empty buffer is extendable, not broken", () => {
    expect(readCues([], PATTERNS)).toEqual({ completed: [], extendable: true, broken: false });
  });

  it("a partial prefix waits (extendable, no completion)", () => {
    const r = readCues(["spoon"], PATTERNS);
    expect(r.completed).toEqual([]);
    expect(r.extendable).toBe(true);
    expect(r.broken).toBe(false);
  });

  it("spoon→saucer completes refill BUT is still extendable (the timing tension)", () => {
    const r = readCues(["spoon", "saucer"], PATTERNS);
    expect(r.completed.map((p) => p.intent)).toEqual(["refill"]);
    expect(r.extendable).toBe(true); // a trailing "table" would make it a clear
    expect(confidentIntent(r)).toBeNull(); // so you must WAIT — acting now risks misreading a clear
  });

  it("spoon→saucer→table completes clear, unambiguously", () => {
    const r = readCues(["spoon", "saucer", "table"], PATTERNS);
    expect(r.completed.map((p) => p.intent)).toEqual(["clear"]);
    expect(r.extendable).toBe(false);
    expect(confidentIntent(r)).toBe("clear");
  });

  it("the order-variant spoon→table→saucer also completes clear", () => {
    const r = readCues(["spoon", "table", "saucer"], PATTERNS);
    expect(confidentIntent(r)).toBe("clear");
  });

  it("spoon→table is an incomplete prefix of the clear variant (wait)", () => {
    const r = readCues(["spoon", "table"], PATTERNS);
    expect(r.completed).toEqual([]);
    expect(r.extendable).toBe(true);
    expect(r.broken).toBe(false);
  });

  it("an off-pattern symbol breaks the chain", () => {
    expect(readCues(["spoon", "dog"], PATTERNS).broken).toBe(true);
    expect(readCues(["cup"], PATTERNS).broken).toBe(true); // unknown opener
  });
});

describe("confidentIntent — only fires when safe", () => {
  it("null while still extendable, even if a pattern is complete", () => {
    expect(confidentIntent(readCues(["spoon", "saucer"], PATTERNS))).toBeNull();
  });
  it("a refill becomes confident if no clear pattern could extend it", () => {
    const refillOnly: CuePattern[] = [{ id: "r", intent: "refill", sequences: [["spoon", "saucer"]] }];
    expect(confidentIntent(readCues(["spoon", "saucer"], refillOnly))).toBe("refill");
  });
});

describe("pushCue — streams symbols, resets on a broken chain", () => {
  it("builds a valid chain step by step", () => {
    let buf: string[] = [];
    ({ buffer: buf } = pushCue(buf, "spoon", PATTERNS));
    expect(buf).toEqual(["spoon"]);
    const step = pushCue(buf, "saucer", PATTERNS);
    expect(step.buffer).toEqual(["spoon", "saucer"]);
    expect(step.read.completed.map((p) => p.intent)).toEqual(["refill"]);
  });

  it("an interrupt restarts the buffer from the new symbol", () => {
    // spoon, then an interrupting "dog" → chain breaks → buffer restarts at... "dog" opens nothing,
    // so the fresh read is broken too, but the buffer is reset to just the latest symbol.
    const afterDog = pushCue(["spoon"], "dog", PATTERNS);
    expect(afterDog.buffer).toEqual(["dog"]);
    expect(afterDog.read.broken).toBe(true);
    // a fresh "spoon" after that opens a new request cleanly
    const afterSpoon = pushCue(afterDog.buffer, "spoon", PATTERNS);
    expect(afterSpoon.buffer).toEqual(["spoon"]);
    expect(afterSpoon.read.broken).toBe(false);
  });
});

describe("foldCues / streamIntent — resolve a whole stream (chain-resets included)", () => {
  it("folds a clean stream to its buffer and intent", () => {
    expect(foldCues(["spoon", "saucer"], PATTERNS)).toEqual(["spoon", "saucer"]);
    expect(streamIntent(["spoon", "saucer"], PATTERNS)).toBe("refill");
    expect(streamIntent(["spoon", "saucer", "table"], PATTERNS)).toBe("clear");
    expect(streamIntent(["spoon", "table", "saucer"], PATTERNS)).toBe("clear");
  });

  it("a mid-stream interrupt resets, then the real request resolves", () => {
    expect(foldCues(["spoon", "dog", "spoon", "saucer"], PATTERNS)).toEqual(["spoon", "saucer"]);
    expect(streamIntent(["spoon", "dog", "spoon", "saucer"], PATTERNS)).toBe("refill");
  });
});

describe("CUE_SEQUENCES — derived from the notation legend", () => {
  it("enumerates to exactly the sequences the stream used to hard-code", () => {
    expect(CUE_SEQUENCES).toEqual([
      { intent: "refill", symbols: ["spoon", "saucer"] },
      { intent: "clear", symbols: ["spoon", "saucer", "table"] },
      { intent: "clear", symbols: ["spoon", "table", "saucer"] },
    ]);
  });
});
