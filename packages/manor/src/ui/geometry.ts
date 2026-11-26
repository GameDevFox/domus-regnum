import { COLS, FLOORS } from "../sim/tuning";
import type { Room, RoomKind } from "../sim/types";

// Screen geometry of the dollhouse, in SVG user units. The sim's x is in columns and its y in
// floors, so mapping is two multiplications.

export const CELL_W = 196;
export const CELL_H = 136;
export const MARGIN_X = 46;
export const ROOF_H = 92;
export const GROUND_H = 30;
export const VIEW_H = ROOF_H + FLOORS * CELL_H + GROUND_H;
export const HOUSE_H = FLOORS * CELL_H;
/** The widest the picture ever is: both wings open. */
export const MAX_VIEW_W = MARGIN_X * 2 + COLS * CELL_W;

// A wing that is shut up is drawn as a narrow stub of outside wall, so that the rooms in use fill
// the window. The column widths therefore depend on the game, and are set once per frame.
const WING_STUB = 62;
const colW: number[] = Array.from({ length: COLS }, () => CELL_W);
const colX: number[] = Array.from({ length: COLS + 1 }, (_, i) => i * CELL_W);

export const setWings = (west: boolean, east: boolean): void => {
  colW[0] = west ? CELL_W : WING_STUB;
  colW[COLS - 1] = east ? CELL_W : WING_STUB;
  for (let i = 0; i < COLS; i++) colX[i + 1] = colX[i] + colW[i];
};
setWings(false, false);

export const houseW = (): number => colX[COLS];
export const viewW = (): number => MARGIN_X * 2 + colX[COLS];
export const colWidth = (col: number): number => colW[col];

/** Screen x of a sim x (in columns, fractional within one). */
export const px = (x: number): number => {
  const col = Math.max(0, Math.min(COLS - 1, Math.floor(x)));
  return MARGIN_X + colX[col] + (x - col) * colW[col];
};

/** The column under a screen x, or -1 outside the house. */
export const colAt = (screenX: number): number => {
  const x = screenX - MARGIN_X;
  if (x < 0 || x >= colX[COLS]) return -1;
  for (let col = 0; col < COLS; col++) if (x < colX[col + 1]) return col;
  return -1;
};
/** Screen y of the floorboards of floor `y` (fractional while on the stair). */
export const floorY = (y: number): number => ROOF_H + (FLOORS - y) * CELL_H;

export const roomRect = (room: Pick<Room, "col" | "floor">): { x: number; y: number; w: number; h: number } => ({
  x: px(room.col),
  y: floorY(room.floor) - CELL_H,
  w: colW[room.col],
  h: CELL_H,
});

/** Thickness of walls and floors between rooms. */
export const WALL = 5;
export const FLOORBOARD = 12;

const STAIR_SWAY = 0.3;
/** Someone on the stair leans across it as she climbs, so she reads as walking a flight. */
export const figurePoint = (pos: { x: number; y: number }): { x: number; y: number } => {
  const frac = pos.y - Math.floor(pos.y);
  const onStair = frac > 0.001 && frac < 0.999;
  const sway = onStair ? (Math.floor(pos.y) % 2 === 0 ? frac - 0.5 : 0.5 - frac) * STAIR_SWAY * 2 : 0;
  return { x: px(pos.x + sway), y: floorY(pos.y) - FLOORBOARD };
};


export type Palette = { wall: string; wall2: string; trim: string; floor: string; ink: string };

/** Wallpapers a room can be repapered in. They change nothing but how the room looks. */
export const PAPERS: Record<string, { name: string; wall: string; wall2: string; trim: string; ink: string }> = {
  rose: { name: "Rose", wall: "#e2b3aa", wall2: "#d9a399", trim: "#b97f76", ink: "#5a2f2a" },
  sage: { name: "Sage", wall: "#c5d3ae", wall2: "#b5c59b", trim: "#8ea172", ink: "#3d4a2c" },
  cream: { name: "Cream", wall: "#f0d9b0", wall2: "#e6c998", trim: "#c9a66e", ink: "#5c4326" },
  sky: { name: "Sky", wall: "#b9d6e6", wall2: "#a7c8da", trim: "#7da3b8", ink: "#27485a" },
  plum: { name: "Plum", wall: "#b093a6", wall2: "#a38599", trim: "#84657a", ink: "#3d2636" },
  gold: { name: "Gold", wall: "#e3c77a", wall2: "#d9ba66", trim: "#b3934a", ink: "#4d3b12" },
  wine: { name: "Wine", wall: "#a85c5c", wall2: "#9a5050", trim: "#7a3c3c", ink: "#f6e3d3" },
  teal: { name: "Teal", wall: "#4a6875", wall2: "#405c68", trim: "#30474f", ink: "#e0eef2" },
  lilac: { name: "Lilac", wall: "#cbbbe0", wall2: "#bdaad6", trim: "#9380b3", ink: "#3a2a55" },
  moss: { name: "Moss", wall: "#7f9468", wall2: "#72875c", trim: "#566a43", ink: "#f1f4e6" },
};

export const paletteFor = (room: { kind: RoomKind; paper?: string }): Palette => {
  const base = PALETTES[room.kind];
  const paper = room.paper ? PAPERS[room.paper] : undefined;
  return paper ? { ...base, wall: paper.wall, wall2: paper.wall2, trim: paper.trim, ink: paper.ink } : base;
};

/** Wallpaper, wainscot and floor colour for each kind of room. */
export const PALETTES: Record<RoomKind, Palette> = {
  closed: { wall: "#51463f", wall2: "#463c36", trim: "#3a322d", floor: "#3a322d", ink: "#b8a998" },
  empty: { wall: "#d8cbb6", wall2: "#cdbfa8", trim: "#b8a88e", floor: "#a58a66", ink: "#6b5a44" },
  pantry: { wall: "#8a7a6c", wall2: "#7d6e61", trim: "#6a5c50", floor: "#5d5148", ink: "#f1e6d4" },
  kitchen: { wall: "#f0d9b0", wall2: "#e6c998", trim: "#c9a66e", floor: "#a9825a", ink: "#5c4326" },
  shop: { wall: "#c5d3ae", wall2: "#b5c59b", trim: "#8ea172", floor: "#a58a66", ink: "#3d4a2c" },
  parlour: { wall: "#e2b3aa", wall2: "#d9a399", trim: "#b97f76", floor: "#9c7450", ink: "#5a2f2a" },
  lab: { wall: "#4a6875", wall2: "#405c68", trim: "#30474f", floor: "#5d5148", ink: "#e0eef2" },
  conservatory: { wall: "#d8ecdb", wall2: "#c3e0c9", trim: "#8fba9a", floor: "#8a9a72", ink: "#2f4a35" },
  stillroom: { wall: "#b093a6", wall2: "#a38599", trim: "#84657a", floor: "#8a6a55", ink: "#3d2636" },
  dining: { wall: "#a85c5c", wall2: "#9a5050", trim: "#7a3c3c", floor: "#7a5238", ink: "#f6e3d3" },
  music: { wall: "#e3c77a", wall2: "#d9ba66", trim: "#b3934a", floor: "#9c7450", ink: "#4d3b12" },
  bath: { wall: "#b5d8dd", wall2: "#a3ccd2", trim: "#78a9b0", floor: "#8fa3a6", ink: "#254a50" },
};
