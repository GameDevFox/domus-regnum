import { CylinderGeometry, Mesh } from "three";
import type { Group, Object3D } from "three";

import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import type { Rect } from "../space";
import { PLOT_AT, PLOT_SIZE, SQUARES_ACROSS, SQUARES_DEEP } from "../game";
import { b, ball, cyl } from "./furniture-kit";
import { lampPost, postGlow, stepGlows } from "./lamplight";
import { block, gableRoof, group, laidWhereItStands, metreBox, paintOf, skinOf, skins, wedge } from "./parts";
import { floorTexture, texture } from "./textures";

// What is outside the rooms: the roofs, and the piece of ground the house stands on. The ground
// is a slab with cut sides, floating in the dark, the way a tactics map is a diorama.

const EAVES_Y = 6.2;
const GROUND_FLOOR_TOP = 3.0;
const CHIMNEY_TOP = 9.3;

/** Which of a roof's two paints its gables wear (`gableRoof`: the slopes are the first, the gables the second). */
const GABLE_PAINT = 1;

type RoofSpec = { x: number; z: number; w: number; d: number; rise: number; ridge: "x" | "z" };

/** Several gables at different heights and facings, as a Victorian house would have. */
const ROOFS: RoofSpec[] = [
  { x: 1.65, z: 0.65, w: 6.7, d: 11.7, rise: 2.5, ridge: "z" }, // the service wing
  { x: 7.9, z: 0.65, w: 4.2, d: 11.7, rise: 1.7, ridge: "z" }, // over the stair hall, lower
  { x: 11.65, z: -0.35, w: 7.7, d: 6.6, rise: 2.4, ridge: "x" }, // the study, gable to the east
  { x: 11.65, z: 5.75, w: 6.7, d: 6.6, rise: 2.7, ridge: "z" }, // the bedroom, gable to the street
];

const CHIMNEYS: [number, number][] = [[6.3, 1.7], [18.5, 2.6], [17, 6.4]];

/** How high the lawn lies, against the ground floor. */
export const LAWN = -0.3;
/** How thick the dug earth of a garden plot stands on the lawn; and the low ridges that part its squares. */
export const PLOT_EARTH = 0.08;
const RIDGE = { wide: 0.06, high: 0.025, color: "#6d4c36" };

const disposeAll = (scope: Scope, root: Object3D): void =>
  scope.add(() => {
    root.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
  });

/** The main roofs and chimneys: only there when the whole house is shown. */
export const Roofs = (scope: Scope): { mesh: Group } => {
  const mesh = group();
  const roofSkin = [skinOf(texture("slate")), skinOf(texture("brick"))];
  for (const r of ROOFS) {
    const roof = new Mesh(gableRoof(r.w, r.d, r.rise, r.ridge), roofSkin);
    roof.position.set(r.x + r.w / 2, EAVES_Y, r.z + r.d / 2);
    // The brick of a gable is the brick of the wall under it, carried up: the same courses.
    mesh.add(laidWhereItStands(roof, GABLE_PAINT));
  }
  for (const [x, z] of CHIMNEYS) {
    mesh.add(laidWhereItStands(block(0.8, CHIMNEY_TOP - EAVES_Y, 0.6, skinOf(texture("brick")), x, EAVES_Y, z)));
    mesh.add(b(0.92, 0.12, 0.72, "#8d8a84", x, CHIMNEY_TOP, z));
    for (const dx of [-0.2, 0.2]) mesh.add(cyl(0.1, 0.4, "#a8553a", x + dx, CHIMNEY_TOP + 0.12, z, 0.08));
  }
  disposeAll(scope, mesh);
  return { mesh };
};

/** The low roofs over what is only one storey high: the pantry lean-to and the two bay windows. */
export const LowRoofs = (scope: Scope): { mesh: Group } => {
  const mesh = group();
  const slate = skinOf(texture("slate"));
  // The pantry's lean-to: its low edge rests on the outer wall, and it climbs to the house wall.
  // The two end walls are carried up under it as wedges of brick, so nothing shows through.
  const run = LEAN_TO.high - LEAN_TO.low;
  const rise = run * LEAN_TO.pitch;
  const tilt = Math.atan(LEAN_TO.pitch);
  const from = LEAN_TO.low - LEAN_TO.eaves;
  const slab = new Mesh(metreBox((LEAN_TO.high - from) / Math.cos(tilt), LEAN_TO.thick, LEAN_TO.zTo - LEAN_TO.zFrom + LEAN_TO.eaves * 2), slate);
  // Laid along the slope, its underside on the line from the top of the low wall to the house wall.
  const mid = (from + LEAN_TO.high) / 2;
  slab.position.set(mid, GROUND_FLOOR_TOP + ROOF_SEAT + (mid - LEAN_TO.low) * LEAN_TO.pitch + LEAN_TO.thick / 2 / Math.cos(tilt), (LEAN_TO.zFrom + LEAN_TO.zTo) / 2);
  slab.rotation.z = tilt;
  mesh.add(slab);
  for (const z of [LEAN_TO.zFrom, LEAN_TO.zTo]) {
    const gable = new Mesh(wedge(run, rise + ROOF_SEAT, WALL), skinOf(texture("brick")));
    gable.position.set((LEAN_TO.low + LEAN_TO.high) / 2, GROUND_FLOOR_TOP, z);
    mesh.add(laidWhereItStands(gable));
  }
  // Over each bay window, a canopy bevelled in on every side: a square cone with its top cut off.
  for (const bay of BAY_CANOPIES) {
    // Sheet lead, as a bay's canopy would be: a flat grey, where slates would have to be cut to every face.
    const cone = new Mesh(new CylinderGeometry(BEVEL_TOP, Math.SQRT1_2, BEVEL_HEIGHT, 4), paintOf(LEAD));
    cone.rotation.y = Math.PI / 4;
    const canopy = group(cone);
    canopy.scale.set(bay.w, 1, bay.d);
    canopy.position.set(bay.x, GROUND_FLOOR_TOP + BEVEL_HEIGHT / 2, bay.z);
    mesh.add(canopy);
  }
  disposeAll(scope, mesh);
  return { mesh };
};

