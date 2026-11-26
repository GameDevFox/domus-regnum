import { Cell, Dir } from "./grid";
import { BlockParams, Level, Placement } from "./types";

// Ergonomic authoring helpers. These are PURE functions that emit `Placement[]` — the serializable
// on-disk format. So you get the convenience of `room({...})` while the saved level is still just
// flat data a future editor / save system can round-trip. Compose them with `level(...)`.

// Fill a w×h rectangle of cells (anchored at its NW corner [x,y]) with individual floor tiles.
export const floorRect = (
  x: number,
  y: number,
  w: number,
  h: number,
  params?: BlockParams,
): Placement[] => {
  const out: Placement[] = [];
  for (let r = y; r < y + h; r++)
    for (let c = x; c < x + w; c++) out.push({ block: "floor", cell: [c, r], params });
  return out;
};

// Like floorRect, but ONE region floor covering the whole rectangle — rendered as a single merged,
// texture-tiled quad and expanded to its cells for the navmesh. Prefer this for large areas: a 10×12
// floor is one mesh instead of 120. (The same data the editor's region tool will emit.)
export const floorArea = (
  x: number,
  y: number,
  w: number,
  h: number,
  params?: BlockParams,
): Placement[] => [{ block: "floor", cell: [x, y], size: [w, h], params }];

// A door cut into a room's perimeter: which side, the index along that side (0-based, NW->...), and
// how many segments it spans (default 1, so e.g. span 2 = a ~1 m opening on a 0.5 m grid).
export type Door = {
  side: Dir;
  at: number;
  span?: number;
  block?: string; // default "doorway"
  params?: BlockParams;
};

export type RoomSpec = {
  x: number;
  y: number;
  w: number;
  h: number;
  doors?: Door[];
  floorParams?: BlockParams;
  wallParams?: BlockParams;
  wallBlock?: string; // default "wall"
};

// A rectangular room: a floor rectangle plus a perimeter of wall segments, with doors punched out
// where requested. Each side's segments are indexed 0..(len-1) running in increasing col (N/S) or
// increasing row (W/E), so `{ side: "S", at: 2 }` is the 3rd segment along the south wall.
export const room = ({
  x,
  y,
  w,
  h,
  doors = [],
  floorParams,
  wallParams,
  wallBlock = "wall",
}: RoomSpec): Placement[] => {
  const placements = floorRect(x, y, w, h, floorParams);
  const doorStartingAt = (side: Dir, at: number) =>
    doors.find((d) => d.side === side && d.at === at);
  // True when `at` falls *inside* (but not at the start of) some door's span — those segments are
  // covered by the wide opening and get no wall/door of their own.
  const coveredByDoor = (side: Dir, at: number) =>
    doors.some((d) => d.side === side && at > d.at && at < d.at + (d.span ?? 1));
  // A single-cell doorway whose opening is WIDENED past its own cell (so it reads as a ~0.9 m door
  // while staying nav-centred on one node). The two walls beside it are trimmed back to make room.
  const wideDoorAt = (side: Dir, at: number) =>
    doors.some(
      (d) =>
        d.side === side &&
        d.at === at &&
        (d.block ?? "doorway") === "doorway" &&
        (d.span ?? 1) === 1,
    );

  const addEdge = (cell: Cell, edge: Dir, at: number) => {
    if (coveredByDoor(edge, at)) return; // swallowed by a spanning door
    const door = doorStartingAt(edge, at);
    if (door) {
      const wide = (door.block ?? "doorway") === "doorway" && (door.span ?? 1) === 1;
      placements.push({
        block: door.block ?? "doorway",
        cell,
        edge,
        span: door.span,
        // A door/window inherits the wall's params (thickness, colour) so its reveal matches the wall
        // it's cut into; its own params override. A span-1 doorway is widened (`wide`).
        params: { ...wallParams, ...(wide ? { wide: true } : {}), ...door.params },
      });
      return;
    }
    // Plain wall — trim the end that faces a wide door so the opening reads full width.
    const doorStart = wideDoorAt(edge, at - 1); // wide door on the −run side
    const doorEnd = wideDoorAt(edge, at + 1); //   wide door on the +run side
    placements.push({
      block: wallBlock,
      cell,
      edge,
      params: doorStart || doorEnd ? { ...wallParams, doorStart, doorEnd } : wallParams,
    });
  };

  for (let i = 0; i < w; i++) {
    addEdge([x + i, y], "N", i);
    addEdge([x + i, y + h - 1], "S", i);
  }
  for (let i = 0; i < h; i++) {
    addEdge([x, y + i], "W", i);
    addEdge([x + w - 1, y + i], "E", i);
  }
  return placements;
};

// Place a prop on a cell (optionally facing a direction).
export const onCell = (
  block: string,
  cell: Cell,
  opts: { face?: Dir; params?: BlockParams } = {},
): Placement => ({ block, cell, face: opts.face, params: opts.params });

// Place a block freely in world space.
export const free = (
  block: string,
  pos: [number, number, number],
  opts: { rotY?: number; params?: BlockParams } = {},
): Placement => ({ block, pos, rotY: opts.rotY, params: opts.params });

// Assemble named placement groups into a level.
export const level = (name: string, tile: number, ...groups: Placement[][]): Level => ({
  name,
  tile,
  placements: groups.flat(),
});
