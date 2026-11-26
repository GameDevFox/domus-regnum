import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";

// The parametric document — the level file's new source of truth. A doc is a DAG of nodes;
// a node's props are JSON literals or BINDINGS to other nodes' outputs (bindings are the
// graph's edges — there is no separate edge list). Placements are always DERIVED from the
// doc (see evaluate.ts / derive-level.ts), never persisted.
// Design: docs/design/13-parametric-builder.md.

export type NodeId = string;

// A binding wires one prop to another node's output. `output` names which output (default
// "out"); `path` picks a field of it (e.g. bind a number input to a rect's "w").
export type Binding = { bind: NodeId; output?: string; path?: string };

export type PropLiteral =
  | string
  | number
  | boolean
  | null
  | PropLiteral[]
  | { [k: string]: PropLiteral };

export type PropValue = PropLiteral | Binding | Binding[];

export const isBinding = (v: PropValue): v is Binding =>
  typeof v === "object" && v !== null && !Array.isArray(v) && "bind" in v;

// A MULTI-BINDING: several noodles into one input (e.g. every door's `opening` into the walls'
// `holes`). The resolved input value is the array of resolved outputs, in list order. An empty
// array is a literal, not a binding list.
export const isBindingList = (v: PropValue): v is Binding[] =>
  Array.isArray(v) && v.length > 0 && v.every((b) => isBinding(b as PropValue));

// The two ways to walk the graph's edges — a node's props ARE its out-edges. `bindingsOf` flattens
// every binding a props bag declares (single + list forms); `mapBindings` rewrites the bindings of
// ONE prop value through `fn` (literals pass through). Single-sourced here so the four graph passes
// (evaluate/edit/group/node-focus) share one vocabulary.
export const bindingsOf = (props: Record<string, PropValue>): Binding[] =>
  Object.values(props).flatMap((v) => (isBinding(v) ? [v] : isBindingList(v) ? v : []));

export const mapBindings = (v: PropValue, fn: (b: Binding) => Binding): PropValue =>
  isBinding(v) ? fn(v) : isBindingList(v) ? v.map(fn) : v;

export type DocNode = {
  id: NodeId;
  kind: string; // resolved in a NodeKindRegistry ("rect", "floor", "walls", …)
  label?: string;
  props: Record<string, PropValue>;
  // Node-graph canvas position. Editor-only — evaluation ignores it.
  ui?: { x: number; y: number };
};

export type ParametricDoc = {
  // Coords are TRUE Three.js world space: point/rect store {x, y(up), z(depth)}, rect extents are
  // w (world X) / d (world Z). Positional/size inputs are bundled into Point-typed props — rect's
  // `position`/`size`, offset's `delta`, anchor's `position` — while outputs stay {x,y,z,w,d}, so
  // consumers and binding `path`s read flat. No doc versioning pre-release: the format is free to
  // change and saved docs are disposable (a release will add a version + migrations when needed).
  name: string;
  tile: number; // world units per cell (same meaning as Level.tile)
  nodes: DocNode[];
  components?: ComponentDef[]; // in-doc, author-defined component definitions (doc 18); absent = none
};

// An author-defined component: a named, reusable sub-graph (docs/design/18-composable-components.md).
// Its typed INTERFACE is derived from the `input`/`output` nodes inside `nodes` — no separate
// metadata. Instance nodes reference it by `name` (resolved AFTER the built-in kind registry, so a
// definition can't shadow a built-in). The sub-graph is a plain node list like the doc's own and may
// itself contain instance nodes (nesting) — guarded against definition-level cycles by the evaluator.
export type ComponentDef = {
  name: string; // the kind id instances use; unique vs built-ins and other defs
  label?: string; // display name (palette / instance node)
  nodes: DocNode[];
};

// --- Node kinds (the TS component registry) -------------------------------------------

// Socket types — what the graph UI renders/validates and what bindings are checked against.
export type SocketType =
  | "number"
  | "string"
  | "boolean"
  | "rect"
  | "point"
  | "measure" // a length relative to a parent length: {scale, offset} (see Measure below)
  | "finish" // a wall finish bundle: {thickness, texOffset, style} (see Finish below)
  | "opening"
  | "frame" // one oriented world point (docs/design/14-component-outputs.md)
  | "frames" // a list of them (wall slots, …)
  | "placements"
  | "json";

export type InputSpec = {
  type: SocketType;
  default?: PropLiteral; // used when the node omits the prop (or a binding dangles)
  // Render an editable field directly on the node-graph canvas node (Blender-style) while the
  // prop is a literal; once bound, the field yields to the input's noodle handle.
  inline?: boolean;
  // Display name when it differs from the prop key (UI metadata only — bindings, serialization,
  // and consumers all use the key). First user: point's vertical shows as `z`, stored as the
  // shared `elevation` prop.
  label?: string;
  // For string inputs with a closed set of valid values: the editors render a dropdown instead
  // of a free text field. UI metadata ONLY — the socket TYPE stays "string", so any string
  // output (e.g. a `text` node) still wires in.
  options?: { value: string; label: string }[];
  // Accepts MULTIPLE bindings (the canvas appends noodles instead of replacing; the resolved
  // value is the array of resolved outputs). The walls' `holes` input is the first user.
  multi?: boolean;
};

