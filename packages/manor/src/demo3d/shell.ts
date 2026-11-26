import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial } from "three";
import type { Material } from "three";

import type { Scope } from "@scene-lib/scope";

import { drawnSpan, roomRects } from "../space";
import type { FloorId, Plan, Rect, Room, Wall } from "../space";
import { sprigsOn } from "./climbers";
import type { Box } from "./climbers";
import { LAWN } from "./exterior";
import { LAMPLIGHT } from "./lamplight";
import { group, metreBox, paintOf, skinOf, skins, tinted } from "./parts";
import { floorTexture, paperTexture, runsThroughRail, texture } from "./textures";

// One storey's floors and walls. Every wall is built in two parts: the part below the rail,
// which is always there, and the part above it, which is taken away when you need to see in.

/** Where a wall is cut for the cutaway: rail height, which is also where the windows start. */
export const CUT_HEIGHT = 0.9;
export const WALL_THICKNESS = 0.2;
export const SLAB_THICKNESS = 0.3;
export const DOOR_HEIGHT = 2.1;
const WINDOW_HEAD = 2.3;
/** How wide the frame of a door or a window is: its jambs and its head. */
export const DOOR_FRAME = 0.07;
const RAIL_HEIGHT = 0.06;
const RAIL_DROP = 0.03;
/** How far trim stands proud of the wall it is on. */
const PROUD = 0.025;
/** Floors are laid a hair above the slab so the two never fight for the same pixels. */
const FLOOR_LIFT = 0.006;

const CAP = "#2b2622";
const TRIM = "#e6dcc6";
const TRIM_STONE = "#8d8a84";
const EARTH = "#4a3a2e";
// Glass never hides what is behind it from the depth test: people indoors show through a window.
const GLASS_CLEAR = 0.38;
const GLASS = new MeshLambertMaterial({ color: "#bcd9e6", transparent: true, opacity: GLASS_CLEAR, depthWrite: false });
/** A window with a lamp lit behind it: how strong the glow in it is, and how much less see-through the pane is. */
const GLOW = 0.85;
const GLASS_LIT = 0.62;

/** Light the windows, from 0 with the lamps out to 1 with them lit. Every pane in the house is the one glass. */
export const lightWindows = (lamps: number): void => {
  GLASS.emissive.set(LAMPLIGHT).multiplyScalar(lamps * GLOW);
  GLASS.opacity = GLASS_CLEAR + (GLASS_LIT - GLASS_CLEAR) * lamps;
};
/** A shop front: a low panelled stall riser, glass up to the head, a painted fascia above. */
const STALL_HEIGHT = 0.35;
const SHOPFRONT_HEAD = 2.55;
const SHOPFRONT_TRANSOM = 2.05;
const SHOPFRONT_PANE = 0.6;
const SHOPFRONT = "#2c4f44";
const GILT = "#c9a85a";

/** The upper part of one wall, with what is needed to decide whether to show it. */
export type UpperWall = {
  object: Group;
  /** The wall it is the top of. */
  wall: Wall;
  /** Only an outside wall can stand in a cutaway; a wall between two rooms always hides one of them. */
  outside: boolean;
  /** For an outside wall, the side the garden is on: 1 for the high side of its line, -1 for the low. */
  outward: 1 | -1;
  /** Whether it is wanted standing, for how many seconds it has been, and whether it stands: its goal (cutaway.ts). */
  wanted: boolean;
  waited: number;
  standing: boolean;
  /** 0 hidden … 1 standing; eased towards its goal each frame. */
  shown: number;
};

export type StoreyShell = { mesh: Group; uppers: UpperWall[] };

type ShellProps = { plan: Plan; floor: FloorId; walls: Wall[]; /** Holes in the floor, for a stair coming up through it. */ wells: Rect[] };

/** A flat piece of floor whose pattern is laid out in world metres, so it runs on from room to room. */
const floorPiece = (r: Rect, y: number, skin: Material): Mesh => {
  const geom = new BufferGeometry();
  const x0 = r.x;
  const x1 = r.x + r.w;
  const z0 = r.z;
  const z1 = r.z + r.d;
  geom.setAttribute("position", new Float32BufferAttribute([x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0], 3));
  geom.setAttribute("uv", new Float32BufferAttribute([x0, z0, x0, z1, x1, z1, x0, z0, x1, z1, x1, z0], 2));
  geom.computeVertexNormals();
  return new Mesh(geom, skin);
};

