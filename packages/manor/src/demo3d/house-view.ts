import type { Group, Object3D, PerspectiveCamera } from "three";

import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { FLOOR_ORDER, deriveWalls, stairWells } from "../space";
import type { Door, FloorId, Plan, Swing } from "../space";
import { bake } from "./bake";
import { DoorLeaves } from "./door-leaves";
import { settle, standsAbout, standsOver, watchedIndoors, watchedOne, watchedStorey } from "./cutaway";
import type { Eye, Watched } from "./cutaway";
import type { Daylight } from "./daylight";
import { Grounds, LowRoofs, Roofs } from "./exterior";
import { Fader, boxesOf, stepFaders } from "./fade";
import { b, isMoving } from "./furniture-kit";
import { Furniture } from "./furniture";
import { lightLamps } from "./lamplight";
import { group } from "./parts";
import { CUT_HEIGHT, StoreyShell, lightWindows } from "./shell";
import type { UpperWall } from "./shell";
import { StairFlight } from "./stairs";
import { SHOWN_IN, lampFloor } from "./views";

// The whole house, and the rule for what is drawn: which storeys, and which walls stand at full
// height. You pick a storey to look into; everything above it is lifted away, the walls between
// you and its rooms are cut down to the rail, and the walls beyond them are left standing: an
// outside wall stands only while it hides none of the storey's rooms from the camera (cutaway.ts).
// While someone is followed the question is asked of her room alone: every wall of her storey
// stands, inside ones too, except those that hide any of the room she is in, or her. Tall
// furniture and the stairs do not drop: they go see-through while they are in the way of her (fade.ts).
// With nobody followed there is a choice (`byRoom`): the whole storey is opened, as above, or the
// question asked of her room is asked of every room with someone in it, and the rest stay shut.
// Either way a wall may hide a small share of a room and stand (`tolerance`), and never hides anyone.

/** What is being looked at: the whole house with its roof on, or into one storey. */
export type View = "house" | FloorId;

export const VIEWS: View[] = ["house", "first", "ground", "cellar"];

/** The camera, or the person followed, has moved, and the walls are judged again, when either is this far from where it was (metres). */
const EYE_MOVED = 0.01;
/** How fast a wall rises or drops, per second. */
const WALL_SPEED = 5;

type HouseProps = {
  plan: Plan;
  view: Value<View>;
  frame: Value<number>;
  /** Seconds the house has been alive: stops while time is paused. */
  life: Value<number>;
  camera: PerspectiveCamera;
  /** Where the person being followed stands, or null when nobody is. */
  focus: Value<Eye | null>;
  /** True while walls slide up and down; false while they are there and gone at once. */
  slide: Value<boolean>;
  /** With nobody followed: true while only the rooms with someone in them are opened, false while the whole storey is. */
  byRoom: Value<boolean>;
  /** Where everybody on a storey stands just now. */
  occupants: (floor: FloorId) => Eye[];
  /** How much of a room a wall may hide and still stand, as a share of the room's floor (0 for next to nothing). */
  tolerance: Value<number>;
  /** The game's clock, in minutes, for the clocks in the house; and the light of that time of day, for its windows. */
  daytime: Value<number>;
  light: Value<Daylight>;
  /** The doors of the house and how each stands, which is the rules' to say (src/space/doors.ts). */
  doors: { doors: Door[]; swings: Swing[] };
  /** Things that stand on a storey and are not of the plan: they come and go with it, and are never fused into it. */
  extras?: Partial<Record<FloorId, Object3D>>;
  /** What stands on the grounds and is not of them: it is there whenever the grounds are. */
  outdoors?: Object3D;
};

export type HouseView = {
  mesh: Group;
  /** The walls of a storey that stand at full height just now, each as "axis at from-to". */
  standing: (floor: FloorId) => string[];
  /** How far up each wall of a storey is drawn just now: 0 down, 1 standing, between while it slides. */
  heights: (floor: FloorId) => number[];
  /** The tall furniture and stairs that are see-through just now, by name. */
  faded: () => string[];
};

