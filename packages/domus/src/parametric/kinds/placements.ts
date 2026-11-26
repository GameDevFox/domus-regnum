import { Placement } from "../../blocks/types";
import { NodeKind } from "../types";

// Hand-placed blocks: a literal Placement[] passed straight through. This is how tile-by-tile
// editing coexists with the parametric layer — the stamp tool appends to a designated manual
// node — and how an existing saved Level migrates (one node holding all its placements; see
// edit.ts levelToDoc). Items without a local id get index-keyed by the deriver.
export const placementsKind: NodeKind = {
  inputs: {
    list: { type: "placements", default: [] },
  },
  outputs: { placements: { type: "placements" } },
  build: (scope, { list }) => ({
    placements: scope.computed<Placement[]>((use) => (use(list) as Placement[] | null) ?? []),
  }),
};
