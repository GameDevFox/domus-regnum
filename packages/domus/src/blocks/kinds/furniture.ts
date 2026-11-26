import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
} from "three";

import { color, mat, num, standingBox } from "../block-materials";
import { BlockParams } from "../types";

// Furniture & props: free-placement (but grid-friendly) block kinds. Built in LOCAL space with the
// footprint on local y=0; the interpreter positions/rotates them. `face` orients the ones with a
// front (chair back, bed headboard, fireplace).
//
// Curved geometry stays at PS1/PS2 density on purpose (the game's look): cylinders 6-10 sides,
// spheres ≤ 8×5 — at dollhouse scale they still read as round, and the curved props are where the
// triangle budget goes (a 14×12 foliage sphere alone was 308 tris; the whole manor shell is ~1.6k).
// block-kinds.test.ts pins a per-block budget so a default-segment geometry can't sneak back in.

// A flat rug just above the floor, to warm up a room and define a zone.
export const Rug = (_scope: unknown, params: BlockParams) => {
  const w = num(params, "w", 1.6);
  const d = num(params, "d", 1.1);
  const mesh = new Mesh(new BoxGeometry(w, 0.02, d), mat(color(params, "color", 0x8c3b3b), 0.95));
  mesh.position.y = 0.011;
  mesh.receiveShadow = true;
  return { mesh };
};

// A table: a top slab on four legs. Faces are symmetric so rotation is cosmetic.
export const Table = (_scope: unknown, params: BlockParams) => {
  const w = num(params, "w", 1.1);
  const d = num(params, "d", 0.7);
  const h = num(params, "h", 0.74);
  const material = mat(color(params, "color", 0x6b4a2f), 0.7);
  const group = new Group();

  const topH = 0.06;
  const top = standingBox(w, topH, d, material);
  top.position.y = h - topH;
  group.add(top);

  const legR = 0.05;
  const legH = h - topH;
  const inset = 0.12;
  [
    [-w / 2 + inset, -d / 2 + inset],
    [w / 2 - inset, -d / 2 + inset],
    [-w / 2 + inset, d / 2 - inset],
    [w / 2 - inset, d / 2 - inset],
  ].forEach(([x, z]) => {
    const geom = new CylinderGeometry(legR, legR, legH, 6);
    geom.translate(0, legH / 2, 0);
    const leg = new Mesh(geom, material);
    leg.position.set(x, 0, z);
    leg.castShadow = true;
    group.add(leg);
  });
  return { mesh: group };
};

// Nav-coupled dims: footprint.ts carves the navmesh from THESE (mesh and carve must not desync).
export const CHAIR_SEAT = 0.42; // seat width/depth = the chair's footprint
export const PLANT_POT_RADIUS = 0.16; // pot top radius → footprint diameter
export const BARREL_RADIUS = 0.24; // top radius → footprint diameter

// A chair: seat + back + legs. The back is on the -Z (N) side at rest, so `face` orients it.
export const Chair = (_scope: unknown, params: BlockParams) => {
  const material = mat(color(params, "color", 0x5a4632), 0.7);
  const group = new Group();
  const seatH = 0.45;
  const seat = standingBox(CHAIR_SEAT, 0.06, CHAIR_SEAT, material);
  seat.position.y = seatH - 0.06;
  group.add(seat);

  const back = standingBox(CHAIR_SEAT, 0.45, 0.05, material);
  back.position.set(0, seatH, -0.18);
  group.add(back);

  const legH = seatH - 0.06;
  [
    [-0.16, -0.16],
    [0.16, -0.16],
    [-0.16, 0.16],
    [0.16, 0.16],
  ].forEach(([x, z]) => {
    const leg = standingBox(0.05, legH, 0.05, material);
    leg.position.set(x, 0, z);
    group.add(leg);
  });
  return { mesh: group };
};

