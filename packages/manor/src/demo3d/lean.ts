// How far a character's picture leans back as the camera rises. A flat picture stood upright
// looks squashed from above; leaning it back to face the camera undoes that, but sends its head
// into whatever is behind it. So it stays upright for as long as the camera is no higher than
// the angle the picture was drawn from, and above that it leans by only part of the difference.

const DEGREE = Math.PI / 180;
/** The height the pictures look as if they were drawn from: a little above level. Judged by eye. */
export const ART_ELEVATION = 30 * DEGREE;
/** The share of the camera's height above that which the picture leans by. */
export const LEAN_SHARE = 0.35;
/** The furthest a picture ever leans: past this its head is too far behind its feet. */
export const LEAN_LIMIT = 16 * DEGREE;

/** The lean, in radians, for a camera `elevation` radians above level (0 is level, a quarter-turn is straight down). */
export const leanFor = (elevation: number): number => Math.min(LEAN_LIMIT, Math.max(0, elevation - ART_ELEVATION) * LEAN_SHARE);
