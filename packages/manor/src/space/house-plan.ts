import { FIXTURES, SPOTS, STORES } from "./house-furnishings";
import type { Axis, FloorId, Opening, Plan, Room, Stair, Storey } from "./types";

// The house, drawn up the way a mid-Victorian architect would have sorted it: a family side and a
// service side that meet only in passages; the kitchen kept away from the dining room, with a
// serving passage between; the best rooms given bay windows; the laboratory below ground. Every
// number is metres and sits on a quarter-metre, which is the grid people walk on.

/** Storey heights follow docs/design/08-scale-and-architecture.md §5 (manor tier). */
const STOREYS: Record<FloorId, Storey> = {
  cellar: { name: "Cellar", y: -2.7, height: 2.4 },
  ground: { name: "Ground floor", y: 0, height: 3.0 },
  first: { name: "First floor", y: 3.3, height: 2.9 },
};

const ROOMS: Room[] = [
  // Ground floor — the service side is west, the family side east, the hall between.
  { id: "hall", name: "Entrance hall", floor: "ground", rect: { x: 8, z: 4, w: 4, d: 8 }, flooring: "chequer", paper: "panel" },
  { id: "passage", name: "Serving passage", floor: "ground", rect: { x: 8, z: 1, w: 4, d: 3 }, flooring: "flag", paper: "cream" },
  { id: "kitchen", name: "Kitchen", floor: "ground", rect: { x: 2, z: 1, w: 6, d: 6 }, flooring: "quarry", paper: "tile" },
  { id: "pantry", name: "Pantry", floor: "ground", rect: { x: -1, z: 3, w: 3, d: 4 }, flooring: "flag", paper: "cream" },
  { id: "shop", name: "Shop", floor: "ground", rect: { x: 2, z: 7, w: 6, d: 5 }, bays: [{ x: 4.5, z: 12, w: 2.5, d: 0.75 }], flooring: "board", paper: "sage" },
  { id: "dining", name: "Dining room", floor: "ground", rect: { x: 12, z: 0, w: 7, d: 6 }, flooring: "parquet", paper: "crimson" },
  { id: "parlour", name: "Parlour", floor: "ground", rect: { x: 12, z: 6, w: 6, d: 6 }, bays: [{ x: 18, z: 7.5, w: 0.75, d: 3 }], flooring: "parquet", paper: "rose" },

  // First floor — the Master's rooms over the family side, the maids' over the kitchen.
  { id: "landing", name: "Landing", floor: "first", rect: { x: 8, z: 1, w: 4, d: 11 }, flooring: "board", paper: "panel" },
  { id: "dormitory", name: "Maids' dormitory", floor: "first", rect: { x: 2, z: 1, w: 6, d: 6 }, flooring: "board", paper: "cream" },
  { id: "bath", name: "Bath and linen room", floor: "first", rect: { x: 2, z: 7, w: 6, d: 5 }, flooring: "chequer", paper: "tile" },
  { id: "study", name: "Study", floor: "first", rect: { x: 12, z: 0, w: 7, d: 6 }, flooring: "parquet", paper: "ink" },
  { id: "bedroom", name: "The Master's bedroom", floor: "first", rect: { x: 12, z: 6, w: 6, d: 6 }, flooring: "board", paper: "plum" },

  // Cellar — stores under the kitchen, the laboratory under the dining room.
  { id: "undercroft", name: "Undercroft", floor: "cellar", rect: { x: 8, z: 4, w: 4, d: 8 }, flooring: "cobble", paper: "stone" },
  { id: "store", name: "Cellar store", floor: "cellar", rect: { x: 2, z: 1, w: 6, d: 6 }, flooring: "cobble", paper: "stone" },
  { id: "laboratory", name: "Laboratory", floor: "cellar", rect: { x: 12, z: 0, w: 7, d: 6 }, flooring: "flag", paper: "stone" },
];

const SINGLE_DOOR = 1.0;
const DOUBLE_DOOR = 1.5;

const door = (floor: FloorId, axis: Axis, at: number, pos: number, width = SINGLE_DOOR, hinge?: "high"): Opening => ({ kind: "door", floor, axis, at, pos, width, ...(hinge ? { hinge } : {}) });
const win = (floor: FloorId, axis: Axis, at: number, pos: number, width = 1.25): Opening => ({ kind: "window", floor, axis, at, pos, width });
const glass = (floor: FloorId, axis: Axis, at: number, pos: number, width: number): Opening => ({ kind: "glass", floor, axis, at, pos, width });

