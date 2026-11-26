import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { buildGridNav } from "./grid-nav";
import { GrimeField } from "./grime";
import { Household, Servant } from "./household";
import { buildNavMesh } from "./navmesh";
import { INITIAL_GRIME, TOTAL_GRIME_RATE } from "./tidy-tuning";

// Deterministic mulberry32 so seeded runs reproduce exactly.
const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const runFor = (house: Household, seconds: number, dt = 0.25) => {
  for (let t = 0; t < seconds; t += dt) house.tick(dt);
};

describe("Household", () => {
  it("an unattended house gets dirtier over time", () => {
    const { nav } = buildGridNav(4, 4);
    const house = Household({ nav, servants: [], rng: rng(1) });
    expect(house.cleanliness()).toBe(1);
    runFor(house, 20);
    expect(house.cleanliness()).toBeLessThan(1);
  });

  it("servants keep the house cleaner than leaving it unattended", () => {
    const grid = () => buildGridNav(5, 5).nav;

    const emptyNav = grid();
    const empty = Household({ nav: emptyNav, servants: [], rng: rng(7) });
    runFor(empty, 40);

    const staffedNav = grid();
    const staff = [
      Servant({ id: "s0", name: "Mae", location: 0, position: staffedNav.positionOf(0), speed: 1.6 }),
      Servant({ id: "s1", name: "Bram", location: 24, position: staffedNav.positionOf(24), speed: 1.6 }),
      Servant({ id: "s2", name: "Cora", location: 12, position: staffedNav.positionOf(12), speed: 1.6 }),
    ];
    const staffed = Household({ nav: staffedNav, servants: staff, rng: rng(7) });
    runFor(staffed, 40);

    expect(staffed.cleanliness()).toBeGreaterThan(empty.cleanliness());
  });

  it("a servant sweeps a dirty node back to clean", () => {
    const { nav } = buildGridNav(4, 4);
    const grime = GrimeField({ nav, rate: 0.005 }); // slow ambient so the spot can actually be cleaned
    grime.setGrime(5, 1); // one filthy node
    const servant = Servant({ id: "s", location: 1, position: nav.positionOf(1), speed: 1.6 });
    const house = Household({ nav, servants: [servant], grime, rng: rng(2) });

    let minAtNode = 1;
    for (let t = 0; t < 30; t += 0.25) {
      house.tick(0.25);
      minAtNode = Math.min(minAtNode, grime.grimeOf(5));
    }
    expect(minAtNode).toBeLessThan(0.05); // it got swept
  });

  it("posts jobs and a servant claims one during a run", () => {
    const { nav } = buildGridNav(4, 4);
    const servant = Servant({ id: "s", location: 0, position: nav.positionOf(0), speed: 1.6 });
    const house = Household({ nav, servants: [servant], rng: rng(3) });

    let everClaimed = false;
    for (let t = 0; t < 40; t += 0.25) {
      house.tick(0.25);
      if (servant.job !== null) everClaimed = true;
    }
    expect(everClaimed).toBe(true);
    expect(house.board.jobs.length).toBeGreaterThan(0); // mess keeps the board stocked
  });

  it("does not deadlock on an unreachable job — it releases the claim and keeps going", () => {
    // Two nodes with NO edge between them: node 1 is filthy but unreachable from node 0.
    const { nav } = buildNavMesh([new Vector3(0, 0, 0), new Vector3(5, 0, 0)], []);
    const grime = GrimeField({ nav, rate: 0 });
    grime.setGrime(1, 1); // posts a sweep job the servant can never reach
    const servant = Servant({ id: "s", location: 0, position: nav.positionOf(0), speed: 1.6 });
    const house = Household({ nav, servants: [servant], grime });

    for (let t = 0; t < 20; t += 0.25) house.tick(0.25);

    // The servant isn't stuck holding a phantom claim, and the unreachable job wasn't leaked as
    // permanently claimed (so another, reachable servant could still take it).
    expect(servant.job).toBeNull();
    const job = house.board.jobs.find((j) => j.node === 1);
    expect(job?.claimedBy ?? null).toBeNull();
  });

  it("spawns discrete messes over time and posts haul jobs for them", () => {
    const { nav } = buildGridNav(5, 5);
    // No servants, so the mess just accumulates and we can inspect the board.
    const house = Household({
      nav,
      servants: [],
      messSources: [6, 18],
      stations: [0],
      messInterval: 1,
      rng: rng(4),
    });
    for (let t = 0; t < 3; t += 0.25) house.tick(0.25);
    expect(house.messes.length).toBeGreaterThan(0);
    expect(house.messes.some((m) => m.state === "dirty")).toBe(true);
    expect(house.board.jobs.some((j) => j.type === "haul")).toBe(true);
  });

  it("a servant hauls a dirty mess to a station and sets it down clean", () => {
    const { nav } = buildGridNav(5, 5);
    const servant = Servant({ id: "s", location: 12, position: nav.positionOf(12), speed: 1.8 });
    const house = Household({
      nav,
      servants: [servant],
      messSources: [6], // a single table
      stations: [24], // the kitchen
      messInterval: 1,
      rng: rng(5),
    });

    for (let t = 0; t < 40; t += 0.25) house.tick(0.25);

    // Over the run, at least one dish made it to the kitchen, and the servant isn't stuck holding one.
    expect(house.washedCount()).toBeGreaterThan(0);
    expect(servant.carrying).toEqual([]);
  });

  it("is deterministic for the same seed", () => {
    const build = () => {
      const { nav } = buildGridNav(5, 5);
      const servants = [
        Servant({ id: "s0", location: 0, position: nav.positionOf(0), speed: 1.5 }),
        Servant({ id: "s1", location: 24, position: nav.positionOf(24), speed: 1.5 }),
      ];
      return Household({ nav, servants, rng: rng(99) });
    };

    const trace = (house: Household) => {
      const out: number[] = [];
      for (let i = 0; i < 80; i++) {
        house.tick(0.25);
        out.push(Number(house.cleanliness().toFixed(6)));
      }
      return out;
    };

    expect(trace(build())).toEqual(trace(build()));
  });

  // The demo arc: the house STARTS mostly messy and the maids drive it to a mostly-clean
  // equilibrium (rather than ambient grime outrunning them down to a grim plateau). Uses the same
  // room-size-scaled ambient rate as buildTidy, with the dish system on so hauls compete for
  // servant time like the real demo.
  it("a mostly-dirty house recovers to mostly clean and stabilizes there", () => {
    const { nav } = buildGridNav(12, 10); // ~a manor-sized floor (120 nodes)
    const random = rng(11);
    const grime = GrimeField({ nav, rate: TOTAL_GRIME_RATE / nav.nodeIds.length });
    nav.nodeIds.forEach((id) => grime.setGrime(id, INITIAL_GRIME.base + random() * INITIAL_GRIME.spread));

    const servants = [0, 59, 119].map((n, i) =>
      Servant({
        id: `s${i}`,
        location: n,
        position: nav.positionOf(n),
        speed: 1.6,
        skill: 0.5 + 0.15 * i,
      }),
    );
    const house = Household({
      nav,
      servants,
      grime,
      rng: rng(12),
      messSources: [30, 90],
      stations: [60],
      messInterval: 7,
    });

    expect(house.cleanliness()).toBeLessThan(0.4); // opens messy

    runFor(house, 480); // 8 sim-minutes of work
    expect(house.cleanliness()).toBeGreaterThan(0.75); // mostly clean

    runFor(house, 240); // …and it STAYS there (equilibrium, not a lucky peak)
    expect(house.cleanliness()).toBeGreaterThan(0.75);
  });
});

