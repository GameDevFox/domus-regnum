import { FLOOR_ORDER, standingAt } from "../space";
import type { FloorId, Plan, World } from "../space";
import type { Eye } from "./cutaway";

// Who is on a storey just now, for opening the rooms they are in (house-view.ts, cutaway.ts).

/** Someone's feet count as on a storey from this far under its floor: a floor is not quite level to the last hair. */
const UNDERFOOT = 0.01;

/**
 * The storey someone at a height is on: the highest whose floor is at or under her feet. On a
 * flight of stairs that is the storey she is climbing from, or coming down to, where the flight
 * stands; she is on the upper one only once she is at its top.
 */
export const storeyAt = (plan: Plan, y: number): FloorId => [...FLOOR_ORDER].sort((a, b) => plan.storeys[b].y - plan.storeys[a].y).find((floor) => plan.storeys[floor].y <= y + UNDERFOOT) ?? FLOOR_ORDER[0];

/** Where everybody on a storey stands: the household, customers and callers alike. */
export const occupantsOf = (world: World, floor: FloorId): Eye[] => world.actors.filter((actor) => storeyAt(world.plan, actor.walker.pos.y) === floor).map((actor) => standingAt(world, actor));
