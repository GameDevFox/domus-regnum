import { Mesh } from "three";
import type { Group } from "three";

import type { Scope } from "@scene-lib/scope";

import { hingesOf, leavesOf } from "../space";
import type { Door, FloorId, Swing } from "../space";
import { Fader, boxesOf } from "./fade";
import { group, metreBox, paintOf } from "./parts";
import { CUT_HEIGHT, DOOR_FRAME, DOOR_HEIGHT } from "./shell";
import type { UpperWall } from "./shell";

// The leaves of a storey's doors. How each door stands (shut, or how far open and which way)
// is the rules' to say (src/space/doors.ts); this draws it. A leaf is in two parts, like the
// wall it is in: below the rail, which is always there; and above it. Shut, the part above
// comes and goes with its wall, so a door in a wall that is cut down is a half door. Opening
// and open, it is at its full height whatever its wall is doing, and it is then a tall thing
// like a shelf: see-through while it is in the way of whoever is followed (fade.ts). Shut
// again, it goes back to what its wall is. (The author's rule, 2026-11-14.)

type LeavesProps = {
  floor: FloorId;
  /** Every door of the house and how each stands, in the same order. */
  doors: Door[];
  swings: Swing[];
  /** The storey's upper walls: a shut door's upper part is as high as its wall's. */
  uppers: UpperWall[];
};

export type DoorLeaves = {
  mesh: Group;
  /** One for each door of the storey: what goes see-through while it stands open in the way. */
  faders: Fader[];
  /** Move the leaves on by a moment: `slide` is whether a leaf's upper part rises and drops, or is there and gone at once. */
  step: (dt: number, slide: boolean) => void;
};

/** How far a door swings open: a little short of square to its wall. */
const OPEN_ANGLE = Math.PI * 0.47;
const THICK = 0.05;
/** How fast a leaf's upper part rises and drops, per second: as a wall does. */
const RISE_SPEED = 5;
/** Below this it is not drawn at all. */
const GONE = 0.004;
/** The knob: how big, how high, and how far in from the leaf's free edge. */
const KNOB = { size: 0.06, high: 0.78, inset: 0.1, color: "#c9a85a" };
/** What a leaf is painted: the front door, any other outside door, a door within the house, and one in the cellar. */
const PAINT = { front: "#2f5d50", outside: "#5b3a29", inside: "#7b5a3e", cellar: "#5a4a3c" };

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** The name a door's leaves are drawn under: for a script that looks for them. */
export const doorName = (door: Door): string => `door ${door.floor} ${door.axis} ${door.at} ${door.pos}`;

export const DoorLeaves = (scope: Scope, { floor, doors, swings, uppers }: LeavesProps): DoorLeaves => {
  const mesh = group();
  const drawn = doors.flatMap((door, index) => {
    if (door.floor !== floor) return [];
    const wall = uppers.find((u) => u.wall.axis === door.axis && u.wall.at === door.at && door.pos >= u.wall.from && door.pos <= u.wall.to);
    const outside = wall !== undefined && (wall.wall.low === null || wall.wall.high === null);
    const paint = paintOf(outside ? (leavesOf(door).count === 2 ? PAINT.front : PAINT.outside) : floor === "cellar" ? PAINT.cellar : PAINT.inside);
    // Built along the wall's own X, as the wall is (shell.ts), and turned onto its line.
    const frame = group();
    frame.name = doorName(door);
    if (door.axis === "x") frame.position.set(0, 0, door.at);
    else {
      frame.position.set(door.at, 0, 0);
      frame.rotation.y = -Math.PI / 2;
    }
    const { count, reach } = leavesOf(door);
    const width = reach - DOOR_FRAME * (count === 2 ? 1 : 2);
    // Each leaf hangs from its end of the doorway, just inside the frame, and reaches along the wall from there (which end, and which way, is the rules': hingesOf).
    const leaves = hingesOf(door).map(({ at, reaches }) => {
      const pivot = group();
      pivot.position.x = at + reaches * DOOR_FRAME;
      const lower = new Mesh(metreBox(width, CUT_HEIGHT, THICK), paint);
      lower.position.set((reaches * width) / 2, CUT_HEIGHT / 2, 0);
      // (One piece through the leaf, standing out on both faces of it.)
      const knob = new Mesh(metreBox(KNOB.size, KNOB.size, THICK + KNOB.size * 2), paintOf(KNOB.color));
      knob.position.set(reaches * (width - KNOB.inset), KNOB.high, 0);
      // The part above the rail stands on the rail, so that it is drawn up from it and down to it.
      const tall = DOOR_HEIGHT - DOOR_FRAME - CUT_HEIGHT;
      const panel = new Mesh(metreBox(width, tall, THICK), paint);
      panel.position.set((reaches * width) / 2, tall / 2, 0);
      const upper = group(panel);
      upper.position.y = CUT_HEIGHT;
      pivot.add(lower, knob, upper);
      return { pivot, upper, reaches };
    });
    leaves[0].pivot.name = `${frame.name} leaf`;
    leaves[0].upper.name = `${frame.name} upper`;
    frame.add(...leaves.map((leaf) => leaf.pivot));
    mesh.add(frame);
    return [{ door, index, frame, leaves, wall, fader: Fader(scope, frame, []), raised: 0 }];
  });

  const step = (dt: number, slide: boolean): void => {
    for (const entry of drawn) {
      const swing = swings[entry.index];
      // Towards the high side of the wall's line is the wall's own +Z for a wall along X, and its -Z for one along Z.
      const towards = entry.door.axis === "x" ? swing.side : -swing.side;
      const angle = smooth(swing.open) * OPEN_ANGLE;
      // Full height while it is opening or open; what its wall is, shut.
      const goal = swing.open > 0 ? 1 : 0;
      entry.raised = slide ? entry.raised + Math.max(-RISE_SPEED * dt, Math.min(RISE_SPEED * dt, goal - entry.raised)) : goal;
      const withWall = entry.wall ? (entry.wall.object.visible ? entry.wall.object.scale.y : 0) : 1;
      const rise = Math.max(smooth(entry.raised), withWall);
      for (const leaf of entry.leaves) {
        leaf.pivot.rotation.y = -leaf.reaches * towards * angle;
        leaf.upper.visible = rise > GONE;
        leaf.upper.scale.y = Math.max(GONE, rise);
      }
      // Standing open it is a tall thing in the room, and can be in the way of whoever is followed; shut, it is part of its wall, which drops instead.
      entry.fader.boxes = swing.open > 0 ? boxesOf(entry.frame) : [];
    }
  };

  scope.add(() => {
    mesh.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
  });
  return { mesh, faders: drawn.map((entry) => entry.fader), step };
};