/** The canopies over the shop's bay and the parlour's: where the middle of each is, and how wide and deep its base. */
const BAY_CANOPIES = [
  { x: 5.75, z: 12.42, w: 3.0, d: 1.06 },
  { x: 18.42, z: 9, w: 1.06, d: 3.5 },
];
/** A canopy's top is this share of its base. */
const BEVEL_TOP = Math.SQRT1_2 * 0.72;
const BEVEL_HEIGHT = 0.5;
const LEAD = "#59626e";

/**
 * The pantry's lean-to roof. `low` is the outer face of the pantry's far wall and `high` the
 * middle of the house wall it leans on; `zFrom` and `zTo` are the middles of its two end walls.
 */
const LEAN_TO = { low: -1.1, high: 2, zFrom: 3, zTo: 7, pitch: 0.18, eaves: 0.3, thick: 0.12 };
/** A roof sits this far above the top of the wall it rests on, so the two never share a surface. */
const ROOF_SEAT = 0.02;
const WALL = 0.2;

const GROUND = { x: -8, z: -8, w: 36, d: 30 };
/** How thick the gravel lies on the lawn. */
const GRAVEL_DEPTH = 0.02;
/** The walk along the shop front, the drive from the gate to the front steps, and the path from the back door. */
const WALK: Rect = { x: 1.7, z: 13.05, w: 9.4, d: 1.3 };
const DRIVE: Rect = { x: 9.1, z: 12.8, w: 1.8, d: 9.2 };
const BACK_PATH: Rect = { x: 2.65, z: -5.2, w: 1.2, d: 6 };
/**
 * The gravel as it is laid: the drive crosses the walk, and is laid in two lengths, one either
 * side of it. Laid whole, the two would lie at one height over the ground where they cross, and
 * what is drawn there would flicker between them as the camera moved.
 */
export const GRAVEL: Rect[] = [WALK, { ...DRIVE, d: WALK.z - DRIVE.z }, { ...DRIVE, z: WALK.z + WALK.d, d: DRIVE.z + DRIVE.d - (WALK.z + WALK.d) }, BACK_PATH];
const EARTH_DEPTH = 3.6;

const tree = (x: number, z: number, tall: number): Object3D[] => [cyl(0.22, tall * 0.4, "#5e3d25", x, 0, z, 0.16), cyl(tall * 0.42, tall * 0.5, "#3f6b34", x, tall * 0.3, z, tall * 0.2), cyl(tall * 0.32, tall * 0.45, "#4f8040", x, tall * 0.6, z, tall * 0.08), cyl(tall * 0.2, tall * 0.35, "#5c9148", x, tall * 0.88, z, 0.02)];

const roundTree = (x: number, z: number): Object3D[] => [cyl(0.2, 1.6, "#5e3d25", x, 0, z, 0.14), ball(1.3, "#4f8040", x, 2.5, z), ball(1.0, "#5c9148", x + 0.7, 3.1, z + 0.3), ball(0.9, "#3f6b34", x - 0.7, 2.9, z - 0.4)];

const FLOWERS = ["#c9697a", "#e9c46a", "#f1ece0", "#a06fb0"];

/** A flower bed along X from x0 to x1. */
const bed = (x0: number, x1: number, z: number): Object3D[] => {
  const parts: Object3D[] = [b(x1 - x0, 0.1, 0.6, "#5a3d2a", (x0 + x1) / 2, 0, z)];
  for (let x = x0 + 0.2, n = 0; x < x1; x += 0.32, n++) parts.push(ball(0.11, FLOWERS[n % FLOWERS.length], x, 0.24, z + (n % 2 === 0 ? -0.1 : 0.12)), ball(0.13, "#4f8040", x, 0.12, z));
  return parts;
};

/** Where the garden's lamp posts stand: by the gate, either side of the house's front, at the back door, and over the east lawn. */
const LAMP_POSTS: [number, number][] = [[12.6, 18.5], [11.9, 13.4], [1.6, 13.2], [4.5, -0.5], [20.6, 12.6]];

