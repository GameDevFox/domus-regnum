import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
} from "three";

import { HUMAN_WALK_ACCEL, HUMAN_WALK_SPEED, r90 } from "@kitsune/common";
import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";

import { LevelNav } from "../../blocks/level-nav";
import { isGridPlacement, Level } from "../../blocks/types";
import { GrimeField } from "../../world/grime";
import { Household, Mess, Servant, ServantView, viewServant } from "../../world/household";
import { NodeId } from "../../world/nav";
import { INITIAL_GRIME, TOTAL_GRIME_RATE } from "../../world/tidy-tuning";

import { liveAgents } from "./live-agents";
import { AGENT_COLORS, avatar, mountSim, pickDistinct } from "./shared";

const SERVANT_COUNT = 3;
const SKILL_BASE = 0.5; // first servant's sweep skill; each later hire is a bit better
const SKILL_STEP = 0.15;
const MESS_INTERVAL_S = 7; // seconds between new mess drops
const DECAL_MAX_OPACITY = 0.8; // fully-grimy decal stays slightly translucent

const SERVANT_NAMES = ["Lucy", "Caroline", "Gwen", "Penelope", "Laura"];

// The Tidy House loop: servants sweep ambient grime; decals fade as tiles clean; a cleanliness
// Value feeds the React meter, and a roster Value feeds the React servant list.
export const buildTidy = (
  group: Group,
  scope: Scope,
  levelNav: LevelNav,
  level: Level,
  time: Value<number>,
  cleanliness: Value<number>,
  staff: Value<ServantView[]>,
  billboards: Value<boolean>,
): void => {
  const { nav } = levelNav;

  const decalGeo = new PlaneGeometry(level.tile * 0.96, level.tile * 0.96);
  const decals = nav.nodeIds.map((id) => {
    const mat = new MeshBasicMaterial({
      color: 0x4a3b2a,
      transparent: true,
      opacity: 0,
      side: DoubleSide,
      depthWrite: false,
    });
    const m = new Mesh(decalGeo, mat);
    m.rotation.x = -r90;
    m.position.copy(nav.positionOf(id));
    m.position.y = 0.02;
    m.renderOrder = 1;
    group.add(m);
    return { id, mat };
  });

  const starts = pickDistinct(nav.nodeIds, Math.min(SERVANT_COUNT, nav.nodeIds.length));
  const servants = starts.map((n, i) =>
    Servant({
      id: `srv${i}`,
      name: SERVANT_NAMES[i % SERVANT_NAMES.length],
      location: n,
      position: nav.positionOf(n),
      speed: HUMAN_WALK_SPEED, // m/s — the Victorian-standard 3 mph (see common/movement.ts)
      accel: HUMAN_WALK_ACCEL, // trapezoidal motion — ease out of rest, brake onto the target
      skill: SKILL_BASE + SKILL_STEP * i,
    }),
  );

  // Publish the live roster so the door-swing controller (sims/doors.ts) reacts to these maids.
  liveAgents.set(servants);
  scope.add(() => liveAgents.set([]));

  // Discrete messes (dishes): tables are mess sources, a cabinet is the kitchen/station. Derived
  // from the authored level, so they line up with the furniture you see.
  const cellNode = (block: string): NodeId[] => {
    const out: NodeId[] = [];
    for (const p of level.placements) {
      if (isGridPlacement(p) && p.block === block) {
        const n = levelNav.nodeAt(p.cell, p.y ?? 0);
        if (n !== null) out.push(n);
      }
    }
    return out;
  };
  const messSources = cellNode("table");
  const cabinets = cellNode("cabinet");
  const stations = cabinets.length ? cabinets : nav.nodeIds.slice(0, 1);

  // The demo arc runs MESSY → CLEAN: the house opens heavily grimy (patchy per-node variation so
  // the decals read like real neglect) and the maids visibly win it back, stabilizing mostly clean
  // (~85%) instead of fighting a losing battle down to a grim plateau. The ambient rate scales
  // inversely with room size so the TOTAL dirt influx is constant — comfortably below what three
  // servants can sweep regardless of how big a room you author. The recovery + equilibrium is
  // pinned by "a mostly-dirty house recovers…" in world/household.test.ts; both import the rate +
  // band from world/tidy-tuning.ts so they can't drift.
  const grime = GrimeField({ nav, rate: TOTAL_GRIME_RATE / Math.max(nav.nodeIds.length, 1) });
  nav.nodeIds.forEach((id) =>
    grime.setGrime(id, INITIAL_GRIME.base + Math.random() * INITIAL_GRIME.spread),
  );
  // Maids haul by PERCEPTION (world/maid-perception.ts): they only notice trash within this radius
  // (world meters) and the closest one within sight takes it, disengaging if a closer maid does.
  // ~6 m ≈ "across a room, not the whole manor". TUNE to taste; Infinity reverts to global sight.
  const NOTICE_RADIUS = 6;
  const house = Household({
    nav,
    servants,
    grime,
    messSources,
    stations,
    messInterval: MESS_INTERVAL_S,
    noticeRadius: NOTICE_RADIUS,
  });
  const avatars = servants.map((_, i) => {
    const a = avatar(AGENT_COLORS[(i + 2) % AGENT_COLORS.length]);
    group.add(a.group);
    return a;
  });

  // Flip every servant between the 2D billboard and 3D model when the toggle changes.
  scope.effect((use) => {
    const on = use(billboards);
    avatars.forEach((a) => a.setBillboard(on));
  });

  // Kitchen station marker (a teal pad) so the haul destination reads.
  if (messSources.length) {
    const padGeo = new BoxGeometry(0.5, 0.06, 0.5);
    const padMat = new MeshStandardMaterial({ color: 0x2bb5a0, roughness: 0.5 });
    stations.forEach((n) => {
      const pad = new Mesh(padGeo, padMat);
      pad.position.copy(nav.positionOf(n));
      pad.position.y = 0.04;
      group.add(pad);
    });
  }

  // A pool of "dirty dish" plates; reused each frame for whatever messes currently exist.
  const plateGeo = new CylinderGeometry(0.11, 0.11, 0.05, 12);
  const plateMat = new MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.4 });
  const plates = Array.from({ length: 12 }, () => {
    const m = new Mesh(plateGeo, plateMat);
    m.visible = false;
    m.castShadow = true;
    group.add(m);
    return m;
  });

  let lastSig = "";
  mountSim(scope, time, house, () => {
    servants.forEach((s, i) => avatars[i].group.position.copy(s.position));
    decals.forEach(({ id, mat }) => (mat.opacity = house.grime.grimeOf(id) * DECAL_MAX_OPACITY));
    cleanliness.set(Math.round(house.cleanliness() * 100) / 100);

    // Render dirty dishes: a dirty mess sits on its table; a carried one rides its carrier.
    const carrierOf = new Map<Mess, Servant>();
    servants.forEach((s) => {
      s.carrying.forEach((m) => carrierOf.set(m, s)); // each carried mess rides its carrier
    });
    plates.forEach((plate, i) => {
      const mess = house.messes[i];
      if (!mess) {
        plate.visible = false;
        return;
      }
      plate.visible = true;
      if (mess.state === "carried") {
        const carrier = carrierOf.get(mess);
        if (carrier) {
          plate.position.copy(carrier.position);
          plate.position.y = 1.2; // clear of both avatar looks (3D ~0.72, 2D billboard 1.1)
        }
      } else {
        plate.position.copy(nav.positionOf(mess.node));
        plate.position.y = 0.78; // resting on the table top
      }
    });

    // Publish the roster only when something legible changed (activity/task/progress bucket), so the
    // React list doesn't re-render every frame on position churn.
    const views = servants.map(viewServant);
    const sig = views.map((v) => `${v.activity}:${v.task}:${Math.round(v.progress * 5)}`).join("|");
    if (sig !== lastSig) {
      lastSig = sig;
      staff.set(views);
    }
  });
};
