import { inRect, roomRects, stairWells } from "../space";
import type { FloorId, Plan, Vec3 } from "../space";

// Clicking someone follows her. But the pictures of people are found by a line from the eye
// through the click, and that line takes no notice of the house: someone on the floor below was
// found through the boards she is under. This says when a floor is in the way.

/**
 * Whether a floor that is drawn lies between the eye and a point: then a click there is on the
 * floor, not on whoever is under it. `shown` is the storeys drawn; with the roof on, the
 * ceiling of each is in the way as well, so nobody indoors is clicked through the slates.
 */
export const underFloor = (plan: Plan, shown: FloorId[], roofed: boolean, eye: Vec3, point: Vec3): boolean => {
  const crossesAt = (y: number): { x: number; z: number } | null => {
    // The eye above the level and the point below it: a click from above, on someone underneath.
    if (!(eye.y > y && point.y < y)) return null;
    const t = (y - eye.y) / (point.y - eye.y);
    return { x: eye.x + (point.x - eye.x) * t, z: eye.z + (point.z - eye.z) * t };
  };
  return shown.some((floor) => {
    const storey = plan.storeys[floor];
    const rooms = plan.rooms.filter((r) => r.floor === floor).flatMap(roomRects);
    const over = (at: { x: number; z: number } | null): boolean => at !== null && rooms.some((r) => inRect(r, at.x, at.z));
    const through = crossesAt(storey.y);
    // Her own floor is under her feet, never over her; and a stair well is a hole in it.
    const slab = over(through) && through !== null && !stairWells(plan, floor).some((w) => inRect(w, through.x, through.z));
    return slab || (roofed && over(crossesAt(storey.y + storey.height)));
  });
};
