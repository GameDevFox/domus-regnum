import { Vector3 } from "three";

import { trapezoidStep } from "@kitsune/common";

import { Nav, NodeId } from "./nav";
import { pathLength, pointAtDistance } from "./path-follow";

export type AgentState = "idle" | "moving" | "working";

export type Agent = {
  id: string;
  position: Vector3;
  location: NodeId; // node the agent is at (idle) or departed from (moving)
  speed: number; // world units per second (the TOP speed when `accel` is set)
  // m/s² for the trapezoidal motion profile: ramp up from rest, cruise at `speed`, brake to land
  // exactly on the target (short trips become triangles — braking starts before cruise is
  // reached). Omitted ⇒ legacy constant-speed movement, full speed from the first tick.
  accel?: number;
  state: AgentState;

  // Movement state — meaningful while `state === "moving"`.
  path: Vector3[];
  pathDistance: number; // total length of the current path
  traveled: number; // distance covered so far along it
  velocity: number; // current along-path speed (== `speed` when accel is unset; 0 while idle)
  target: NodeId | null;

  // Work-pause state — meaningful while `state === "working"` (see startWork / tickBrain).
  workLeft: number; // seconds of work remaining
  workTotal: number; // seconds this pause started with (for progress reporting)
};

export type AgentOptions = {
  id: string;
  location: NodeId;
  position: Vector3;
  speed?: number; // default 1.4 — ~average human walking pace in m/s
  accel?: number; // see Agent.accel — omit for legacy constant speed
};

export const Agent = ({ id, location, position, speed = 1.4, accel }: AgentOptions): Agent => ({
  id,
  position: position.clone(),
  location,
  speed,
  accel,
  state: "idle",
  path: [],
  pathDistance: 0,
  traveled: 0,
  velocity: 0,
  target: null,
  workLeft: 0,
  workTotal: 0,
});

// Halt in place and clear any path/target — the agent idles where it stands and the next
// decide() re-searches from scratch.
export const stopAgent = (agent: Agent): void => {
  agent.state = "idle";
  agent.path = [];
  agent.target = null;
  agent.pathDistance = 0;
  agent.traveled = 0;
  agent.velocity = 0;
};

// Begin a stationary work pause of `seconds` — tickBrain counts it down and fires onWorkDone.
// The countdown starts on the NEXT tick, so the full duration is always served.
export const startWork = (agent: Agent, seconds: number): void => {
  agent.state = "working";
  agent.workLeft = seconds;
  agent.workTotal = seconds;
};

const arrive = (agent: Agent) => {
  agent.position.copy(agent.path[agent.path.length - 1]);
  agent.location = agent.target!;
  agent.state = "idle";
  agent.target = null;
  agent.path = [];
  agent.pathDistance = 0;
  agent.traveled = 0;
  agent.velocity = 0; // at rest — the next trip ramps up from zero again
};

// Begin moving toward `to`, computing the path via the nav port. Stays idle (no-op) if the
// agent is already there or no path exists.
export const setDestination = (agent: Agent, to: NodeId, nav: Nav): void => {
  const path = nav.findPath(agent.location, to);
  if (path.length < 2) return; // already there or unreachable
  agent.path = path;
  agent.pathDistance = pathLength(path);
  agent.traveled = 0;
  agent.velocity = 0; // departs from rest (only matters when accel is set)
  agent.target = to;
  agent.state = "moving";
};

// The node an agent should stand on to be ADJACENT to `to` — the step just before `to` on the path,
// so it ends up *beside* a pickup/drop target rather than on top of it. Returns the agent's own
// location if it's already adjacent (a single hop away) or already there, and null if `to` is
// unreachable. Falls back to `to` itself if the nav can't give a node-level path (old behaviour).
export const approachNode = (agent: Agent, to: NodeId, nav: Nav): NodeId | null => {
  if (to === agent.location) return agent.location;
  if (!nav.findNodePath) return to;
  const path = nav.findNodePath(agent.location, to);
  if (path.length < 2) return null; // unreachable
  if (path.length === 2) return agent.location; // already one step away — act in place
  return path[path.length - 2]; // the node before the target = adjacent to it
};

