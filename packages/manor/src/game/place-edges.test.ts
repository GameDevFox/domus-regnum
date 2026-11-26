import { describe, expect, it } from "vitest";

import { isAt } from "./place";
import { gameAt, person } from "./test-kit";

// Being at a spot, at its very edge: it is nearer than a certain distance, and not that distance itself.

/** How near a spot someone must be to be at it, in metres (the rule's own figure). */
const AT_SPOT = 0.3;

describe("being at a spot", () => {
  const setUp = () => {
    const game = gameAt();
    const { world } = game;
    world.spots.set("edge.test", { id: "edge.test", floor: "ground", x: 0, z: 0, face: "s" });
    return { world, actor: person(game, "sage") };
  };

  it("is true on the spot and a little off it, in the plane of the floor, and not at the distance itself", () => {
    const { world, actor } = setUp();
    const y = world.plan.storeys.ground.y;
    actor.walker.pos = { x: 0, y, z: 0 };
    expect(isAt(world, actor, "edge.test")).toBe(true);
    actor.walker.pos = { x: AT_SPOT / 2, y, z: 0 };
    expect(isAt(world, actor, "edge.test")).toBe(true);
    actor.walker.pos = { x: AT_SPOT, y, z: 0 };
    expect(isAt(world, actor, "edge.test")).toBe(false);
  });

  it("is false on another storey, even straight above it, and the height counts from the same distance", () => {
    const { world, actor } = setUp();
    actor.walker.pos = { x: 0, y: world.plan.storeys.ground.y + AT_SPOT, z: 0 };
    expect(isAt(world, actor, "edge.test")).toBe(false);
    actor.walker.pos = { x: 0, y: world.plan.storeys.first.y, z: 0 };
    expect(isAt(world, actor, "edge.test")).toBe(false);
  });
});