export const House = (scope: Scope, { plan, view, frame, life, camera, focus, slide, byRoom, occupants, tolerance, daytime, light, doors, extras, outdoors }: HouseProps): HouseView => {
  const mesh = group();
  const walls = deriveWalls(plan);
  const storeys = new Map<FloorId, { root: Group; uppers: UpperWall[]; faders: Fader[]; leaves: DoorLeaves }>();

  /** How far the lamps are lit, from 0 to 1. */
  const lamps = scope.computed((use) => use(light).lamps);
  for (const floor of FLOOR_ORDER) {
    const shell = StoreyShell(scope.child(), { plan, floor, walls, wells: stairWells(plan, floor) });
    // Only the lamps of the storey being looked into throw their light (views.ts).
    const lit = scope.computed((use) => (lampFloor(use(view)) === floor ? use(lamps) : 0));
    const furniture = Furniture(scope.child(), { fixtures: plan.fixtures.filter((f) => f.floor === floor), life, daytime, lit });
    shell.mesh.add(furniture.mesh);
    // Each upper wall is fused on its own, because it rises and drops, and each tall piece of furniture,
    // because it goes see-through by itself; everything else on the storey is fused together.
    const moving = new Set<Object3D>(shell.uppers.map((u) => u.object));
    for (const upper of moving) bake(upper);
    const faders = furniture.tall.map((piece) => {
      const boxes = boxesOf(piece);
      // The hands of a clock go on turning: they are left out of the fusing.
      bake(piece, isMoving);
      return Fader(scope, piece, boxes);
    });
    const apart = new Set<Object3D>([...moving, ...furniture.tall]);
    bake(shell.mesh, (o) => apart.has(o));
    // The leaves of its doors swing, and each goes see-through by itself while it stands open: they are not fused either.
    const leaves = DoorLeaves(scope.child(), { floor, ...doors, uppers: shell.uppers });
    shell.mesh.add(leaves.mesh);
    faders.push(...leaves.faders);
    const extra = extras?.[floor];
    if (extra) shell.mesh.add(extra);
    const root = group(shell.mesh);
    storeys.set(floor, { root, uppers: shell.uppers, faders, leaves });
    mesh.add(root);
  }
  for (const stair of plan.stairs) {
    const flight = StairFlight(scope.child(), { plan, stair });
    // A flight is in the way where its steps are, not in the air over its low end: one box a step.
    const boxes = flight.steps.flatMap(boxesOf);
    bake(flight.mesh);
    bake(flight.guard);
    storeys.get(stair.lower)?.faders.push(Fader(scope, flight.mesh, boxes));
    storeys.get(stair.lower)?.root.add(flight.mesh);
    // A flight that is hidden under another needs no guard: there is no open well above it.
    if (stair.lower !== "cellar") storeys.get(stair.upper)?.root.add(flight.guard);
  }

  const roofs = Roofs(scope.child()).mesh;
  const lowRoofs = LowRoofs(scope.child()).mesh;
  const grounds = Grounds(scope.child(), { life, lit: lamps }).mesh;
  for (const part of [roofs, lowRoofs, grounds]) bake(part);
  // In the cellar there is no garden to stand it on: a tray of dark earth instead.
  const cellar = plan.storeys.cellar;
  const tray = b(21, 0.5, 15, "#2e2520", 9, cellar.y - 0.8, 6);
  if (outdoors) grounds.add(outdoors);
  mesh.add(roofs, lowRoofs, grounds, tray);

  scope.effect((use) => {
    const v = use(view);
    for (const floor of FLOOR_ORDER) {
      const storey = storeys.get(floor);
      if (storey) storey.root.visible = SHOWN_IN[v].includes(floor);
    }
    roofs.visible = v === "house";
    lowRoofs.visible = v === "house" || v === "first";
    grounds.visible = v !== "cellar";
    tray.visible = v === "cellar";
  });

  scope.effect((use) => {
    lightWindows(use(lamps));
    lightLamps(use(lamps));
  });

  /** What is being looked for on the storey looked into: certain people in their rooms, and every wall but those in their way; or the whole storey, over its outside walls. */
  type Looking = Watched & { whole: boolean };

  /** Decide afresh which walls of the storey being looked into stand, seen from where the camera is. */
  const judge = (v: View, looking: Looking | null, share: number): void => {
    for (const floor of SHOWN_IN[v]) {
      const storey = plan.storeys[floor];
      const [rail, top] = [storey.y + CUT_HEIGHT, storey.y + storey.height];
      for (const upper of storeys.get(floor)?.uppers ?? []) {
        // A storey below the one being looked into keeps all its walls, and has them at once. (So does every storey, with the roof on.)
        if (floor !== v || !looking) Object.assign(upper, { wanted: true, standing: true });
        // Looking over the storey: an outside wall stands while it is turned away, hides little of any room, and hides nobody.
        else if (looking.whole) upper.wanted = upper.outside && standsOver(upper.wanted, upper.wall, upper.outward, camera.position, looking.people, rail, top, looking.rooms, share);
        // Someone to be seen in her room: every wall stands but those that hide it, or her.
        else upper.wanted = standsAbout(upper.wanted, upper.wall, camera.position, looking.people, rail, top, looking.rooms, share);
      }
    }
  };

  /** What is looked for just now: the one followed in her rooms; or, by room, everybody indoors in theirs; or the whole storey. Nothing, with the roof on. */
  const lookingNow = (v: View, person: Eye | null): Looking | null => {
    if (v === "house") return null;
    if (person) return { ...watchedOne(plan, v, person), whole: false };
    return byRoom.peek() ? { ...watchedIndoors(plan, v, occupants(v)), whole: false } : { ...watchedStorey(plan, v, occupants(v)), whole: true };
  };

  let last = 0;
  const judged = { view: null as View | null, eye: { x: 0, y: 0, z: 0 }, people: null as Eye[] | null, whole: false, share: -1 };
  const apart = (a: Eye, b: Eye): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  /** Whether those to be seen are other people than they were, or any of them has moved. */
  const peopleMoved = (now: Eye[] | null, was: Eye[] | null): boolean => (now === null || was === null ? now !== was : now.length !== was.length || now.some((p, n) => apart(p, was[n]) > EYE_MOVED));
  scope.effect((use) => {
    const now = use(frame);
    const dt = Math.min(0.1, Math.max(0, now - last));
    last = now;
    const v = view.peek();
    const eye = camera.position;
    const person = focus.peek();
    const looking = lookingNow(v, person);
    const share = tolerance.peek();
    if (v !== judged.view || peopleMoved(looking?.people ?? null, judged.people) || apart(eye, judged.eye) > EYE_MOVED || (looking?.whole ?? false) !== judged.whole || share !== judged.share) {
      judge(v, looking, share);
      Object.assign(judged, { view: v, eye: { x: eye.x, y: eye.y, z: eye.z }, people: looking && looking.people.map((p) => ({ ...p })), whole: looking?.whole ?? false, share });
    }
    // Every storey's, shown or not, so that nothing is left see-through on a storey that comes back into view.
    for (const storey of storeys.values()) stepFaders(storey.faders, eye, person, dt);
    for (const floor of SHOWN_IN[v]) {
      for (const upper of storeys.get(floor)?.uppers ?? []) {
        settle(upper, dt);
        const goal = upper.standing ? 1 : 0;
        upper.shown = slide.peek() ? upper.shown + Math.max(-WALL_SPEED * dt, Math.min(WALL_SPEED * dt, goal - upper.shown)) : goal;
        // Ease the rise so a wall settles into place.
        const eased = upper.shown * upper.shown * (3 - 2 * upper.shown);
        upper.object.visible = eased > 0.004;
        upper.object.scale.y = Math.max(0.004, eased);
      }
    }
    // The doors, once their walls are where they are: a shut door's upper part is as high as its wall's.
    for (const storey of storeys.values()) storey.leaves.step(dt, slide.peek());
  });

  const standing = (floor: FloorId): string[] => (storeys.get(floor)?.uppers ?? []).filter((u) => u.standing).map((u) => `${u.wall.axis} ${u.wall.at} ${u.wall.from}-${u.wall.to}`);

  const heights = (floor: FloorId): number[] => (storeys.get(floor)?.uppers ?? []).map((u) => u.shown);

  const faded = (): string[] => [...storeys.values()].flatMap((s) => s.faders.filter((f) => f.faded).map((f) => f.name));

  return { mesh, standing, heights, faded };
};