// A shelf/cabinet against a wall — a tall box with a couple of horizontal shelves suggested.
export const Cabinet = (_scope: unknown, params: BlockParams) => {
  const w = num(params, "w", 0.9);
  const d = num(params, "d", 0.4);
  const h = num(params, "h", 1.5);
  const material = mat(color(params, "color", 0x4a3724), 0.6);
  const group = new Group();
  group.add(standingBox(w, h, d, material));
  // A lighter front face to read as doors.
  const door = new Mesh(
    new BoxGeometry(w * 0.92, h * 0.9, 0.02),
    mat(color(params, "trim", 0x6b5337), 0.5),
  );
  door.geometry.translate(0, (h * 0.9) / 2, 0);
  door.position.set(0, h * 0.05, d / 2);
  group.add(door);
  return { mesh: group };
};

// A bed: frame + mattress + pillow + headboard. The headboard is on the -Z (N) side at rest, so
// `face` turns it against a wall.
export const Bed = (_scope: unknown, params: BlockParams) => {
  const w = num(params, "w", 1.0);
  const d = num(params, "d", 1.9);
  const frame = mat(color(params, "color", 0x5a4632), 0.7);
  const linen = mat(color(params, "linen", 0xe8e0d0), 0.9);
  const group = new Group();

  const frameH = 0.3;
  group.add(standingBox(w, frameH, d, frame));
  const mattress = standingBox(w * 0.92, 0.16, d * 0.94, linen);
  mattress.position.y = frameH;
  group.add(mattress);
  const pillow = standingBox(w * 0.7, 0.1, d * 0.16, linen);
  pillow.position.set(0, frameH + 0.16, -d / 2 + d * 0.12);
  group.add(pillow);
  const headboard = standingBox(w, 0.7, 0.08, frame);
  headboard.position.z = -d / 2;
  group.add(headboard);
  return { mesh: group };
};

// A hearth: a stone surround with a dark firebox, a mantel, and a warm ember glow + light. Sits
// against a wall (use `face`). A cozy focal point for the dollhouse.
export const Fireplace = (_scope: unknown, params: BlockParams) => {
  const w = num(params, "w", 1.2);
  const h = num(params, "h", 1.4);
  const d = num(params, "d", 0.4);
  const stone = mat(color(params, "color", 0x8a8278), 0.9);
  const group = new Group();

  group.add(standingBox(w, h, d, stone));
  // Firebox (dark recess) on the +Z (S) face.
  const box = standingBox(w * 0.6, h * 0.5, 0.1, mat(new Color(0x1a1410), 1));
  box.position.set(0, 0, d / 2 - 0.02);
  group.add(box);
  // Mantel shelf.
  const mantel = standingBox(w * 1.15, 0.1, d * 1.4, mat(color(params, "color", 0x8a8278), 0.8));
  mantel.position.y = h * 0.62;
  group.add(mantel);
  // Embers + light.
  const ember = new Mesh(
    new BoxGeometry(w * 0.5, 0.12, 0.12),
    new MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff5a1a, emissiveIntensity: 1.8 }),
  );
  ember.position.set(0, 0.12, d / 2 - 0.02);
  group.add(ember);
  const light = new PointLight(0xff8a40, 6, 5, 1.8);
  light.position.set(0, h * 0.25, d / 2 + 0.3);
  group.add(light);
  return { mesh: group };
};

// A potted plant — a clay pot with a leafy mound. Pure decoration.
export const Plant = (_scope: unknown, params: BlockParams) => {
  const group = new Group();
  const potH = 0.28;
  const potGeom = new CylinderGeometry(PLANT_POT_RADIUS, 0.12, potH, 8);
  potGeom.translate(0, potH / 2, 0);
  group.add(new Mesh(potGeom, mat(color(params, "pot", 0xa8542f), 0.8)));
  const foliage = new Mesh(
    new SphereGeometry(0.26, 8, 5),
    mat(color(params, "color", 0x3f7d3a), 0.9),
  );
  foliage.position.y = potH + 0.22;
  foliage.scale.y = 1.25;
  group.add(foliage);
  return { mesh: group };
};

// A barrel — a simple storage prop.
export const Barrel = (_scope: unknown, params: BlockParams) => {
  const h = num(params, "h", 0.7);
  const geom = new CylinderGeometry(BARREL_RADIUS, 0.22, h, 10);
  geom.translate(0, h / 2, 0);
  const mesh = new Mesh(geom, mat(color(params, "color", 0x6b4a2a), 0.7));
  mesh.castShadow = true;
  return { mesh };
};
