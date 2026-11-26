import { BlockRegistry } from "./types";

import { Bed, Barrel, Cabinet, Chair, Fireplace, Plant, Rug, Table } from "./kinds/furniture";
import { Glow, Lamp } from "./kinds/lights";
import { Candelabra } from "./kinds/models";
import { Column, Corner, Doorway, Floor, Railing, Ramp, Stair, Wall, Window } from "./kinds/structural";

// The concrete block kinds, grouped by category in `kinds/`:
//   - `kinds/structural.ts` — grid-anchored floors/walls/doorways/windows/corners/columns
//   - `kinds/furniture.ts`  — free-placement furniture & props
//   - `kinds/lights.ts`     — light blocks
// Each kind is a factory (scope, params) -> { mesh } built in LOCAL space (the interpreter
// positions/rotates it); surface helpers (param readers, textures, wallpaper, caps) live in
// block-materials.ts. `params.tile`/`span` are injected by the interpreter; everything else is
// author-supplied and JSON-serializable.

// The default registry: the block ids a level may reference. Authoring helpers and sample levels
// resolve through this. Extend it (or pass your own) to add kinds.
export const defaultBlocks: BlockRegistry = {
  floor: Floor,
  ramp: Ramp,
  wall: Wall,
  doorway: Doorway,
  window: Window,
  railing: Railing,
  stair: Stair,
  corner: Corner,
  column: Column,
  rug: Rug,
  table: Table,
  chair: Chair,
  cabinet: Cabinet,
  bed: Bed,
  fireplace: Fireplace,
  plant: Plant,
  barrel: Barrel,
  lamp: Lamp,
  glow: Glow,
  candelabra: Candelabra,
};
