import { defaultKinds } from "./kinds";
import {
  ComponentDef,
  DocNode,
  InputSpec,
  NodeKindRegistry,
  OutputSpec,
  SocketType,
} from "./types";

// Kind resolution for the EDITOR (docs/design/18): a node's `kind` may name a built-in kind OR a
// doc-local component definition. The editor renders sockets, the inspector, and validates wiring
// against this schema; the evaluator's synthesized component kind reuses `componentSchema` for its
// own inputs/outputs (so the two never drift).

export type KindSchema = {
  inputs: Record<string, InputSpec>;
  outputs: Record<string, OutputSpec>;
};

// Socket types whose `default` can be typed inline on an interface `input` node (a literal field —
// number/string/boolean, or the compound point/measure editors). Everything else is connector-only:
// you can't type a rect/finish/frame/… literal, so the default is supplied by wiring a fallback into
// its socket instead.
const LITERAL_DEFAULT_TYPES = new Set<SocketType>([
  "number",
  "string",
  "boolean",
  "point",
  "measure",
]);

// A component definition's INTERFACE: inputs from its `input` nodes, outputs from its `output` nodes,
// plus the always-present auto-aggregated `placements` output. Pure (no build).
export const componentSchema = (def: ComponentDef): KindSchema => {
  const inputs: Record<string, InputSpec> = {};
  const outputs: Record<string, OutputSpec> = { placements: { type: "placements" } };
  for (const n of def.nodes) {
    const name = typeof n.props.name === "string" ? n.props.name : undefined;
    const type = (typeof n.props.type === "string" ? n.props.type : "json") as SocketType;
    if (n.kind === "input" && name)
      inputs[name] = { type, default: (n.props.default ?? null) as InputSpec["default"] };
    if (n.kind === "output" && name) outputs[name] = { type };
  }
  return { inputs, outputs };
};

// Built-in registry first (a definition can't shadow a built-in), else a doc component.
export const resolveSchema = (
  kind: string,
  components?: ComponentDef[],
  registry: NodeKindRegistry = defaultKinds,
): KindSchema | undefined => {
  const builtin = registry[kind];
  if (builtin) return builtin; // NodeKind ⊇ KindSchema (inputs + outputs)
  const def = components?.find((c) => c.name === kind);
  return def ? componentSchema(def) : undefined;
};

// A NODE's schema as the editor should render/validate it. Same as `resolveSchema(node.kind)` for
// ordinary nodes, but the interface kinds (doc 18) carry their real socket type in a `type` PROP, not
// the static schema: inside a definition an `input` is a SOURCE whose `out` carries the declared type
// (so it gets a colored output handle you can wire into the sub-graph), and an `output` is a SINK
// whose `in` carries it. Without this the data socket is `json` (no colour → no handle, no type match).
export const nodeSchema = (
  node: DocNode,
  components?: ComponentDef[],
  registry: NodeKindRegistry = defaultKinds,
): KindSchema | undefined => {
  const base = resolveSchema(node.kind, components, registry);
  if (!base) return base;
  const declared = (typeof node.props.type === "string" ? node.props.type : undefined) as
    | SocketType
    | undefined;
  if (node.kind === "input" && declared)
    return {
      ...base,
      // The `default` socket adopts the declared type: a literal field for scalar/compound-literal
      // types, connector-only (wire a fallback) for complex types you can't type.
      inputs: {
        ...base.inputs,
        default: {
          ...base.inputs.default,
          type: declared,
          inline: LITERAL_DEFAULT_TYPES.has(declared),
        },
      },
      outputs: { ...base.outputs, out: { type: declared } },
    };
  if (node.kind === "output" && declared)
    return { ...base, inputs: { ...base.inputs, in: { ...base.inputs.in, type: declared } } };
  return base;
};
