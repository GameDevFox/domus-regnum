import { MANUAL_NODE_ID } from "../parametric/edit";
import { nodeSchema } from "../parametric/resolve";
import {
  bindingsOf,
  ComponentDef,
  DocNode,
  InputSpec,
  isBinding,
  NodeId,
  ParametricDoc,
} from "../parametric/types";

// Graph-canvas layout math, kept pure (no React, no xyflow) so it's unit-testable.
//
// `organizePositions` is the Organize button's auto-layout: a Sugiyama-style LAYERED layout
// tuned for FEW EDGE CROSSINGS (the "ideal" the cleanest node graphs aim for).
//
//   1. LAYER (column) = longest dependency chain under the node: sources (primitives, constants)
//      land in column 0 and every consumer sits right of ALL its dependencies, so chains read
//      left → right (point → wall, door → walls).
//   2. ORDER within each layer is chosen to minimize crossings: edges spanning >1 column get
//      DUMMY nodes in the columns they pass through (so a long noodle is counted/ordered like a
//      real chain), then iterated up/down BARYCENTER sweeps reorder each layer toward the mean
//      position of its neighbors. We keep the ordering with the fewest crossings across sweeps
//      (`countCrossings` is the exact metric — every edge pair between adjacent layers that
//      inverts). Dummies exist only for the ordering pass; they don't render.
//   3. Y assigned by stacking each layer in that order (estimated node heights + a gap), then
//      a few barycenter relaxation passes nudge each node toward its neighbors' mean height
//      (overlap-guarded) so long chains run straight. Columns center on the tallest one.
//
// The manual placements node binds nothing and nothing binds it — park it in the rightmost
// column with the other end products.

// Which inputs render as socket rows on the canvas node: primitive-typed (rect, point, opening,
// measure), inline literals, and anything currently field-bound (so its noodle has somewhere to
// land). Shared with NodeCanvas so the height estimate matches what's drawn.
export const socketRowsOf = (node: DocNode, components?: ComponentDef[]): [string, InputSpec][] => {
  const kind = nodeSchema(node, components);
  if (!kind) return [];
  return Object.entries(kind.inputs).filter(
    ([name, spec]) =>
      spec.type === "rect" ||
      spec.type === "point" ||
      spec.type === "opening" ||
      spec.type === "measure" ||
      spec.type === "finish" ||
      spec.type === "frame" ||
      spec.type === "frames" ||
      spec.inline ||
      isBinding(node.props[name] ?? null) ||
      // an interface input's `default` always gets a row + connector, even for complex types that
      // render no inline field (so you can wire a fallback into it).
      (node.kind === "input" && name === "default"),
  );
};

// Estimated rendered height: title + kind lines ≈ 44px, ~24px per socket row.
export const estimateHeight = (node: DocNode, components?: ComponentDef[]): number =>
  44 + socketRowsOf(node, components).length * 24;

const GAP = 16; // vertical gap between stacked nodes
const COL_W = 230; // column stride (nodes are ~190px wide with inline fields)
const X0 = 30;
const Y0 = 30;
const SWEEPS = 16; // up/down ordering passes (graphs are small; this converges well before this)
const RELAX = 24; // Y barycenter relaxation passes

// The dependency node-ids a node binds (single, list, or field bindings), filtered to ids that
// exist in the doc. The graph's edges point dep → consumer (consumer sits in a higher column).
const depsOf = (node: DocNode, has: (id: NodeId) => boolean): NodeId[] =>
  bindingsOf(node.props)
    .map((b) => b.bind)
    .filter(has);

// Longest-path column per node (cycle-guarded so malformed docs still lay out). The manual node
// is parked in the last column with the other products.
const assignColumns = (doc: ParametricDoc, byId: Map<NodeId, DocNode>): Map<NodeId, number> => {
  const has = (id: NodeId) => byId.has(id);
  const memo = new Map<NodeId, number>();
  const columnOf = (n: DocNode, path: Set<NodeId>): number => {
    const hit = memo.get(n.id);
    if (hit !== undefined) return hit;
    const deps = depsOf(n, has).filter((d) => !path.has(d));
    const col =
      deps.length === 0
        ? 0
        : 1 + Math.max(...deps.map((d) => columnOf(byId.get(d)!, new Set(path).add(d))));
    memo.set(n.id, col);
    return col;
  };
  doc.nodes.forEach((n) => columnOf(n, new Set([n.id])));
  if (byId.has(MANUAL_NODE_ID)) memo.set(MANUAL_NODE_ID, Math.max(1, ...memo.values()));
  return memo;
};

