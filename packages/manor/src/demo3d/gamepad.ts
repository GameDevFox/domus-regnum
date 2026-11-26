import { panBasis } from "@scene-lib/wasd-pan";
import type { PanControls } from "@scene-lib/wasd-pan";
import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";
import { Spherical, Vector3 } from "three";
import type { Camera } from "three";

import { ACTION } from "./page-tuning";

// A controller, at its most basic (the author's asking, 2026-11-14): the left stick moves the
// view as W A S D do, the triggers turn it as Q and E do, the shoulder buttons go from one of
// the household to the next as 1, 2, 3 and 4 do (and then to nobody), and up and down on the
// directional pad change floor as R and F do. It is read once a frame, as the browser gives it
// (the Gamepad API's standard layout). A button is bound to an action, by the action's name, as
// a key is: there is one list of what can be done, and keys and buttons both point into it. The
// stick is not keys held down but a push of so much, so the view moves as far as it is leant.
// The right stick turns the view about what is looked at, and tilts it, as a drag of the mouse
// does: freely, not from one diagonal to the next.

/** In the standard layout: the two sticks' axes, the two shoulder buttons, the two triggers, and up and down on the directional pad. */
const STICK = { x: 0, y: 1 };
const RIGHT_STICK = { x: 2, y: 3 };
const LEFT_SHOULDER = 4;
const RIGHT_SHOULDER = 5;
const LEFT_TRIGGER = 6;
const RIGHT_TRIGGER = 7;
const PAD_UP = 12;
const PAD_DOWN = 13;
/** Each button, and the action it is bound to. */
export const PAD_ACTIONS: [number, string][] = [
  [LEFT_SHOULDER, ACTION.focusPrevious],
  [RIGHT_SHOULDER, ACTION.focusNext],
  [LEFT_TRIGGER, ACTION.turnAnticlockwise],
  [RIGHT_TRIGGER, ACTION.turnClockwise],
  [PAD_UP, ACTION.floorUp],
  [PAD_DOWN, ACTION.floorDown],
];
/** What each button is called, as it is on most controllers; and the two sticks. */
const PAD_NAMES: Record<number, string> = { [LEFT_SHOULDER]: "LB", [RIGHT_SHOULDER]: "RB", [LEFT_TRIGGER]: "LT", [RIGHT_TRIGGER]: "RT", [PAD_UP]: "D-pad ↑", [PAD_DOWN]: "D-pad ↓" };
export const PAD_STICKS = { left: "Left stick", right: "Right stick" };
/** The button an action is bound to, by its name; nothing, if it has none. */
export const padOf = (action: string): string | undefined => PAD_ACTIONS.flatMap(([button, bound]) => (bound === action ? [PAD_NAMES[button]] : []))[0];
/** A stick at rest is seldom quite at rest: nearer the middle than this, it is not leant at all. */
const DEAD_ZONE = 0.2;
/** A frame is never reckoned longer than this, in seconds: a pause in the drawing does not throw the view across the house. */
const LONGEST_FRAME = 0.1;

/**
 * How far a stick is leant, each way from -1 to 1: nothing inside the dead zone, and from there
 * rising evenly to the full, so that there is no jump as it leaves the middle. Never more than
 * the full, whatever the pad says of a corner.
 */
export const leanOf = (x: number, y: number): { x: number; y: number } => {
  const far = Math.hypot(x, y);
  if (far <= DEAD_ZONE) return { x: 0, y: 0 };
  const lean = Math.min(1, (far - DEAD_ZONE) / (1 - DEAD_ZONE)) / far;
  return { x: x * lean, y: y * lean };
};

/** The actions of the buttons that have gone down since they were last looked at: a button held does its action once. */
export const newlyDown = (buttons: readonly ({ pressed: boolean } | undefined)[], was: Set<number>): string[] => {
  const actions: string[] = [];
  for (const [button, action] of PAD_ACTIONS) {
    const down = buttons[button]?.pressed ?? false;
    if (down && !was.has(button)) actions.push(action);
    if (down) was.add(button);
    else was.delete(button);
  }
  return actions;
};

/**
 * Who is gone to next, a step on or back from whoever is followed now: round the household in
 * the order of its list, and then nobody, and then the first again. (From someone who is not
 * of the household, or from nobody: the first of it going on, the last going back.)
 */
export const focusAfter = (household: string[], now: string | null, step: 1 | -1): string | null => {
  const round = [...household, null];
  const at = household.includes(now ?? "") ? round.indexOf(now) : round.length - 1;
  return round[(at + step + round.length) % round.length];
};

/** Move the view across the floor: so far to the camera's right, and so far away from it, in metres. */
export const panView = (controls: PanControls, camera: Camera, right: number, away: number): void => {
  const basis = panBasis(camera, false);
  const move = basis.right.multiplyScalar(right).add(basis.fwd.multiplyScalar(away));
  controls.target.add(move);
  camera.position.add(move);
  controls.update();
};

/**
 * Turn the view about what it looks at, and tilt it: so far round (in radians: more is the
 * camera going round to the east from the south), and so far down towards the level (more is
 * lower). How steep and how shallow it may look is the controls' to hold it to, as they do a drag.
 */
export const orbitView = (controls: PanControls, camera: Camera, round: number, down: number): void => {
  const from = new Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  from.theta += round;
  from.phi += down;
  camera.position.copy(controls.target).add(new Vector3().setFromSpherical(from));
  controls.update();
};

type PadProps = {
  /** Ticks once a frame, in seconds. */
  frame: Value<number>;
  /** Do an action, by its name. */
  act: (action: string) => void;
  /** The stick is leant: so far right (-1 to 1) and so far down (-1 to 1), for so many seconds. */
  lean: (x: number, y: number, seconds: number) => void;
  /** The right stick is leant: the same, for turning and tilting the view. */
  look: (x: number, y: number, seconds: number) => void;
  /** Whether the pad is heard at all just now. */
  heard: () => boolean;
};

export const mountGamepad = (scope: Scope, { frame, act, lean, look, heard }: PadProps): void => {
  const was = new Set<number>();
  let last: number | null = null;
  scope.effect((use) => {
    const now = use(frame);
    const seconds = Math.min(LONGEST_FRAME, last === null ? 0 : now - last);
    last = now;
    // The first pad there is. (A browser shows none until a button on one has been pressed.)
    const pad = navigator.getGamepads?.().find((p) => p !== null && p.connected);
    if (!pad) return;
    // What went down while the pad was not heard is not done when it is heard again.
    const actions = newlyDown(pad.buttons, was);
    if (!heard()) return;
    for (const action of actions) act(action);
    const { x, y } = leanOf(pad.axes[STICK.x] ?? 0, pad.axes[STICK.y] ?? 0);
    if (x !== 0 || y !== 0) lean(x, y, seconds);
    const turn = leanOf(pad.axes[RIGHT_STICK.x] ?? 0, pad.axes[RIGHT_STICK.y] ?? 0);
    if (turn.x !== 0 || turn.y !== 0) look(turn.x, turn.y, seconds);
  });
};
