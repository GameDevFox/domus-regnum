// The house as real space: metres, three storeys, rooms of different sizes. Headless — no drawing
// here. X runs east, Z runs south (towards the street), Y is up.

export type FloorId = "cellar" | "ground" | "first";

/** A point on one storey. */
export type Pos = { floor: FloorId; x: number; z: number };

/** A point in the world. */
export type Vec3 = { x: number; y: number; z: number };

/** North-west corner and size, in metres. */
export type Rect = { x: number; z: number; w: number; d: number };

export type Storey = { name: string; y: number; height: number };

export type Room = {
  id: string;
  name: string;
  floor: FloorId;
  rect: Rect;
  /** Projections that belong to the room: a bay window is floor you can stand on. */
  bays?: Rect[];
  /** Looks, by name; the view decides what they mean. */
  flooring: string;
  paper: string;
};

/** Which way a wall runs: "x" is a wall along the X axis at a fixed Z. */
export type Axis = "x" | "z";

export type Opening = {
  /** A door is walked through; a window sits above the rail; glass is a shop front, glazed from near the floor to the fascia. */
  kind: "door" | "window" | "glass";
  floor: FloorId;
  axis: Axis;
  /** The wall's fixed coordinate (a Z for axis "x", an X for axis "z"). */
  at: number;
  /** Centre of the opening along the wall. */
  pos: number;
  width: number;
  /** For a door of one leaf: the end of the doorway its leaf hangs from. The low end (the west, or the north) unless it is said to be the high. */
  hinge?: "low" | "high";
};

export type Facing = "n" | "e" | "s" | "w";

/** Furniture. `w` and `d` are the footprint as it stands (already turned); `face` is its front. */
export type Fixture = {
  id: string;
  kind: string;
  floor: FloorId;
  x: number;
  z: number;
  w: number;
  d: number;
  face: Facing;
  /** Solid furniture is walked round; a rug is not. */
  solid: boolean;
  /** Metres above the floor that it stands at, when it stands on something: a lamp on a sideboard. */
  lift?: number;
};

/** Somewhere to stand to use something, and which way to look while doing it. */
export type Spot = { id: string; floor: FloorId; x: number; z: number; face: Facing };

/** A straight flight. The foot is on the lower storey, the head on the upper. */
export type Stair = {
  id: string;
  lower: FloorId;
  upper: FloorId;
  x: number;
  zFoot: number;
  zHead: number;
  width: number;
};

export type Plan = {
  storeys: Record<FloorId, Storey>;
  rooms: Room[];
  openings: Opening[];
  fixtures: Fixture[];
  spots: Spot[];
  stairs: Stair[];
  /** Which spot each kind of goods is kept at: flour and jam are on different shelves. */
  stores: Record<string, string>;
};

export const FLOOR_ORDER: FloorId[] = ["cellar", "ground", "first"];

export const FACE_ANGLE: Record<Facing, number> = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };

export const FACE_DIR: Record<Facing, { x: number; z: number }> = {
  n: { x: 0, z: -1 },
  e: { x: 1, z: 0 },
  s: { x: 0, z: 1 },
  w: { x: -1, z: 0 },
};
