import { describe, expect, it } from "vitest";

import { HOUSE, addActor, addActorAt, createWorld } from "../space";
import { occupantsOf, storeyAt } from "./occupants";

// Who is on a storey, for opening the rooms they are in.

const { cellar, ground, first } = HOUSE.storeys;

describe("the storey someone is on, by the height of her feet", () => {
  it("is the one whose floor she stands on", () => {
    expect(storeyAt(HOUSE, cellar.y)).toBe("cellar");
    expect(storeyAt(HOUSE, ground.y)).toBe("ground");
    expect(storeyAt(HOUSE, first.y)).toBe("first");
  });

  it("on a flight of stairs is the lower of the two, until she is at the top", () => {
    expect(storeyAt(HOUSE, (ground.y + first.y) / 2)).toBe("ground");
    expect(storeyAt(HOUSE, first.y - 0.05)).toBe("ground");
    expect(storeyAt(HOUSE, (cellar.y + ground.y) / 2)).toBe("cellar");
    expect(storeyAt(HOUSE, ground.y - 0.05)).toBe("cellar");
  });
});

describe("everybody on a storey", () => {
  it("is whoever stands on it, household or caller, each where she stands; and nobody from another storey", () => {
    const world = createWorld(HOUSE);
    const upstairs = HOUSE.spots.find((s) => s.floor === "first");
    const below = HOUSE.spots.find((s) => s.floor === "cellar");
    if (!upstairs || !below) throw new Error("the plan has no spot upstairs, or none in the cellar");
    addActorAt(world, "rose", "Rose", "maid", { x: 5.5, z: 8.75 });
    addActorAt(world, "caller", "A caller", "townsman", { x: 15, z: 3 });
    addActor(world, "master", "The Master", "master", upstairs.id);
    addActor(world, "sage", "Sage", "maid", below.id);
    expect(occupantsOf(world, "ground")).toEqual([
      { x: 5.5, y: ground.y, z: 8.75 },
      { x: 15, y: ground.y, z: 3 },
    ]);
    expect(occupantsOf(world, "first")).toEqual([{ x: upstairs.x, y: first.y, z: upstairs.z }]);
    expect(occupantsOf(world, "cellar")).toEqual([{ x: below.x, y: cellar.y, z: below.z }]);
  });
});