type GroundsProps = { /** Seconds the house has been alive, for the lamps' flicker. */ life: Value<number>; /** How far the lamps are lit, from 0 to 1. */ lit: Value<number> };

/** The garden: lawn, the path to the door, hedges, trees, a kitchen plot, and lamp posts. */
export const Grounds = (scope: Scope, { life, lit }: GroundsProps): { mesh: Group } => {
  const mesh = group();
  const earth = skinOf(floorTexture("earth"));
  const lawn = block(GROUND.w, EARTH_DEPTH, GROUND.d, skins({ east: earth, west: earth, top: skinOf(floorTexture("grass")), bottom: earth, south: earth, north: earth }), GROUND.x + GROUND.w / 2, -EARTH_DEPTH - 0.305, GROUND.z + GROUND.d / 2);
  mesh.add(lawn);
  const gravel = skinOf(floorTexture("gravel"));
  const lift = LAWN;
  // Its grain is laid by the ground under it, so the lengths of one path are one gravel.
  for (const r of GRAVEL) mesh.add(laidWhereItStands(block(r.w, GRAVEL_DEPTH, r.d, gravel, r.x + r.w / 2, lift, r.z + r.d / 2)));
  // Steps up to the two street doors and the back door.
  for (const [x, z, w] of [[10, 12.45, 2.2], [3.25, 12.4, 1.5]] as [number, number, number][]) {
    mesh.add(b(w, 0.15, 0.7, "#a8a39a", x, lift, z), b(w - 0.3, 0.15, 0.4, "#b5b0a6", x, lift + 0.15, z - 0.12));
  }
  mesh.add(b(1.5, 0.15, 0.6, "#a8a39a", 3.25, lift, 0.6));

  const hedge = skinOf(texture("hedge"));
  const hedgeRun = (x: number, z: number, w: number, d: number): Mesh => block(w, 1.0, d, hedge, x, lift, z);
  mesh.add(hedgeRun(0.5, 21, 15, 0.8), hedgeRun(19.5, 21, 15, 0.8), hedgeRun(-7, 8, 0.8, 26), hedgeRun(27, 8, 0.8, 26));
  // Gate piers, and the lamp posts: each throws its own light once the lamps are lit.
  for (const x of [8.6, 11.4]) mesh.add(b(0.6, 1.5, 0.6, "#a8a39a", x, lift, 21), ball(0.22, "#b5b0a6", x, lift + 1.7, 21));
  const glows = LAMP_POSTS.map(([x, z], n) => {
    mesh.add(...lampPost(x, z, lift));
    return postGlow(x, z, lift, n);
  });
  mesh.add(...glows.map((g) => g.light));
  scope.effect((use) => stepGlows(glows, use(life), use(lit)));

  /** Things built standing on y = 0 are set down on the lawn instead. */
  const onLawn = (parts: Object3D[]): Object3D[] => {
    for (const o of parts) o.position.y += lift;
    return parts;
  };
  mesh.add(...onLawn([...bed(12.6, 17.6, 12.7), ...tree(-4, 17, 5.2), ...tree(-4.5, -3.5, 6), ...tree(24, -4, 5.4), ...roundTree(23, 16.5), ...roundTree(-3, 6)]));

  // The kitchen garden behind the house: four dug plots, each ridged into its squares. What grows in them is the game's to say (garden-beds.ts).
  for (const { x, z } of PLOT_AT) {
    mesh.add(b(PLOT_SIZE.w, PLOT_EARTH, PLOT_SIZE.d, "#5a3d2a", x, lift, z));
    for (let n = 1; n < SQUARES_ACROSS; n++) mesh.add(b(RIDGE.wide, RIDGE.high, PLOT_SIZE.d, RIDGE.color, x - PLOT_SIZE.w / 2 + (n * PLOT_SIZE.w) / SQUARES_ACROSS, lift + PLOT_EARTH, z));
    for (let n = 1; n < SQUARES_DEEP; n++) mesh.add(b(PLOT_SIZE.w, RIDGE.high, RIDGE.wide, RIDGE.color, x, lift + PLOT_EARTH, z - PLOT_SIZE.d / 2 + (n * PLOT_SIZE.d) / SQUARES_DEEP));
  }
  // The yard pump and a bench under the big tree.
  mesh.add(b(0.22, 1.1, 0.22, "#3d3b3c", 0.5, lift, 0.8), b(0.5, 0.06, 0.08, "#3d3b3c", 0.75, lift + 0.95, 0.8), cyl(0.3, 0.3, "#7a5330", 1.0, lift, 0.8));
  mesh.add(b(1.6, 0.06, 0.45, "#7a5330", 21.5, lift + 0.42, 14.2), b(1.6, 0.5, 0.06, "#7a5330", 21.5, lift + 0.48, 14.42), b(0.08, 0.42, 0.4, "#3d2a1c", 20.8, lift, 14.2), b(0.08, 0.42, 0.4, "#3d2a1c", 22.2, lift, 14.2));

  disposeAll(scope, mesh);
  return { mesh };
};
