import { ChevronDown, ChevronRight, Link2, Plus, Trash, Unlink2 } from "lucide-react";
import { useRef, useState } from "react";

import { useValue } from "@kitsune/common-web/src/react";

import { Button } from "@/components/ui/button";

import { EditorApp } from "../domus-app/level-editor";
import {
  addNode,
  MANUAL_NODE_ID,
  nextNodeId,
  removeNode,
  setNodeLabel,
  setProp,
  unsetProp,
  unwireOne,
  wire,
  wouldCycle,
} from "../parametric/edit";
import { nodeSchema } from "../parametric/resolve";
import {
  DocNode,
  InputSpec,
  isBinding,
  isBindingList,
  NodeId,
  ParametricDoc,
} from "../parametric/types";

import { LiteralField } from "./LiteralField";
import { NodeCanvas } from "./NodeCanvas";
import { useTogglePanel } from "./use-toggle-panel";

// The parametric Nodes panel (docs/design/13-parametric-builder.md): hosts the node-graph CANVAS
// (NodeCanvas) plus the kind palette and per-node inspector — add primitives/generators, edit literal
// props, and wire inputs by dragging noodles between sockets (or the inspector's source dropdown).

// The add-node palette, grouped into a collapsible tree (groups open by default). The manual
// placements node is implicit (hand tools own it). Categories:
//   • Values    — sources/constants that render nothing on their own (the things you wire IN).
//   • Elements  — generators that turn values into visible geometry.
//   • Utilities — value transformers (a value in → a derived value out).
const CATEGORIES: { label: string; kinds: string[] }[] = [
  { label: "Values", kinds: ["rect", "point", "measure", "value", "text", "finish", "anchor"] },
  {
    label: "Elements",
    kinds: ["floor", "ramp", "walls", "wall", "railing", "door", "window", "hole", "spawn", "place", "candelabra", "instance"],
  },
  { label: "Utilities", kinds: ["rectPoint", "deriveRect", "offset", "math"] },
];

// kind id (camelCase) → PascalCase display label: "rectPoint" → "RectPoint", "walls" → "Walls".
const titleCase = (kind: string) => kind.charAt(0).toUpperCase() + kind.slice(1);

// Sensible starter props per kind: primitives spawn visible (offset by count so they don't stack)
// and constants/literals get default values. Generators start UNWIRED — auto-connecting an added
// node to the "last" node of a type guessed wrong more often than right, so wiring is now explicit.
// Coordinates are world METERS (doc v2; rect x/y = NW corner).
const starterProps = (doc: ParametricDoc, kind: string): DocNode["props"] => {
  if (kind === "rect") {
    const n = doc.nodes.filter((node) => node.kind === "rect").length;
    return { position: { x: -3 + n, y: 0, z: -2.5 + n * 0.5 }, size: { x: 4, y: 0, z: 3 } };
  }
  if (kind === "point") {
    const n = doc.nodes.filter((node) => node.kind === "point").length;
    return { x: -1 + n * 2, y: 0, z: 1.5 + n * 0.5 };
  }
  if (kind === "anchor") {
    const n = doc.nodes.filter((node) => node.kind === "anchor").length;
    return { position: { x: n * 1.5, y: 0, z: 3 + n * 0.5 } };
  }
  if (kind === "value") return { value: 1 };
  if (kind === "measure") return { scale: 0.5, offset: 0 };
  if (kind === "math") return { op: "add", a: 0, b: 0 };
  if (kind === "finish") return { thickness: 0.2, texOffset: 0, style: "wallpaper" };
  if (kind === "offset") return { delta: { x: 0, y: 0.5, z: 0 } };
  if (kind === "place") return { block: "table" };
  if (kind === "text") return { value: "" };
  // Interface kinds (only added inside a component definition, doc 18): one named, typed socket.
  if (kind === "input") return { name: "in", type: "rect", default: null };
  if (kind === "output") return { name: "out", type: "placements" };
  return {}; // generators (wall, deriveRect, candelabra, instance, door/window, …) start unwired
};

const SPAWN_FALLBACK = { x: 60, y: 60 }; // top-left for an empty graph
const SPAWN_NUDGE_STEP = 26; // px per successive add
const SPAWN_NUDGE_CYCLE = 6; // nudges wrap so a long session doesn't march off-canvas

// Where a freshly-added node lands: the centroid of the current graph, nudged a little so repeated
// adds don't overlap exactly — so a new node appears AMID the existing nodes, not stacked far below
// a tall column (the old default). Falls back to the top-left for an empty graph.
const spawnUi = (doc: ParametricDoc): { x: number; y: number } => {
  const uis = doc.nodes
    .map((n) => n.ui)
    .filter((u): u is { x: number; y: number } => !!u);
  if (!uis.length) return { ...SPAWN_FALLBACK };
  const cx = uis.reduce((s, u) => s + u.x, 0) / uis.length;
  const cy = uis.reduce((s, u) => s + u.y, 0) / uis.length;
  return { x: Math.round(cx), y: Math.round(cy) };
};