// A layered graph ready for ordering: each layer is a list of ids (real + dummy), with up/down
// adjacency between consecutive layers. A doc edge dep→consumer spanning k columns becomes a
// chain through k−1 dummies, so crossings are counted as if every edge were between neighbors.
type Layered = {
  layers: NodeId[][];
  adjUp: Map<NodeId, NodeId[]>; // node (col c) → its neighbors in col c−1
  adjDown: Map<NodeId, NodeId[]>; // node (col c) → its neighbors in col c+1
};

const buildLayered = (doc: ParametricDoc, col: Map<NodeId, number>): Layered => {
  const has = (id: NodeId) => col.has(id);
  const maxCol = Math.max(0, ...col.values());
  const layers: NodeId[][] = Array.from({ length: maxCol + 1 }, () => []);
  doc.nodes.forEach((n) => layers[col.get(n.id)!].push(n.id));

  const adjUp = new Map<NodeId, NodeId[]>();
  const adjDown = new Map<NodeId, NodeId[]>();
  const link = (lo: NodeId, hi: NodeId) => {
    // lo is one column left of hi
    (adjDown.get(lo) ?? adjDown.set(lo, []).get(lo)!).push(hi);
    (adjUp.get(hi) ?? adjUp.set(hi, []).get(hi)!).push(lo);
  };

  let dummies = 0;
  doc.nodes.forEach((n) => {
    const cN = col.get(n.id)!;
    depsOf(n, has).forEach((dep) => {
      const cB = col.get(dep)!;
      let prev = dep; // walk dep (col cB) up toward n (col cN)
      for (let c = cB + 1; c < cN; c++) {
        const d = `__d${dummies++}`;
        layers[c].push(d);
        link(prev, d);
        prev = d;
      }
      link(prev, n.id);
    });
  });
  return { layers, adjUp, adjDown };
};

const indexMap = (layer: NodeId[]): Map<NodeId, number> => {
  const m = new Map<NodeId, number>();
  layer.forEach((id, i) => m.set(id, i));
  return m;
};

// Total edge crossings across all adjacent layer pairs, for the given per-layer orders. Two
// edges between a layer pair cross when their endpoints invert; we sort edges by their left
// index and count inversions in the right indices. O(E²) per pair — fine for editor-sized graphs.
export const countCrossings = (
  layers: NodeId[][],
  adjDown: Map<NodeId, NodeId[]>,
  orders: Map<NodeId, number>[],
): number => {
  let total = 0;
  for (let c = 0; c < layers.length - 1; c++) total += crossingsBetween(c, layers, adjDown, orders);
  return total;
};

// Reorder one layer by the barycenter (mean index) of each node's neighbors in the FIXED
// adjacent layer. Nodes with no neighbor in that direction keep their current slot (their index
// is the key), and ties break on current index — so the sweep is stable and deterministic.
const sweepLayer = (
  layer: NodeId[],
  neighbors: Map<NodeId, NodeId[]>,
  fixed: Map<NodeId, number>,
): NodeId[] =>
  layer
    .map((id, i) => {
      const nb = neighbors.get(id) ?? [];
      const key = nb.length ? nb.reduce((s, x) => s + fixed.get(x)!, 0) / nb.length : i;
      return { id, key, i };
    })
    .sort((a, b) => a.key - b.key || a.i - b.i)
    .map((x) => x.id);

