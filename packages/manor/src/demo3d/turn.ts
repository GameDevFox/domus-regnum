// The Turn buttons do not spin the view by a fixed amount: they take it to the next of the four
// diagonal views, the ones a tactics map is looked at from. Pure arithmetic, so it can be tested.

const DEGREE = Math.PI / 180;
/** The diagonals: 45 degrees round from looking straight north, and every quarter-turn after. */
const FIRST_STOP = 45 * DEGREE;
const STOP_SPACING = 90 * DEGREE;
/**
 * Nearer a diagonal than this, the view counts as already being on it, and a turn goes on to
 * the next one. Further off, a turn only finishes the journey to the diagonal ahead. A third of
 * the way to the midpoint between two diagonals.
 */
export const AT_STOP = 15 * DEGREE;

/**
 * Where a turn should end, given where the camera is now. `direction` is +1 for the way the
 * angle grows and -1 for the other. The answer is not wrapped: it lies on the asked-for side of
 * `azimuth`, so the difference between the two is the turn to make.
 */
export const nextStop = (azimuth: number, direction: 1 | -1): number => {
  const steps = (azimuth - FIRST_STOP) / STOP_SPACING;
  const nearest = Math.round(steps);
  const offNearest = Math.abs(steps - nearest) * STOP_SPACING;
  const index = offNearest <= AT_STOP ? nearest + direction : direction > 0 ? Math.ceil(steps) : Math.floor(steps);
  return FIRST_STOP + index * STOP_SPACING;
};
