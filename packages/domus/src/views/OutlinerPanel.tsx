import { ArrowDownUp, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { useValue } from "@kitsune/common-web/src/react";

import { Vector3 } from "three";

import { EditorApp } from "../domus-app/level-editor";
import { MANUAL_NODE_ID } from "../parametric/edit";
import { DocNode } from "../parametric/types";
import { resolveTransform } from "../blocks/transform";
import { isGridPlacement, Placement } from "../blocks/types";

import { nodeFocusCenter } from "../parametric/node-focus";

import { buildOutlinerRows, OutlinerDirection, OutlinerRow } from "./outliner-rows";

// The Builder outliner (Blender-style): a hierarchical view of everything in the scene, pinned
// to the canvas's upper right. The doc is a DAG (a wall binds two points; one rect drives many
// generators), so rows come from outliner-rows.ts, which expands it into a tree where a node
// can appear under every parent it relates to. The header button flips the direction:
//
//   ▾ wall-1                  ← PRODUCTS FIRST (default): the visible scene as roots…
//       point-1               ← …with what each thing derives from nested inside
//       point-2
//   ▾ Hand-placed             ← the manual node lists every hand-placed block, each selectable
//       table  (3, 2)
//
//   ▾ point-1                 ← SOURCES FIRST: the editable handles as roots…
//       wall-1 (1)            ← …with everything they drive nested (wall-1 also under point-2)
//
// Clicking a row selects its node (primitive rows enable Move/Scale; generator rows open the
// inspector); clicking a hand-placed row selects that placement in the BlockInspector — list
// selection beats hunting through a cluttered 3D view.

const INDENT_BASE = 6; // px — row left padding at depth 0
const INDENT_STEP = 14; // px per tree depth

const labelOf = (n: DocNode) => n.label ?? n.id;

const placementLabel = (p: Placement): string =>
  isGridPlacement(p)
    ? `${p.block}  (${p.cell[0]}, ${p.cell[1]})${p.y ? ` y${p.y}` : ""}`
    : `${p.block}  (${p.pos[0].toFixed(1)}, ${p.pos[2].toFixed(1)})`;

// The per-render shared state/handlers a NodeRow needs, threaded down the recursion.
type RowCtx = {
  countFor: (id: string) => number;
  selectedNodeId: string | null;
  direction: OutlinerDirection;
  expanded: Record<string, boolean>;
  onSelect: (id: string) => void;
  onToggle: (key: string) => void;
  onFocus: (node: DocNode) => void;
};

// A DAG row + its descendants. HOISTED to module scope (not redefined inside OutlinerPanel) so React
// keeps each row's identity across outliner state changes — a per-render inner component gives every
// `<NodeRow>` a fresh type each render, remounting the whole subtree on any expand/select.
const NodeRow = ({ row, depth, ctx }: { row: OutlinerRow; depth: number; ctx: RowCtx }) => {
  const { node, path, children } = row;
  const count = ctx.countFor(node.id);
  const isSelected = node.id === ctx.selectedNodeId;
  const expandKey = `${ctx.direction}:${path}`;
  const isCollapsed = !ctx.expanded[expandKey];
  return (
    <>
      <div
        className={`flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
          isSelected ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
        }`}
        style={{ paddingLeft: INDENT_BASE + depth * INDENT_STEP }}
        onClick={() => ctx.onSelect(node.id)}
        onDoubleClick={() => ctx.onFocus(node)}
        title={`${node.kind} node — click to select, double-click to frame`}
      >
        {children.length > 0 ? (
          <button
            className="shrink-0 opacity-60"
            onClick={(e) => {
              e.stopPropagation();
              ctx.onToggle(expandKey);
            }}
            aria-label={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className="truncate">{labelOf(node)}</span>
        <span className={`ml-auto pl-2 ${isSelected ? "opacity-80" : "text-muted-foreground"}`}>
          {count > 0 ? count : node.kind}
        </span>
      </div>
      {!isCollapsed &&
        children.map((c) => <NodeRow key={c.path} row={c} depth={depth + 1} ctx={ctx} />)}
    </>
  );
};

export const OutlinerPanel = ({ app }: { app: EditorApp }) => {
  const doc = useValue(app.doc);
  const level = useValue(app.level);
  const manual = useValue(app.manual);
  const selectedNodeId = useValue(app.selectedNode);
  const selectedManual = useValue(app.selected);
  const [direction, setDirection] = useState<OutlinerDirection>("products");
  // Rows start COLLAPSED — the map tracks what the user has expanded, per OCCURRENCE (row
  // path) and per direction, so expanding wall-1 under point-1 leaves its point-2 copy alone.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const countFor = (id: string) =>
    level.placements.filter((p) => p.id?.startsWith(`${id}/`)).length;

  const rows = buildOutlinerRows(doc, direction);
  const manualNode = doc.nodes.find((n) => n.id === MANUAL_NODE_ID) ?? null;

  const toggle = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  // Double-click = Blender's "frame on": jump the camera to the spot the row describes — the
  // midpoint of the primitives the node derives from (shared math in parametric/node-focus.ts),
  // or a hand-placed block's position.
  const focusNode = (node: DocNode) => {
    const c = nodeFocusCenter(doc, node.id);
    if (c) app.focusPoint(new Vector3(c.x, c.y, c.z));
  };
  const focusPlacement = (p: Placement) => app.focusPoint(resolveTransform(p, app.tile).position);

  const rowCtx: RowCtx = {
    countFor,
    selectedNodeId,
    direction,
    expanded,
    onSelect: (id) => app.selectedNode.set(id),
    onToggle: toggle,
    onFocus: focusNode,
  };

  return (
    <div
      data-testid="outliner"
      className="bg-background/85 max-h-full w-52 overflow-y-auto rounded-md p-1.5 shadow-md backdrop-blur"
    >
      <div className="flex items-center px-1.5 pb-1">
        <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          Outliner
        </span>
        <button
          className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1 text-[10px]"
          onClick={() => setDirection((d) => (d === "products" ? "sources" : "products"))}
          aria-label="Outliner order"
          title={
            direction === "products"
              ? "Products first — what each thing derives from nested inside. Click for sources first."
              : "Sources first — what each handle drives nested inside. Click for products first."
          }
        >
          {direction === "products" ? "products" : "sources"}
          <ArrowDownUp className="size-3" />
        </button>
      </div>
      {rows.map((r) => (
        <NodeRow key={r.path} row={r} depth={0} ctx={rowCtx} />
      ))}
      {manualNode && (
        <>
          <div
            className={`flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
              manualNode.id === selectedNodeId
                ? "bg-primary text-primary-foreground"
                : "hover:bg-secondary"
            }`}
            onClick={() => app.selectedNode.set(manualNode.id)}
            title="Hand-placed blocks"
          >
            <button
              className="shrink-0 opacity-60"
              onClick={(e) => {
                e.stopPropagation();
                toggle(manualNode.id);
              }}
              aria-label={expanded[manualNode.id] ? "Collapse" : "Expand"}
            >
              {!expanded[manualNode.id] ? (
                <ChevronRight className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
            </button>
            <span className="truncate">{labelOf(manualNode)}</span>
            <span className="text-muted-foreground ml-auto pl-2">{manual.length}</span>
          </div>
          {expanded[manualNode.id] &&
            manual.map((p, i) => (
              <div
                key={p.id ?? i}
                className={`flex cursor-pointer items-center rounded py-0.5 pr-1.5 pl-8 text-xs ${
                  i === selectedManual ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                }`}
                onClick={() => app.selected.set(i)}
                onDoubleClick={() => focusPlacement(p)}
                title="Click to select (inspector + highlight); double-click to frame"
              >
                <span className="truncate capitalize">{placementLabel(p)}</span>
              </div>
            ))}
        </>
      )}
    </div>
  );
};
