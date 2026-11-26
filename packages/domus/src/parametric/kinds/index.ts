import { NodeKindRegistry } from "../types";

import { anchorKind } from "./anchor";
import { candelabraKind } from "./candelabra";
import { deriveRectKind } from "./derive-rect";
import { doorKind, holeKind, windowKind } from "./door-window";
import { finishKind } from "./finish";
import { floorKind } from "./floor";
import { inputKind } from "./input";
import { instanceKind } from "./instance";
import { outputKind } from "./output";
import { mathKind } from "./math";
import { measureKind } from "./measure";
import { offsetKind } from "./offset";
import { placeKind } from "./place";
import { placementsKind } from "./placements";
import { pointKind } from "./point";
import { railingKind } from "./railing";
import { rampKind } from "./ramp";
import { rectKind } from "./rect";
import { rectPointKind } from "./rect-point";
import { spawnKind } from "./spawn";
import { textKind } from "./text";
import { valueKind } from "./value";
import { wallSegKind } from "./wall-seg";
import { wallsKind } from "./walls";

// The built-in node kinds. Like the block registry, the string-id indirection is what keeps
// documents serializable — and is the seam where editor-composed kinds plug in later.
export const defaultKinds: NodeKindRegistry = {
  rect: rectKind,
  point: pointKind,
  rectPoint: rectPointKind,
  deriveRect: deriveRectKind,
  offset: offsetKind,
  anchor: anchorKind,
  value: valueKind,
  text: textKind,
  measure: measureKind,
  math: mathKind,
  finish: finishKind,
  floor: floorKind,
  ramp: rampKind,
  walls: wallsKind,
  wall: wallSegKind,
  railing: railingKind,
  door: doorKind,
  window: windowKind,
  hole: holeKind,
  instance: instanceKind,
  spawn: spawnKind,
  place: placeKind,
  candelabra: candelabraKind,
  placements: placementsKind,
  // Interface kinds — only meaningful inside a component definition (doc 18); not in the palette.
  input: inputKind,
  output: outputKind,
};

// The primitive kinds — what the viewport Move tool (and Scale, for sized ones) operates on,
// what the outliner roots on, and what generators visually nest under.
export const PRIMITIVE_KINDS = new Set(["rect", "point", "anchor"]);
