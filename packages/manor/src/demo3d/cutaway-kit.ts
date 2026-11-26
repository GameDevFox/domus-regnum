import type { Span } from "./cutaway";

// What the cutaway's tests share: the height of a wall's rail and top, and a wall four metres long.

export const RAIL = 0.9;
export const TOP = 3.3;
/** A wall four metres long, running east along z = 0. */
export const WALL: Span = { axis: "x", at: 0, from: 0, to: 4 };
