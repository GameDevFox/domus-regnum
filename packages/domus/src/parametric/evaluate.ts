import { Scope } from "@kitsune/common-web/src/scope";
import { batch, isValue, UsedAs, Value } from "@kitsune/common-web/src/value";

import { Placement } from "../blocks/types";

import { defaultKinds } from "./kinds";
import { componentSchema } from "./resolve";
import {
  Binding,
  BuildContext,
  bindingsOf,
  ComponentDef,
  DocNode,
  isBinding,
  isBindingList,
  NodeId,
  NodeKind,
  NodeKindRegistry,
  ParametricDoc,
  PropLiteral,
} from "./types";

// The evaluator: turns a (possibly reactive) ParametricDoc into live output Values — chiefly
// `placements`, the concatenation of every generator node's output with deterministic ids
// (`nodeId/localKey`) stamped for keyed mounting.
//
// Update strategy, two speeds:
//   - LITERAL edits (the hot path — dragging a rect's w/h, retexturing) update the existing
//     prop Values in place (batched), and only the dependent computeds recompute.
//   - STRUCTURAL changes (nodes added/removed, kind changes, re-wiring, OR any edit to a
//     component definition) tear down and rebuild the whole instance graph. Cheap at editor scale.
//
// Composable components (docs/design/18): a node whose `kind` names a doc `component` is an
// INSTANCE. `resolveKind` synthesizes a NodeKind for it whose `build` expands the definition's
// sub-graph in a fresh scope (`buildComponent`), seeding the definition's `input` nodes with the
// instance's inputs and collecting its `output` nodes. Emitted placements carry their internal id
// (`internalNodeId/localKey`); the outer stamp prepends the instance id, so nesting namespaces
// automatically (`instanceId/internalNodeId/localKey`).
//
// Malformed input is skipped loudly (console.warn), never thrown — matching mountLevel's
// unknown-block convention — so a hand-edited or stale doc can't crash the editor.

type Instance = {
  literals: Map<string, Value<any>>; // settable in place on literal edits
  outputs: Record<string, Value<any>>;
};

// Resolve a kind name → a NodeKind (built-in OR a synthesized component). Recursive for nesting.
type Resolve = (kind: string) => NodeKind | undefined;

export type EvaluatedDoc = {
  placements: Value<Placement[]>;
  // Live outputs of one node (for the inspector / node canvas). Undefined for unknown or
  // cycle-skipped nodes.
  outputs: (id: NodeId) => Record<string, Value<any>> | undefined;
};

// Dot-path field pick for binding `path` ("w", "size.0", …).
const getPath = (obj: unknown, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);

// Editor-only fields excluded from a node's structural fingerprint.
const nodeStructure = (n: DocNode, includeLiterals: boolean) => [
  n.id,
  n.kind,
  includeLiterals
    ? n.props // definition sub-nodes: literals matter (no in-place fast path for sub-graphs in v1)
    : Object.entries(n.props)
        .map(([name, v]) => [name, isBinding(v) || isBindingList(v) ? v : "L"] as const)
        .sort((a, b) => (a[0] < b[0] ? -1 : 1)),
];

// The structural fingerprint: top-level node ids/kinds/bindings (literal VALUES update in place),
// PLUS the full component library (a definition edit — literal or wiring — rebuilds, no fast path).
const structureKey = (doc: ParametricDoc): string =>
  JSON.stringify([
    doc.nodes.map((n) => nodeStructure(n, false)),
    (doc.components ?? []).map((c) => [c.name, c.nodes.map((n) => nodeStructure(n, true))]),
  ]);

// Dependency ids of a node (its bindings' sources, multi-bindings flattened).
const depsOf = (node: DocNode): NodeId[] => bindingsOf(node.props).map((b) => b.bind);

// Topological order over a node list (Kahn). Nodes in cycles are returned separately — the
// evaluator skips them (with a warning) rather than crashing.
const topoSort = (nodes: DocNode[]): { ordered: DocNode[]; cyclic: DocNode[] } => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pendingDeps = new Map<NodeId, number>();
  const dependents = new Map<NodeId, NodeId[]>();

  nodes.forEach((n) => {
    const deps = depsOf(n).filter((d) => byId.has(d)); // dangling binds resolve to defaults later
    pendingDeps.set(n.id, deps.length);
    deps.forEach((d) => {
      if (!dependents.has(d)) dependents.set(d, []);
      dependents.get(d)!.push(n.id);
    });
  });

  const queue = nodes.filter((n) => pendingDeps.get(n.id) === 0).map((n) => n.id);
  const ordered: DocNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(byId.get(id)!);
    (dependents.get(id) ?? []).forEach((dep) => {
      const left = pendingDeps.get(dep)! - 1;
      pendingDeps.set(dep, left);
      if (left === 0) queue.push(dep);
    });
  }
  const orderedIds = new Set(ordered.map((n) => n.id));
  return { ordered, cyclic: nodes.filter((n) => !orderedIds.has(n.id)) };
};

