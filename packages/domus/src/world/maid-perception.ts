import { Vector3 } from "three";

import { Nav, NodeId } from "./nav";

// Perception-based maid haul targeting (deletable feature — revert by deleting this file and the
// `noticeRadius` branch in household.ts). Replaces the global job-board claim for HAUL with a model
// where each maid only sees trash within a `noticeRadius` and the CLOSEST available maid within a
// piece's radius takes it. Recomputed every tick, so a closer maid taking over is exactly what makes
// the previous one disengage (household drives that off a changed assignment). Sweep stays on the
// board. Pure + structural (no household import) so it tests in isolation and stays decoupled.

// The minimal shapes the perception layer reads — structural, so this module imports nothing from
// the sim. (Servant/Mess in household.ts satisfy these.)
export type PerceivedMaid = {
  id: string;
  position: Vector3;
  carrying: readonly unknown[]; // messes in hand; empty = free-handed
  state: string; // "idle" | "moving" | "working"
};
export type PerceivedMess = {
  id: string;
  node: NodeId;
  state: string; // "dirty" | "carried" | "clean"
};

export const withinRadius = (a: Vector3, b: Vector3, r: number): boolean => a.distanceTo(b) <= r;

// A maid is AVAILABLE to (re)target a haul when she isn't carrying and isn't mid-work (sweeping or
// picking up/setting down). Idle maids AND maids en route to a mess are available — that's what lets
// a closer maid take over a piece (the en-route maid then disengages). A carrying maid is committed.
export const haulAvailable = (m: PerceivedMaid): boolean =>
  m.carrying.length === 0 && m.state !== "working";

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// Assign each DIRTY mess to the closest AVAILABLE maid within `radius` — greedy over (maid, mess)
// pairs sorted by distance, then maid id, then mess id (fully deterministic). Each maid gets at most
// one mess (the nearest she wins), each mess at most one maid. Maids/messes out of every radius get
// nothing (the maid wanders to search). Returns maidId -> the mess she should haul.
export const assignHaulTargets = <Maid extends PerceivedMaid, Mess extends PerceivedMess>(
  maids: Maid[],
  messes: Mess[],
  nav: Nav,
  radius: number,
): Map<string, Mess> => {
  const avail = maids.filter(haulAvailable);
  const dirty = messes.filter((m) => m.state === "dirty");
  const pairs: { maid: Maid; mess: Mess; d: number }[] = [];
  for (const maid of avail)
    for (const mess of dirty) {
      const d = maid.position.distanceTo(nav.positionOf(mess.node));
      if (d <= radius) pairs.push({ maid, mess, d });
    }
  pairs.sort(
    (a, b) => a.d - b.d || cmp(a.maid.id, b.maid.id) || cmp(a.mess.id, b.mess.id),
  );
  const out = new Map<string, Mess>();
  const takenMess = new Set<string>();
  for (const p of pairs) {
    if (out.has(p.maid.id) || takenMess.has(p.mess.id)) continue;
    out.set(p.maid.id, p.mess);
    takenMess.add(p.mess.id);
  }
  return out;
};

// Opportunistic DETOUR: a maid already carrying something (and not full) is walking to `stationPos`.
// Among `candidates` (dirty pieces still free to grab) within her `radius`, pick the one with the
// smallest DETOUR COST — the extra distance vs going straight to the station, `d(maid→m) +
// d(m→station) − d(maid→station)` — and only if that cost is within `maxDetour` (a "small" diversion).
// Returns the piece to swing by, or null to keep heading straight. Ties break by mess id.
export const bestDetour = <Mess extends PerceivedMess>(
  maid: PerceivedMaid,
  candidates: Mess[],
  stationPos: Vector3,
  nav: Nav,
  radius: number,
  maxDetour: number,
): Mess | null => {
  const toStation = maid.position.distanceTo(stationPos);
  let best: Mess | null = null;
  let bestCost = Infinity;
  for (const m of candidates) {
    if (m.state !== "dirty") continue;
    const mp = nav.positionOf(m.node);
    if (!withinRadius(maid.position, mp, radius)) continue; // out of sight
    const cost = maid.position.distanceTo(mp) + mp.distanceTo(stationPos) - toStation;
    if (cost > maxDetour) continue; // too big a backtrack — not "on the way"
    if (cost < bestCost || (cost === bestCost && best !== null && cmp(m.id, best.id) < 0)) {
      bestCost = cost;
      best = m;
    }
  }
  return best;
};