// Crossings on a single layer boundary (cLeft, cLeft+1) for the current orders — used by the
// transpose pass, which only perturbs one layer and so only this boundary's count changes.
const crossingsBetween = (
  cLeft: number,
  layers: NodeId[][],
  adjDown: Map<NodeId, NodeId[]>,
  orders: Map<NodeId, number>[],
): number => {
  const edges: [number, number][] = [];
  for (const a of layers[cLeft])
    for (const b of adjDown.get(a) ?? [])
      edges.push([orders[cLeft].get(a)!, orders[cLeft + 1].get(b)!]);
  edges.sort((e, f) => e[0] - f[0] || e[1] - f[1]);
  let n = 0;
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) if (edges[i][1] > edges[j][1]) n++;
  return n;
};

// Greedy local search: swap adjacent nodes in a layer whenever it reduces the crossings on that
// layer's two boundaries, repeating until no swap helps. Squeezes out the residual crossings the
// barycenter sweep leaves — the classic Sugiyama "transpose" step. Strictly non-increasing.
const transpose = (layers: NodeId[][], l: Layered, orders: Map<NodeId, number>[]): void => {
  let improved = true;
  while (improved) {
    improved = false;
    for (let c = 0; c < layers.length; c++) {
      for (let i = 0; i < layers[c].length - 1; i++) {
        const before =
          (c > 0 ? crossingsBetween(c - 1, layers, l.adjDown, orders) : 0) +
          (c < layers.length - 1 ? crossingsBetween(c, layers, l.adjDown, orders) : 0);
        [layers[c][i], layers[c][i + 1]] = [layers[c][i + 1], layers[c][i]];
        orders[c].set(layers[c][i], i);
        orders[c].set(layers[c][i + 1], i + 1);
        const after =
          (c > 0 ? crossingsBetween(c - 1, layers, l.adjDown, orders) : 0) +
          (c < layers.length - 1 ? crossingsBetween(c, layers, l.adjDown, orders) : 0);
        if (after < before) improved = true;
        else {
          [layers[c][i], layers[c][i + 1]] = [layers[c][i + 1], layers[c][i]]; // revert
          orders[c].set(layers[c][i], i);
          orders[c].set(layers[c][i + 1], i + 1);
        }
      }
    }
  }
};

// Crossing-minimizing order: alternate down/up barycenter sweeps with a transpose pass, keeping
// the order with the fewest crossings seen. Returns the best layers (real + dummy) + order maps.
const minimizeCrossings = (l: Layered): { layers: NodeId[][]; orders: Map<NodeId, number>[] } => {
  const layers = l.layers.map((x) => [...x]);
  const orders = layers.map(indexMap);
  let best = layers.map((x) => [...x]);
  let bestX = countCrossings(layers, l.adjDown, orders);

  for (let s = 0; s < SWEEPS && bestX > 0; s++) {
    if (s % 2 === 0)
      for (let c = 1; c < layers.length; c++) {
        layers[c] = sweepLayer(layers[c], l.adjUp, orders[c - 1]);
        orders[c] = indexMap(layers[c]);
      }
    else
      for (let c = layers.length - 2; c >= 0; c--) {
        layers[c] = sweepLayer(layers[c], l.adjDown, orders[c + 1]);
        orders[c] = indexMap(layers[c]);
      }
    transpose(layers, l, orders);
    const x = countCrossings(layers, l.adjDown, orders);
    if (x < bestX) {
      bestX = x;
      best = layers.map((y) => [...y]);
    }
  }
  return { layers: best, orders: best.map(indexMap) };
};

// Pool-adjacent-violators: the non-decreasing sequence closest (least-squares) to `xs`.
const isotonic = (xs: number[]): number[] => {
  const blocks: { sum: number; n: number; val: number }[] = [];
  for (const x of xs) {
    let b = { sum: x, n: 1, val: x };
    while (blocks.length && blocks[blocks.length - 1].val > b.val) {
      const p = blocks.pop()!;
      b = { sum: p.sum + b.sum, n: p.n + b.n, val: (p.sum + b.sum) / (p.n + b.n) };
    }
    blocks.push(b);
  }
  const out: number[] = [];
  for (const b of blocks) for (let i = 0; i < b.n; i++) out.push(b.val);
  return out;
};