/** What is left of a rectangle once a hole is cut out of it. */
const without = (r: Rect, hole: Rect): Rect[] => {
  const hx0 = Math.max(r.x, hole.x);
  const hx1 = Math.min(r.x + r.w, hole.x + hole.w);
  const hz0 = Math.max(r.z, hole.z);
  const hz1 = Math.min(r.z + r.d, hole.z + hole.d);
  if (hx0 >= hx1 || hz0 >= hz1) return [r];
  return [
    { x: r.x, z: r.z, w: r.w, d: hz0 - r.z },
    { x: r.x, z: hz1, w: r.w, d: r.z + r.d - hz1 },
    { x: r.x, z: hz0, w: hx0 - r.x, d: hz1 - hz0 },
    { x: hx1, z: hz0, w: r.x + r.w - hx1, d: hz1 - hz0 },
  ].filter((p) => p.w > 0 && p.d > 0);
};

const paperOf = (rooms: Map<string, Room>, id: string | null, floor: FloorId, dado: boolean): Material => {
  const room = id ? rooms.get(id) : undefined;
  if (room) return skinOf(paperTexture(room.paper, dado));
  return floor === "cellar" ? paintOf(EARTH) : skinOf(texture("brick"));
};

/**
 * How high the pattern on one face of a wall begins, for a stretch of it whose underside is `y0`
 * above the floor. Brick is laid from the ground up, through the rail and from storey to storey
 * (`base` is how high the storey's floor is). A room's paper is laid from its floor below the
 * rail; above it, courses of stone and tiles run on from below, and any other paper begins at
 * the rail, where its panelling ends. So a stretch over a door or a window carries the pattern
 * of the wall either side of it.
 */
const footOn = (rooms: Map<string, Room>, id: string | null, base: number): ((y0: number, above: boolean) => number) => {
  const room = id ? rooms.get(id) : undefined;
  if (!room) return (y0) => base + y0;
  return runsThroughRail(room.paper) ? (y0) => y0 : (y0, above) => (above ? y0 - CUT_HEIGHT : y0);
};

