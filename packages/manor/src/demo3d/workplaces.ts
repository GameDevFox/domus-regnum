import { PLOT_AT } from "../game";
import type { JobId } from "../game";
import type { FloorId } from "../space";

// The places of the house where work is done, as the page shows them: each has a picture, a
// card of its own that says who works there (work-card.ts, garden-menu.ts), and an icon over the
// place itself in the 3D view that opens it (place-icons.ts). Who may work where, and how many,
// is the rules' (`assign` and `JOB_PLACES` in src/game). A new kind of work is a new line here.

export type Workplace = {
  job: JobId;
  /** The place's name, at the head of its card; what it is called in a sentence; and what its card holds. */
  name: string;
  called: string;
  holds: string;
  glyph: string;
  /** The work done there, as it is said of someone ("Baking: Sage"); and what is said when nobody has it. */
  label: string;
  nobody: string;
  /** The key that opens its card. */
  key: string;
  /** Where its icon floats: the storey it is of (or the grounds), and the point, with its height measured from that storey's floor (from the ground floor's, for the grounds). */
  floor: FloorId | "grounds";
  at: { x: number; y: number; z: number };
};

/** How high an icon floats over a room's floor: over the tops of its walls, so that it shows while they stand. */
const OVER_A_ROOM = 3.45;
/** …over the laboratory's, whose storey is lower, the cellar's walls being lower… */
const OVER_A_CELLAR_ROOM = 2.85;
/** …and over the garden's plots, where there are no walls. */
const OVER_THE_PLOTS = 1.7;
const middle = (values: number[]): number => (Math.min(...values) + Math.max(...values)) / 2;

export const WORKPLACES: Workplace[] = [
  { job: "bake", name: "Kitchen", called: "the kitchen", holds: "who bakes, and what there is to bake with", glyph: "🥖", label: "Baking", nobody: "Nobody is baking", key: "k", floor: "ground", at: { x: 5, y: OVER_A_ROOM, z: 4 } },
  { job: "shop", name: "Shop", called: "the shop", holds: "who keeps it, and what is on its shelf", glyph: "🛎️", label: "Keeping the shop", nobody: "Nobody keeps the shop", key: "b", floor: "ground", at: { x: 5, y: OVER_A_ROOM, z: 9.5 } },
  { job: "lab", name: "Laboratory", called: "the laboratory", holds: "who is at the alchemy, and how near the next invention is", glyph: "⚗️", label: "At the alchemy", nobody: "Nobody is at the alchemy", key: "l", floor: "cellar", at: { x: 15.5, y: OVER_A_CELLAR_ROOM, z: 3 } },
  { job: "garden", name: "Garden", called: "the garden", holds: "who sees to it, what grows in the plots behind the house, and what is to be sown", glyph: "🌱", label: "Seeing to the garden", nobody: "Nobody sees to the garden", key: "g", floor: "grounds", at: { x: middle(PLOT_AT.map((p) => p.x)), y: OVER_THE_PLOTS, z: middle(PLOT_AT.map((p) => p.z)) } },
];

export const workplaceOf = (job: JobId): Workplace => {
  const found = WORKPLACES.find((place) => place.job === job);
  if (!found) throw new Error(`no place of work for ${job}`);
  return found;
};
