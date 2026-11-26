import { Group, Object3D, Vector3 } from "three";

import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";

import { liveAgents } from "./live-agents";
import { mountSim } from "./shared";

// Swinging-door PoC. Every doorway under the level group exposes its hinge pivot as
// `userData.doorLeaf` (see blocks/kinds/structural.ts `Doorway`). This controller swings a door open
// when a live maid's PATH runs through its opening and she's within OPEN_RADIUS, then eases it shut
// once she's clear. Visual only — the opening stays nav-passable (maids path through as before).

const OPEN_ANGLE = 1.9; // ~109° leaf swing — obtuse (past square), so the opening reads fully clear
const OPEN_RADIUS = 1.5; // a maid this close (with her path through the opening) opens it
const CLOSE_RADIUS = 2.5; // once open, stays open until she's this far clear (hysteresis, no flapping)
const PATH_MARGIN = 0.4; // how close her path polyline must pass to the door center to count as "through"
const EASE = 8; // angular ease rate (per second-ish); higher = snappier

type Door = {
  pivot: Group;
  pos: Vector3; // door center, LEVEL space (same frame as Agent.position — both pre-`-center` offset)
  openW: number;
  openSign: number; // FIXED swing direction from the door's config (hinge + swingOut) — never flips
  angle: number; // current leaf rotation (rad)
  target: number; // target rotation (0 = closed; openSign·OPEN_ANGLE when a maid is passing)
};

// Min XZ distance from a point to a polyline — used to test whether a maid's path runs through a door.
const distToPath = (px: number, pz: number, path: Vector3[]): number => {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return Math.hypot(px - path[0].x, pz - path[0].z);
  let min = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const ax = path[i].x;
    const az = path[i].z;
    const dx = path[i + 1].x - ax;
    const dz = path[i + 1].z - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
    min = Math.min(min, Math.hypot(px - (ax + t * dx), pz - (az + t * dz)));
  }
  return min;
};

// Mount the controller for the doorways under `group`. Re-collects handles on each mount (a level
// swap rebuilds `group`, re-running the effect), so they never go stale.
export const mountDoors = (scope: Scope, group: Group, time: Value<number>): void => {
  const doors: Door[] = [];
  group.children.forEach((child: Object3D) => {
    const pivot = child.userData.doorLeaf as Group | undefined;
    if (!pivot) return;
    // child.position is LEVEL-space (mountLevel applies the placement transform; the `-center` render
    // offset lives on the parent group, equally on the sim group — so comparing raw child.position
    // against raw Agent.position needs no world-space conversion).
    doors.push({
      pivot,
      pos: child.position.clone(),
      openW: (child.userData.openW as number) ?? 0.9,
      openSign: (child.userData.doorOpenSign as number) ?? 1,
      angle: 0,
      target: 0,
    });
  });
  if (doors.length === 0) return;

  mountSim(scope, time, {
    tick: (dt: number) => {
      const agents = liveAgents.peek();
      doors.forEach((d) => {
        // Open while any maid's path runs through this opening and she's within range; the radius
        // widens once open (hysteresis) so the door holds until she's completely clear, then closes.
        // Direction is the door's FIXED config — it never flips as she crosses the threshold.
        const radius = d.target !== 0 ? CLOSE_RADIUS : OPEN_RADIUS;
        const open = agents.some(
          (a) =>
            distToPath(d.pos.x, d.pos.z, a.path) < d.openW / 2 + PATH_MARGIN &&
            Math.hypot(a.position.x - d.pos.x, a.position.z - d.pos.z) < radius,
        );
        d.target = open ? OPEN_ANGLE * d.openSign : 0;
        d.angle += (d.target - d.angle) * Math.min(1, dt * EASE);
        d.pivot.rotation.y = d.angle;
      });
    },
  });
};