// Optimal, DRIFT-FREE 1D overlap removal: given each row's height and DESIRED top (in column
// order), return tops that keep the order + a GAP between rows and sit as close to desired as
// possible. Subtracting the minimum spacing each row owes the rows above it reduces the problem
// to isotonic regression. Unlike a one-directional "push down on overlap" pass, this never
// accumulates drift — the row barycenter relaxation below would otherwise diverge, flinging
// island nodes (manual-1, wall-h) thousands of px away (the bug this replaced).
const resolveColumn = (heights: number[], desiredTop: number[]): number[] => {
  const prefix: number[] = [];
  let acc = 0;
  for (let i = 0; i < heights.length; i++) {
    prefix.push(acc);
    acc += heights[i] + GAP;
  }
  const fitted = isotonic(desiredTop.map((d, i) => d - prefix[i]));
  return fitted.map((v, i) => v + prefix[i]);
};

const GOLDEN = 1.618; // target width : height for the de-tall pass

// Greedy, order-preserving wrap: split one column's ordered ids into consecutive sub-columns, each
// no taller than `cap` px (but always ≥1 node, so a lone tall node still fits). Keeps adjacent
// nodes adjacent (the locality we care about more than crossings here). Empty columns pass through.
const packColumn = (ids: NodeId[], cap: number, h: (id: NodeId) => number): NodeId[][] => {
  if (!ids.length) return [ids];
  const cols: NodeId[][] = [];
  let cur: NodeId[] = [];
  let span = 0;
  for (const id of ids) {
    const nh = h(id) + GAP;
    if (cur.length && span + nh > cap) {
      cols.push(cur);
      cur = [];
      span = 0;
    }
    cur.push(id);
    span += nh;
  }
  if (cur.length) cols.push(cur);
  return cols;
};

// De-tall pass (TODO #1): longest-path layering piles fan-out (e.g. all the manor's leaf furniture)
// into a few columns, so even a wide graph renders as a skyscraper. When the box is taller than it
// is wide, wrap each over-tall column into consecutive sub-columns until the bounding box approaches
// the golden ratio (width : height ≈ φ). Trades edge cleanliness / crossings for compactness; an
// already-landscape graph is returned untouched (so small/normal graphs look exactly as before).
const rebalanceColumns = (realCols: NodeId[][], h: (id: NodeId) => number): NodeId[][] => {
  const spanOf = (ids: NodeId[]) => ids.reduce((s, id) => s + h(id) + GAP, 0);
  const naturalH = Math.max(0, ...realCols.map(spanOf));
  const naturalW = realCols.length * COL_W;
  if (naturalH <= naturalW) return realCols; // already landscape — leave it exactly as-is

  const subColCount = (cap: number) =>
    realCols.reduce((n, ids) => n + packColumn(ids, cap, h).length, 0);
  const aspectAt = (cap: number) => (subColCount(cap) * COL_W) / cap; // width / height (height ≈ cap)

  // Aspect rises as the cap shrinks (more, shorter sub-columns); binary-search the cap nearest φ.
  const lo = GAP + Math.max(0, ...realCols.flat().map(h)); // can't pack tighter than the tallest node
  let a = lo;
  let b = naturalH;
  for (let i = 0; i < 24; i++) {
    const mid = (a + b) / 2;
    if (aspectAt(mid) > GOLDEN) a = mid;
    else b = mid;
  }
  if (b >= naturalH) return realCols; // no split would help
  return realCols.flatMap((ids) => packColumn(ids, b, h));
};

