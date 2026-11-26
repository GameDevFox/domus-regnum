import { describe, expect, it } from "vitest";

import { buildGridNav } from "./grid-nav";
import { Household, Mess, Servant } from "./household";

// Variance / adversarial bench for the PERCEPTION maid-haul AI (maid-perception.ts + the
// `perception` branches in household.ts). The unit + integration tests pin the happy paths; this
// file tries to BREAK the system — many seeds, clustered maids that could livelock, degenerate
// configs — and asserts the invariants that must hold no matter what. Deletable with the feature.

// Deterministic mulberry32 (same generator the other world tests use) so a failing seed reproduces.
const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Run a house, checking the hard invariants EVERY tick, and return what it accomplished.
const runChecked = (
  house: Household,
  carryCapacity: number,
  seconds: number,
  dt = 0.25,
): { washed: number; pending: number } => {
  for (let t = 0; t < seconds; t += dt) {
    house.tick(dt);
    const carriedSeen = new Set<Mess>();
    const jobsSeen = new Set<string>();
    for (const s of house.servants) {
      // Capacity is never exceeded.
      expect(s.carrying.length).toBeLessThanOrEqual(carryCapacity);
      // No piece is carried by two maids at once (no double-haul), and a carried piece's state is
      // consistent with being in a hand.
      for (const m of s.carrying) {
        expect(carriedSeen.has(m)).toBe(false);
        carriedSeen.add(m);
        expect(m.state).toBe("carried");
      }
      // No two maids hold the same job object (the board's exclusive claim must survive perception).
      if (s.job) {
        expect(jobsSeen.has(s.job.id)).toBe(false);
        jobsSeen.add(s.job.id);
        expect(s.job.claimedBy).toBe(s.id);
      }
      // A detour piece is always a real, still-dirty target (never a stale handle).
      if (s.detour) expect(["dirty", "carried"]).toContain(s.detour.state);
    }
    // Conservation: every "carried" mess in the world is in exactly one maid's hands.
    const carriedInWorld = house.messes.filter((m) => m.state === "carried");
    expect(carriedInWorld.length).toBe(carriedSeen.size);
  }
  return { washed: house.washedCount(), pending: house.pendingMess() };
};

const maids = (nav: ReturnType<typeof buildGridNav>["nav"], nodes: number[], speed = 1.7) =>
  nodes.map((n, i) =>
    Servant({ id: `s${i}`, location: n, position: nav.positionOf(n), speed, skill: 0.6 }),
  );

