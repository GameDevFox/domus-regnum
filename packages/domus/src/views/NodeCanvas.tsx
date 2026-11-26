import {
  Background,
  Connection,
  Edge,
  Handle,
  MiniMap,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronLeft, Group, Maximize, Minimize, Ungroup, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import { useValue } from "@kitsune/common-web/src/react";

import { Button } from "@/components/ui/button";

import { EditorApp } from "../domus-app/level-editor";
import {
  MANUAL_NODE_ID,
  removeNode,
  setNodeUi,
  setProp,
  unwireOne,
  wire,
  wireAdd,
  wouldCycle,
} from "../parametric/edit";
import { groupNodes, isInstance, ungroupInstance } from "../parametric/group";
import { PRIMITIVE_KINDS } from "../parametric/kinds";
import { nodeSchema, resolveSchema } from "../parametric/resolve";
import { outSocketOf, SOCKET_COLORS, socketsMatch, summarize } from "../parametric/sockets";
import {
  Binding,
  ComponentDef,
  DocNode,
  isBinding,
  isBindingList,
  NodeId,
  ParametricDoc,
} from "../parametric/types";

import { OVERLAY_ICON_BTN } from "./chrome";
import { estimateHeight, organizePositions, socketRowsOf } from "./graph-layout";
import { LiteralField } from "./LiteralField";
import { useClickOutside } from "./use-click-outside";

// The node graph canvas (slice 4 of docs/design/13-parametric-builder.md), on @xyflow/react.
// CONTROLLED from the doc: nodes mirror doc.nodes (positions from node.ui), edges mirror the
// bindings. Interactions write back as pure doc edits — drag commits setNodeUi on release,
// connect runs wire() (cycle-guarded), edge/node deletion unwires/removes. The doc stays the
// single source of truth; this is the same data as the inspector, drawn with noodles.

// Wiring is typed by sockets: a node's primitive-typed inputs (rect, point) and inline inputs
// (e.g. thickness) get a socket row (target handle + label, Blender-style), PLUS any input that
// is currently field-bound (e.g. x ← rect-1.w from the inspector's link button) so its noodle
// has somewhere to land. A kind with a wireable-typed output (rect, point, number) gets one
// source handle on the title row. Placements outputs have no handle — nothing consumes
// placements as an input (the deriver collects them implicitly). The row predicate + height
// estimate live in graph-layout.ts (shared with the Organize auto-layout).

// Resizable canvas height bounds + the localStorage key remembering the user's choice.
const HEIGHT_KEY = "domus.nodeCanvasHeight";
const MIN_H = 160;
const MAX_H = 720;
const DEFAULT_H = 288;

// Viewport framing + zoom. The zoom clamps feed BOTH the ReactFlow props and the manual wheel
// handler, so they can't drift apart.
const FIT_PADDING = 0.15;
const FIT_SELECTED_PADDING = 0.4; // framing one node: keep context around it
const FIT_DURATION_MS = 200;
const GRAPH_MIN_ZOOM = 0.25; // default minZoom (0.5) can leave fitView unable to fit tall graphs
const GRAPH_MAX_ZOOM = 2;
const D3_WHEEL_SCALE = 500; // d3-zoom's wheel scaling: 2^(-deltaY/500)

// Spawn-position nudge: center a new node by its approximate half size.
const NODE_HALF_W = 95;
const NODE_HALF_H = 30;

const MINIMAP_MIN_NODES = 12; // minimap is clutter below this

// Inline-committable values: plain literals plus the measure pair (one prop, two fields).
type InlineValue =
  | number
  | string
  | boolean
  | { scale: number; offset: number }
  | { x: number; y: number; z: number };

type KindNodeData = {
  doc: DocNode;
  components?: ComponentDef[]; // the doc's component library — resolves an instance node's sockets
  onProp: (name: string, value: InlineValue) => void;
  [key: string]: unknown;
};

const KindNode = ({ data, selected }: NodeProps<Node<KindNodeData>>) => {
  const node = data.doc;
  const summary = summarize(node);
  const rows = socketRowsOf(node, data.components);
  // Component INSTANCES (kind resolves to a doc-local definition, not a built-in) get a tinted card
  // so they pop out from ordinary kinds on the canvas.
  const isComponent = !!data.components?.some((c) => c.name === node.kind);
  // Blender-style socket rows: each wireable input is its own row — the target handle sits on
  // the node's left border, vertically centered on the row, with the input's name beside it
  // (and, for inline literals, the editable field; binding the input swaps the field for the
  // noodle). Rows are `relative` and stretched to the node border (`-mx-2.5 px-2.5`) so the
  // absolutely-positioned handle anchors to ITS row, not to a magic offset that drifts as the
  // node grows. The source handle rides the title row, Blender's output position. `nodrag`
  // keeps field edits from dragging the node.
  return (
    <div
      className={`min-w-32 rounded-md border px-2.5 py-1.5 text-xs shadow-sm ${
        isComponent ? "bg-blue-50 dark:bg-blue-950" : "bg-background"
      } ${selected ? "border-primary" : isComponent ? "border-blue-300 dark:border-blue-800" : "border-border"}`}
    >
      <div className="relative -mx-2.5 px-2.5 font-medium">
        {node.label ?? node.id}
        {(() => {
          const out = outSocketOf(node, data.components);
          return (
            out && (
              <Handle
                id={out[0]}
                type="source"
                position={Position.Right}
                title={`${out[0]} · ${out[1]}`}
                style={{ backgroundColor: SOCKET_COLORS[out[1]] }}
              />
            )
          );
        })()}
      </div>
      <div className="text-muted-foreground">
        {node.kind}
        {summary ? ` · ${summary}` : ""}
      </div>
      {rows.map(([name, spec]) => {
        // Display name may differ from the prop key (spec.label — e.g. point's `elevation` shows
        // as `y` and its floor-depth `y` shows as `z`, for world-space Y-up); handles and commits
        // always use the KEY.
        const shown = spec.label ?? name;
        // A measure input renders as a PAIRED scale/offset field row (one socket, two fields).
        const m = (node.props[name] ?? spec.default ?? { scale: 0, offset: 0 }) as {
          scale: number;
          offset: number;
        };
        // A point input renders as three inline x/y/z fields (one socket, three fields).
        const pt = (node.props[name] ?? spec.default ?? { x: 0, y: 0, z: 0 }) as {
          x: number;
          y: number;
          z: number;
        };
        // Interface nodes (doc 18): an `input`'s name/type rows are CONFIG (no handle), but its
        // `default` gets a real typed socket (wire a fallback — needed for complex types you can't
        // type). An `output`'s only data sink is `in`; its name/type rows are config.
        const configRow =
          (node.kind === "input" && name !== "default") ||
          (node.kind === "output" && name !== "in");
        return (
          <div key={name} className="relative -mx-2.5 mt-0.5 flex items-center gap-1.5 px-2.5">
            {!configRow && (
              <Handle
                id={name}
                type="target"
                position={Position.Left}
                title={`${shown} · ${spec.type}`}
                style={{ backgroundColor: SOCKET_COLORS[spec.type] }}
              />
            )}
            <span className="text-muted-foreground">{shown}</span>
            {spec.inline &&
              !isBinding(node.props[name] ?? null) &&
              (spec.type === "point" ? (
                <span className="nodrag ml-auto flex items-center gap-1">
                  {(["x", "y", "z"] as const).map((ax) => (
                    <LiteralField
                      key={ax}
                      type="number"
                      value={String(pt[ax])}
                      ariaLabel={`${shown} ${ax}`}
                      title={`${shown} ${ax} (meters)`}
                      className="w-10 px-1"
                      onCommit={(raw) => data.onProp(name, { ...pt, [ax]: Number(raw) || 0 })}
                    />
                  ))}
                </span>
              ) : spec.type === "measure" ? (
                <span className="nodrag ml-auto flex items-center gap-1">
                  <LiteralField
                    type="number"
                    value={String(m.scale)}
                    ariaLabel={`${shown} scale`}
                    title={`${shown} scale (× the parent length)`}
                    className="w-11 px-1"
                    onCommit={(raw) => data.onProp(name, { ...m, scale: Number(raw) || 0 })}
                  />
                  <LiteralField
                    type="number"
                    value={String(m.offset)}
                    ariaLabel={`${shown} offset`}
                    title={`${shown} offset (meters)`}
                    className="w-11 px-1"
                    onCommit={(raw) => data.onProp(name, { ...m, offset: Number(raw) || 0 })}
                  />
                </span>
              ) : spec.options ? (
                <select
                  className="nodrag border-input bg-background ml-auto w-[5.5rem] rounded border px-1 py-0.5 text-xs"
                  value={String(node.props[name] ?? spec.default ?? "")}
                  aria-label={shown}
                  onChange={(e) => data.onProp(name, e.target.value)}
                >
                  {spec.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : spec.type === "boolean" ? (
                <input
                  type="checkbox"
                  className="nodrag accent-primary ml-auto size-3.5"
                  checked={
                    node.props[name] === undefined ? spec.default === true : node.props[name] === true
                  }
                  aria-label={shown}
                  onChange={(e) => data.onProp(name, e.target.checked)}
                />
              ) : (
                <LiteralField
                  type={spec.type === "number" ? "number" : "string"}
                  value={String(node.props[name] ?? spec.default ?? "")}
                  ariaLabel={shown}
                  className="nodrag ml-auto w-14 px-1"
                  onCommit={(raw) =>
                    data.onProp(name, spec.type === "number" ? Number(raw) || 0 : raw)
                  }
                />
              ))}
          </div>
        );
      })}
    </div>
  );
};

const nodeTypes = { kind: KindNode };

// Default layout for nodes saved without a ui position: primitives in the left column,
// generators to the right, the manual node at the bottom — stacked by appearance order.
const colOf = (n: DocNode): number =>
  PRIMITIVE_KINDS.has(n.kind) ? 0 : n.id === MANUAL_NODE_ID ? 2 : 1;

// Nodes vary in height now that inputs render as socket rows — stack each column by the
// estimated height of the nodes above (estimateHeight, graph-layout.ts) plus a gap, instead
// of a fixed stride that tall nodes overflow into.
const defaultPosition = (doc: ParametricDoc, node: DocNode): { x: number; y: number } => {
  const col = colOf(node);
  const above = doc.nodes.filter((n, i) => colOf(n) === col && i < doc.nodes.indexOf(node));
  return { x: 30 + col * 200, y: 30 + above.reduce((y, n) => y + estimateHeight(n) + 16, 0) };
};

const toFlowNodes = (
  doc: ParametricDoc,
  onProp: (id: NodeId, name: string, value: InlineValue) => void,
  prev?: Node<KindNodeData>[],
): Node<KindNodeData>[] =>
  doc.nodes.map((n) => {
    const old = prev?.find((p) => p.id === n.id);
    return {
      id: n.id,
      type: "kind",
      // Mid-drag react-flow owns the position (prev); otherwise the doc's saved ui wins.
      position: n.ui ?? old?.position ?? defaultPosition(doc, n),
      selected: old?.selected,
      data: { doc: n, components: doc.components, onProp: (name, value) => onProp(n.id, name, value) },
      deletable: n.id !== MANUAL_NODE_ID, // hand-placed blocks always have a home
    };
  });

const toFlowEdges = (doc: ParametricDoc): Edge[] =>
  doc.nodes.flatMap((n) =>
    Object.entries(n.props)
      .flatMap(([name, v]): [string, Binding][] =>
        isBinding(v)
          ? [[name, v]]
          : isBindingList(v)
            ? v.map((b): [string, Binding] => [name, b])
            : [],
      )
      .map(([name, b]) => {
        const sourceNode = doc.nodes.find((s) => s.id === b.bind);
        const out = b.output ?? (sourceNode && outSocketOf(sourceNode, doc.components)?.[0]) ?? "out";
        const sourceColor =
          SOCKET_COLORS[
            (sourceNode && nodeSchema(sourceNode, doc.components)?.outputs[out]?.type) ?? ""
          ];
        // The target input's DISPLAY name (spec.label — e.g. z/width/height), matching the node
        // card and inspector rather than the raw prop key.
        const shown = resolveSchema(n.kind, doc.components)?.inputs[name]?.label ?? name;
        return {
          id: `${b.bind}.${out}->${n.id}.${name}`,
          source: b.bind,
          sourceHandle: out,
          target: n.id,
          targetHandle: name,
          // Which prop this noodle feeds (and which FIELD of the source, for path bindings).
          label: b.path ? `${shown} ← .${b.path}` : shown,
          labelStyle: { fontSize: 9, fill: "var(--muted-foreground, #999)" },
          labelBgStyle: { fill: "transparent" },
          // Tint the noodle to its source socket (Blender-style); selection still recolors it.
          ...(sourceColor ? { style: { stroke: sourceColor, strokeOpacity: 0.55 } } : {}),
        };
      }),
  );

export const NodeCanvas = ({
  app,
  onSelect,
  spawnPosRef,
}: {
  app: EditorApp;
  onSelect: (id: NodeId | null) => void;
  // Filled with a getter for "where a newly-added node should land" = the flow position at the
  // centre of the current viewport (the palette lives outside the canvas, so it reads it through here).
  spawnPosRef?: MutableRefObject<(() => { x: number; y: number } | null) | null>;
}) => {
  const doc = useValue(app.viewDoc); // the ACTIVE graph (top level, or an open definition's sub-graph)
  const rectMode = useValue(app.rectMode); // a Move/Scale gesture is armed → X means axis-lock, not delete

  // Inline node-field commits: one undoable setProp per commit (LiteralField commits on
  // blur/Enter). Peek the live doc — the field may commit against a doc newer than this render.
  const onProp = useCallback(
    (id: NodeId, name: string, value: InlineValue) =>
      app.setViewDoc(setProp(app.viewDoc.peek(), id, name, value)),
    [app],
  );

  // Local node state so dragging is smooth; re-synced from the doc on every doc change
  // (add/remove/undo). Edges are pure derivation from the doc — EXCEPT selection, which is
  // react-flow interaction state: without an onEdgesChange applying `select` changes, edges
  // can never be selected (and the delete key would have nothing to act on).
  const [nodes, setNodes] = useState<Node<KindNodeData>[]>(() => toFlowNodes(doc, onProp));
  useEffect(() => setNodes((prev) => toFlowNodes(doc, onProp, prev)), [doc, onProp]);
  const [selectedEdges, setSelectedEdges] = useState<ReadonlySet<string>>(new Set());
  const edges = useMemo(
    () => toFlowEdges(doc).map((e) => ({ ...e, selected: selectedEdges.has(e.id) })),
    [doc, selectedEdges],
  );
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setSelectedEdges((prev) => {
      const next = new Set(prev);
      changes.forEach((c) => {
        if (c.type === "select" && c.selected) next.add(c.id);
        if ((c.type === "select" && !c.selected) || c.type === "remove") next.delete(c.id);
      });
      return next;
    });
  }, []);

  // `fitView` (the prop) only frames the INITIAL nodes — re-frame whenever the node SET
  // changes (doc loaded/cleared, nodes added/removed), but not on mere prop/position edits.
  const [rf, setRf] = useState<ReactFlowInstance<Node<KindNodeData>, Edge> | null>(null);
  const idSignature = doc.nodes.map((n) => n.id).join(",");
  useEffect(() => {
    void rf?.fitView({ padding: FIT_PADDING });
  }, [rf, idSignature]);

  // Shift+Scroll zooms (anchored at the cursor), plain scroll passes through to the page — the
  // same convention as the 3D viewport's camera zoom, so mousing over the graph never hijacks
  // page scrolling. Ours, not xyflow's: its wheel handler drops every non-pinch wheel when
  // `preventScrolling` is false (the zoom activation key is never consulted), and when true it
  // swallows the scroll even with zoom filtered off — no prop combination gives this behavior.
  // A capture-phase non-passive listener claims the Shift+wheel before xyflow sees it; plain
  // wheel falls through untouched (trackpad pinch keeps zooming via zoomOnPinch + ctrlKey).
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !rf) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey || e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      const { x, y, zoom } = rf.getViewport();
      // d3-zoom's wheel scaling (2^(-deltaY/500)), clamped to the ReactFlow minZoom/maxZoom props.
      const next = Math.min(GRAPH_MAX_ZOOM, Math.max(GRAPH_MIN_ZOOM, zoom * Math.pow(2, -(e.deltaY || e.deltaX) / D3_WHEEL_SCALE)));
      const rect = el.getBoundingClientRect();
      const [sx, sy] = [e.clientX - rect.left, e.clientY - rect.top];
      // Keep the graph point under the cursor fixed: screen = flow·zoom + pan.
      void rf.setViewport({
        x: sx - ((sx - x) / zoom) * next,
        y: sy - ((sy - y) / zoom) * next,
        zoom: next,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", onWheel, { capture: true });
  }, [rf]);

  // Blender-style framing from the keyboard, scoped to the graph by HOVER (not focus): HOME fits
  // the whole graph, "." fits the selected node (or the whole graph if nothing's selected). A
  // window-level CAPTURE listener claims the key before anything else — beating both Firefox's
  // default (Home = scroll the page to top, the bug this fixes) and the Builder's window-level
  // shortcuts (notably "." → 3D camera focus, which therefore still fires when the cursor is NOT
  // over the graph). Gated on the pointer being over the canvas OR focus living inside it, so it
  // never hijacks keys meant for the rest of the app. Typing in a node field is left alone.
  const hoveringRef = useRef(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !rf) return;
    const enter = () => (hoveringRef.current = true);
    const leave = () => (hoveringRef.current = false);
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    const onKey = (e: KeyboardEvent) => {
      if (!hoveringRef.current && !el.contains(document.activeElement)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Home") {
        void rf.fitView({ padding: FIT_PADDING, duration: FIT_DURATION_MS });
      } else if (e.key === ".") {
        const id = app.selectedNode.peek();
        const node = id ? rf.getNode(id) : undefined;
        void rf.fitView(
          node ? { nodes: [{ id: node.id }], padding: FIT_SELECTED_PADDING, duration: FIT_DURATION_MS } : { padding: FIT_PADDING },
        );
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true); // capture: before browser default + Builder
    return () => {
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [rf, app]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<KindNodeData>>[]) => {
      setNodes((prev) => applyNodeChanges(changes, prev));
      changes.forEach((c) => {
        if (c.type === "remove") app.setViewDoc(removeNode(app.viewDoc.peek(), c.id));
        if (c.type === "select" && c.selected) onSelect(c.id);
      });
    },
    [app, onSelect],
  );

  // Canvas height is user-resizable (the drag bar below) and remembered across sessions.
  // ReactFlow re-measures automatically on container resize (its own ResizeObserver).
  const [height, setHeight] = useState(() => {
    const saved = Number(localStorage.getItem(HEIGHT_KEY));
    return Number.isFinite(saved) && saved >= MIN_H && saved <= MAX_H ? saved : DEFAULT_H;
  });

  // Fullscreen: the real Fullscreen API, matching the Game Demo's button. We fullscreen the canvas's
  // PARENT (the palette + canvas share that `relative` wrapper in NodesPanel) so the node palette and
  // controls stay visible — then the canvas fills it (style below). Esc exits natively.
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current?.parentElement?.requestFullscreen();
  };
  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const from = { y: e.clientY, h: height };
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) =>
      setHeight(Math.min(MAX_H, Math.max(MIN_H, from.h + (ev.clientY - from.y))));
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      setHeight((h) => {
        localStorage.setItem(HEIGHT_KEY, String(h));
        return h;
      });
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  // Track real fullscreen state (our parent is the fullscreen element) and re-frame the graph once
  // the container has resized into / out of fullscreen.
  useEffect(() => {
    const onFs = () => {
      setIsFullscreen(document.fullscreenElement === wrapRef.current?.parentElement);
      requestAnimationFrame(() => requestAnimationFrame(() => void rf?.fitView({ padding: FIT_PADDING })));
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [rf]);

  // Organize: the auto-layout (graph-layout.ts) as ONE undoable doc edit — every node's ui position
  // updates together, so Ctrl+Z restores the old arrangement wholesale. Two modes: "Compact" runs
  // the de-tall pass (landscape, ~golden ratio); "Layered" skips it (clean left→right chains, may be
  // tall). The wand expands to offer both, then collapses (on pick, Esc, or click-away).
  const [organizeOpen, setOrganizeOpen] = useState(false);
  // Collapse the fly-out on Esc or a pointer-down outside it.
  const organizeRef = useClickOutside<HTMLDivElement>(organizeOpen, () => setOrganizeOpen(false), {
    escape: true,
  });
  const organize = (balance: boolean) => {
    const d = app.viewDoc.peek();
    const positions = organizePositions(d, { balance });
    app.setViewDoc(d.nodes.reduce((acc, n) => setNodeUi(acc, n.id, positions[n.id]), d));
    setOrganizeOpen(false);
    // Re-frame on the next paint, once xyflow has measured the moved nodes.
    requestAnimationFrame(() => void rf?.fitView({ padding: 0.15 }));
  };

  // Grouping UX (docs/design/18, Phase 3). The current multi-selection drives Group; a single
  // selected component instance drives Ungroup. `editPath` shows the breadcrumb when editing in place.
  const editPath = useValue(app.editPath);
  const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
  const soleInstance =
    selectedIds.length === 1 && isInstance(doc, selectedIds[0]) ? selectedIds[0] : null;

  // Expose "where to drop a newly-added node" to the palette: the flow position at the CENTRE of the
  // current viewport, so a new node lands where you're looking (not at the graph centroid).
  useEffect(() => {
    if (!spawnPosRef) return;
    spawnPosRef.current = () => {
      const el = wrapRef.current;
      if (!rf || !el) return null;
      const { x, y, zoom } = rf.getViewport();
      const rect = el.getBoundingClientRect();
      // flow = (screen − pan) / zoom; nudge ~half a node so it reads centred, not top-left.
      return {
        x: Math.round((rect.width / 2 - x) / zoom) - NODE_HALF_W,
        y: Math.round((rect.height / 2 - y) / zoom) - NODE_HALF_H,
      };
    };
    return () => void (spawnPosRef.current = null);
  }, [rf, spawnPosRef]);

  // First free "Group"/"Group2"/… that collides with neither a built-in kind nor an existing def.
  const freeGroupName = (d: ParametricDoc): string => {
    let name = "Group";
    let i = 1;
    while (resolveSchema(name, d.components)) name = `Group${++i}`;
    return name;
  };
  const groupSelection = () => {
    if (!selectedIds.length) return;
    const d = app.viewDoc.peek();
    const name = freeGroupName(d);
    const grouped = groupNodes(d, selectedIds, name);
    app.setViewDoc(grouped);
    const inst = grouped.nodes.find((n) => n.kind === name);
    if (inst) onSelect(inst.id); // select the new instance so its inputs are ready to inspect
  };
  const ungroupSelection = () => {
    if (soleInstance) app.setViewDoc(ungroupInstance(app.viewDoc.peek(), soleInstance));
  };
  // Re-frame the canvas when descending into / popping out of a definition (the graph changes).
  useEffect(() => {
    requestAnimationFrame(() => void rf?.fitView({ padding: 0.15 }));
  }, [editPath, rf]);

  return (
    <>
      <div
        ref={wrapRef}
        // In fullscreen, fill the screen with viewport units (robust — doesn't depend on the
        // fullscreen element resolving a definite height); the drag-resize height applies only when
        // windowed.
        style={isFullscreen ? { height: "100vh" } : { height }}
        className="relative w-full overflow-hidden rounded-md border"
        data-testid="node-canvas"
      >
        {/* Edit-in-place breadcrumb (doc 18): shown only inside a definition — click to pop back up. */}
        {editPath && (
          <button
            className="bg-background/85 hover:bg-secondary absolute top-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-md border px-2 py-1 text-xs shadow-[var(--shadow-soft)] backdrop-blur"
            onClick={() => app.exitComponent()}
            title="Back to the top-level graph"
            aria-label="Exit component"
          >
            <ChevronLeft className="size-3.5" />
            <span className="text-muted-foreground">Level</span>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium">{editPath}</span>
          </button>
        )}
        {/* Top-right control stack: Fullscreen, Organize, then the grouping actions. */}
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-2">
          <Button
            size="icon"
            variant="secondary"
            className={OVERLAY_ICON_BTN}
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen the graph editor"}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen graph editor"}
          >
            {isFullscreen ? <Minimize /> : <Maximize />}
          </Button>
          <div ref={organizeRef} className="relative">
            <Button
              size="icon"
              variant="secondary"
              className={OVERLAY_ICON_BTN}
              onClick={() => setOrganizeOpen((o) => !o)}
              title="Organize the graph — pick a layout (one undo step)"
              aria-label="Organize nodes"
              aria-expanded={organizeOpen}
            >
              <Wand2 />
            </Button>
            {organizeOpen && (
              <div className="bg-background/95 absolute top-0 right-full mr-2 flex flex-col gap-1 rounded-md border p-1 shadow-[var(--shadow-soft)] backdrop-blur">
                <button
                  className="hover:bg-secondary rounded px-2 py-1 text-left text-xs whitespace-nowrap"
                  onClick={() => organize(true)}
                  title="Compact: wrap tall fan-out into a landscape (~golden-ratio) box"
                >
                  Compact
                </button>
                <button
                  className="hover:bg-secondary rounded px-2 py-1 text-left text-xs whitespace-nowrap"
                  onClick={() => organize(false)}
                  title="Layered: clean left→right chains, fewest crossings (may be tall)"
                >
                  Layered
                </button>
              </div>
            )}
          </div>
          {selectedIds.length > 0 && (
            <Button
              size="icon"
              variant="secondary"
              className={OVERLAY_ICON_BTN}
              onClick={groupSelection}
              title={`Group ${selectedIds.length} selected node${selectedIds.length > 1 ? "s" : ""} into a reusable component`}
              aria-label="Group selection into a component"
            >
              <Group />
            </Button>
          )}
          {soleInstance && (
            <Button
              size="icon"
              variant="secondary"
              className={OVERLAY_ICON_BTN}
              onClick={ungroupSelection}
              title="Ungroup — explode this instance back into its nodes"
              aria-label="Ungroup instance"
            >
              <Ungroup />
            </Button>
          )}
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          // Socket rows make nodes tall; the default minZoom (0.5) can leave fitView unable to fit
          // a modest graph in the fixed-height canvas, clipping the bottom nodes' handles.
          minZoom={GRAPH_MIN_ZOOM}
          onInit={setRf}
          // Blender-style deletion: X (or Delete/Backspace) removes the selected edge (unwiring
          // the binding via onEdgesDelete) or node. The Builder's own X/Delete shortcut stands
          // down when the keypress originates inside this canvas (see use-editor-shortcuts).
          // react-flow listens GLOBALLY, so while a Move/Scale gesture is armed — where X is the
          // 3D editor's axis-lock — drop X/x so it can't delete the (selected) node being scaled.
          deleteKeyCode={rectMode ? ["Delete", "Backspace"] : ["x", "X", "Delete", "Backspace"]}
          // Shift-click adds nodes to the selection (xyflow defaults to Cmd/Ctrl) — the gesture for
          // picking several nodes to Group (doc 18). Shift+drag on the pane still box-selects (the
          // default selectionKeyCode); Shift+wheel zoom is a separate handler, so no conflict.
          multiSelectionKeyCode={["Shift", "Meta", "Control"]}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
          // Plain wheel never zooms or gets swallowed — the page scrolls. Shift+wheel is claimed
          // by the capture listener above before xyflow sees it.
          preventScrolling={false}
          // Drag is local (smooth); the doc records the final position as ONE undoable edit.
          onNodeDragStop={(_e, node) => app.setViewDoc(setNodeUi(doc, node.id, node.position))}
          // Double-click an instance → descend into its definition's sub-graph (edit-in-place).
          onNodeDoubleClick={(_e, node) => {
            const kind = doc.nodes.find((n) => n.id === node.id)?.kind;
            if (kind && doc.components?.some((c) => c.name === kind)) app.enterComponent(kind);
          }}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onPaneClick={() => onSelect(null)}
          isValidConnection={(c: Edge | Connection) =>
            !!c.source &&
            !!c.target &&
            socketsMatch(doc, c.source, c.sourceHandle, c.target, c.targetHandle) &&
            !wouldCycle(doc, c.target, { bind: c.source })
          }
          onConnect={(c: Connection) => {
            if (!c.source || !c.target || !c.targetHandle) return;
            const spec = resolveSchema(
              doc.nodes.find((n) => n.id === c.target)?.kind ?? "",
              doc.components,
            )?.inputs[c.targetHandle];
            const binding: Binding = {
              bind: c.source,
              // Named source sockets (door.opening) record their output; "out" stays implicit.
              ...(c.sourceHandle && c.sourceHandle !== "out" ? { output: c.sourceHandle } : {}),
            };
            // Multi inputs (walls.holes) APPEND — every door gets its own noodle.
            app.setViewDoc(
              spec?.multi
                ? wireAdd(doc, c.target, c.targetHandle, binding)
                : wire(doc, c.target, c.targetHandle, binding),
            );
          }}
          onEdgesDelete={(deleted) => {
            let next = doc;
            deleted.forEach((e) => {
              if (e.targetHandle)
                next = unwireOne(next, e.target, e.targetHandle, {
                  bind: e.source,
                  ...(e.sourceHandle && e.sourceHandle !== "out" ? { output: e.sourceHandle } : {}),
                });
            });
            app.setViewDoc(next);
          }}
        >
          <Background gap={16} />
          {/* Only worth the screen real estate once the graph is big enough to scroll off-canvas
              (small docs like Graph Room fit entirely in view). pannable so it doubles as a scrubber. */}
          {nodes.length > MINIMAP_MIN_NODES && <MiniMap pannable zoomable />}
        </ReactFlow>
      </div>
      {/* Drag bar: resize the graph editor vertically (height persists in localStorage). Hidden in
          fullscreen, where the canvas already fills the viewport. */}
      {!isFullscreen && (
        <div
          role="separator"
          aria-label="Resize graph editor"
          title="Drag to resize the graph editor"
          className="hover:bg-secondary group flex h-2.5 w-full cursor-ns-resize touch-none items-center justify-center rounded"
          onPointerDown={onResizeStart}
        >
          <div className="bg-border group-hover:bg-muted-foreground h-1 w-16 rounded-full" />
        </div>
      )}
    </>
  );
};
