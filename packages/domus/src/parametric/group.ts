import { nextNodeId } from "./edit";
import { resolveSchema } from "./resolve";
import {
  Binding,
  ComponentDef,
  DocNode,
  isBinding,
  isBindingList,
  mapBindings,
  ParametricDoc,
  PropLiteral,
  PropValue,
  SocketType,
} from "./types";

// Grouping UX ops (docs/design/18, Phase 3) — pure, headless, tested. `groupNodes` folds a set of
// nodes into a new component definition + an instance (Blender "Make Group"); `ungroupInstance`
// explodes an instance back into inline nodes (the live sibling of detach-to-bake). Both preserve
// the DERIVED level: grouping/ungrouping never changes the geometry, only the graph's shape.

const UI_COL = 240; // horizontal gap when laying out auto-generated interface nodes
const UI_ROW = 60; // vertical spacing when stacking them

// A binding's identity for boundary dedup: same source node + output + path = one interface node.
const bindingSig = (b: Binding) => `${b.bind}|${b.output ?? "out"}|${b.path ?? ""}`;

// Name allocator: first-come keeps the base name, later collisions get -2, -3, …
const uniqueNamer = (taken: Set<string>, fallback: string) => (base: string) => {
  let n = base || fallback;
  let i = 2;
  while (taken.has(n)) n = `${base}-${i++}`;
  taken.add(n);
  return n;
};

// --- Group ------------------------------------------------------------------------------------

// Fold `ids` (a subset of `doc.nodes`) into a new `name` component. Edges crossing the selection
// boundary become interface nodes: an external source feeding an inside node → an `input` node (the
// instance supplies it); an inside output consumed outside → an `output` node (consumers rewire to
// the instance). Throws if `name` collides with a built-in kind or an existing definition.
export const groupNodes = (
  doc: ParametricDoc,
  ids: string[],
  name: string,
  label?: string,
): ParametricDoc => {
  const idSet = new Set(ids);
  const inside = doc.nodes.filter((n) => idSet.has(n.id));
  const outside = doc.nodes.filter((n) => !idSet.has(n.id));
  if (inside.length === 0) return doc;
  if (resolveSchema(name, doc.components))
    throw new Error(`groupNodes: a kind named "${name}" already exists`);

  const comps = doc.components;
  // The socket type a binding carries: a field-level (path) link is a number; otherwise the source
  // output's declared type.
  const typeOf = (b: Binding): SocketType => {
    if (b.path) return "number";
    const srcKind = doc.nodes.find((n) => n.id === b.bind)?.kind ?? "";
    return (resolveSchema(srcKind, comps)?.outputs[b.output ?? "out"]?.type ?? "json") as SocketType;
  };

  const instanceId = nextNodeId(doc, name.toLowerCase());

  // Layout: stack inputs to the left of the selection's bounding box, outputs to its right.
  const xs = inside.map((n) => n.ui?.x ?? 0);
  const ys = inside.map((n) => n.ui?.y ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const centroid = {
    x: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length),
    y: Math.round(ys.reduce((a, b) => a + b, 0) / ys.length),
  };

  // --- inbound boundary: distinct external sources → `input` interface nodes -----------------
  const inBySig = new Map<string, { id: string; name: string }>();
  const inputNodes: DocNode[] = [];
  const instanceProps: Record<string, PropValue> = {};
  const uniqueIn = uniqueNamer(new Set(), "in");
  // Per inside node, redirect every binding that leaves the selection to its input node.
  const insideRewired = inside.map((node) => {
    const props: Record<string, PropValue> = {};
    for (const [key, v] of Object.entries(node.props)) {
      props[key] = mapBindings(v, (b) => {
        if (idSet.has(b.bind)) return b; // internal edge — untouched
        const sig = bindingSig(b);
        let entry = inBySig.get(sig);
        if (!entry) {
          const nm = uniqueIn(key);
          const id = `in-${inputNodes.length + 1}`;
          inputNodes.push({
            id,
            kind: "input",
            props: { name: nm, type: typeOf(b), default: null },
            ui: { x: minX - UI_COL, y: minY + inputNodes.length * UI_ROW },
          });
          instanceProps[nm] = b; // the instance feeds the original external source in
          entry = { id, name: nm };
          inBySig.set(sig, entry);
        }
        return { bind: entry.id }; // inside, the consumer reads the input node's `out`
      });
    }
    return { ...node, props };
  });

  // --- outbound boundary: inside outputs consumed outside → `output` interface nodes ---------
  const outBySig = new Map<string, string>(); // signature → output name
  const outputNodes: DocNode[] = [];
  const uniqueOut = uniqueNamer(new Set(["placements"]), "out"); // "placements" reserved (auto-aggregated)
  const outsideRewired = outside.map((node) => {
    const props: Record<string, PropValue> = {};
    for (const [key, v] of Object.entries(node.props)) {
      props[key] = mapBindings(v, (b) => {
        if (!idSet.has(b.bind)) return b; // not pointing into the selection
        const sig = bindingSig(b);
        let nm = outBySig.get(sig);
        if (!nm) {
          const base = (b.output ?? "out") === "out" ? b.bind : `${b.bind}-${b.output}`;
          nm = uniqueOut(base);
          outputNodes.push({
            id: `out-${outputNodes.length + 1}`,
            kind: "output",
            props: { name: nm, type: typeOf(b), in: { ...b } }, // forwards the inside value (path and all)
            ui: { x: maxX + UI_COL, y: minY + outputNodes.length * UI_ROW },
          });
          outBySig.set(sig, nm);
        }
        return { bind: instanceId, output: nm }; // consume the instance's output
      });
    }
    return { ...node, props };
  });

  const def: ComponentDef = {
    name,
    ...(label ? { label } : {}),
    nodes: [...inputNodes, ...insideRewired, ...outputNodes],
  };
  const instance: DocNode = {
    id: instanceId,
    kind: name,
    ...(label ? { label } : {}),
    props: instanceProps,
    ui: centroid,
  };
  return {
    ...doc,
    nodes: [...outsideRewired, instance],
    components: [...(doc.components ?? []), def],
  };
};