/** One wall, along its own X axis from 0, as a lower and an upper group. `base` is how high its storey's floor is. */
const buildWall = (wall: Wall, height: number, base: number, rooms: Map<string, Room>, others: Wall[]): { lower: Group; upper: Group; shopfront: boolean } => {
  const trim = paintOf(wall.floor === "cellar" ? TRIM_STONE : TRIM);
  // Which wall fills a corner, and which butts against it, is the plan's rule (drawnSpan in src/space/walls.ts).
  const { from, to } = drawnSpan(wall, others, WALL_THICKNESS);

  // In the wall's own frame +Z is its south face for a wall along X, its west face for one along Z.
  const frontRoom = wall.axis === "x" ? wall.high : wall.low;
  const backRoom = wall.axis === "x" ? wall.low : wall.high;
  const sidesFor = (dado: boolean, top: Material): Material[] =>
    skins({ east: trim, west: trim, top, bottom: trim, south: paperOf(rooms, frontRoom, wall.floor, dado), north: paperOf(rooms, backRoom, wall.floor, dado) });
  const frontFoot = footOn(rooms, frontRoom, base);
  const backFoot = footOn(rooms, backRoom, base);
  const lowerSkin = sidesFor(true, paintOf(CAP));
  const upperSkin = sidesFor(false, trim);
  // A wall with shop glass in it is joinery from end to end: its corner posts are painted
  // timber, not brick, and they stand with the glass when the wall is cut.
  const shopfront = wall.openings.some((o) => o.kind === "glass");
  const joinery = paintOf(SHOPFRONT);
  const joinerySkin = skins({ east: joinery, west: joinery, top: joinery, bottom: joinery, south: joinery, north: joinery });

  const lower = group();
  const upper = group();
  /** A stretch of wall from a to b along it, between heights y0 and y1 (measured from the floor). */
  const stretch = (into: Group, skin: Material[], a: number, b: number, y0: number, y1: number): void => {
    if (b - a < 0.001 || y1 - y0 < 0.001) return;
    // The pattern goes along the wall from the wall's own beginning, and up it as each face has it: so it is one pattern through every stretch.
    const mesh = new Mesh(metreBox(b - a, y1 - y0, WALL_THICKNESS, a, { front: frontFoot(y0, into === upper), back: backFoot(y0, into === upper) }), skin);
    mesh.position.set((a + b) / 2, (y0 + y1) / 2 - (into === upper ? CUT_HEIGHT : 0), 0);
    into.add(mesh);
  };
  const piece = (into: Group, skin: Material, w: number, h: number, d: number, x: number, y: number): void => {
    const mesh = new Mesh(metreBox(w, h, d), skin);
    mesh.position.set(x, y + h / 2 - (into === upper ? CUT_HEIGHT : 0), 0);
    into.add(mesh);
  };

  const proud = WALL_THICKNESS + PROUD * 2;
  /** The solid wall between two openings (or an opening and the wall's end), from a to b. */
  const solid = (a: number, b: number): void => {
    if (shopfront) {
      stretch(lower, joinerySkin, a, b, 0, SHOPFRONT_HEAD);
      stretch(upper, joinerySkin, a, b, SHOPFRONT_HEAD, height);
    } else {
      stretch(lower, lowerSkin, a, b, 0, CUT_HEIGHT);
      stretch(upper, upperSkin, a, b, CUT_HEIGHT, height);
    }
  };
  const openings = [...wall.openings].sort((a, b) => a.pos - b.pos);
  let cursor = from;
  for (const o of openings) {
    const a = o.pos - o.width / 2;
    const b = o.pos + o.width / 2;
    solid(cursor, a);
    if (o.kind === "door") {
      stretch(upper, upperSkin, a, b, DOOR_HEIGHT, height);
      // The door case: two jambs and a head.
      for (const x of [a + DOOR_FRAME / 2, b - DOOR_FRAME / 2]) {
        piece(lower, trim, DOOR_FRAME, CUT_HEIGHT, proud, x, 0);
        piece(upper, trim, DOOR_FRAME, DOOR_HEIGHT - CUT_HEIGHT, proud, x, CUT_HEIGHT);
      }
      piece(upper, trim, o.width, DOOR_FRAME, proud, o.pos, DOOR_HEIGHT - DOOR_FRAME);
      // (The leaf that hangs in it swings, and is not of the wall: door-leaves.ts.)
    } else if (o.kind === "glass") {
      // The glazing is part of the lower wall, so it stays standing when the wall is cut: you
      // can see through it anyway. Only the fascia above it comes and goes with the upper wall.
      const paint = paintOf(SHOPFRONT);
      piece(lower, paint, o.width, STALL_HEIGHT, proud, o.pos, 0);
      piece(lower, GLASS, o.width - DOOR_FRAME * 2, SHOPFRONT_HEAD - STALL_HEIGHT, 0.03, o.pos, STALL_HEIGHT);
      for (const x of [a + DOOR_FRAME / 2, b - DOOR_FRAME / 2]) piece(lower, paint, DOOR_FRAME, SHOPFRONT_HEAD, proud, x, 0);
      const panes = Math.max(1, Math.round(o.width / SHOPFRONT_PANE));
      for (let n = 1; n < panes; n++) piece(lower, paint, 0.04, SHOPFRONT_HEAD - STALL_HEIGHT, 0.06, a + (o.width / panes) * n, STALL_HEIGHT);
      piece(lower, paint, o.width, 0.04, 0.06, o.pos, SHOPFRONT_TRANSOM);
      piece(lower, paint, o.width, DOOR_FRAME, proud, o.pos, SHOPFRONT_HEAD - DOOR_FRAME);
      piece(lower, paintOf(GILT), o.width - DOOR_FRAME * 2, 0.025, proud + 0.01, o.pos, STALL_HEIGHT - 0.06);
      piece(upper, paint, o.width, height - SHOPFRONT_HEAD, proud, o.pos, SHOPFRONT_HEAD);
      piece(upper, paintOf(GILT), o.width - 0.3, 0.03, proud + 0.012, o.pos, SHOPFRONT_HEAD + (height - SHOPFRONT_HEAD) * 0.25);
      piece(upper, paintOf(GILT), o.width - 0.3, 0.03, proud + 0.012, o.pos, SHOPFRONT_HEAD + (height - SHOPFRONT_HEAD) * 0.75);
    } else {
      stretch(lower, lowerSkin, a, b, 0, CUT_HEIGHT);
      stretch(upper, upperSkin, a, b, WINDOW_HEAD, height);
      const glassH = WINDOW_HEAD - CUT_HEIGHT;
      piece(upper, GLASS, o.width - DOOR_FRAME * 2, glassH - DOOR_FRAME * 2, 0.03, o.pos, CUT_HEIGHT + DOOR_FRAME);
      for (const x of [a + DOOR_FRAME / 2, b - DOOR_FRAME / 2]) piece(upper, trim, DOOR_FRAME, glassH, proud, x, CUT_HEIGHT);
      piece(upper, trim, o.width, DOOR_FRAME, proud, o.pos, WINDOW_HEAD - DOOR_FRAME);
      piece(upper, trim, o.width + 0.16, DOOR_FRAME, proud + 0.08, o.pos, CUT_HEIGHT);
      // Glazing bars: one upright, one across.
      piece(upper, trim, 0.04, glassH, 0.05, o.pos, CUT_HEIGHT);
      piece(upper, trim, o.width, 0.04, 0.05, o.pos, CUT_HEIGHT + glassH * 0.55);
    }
    cursor = b;
  }
  solid(cursor, to);

  // The rail along the top of the lower wall, broken at the doorways. A shop front has none.
  let railFrom = from;
  for (const o of shopfront ? [] : [...openings.filter((op) => op.kind === "door"), null]) {
    const railTo = o ? o.pos - o.width / 2 : to;
    // Kept just under the top of the wall, so the rail and the cut edge never share a surface.
    if (railTo - railFrom > 0.001) piece(lower, trim, railTo - railFrom, RAIL_HEIGHT, proud, (railFrom + railTo) / 2, CUT_HEIGHT - RAIL_HEIGHT - RAIL_DROP);
    if (o) railFrom = o.pos + o.width / 2;
  }
  return { lower, upper, shopfront };
};

