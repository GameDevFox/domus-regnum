import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial, Vector3 } from "three";
import type { Material, Object3D, Texture } from "three";

// The few shapes everything is built from. A box here is textured at one tile per metre whatever
// its size, so a long wall and a short one show bricks of the same size.

const flat = new Map<string, MeshLambertMaterial>();
const textured = new Map<Texture, MeshLambertMaterial>();

/** A plain painted surface. Materials are shared by colour for the life of the page. */
export const paintOf = (color: string): MeshLambertMaterial => {
  const have = flat.get(color);
  if (have) return have;
  const made = new MeshLambertMaterial({ color });
  flat.set(color, made);
  return made;
};

export const skinOf = (map: Texture): MeshLambertMaterial => {
  const have = textured.get(map);
  if (have) return have;
  const made = new MeshLambertMaterial({ map });
  textured.set(map, made);
  return made;
};

/** BoxGeometry lists its faces in this order; each has four corners. */
const BOX_FACES = ["px", "nx", "py", "ny", "pz", "nz"] as const;
const CORNERS_PER_FACE = 4;

/** How high a box's pattern begins on its upright faces: one figure for all four, or one for its front (+Z) and another for its back (-Z). */
export type Foot = number | { front: number; back: number };

/**
 * A box whose texture repeats once a metre. `shiftU` is how far along what it is a stretch of the
 * box begins (along its X), and `foot` how high in it its underside is: so the stretches of one
 * wall, side by side and one above another, carry the pattern straight through, on the front and
 * on the back. (A face is read the right way round from outside, so the back counts from the
 * box's far end: its pattern is slid to run backwards along the same wall.)
 */
export const metreBox = (w: number, h: number, d: number, shiftU = 0, foot: Foot = 0): BoxGeometry => {
  const geom = new BoxGeometry(w, h, d);
  const uv = geom.attributes.uv;
  BOX_FACES.forEach((face, f) => {
    const flat = face === "py" || face === "ny";
    const [su, sv] = face === "px" || face === "nx" ? [d, h] : flat ? [w, d] : [w, h];
    const slide = face === "nz" ? -(shiftU + w) : face === "pz" || flat ? shiftU : 0;
    const lift = flat ? 0 : typeof foot === "number" ? foot : face === "pz" ? foot.front : face === "nz" ? foot.back : 0;
    for (let c = 0; c < CORNERS_PER_FACE; c++) {
      const i = f * CORNERS_PER_FACE + c;
      uv.setXY(i, uv.getX(i) * su + slide, uv.getY(i) * sv + lift);
    }
  });
  return geom;
};

/** A face leaning this far from upright or more (as its normal's share of straight up) is laid as a thing lying flat. */
const FLAT_FROM = 0.5;

/**
 * Lay a mesh's pattern by where it stands, as a wall's is laid (shell.ts) and a floor's: along an
 * upright face by how far along the ground it is (read the right way round from outside), up it
 * by its height from the ground, and over a flat one by the ground under it. So brick above a
 * wall carries the wall's courses on, and two lengths of one path are one gravel. Call it once
 * the mesh is where it is to be; `paint` lays only what wears that one of its several paints.
 */
export const laidWhereItStands = <M extends Mesh>(mesh: M, paint?: number): M => {
  mesh.updateMatrix();
  const { geometry } = mesh;
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const corners = new Set<number>();
  const ranges = paint === undefined ? [{ start: 0, count: geometry.index ? geometry.index.count : position.count }] : geometry.groups.filter((g) => g.materialIndex === paint);
  for (const { start, count } of ranges) for (let k = start; k < start + count; k++) corners.add(geometry.index ? geometry.index.getX(k) : k);
  const at = new Vector3();
  const facing = new Vector3();
  for (const i of corners) {
    at.fromBufferAttribute(position, i).applyMatrix4(mesh.matrix);
    facing.fromBufferAttribute(normal, i).transformDirection(mesh.matrix);
    if (Math.abs(facing.y) >= FLAT_FROM) uv.setXY(i, at.x, at.z);
    else if (Math.abs(facing.z) >= Math.abs(facing.x)) uv.setXY(i, Math.sign(facing.z) * at.x, at.y);
    else uv.setXY(i, -Math.sign(facing.x) * at.z, at.y);
  }
  uv.needsUpdate = true;
  return mesh;
};

export type Skin = Material | Material[];

/** A box standing on `y`, centred on (x, z). */
export const block = (w: number, h: number, d: number, skin: Skin, x = 0, y = 0, z = 0): Mesh => {
  const mesh = new Mesh(metreBox(w, h, d), skin);
  mesh.position.set(x, y + h / 2, z);
  return mesh;
};

/** The one paint of every box that carries its own colour: a thousand leaves of five greens are then one thing to draw, not five. */
const TINTED = new MeshLambertMaterial({ vertexColors: true });

