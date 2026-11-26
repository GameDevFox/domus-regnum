import { describe, expect, it } from "vitest";

import { PAD_ACTIONS, PAD_STICKS, padOf } from "./gamepad";
import { CONTROL_GROUPS, controlRows } from "./help";
import type { KeyBinding } from "./help";
import { ACTION } from "./page-tuning";
import { WORKPLACES } from "./workplaces";

// The controls, as they are listed: group by group, each key with its button on a controller.

const KEYS: KeyBinding[] = [
  { id: "pause", group: "time", shown: "Space", does: "Pause and resume" },
  { id: "pan", group: "view", shown: "W A S D", does: "Move the view" },
  { id: ACTION.turnClockwise, group: "view", shown: "E", does: "Turn clockwise" },
  { id: ACTION.floorUp, group: "view", shown: "R", does: "Up a floor" },
  { id: ACTION.turnAnticlockwise, group: "view", shown: "Q", does: "Turn anticlockwise" },
  { id: ACTION.floorDown, group: "view", shown: "F", does: "Down a floor" },
  { id: "map", group: "menus", shown: "M", does: "Open or close the map" },
];

describe("a controller's buttons, by what they are called", () => {
  it("each action bound to a button has that button's name, and anything else has none", () => {
    expect(padOf(ACTION.turnAnticlockwise)).toBe("LT");
    expect(padOf(ACTION.turnClockwise)).toBe("RT");
    expect(padOf(ACTION.focusPrevious)).toBe("LB");
    expect(padOf(ACTION.focusNext)).toBe("RB");
    expect(padOf(ACTION.floorUp)).toBe("D-pad ↑");
    expect(padOf(ACTION.floorDown)).toBe("D-pad ↓");
    expect(padOf("map")).toBeUndefined();
    // Every button that is bound has a name.
    expect(PAD_ACTIONS.map(([, action]) => padOf(action))).not.toContain(undefined);
  });
});

describe("the controls, listed", () => {
  const rows = controlRows(KEYS);

  it("are in their groups, in the order of the card, whatever order the keys came in", () => {
    const order = CONTROL_GROUPS.map((g) => g.id as string);
    const groups = rows.map((row) => order.indexOf(row.group));
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
    expect(rows.filter((row) => row.group === "view").slice(0, 3).map((row) => row.shown)).toEqual(["W A S D", "E", "R"]);
    expect(rows.find((row) => row.shown === "Space")?.group).toBe("time");
  });

  it("give each key its button on a controller, where it has one: the left stick for moving the view", () => {
    const pad = (shown: string): string | undefined => rows.find((row) => row.shown === shown)?.pad;
    expect(pad("W A S D")).toBe(PAD_STICKS.left);
    expect(pad("E")).toBe("RT");
    expect(pad("R")).toBe("D-pad ↑");
    expect(pad("M")).toBeUndefined();
    expect(pad("Space")).toBeUndefined();
  });

  it("list what the mouse does alone, and what only a controller does: the right stick, and the shoulders that go round the household", () => {
    expect(rows.find((row) => row.shown === "Drag")).toMatchObject({ group: "view", pad: PAD_STICKS.right });
    expect(rows.find((row) => row.shown === "Scroll")).toMatchObject({ group: "view", does: "Zoom" });
    expect(rows.find((row) => row.pad === "LB  RB")).toMatchObject({ group: "people" });
    expect(rows.find((row) => row.pad === "LB  RB")?.shown).toBeUndefined();
  });

  it("say how work is given as the page does it: a place's badge opens its card, for each place of work, and a place on the map is listed once", () => {
    const badges = rows.find((row) => row.shown?.startsWith("Click") && row.shown.endsWith("by a name"));
    for (const place of WORKPLACES) expect(badges?.shown).toContain(place.glyph);
    expect(badges?.does).toContain("card");
    expect(rows.some((row) => row.does.startsWith("Give them"))).toBe(false);
    expect(rows.filter((row) => row.shown === "Click a place on the map")).toHaveLength(1);
  });

  it("leave nothing out: every key, and every button that is bound", () => {
    for (const key of KEYS) expect(rows.some((row) => row.shown === key.shown && row.does === key.does)).toBe(true);
    const named = rows.map((row) => row.pad ?? "").join(" ");
    for (const [, action] of PAD_ACTIONS) expect(named).toContain(padOf(action));
  });
});