/** What grows on a wall's outside is of the wall: of its lower part under the rail, and above it of its upper part, which is cut (climbers.ts). */
const grow = (into: Group, boxes: Box[]): void => {
  for (const box of boxes) into.add(tinted(box.w, box.h, box.d, box.color, box.x, box.y, box.z));
};

/** Turn a group built along its own X into place on a wall's line. */
const place = (g: Group, wall: Wall, y: number): void => {
  if (wall.axis === "x") g.position.set(0, y, wall.at);
  else {
    g.position.set(wall.at, y, 0);
    g.rotation.y = -Math.PI / 2;
  }
};

/** A storey's floors, slab and walls. The slab doubles as the ceiling of the storey below. */
export const StoreyShell = (scope: Scope, { plan, floor, walls, wells }: ShellProps): StoreyShell => {
  const storey = plan.storeys[floor];
  const rooms = new Map(plan.rooms.filter((r) => r.floor === floor).map((r) => [r.id, r]));
  const mesh = group();
  mesh.position.y = storey.y;

  const slabSkin = skins({ east: paintOf(TRIM_STONE), west: paintOf(TRIM_STONE), top: paintOf(CAP), bottom: skinOf(texture("plaster")), south: paintOf(TRIM_STONE), north: paintOf(TRIM_STONE) });
  for (const room of rooms.values()) {
    const skin = skinOf(floorTexture(room.flooring));
    for (const rect of roomRects(room)) {
      const pieces = wells.reduce<Rect[]>((left, hole) => left.flatMap((p) => without(p, hole)), [rect]);
      for (const p of pieces) {
        mesh.add(floorPiece(p, FLOOR_LIFT, skin));
        // The slab reaches under the walls, so its edge shows outside as a band of stone.
        const grown = { x: p.x === rect.x ? p.x - WALL_THICKNESS / 2 : p.x, z: p.z === rect.z ? p.z - WALL_THICKNESS / 2 : p.z, x1: p.x + p.w === rect.x + rect.w ? p.x + p.w + WALL_THICKNESS / 2 : p.x + p.w, z1: p.z + p.d === rect.z + rect.d ? p.z + p.d + WALL_THICKNESS / 2 : p.z + p.d };
        const slab = new Mesh(metreBox(grown.x1 - grown.x, SLAB_THICKNESS, grown.z1 - grown.z), slabSkin);
        slab.position.set((grown.x + grown.x1) / 2, -SLAB_THICKNESS / 2, (grown.z + grown.z1) / 2);
        mesh.add(slab);
      }
    }
  }

  const onFloor = walls.filter((w) => w.floor === floor);
  const uppers: UpperWall[] = [];
  for (const wall of onFloor) {
    const { lower, upper, shopfront } = buildWall(wall, storey.height, storey.y, rooms, onFloor);
    const grown = sprigsOn(wall, { storeys: plan.storeys, walls }, { ground: LAWN, cut: CUT_HEIGHT, thick: WALL_THICKNESS, slab: SLAB_THICKNESS, doorHead: DOOR_HEIGHT, windowHead: WINDOW_HEAD });
    grow(lower, grown.lower);
    grow(upper, grown.upper);
    place(lower, wall, 0);
    place(upper, wall, CUT_HEIGHT);
    mesh.add(lower, upper);
    // A shop front's upper part is only its fascia. Left standing on the far side of a cutaway it
    // would hang in the air over the glass, so it is treated like an inside wall and always cut.
    const outside = wall.low === null || wall.high === null;
    uppers.push({ object: upper, wall, outside: outside && !shopfront, outward: wall.low === null ? -1 : 1, wanted: true, waited: 0, standing: true, shown: 1 });
  }

  scope.add(() => {
    mesh.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
  });
  return { mesh, uppers };
};
