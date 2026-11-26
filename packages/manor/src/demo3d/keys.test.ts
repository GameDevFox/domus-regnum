import { describe, expect, it } from "vitest";

import { pageKey, topLayer } from "./keys";
import type { Press } from "./keys";

// What a key press means: the page's own key, or something else's (a box being typed in, a
// control that takes the key itself); and which layer Esc closes.

const press = (key: string, more: Partial<Press> = {}): Press => ({ key, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, ...more });

describe("pageKey", () => {
  it("with nothing in particular focused, a key is the page's, by its lower-case name", () => {
    expect(pageKey(press("M"), "page")).toBe("m");
    expect(pageKey(press(" "), "page")).toBe(" ");
    expect(pageKey(press("Tab"), "page")).toBe("tab");
    expect(pageKey(press("Escape"), "page")).toBe("escape");
  });

  it("with Ctrl, Cmd or Alt held, a key is the browser's", () => {
    for (const held of ["ctrlKey", "metaKey", "altKey"] as const) expect(pageKey(press("m", { [held]: true }), "page")).toBeNull();
  });

  it("typing in a box, the keys are the box's: letters, digits, Space and Tab", () => {
    for (const key of ["1", "2", "e", "-", " ", "Tab", "?"]) expect(pageKey(press(key), "typing")).toBeNull();
  });

  it("typing in a box, Esc is still the page's: it closes what the box is on", () => {
    expect(pageKey(press("Escape"), "typing")).toBe("escape");
  });

  it("on a control the keyboard has brought the focus to, Space and Enter press it, and nothing else", () => {
    expect(pageKey(press(" "), "pressing")).toBeNull();
    expect(pageKey(press("Enter"), "pressing")).toBeNull();
    expect(pageKey(press("m"), "pressing")).toBe("m");
    expect(pageKey(press("Escape"), "pressing")).toBe("escape");
  });

  it("a key something has acted on already (a face on the map, a slot of the intel card) is not acted on again", () => {
    expect(pageKey(press(" ", { defaultPrevented: true }), "page")).toBeNull();
  });
});

describe("topLayer", () => {
  const layer = (z: number, opened: number): { z: number; opened: number; name: string } => ({ z, opened, name: `${z}/${opened}` });

  it("is nothing with nothing open", () => {
    expect(topLayer([])).toBeNull();
  });

  it("is the one drawn highest, whatever was opened first", () => {
    // The dev menu (6) opened over the intel menu (5); or the map (3) opened under the dev menu by a question.
    expect(topLayer([layer(5, 1), layer(6, 2)])?.name).toBe("6/2");
    expect(topLayer([layer(6, 1), layer(3, 2)])?.name).toBe("6/1");
  });

  it("among those drawn at one height, the one opened last", () => {
    // The kitchen's card (5), then the intel menu (5) over it.
    expect(topLayer([layer(5, 1), layer(5, 2)])?.name).toBe("5/2");
    expect(topLayer([layer(5, 2), layer(5, 1)])?.name).toBe("5/2");
  });
});
