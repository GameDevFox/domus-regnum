import { describe, expect, it } from "vitest";

import { SOUND_COUNT, letter, write } from "./deseret";

// The Deseret alphabet: a letter to a sound, in the alphabet's own order.

describe("the Deseret alphabet", () => {
  it("has forty letters, each its own, all in the alphabet's block of capitals", () => {
    expect(SOUND_COUNT).toBe(40);
  });

  it("puts each sound at its letter: the alphabet's order is the order of its capitals", () => {
    // By their places in Unicode: LONG I, SHORT E, H, TEE, THEE, ENG, EW.
    expect(letter("ee").codePointAt(0)).toBe(0x10400);
    expect(letter("e").codePointAt(0)).toBe(0x10407);
    expect(letter("h").codePointAt(0)).toBe(0x10410);
    expect(letter("t").codePointAt(0)).toBe(0x10413);
    expect(letter("dh").codePointAt(0)).toBe(0x1041c);
    expect(letter("ng").codePointAt(0)).toBe(0x10425);
    expect(letter("ew").codePointAt(0)).toBe(0x10427);
  });

  it("writes a word as its sounds, and words with a space between", () => {
    expect(write("h e l oh")).toBe(String.fromCodePoint(0x10410, 0x10407, 0x10422, 0x10404));
    expect(write("dh i s", "i z")).toBe(`${String.fromCodePoint(0x1041c, 0x10406, 0x1041d)} ${String.fromCodePoint(0x10406, 0x1041e)}`);
  });

  it("will not write a sound it has no letter for", () => {
    expect(() => write("h x")).toThrow();
  });
});