export const organizePositions = (
  doc: ParametricDoc,
  opts: { balance?: boolean } = {}, // balance = the de-tall pass (default on); false = pure layered
): Record<NodeId, { x: number; y: number }> => {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const col = assignColumns(doc, byId);
  const layered = buildLayered(doc, col);
  const { layers } = minimizeCrossings(layered);
  const h = (id: NodeId) => estimateHeight(byId.get(id)!, doc.components);

  // Real nodes per column in the crossing-minimized order (drop the routing dummies), then —
  // unless the caller opts out — a de-tall rebalance: wrap over-tall fan-out columns into
  // sub-columns so the box reads landscape (~golden ratio) instead of a skyscraper (TODO #1).
  const base = layers.map((layer) => layer.filter((id) => byId.has(id)));
  const realCols = (opts.balance ?? true) ? rebalanceColumns(base, h) : base;

  // Initial Y: stack each column in order. Keep a height per node for overlap checks.
  const pos: Record<NodeId, { x: number; y: number }> = {};
  realCols.forEach((ids, c) => {
    let cursor = 0;
    ids.forEach((id) => {
      pos[id] = { x: X0 + c * COL_W, y: cursor };
      cursor += h(id) + GAP;
    });
  });

  // Straighten: each pass, nudge every node toward the mean center-Y of its real neighbors
  // (resolved through dummy chains to real endpoints), then remove overlaps with the drift-free
  // resolveColumn — order is fixed, so crossings never change. Island nodes (no neighbors) keep
  // their current top. Sweep direction alternates so neighbor info flows both ways; bounded by
  // construction, so it converges instead of diverging.
  const realNeighbors = (id: NodeId, dir: Map<NodeId, NodeId[]>): NodeId[] => {
    const out: NodeId[] = [];
    const walk = (x: NodeId) =>
      (dir.get(x) ?? []).forEach((n) => (byId.has(n) ? out.push(n) : walk(n)));
    walk(id);
    return out;
  };
  const centerY = (id: NodeId) => pos[id].y + h(id) / 2;
  for (let pass = 0; pass < RELAX; pass++) {
    const order = realCols.map((_, i) => (pass % 2 === 0 ? i : realCols.length - 1 - i));
    for (const c of order) {
      const ids = realCols[c];
      if (!ids.length) continue;
      const desired = ids.map((id) => {
        const nb = [...realNeighbors(id, layered.adjUp), ...realNeighbors(id, layered.adjDown)];
        return nb.length
          ? nb.reduce((s, n) => s + centerY(n), 0) / nb.length - h(id) / 2
          : pos[id].y;
      });
      const tops = resolveColumn(
        ids.map((id) => h(id)),
        desired,
      );
      ids.forEach((id, i) => (pos[id].y = tops[i]));
    }
  }

  // Center every column vertically on the tallest, so the graph reads as one block.
  const spanOf = (ids: NodeId[]) =>
    ids.length ? pos[ids[ids.length - 1]].y + h(ids[ids.length - 1]) - pos[ids[0]].y : 0;
  const maxH = Math.max(0, ...realCols.map(spanOf));
  realCols.forEach((ids) => {
    if (!ids.length) return;
    const top = pos[ids[0]].y;
    const offset = Y0 + (maxH - spanOf(ids)) / 2 - top;
    ids.forEach((id) => (pos[id].y += offset));
  });
  return pos;
};

// A copy of `doc` with every node's `ui` set to its organized position — bakes the Organize
// layout into the doc so a freshly-loaded sample appears tidy instead of in the default
// column-stack. (The Organize button does the same as an undoable edit; this is the load path.)
export const organizedDoc = (
  doc: ParametricDoc,
  opts: { balance?: boolean } = {},
): ParametricDoc => {
  // Lay out a node set against the doc's component list (for instance-node height estimation), then
  // bake each position into the node's `ui`.
  const layout = (nodes: DocNode[]): DocNode[] => {
    const pos = organizePositions({ ...doc, nodes }, opts);
    return nodes.map((n) => ({ ...n, ui: pos[n.id] ?? n.ui }));
  };
  return {
    ...doc,
    nodes: layout(doc.nodes),
    // Each component definition's sub-graph gets laid out too, so editing-in-place opens tidy and the
    // baked positions persist on save (organizePositions alone only touches top-level nodes).
    ...(doc.components
      ? { components: doc.components.map((c) => ({ ...c, nodes: layout(c.nodes) })) }
      : {}),
  };
};

// Test seam: crossing count for a doc's layered graph. `minimize` false returns the doc-order
// baseline (what you'd get with no ordering pass) — the regression test compares the two.
export const organizedCrossings = (doc: ParametricDoc, minimize = true): number => {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const layered = buildLayered(doc, assignColumns(doc, byId));
  const orders = minimize ? minimizeCrossings(layered).orders : layered.layers.map(indexMap);
  return countCrossings(layered.layers, layered.adjDown, orders);
};
