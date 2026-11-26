import { describe, expect, it } from "vitest";

import { Agent } from "./agent";
import { buildGridNav } from "./grid-nav";
import { recordTimeline } from "./timeline";
import { randomDestination, World } from "./world";

// A tiny seeded PRNG so the recorded run is deterministic.
const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const scenario = () => {
  const { nav } = buildGridNav(4, 4);
  const agents = [
    Agent({ id: "a", location: 0, position: nav.positionOf(0), speed: 1 }),
    Agent({ id: "b", location: 15, position: nav.positionOf(15), speed: 1 }),
  ];
  return World({ nav, agents, chooseDest: randomDestination(nav, rng(1)) });
};

describe("recordTimeline", () => {
  it("captures frames + 1 snapshots, starting from the initial state", () => {
    const timeline = recordTimeline({ world: scenario(), dt: 0.5, frames: 10 });
    expect(timeline).toHaveLength(11);
    expect(timeline[0].agents.map((s) => s.id)).toEqual(["a", "b"]);
    expect(timeline[0].agents[0].position).toEqual(buildGridNav(4, 4).nav.positionOf(0));
    expect(timeline[0].items).toEqual([]); // wander scenario has no items
  });

  it("snapshots are frozen — later ticks don't mutate captured frames", () => {
    const timeline = recordTimeline({ world: scenario(), dt: 0.5, frames: 20 });
    const first = timeline[0].agents[0].position.clone();
    const last = timeline[timeline.length - 1].agents[0].position;
    expect(last).not.toEqual(first); // the agent has moved by the end
    expect(timeline[0].agents[0].position).toEqual(first); // ...but frame 0 is untouched
  });

  it("is fully reproducible for the same seeded scenario", () => {
    const a = recordTimeline({ world: scenario(), dt: 0.3, frames: 30 });
    const b = recordTimeline({ world: scenario(), dt: 0.3, frames: 30 });
    expect(a).toEqual(b);
  });
});