const NodeInspector = ({ app, node }: { app: EditorApp; node: DocNode }) => {
  const doc = useValue(app.viewDoc);
  const kind = nodeSchema(node, doc.components); // built-in / component instance / interface node
  if (!kind) return <div className="text-muted-foreground text-xs">unknown kind “{node.kind}”</div>;

  // Nodes whose kind has an output of the given socket type — the sources a typed input offers.
  // `nodeSchema` so an interface `input` node is offered as a source of its DECLARED type (doc 18).
  const sourcesOf = (type: string) =>
    doc.nodes.filter((n) =>
      Object.values(nodeSchema(n, doc.components)?.outputs ?? {}).some((o) => o.type === type),
    );

  const field = (name: string, spec: InputSpec) => {
    const prop = node.props[name];
    // Display name when it differs from the prop key (spec.label — e.g. elevation→`y`, y→`z`,
    // width/depth, for world-space Y-up); commits and bindings always use the KEY.
    const shown = spec.label ?? name;

    // A point input: three inline x/y/z fields while literal, plus a source dropdown to wire a
    // whole point (which replaces the fields). Mirrors the canvas node's inline editor.
    if (spec.type === "point") {
      const bound = prop !== undefined && isBinding(prop) ? prop.bind : "";
      const base = (prop !== undefined && !isBinding(prop) ? prop : spec.default) as
        | Partial<{ x: number; y: number; z: number }>
        | undefined;
      const pt = { x: 0, y: 0, z: 0, ...(base ?? {}) };
      return (
        <span className="flex items-center gap-1">
          {!bound &&
            (["x", "y", "z"] as const).map((ax) => (
              <LiteralField
                key={ax}
                type="number"
                value={String(pt[ax])}
                ariaLabel={`${shown} ${ax}`}
                className="w-12"
                onCommit={(raw) =>
                  app.setViewDoc(setProp(doc, node.id, name, { ...pt, [ax]: Number(raw) || 0 }))
                }
              />
            ))}
          <select
            className="border-input bg-background rounded border px-1.5 py-0.5 text-xs"
            value={bound}
            onChange={(e) => {
              const v = e.target.value;
              app.setViewDoc(
                v === "" ? unsetProp(doc, node.id, name) : setProp(doc, node.id, name, { bind: v }),
              );
            }}
            aria-label={`${name} source`}
          >
            <option value="">{bound ? "—" : "wire…"}</option>
            {sourcesOf("point").map((r) => (
              <option key={r.id} value={r.id}>
                {r.label ?? r.id}
              </option>
            ))}
          </select>
        </span>
      );
    }

    // Primitive-typed inputs (rect, finish, frame, …) wire to a matching node via a source dropdown
    // ("—" = unwired → default).
    if (
      spec.type === "rect" ||
      spec.type === "finish" ||
      spec.type === "frame" ||
      spec.type === "frames"
    ) {
      const sources = sourcesOf(spec.type);
      const bound = prop !== undefined && isBinding(prop) ? prop.bind : "";
      return (
        <select
          className="border-input bg-background rounded border px-2 py-0.5 text-xs"
          value={bound}
          onChange={(e) => {
            const v = e.target.value;
            app.setViewDoc(
              v === "" ? unsetProp(doc, node.id, name) : setProp(doc, node.id, name, { bind: v }),
            );
          }}
          aria-label={`${name} source`}
        >
          <option value="">—</option>
          {sources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label ?? r.id}
            </option>
          ))}
        </select>
      );
    }

    if (spec.type === "number" || spec.type === "string") {
      // FIELD-LEVEL WIRING: any number/string input can be bound to another node's output —
      // e.g. rect-2.x ← rect-1.w makes two rooms abut and stay abutting. The link button
      // toggles literal ↔ bound; bound shows [source node].[path] + an unlink button.
      const candidates = doc.nodes.filter(
        (n) =>
          n.id !== node.id && n.id !== MANUAL_NODE_ID && !wouldCycle(doc, node.id, { bind: n.id }),
      );
      if (prop !== undefined && isBinding(prop)) {
        return (
          <span className="flex items-center gap-1">
            <select
              className="border-input bg-background rounded border px-1.5 py-0.5 text-xs"
              value={prop.bind}
              onChange={(e) =>
                app.setViewDoc(wire(doc, node.id, name, { bind: e.target.value, path: prop.path }))
              }
              aria-label={`${name} binding source`}
            >
              {candidates.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label ?? n.id}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground text-xs">.</span>
            <LiteralField
              type="string"
              value={prop.path ?? ""}
              onCommit={(raw) =>
                app.setViewDoc(
                  setProp(doc, node.id, name, { bind: prop.bind, path: raw.trim() || undefined }),
                )
              }
            />
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => app.setViewDoc(unsetProp(doc, node.id, name))}
              title="Unlink (back to a literal value)"
              aria-label={`Unlink ${name}`}
            >
              <Unlink2 className="size-3.5" />
            </button>
          </span>
        );
      }
      const current = prop !== undefined ? String(prop) : String(spec.default ?? "");
      return (
        <span className="flex items-center gap-1">
          {spec.options ? (
            // Closed value set → a dropdown (still bindable via the link button beside it).
            <select
              className="border-input bg-background rounded border px-2 py-0.5 text-xs"
              value={current}
              aria-label={shown}
              onChange={(e) => app.setViewDoc(setProp(doc, node.id, name, e.target.value))}
            >
              {spec.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <LiteralField
              type={spec.type}
              value={current}
              ariaLabel={shown}
              onCommit={(raw) =>
                app.setViewDoc(
                  setProp(doc, node.id, name, spec.type === "number" ? Number(raw) || 0 : raw),
                )
              }
            />
          )}
          {candidates.length > 0 && (
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => app.setViewDoc(wire(doc, node.id, name, { bind: candidates[0].id }))}
              title="Link this value to another node's output (then pick the field, e.g. w)"
              aria-label={`Link ${name}`}
            >
              <Link2 className="size-3.5" />
            </button>
          )}
        </span>
      );
    }

    // A measure ({scale, offset} — resolved as scale·L + offset by the consumer): paired
    // number fields. A BOUND measure (e.g. ← measure-1) falls through to the generic binding
    // display below; unwire via the canvas noodle.
    if (spec.type === "measure" && (prop === undefined || !isBinding(prop))) {
      const m = (prop ?? spec.default ?? { scale: 0, offset: 0 }) as {
        scale: number;
        offset: number;
      };
      const half = (key: "scale" | "offset") => (
        <LiteralField
          type="number"
          value={String(m[key])}
          ariaLabel={`${shown} ${key}`}
          title={
            key === "scale" ? `${shown} scale (× the parent length)` : `${shown} offset (meters)`
          }
          className="w-16 px-1"
          onCommit={(raw) =>
            app.setViewDoc(setProp(doc, node.id, name, { ...m, [key]: Number(raw) || 0 }))
          }
        />
      );
      return (
        <span className="flex items-center gap-1">
          {half("scale")}
          {half("offset")}
        </span>
      );
    }

    if (spec.type === "boolean") {
      const checked = prop === undefined ? spec.default === true : prop === true;
      return (
        <input
          type="checkbox"
          className="accent-primary size-3.5"
          checked={checked}
          aria-label={shown}
          onChange={(e) => app.setViewDoc(setProp(doc, node.id, name, e.target.checked))}
        />
      );
    }

    if (prop !== undefined && isBinding(prop))
      return (
        <span className="text-muted-foreground text-xs">
          ← {prop.bind}
          {prop.path ? `.${prop.path}` : ""}
        </span>
      );

    // A MULTI-BOUND input (walls.holes): one row per noodle, each individually unlinkable.
    if (prop !== undefined && isBindingList(prop))
      return (
        <span className="flex flex-col gap-0.5">
          {prop.map((b) => (
            <span
              key={`${b.bind}.${b.output ?? "out"}`}
              className="text-muted-foreground flex items-center gap-1 text-xs"
            >
              ← {b.bind}
              {b.output ? `.${b.output}` : ""}
              <button
                className="hover:text-foreground"
                onClick={() => app.setViewDoc(unwireOne(doc, node.id, name, b))}
                title="Unlink this connection"
                aria-label={`Unlink ${name} ${b.bind}`}
              >
                <Unlink2 className="size-3.5" />
              </button>
            </span>
          ))}
        </span>
      );

    // json / placements / boolean: no widget yet (the manual list is edited in 3D).
    return (
      <span className="text-muted-foreground text-xs opacity-60">
        {node.id === MANUAL_NODE_ID && name === "list" ? "(edited in 3D)" : `(${spec.type})`}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      {Object.entries(kind.inputs).map(([name, spec]) => (
        <div key={name} className="flex items-center gap-2">
          {/* spec.label = display name when it differs from the prop key (e.g. elevation→`y`) */}
          <span className="text-muted-foreground w-20 shrink-0 text-xs">{spec.label ?? name}</span>
          {field(name, spec)}
        </div>
      ))}
    </div>
  );
};

