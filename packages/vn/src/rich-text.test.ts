import { describe, expect, it, vi } from "vitest";

import { parseRichText, plainText, textSegments } from "./rich-text";

const quiet = () => {
  const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
  spy.mockClear(); // spyOn returns the SAME spy across tests — reset its count
  return spy;
};

describe("parseRichText — Ren'Py style tags", () => {
  it("plain text is one unstyled segment", () => {
    expect(parseRichText("Just words.")).toEqual([{ kind: "text", text: "Just words.", style: {} }]);
  });

  it("bold/italic nest with cumulative styles (the text.rst example)", () => {
    expect(parseRichText("Plain {b}Bold {i}Bold-Italic{/i} Bold{/b} Plain")).toEqual([
      { kind: "text", text: "Plain ", style: {} },
      { kind: "text", text: "Bold ", style: { bold: true } },
      { kind: "text", text: "Bold-Italic", style: { bold: true, italic: true } },
      { kind: "text", text: " Bold", style: { bold: true } },
      { kind: "text", text: " Plain", style: {} },
    ]);
  });

  it("color and size take arguments; size supports absolute and relative", () => {
    expect(parseRichText("{color=#f00}Red{/color} {size=18}big{/size} {size=+4}bigger{/size}")).toEqual([
      { kind: "text", text: "Red", style: { color: "#f00" } },
      { kind: "text", text: " ", style: {} },
      { kind: "text", text: "big", style: { sizePx: 18 } },
      { kind: "text", text: " ", style: {} },
      { kind: "text", text: "bigger", style: { sizeDelta: 4 } },
    ]);
  });

  it("unclosed tags auto-close at end of line (Ren'Py-legal)", () => {
    expect(parseRichText("{size=20}This is big!")).toEqual([
      { kind: "text", text: "This is big!", style: { sizePx: 20 } },
    ]);
  });

  it("{/} — the universal closer — pops the most recent open tag", () => {
    expect(parseRichText("{b}{i}both{/} bold-only{/} plain")).toEqual([
      { kind: "text", text: "both", style: { bold: true, italic: true } },
      { kind: "text", text: " bold-only", style: { bold: true } },
      { kind: "text", text: " plain", style: {} },
    ]);
  });

  it("{{ escapes a literal brace; } needs no escape (Ren'Py semantics — }} is two literal braces)", () => {
    quiet();
    expect(plainText(parseRichText("a {{b}} c } d"))).toBe("a {b}} c } d");
  });

  it("unknown tags are stripped with a warning", () => {
    const warn = quiet();
    expect(parseRichText("a {colr=red}b{/colr} c")).toEqual([{ kind: "text", text: "a b c", style: {} }]);
    expect(warn).toHaveBeenCalled();
  });

  it("a mismatched close warns and closes through the match, LIFO", () => {
    const warn = quiet();
    // {/b} while {i} is still open: Ren'Py calls this incorrect; we close both, loudly.
    expect(parseRichText("{b}x{i}y{/b}z")).toEqual([
      { kind: "text", text: "x", style: { bold: true } },
      { kind: "text", text: "y", style: { bold: true, italic: true } },
      { kind: "text", text: "z", style: {} },
    ]);
    expect(warn).toHaveBeenCalled();
  });

  it("stray closers and empty {/} warn and are ignored", () => {
    const warn = quiet();
    expect(parseRichText("{/b}a{/}b")).toEqual([{ kind: "text", text: "ab", style: {} }]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("plainText strips tags for glyph counting (cps ignores markup)", () => {
    expect(plainText(parseRichText("{b}spoon{/} then {color=#c9a86a}cup{/}"))).toBe("spoon then cup");
  });
});

describe("parseRichText — pacing controls", () => {
  it("{w} and {w=1.5} become wait items between segments", () => {
    expect(parseRichText("Ah—{w=0.5} you!{w} Sit.")).toEqual([
      { kind: "text", text: "Ah—", style: {} },
      { kind: "wait", seconds: 0.5 },
      { kind: "text", text: " you!", style: {} },
      { kind: "wait" },
      { kind: "text", text: " Sit.", style: {} },
    ]);
  });

  it("{p} is a wait followed by a paragraph break", () => {
    expect(parseRichText("one{p}two")).toEqual([
      { kind: "text", text: "one", style: {} },
      { kind: "wait" },
      { kind: "break" },
      { kind: "text", text: "two", style: {} },
    ]);
  });

  it("{cps=8} and {cps=*2} ride the tag stack onto segments", () => {
    expect(parseRichText("a{cps=8}slow{/cps}b{cps=*2}fast{/}c")).toEqual([
      { kind: "text", text: "a", style: {} },
      { kind: "text", text: "slow", style: {}, cps: 8 },
      { kind: "text", text: "b", style: {} },
      { kind: "text", text: "fast", style: {}, cpsMul: 2 },
      { kind: "text", text: "c", style: {} },
    ]);
  });

  it("{fast} is a marker item; malformed pacing args strip with a warning", () => {
    const warn = quiet();
    expect(parseRichText("a{fast}b{w=nope}c")).toEqual([
      { kind: "text", text: "a", style: {} },
      { kind: "fast" },
      { kind: "text", text: "bc", style: {} },
    ]);
    expect(warn).toHaveBeenCalled();
  });

  it("textSegments filters controls out for pause-less consumers (choice buttons)", () => {
    expect(textSegments(parseRichText("a{w}b")).map((s) => s.text)).toEqual(["a", "b"]);
  });
});
