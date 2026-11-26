import { Vector3 } from "three";

import { Agent, AgentOptions, PICK_PLACE_TIME, routeAdjacent, startWork, tickBrain } from "./agent";
import { Nav, NodeId } from "./nav";
import { nearestEntity } from "./nearest";

// A "trash → bin" hauling sim built on the agent navigation primitives. Agents grab loose items
// (up to CAPACITY) then dump the whole load at the nearest bin, until every item is binned.
// Free-for-all: no claiming — two agents may target the same item; the one that arrives second
// finds it gone and re-targets. Deterministic (nearest picks tie-break by id), so it records and
// scrubs like the other scenarios.
//
// Agents stop ADJACENT to a pickup/drop (route to it, back up one step) and spend PICK_PLACE_TIME
// handling the item there — so they reach beside the trash/bin and pause, rather than running onto it.
export const CAPACITY = 3;

export type ItemState = "loose" | "carried" | "binned";

export type Item = {
  id: string;
  node: NodeId;
  position: Vector3; // node position when loose; follows the carrier (stacked) when carried
  state: ItemState;
};

export type Bin = {
  id: string;
  node: NodeId;
  position: Vector3;
};

export type Goal = "pickup" | "deliver" | null;

export type HaulAgent = Agent & {
  carrying: Item[];
  goal: Goal;
  targetItem: Item | null;
};

export const HaulAgent = (opts: AgentOptions): HaulAgent => ({
  ...Agent(opts),
  carrying: [],
  goal: null,
  targetItem: null,
});

export type HaulWorld = {
  nav: Nav;
  agents: HaulAgent[];
  items: Item[];
  bins: Bin[];
  capacity: number;
  tick: (dt: number) => void;
  done: () => boolean; // every item binned and nobody carrying
};

type Ctx = { nav: Nav; items: Item[]; bins: Bin[]; capacity: number };

type Target = { goal: Exclude<Goal, null>; node: NodeId; item?: Item };

const chooseTarget = (agent: HaulAgent, { items, bins, capacity }: Ctx): Target | null => {
  const toBin = (): Target | null => {
    const bin = nearestEntity(bins, agent.position);
    return bin ? { goal: "deliver", node: bin.node } : null;
  };

  if (agent.carrying.length >= capacity) return toBin();

  const item = nearestEntity(
    items.filter((i) => i.state === "loose"),
    agent.position,
  );
  if (item) return { goal: "pickup", node: item.node, item };

  return agent.carrying.length > 0 ? toBin() : null; // last partial load, else done
};

// Apply the pick-up / set-down after the work pause beside the target completes.
const finishPickPlace = (agent: HaulAgent, { capacity }: Ctx) => {
  if (agent.goal === "pickup") {
    const item = agent.targetItem;
    // Free-for-all: the item may have been taken since we set out — only grab it if still loose.
    if (item && item.state === "loose" && agent.carrying.length < capacity) {
      item.state = "carried";
      agent.carrying.push(item);
    }
  } else if (agent.goal === "deliver") {
    for (const item of agent.carrying) item.state = "binned";
    agent.carrying = [];
  }
  agent.goal = null;
  agent.targetItem = null;
};

const startPause = (agent: HaulAgent) => startWork(agent, PICK_PLACE_TIME);

const decide = (agent: HaulAgent, ctx: Ctx) => {
  const target = chooseTarget(agent, ctx);
  if (!target) {
    agent.goal = null;
    agent.targetItem = null;
    return;
  }
  agent.goal = target.goal;
  agent.targetItem = target.item ?? null;
  // Walk to a node ADJACENT to the target (back up one step), or work in place if already beside it.
  const outcome = routeAdjacent(agent, target.node, ctx.nav);
  if (outcome === "unreachable") {
    agent.goal = null; // drop it and re-decide next tick
    agent.targetItem = null;
  } else if (outcome === "beside") {
    startPause(agent);
  }
};

export type HaulWorldOptions = {
  nav: Nav;
  agents: HaulAgent[];
  items: Item[];
  bins: Bin[];
  capacity?: number;
};

export const HaulWorld = ({
  nav,
  agents,
  items,
  bins,
  capacity = CAPACITY,
}: HaulWorldOptions): HaulWorld => {
  const ctx: Ctx = { nav, items, bins, capacity };

  // The haul brain as tickBrain policy handlers (the skeleton lives in agent.ts).
  const brain = {
    decide: (agent: HaulAgent) => decide(agent, ctx),
    onArrive: startPause, // reached the approach node → pause to pick up / set down
    onWorkDone: (agent: HaulAgent) => finishPickPlace(agent, ctx),
  };

  const tick = (dt: number) => {
    for (const agent of agents) tickBrain(agent, dt, brain);
    // Carried items ride their carrier, stacked clear of BOTH avatar looks (the 3D cone+sphere
    // tops out ~0.72; the 2D maid billboard is 1.1 tall) so they read as "held up", never lodged
    // in the art.
    for (const agent of agents) {
      agent.carrying.forEach((item, i) => {
        item.position.copy(agent.position);
        item.position.y += 1.2 + i * 0.35; // spacing clears the taller look (0.32 icon sprites)
      });
    }
  };

  const done = () =>
    items.every((i) => i.state === "binned") && agents.every((a) => a.carrying.length === 0);

  return { nav, agents, items, bins, capacity, tick, done };
};
