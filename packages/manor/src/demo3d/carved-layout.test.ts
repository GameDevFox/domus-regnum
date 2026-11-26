import { describe, expect, it } from "vitest";

import { layoutCarved } from "./carved-layout";
import type { CarvedMetrics } from "./carved-layout";

// Every letter 10 wide and a space 4, with 1 after each letter and 2 more to a space: a word of n letters is 11n wide, a space 7.
const METRICS: CarvedMetrics = { lineHeight: 50, letterSpacing: 1, wordSpacing: 2, ascent: 30, descent: 10 };
const ADVANCE = (char: string): number => (char === " " ? 4 : 10);
const LETTER = 11;
const SPACE = 7;

describe("layoutCarved", () => {
  it("sets a line that fits in one row, centred", () => {
    const { rows, height } = layoutCarved("ab cd", 100, METRICS, ADVANCE);
    const width = 4 * LETTER + SPACE;
    expect(rows).toHaveLength(1);
    expect(height).toBe(METRICS.lineHeight);
    expect(rows[0].width).toBe(width);
    expect(rows[0].glyphs.map((g) => g.char).join("")).toBe("abcd");
    const left = (100 - width) / 2;
    expect(rows[0].glyphs.map((g) => g.x)).toEqual([left, left + LETTER, left + 2 * LETTER + SPACE, left + 3 * LETTER + SPACE]);
  });

  it("wraps at the spaces, a row at a time, each centred on its own", () => {
    // Three words of three letters (33 each): two fit in 80 (33 + 7 + 33 = 73), three do not.
    const { rows, height } = layoutCarved("abc def ghi", 80, METRICS, ADVANCE);
    expect(rows.map((r) => r.glyphs.map((g) => g.char).join(""))).toEqual(["abcdef", "ghi"]);
    expect(height).toBe(2 * METRICS.lineHeight);
    expect(rows[1].glyphs[0].x).toBe((80 - 3 * LETTER) / 2);
  });

  it("puts the baseline half the leading below the row's top, under the ascent", () => {
    const { rows } = layoutCarved("abc def ghi", 80, METRICS, ADVANCE);
    const halfLeading = (METRICS.lineHeight - METRICS.ascent - METRICS.descent) / 2;
    expect(rows.map((r) => r.baseline)).toEqual([halfLeading + METRICS.ascent, METRICS.lineHeight + halfLeading + METRICS.ascent]);
  });

  it("splits Deseret by letter, not by UTF-16 unit", () => {
    const line = "\u{10414}\u{10407} \u{1041A}";
    const { rows } = layoutCarved(line, 500, METRICS, ADVANCE);
    expect(rows[0].glyphs.map((g) => g.char)).toEqual(["\u{10414}", "\u{10407}", "\u{1041A}"]);
  });

  it("gives a word too wide for the width a row of its own, from the left edge", () => {
    const { rows } = layoutCarved("ab cdefghij kl", 60, METRICS, ADVANCE);
    expect(rows.map((r) => r.glyphs.map((g) => g.char).join(""))).toEqual(["ab", "cdefghij", "kl"]);
    expect(rows[1].glyphs[0].x).toBe(0);
  });

  it("makes nothing of an empty line, and ignores doubled spaces", () => {
    expect(layoutCarved("", 100, METRICS, ADVANCE)).toEqual({ rows: [], height: 0 });
    expect(layoutCarved("ab  cd", 100, METRICS, ADVANCE).rows[0].width).toBe(4 * LETTER + SPACE);
  });
});
