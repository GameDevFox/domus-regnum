import { FLOOR_ORDER } from "../space";
import type { FloorId, Stair, Storey } from "../space";
import type { View } from "./house-view";

// The storeys in the order you climb through them, with the whole house above the top one.
const LADDER: View[] = ["cellar", "ground", "first", "house"];

/** The view one step up (+1) or down (-1) from this one. It stops at the cellar and at the whole house. */
export const stepView = (view: View, by: 1 | -1): View => LADDER[Math.max(0, Math.min(LADDER.length - 1, LADDER.indexOf(view) + by))];

/** The storeys drawn in each view, lowest first: the one looked into and what is under it above ground, or the cellar alone. */
export const SHOWN_IN: Record<View, FloorId[]> = { house: ["ground", "first"], first: ["ground", "first"], ground: ["ground"], cellar: ["cellar"] };

/**
 * The storey whose lamps throw their light in a view: the one being looked into. With the whole
 * house on show the rooms are under their roofs, and no room's lamp is worth what it costs to
 * draw by; the lamps of a storey seen from above, under the one looked into, still glow but
 * throw no light.
 */
export const lampFloor = (view: View): FloorId | null => (view === "house" ? null : view);

/** Metres: someone standing on a floor is not always at its height to the last hair. */
const FLOOR_SLACK = 0.05;

/**
 * The heights between which people are on show in a view: from the floor of the lowest storey it
 * draws up to the floor of the storey above the highest, so that someone on a stair is in sight
 * to its last step, through the thickness of the floor she is climbing to.
 */
export const bandOf = (storeys: Record<FloorId, Storey>, view: View): { low: number; high: number } => {
  const floors = SHOWN_IN[view];
  const top = floors[floors.length - 1];
  const above = FLOOR_ORDER[FLOOR_ORDER.indexOf(top) + 1] as FloorId | undefined;
  return { low: storeys[floors[0]].y - FLOOR_SLACK, high: above ? storeys[above].y - FLOOR_SLACK : storeys[top].y + storeys[top].height };
};

/**
 * The view to follow someone in, given the one being looked through now: the storey she stands
 * on. On a stair (`floor` is null) it is the storey her flight rises from, which the flight is
 * drawn with. So going down, the view goes to the storey below as she steps onto the stair, and
 * that storey is seen as she comes down into it; going up, it stays where she set out from
 * until she steps off at the top. The whole house is left as it is.
 */
export const viewFollowing = (view: View, floor: FloorId | null, flight: Stair | null): View => {
  if (view === "house") return view;
  if (floor) return floor;
  return flight ? flight.lower : view;
};