// Perception haul (maid-perception.ts): with a finite noticeRadius the haul brain uses
// closest-maid-within-sight targeting instead of the global board claim. Sweep stays on the board.
describe("Household · perception haul (noticeRadius)", () => {
  it("a maid hauls a mess within her noticeRadius (the perception path works end to end)", () => {
    const { nav } = buildGridNav(5, 5);
    const servant = Servant({ id: "s", location: 12, position: nav.positionOf(12), speed: 1.8 });
    const house = Household({
      nav,
      servants: [servant],
      messSources: [6],
      stations: [24],
      messInterval: 1,
      noticeRadius: 4, // node 12 → node 6 is ~1.4 away, well in sight
      rng: rng(5),
    });
    for (let t = 0; t < 40; t += 0.25) house.tick(0.25);
    expect(house.washedCount()).toBeGreaterThan(0);
    expect(servant.carrying).toEqual([]);
  });

  it("never lets two maids carry the same mess, and stays deterministic", () => {
    const build = () => {
      const { nav } = buildGridNav(5, 5);
      const servants = [
        Servant({ id: "s0", location: 6, position: nav.positionOf(6), speed: 1.6 }),
        Servant({ id: "s1", location: 8, position: nav.positionOf(8), speed: 1.6 }),
      ];
      return Household({
        nav,
        servants,
        messSources: [7], // one table both maids can see
        stations: [24],
        messInterval: 2,
        noticeRadius: 6,
        rng: rng(21),
      });
    };
    const house = build();
    let maxCarriers = 0;
    const trace: number[] = [];
    for (let i = 0; i < 200; i++) {
      house.tick(0.25);
      const carried = house.servants.flatMap((s) => s.carrying);
      maxCarriers = Math.max(maxCarriers, carried.length);
      // No two maids ever hold the SAME mess instance.
      expect(new Set(carried).size).toBe(carried.length);
      trace.push(Number(house.cleanliness().toFixed(6)));
    }
    expect(house.washedCount()).toBeGreaterThan(0); // work still gets done
    // Same seed → identical trace (perception is deterministic).
    const house2 = build();
    const trace2: number[] = [];
    for (let i = 0; i < 200; i++) {
      house2.tick(0.25);
      trace2.push(Number(house2.cleanliness().toFixed(6)));
    }
    expect(trace2).toEqual(trace);
    expect(maxCarriers).toBeLessThanOrEqual(2);
  });

  it("a maid disengages when a closer maid takes over her target", () => {
    const { nav } = buildGridNav(5, 5);
    const a = Servant({ id: "a", location: 0, position: nav.positionOf(0), speed: 1.4 });
    const b = Servant({ id: "b", location: 24, position: nav.positionOf(24), speed: 1.4 });
    const house = Household({
      nav,
      servants: [a, b],
      messSources: [7],
      stations: [12],
      messInterval: 0.1,
      noticeRadius: 8,
      rng: rng(4),
    });

    // Tick once: a mess spawns at node 7; A (node 0, ~2.2 away) is closer than B (node 24, ~3.6) and
    // claims it; A is now walking toward it (still several nodes out, not yet beside it).
    house.tick(0.25);
    const mess = house.messes.find((m) => m.state === "dirty");
    expect(mess).toBeTruthy();
    expect(a.job?.type).toBe("haul");

    // B is suddenly right on the table — now strictly closer than the en-route A.
    b.position.copy(nav.positionOf(7));
    house.tick(0.25);

    // A let go of the piece (disengaged) and never picked it up; she released it (not still hers).
    expect(a.job?.type === "haul").toBe(false);
    expect(a.carrying).toEqual([]);
    const haulJob = house.board.jobs.find((j) => j.type === "haul");
    expect(haulJob ? haulJob.claimedBy !== "a" : true).toBe(true);

    // Liveness: the handoff doesn't strand the piece — someone still cleans it.
    for (let t = 0; t < 80 && house.washedCount() === 0; t += 0.25) house.tick(0.25);
    expect(house.washedCount()).toBeGreaterThan(0);
  });

  it("perception maids keep up with dishes on a manor-sized floor (haul stays bounded)", () => {
    const { nav } = buildGridNav(12, 10); // ~120-node manor floor
    const servants = [0, 59, 119].map((n, i) =>
      Servant({ id: `s${i}`, location: n, position: nav.positionOf(n), speed: 1.6, skill: 0.6 }),
    );
    const house = Household({
      nav,
      servants,
      messSources: [30, 64, 90], // tables spread across the floor
      stations: [55],
      messInterval: 5,
      noticeRadius: 6, // the in-game value — only see ~a room away
      rng: rng(13),
    });
    runFor(house, 480); // 8 sim-minutes
    // Limited sight is SLOWER than omniscience but the wandering maids still find + clear dishes:
    // a healthy number washed and the backlog doesn't run away.
    expect(house.washedCount()).toBeGreaterThan(5);
    expect(house.pendingMess()).toBeLessThan(6);
  });

  it("a maid grabs a second piece on the way to the station (carryCapacity > 1)", () => {
    // 5×5 grid; one maid at node 0 hauls to the station at node 24 (the far diagonal corner).
    // Two tables at nodes 6 and 12 sit ~on the 0→24 diagonal, so the second is a tiny detour off
    // the route to the station — she should pick up #1, then swing through #2 with hands not yet
    // full, arriving carrying BOTH.
    const { nav } = buildGridNav(5, 5);
    const maid = Servant({ id: "m", location: 0, position: nav.positionOf(0), speed: 1.8 });
    const house = Household({
      nav,
      servants: [maid],
      messSources: [6, 12],
      stations: [24],
      messInterval: 0.25,
      noticeRadius: 10,
      carryCapacity: 2,
      maxDetour: 5,
      rng: rng(8),
    });
    let maxCarried = 0;
    for (let t = 0; t < 60; t += 0.25) {
      house.tick(0.25);
      maxCarried = Math.max(maxCarried, maid.carrying.length);
    }
    // She held two dishes at once (the detour worked) and the station still drained them.
    expect(maxCarried).toBe(2);
    expect(house.washedCount()).toBeGreaterThanOrEqual(2);
  });
});