/** Hung from the high end of its doorway (the east, or the south), where a leaf hung from the low end would stand in more ways when it is open: across the foot of the stairs, say. Which end is the better for each door was counted over every walk between two spots of the house (DEMO3D.md, "Doors that swing"). */
const HIGH = "high";

const OPENINGS: Opening[] = [
  // Ground-floor doors.
  door("ground", "x", 12, 10, DOUBLE_DOOR), // the front door
  door("ground", "z", 8, 11, SINGLE_DOOR, HIGH), // hall – shop: its leaf clear of the foot of the stairs
  door("ground", "z", 12, 9, DOUBLE_DOOR), // hall – parlour
  door("ground", "z", 12, 5, SINGLE_DOOR, HIGH), // hall – dining room
  door("ground", "x", 4, 10.75, SINGLE_DOOR, HIGH), // hall – serving passage
  door("ground", "z", 8, 3, SINGLE_DOOR, HIGH), // passage – kitchen
  door("ground", "z", 12, 2.5), // passage – dining room
  door("ground", "z", 2, 5, SINGLE_DOOR, HIGH), // kitchen – pantry
  door("ground", "x", 7, 3.25), // kitchen – shop
  door("ground", "x", 12, 3.25), // the shop's street door
  door("ground", "x", 6, 15, DOUBLE_DOOR), // dining room – parlour
  door("ground", "x", 1, 3.25), // the kitchen's back door
  // Ground-floor windows.
  win("ground", "z", 2, 2),
  // The pantry: a small window in each of its two side walls, in the bare stretch between the shelves (the author's, 2026-11-16; until then one in its back wall, behind the jam).
  win("ground", "x", 3, 0, 0.75),
  win("ground", "x", 7, 0, 0.75),
  // The shop front: a bay glazed on all three sides, beside the street door.
  glass("ground", "x", 12.75, 5.75, 2.3),
  glass("ground", "z", 4.5, 12.375, 0.5),
  glass("ground", "z", 7, 12.375, 0.5),
  win("ground", "x", 0, 14),
  win("ground", "x", 0, 17),
  win("ground", "z", 19, 1.25),
  win("ground", "z", 19, 4.75),
  win("ground", "x", 12, 13.5),
  win("ground", "x", 12, 16.5),
  win("ground", "z", 18.75, 9, 2), // the parlour's bay
  win("ground", "x", 12, 8.75, 0.75),
  win("ground", "x", 12, 11.25, 0.75),

  // First-floor doors.
  door("first", "z", 8, 3), // landing – dormitory
  door("first", "z", 8, 11, SINGLE_DOOR, HIGH), // landing – bath
  door("first", "z", 12, 3), // landing – study
  door("first", "z", 12, 9, SINGLE_DOOR, HIGH), // landing – bedroom
  // First-floor windows.
  win("first", "x", 12, 10, 1.5),
  win("first", "x", 1, 10),
  win("first", "x", 1, 3.5),
  win("first", "x", 1, 6.5),
  win("first", "z", 2, 2.5),
  win("first", "z", 2, 5.5),
  win("first", "z", 2, 9.5),
  win("first", "x", 12, 3.5),
  win("first", "x", 12, 6.5),
  win("first", "x", 0, 14),
  win("first", "x", 0, 17),
  win("first", "z", 19, 3),
  win("first", "x", 12, 13.5),
  win("first", "x", 12, 16.5),
  win("first", "z", 18, 9, 1.75),

  // Cellar doors.
  door("cellar", "z", 8, 4.75), // undercroft – store
  door("cellar", "z", 12, 5, SINGLE_DOOR, HIGH), // undercroft – laboratory
];

/** Width of the grand stair, per the same scale doc (§9). */
const STAIR_WIDTH = 1.25;
const STAIR_X = 8.875;

const STAIRS: Stair[] = [
  // The main flight faces the front door and rises north along the hall's west wall.
  { id: "main", lower: "ground", upper: "first", x: STAIR_X, zFoot: 10, zHead: 5.5, width: STAIR_WIDTH },
  // The cellar flight is the door under the stairs: it goes down beneath the main one.
  { id: "cellar", lower: "cellar", upper: "ground", x: STAIR_X, zFoot: 9.5, zHead: 5.5, width: STAIR_WIDTH },
];

export const HOUSE: Plan = {
  storeys: STOREYS,
  rooms: ROOMS,
  openings: OPENINGS,
  fixtures: FIXTURES,
  spots: SPOTS,
  stairs: STAIRS,
  stores: STORES,
};