// Seconds an agent pauses beside a target to pick up or set down an item — shared by every sim
// that manipulates things (trash-haul, dish-haul), so "handling feel" stays consistent.
export const PICK_PLACE_TIME = 0.5;

// The approach-then-act dance every pickup/drop shares: route the agent to a node ADJACENT to
// `to`. "beside" ⇒ it's already next to the target and should act now (start its work pause);
// "moving" ⇒ it's walking there; "unreachable" ⇒ no usable path — the caller abandons or
// falls back. (setDestination failing to produce a path counts as unreachable too.)
export type ApproachOutcome = "beside" | "moving" | "unreachable";

export const routeAdjacent = (agent: Agent, to: NodeId, nav: Nav): ApproachOutcome => {
  const approach = approachNode(agent, to, nav);
  if (approach === null) return "unreachable";
  if (approach === agent.location) return "beside";
  setDestination(agent, approach, nav);
  return agent.state === "moving" ? "moving" : "unreachable";
};

// Advance a moving agent by `dt` seconds along its path. Returns true if it reached the end this
// tick (and is now idle at its target). No-op for an idle agent. Mutates in place.
//
// With `accel` set, velocity follows the trapezoidal profile (math in @kitsune/common
// movement.ts): ramp up, cruise, brake to land exactly on the target — short trips become
// triangles automatically. arrive() snaps the final sub-step, so there's no creep or overshoot.
export const advanceAgent = (agent: Agent, dt: number): boolean => {
  if (agent.state !== "moving") return false;
  if (agent.accel === undefined) {
    agent.velocity = agent.speed; // legacy: full speed from the first tick
  } else {
    agent.velocity = trapezoidStep(agent.velocity, dt, {
      accel: agent.accel,
      topSpeed: agent.speed,
      remaining: agent.pathDistance - agent.traveled,
    });
  }
  agent.traveled += agent.velocity * dt;
  if (agent.traveled >= agent.pathDistance) {
    arrive(agent);
    return true;
  }
  agent.position.copy(pointAtDistance(agent.path, agent.traveled));
  return false;
};

// The brain skeleton every sim shares: a working agent serves its pause, an idle one decides,
// a moving one advances — with a walk chosen by decide() advancing the SAME tick (no dead tick;
// matches tickAgent's long-standing semantics), while a work pause started anywhere counts down
// from the NEXT tick. Policy stays in the handlers: what to decide, what an arrival means, what
// finishing work does. Mutates the agent in place.
export type BrainHandlers<A extends Agent> = {
  /** The agent is idle and free — claim a job, start a walk or a work pause, or do nothing. */
  decide: (agent: A) => void;
  /** A walk completed; the agent stands idle at `location`. */
  onArrive?: (agent: A) => void;
  /** A work pause finished; state is back at "idle" (and the timers zeroed) when this runs. */
  onWorkDone?: (agent: A) => void;
  /** Every tick while working, after the countdown — for progress reporting. */
  onWorkTick?: (agent: A) => void;
};

export const tickBrain = <A extends Agent>(agent: A, dt: number, handlers: BrainHandlers<A>): void => {
  if (agent.state === "working") {
    agent.workLeft -= dt;
    handlers.onWorkTick?.(agent);
    if (agent.workLeft <= 0) {
      agent.state = "idle";
      agent.workLeft = 0;
      agent.workTotal = 0;
      handlers.onWorkDone?.(agent);
    }
    return;
  }
  if (agent.state === "idle") handlers.decide(agent);
  if (agent.state === "moving" && advanceAgent(agent, dt)) handlers.onArrive?.(agent);
};

// Advance an agent by `dt` seconds. When idle, `chooseDest` supplies the next destination
// (injected so the core has no Math.random — deterministic in tests). Mutates the agent in place.
export const tickAgent = (
  agent: Agent,
  dt: number,
  nav: Nav,
  chooseDest: (agent: Agent) => NodeId | null,
): void => {
  tickBrain(agent, dt, {
    decide: (a) => {
      const dest = chooseDest(a);
      if (dest === null || dest === a.location) return;
      setDestination(a, dest, nav);
    },
  });
};