export type OutputSpec = {
  type: SocketType;
};

// Doc-level values a kind's build may need — chiefly `tile` (world units per cell), so kinds
// emitting FREE placements (world-unit `pos`) can convert from grid space. Read at build time:
// a tile-only edit doesn't re-run builds, but in practice tile changes only via doc load,
// which rebuilds everything anyway.
export type BuildContext = {
  tile: number;
  // The chain of component definitions currently being expanded (doc 18) — guards definition-level
  // cycles (a component can't instantiate itself, directly or transitively). Absent at top level.
  componentStack?: string[];
};

// A node kind: socket schemas + the reactive expansion. Inputs arrive as Values (already
// resolved from literals/bindings by the evaluator); build returns named output Values —
// use scope.computed for derivations. `any` at this boundary because Value<T> is invariant
// (its `set` is contravariant) — each kind casts what it reads; the InputSpec/OutputSpec
// types are the editor-facing contract.
export type NodeKind = {
  inputs: Record<string, InputSpec>;
  outputs: Record<string, OutputSpec>;

  build: (
    scope: Scope,
    inputs: Record<string, Value<any>>,
    ctx: BuildContext,
  ) => Record<string, Value<any>>;
};

export type NodeKindRegistry = Record<string, NodeKind>;

// --- Shared socket payloads ------------------------------------------------------------

// The rect primitive's output: a w×d footprint on the floor, anchored at its NW corner — ALL IN
// WORLD METERS, Three.js world space (doc v4): x = world X, z = world Z (the floor plane), y = world
// Y (height). w spans world X (width), d spans world Z (depth). x/z address the NW cell's grid slot
// (cells = meters / tile). Fractional values are legal; grid-emitting consumers convert to cells.
export type Rect = {
  x: number;
  y: number; // world Y (height) — was `elevation` pre-doc-v4
  z: number; // world Z (floor depth) — was `y` pre-doc-v4
  w: number; // extent along world X (width)
  d: number; // extent along world Z (depth) — was `h` pre-doc-v4
};

// The point primitive's output: a single position in WORLD METERS, Three.js world space (doc v4):
// x = world X, y = world Y (height), z = world Z (floor depth). Two points wired into a `wall` node
// define an individual wall run.
export type Point = {
  x: number;
  y: number;
  z: number;
};

// A MEASURE: a length expressed relative to a parent length — resolved = scale·L + offset
// (the CSS calc(%, +px) / Roblox-UDim model, named for what it's used for: a measure taken
// against the wall's length). UNCLAMPED: scale may be negative or >1 (overhang semantics).
// First-class in the graph: the "measure" socket type, the `measure` constant node, and the
// paired scale/offset fields the editors render for measure-typed inputs.
export type Measure = { scale: number; offset: number };

// Resolve a Measure against a parent length L → `scale·L + offset` (the Roblox-UDim/CSS-calc model).
// Lives with the type since it's the canonical resolver, used by openings AND the rectPoint/deriveRect
// furniture toolkit — not specific to openings (where it used to hide).
export const resolveMeasure = (m: Measure, length: number): number => m.scale * length + m.offset;

// A wall FINISH bundle — thickness + texture offset + style as one value, so a single `finish`
// node can drive the whole house's wall look (the non-circular answer to "the door's pattern
// should match the wall": bind one finish into walls AND its doors). When a wall kind's `finish`
// input is bound it supersedes that kind's individual thickness/texOffset/style knobs.
export type Finish = { thickness: number; texOffset: number; style: string };

// A world-space oriented point — the currency of spatial outputs (docs/design/14-component-
// outputs.md). `facing` is the frame's forward (an instanced block's local +X, matching the
// wall factories' rotY convention); `up` defaults to +Y. `key` is the STABLE address — slot
// lists and placement ids derive from it, never from list position.
export type Frame = {
  pos: [number, number, number]; // world units
  facing: [number, number, number]; // unit vector
  up?: [number, number, number];
  key: string;
  attrs?: Record<string, PropLiteral>; // open per-frame bag (variant hints, size classes later)
};

// A wall opening (the `door`/`window` kinds' `opening` output; the `walls` kind's `holes`
// input): which side it sits on, where its CENTER lies along that side, and how wide it is —
// both as Measures resolved against the side's length, so holes can scale with the wall or
// stay fixed, per the authored intent. See parametric/kinds/openings.ts for the math.
export type Opening = {
  side: "N" | "S" | "W" | "E";
  pos: Measure;
  size: Measure;
};
