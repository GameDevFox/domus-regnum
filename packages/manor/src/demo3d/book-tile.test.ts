import { describe, expect, it } from "vitest";

import type { IntelEntry } from "../game";
import { tileLookOf } from "./book-tile";

const entry = (over: Partial<IntelEntry>): IntelEntry => ({ kind: "thing", id: "boots", name: "Boots", glyph: "👢", says: [], known: false, hidden: false, ...over }) as IntelEntry;

describe("tileLookOf", () => {
  it("shows a known thing as itself, in either mode", () => {
    for (const dev of [false, true]) expect(tileLookOf(entry({ known: true }), dev)).toEqual({ shown: true, unfound: null, says: "Boots" });
  });
  it("keeps an unknown thing a question mark without the dev menu", () => {
    expect(tileLookOf(entry({}), false)).toEqual({ shown: false, unfound: null, says: "Not yet known" });
  });
  it("shows an unknown thing for what it is with the dev menu", () => {
    expect(tileLookOf(entry({}), true)).toEqual({ shown: true, unfound: "not-known", says: "Boots: not yet known" });
  });
  it("marks a hidden thing apart from an ordinary one", () => {
    expect(tileLookOf(entry({ hidden: true, name: "A stone tablet" }), true)).toEqual({ shown: true, unfound: "not-found", says: "A stone tablet: hidden, and not yet come upon" });
  });
});
