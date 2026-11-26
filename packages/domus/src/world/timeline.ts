import { Vector3 } from "three";

import { AgentState } from "./agent";

// A deep snapshot of one agent at one instant — safe to keep (positions/paths are cloned, so
// later ticks don't mutate captured frames).
export type AgentSnapshot = {
  id: string;
  position: Vector3;
  path: Vector3[]; // the polyline currently being traversed (empty when idle)
  state: AgentState;
};

// A snapshot of one item (e.g. trash being hauled): where it is and whether it's loose / carried /
// binned. Scenarios without items just record an empty list.
export type ItemSnapshot = {
  id: string;
  position: Vector3;
  state: "loose" | "carried" | "binned";
};

export type Frame = {
  agents: AgentSnapshot[];
  items: ItemSnapshot[];
};

// The minimal shape recordTimeline needs — works for the plain wander World and the HaulWorld.
type RecordableWorld = {
  agents: { id: string; position: Vector3; path: Vector3[]; state: AgentState }[];
  items?: { id: string; position: Vector3; state: ItemSnapshot["state"] }[];
  tick: (dt: number) => void;
};

export type RecordOptions = {
  world: RecordableWorld;
  dt: number; // seconds advanced per frame
  frames: number; // max ticks to record after the initial frame
  until?: () => boolean; // optional early stop (e.g. world.done()) — recording ends once true
};

// Run the deterministic sim and snapshot every agent + item each step. Because the sim is
// deterministic, this timeline fully reproduces the run and can be scrubbed instantly. Records up
// to `frames` ticks (index 0 = initial), stopping early if `until` is supplied and returns true.
export const recordTimeline = ({ world, dt, frames, until }: RecordOptions): Frame[] => {
  const snapshot = (): Frame => ({
    agents: world.agents.map((a) => ({
      id: a.id,
      position: a.position.clone(),
      path: a.path.map((p) => p.clone()),
      state: a.state,
    })),
    items: (world.items ?? []).map((it) => ({
      id: it.id,
      position: it.position.clone(),
      state: it.state,
    })),
  });

  const timeline: Frame[] = [snapshot()];
  for (let i = 0; i < frames; i++) {
    world.tick(dt);
    timeline.push(snapshot());
    if (until?.()) break;
  }
  return timeline;
};
