import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  Agent,
  advanceAgent,
  approachNode,
  routeAdjacent,
  setDestination,
  startWork,
  tickAgent,
  tickBrain,
} from "./agent";
import { Nav, NodeId } from "./nav";

// A 4-node graph on the x-axis: 0—1—2—3, unit spacing. findPath walks the line inclusively.
const lineNav = (): Nav => {
  const pos = [0, 1, 2, 3].map((x) => new Vector3(x, 0, 0));
  const nodePath = (a: number, b: number): number[] => {
    if (a === b) return [a];
    const step = a < b ? 1 : -1;
    const out: number[] = [];
    for (let i = a; i !== b + step; i += step) out.push(i);
    return out;
  };
  return {
    nodeIds: [0, 1, 2, 3],
    positionOf: (id) => pos[id as number].clone(),
    findPath: (from, to) => nodePath(from as number, to as number).map((i) => pos[i].clone()),
    findNodePath: (from, to) => nodePath(from as number, to as number),
  };
};

// A deterministic destination source: hands out the given ids in order, then null.
const sequence = (...ids: NodeId[]) => {
  let i = 0;
  return () => (i < ids.length ? ids[i++] : null);
};

const at = (x: number) => new Vector3(x, 0, 0);

describe("Agent", () => {
  it("starts idle at its given location and position", () => {
    const agent = Agent({ id: "a", location: 0, position: at(0) });
    expect(agent.state).toBe("idle");
    expect(agent.location).toBe(0);
    expect(agent.position).toEqual(at(0));
  });

  it("walks toward a chosen destination at its speed, then arrives idle", () => {
    const nav = lineNav();
    const agent = Agent({ id: "a", location: 0, position: at(0), speed: 1 });
    const dest = sequence(3);

    tickAgent(agent, 1, nav, dest); // start + advance 1
    expect(agent.state).toBe("moving");
    expect(agent.position).toEqual(at(1));

    tickAgent(agent, 1, nav, dest);
    expect(agent.position).toEqual(at(2));

    tickAgent(agent, 1, nav, dest); // covers the final unit -> arrive
    expect(agent.state).toBe("idle");
    expect(agent.location).toBe(3);
    expect(agent.position).toEqual(at(3));
  });

  it("clamps to the destination instead of overshooting on a large dt", () => {
    const nav = lineNav();
    const agent = Agent({ id: "a", location: 0, position: at(0), speed: 1 });
    tickAgent(agent, 100, nav, sequence(3));
    expect(agent.state).toBe("idle");
    expect(agent.location).toBe(3);
    expect(agent.position).toEqual(at(3));
  });

  it("picks a new destination after arriving", () => {
    const nav = lineNav();
    const agent = Agent({ id: "a", location: 0, position: at(0), speed: 1 });
    const dest = sequence(3, 0);

    tickAgent(agent, 1, nav, dest);
    tickAgent(agent, 1, nav, dest);
    tickAgent(agent, 1, nav, dest); // arrives at 3, idle (dest "3" consumed)

    tickAgent(agent, 1, nav, dest); // idle -> chooses 0, heads back
    expect(agent.state).toBe("moving");
    expect(agent.target).toBe(0);
    expect(agent.position).toEqual(at(2));
  });

  it("approachNode returns the node one step before a distant target (stop adjacent)", () => {
    const nav = lineNav();
    const far = Agent({ id: "a", location: 0, position: at(0) });
    expect(approachNode(far, 3, nav)).toBe(2); // walk to 2, ending beside 3
  });

  it("approachNode acts in place when already adjacent or already there", () => {
    const nav = lineNav();
    const beside = Agent({ id: "a", location: 2, position: at(2) });
    expect(approachNode(beside, 3, nav)).toBe(2); // one hop away → stay and act
    expect(approachNode(beside, 2, nav)).toBe(2); // already there
  });

  it("stays put when the chooser returns the current location or null", () => {
    const nav = lineNav();
    const here = Agent({ id: "a", location: 2, position: at(2), speed: 1 });
    tickAgent(here, 1, nav, () => 2); // same node
    expect(here.state).toBe("idle");
    expect(here.position).toEqual(at(2));

    tickAgent(here, 1, nav, () => null); // no destination
    expect(here.state).toBe("idle");
    expect(here.position).toEqual(at(2));
  });
});

describe("routeAdjacent", () => {
  it("returns 'beside' when already adjacent (or on) the target — act in place", () => {
    const nav = lineNav();
    const beside = Agent({ id: "a", location: 1, position: at(1) });
    expect(routeAdjacent(beside, 2, nav)).toBe("beside");
    expect(beside.state).toBe("idle"); // no walk started

    const onIt = Agent({ id: "b", location: 2, position: at(2) });
    expect(routeAdjacent(onIt, 2, nav)).toBe("beside");
  });

  it("returns 'moving' and walks to the node BEFORE the target", () => {
    const nav = lineNav();
    const agent = Agent({ id: "a", location: 0, position: at(0) });
    expect(routeAdjacent(agent, 3, nav)).toBe("moving");
    expect(agent.state).toBe("moving");
    expect(agent.target).toBe(2); // adjacent to 3, not on it
  });

  it("returns 'unreachable' when no path exists", () => {
    const nav = lineNav();
    nav.findNodePath = () => []; // sever the graph
    const agent = Agent({ id: "a", location: 0, position: at(0) });
    expect(routeAdjacent(agent, 3, nav)).toBe("unreachable");
    expect(agent.state).toBe("idle");
  });
});