// --- Ungroup ----------------------------------------------------------------------------------

// Explode `instanceId` back into inline nodes (id-remapped under the instance). Interface nodes
// dissolve: each `input` is replaced by whatever the instance supplied (binding or literal), each
// `output` reconnects its outside consumers straight to the inside source. The definition is LEFT
// in the library (other instances may use it; re-grouping is cheap). A no-op on non-instances.
export const ungroupInstance = (doc: ParametricDoc, instanceId: string): ParametricDoc => {
  const inst = doc.nodes.find((n) => n.id === instanceId);
  const def = inst && doc.components?.find((c) => c.name === inst.kind);
  if (!inst || !def) return doc;

  // Fresh, collision-free ids for the internal (non-interface) nodes, namespaced under the instance.
  const taken = new Set(doc.nodes.filter((n) => n.id !== instanceId).map((n) => n.id));
  const newId = new Map<string, string>();
  def.nodes.forEach((n) => {
    let id = `${instanceId}/${n.id}`;
    let i = 2;
    while (taken.has(id)) id = `${instanceId}/${n.id}-${i++}`;
    taken.add(id);
    newId.set(n.id, id);
  });

  const inputByName = new Map<string, DocNode>();
  const outputByName = new Map<string, DocNode>();
  const interfaceIds = new Set<string>();
  def.nodes.forEach((n) => {
    const nm = typeof n.props.name === "string" ? n.props.name : "";
    if (n.kind === "input") {
      inputByName.set(nm, n);
      interfaceIds.add(n.id);
    }
    if (n.kind === "output") {
      outputByName.set(nm, n);
      interfaceIds.add(n.id);
    }
  });

  // What the instance supplies for input `name`: a binding (external source), or a literal to inline.
  const suppliedFor = (inputNode: DocNode): { bind?: Binding; lit?: PropLiteral } => {
    const nm = inputNode.props.name as string;
    const v = inst.props[nm];
    if (v !== undefined && isBinding(v)) return { bind: v };
    if (v !== undefined && isBindingList(v) && v.length) return { bind: v[0] }; // v1: first of a list
    if (v !== undefined && !isBinding(v) && !isBindingList(v)) return { lit: v as PropLiteral };
    return { lit: (inputNode.props.default ?? null) as PropLiteral };
  };

  // Resolve an INTERNAL binding once exploded: a ref to an input node becomes the instance's supply
  // (binding or literal); any other ref just gets the remapped id.
  const resolveInternal = (b: Binding): { bind?: Binding; lit?: PropLiteral } => {
    const target = def.nodes.find((n) => n.id === b.bind);
    if (target?.kind === "input") return suppliedFor(target);
    return { bind: { ...b, bind: newId.get(b.bind) ?? b.bind } };
  };

  // Remap a prop on an internal node (inlining literals where an input fed it).
  const remapInternalProp = (v: PropValue): PropValue => {
    if (isBinding(v)) {
      const r = resolveInternal(v);
      return r.bind ?? (r.lit as PropValue);
    }
    if (isBindingList(v)) {
      const kept = v.map(resolveInternal).flatMap((r) => (r.bind ? [r.bind] : [])); // can't inline into a list
      return kept.length === 1 ? kept[0] : kept;
    }
    return v;
  };

  // The inside source feeding output `name` (remapped to the new id), if any.
  const outSourceOf = (name: string): { bind?: Binding; lit?: PropLiteral } => {
    const on = outputByName.get(name);
    if (!on) return {};
    const src = on.props.in;
    if (isBinding(src)) return { bind: { ...src, bind: newId.get(src.bind) ?? src.bind } };
    if (isBindingList(src) && src.length)
      return { bind: { ...src[0], bind: newId.get(src[0].bind) ?? src[0].bind } };
    return { lit: (src ?? null) as PropLiteral };
  };

  // Rewire an OUTSIDE binding that pointed at the instance to the inside source it exposed.
  const remapInstanceRef = (b: Binding): Binding | PropLiteral | null => {
    if (b.bind !== instanceId) return b;
    if ((b.output ?? "out") === "placements") return b; // nothing consumes placements as input
    const s = outSourceOf(b.output ?? "out");
    if (s.bind) return { ...s.bind, path: b.path ?? s.bind.path };
    if (s.lit !== undefined) return s.lit;
    return null; // dangling output — drop the binding (prop reverts to default)
  };
  const remapOutsideProp = (v: PropValue): PropValue => {
    if (isBinding(v)) {
      const r = remapInstanceRef(v);
      return r === null ? null : (r as PropValue);
    }
    if (isBindingList(v)) {
      const kept = v
        .map(remapInstanceRef)
        .filter((r): r is Binding => r !== null && typeof r === "object" && "bind" in r);
      return kept.length === 1 ? kept[0] : kept;
    }
    return v;
  };

  // Emit the exploded internal nodes (interface nodes dissolve).
  const exploded: DocNode[] = def.nodes
    .filter((n) => !interfaceIds.has(n.id))
    .map((n) => ({
      ...n,
      id: newId.get(n.id)!,
      props: Object.fromEntries(
        Object.entries(n.props).map(([k, v]) => [k, remapInternalProp(v)]),
      ),
      ui: n.ui
        ? { x: n.ui.x + (inst.ui?.x ?? 0), y: n.ui.y + (inst.ui?.y ?? 0) }
        : inst.ui,
    }));

  const rewiredOutside = doc.nodes
    .filter((n) => n.id !== instanceId)
    .map((n) => ({
      ...n,
      props: Object.fromEntries(Object.entries(n.props).map(([k, v]) => [k, remapOutsideProp(v)])),
    }));

  return { ...doc, nodes: [...rewiredOutside, ...exploded] };
};

// True when `id` names a node that is a component instance (its kind resolves to a doc definition,
// not a built-in) — gates the Ungroup action.
export const isInstance = (doc: ParametricDoc, id: string): boolean => {
  const node = doc.nodes.find((n) => n.id === id);
  return !!node && !!doc.components?.some((c) => c.name === node.kind);
};
