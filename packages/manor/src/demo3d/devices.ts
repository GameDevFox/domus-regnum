import { Mesh } from "three";
import type { Group, Object3D } from "three";

import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import type { DeviceId } from "../game";
import { BRASS, IRON, b, ball, cyl, timber } from "./furniture-kit";
import { group } from "./parts";

// The Master's devices, where each is put to work: a thing made is seen in its room the moment
// it is made, not only named in a list. Each is a handful of boxes in the ground floor's frame
// (metres, y up from its floor), set against the furniture it serves: the dumbwaiter on the wall
// the kitchen shares with the pantry, the ever-warm fittings on the oven, the till on the counter.

/** The colour alchemy burns with, wherever it is at work. */
const ALCHEMY = "#5fd3c4";
const ALCHEMY_HOT = "#bdf3ff";
const DARK = "#1b1512";
const FLOUR = "#e9e2d0";
const LOAF = "#b9793c";

/** The kitchen's west wall, and where along it the dumbwaiter stands (north of the pantry door). */
const KITCHEN_WEST = 2;
const HATCH_Z = 3.6;
/** The oven, as the plan has it: its middle, and how far its front and its top are from that. */
const OVEN = { x: 7.3, z: 1.6, front: 0.5, top: 1.5 };
/** The counter's top, and where along it the till sits: clear of the scales and the old till. */
const COUNTER = { x: 5.0, z: 9.6, top: 1.0 };

const dumbwaiter = (): Object3D[] => {
  const depth = 0.34;
  const x = KITCHEN_WEST + depth / 2;
  const mouth = KITCHEN_WEST + depth;
  return [
    // A cupboard against the wall, with an open mouth at the height of the hands.
    timber(depth, 1.5, 0.8, x, 0, HATCH_Z),
    b(0.02, 0.5, 0.62, DARK, mouth + 0.002, 0.72, HATCH_Z),
    b(0.05, 0.05, 0.7, BRASS, mouth + 0.01, 0.67, HATCH_Z),
    b(0.05, 0.05, 0.7, BRASS, mouth + 0.01, 1.22, HATCH_Z),
    // A sack come up in it, and the line of light it rides on.
    b(0.2, 0.3, 0.26, FLOUR, mouth - 0.06, 0.74, HATCH_Z - 0.12),
    b(0.2, 0.12, 0.24, LOAF, mouth - 0.06, 0.74, HATCH_Z + 0.17),
    b(0.02, 0.04, 0.62, ALCHEMY, mouth + 0.012, 1.3, HATCH_Z),
    // The wheel it runs over, and the stone that turns it.
    timber(depth + 0.04, 0.06, 0.86, x, 1.5, HATCH_Z),
    cyl(0.13, 0.05, IRON, x, 1.56, HATCH_Z),
    ball(0.07, ALCHEMY, x, 1.68, HATCH_Z),
  ];
};

const everwarm = (): Object3D[] => {
  const face = OVEN.z + OVEN.front;
  return [
    // The fire in its mouth burns pale and steady, in a brass collar, with a stone at each shoulder.
    b(0.46, 0.26, 0.02, ALCHEMY_HOT, OVEN.x, 0.63, face + 0.03),
    b(0.62, 0.05, 0.05, BRASS, OVEN.x, 1.06, face + 0.02),
    b(0.05, 0.5, 0.05, BRASS, OVEN.x - 0.31, 0.58, face + 0.02),
    b(0.05, 0.5, 0.05, BRASS, OVEN.x + 0.31, 0.58, face + 0.02),
    ball(0.08, ALCHEMY, OVEN.x - 0.4, OVEN.top + 0.06, OVEN.z + 0.32),
    ball(0.08, ALCHEMY, OVEN.x + 0.4, OVEN.top + 0.06, OVEN.z + 0.32),
  ];
};

const till = (): Object3D[] => [
  // A brass engine on the counter with its works on top, a lit slot towards the customer, and a tray of loaves to hand.
  b(0.5, 0.34, 0.36, BRASS, COUNTER.x, COUNTER.top, COUNTER.z),
  b(0.36, 0.1, 0.02, DARK, COUNTER.x, COUNTER.top + 0.05, COUNTER.z + 0.185),
  b(0.3, 0.05, 0.02, ALCHEMY, COUNTER.x, COUNTER.top + 0.22, COUNTER.z + 0.185),
  cyl(0.13, 0.04, "#8a6a2a", COUNTER.x - 0.1, COUNTER.top + 0.34, COUNTER.z),
  cyl(0.08, 0.05, "#d8b25a", COUNTER.x + 0.13, COUNTER.top + 0.34, COUNTER.z - 0.05),
  ball(0.05, ALCHEMY, COUNTER.x - 0.1, COUNTER.top + 0.4, COUNTER.z),
  b(0.5, 0.03, 0.34, "#6d4a2c", COUNTER.x + 0.62, COUNTER.top, COUNTER.z + 0.1),
  b(0.2, 0.1, 0.13, LOAF, COUNTER.x + 0.5, COUNTER.top + 0.03, COUNTER.z + 0.1),
  b(0.2, 0.1, 0.13, LOAF, COUNTER.x + 0.74, COUNTER.top + 0.03, COUNTER.z + 0.12),
];

const BUILD: Record<DeviceId, () => Object3D[]> = { dumbwaiter, everwarm, till };

type DevicesProps = { /** The devices that have been made. */ made: Value<DeviceId[]> };

/** Every device made so far, to stand on the ground floor. A device is added to the picture when it is made. */
export const Devices = (scope: Scope, { made }: DevicesProps): { mesh: Group } => {
  const mesh = group();
  const built = new Map<DeviceId, Group>();
  scope.effect((use) => {
    for (const id of use(made)) {
      if (built.has(id)) continue;
      const piece = group(...BUILD[id]());
      piece.name = `device.${id}`;
      built.set(id, piece);
      mesh.add(piece);
    }
  });
  scope.add(() => {
    mesh.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
  });
  return { mesh };
};
