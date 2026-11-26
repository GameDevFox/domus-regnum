import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { Agent } from "./agent";
import { Nav } from "./nav";
import { randomDestination, World } from "./world";

const lineNav = (): Nav => {
  const pos = [0, 1, 2, 3].map((x) => new Vector3(x, 0, 0));
  return {
    nodeIds: [0, 1, 2, 3],
    positionOf: (id) => pos[id as number].clone(),
    findPath: (from, to) => {
      const a = from as number;
      const b = to as number;
      if (a === b) return [pos[a].clone()];
      const step = a < b ? 1 : -1;
      const out: Vector3[] = [];
      for (let i = a; i !== b + step; i += step) out.push(pos[i].clone());
      return out;
    },
  };
};

const at = (x: number) => new Vector3(x, 0, 0);

describe("World", () => {
  it("advances every agent on each tick, independently", () => {
    const nav = lineNav();
    const a = Agent({ id: "a", location: 0, position: at(0), speed: 1 });
    const b = Agent({ id: "b", location: 3, position: at(3), speed: 1 });
    // a heads to 3 (forward), b heads to 0 (backward).
    const world = World({ nav, agents: [a, b], chooseDest: (agent) => (agent.id === "a" ? 3 : 0) });

    world.tick(1);
    expect(a.position).toEqual(at(1));
    expect(b.position).toEqual(at(2));

    world.tick(1);
    expect(a.position).toEqual(at(2));
    expect(b.position).toEqual(at(1));
  });

  it("is fully deterministic given a seeded chooser", () => {
    const run = () => {
      const nav = lineNav();
      const agent = Agent({ id: "a", location: 0, position: at(0), speed: 1 });
      // A fixed pseudo-rng so randomDestination is reproducible.
      let s = 0;
      const rng = () => ((s = (s + 0.37) % 1), s);
      const world = World({ nav, agents: [agent], chooseDest: randomDestination(nav, rng) });
      for (let i = 0; i < 20; i++) world.tick(0.5);
      return agent.position.clone();
    };
    expect(run()).toEqual(run());
  });
});

describe("randomDestination", () => {
  it("never returns the agent's current location", () => {
    const nav = lineNav();
    const agent = Agent({ id: "a", location: 2, position: at(2) });
    // Sweep rng across [0,1) — every pick must skip node 2.
    for (let r = 0; r < 1; r += 0.05) {
      const dest = randomDestination(nav, () => r)(agent);
      expect(dest).not.toBe(2);
    }
  });

  it("returns null when there are no other nodes", () => {
    const solo: Nav = { nodeIds: [7], positionOf: () => at(0), findPath: () => [] };
    const agent = Agent({ id: "a", location: 7, position: at(0) });
    expect(randomDestination(solo)(agent)).toBeNull();
  });
});
