import { describe, expect, it } from "vitest";

import { type EmitEvent, freshStream, respondStream, type Stream, type StreamConfig, tickStream } from "./cue-stream";

// Deterministic config: rng values are dequeued in call order (emitOne consumes up to three —
// inject?, pattern-vs-decoy?, which pattern / which noise glyph).
const cfg = (rngValues: number[], over: Partial<StreamConfig> = {}): StreamConfig => {
  const q = [...rngValues];
  return {
    windowMs: 1000,
    decoyLingerMs: 400,
    gapMs: 300,
    forceAfter: 3,
    injectChance: 0.3,
    patternChance: 0.7,
    sequences: [
      { intent: "refill", symbols: ["spoon", "saucer"] },
      { intent: "clear", symbols: ["spoon", "saucer", "table"] },
    ],
    noisePoolSize: 10,
    rng: () => (q.length ? q.shift()! : 0.99), // default: never inject, first noise glyph bucket
    ...over,
  };
};

const EMIT = 100; // one emote per tick in these tests
const tick = (s: Stream, c: StreamConfig) => tickStream(s, 100, EMIT, c);

describe("cue-stream — emission", () => {
  it("emits noise while the rng stays above injectChance", () => {
    const s = freshStream(EMIT);
    const c = cfg([0.9, 0.5, 0.9, 0.5]); // inject? no (0.9) … noise glyph 5 … again
    expect(tick(s, c)).toEqual({ emitted: { kind: "noise", index: 5 }, missed: false });
    expect(s.idleEmits).toBe(1);
    expect(tick(s, c).emitted).toEqual({ kind: "noise", index: 5 });
  });

  it("injects a pattern when the rng bites, then delivers it symbol-per-beat", () => {
    const s = freshStream(EMIT);
    const c = cfg([0.1, 0.1, 0]); // inject? yes; pattern? yes; pick sequences[0] (refill)
    expect(tick(s, c).emitted).toEqual({ kind: "symbol", symbol: "spoon" });
    expect(s.active).toMatchObject({ intent: "refill", injected: true, emitted: 1, completeAtMs: null });
    expect(tick(s, c).emitted).toEqual({ kind: "symbol", symbol: "saucer" });
    expect(s.active).toMatchObject({ emitted: 2, completeAtMs: s.clock });
  });

  it("forces an injection after forceAfter idle emotes even when the rng never bites", () => {
    const s = freshStream(EMIT);
    const c = cfg([], { forceAfter: 3, rng: undefined as never }); // build then override rng below
    const values = [0.9, 0.5, 0.9, 0.5, 0.9, 0.5, /* 4th beat: forced */ 0.1, 0];
    const q = [...values];
    c.rng = () => (q.length ? q.shift()! : 0.99);
    for (let i = 0; i < 3; i++) expect(tick(s, c).emitted?.kind).toBe("noise");
    expect(s.idleEmits).toBe(3);
    expect(tick(s, c).emitted).toEqual({ kind: "symbol", symbol: "spoon" }); // forced despite rng
    expect(s.idleEmits).toBe(0);
  });

  it("injects a decoy when the pattern roll fails; it expires safely with no miss", () => {
    const s = freshStream(EMIT);
    const c = cfg([0.1, 0.9]); // inject? yes; pattern? no → decoy
    expect(tick(s, c).emitted).toEqual({ kind: "symbol", symbol: "spoon" });
    expect(s.active).toMatchObject({ intent: null, injected: false, completeAtMs: s.clock });
    // linger past decoyLingerMs: never a miss, quietly retired
    for (let i = 0; i < 5; i++) expect(tick(s, c).missed).toBe(false);
    expect(s.active).toBeNull();
  });
});

describe("cue-stream — misses and the breather", () => {
  it("an unanswered pattern misses exactly once when its window closes, then a gap blocks injection", () => {
    const s = freshStream(EMIT);
    const c = cfg([0.1, 0.1, 0]); // refill (2 symbols)
    tick(s, c); // spoon
    tick(s, c); // saucer → complete
    // Window is 1000ms from completion; ticks are 100ms with emissions continuing as noise.
    let misses = 0;
    for (let i = 0; i < 12; i++) if (tick(s, c).missed) misses++;
    expect(misses).toBe(1);
    expect(s.active).toBeNull();
    expect(s.idleUntil).toBeGreaterThan(0); // the breather is armed
  });
});

describe("cue-stream — responding", () => {
  it("a response with nothing active is a false alarm", () => {
    const s = freshStream(EMIT);
    expect(respondStream(s, "refill", cfg([]))).toEqual({ kind: "falseAlarm" });
  });

  it("an on-time correct read retires the cue and starts the breather", () => {
    const s = freshStream(EMIT);
    const c = cfg([0.1, 0.1, 0]);
    tick(s, c);
    tick(s, c); // complete
    const r = respondStream(s, "refill", c);
    expect(r).toMatchObject({ kind: "read", intent: "refill", facts: { correct: true, symbolsRemaining: 0 } });
    expect(s.active).toBeNull();
    expect(s.idleUntil).toBe(s.clock + c.gapMs);
  });

  it("an early call marks the cue resolved; it finishes emitting, then retires with no miss", () => {
    const s = freshStream(EMIT);
    const c = cfg([0.1, 0.1, 0.6]); // sequences[1] = clear, 3 symbols
    tick(s, c); // spoon (1/3)
    const r = respondStream(s, "clear", c); // called with 2 symbols still to come
    expect(r).toMatchObject({ kind: "read", facts: { correct: true, symbolsRemaining: 2 } });
    expect(s.active?.resolved).toBe(true);
    const e2 = tick(s, c).emitted as EmitEvent; // still delivers saucer
    expect(e2).toEqual({ kind: "symbol", symbol: "saucer" });
    const e3 = tick(s, c).emitted as EmitEvent; // …and table (now complete)
    expect(e3).toEqual({ kind: "symbol", symbol: "table" });
    // next tick quietly retires it (resolved → no miss), arming the breather
    expect(tick(s, c)).toMatchObject({ missed: false });
    expect(s.active).toBeNull();
  });

  it("answering a resolved cue again is a false alarm; a wrong intent scores incorrect", () => {
    const s = freshStream(EMIT);
    const c = cfg([0.1, 0.1, 0.6]);
    tick(s, c);
    respondStream(s, "clear", c);
    expect(respondStream(s, "refill", c)).toEqual({ kind: "falseAlarm" }); // already resolved

    const s2 = freshStream(EMIT);
    const c2 = cfg([0.1, 0.1, 0]);
    tick(s2, c2);
    tick(s2, c2);
    const wrong = respondStream(s2, "clear", c2);
    expect(wrong).toMatchObject({ kind: "read", facts: { correct: false } });
  });
});