describe("trapezoidal motion (accel opt-in)", () => {
  // Integrate an accelerating agent to arrival, sampling its per-tick velocity.
  const run = (dest: NodeId, speed: number, accel: number, dt = 1 / 60) => {
    const nav = lineNav();
    const agent = Agent({ id: "a", location: 0, position: at(0), speed, accel });
    setDestination(agent, dest, nav);
    const velocities: number[] = [];
    let ticks = 0;
    while (agent.state === "moving" && ticks++ < 10_000) {
      advanceAgent(agent, dt);
      velocities.push(agent.velocity);
    }
    return { agent, velocities };
  };

  it("ramps up, cruises at top speed, then lands EXACTLY on the target", () => {
    const { agent, velocities } = run(3, 1, 2); // 3 units; cruise reachable
    expect(agent.state).toBe("idle");
    expect(agent.location).toBe(3);
    expect(agent.position).toEqual(at(3)); // arrive() snaps to the path end — no overshoot
    expect(agent.velocity).toBe(0); // at rest again

    expect(Math.max(...velocities)).toBeLessThanOrEqual(1); // never exceeds top speed
    expect(velocities.filter((v) => v > 0.99).length).toBeGreaterThan(10); // a flat cruise section
    expect(velocities[0]).toBeLessThan(0.1); // starts from rest
    expect(velocities[velocities.length - 2]).toBeLessThan(0.5); // braking at the end
  });

  it("turns into a TRIANGLE on short trips — never reaches top speed", () => {
    const { agent, velocities } = run(1, 10, 1); // peak possible: √(2·1·0.5) = 1 « 10
    expect(agent.location).toBe(1);
    expect(Math.max(...velocities)).toBeLessThan(1.2);
  });

  it("without accel, speed stays constant from the first tick (legacy behavior)", () => {
    const nav = lineNav();
    const agent = Agent({ id: "a", location: 0, position: at(0), speed: 1 });
    setDestination(agent, 3, nav);
    advanceAgent(agent, 0.5);
    expect(agent.position.x).toBeCloseTo(0.5); // full speed immediately — no ramp
  });
});

describe("tickBrain", () => {
  it("startWork sets the working state and timers", () => {
    const agent = Agent({ id: "a", location: 0, position: at(0) });
    startWork(agent, 2);
    expect(agent.state).toBe("working");
    expect(agent.workLeft).toBe(2);
    expect(agent.workTotal).toBe(2);
  });

  it("counts a work pause down and fires onWorkDone once, back at idle", () => {
    const agent = Agent({ id: "a", location: 0, position: at(0) });
    const done: string[] = [];
    startWork(agent, 1);

    tickBrain(agent, 0.6, { decide: () => done.push("decide"), onWorkDone: () => done.push("done") });
    expect(agent.state).toBe("working");
    expect(agent.workLeft).toBeCloseTo(0.4);

    tickBrain(agent, 0.6, { decide: () => done.push("decide"), onWorkDone: () => done.push("done") });
    expect(done).toEqual(["done"]); // decide never ran while working
    expect(agent.state).toBe("idle");
    expect(agent.workLeft).toBe(0);
    expect(agent.workTotal).toBe(0);
  });

  it("reports progress via onWorkTick on every working tick", () => {
    const agent = Agent({ id: "a", location: 0, position: at(0) });
    const seen: number[] = [];
    startWork(agent, 1);
    const handlers = {
      decide: () => {},
      onWorkTick: (a: Agent) => seen.push(1 - a.workLeft / a.workTotal),
    };
    tickBrain(agent, 0.5, handlers);
    tickBrain(agent, 0.5, handlers);
    expect(seen[0]).toBeCloseTo(0.5);
    expect(seen[1]).toBeCloseTo(1);
  });

  it("a decide that starts a walk advances the same tick (tickAgent precedent)", () => {
    const nav = lineNav();
    const agent = Agent({ id: "a", location: 0, position: at(0), speed: 1 });
    tickBrain(agent, 1, { decide: (a) => setDestination(a, 3, nav) });
    expect(agent.state).toBe("moving");
    expect(agent.position).toEqual(at(1));
  });

  it("fires onArrive when the walk completes; a pause started there counts down next tick", () => {
    const nav = lineNav();
    const agent = Agent({ id: "a", location: 0, position: at(0), speed: 1 });
    setDestination(agent, 1, nav);
    const log: string[] = [];
    const handlers = {
      decide: () => log.push("decide"),
      onArrive: (a: Agent) => {
        log.push("arrive");
        startWork(a, 1);
      },
    };

    tickBrain(agent, 1, handlers); // covers the unit -> arrive -> start pause
    expect(log).toEqual(["arrive"]);
    expect(agent.state).toBe("working");
    expect(agent.workLeft).toBe(1); // no countdown on the tick the pause began

    tickBrain(agent, 1, handlers);
    expect(agent.state).toBe("idle");
  });

  it("a decide that starts a pause does not count it down the same tick", () => {
    const agent = Agent({ id: "a", location: 0, position: at(0) });
    tickBrain(agent, 5, { decide: (a) => startWork(a, 1) });
    expect(agent.state).toBe("working");
    expect(agent.workLeft).toBe(1);
  });
});
