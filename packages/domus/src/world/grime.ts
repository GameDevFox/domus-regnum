import { Nav, NodeId } from "./nav";

// The ambient-grime layer of the "Tidy House" mess system (design doc 06-mvp-poc §4.3). Every
// walkable node carries a grime value in [0,1] that rises over time and with foot traffic, and is
// driven back to 0 when a servant sweeps it. A house-cleanliness metric (1 - mean grime) reads the
// whole field. Pure and deterministic — no rendering, no Math.random — so the chore loop is unit
// testable exactly like the rest of src/world/.
export type GrimeField = {
  nav: Nav;
  rate: number; // ambient grime gained per node per second
  grimeOf: (id: NodeId) => number;
  setGrime: (id: NodeId, v: number) => void;
  raise: (id: NodeId, amount: number) => void; // foot-traffic bump (clamped to [0,1])
  tick: (dt: number) => void; // ambient accrual across every node
  cleanliness: () => number; // 1 - mean grime, in [0,1]; 1 = spotless
  dirtiest: (threshold?: number) => NodeId[]; // nodes at/above threshold, grimiest first
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export type GrimeOptions = {
  nav: Nav;
  rate?: number; // default 0.02 / s — a node goes fully grimy in ~50s untouched
  initial?: number; // starting grime on every node (default 0)
};

export const GrimeField = ({ nav, rate = 0.02, initial = 0 }: GrimeOptions): GrimeField => {
  const grime = new Map<NodeId, number>();
  nav.nodeIds.forEach((id) => grime.set(id, clamp01(initial)));

  const grimeOf = (id: NodeId) => grime.get(id) ?? 0;
  const setGrime = (id: NodeId, v: number) => grime.set(id, clamp01(v));
  const raise = (id: NodeId, amount: number) => setGrime(id, grimeOf(id) + amount);

  return {
    nav,
    rate,
    grimeOf,
    setGrime,
    raise,

    tick: (dt) => {
      const gain = rate * dt;
      nav.nodeIds.forEach((id) => setGrime(id, grimeOf(id) + gain));
    },

    cleanliness: () => {
      if (nav.nodeIds.length === 0) return 1;
      let sum = 0;
      nav.nodeIds.forEach((id) => (sum += grimeOf(id)));
      return 1 - sum / nav.nodeIds.length;
    },

    // Grimiest first; ties broken by id so it's deterministic. Used by the job board to post sweep
    // work where the floor is dirtiest.
    dirtiest: (threshold = 0) =>
      nav.nodeIds
        .filter((id) => grimeOf(id) >= threshold && grimeOf(id) > 0)
        .sort((a, b) => grimeOf(b) - grimeOf(a) || (a < b ? -1 : a > b ? 1 : 0)),
  };
};
