import { describe, expect, it } from "vitest";

import {
  type ActiveCue,
  DEFAULT_CUE_SCORE as C,
  evaluateResponse,
  missScore,
  potentialScore,
  ratingFor,
  scoreCue,
} from "./cue-game";

describe("scoreCue — correct, on-time", () => {
  it("within grace scores full base", () => {
    expect(scoreCue({ correct: true, symbolsRemaining: 0, reactionMs: 0 })).toBe(C.base);
    expect(scoreCue({ correct: true, symbolsRemaining: 0, reactionMs: C.graceMs })).toBe(C.base);
  });

  it("decays past grace and can go negative, floored", () => {
    const justPast = scoreCue({ correct: true, symbolsRemaining: 0, reactionMs: C.graceMs + 500 });
    expect(justPast).toBeLessThan(C.base);
    expect(justPast).toBeGreaterThan(0);
    // far past grace → floored, never below floor
    const late = scoreCue({ correct: true, symbolsRemaining: 0, reactionMs: 100000 });
    expect(late).toBe(C.floor);
  });
});

describe("scoreCue — early call (the mega risk)", () => {
  it("a correct early call beats base, scaling with symbols remaining", () => {
    const oneEarly = scoreCue({ correct: true, symbolsRemaining: 1, reactionMs: 0 });
    const twoEarly = scoreCue({ correct: true, symbolsRemaining: 2, reactionMs: 0 });
    expect(oneEarly).toBe(C.base + C.earlyBonusPerSymbol); // 180
    expect(twoEarly).toBe(C.base + 2 * C.earlyBonusPerSymbol); // 260 — anticipating a clear at just 🥄
    expect(twoEarly).toBeGreaterThan(oneEarly);
    expect(oneEarly).toBeGreaterThan(C.base);
  });
});

describe("scoreCue — wrong", () => {
  it("a wrong intent is penalized regardless of timing", () => {
    expect(scoreCue({ correct: false, symbolsRemaining: 1, reactionMs: 0 })).toBe(C.wrongPenalty);
    expect(scoreCue({ correct: false, symbolsRemaining: 0, reactionMs: 0 })).toBe(C.wrongPenalty);
  });
});

describe("potentialScore / missScore", () => {
  it("potential is the correct-response score (for the HUD)", () => {
    expect(potentialScore({ symbolsRemaining: 1, reactionMs: 0 })).toBe(C.base + C.earlyBonusPerSymbol);
    expect(potentialScore({ symbolsRemaining: 0, reactionMs: 0 })).toBe(C.base);
  });
  it("a missed real pattern scores the floor", () => {
    expect(missScore()).toBe(C.floor);
  });
});

describe("evaluateResponse", () => {
  const mk = (over: Partial<ActiveCue>): ActiveCue => ({
    intent: "refill",
    injected: true,
    length: 2,
    emitted: 2,
    completeAtMs: 1000,
    ...over,
  });

  it("complete + correct intent → on-time facts", () => {
    const f = evaluateResponse(mk({}), "refill", 1300);
    expect(f).toEqual({ correct: true, symbolsRemaining: 0, reactionMs: 300 });
    expect(scoreCue(f)).toBe(C.base); // within grace
  });

  it("in-progress correct intent → early facts (symbolsRemaining>0, reaction ignored)", () => {
    const f = evaluateResponse(mk({ emitted: 1, completeAtMs: null }), "refill", 5000);
    expect(f).toEqual({ correct: true, symbolsRemaining: 1, reactionMs: 0 });
    expect(scoreCue(f)).toBe(C.base + C.earlyBonusPerSymbol);
  });

  it("wrong intent (e.g. calling refill on a clear-in-progress) → incorrect", () => {
    const clear = mk({ intent: "clear", length: 3, emitted: 2, completeAtMs: null });
    const f = evaluateResponse(clear, "refill", 9999);
    expect(f.correct).toBe(false);
    expect(scoreCue(f)).toBe(C.wrongPenalty);
  });

  it("a decoy (intent null) makes any response wrong", () => {
    const decoy = mk({ intent: null, length: 1, emitted: 1, completeAtMs: 1000 });
    expect(evaluateResponse(decoy, "refill", 1100).correct).toBe(false);
    expect(evaluateResponse(decoy, "clear", 1100).correct).toBe(false);
  });

  it("reactionMs never goes negative", () => {
    expect(evaluateResponse(mk({ completeAtMs: 2000 }), "refill", 1500).reactionMs).toBe(0);
  });
});

describe("ratingFor", () => {
  it("bands the score ladder", () => {
    expect(ratingFor(C.base + C.earlyBonusPerSymbol)).toBe("Intuitive"); // > base
    expect(ratingFor(C.base)).toBe("Astute");
    expect(ratingFor(40)).toBe("Attentive");
    expect(ratingFor(-30)).toBe("Slow");
    expect(ratingFor(C.floor)).toBe("Missed");
    expect(ratingFor(C.wrongPenalty)).toBe("Missed");
  });
});