/** A box of one colour, with its middle at (x, y, z), that shares its paint with every other such box whatever their colours. */
export const tinted = (w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0): Mesh => {
  const geom = new BoxGeometry(w, h, d);
  const { r, g, b } = new Color(color);
  geom.setAttribute("color", new Float32BufferAttribute(Array.from({ length: geom.getAttribute("position").count }, () => [r, g, b]).flat(), 3));
  const mesh = new Mesh(geom, TINTED);
  mesh.position.set(x, y, z);
  return mesh;
};

const ROUND_SIDES = 10;

/** An upright cylinder (or cone, with a different top radius) standing on `y`. */
export const post = (radius: number, h: number, skin: Material, x = 0, y = 0, z = 0, topRadius = radius): Mesh => {
  const mesh = new Mesh(new CylinderGeometry(topRadius, radius, h, ROUND_SIDES), skin);
  mesh.position.set(x, y + h / 2, z);
  return mesh;
};

export const group = (...children: Object3D[]): Group => {
  const g = new Group();
  if (children.length > 0) g.add(...children);
  return g;
};

/** Six different skins for a box, in BoxGeometry's order: east, west, top, bottom, south, north. */
export const skins = (sides: { east: Material; west: Material; top: Material; bottom: Material; south: Material; north: Material }): Material[] => [sides.east, sides.west, sides.top, sides.bottom, sides.south, sides.north];

/**
 * A wedge: a wall that is nothing at one end (-X) and `rise` tall at the other (+X), `thick`
 * through. It fills the triangle between the flat top of a wall and a roof sloping over it.
 * Centred on its length and thickness, standing on y = 0, textured a tile to the metre.
 */
export const wedge = (length: number, rise: number, thick: number): BufferGeometry => {
  const hx = length / 2;
  const hz = thick / 2;
  const slope = Math.hypot(length, rise);
  type P = [number, number, number];
  const low = (z: number): P => [-hx, 0, z];
  const foot = (z: number): P => [hx, 0, z];
  const top = (z: number): P => [hx, rise, z];
  const positions: number[] = [];
  const uvs: number[] = [];
  const tri = (pts: [P, P, P], uv: [number, number][]): void => {
    pts.forEach((p, i) => {
      positions.push(...p);
      uvs.push(...uv[i]);
    });
  };
  // The two triangular faces, then the sloping top and the tall end.
  tri([low(hz), foot(hz), top(hz)], [[0, 0], [length, 0], [length, rise]]);
  tri([foot(-hz), low(-hz), top(-hz)], [[0, 0], [length, 0], [0, rise]]);
  tri([low(hz), top(hz), top(-hz)], [[0, 0], [slope, 0], [slope, thick]]);
  tri([low(hz), top(-hz), low(-hz)], [[0, 0], [slope, thick], [0, thick]]);
  tri([foot(hz), foot(-hz), top(-hz)], [[0, 0], [thick, 0], [thick, rise]]);
  tri([foot(hz), top(-hz), top(hz)], [[0, 0], [thick, rise], [0, rise]]);
  const geom = new BufferGeometry();
  geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
};

/**
 * A pitched roof over a rectangle, as one mesh: the two slopes are material 0, the two gable
 * ends material 1. `ridge` says which way the ridge runs. Centred on its rectangle, eaves at y=0.
 */
export const gableRoof = (w: number, d: number, rise: number, ridge: "x" | "z"): BufferGeometry => {
  // Built with the ridge along Z, then turned if it should run along X.
  const span = ridge === "z" ? w : d;
  const run = ridge === "z" ? d : w;
  const hx = span / 2;
  const hz = run / 2;
  const slope = Math.hypot(hx, rise);
  type P = [number, number, number];
  const eaveWN: P = [-hx, 0, -hz];
  const eaveWS: P = [-hx, 0, hz];
  const eaveEN: P = [hx, 0, -hz];
  const eaveES: P = [hx, 0, hz];
  const ridgeN: P = [0, rise, -hz];
  const ridgeS: P = [0, rise, hz];
  const positions: number[] = [];
  const uvs: number[] = [];
  const tri = (pts: [P, P, P], uv: [number, number][]): void => {
    pts.forEach((p, i) => {
      positions.push(...p);
      uvs.push(...uv[i]);
    });
  };
  // West slope, then east slope: slates run along the ridge (u) and down the pitch (v).
  tri([eaveWN, eaveWS, ridgeS], [[0, 0], [run, 0], [run, slope]]);
  tri([eaveWN, ridgeS, ridgeN], [[0, 0], [run, slope], [0, slope]]);
  tri([eaveES, eaveEN, ridgeN], [[0, 0], [run, 0], [run, slope]]);
  tri([eaveES, ridgeN, ridgeS], [[0, 0], [run, slope], [0, slope]]);
  const slopeCount = positions.length / 3;
  // The gables: the wall carried up into the triangle under the roof.
  tri([eaveWS, eaveES, ridgeS], [[0, 0], [span, 0], [hx, rise]]);
  tri([eaveEN, eaveWN, ridgeN], [[0, 0], [span, 0], [hx, rise]]);
  const geom = new BufferGeometry();
  geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geom.addGroup(0, slopeCount, 0);
  geom.addGroup(slopeCount, positions.length / 3 - slopeCount, 1);
  if (ridge === "x") geom.rotateY(Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
};
