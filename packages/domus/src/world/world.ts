import { Agent, tickAgent } from "./agent";
import { Nav, NodeId } from "./nav";

export type World = {
  agents: Agent[];
  tick: (dt: number) => void;
};

export type WorldOptions = {
  nav: Nav;
  agents: Agent[];
  // Supplies the next destination for an idle agent. Injected (not hardcoded random) so the
  // whole simulation is deterministic under test. `randomDestination` is the default for play.
  chooseDest: (agent: Agent) => NodeId | null;
};

// The headless multi-agent simulation. `tick(dt)` advances every agent by dt seconds. It owns
// no rendering — the view layer reads `agents[i].position` each frame and copies it onto a sprite.
export const World = ({ nav, agents, chooseDest }: WorldOptions): World => ({
  agents,
  tick: (dt) => {
    for (const agent of agents) tickAgent(agent, dt, nav, chooseDest);
  },
});

// Default destination chooser: a uniformly random node that isn't the agent's current one.
// `rng` defaults to Math.random but is injectable, so sims/tests can be made deterministic.
export const randomDestination =
  (nav: Nav, rng: () => number = Math.random) =>
  (agent: Agent): NodeId | null => {
    const candidates = nav.nodeIds.filter((id) => id !== agent.location);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(rng() * candidates.length)];
  };
