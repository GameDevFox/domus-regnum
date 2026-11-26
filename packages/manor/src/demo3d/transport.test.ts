import { describe, expect, it } from "vitest";

import { pauseSays } from "./transport";

// The pause button's picture and its name say the same thing, held by a question or not.

const PLAY = "▶";
const PAUSE = "❚❚";

describe("pauseSays", () => {
  it("running: the pause sign, named Pause", () => {
    expect(pauseSays(false, false)).toMatchObject({ glyph: PAUSE, label: "Pause" });
  });

  it("paused: the play sign, named Resume, held or not", () => {
    for (const held of [false, true]) expect(pauseSays(true, held)).toMatchObject({ glyph: PLAY, label: "Resume" });
  });

  it("held by a question: the play sign, and a name that says time stands still before it says pressing pauses", () => {
    const says = pauseSays(false, true);
    expect(says.glyph).toBe(PLAY);
    expect(says.label).toMatch(/^Time stands still/);
    expect(says.label).toMatch(/press to pause/);
    expect(says.title.startsWith(says.label)).toBe(true);
  });

  it("each title begins with its name, and gives the key", () => {
    for (const [stopped, held] of [[false, false], [true, false], [true, true], [false, true]]) {
      const says = pauseSays(stopped, held);
      expect(says.title.startsWith(says.label)).toBe(true);
      expect(says.title).toContain("key Space");
    }
  });
});
