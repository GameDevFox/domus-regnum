import { BlockParams } from "./types";

// Type-specific, user-editable properties for block kinds. A block kind declares which of its
// `params` the Builder inspector exposes, and how to render each (the widget type). This is the
// single source of truth the inspector renders from and that future kinds extend.
//
// Pure + serializable on purpose (no Three, no React): the inspector and the unit tests both read
// it, and the values it produces are plain `BlockParams` entries that round-trip to disk.

export type ParamValue = string | number | boolean;

// One editable field. Discriminated by `type` so the inspector picks the right widget. Only `enum`
// gets a rendered control today; the others are scaffolded for the next property that needs them.
export type PropertyField =
  | {
      type: "enum";
      key: string;
      label: string;
      options: { value: string; label: string }[];
      default: string;
    }
  | {
      type: "number";
      key: string;
      label: string;
      default: number;
      min?: number;
      max?: number;
      step?: number;
    }
  | { type: "boolean"; key: string; label: string; default: boolean }
  | { type: "color"; key: string; label: string; default: number };

export type PropertySchema = PropertyField[];

// --- viewSide: the first property using this framework ----------------------------------------
// Which side(s) of an edge block (wall/doorway/window) render, relative to the block's own facing
// normal (its local +Z). At runtime the WHOLE block hides when the camera is on the excluded side,
// so you can look through the near side of the house. `both` (the default) always renders. See
// view-cull.ts for the runtime test.
export const VIEW_SIDE = "viewSide";
export type ViewSide = "front" | "back" | "both";

// Cull metadata stamped on auto-generated corner posts (by `addWallCorners`): the `viewSide` of the
// two walls meeting at the junction — `cullH` for the horizontal wall (world normal +Z), `cullV` for
// the vertical one (world normal +X). A corner hides only when the camera is outside BOTH, so the
// lone post stops standing up like a pillar when you look in from the diagonal. See view-cull.ts.
// Internal/derived — not user-editable, so not in `blockProperties`.
export const CULL_H = "cullH";
export const CULL_V = "cullV";

// The viewSide that makes a perimeter block render only from INSIDE the building (drop away
// when the camera looks through): relative to a block's local +Z normal — N/S walls face south
// (+Z), E/W walls face east (+X) — so "visible from the interior" is `front` for the north &
// west sides and `back` for the south & east. Shared by the hand-authored samples and the
// parametric `walls`/`door`/`window` kinds' `cull` option.
export const OUTWARD_VIEW: Record<"N" | "S" | "W" | "E", ViewSide> = {
  N: "front",
  W: "front",
  S: "back",
  E: "back",
};

export const VIEW_SIDE_FIELD: PropertyField = {
  type: "enum",
  key: VIEW_SIDE,
  label: "Visible from",
  options: [
    { value: "both", label: "Both sides" },
    { value: "front", label: "Front only" },
    { value: "back", label: "Back only" },
  ],
  default: "both",
};

// Wall thickness in meters — the mesh, corner-post sizing, and the navmesh footprint carve all
// read `params.thickness` (default 0.2; the manor's exteriors use 0.3, partitions 0.15).
export const THICKNESS_FIELD: PropertyField = {
  type: "number",
  key: "thickness",
  label: "Thickness",
  default: 0.2,
  min: 0.05,
  max: 1,
  step: 0.05,
};

// Wall finish (params.wallStyle, read by wallpaperMat): the red damask wallpaper or the dark
// paneled wood — both quadrants of the walls.png atlas, pre-cropped per style. The options
// list is shared with the parametric kinds' `style` input dropdowns.
export const WALL_STYLE_OPTIONS = [
  { value: "wallpaper", label: "Wallpaper" },
  { value: "wood", label: "Wood panel" },
];

export const WALL_STYLE_FIELD: PropertyField = {
  type: "enum",
  key: "wallStyle",
  label: "Style",
  options: WALL_STYLE_OPTIONS,
  default: "wallpaper",
};

// Horizontal pattern offset in meters (params.texOffset, read by wallpaperMat) — slides the
// finish along the run so the author can line seams up exactly.
export const TEX_OFFSET_FIELD: PropertyField = {
  type: "number",
  key: "texOffset",
  label: "Pattern offset",
  default: 0,
  min: -8,
  max: 8,
  step: 0.05,
};

// The editable-property schema per block id. Walls/doorways/windows expose `viewSide` plus the
// shared finish controls (they're all wall pieces); everything else has none (yet). Extend this
// as kinds gain editable params.
export const blockProperties: Record<string, PropertySchema> = {
  wall: [VIEW_SIDE_FIELD, THICKNESS_FIELD, WALL_STYLE_FIELD, TEX_OFFSET_FIELD],
  doorway: [VIEW_SIDE_FIELD, WALL_STYLE_FIELD, TEX_OFFSET_FIELD],
  window: [VIEW_SIDE_FIELD, WALL_STYLE_FIELD, TEX_OFFSET_FIELD],
};

// The schema for a block id (empty array when the kind has no editable properties).
export const propertiesFor = (block: string): PropertySchema => blockProperties[block] ?? [];

// Read a placement's current value for a field, falling back to the field default when unset.
export const paramValue = (params: BlockParams | undefined, field: PropertyField): ParamValue => {
  const v = params?.[field.key];
  return v === undefined ? field.default : (v as ParamValue);
};