// Resolve a node's declared inputs to Values (from literals/bindings against already-built sources).
const resolveInputs = (
  node: DocNode,
  kind: NodeKind,
  instances: Map<NodeId, Instance>,
  nodeScope: Scope,
): { inputs: Record<string, Value<any>>; literals: Map<string, Value<any>> } => {
  const literals = new Map<string, Value<any>>();
  const inputs: Record<string, Value<any>> = {};

  const resolveBinding = (b: Binding, name: string): Value<any> | null => {
    const source = instances.get(b.bind);
    const outV = source?.outputs[b.output ?? "out"];
    if (!outV) {
      console.warn(
        `[parametric] node "${node.id}" prop "${name}" binds to missing ` +
          `"${b.bind}.${b.output ?? "out"}" — skipped`,
      );
      return null;
    }
    return b.path ? nodeScope.computed((use) => getPath(use(outV), b.path!)) : outV;
  };

  Object.entries(kind.inputs).forEach(([name, spec]) => {
    const prop = node.props[name];
    if (prop !== undefined && isBinding(prop)) {
      inputs[name] = resolveBinding(prop, name) ?? Value(spec.default ?? null);
      return;
    }
    if (prop !== undefined && isBindingList(prop)) {
      const sources = prop
        .map((b) => resolveBinding(b, name))
        .filter((v): v is Value<any> => v !== null);
      inputs[name] = nodeScope.computed((use) => sources.map((v) => use(v)));
      return;
    }
    const v = Value<any>(prop !== undefined ? prop : (spec.default ?? null));
    literals.set(name, v);
    inputs[name] = v;
  });

  return { inputs, literals };
};

// Build a node graph (the top-level doc OR a component's sub-graph) into instances. `seeds` (present
// only for a component sub-graph) feed the definition's `input` nodes directly — an `input` node's
// `out` IS the seeded Value, so an instance-input change flows reactively through the sub-graph.
const buildGraph = (
  buildScope: Scope,
  nodes: DocNode[],
  resolve: Resolve,
  ctx: BuildContext,
  seeds?: Record<string, Value<any>>,
): Map<NodeId, Instance> => {
  const instances = new Map<NodeId, Instance>();
  const { ordered, cyclic } = topoSort(nodes);
  cyclic.forEach((n) =>
    console.warn(`[parametric] node "${n.id}" is in a binding cycle — skipped`),
  );

  ordered.forEach((node) => {
    // A seeded interface input: its output is the value the instance supplied (or its default).
    if (seeds && node.kind === "input") {
      const name = typeof node.props.name === "string" ? node.props.name : "in";
      const out = seeds[name] ?? Value<any>(node.props.default ?? null);
      instances.set(node.id, { literals: new Map(), outputs: { out } });
      return;
    }

    const kind = resolve(node.kind);
    if (!kind) {
      console.warn(`[parametric] unknown node kind "${node.kind}" (node "${node.id}") — skipped`);
      return;
    }
    const nodeScope = buildScope.child();
    const { inputs, literals } = resolveInputs(node, kind, instances, nodeScope);
    instances.set(node.id, {
      literals,
      outputs: kind.build(nodeScope, inputs, ctx),
    });
  });

  return instances;
};

// Concatenate + id-stamp every `placements` output across a node list. The per-source identity
// cache keeps untouched placements' object identity stable, so mountLevel's keyed `each` only
// rebuilds what actually changed (stamping otherwise mints new identities on every re-derive).
const aggregatePlacements = (
  scope: Scope,
  nodes: DocNode[],
  instances: Map<NodeId, Instance>,
  resolve: Resolve,
): Value<Placement[]> => {
  const out = Value<Placement[]>([]);
  const sources: Array<{ nodeId: NodeId; v: Value<any> }> = [];
  nodes.forEach((n) => {
    const inst = instances.get(n.id);
    const kind = resolve(n.kind);
    if (!inst || !kind) return;
    Object.entries(kind.outputs).forEach(([name, spec]) => {
      if (spec.type === "placements" && inst.outputs[name])
        sources.push({ nodeId: n.id, v: inst.outputs[name] });
    });
  });

  const stampCache = new Map<NodeId, WeakMap<Placement, Placement>>();
  scope.effect((use) => {
    const all: Placement[] = [];
    sources.forEach(({ nodeId, v }) => {
      let cache = stampCache.get(nodeId);
      if (!cache) {
        cache = new WeakMap();
        stampCache.set(nodeId, cache);
      }
      ((use(v) as Placement[] | null) ?? []).forEach((p, i) => {
        const id = `${nodeId}/${p.id ?? i}`;
        const hit = cache.get(p);
        if (hit && hit.id === id) all.push(hit);
        else {
          const stamped = { ...p, id };
          cache.set(p, stamped);
          all.push(stamped);
        }
      });
    });
    out.set(all);
  });
  return out;
};

