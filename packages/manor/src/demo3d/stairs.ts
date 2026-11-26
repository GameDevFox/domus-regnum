import { Mesh } from "three";
import type { Group } from "three";

import type { Scope } from "@scene-lib/scope";

import { riseOf, stepsOf } from "../space";
import type { Plan, Stair } from "../space";
import { block, group, metreBox, paintOf, skinOf, skins } from "./parts";
import { texture } from "./textures";

// A straight flight, built as solid steps, with a balustrade on its open side and a guard round
// the hole it comes up through.

const HANDRAIL_HEIGHT = 0.95;
const BALUSTER = 0.05;
const NEWEL = 0.13;
const GUARD_SPACING = 0.45;
const DARK_WOOD = "#4a2f1e";
const STONE = "#7d7a74";
const DOORWAY = "#1d1814";

type StairProps = { plan: Plan; stair: Stair };

export type StairView = {
  /** The flight itself, standing on the lower storey (world coordinates). */
  mesh: Group;
  /** The guard rail round the stairwell, to be shown with the upper storey. */
  guard: Group;
  /** The steps themselves: the solid bulk of the flight, for telling when it is in the way. */
  steps: Mesh[];
};

export const StairFlight = (scope: Scope, { plan, stair }: StairProps): StairView => {
  const lowY = plan.storeys[stair.lower].y;
  const rise = riseOf(plan, stair);
  const steps = stepsOf(plan, stair);
  const stepRise = rise / steps;
  const run = Math.abs(stair.zHead - stair.zFoot);
  const going = run / steps;
  const dir = Math.sign(stair.zHead - stair.zFoot);
  const grand = stair.lower !== "cellar";
  const tread = grand ? skinOf(texture("oak")) : paintOf(STONE);
  const side = grand ? skinOf(texture("wood")) : paintOf("#5f5c58");
  const stepSkin = skins({ east: side, west: side, top: tread, bottom: side, south: side, north: side });

  const mesh = group();
  mesh.name = `stair.${stair.id}`;
  mesh.position.set(stair.x, lowY, 0);
  const treads: Mesh[] = [];
  for (let i = 0; i < steps; i++) {
    const h = (i + 1) * stepRise;
    const step = new Mesh(metreBox(stair.width, h, going), stepSkin);
    step.position.set(0, h / 2, stair.zFoot + dir * (i + 0.5) * going);
    mesh.add(step);
    treads.push(step);
  }

  const open = stair.width / 2 - BALUSTER;
  if (grand) {
    const rail = paintOf(DARK_WOOD);
    const white = paintOf("#e6dcc6");
    for (let i = 0; i < steps; i += 1) mesh.add(block(BALUSTER, HANDRAIL_HEIGHT, BALUSTER, white, open, (i + 1) * stepRise, stair.zFoot + dir * (i + 0.5) * going));
    // The handrail: one long bar laid along the slope.
    const length = Math.hypot(run, rise);
    const bar = new Mesh(metreBox(0.09, 0.07, length), rail);
    bar.position.set(open, rise / 2 + stepRise / 2 + HANDRAIL_HEIGHT, (stair.zFoot + stair.zHead) / 2);
    // Tilted so the end towards the head of the flight is the high one.
    bar.rotation.x = -dir * Math.atan2(rise, run);
    mesh.add(bar);
    mesh.add(block(NEWEL, HANDRAIL_HEIGHT + 0.25, NEWEL, rail, open, 0, stair.zFoot - dir * NEWEL));
    mesh.add(block(NEWEL + 0.05, 0.07, NEWEL + 0.05, rail, open, HANDRAIL_HEIGHT + 0.25, stair.zFoot - dir * NEWEL));
    // The door under the stairs, when another flight goes down beneath this one.
    if (plan.stairs.some((s) => s.upper === stair.lower && s.x === stair.x)) {
      const face = stair.zHead + dir * 0.012;
      mesh.add(block(0.95, 2.0, 0.02, paintOf("#e6dcc6"), 0, 0, face));
      mesh.add(block(0.8, 1.9, 0.03, paintOf(DOORWAY), 0, 0, face + dir * 0.01));
    }
  }

  // The guard round the well on the storey above: along the open side and across the far end.
  const guard = group();
  guard.position.set(stair.x, lowY + rise, 0);
  const guardSkin = paintOf(grand ? DARK_WOOD : STONE);
  const pale = paintOf("#e6dcc6");
  const sideX = stair.width / 2 + BALUSTER;
  const zMin = Math.min(stair.zFoot, stair.zHead);
  for (let z = zMin; z <= zMin + run + 0.001; z += GUARD_SPACING) guard.add(block(BALUSTER, HANDRAIL_HEIGHT, BALUSTER, pale, sideX, 0, z));
  guard.add(block(0.09, 0.07, run + NEWEL, guardSkin, sideX, HANDRAIL_HEIGHT, zMin + run / 2));
  for (let x = -stair.width / 2; x <= sideX; x += GUARD_SPACING) guard.add(block(BALUSTER, HANDRAIL_HEIGHT, BALUSTER, pale, x, 0, stair.zFoot));
  guard.add(block(stair.width + NEWEL, 0.07, 0.09, guardSkin, 0, HANDRAIL_HEIGHT, stair.zFoot));

  scope.add(() => {
    for (const g of [mesh, guard]) {
      g.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    }
  });
  return { mesh, guard, steps: treads };
};
