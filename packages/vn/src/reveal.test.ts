import { describe, expect, it } from "vitest";

import { RevealWalk } from "./reveal";
import { parseRichText } from "./rich-text";

const walkOf = (raw: string) => RevealWalk(parseRichText(raw));

describe("RevealWalk — pacing", () => {
  it("reveals at the base rate; per-segment {cps} and {cps=*} override it", () => {
    const w = walkOf("aaaa{cps=2}bbbb{/cps}{cps=*0.5}cccc{/cps}");
    w.advanceTime(1, 4); // 4 glyphs of 'a' @4cps
    expect(w.pos()).toBe(4);
    w.advanceTime(1, 4); // 2 glyphs of 'b' @2cps (absolute)
    expect(w.pos()).toBe(6);
    w.advanceTime(1, 4); // finish 'b' (1s = remaining 2 @2cps)
    expect(w.pos()).toBe(8);
    w.advanceTime(1, 4); // 2 glyphs of 'c' @ 4*0.5
    expect(w.pos()).toBe(10);
    expect(w.settled()).toBe(false);
  });

  it("dt spends ACROSS segments with different rates in one call", () => {
    const w = walkOf("aa{cps=20}bbbb{/cps}");
    w.advanceTime(1.2, 2); // 1s → 'aa' @2cps, remaining 0.2s → 4 glyphs @20cps
    expect(w.pos()).toBe(6);
    expect(w.settled()).toBe(true);
  });

  it("a bare {w} pauses until click(); talking stops during the pause", () => {
    const w = walkOf("ab{w}cd");
    w.advanceTime(10, 2);
    expect(w.pos()).toBe(2);
    expect(w.paused()).toEqual({ kind: "click" });
    expect(w.isTalking()).toBe(false);
    w.advanceTime(10, 2); // time does nothing against a click-pause
    expect(w.pos()).toBe(2);
    expect(w.click()).toBe(true); // resume
    expect(w.isTalking()).toBe(true);
    w.advanceTime(1, 2);
    expect(w.pos()).toBe(4);
    expect(w.settled()).toBe(true);
  });

  it("{w=s} resumes itself, spending leftover dt past the pause", () => {
    const w = walkOf("ab{w=1}cd");
    w.advanceTime(1, 2); // reveals 'ab', arrives at the wait
    expect(w.paused()).toEqual({ kind: "time", remaining: 1 });
    w.advanceTime(1.5, 2); // 1s waiting + 0.5s revealing → 1 glyph
    expect(w.pos()).toBe(3);
    expect(w.paused()).toBeNull();
  });

  it("a click during reveal completes to the NEXT pause, not the whole line", () => {
    const w = walkOf("aaaa{w}bbbb{w}cccc");
    w.advanceTime(0.5, 2); // 1 glyph in
    expect(w.click()).toBe(true);
    expect(w.pos()).toBe(4); // at the first wait
    expect(w.paused()).toEqual({ kind: "click" });
    w.click(); // resume
    w.click(); // complete to the second wait
    expect(w.pos()).toBe(8);
    w.click(); // resume
    w.click(); // complete to end
    expect(w.pos()).toBe(12);
    expect(w.settled()).toBe(true);
    expect(w.click()).toBe(false); // settled — caller should advance the script
  });

  it("instant base speed still honors pauses — text jumps between them", () => {
    const w = walkOf("aaaa{w}bbbb");
    w.advanceTime(0, 0); // instant mode
    expect(w.pos()).toBe(4);
    expect(w.paused()).toEqual({ kind: "click" });
    w.click();
    w.advanceTime(0, 0);
    expect(w.pos()).toBe(8);
    expect(w.settled()).toBe(true);
  });

  it("{fast} pre-reveals everything before it, cancelling earlier pauses", () => {
    const w = walkOf("aaaa{w}bbbb{fast}cccc");
    expect(w.pos()).toBe(8); // at construction
    expect(w.paused()).toBeNull();
    w.advanceTime(2, 2);
    expect(w.pos()).toBe(12);
  });

  it("{p} pauses then breaks; completeAll blasts through everything", () => {
    const w = walkOf("ab{p}cd");
    w.advanceTime(1, 2);
    expect(w.paused()).toEqual({ kind: "click" });
    w.completeAll();
    expect(w.pos()).toBe(4);
    expect(w.settled()).toBe(true);
  });

  it("a timed pause is click-skippable too", () => {
    const w = walkOf("ab{w=99}cd");
    w.advanceTime(1, 2);
    expect(w.paused()).toEqual({ kind: "time", remaining: 99 });
    w.click();
    expect(w.paused()).toBeNull();
  });
});