describe("maid AI · variance bench (perception haul)", () => {
  it("holds every invariant across many seeds and keeps dishes draining", () => {
    let totalWashed = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const { nav } = buildGridNav(7, 7);
      const servants = maids(nav, [0, 24, 48]);
      const h = Household({
        nav,
        servants,
        messSources: [10, 16, 32, 38],
        stations: [24],
        messInterval: 3,
        noticeRadius: 6,
        carryCapacity: 1,
        rng: rng(seed),
      });
      const { washed, pending } = runChecked(h, 1, 240);
      // Limited sight is slower than omniscience, but over 4 sim-minutes the backlog can't run away.
      expect(pending).toBeLessThan(8);
      totalWashed += washed;
    }
    // Across 24 seeds the maids did real work — not a single livelocked run.
    expect(totalWashed).toBeGreaterThan(24 * 5);
  });

  it("is deterministic: same seed → identical outcome", () => {
    const build = () => {
      const { nav } = buildGridNav(6, 6);
      return Household({
        nav,
        servants: maids(nav, [0, 35]),
        messSources: [7, 14, 28],
        stations: [35],
        messInterval: 3,
        noticeRadius: 6,
        carryCapacity: 2,
        rng: rng(99),
      });
    };
    const a = build();
    const b = build();
    for (let t = 0; t < 120; t += 0.25) {
      a.tick(0.25);
      b.tick(0.25);
    }
    expect(a.washedCount()).toBe(b.washedCount());
    expect(a.pendingMess()).toBe(b.pendingMess());
  });

  it("clustered maids do not livelock fighting over one stream of dishes", () => {
    // Five maids packed at one corner, dishes appearing fast from one table near them. The classic
    // failure: everyone targets each new piece, disengages as a "closer" maid flickers, and nobody
    // ever completes a haul. The deterministic closest-maid tie-break must let exactly one win each.
    const { nav } = buildGridNav(8, 8);
    const servants = maids(nav, [0, 1, 8, 9, 2]);
    const h = Household({
      nav,
      servants,
      messSources: [4, 12, 20], // a tight stream near the cluster
      stations: [63], // far corner — long enough hauls that disengage has time to misfire
      messInterval: 1.5,
      noticeRadius: 7,
      carryCapacity: 1,
      rng: rng(5),
    });
    const { washed } = runChecked(h, 1, 200);
    // Despite the contention, the cluster makes steady progress (no permanent disengage thrash).
    expect(washed).toBeGreaterThan(8);
  });

  it("opportunistic detour never strands a maid mid-route (capacity 3)", () => {
    // High capacity + a generous detour budget: a maid could chain detours forever and never reach
    // the bin. Invariants (checked every tick) catch a stranded/over-capacity maid; here we just need
    // her to still deliver, proving the chain terminates and drains.
    const { nav } = buildGridNav(7, 7);
    const servants = maids(nav, [0]);
    const h = Household({
      nav,
      servants,
      messSources: [8, 16, 24, 32, 40],
      stations: [48],
      messInterval: 0.5,
      noticeRadius: 12,
      carryCapacity: 3,
      maxDetour: 8,
      rng: rng(3),
    });
    let maxCarried = 0;
    for (let t = 0; t < 120; t += 0.25) {
      h.tick(0.25);
      maxCarried = Math.max(maxCarried, servants[0].carrying.length);
      expect(servants[0].carrying.length).toBeLessThanOrEqual(3);
    }
    expect(maxCarried).toBeGreaterThanOrEqual(2); // she batched at least two on a run
    expect(h.washedCount()).toBeGreaterThan(2); // and the batches reached the bin
  });

  it("perception genuinely gates sight: radius 0 hauls far less than a normal radius", () => {
    // NOTE (finding): radius 0 is NOT stone-blind — `withinRadius` is inclusive, so a maid standing
    // EXACTLY on a trash node (distance 0) still notices it while wandering. That's a sound semantic
    // ("only what's literally underfoot"), so we assert behaviour, not zero: radius 0 hauls strictly
    // less than a room-sized radius on the identical setup/seed, and the sim stays invariant-sound.
    const build = (noticeRadius: number) => {
      const { nav } = buildGridNav(5, 5);
      return Household({
        nav,
        servants: maids(nav, [0, 24]),
        messSources: [6, 12, 18],
        stations: [24],
        messInterval: 2,
        noticeRadius,
        carryCapacity: 1,
        rng: rng(7),
      });
    };
    const blind = build(0);
    const sighted = build(8);
    const blindRes = runChecked(blind, 1, 120);
    const sightedRes = runChecked(sighted, 1, 120);
    expect(blindRes.washed).toBeLessThan(sightedRes.washed); // sight matters
    expect(blind.cleanliness()).toBeGreaterThan(0); // sweep is unaffected by perception
  });

  it("a single maid with a fast mess stream keeps pace without violating invariants", () => {
    const { nav } = buildGridNav(6, 6);
    const servants = maids(nav, [0]);
    const h = Household({
      nav,
      servants,
      messSources: [7, 14, 21],
      stations: [35],
      messInterval: 4,
      noticeRadius: 10,
      carryCapacity: 2,
      rng: rng(11),
    });
    const { washed } = runChecked(h, 2, 240);
    expect(washed).toBeGreaterThan(3);
  });
});
