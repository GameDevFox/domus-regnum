import { describe, expect, it } from "vitest";

import { PLACES, WAYS, onMap, walkMinutes, wayTo, waysOnMap } from "./country";
import { gameAt } from "./test-kit";
import type { Game } from "./types";

// The country round the house: what is on the map on the first morning, the ways between its
// places, and how long each is to walk.

const ids = (game: Game): string[] => onMap(game).map((p) => p.id);

describe("the house's map", () => {
  it("starts with home and the town found, and two places it only knows are there", () => {
    const game = gameAt();
    expect(game.places).toEqual({ manor: "found", town: "found", forest: "unknown", lake: "unknown" });
    expect(ids(game)).toEqual(["manor", "town", "forest", "lake"]);
  });

  it("shows a way only when both its ends are on the map", () => {
    const game = gameAt();
    expect(waysOnMap(game)).toEqual([["manor", "town"], ["manor", "forest"], ["manor", "lake"]]);
    game.places.caves = "unknown";
    expect(waysOnMap(game)).toEqual(WAYS);
  });

  it("joins every place to home by some way", () => {
    const reached = new Set(["manor"]);
    for (let pass = 0; pass < WAYS.length; pass++) for (const [a, b] of WAYS) if (reached.has(a) || reached.has(b)) [a, b].forEach((p) => reached.add(p));
    expect([...reached].sort()).toEqual(Object.keys(PLACES).sort());
  });
});

describe("the way to a place", () => {
  it("starts at the house and passes every place between", () => {
    expect(wayTo("town")).toEqual(["manor", "town"]);
    expect(wayTo("caves")).toEqual(["manor", "forest", "caves"]);
    expect(wayTo("manor")).toEqual(["manor"]);
  });

  it("takes as long to walk as it is far on the map: town is forty minutes off, and the caves are past the forest", () => {
    expect(walkMinutes("town")).toBe(40);
    expect(walkMinutes("manor")).toBe(0);
    expect(walkMinutes("forest")).toBe(38);
    expect(walkMinutes("lake")).toBe(44);
    expect(walkMinutes("caves")).toBeGreaterThan(walkMinutes("forest") + 30);
  });
});
