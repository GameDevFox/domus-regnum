import { describe, expect, it } from "vitest";

import { buildGridNav } from "./grid-nav";
import { Bin, HaulAgent, HaulWorld, Item } from "./haul";
import { Nav, NodeId } from "./nav";

const itemAt = (nav: Nav, id: string, node: NodeId): Item => ({
  id,
  node,
  position: nav.positionOf(node),
  state: "loose",
});

const binAt = (nav: Nav, id: string, node: NodeId): Bin => ({
  id,
  node,
  position: nav.positionOf(node),
});

const agentAt = (nav: Nav, id: string, node: NodeId) =>
  HaulAgent({ id, location: node, position: nav.positionOf(node), speed: 2 });

// Tick to completion; returns the tick count (guarded so a stuck sim fails loudly).
const runToDone = (world: ReturnType<typeof HaulWorld>, dt = 0.5, max = 5000) => {
  let ticks = 0;
  while (!world.done() && ticks < max) {
    world.tick(dt);
    ticks++;
  }
  return ticks;
};

describe("HaulWorld", () => {
  it("clears every item into a bin, ending empty-handed", () => {
    const { nav } = buildGridNav(4, 4);
    const items = [itemAt(nav, "t0", 0), itemAt(nav, "t1", 1), itemAt(nav, "t2", 2)];
    const bins = [binAt(nav, "b0", 15)];
    const agent = agentAt(nav, "a0", 5);
    const world = HaulWorld({ nav, agents: [agent], items, bins });

    const ticks = runToDone(world);
    expect(ticks).toBeLessThan(5000); // actually finished
    expect(world.done()).toBe(true);
    expect(items.every((i) => i.state === "binned")).toBe(true);
    expect(agent.carrying).toHaveLength(0);
  });

  it("grabs an item from the node beside it (never standing on it), pausing to do so", () => {
    const { nav } = buildGridNav(3, 1); // a line: 0—1—2
    const items = [itemAt(nav, "t0", 2)];
    const agent = agentAt(nav, "a0", 0);
    const world = HaulWorld({ nav, agents: [agent], items, bins: [binAt(nav, "b0", 0)] });

    let everWorked = false;
    for (let i = 0; i < 100 && items[0].state === "loose"; i++) {
      world.tick(0.1);
      if (agent.state === "working") everWorked = true;
    }
    expect(items[0].state).not.toBe("loose"); // eventually grabbed
    expect(everWorked).toBe(true); // it paused beside the item to pick it up (the 0.5 s)
    expect(agent.location).toBe(1); // grabbed from node 1, adjacent to the item at 2 — not on top of it
  });

  it("never carries more than the capacity, collecting in loads", () => {
    const { nav } = buildGridNav(5, 5);
    const items = [0, 1, 2, 3, 4].map((n, i) => itemAt(nav, `t${i}`, n)); // 5 items, capacity 3
    const bins = [binAt(nav, "b0", 24)];
    const agent = agentAt(nav, "a0", 12);
    const world = HaulWorld({ nav, agents: [agent], items, bins });

    let maxCarried = 0;
    let ticks = 0;
    while (!world.done() && ticks < 5000) {
      world.tick(0.5);
      maxCarried = Math.max(maxCarried, agent.carrying.length);
      ticks++;
    }
    expect(world.done()).toBe(true);
    expect(maxCarried).toBe(3); // fills up to capacity, never beyond
    expect(items.every((i) => i.state === "binned")).toBe(true);
  });

  it("free-for-all: the agent that loses the race re-targets and the run still completes", () => {
    const { nav } = buildGridNav(5, 5);
    const items = [itemAt(nav, "t0", 12)]; // a single piece, two agents at different distances
    const bins = [binAt(nav, "b0", 0)];
    const near = agentAt(nav, "near", 11); // adjacent to the item -> wins the race
    const far = agentAt(nav, "far", 24);
    const world = HaulWorld({ nav, agents: [near, far], items, bins });

    runToDone(world);
    expect(world.done()).toBe(true);
    expect(items[0].state).toBe("binned");
    expect(near.carrying).toHaveLength(0);
    expect(far.carrying).toHaveLength(0);
  });

  it("is deterministic — the same setup produces the same run", () => {
    const build = () => {
      const { nav } = buildGridNav(5, 5);
      const items = [3, 7, 11, 18, 22].map((n, i) => itemAt(nav, `t${i}`, n));
      const bins = [binAt(nav, "b0", 0), binAt(nav, "b1", 24)];
      const agents = [agentAt(nav, "a0", 6), agentAt(nav, "a1", 17)];
      return HaulWorld({ nav, agents, items, bins });
    };

    const trace = (world: ReturnType<typeof HaulWorld>) => {
      const frames: string[] = [];
      for (let i = 0; i < 60; i++) {
        world.tick(0.25);
        frames.push(world.agents.map((a) => a.position.toArray().join(",")).join("|"));
      }
      return frames;
    };

    expect(trace(build())).toEqual(trace(build()));
  });
});