// Expand a component definition for one instance: build its sub-graph (seeding `input` nodes with
// the instance's inputs), collect its `output` nodes, and aggregate its placements. The definition
// stack in `ctx` guards definition-level cycles.
const buildComponent = (
  scope: Scope,
  def: ComponentDef,
  seedInputs: Record<string, Value<any>>,
  ctx: BuildContext,
  resolve: Resolve,
): Record<string, Value<any>> => {
  const stack = ctx.componentStack ?? [];
  if (stack.includes(def.name)) {
    console.warn(`[parametric] component "${def.name}" is in a definition cycle — skipped`);
    return { placements: Value<Placement[]>([]) };
  }
  const subCtx: BuildContext = { ...ctx, componentStack: [...stack, def.name] };
  const instances = buildGraph(scope, def.nodes, resolve, subCtx, seedInputs);

  const outputs: Record<string, Value<any>> = {};
  def.nodes.forEach((n) => {
    if (n.kind === "output" && typeof n.props.name === "string") {
      const inst = instances.get(n.id);
      if (inst?.outputs.value) outputs[n.props.name] = inst.outputs.value;
    }
  });
  outputs.placements = aggregatePlacements(scope, def.nodes, instances, resolve);
  return outputs;
};

// Synthesize a NodeKind for a component definition: its schema (inputs/outputs derived from the
// interface nodes, via the shared `componentSchema` so editor and evaluator never drift) plus a
// `build` that expands the sub-graph.
const synthesizeComponentKind = (def: ComponentDef, resolve: Resolve): NodeKind => ({
  ...componentSchema(def),
  build: (scope, ins, ctx) => buildComponent(scope, def, ins, ctx, resolve),
});

// Kind resolution: built-in registry first (so a definition can't shadow a built-in), else a
// doc component. Recursive — a synthesized component resolves its own sub-nodes via the same fn.
const makeResolve = (doc: ParametricDoc, registry: NodeKindRegistry): Resolve => {
  const resolve: Resolve = (kind) => {
    const builtin = registry[kind];
    if (builtin) return builtin;
    const def = doc.components?.find((c) => c.name === kind);
    return def ? synthesizeComponentKind(def, resolve) : undefined;
  };
  return resolve;
};

export const evaluateDoc = (
  scope: Scope,
  doc: UsedAs<ParametricDoc>,
  registry: NodeKindRegistry = defaultKinds,
): EvaluatedDoc => {
  const docV: Value<ParametricDoc> = isValue(doc)
    ? (doc as Value<ParametricDoc>)
    : Value(doc as ParametricDoc);
  const placements = Value<Placement[]>([]);

  let instances = new Map<NodeId, Instance>();
  let lastStructure = "";
  let buildScope: Scope | undefined;

  scope.effect((use) => {
    const d = use(docV);
    const structure = structureKey(d);

    if (structure !== lastStructure) {
      lastStructure = structure;
      buildScope?.cleanup();
      buildScope = scope.child();
      const resolve = makeResolve(d, registry);
      instances = buildGraph(buildScope, d.nodes, resolve, { tile: d.tile });
      const aggregated = aggregatePlacements(buildScope, d.nodes, instances, resolve);
      buildScope.effect((use2) => placements.set(use2(aggregated)));
      return;
    }

    // Same structure — push literal edits into the existing prop Values, in one batch so a
    // multi-field edit (rect corner drag setting w AND h) regenerates downstream once.
    const resolve = makeResolve(d, registry);
    batch(() => {
      d.nodes.forEach((n) => {
        const inst = instances.get(n.id);
        const kind = resolve(n.kind);
        if (!inst || !kind) return;
        inst.literals.forEach((v, name) => {
          const prop = n.props[name];
          if (prop !== undefined && (isBinding(prop) || isBindingList(prop))) return; // structural — can't happen here
          v.set((prop as PropLiteral | undefined) ?? kind.inputs[name]?.default ?? null);
        });
      });
    });
  });

  return { placements, outputs: (id) => instances.get(id)?.outputs };
};