export const NodesPanel = ({ app }: { app: EditorApp }) => {
  const doc = useValue(app.viewDoc);
  const editPath = useValue(app.editPath); // non-null = editing a definition's sub-graph in place
  // Selection is app state (not local) so the 3D viewport (click a generated block → its rect)
  // and the Move/Scale buttons share it with the canvas + inspector.
  const selectedId = useValue(app.selectedNode);
  const setSelectedId = (id: NodeId | null) => app.selectedNode.set(id);
  const selectedNode = doc.nodes.find((n) => n.id === selectedId) ?? null;

  // The node palette is an overlay pinned to the graph canvas's top-left, collapsed by default —
  // the same pattern as the 3D canvas's block palette (a tap target toggles a vertical kind list).
  const palette = useTogglePanel();
  // Collapsed category labels (empty = every group open, the default). A group's header toggles it.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleCategory = (label: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  // A new node lands at the centre of the current viewport (filled by NodeCanvas); if the canvas
  // isn't ready yet, fall back to the graph centroid.
  const spawnPosRef = useRef<(() => { x: number; y: number } | null) | null>(null);
  const add = (kind: string) => {
    const id = nextNodeId(doc, kind);
    const base = spawnPosRef.current?.() ?? spawnUi(doc);
    const nudge = (doc.nodes.length % SPAWN_NUDGE_CYCLE) * SPAWN_NUDGE_STEP; // so back-to-back adds don't land exactly on top
    const ui = { x: base.x + nudge, y: base.y + nudge };
    app.setViewDoc(addNode(doc, { id, kind, props: starterProps(doc, kind), ui }));
    setSelectedId(id);
  };

  // The built-in groups, plus (inside a definition) the Interface kinds, plus a dynamic "Components"
  // group of the doc's author-defined definitions (doc 18) — instantiate one like any kind. The
  // definition you're editing is excluded (it can't instantiate itself).
  const componentKinds = (doc.components ?? []).map((c) => c.name).filter((n) => n !== editPath);
  const paletteGroups = [
    ...CATEGORIES,
    ...(editPath ? [{ label: "Interface", kinds: ["input", "output"] }] : []),
    ...(componentKinds.length ? [{ label: "Components", kinds: componentKinds }] : []),
  ];

  return (
    <div className="flex flex-col gap-2">
      {/* The graph canvas: nodes + binding noodles. Click a node to inspect it below; drag to
          arrange (positions persist in the doc's `ui`); drag out→in handles to wire a rect. */}
      <div className="relative">
        <div className="absolute top-2 left-2 z-10 flex max-h-[calc(100%-1.5rem)] flex-col gap-2">
          <Button
            size="icon"
            variant="secondary"
            className="size-8 shrink-0 border shadow-[var(--shadow-soft)]"
            onClick={palette.toggle}
            title="Toggle the node palette"
            aria-label="Toggle node palette"
          >
            <Plus />
          </Button>
          {palette.open && (
            <div className="bg-background/80 flex min-h-0 w-40 flex-col gap-0.5 overflow-y-auto rounded-md p-1.5 shadow-md backdrop-blur">
              {paletteGroups.map((cat) => {
                const open = !collapsed.has(cat.label);
                return (
                  <div key={cat.label} className="flex flex-col">
                    <button
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded px-1 py-0.5 text-left text-xs font-semibold"
                      onClick={() => toggleCategory(cat.label)}
                      aria-expanded={open}
                    >
                      {open ? (
                        <ChevronDown className="size-3 shrink-0" />
                      ) : (
                        <ChevronRight className="size-3 shrink-0" />
                      )}
                      {cat.label}
                    </button>
                    {open &&
                      cat.kinds.map((kind) => (
                        <button
                          key={kind}
                          className="hover:bg-secondary rounded py-1 pr-2.5 pl-6 text-left text-sm"
                          onClick={() => add(kind)}
                        >
                          {titleCase(kind)}
                        </button>
                      ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <NodeCanvas app={app} onSelect={setSelectedId} spawnPosRef={spawnPosRef} />
      </div>

      {selectedNode && (
        <div className="flex flex-col gap-2 rounded-md border p-2.5" data-testid="node-inspector">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
              {/* The label is editable in place — names show on the canvas + outliner. */}
              <LiteralField
                type="string"
                value={selectedNode.label ?? ""}
                onCommit={(raw) => app.setViewDoc(setNodeLabel(doc, selectedNode.id, raw))}
              />
              <span className="text-muted-foreground shrink-0 font-normal">
                {selectedNode.id} · {selectedNode.kind}
              </span>
            </span>
            {selectedNode.id !== MANUAL_NODE_ID && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  app.setViewDoc(removeNode(doc, selectedNode.id));
                  setSelectedId(null);
                }}
                title="Remove this node (its generated blocks disappear)"
              >
                <Trash className="size-3.5" />
              </Button>
            )}
          </div>
          <NodeInspector app={app} node={selectedNode} />
        </div>
      )}
    </div>
  );
};
