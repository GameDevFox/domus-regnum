import { HOUSE } from "./house-plan";
import { buildNav } from "./nav";
import type { Spot } from "./types";

// What the space tests share: the house's floor to walk on, and a spot in it by name.

export const nav = buildNav(HOUSE);
export const spot = (id: string): Spot => {
  const found = HOUSE.spots.find((s) => s.id === id);
  if (!found) throw new Error(`no spot ${id}`);
  return found;
};
