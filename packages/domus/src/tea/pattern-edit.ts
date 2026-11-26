// Structural tree-editing ops for the Pattern Builder. Works on a uniform editor tree (`ETree`) where
// EVERY element has a `children` array — so select / delete / move / wrap / add are generic at any depth
// (deep nesting like optional ▸ repeat ▸ any just works). Converts to/from the canonical `PatternNode`
// AST (pattern-notation.ts). Pure + deterministic.

import { type NotatedPattern, type PatternNode, WILDCARD } from "./pattern-notation";

export type EKind = "fixed" | "wildcard" | "alt" | "anyOf" | "anyOrder" | "optional" | "repeat";
// `alt` = one alternative inside an `anyOf`. `sym` on fixed/alt; `min`/`max` on repeat (bounded).
export type ETree = { kind: EKind; sym?: string; min?: number; max?: number; children: ETree[] };

export type Path = number[]; // indices from the top-level list down through `.children`

// ---- AST <-> editor tree ----

export const toE = (n: PatternNode): ETree => {
  switch (n.kind) {
    case "fixed":
      return { kind: "fixed", sym: n.symbol, children: [] };
    case "wildcard":
      return { kind: "wildcard", children: [] };
    case "anyOf":
      return { kind: "anyOf", children: n.symbols.map((s) => ({ kind: "alt", sym: s, children: [] })) };
    case "anyOrder":
      return { kind: "anyOrder", children: n.nodes.map(toE) };
    case "optional":
      return { kind: "optional", children: n.nodes.map(toE) };
    case "repeat":
      return { kind: "repeat", min: n.min, max: n.max, children: n.nodes.map(toE) };
  }
};

export const toEList = (nodes: PatternNode[]): ETree[] => nodes.map(toE);

export const toAst = (e: ETree): PatternNode => {
  switch (e.kind) {
    case "fixed":
      return { kind: "fixed", symbol: e.sym ?? "" };
    case "wildcard":
      return { kind: "wildcard" };
    case "alt":
      throw new Error("an alternative can only live inside an 'any'");
    case "anyOf":
      return { kind: "anyOf", symbols: e.children.map((c) => c.sym ?? "") };
    case "anyOrder":
      return { kind: "anyOrder", nodes: e.children.map(toAst) };
    case "optional":
      return { kind: "optional", nodes: e.children.map(toAst) };
    case "repeat":
      return { kind: "repeat", min: e.min ?? 1, max: e.max ?? e.min ?? 1, nodes: e.children.map(toAst) };
  }
};

export const toAstList = (es: ETree[]): PatternNode[] => es.map(toAst);

export const toPattern = (body: ETree[], base: Pick<NotatedPattern, "id" | "intent"> = { id: "custom", intent: "Custom" }): NotatedPattern => ({
  ...base,
  nodes: toAstList(body),
});

// ---- navigation ----

export const getAt = (body: ETree[], path: Path): ETree | null => {
  let list = body;
  let node: ETree | null = null;
  for (const i of path) {
    node = list[i] ?? null;
    if (!node) return null;
    list = node.children;
  }
  return node;
};

// A node that holds a child sequence you can add INTO (everything but the leaves fixed/wildcard/alt).
export const isContainer = (e: ETree | null): boolean =>
  e?.kind === "anyOf" || e?.kind === "anyOrder" || e?.kind === "optional" || e?.kind === "repeat";

// Apply `fn` to the child-LIST that contains the element at `path` (path[last] is its index there).
const updateList = (body: ETree[], path: Path, fn: (list: ETree[], idx: number) => ETree[]): ETree[] => {
  if (path.length === 1) return fn(body, path[0]);
  const [i, ...rest] = path;
  return body.map((n, k) => (k === i ? { ...n, children: updateList(n.children, rest, fn) } : n));
};

// Replace the NODE at `path` via `fn` (acts on the node itself, not its sibling list).
const updateNode = (body: ETree[], path: Path, fn: (n: ETree) => ETree): ETree[] =>
  updateList(body, path, (list, idx) => list.map((n, k) => (k === idx ? fn(n) : n)));

// ---- pruning (keep the tree structurally valid after edits) ----

const pruneNode = (n: ETree): ETree | null => {
  if (n.kind === "fixed" || n.kind === "wildcard" || n.kind === "alt") return n; // true leaves
  const kids = n.children.map(pruneNode).filter((x): x is ETree => x !== null);
  if (kids.length === 0) return null; // an emptied container (any / any order / optional / repeat) drops out
  return { ...n, children: kids };
};

export const prune = (body: ETree[]): ETree[] =>
  body.map(pruneNode).filter((x): x is ETree => x !== null);

// ---- edits ----

export const deleteAt = (body: ETree[], path: Path): ETree[] =>
  path.length === 0 ? body : prune(updateList(body, path, (list, idx) => list.filter((_, k) => k !== idx)));

// Move the element at `path` one step within its sibling list. Returns unchanged if at the edge.
export const moveAt = (body: ETree[], path: Path, dir: -1 | 1): ETree[] =>
  path.length === 0
    ? body
    : updateList(body, path, (list, idx) => {
        const j = idx + dir;
        if (j < 0 || j >= list.length) return list;
        const copy = [...list];
        [copy[idx], copy[j]] = [copy[j], copy[idx]];
        return copy;
      });

export const canMove = (body: ETree[], path: Path, dir: -1 | 1): boolean => {
  if (path.length === 0) return false;
  const parent = path.length === 1 ? body : getAt(body, path.slice(0, -1))?.children;
  const idx = path[path.length - 1];
  if (!parent) return false;
  const j = idx + dir;
  return j >= 0 && j < parent.length;
};

// A sequence container the shift can descend into / pop out of (anyOf holds only alts — it's opaque).
const isSeqContainer = (n: ETree | null | undefined): boolean =>
  n?.kind === "anyOrder" || n?.kind === "optional" || n?.kind === "repeat";

// Shift the element at `path` one COLUMN in direction `dir` through the notation, crossing structure so
// every click moves it the same visual distance regardless of nesting depth:
//   • adjacent leaf (or an `anyOf`, treated as one opaque slot) → swap places with it;
//   • adjacent sequence container → descend in, becoming its first (▶) / last (◀) child;
//   • no neighbour (at the container's end) → pop up out of it, landing just after (▶) / before (◀) it.
// At the root edge (or an alt at an `anyOf` edge) it's a no-op. Returns the new body + the element's new
// path. An emptied container is dropped (the element takes its place), so a shift is not always reversible.
export const shiftAt = (body: ETree[], path: Path, dir: -1 | 1): { body: ETree[]; path: Path } => {
  if (path.length === 0) return { body, path };
  const parentPath = path.slice(0, -1);
  const i = path[path.length - 1];
  const parent = parentPath.length ? getAt(body, parentPath) : null;
  const siblings = parent ? parent.children : body;
  const el = siblings[i];
  const j = i + dir;

  // edit the child-list at `containerPath` ([] = the top-level body)
  const editList = (containerPath: Path, fn: (list: ETree[]) => ETree[]): ETree[] =>
    containerPath.length === 0 ? fn(body) : updateNode(body, containerPath, (n) => ({ ...n, children: fn(n.children) }));

  if (j >= 0 && j < siblings.length) {
    const neighbor = siblings[j];
    if (isSeqContainer(neighbor)) {
      // descend into the neighbour, entering from the near end
      const pos = dir === 1 ? 0 : neighbor.children.length;
      const next = editList(parentPath, (list) =>
        list
          .map((n, k) => (k === j ? { ...n, children: [...n.children.slice(0, pos), el, ...n.children.slice(pos)] } : n))
          .filter((_, k) => k !== i),
      );
      return { body: next, path: [...parentPath, dir === 1 ? j - 1 : j, pos] }; // removing i shifts a right neighbour left by one
    }
    // swap past a leaf / an opaque `anyOf` / an adjacent alt
    const next = editList(parentPath, (list) => {
      const c = [...list];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    return { body: next, path: [...parentPath, j] };
  }

  // at the list's end — pop up out of the container (only a sequence container releases a child)
  if (!isSeqContainer(parent)) return { body, path };
  const grandPath = parentPath.slice(0, -1);
  const parentIdx = parentPath[parentPath.length - 1];
  const remaining = siblings.filter((_, k) => k !== i);
  if (remaining.length === 0) {
    // container emptied → drop it; the element takes its slot
    return { body: editList(grandPath, (glist) => [...glist.slice(0, parentIdx), el, ...glist.slice(parentIdx + 1)]), path: [...grandPath, parentIdx] };
  }
  const insertPos = dir === 1 ? parentIdx + 1 : parentIdx;
  const next = editList(grandPath, (glist) => {
    const updated = glist.map((n, k) => (k === parentIdx ? { ...n, children: remaining } : n));
    return [...updated.slice(0, insertPos), el, ...updated.slice(insertPos)];
  });
  return { body: next, path: [...grandPath, insertPos] };
};

export const canShift = (body: ETree[], path: Path, dir: -1 | 1): boolean => {
  if (path.length === 0) return false;
  const parentPath = path.slice(0, -1);
  const parent = parentPath.length ? getAt(body, parentPath) : null;
  const siblings = parent ? parent.children : body;
  const j = path[path.length - 1] + dir;
  if (j >= 0 && j < siblings.length) return true; // swap or descend
  return isSeqContainer(parent); // pop out (root edge / anyOf edge → false)
};

// Append `el` into the container at `path` (anyOf/anyOrder). No-op if not a container.
export const addInto = (body: ETree[], path: Path, el: ETree): ETree[] =>
  updateNode(body, path, (n) => (isContainer(n) ? { ...n, children: [...n.children, el] } : n));

export const addTop = (body: ETree[], el: ETree): ETree[] => [...body, el];

// Insert `el` immediately AFTER the element at `path` (as its next sibling). Empty path → append to top.
export const insertAfter = (body: ETree[], path: Path, el: ETree): ETree[] =>
  path.length === 0
    ? [...body, el]
    : updateList(body, path, (list, idx) => [...list.slice(0, idx + 1), el, ...list.slice(idx + 1)]);

// The kind of the list that CONTAINS `path` ("root", or the parent node's kind) — e.g. to know whether
// a sibling-insert lands inside an `anyOf` (which only accepts `alt`s).
export const parentKind = (body: ETree[], path: Path): EKind | "root" =>
  path.length <= 1 ? "root" : getAt(body, path.slice(0, -1))?.kind ?? "root";

export type WrapKind = "optional" | "repeat" | "anyOrder" | "anyOf";

// Wrap the node at `path` in a group (creates nesting). `anyOf` only wraps a plain emote (turning it
// into the first alternative); other groups wrap any node. An `alt` (anyOf member) can't be wrapped.
export const wrapAt = (body: ETree[], path: Path, kind: WrapKind): ETree[] =>
  updateNode(body, path, (n) => {
    if (n.kind === "alt") return n;
    if (kind === "anyOf")
      return n.kind === "fixed" ? { kind: "anyOf", children: [{ kind: "alt", sym: n.sym, children: [] }] } : n;
    return { kind, ...(kind === "repeat" ? { min: 1, max: 2 } : {}), children: [n] };
  });

// Can `kind` wrap the node at `path`? (anyOf needs a plain emote; an alt can't be wrapped.)
export const canWrap = (body: ETree[], path: Path, kind: WrapKind): boolean => {
  const n = getAt(body, path);
  if (!n || n.kind === "alt") return false;
  return kind === "anyOf" ? n.kind === "fixed" : true;
};

const isGroup = (n: ETree | null): boolean =>
  n?.kind === "optional" || n?.kind === "repeat" || n?.kind === "anyOrder" || n?.kind === "anyOf";

// Remove the container at `path` but KEEP its contents, splicing them up into the wrapper's place.
// (anyOf's `alt`s become plain emotes when lifted into a sequence context.)
export const unwrapAt = (body: ETree[], path: Path): ETree[] => {
  if (path.length === 0) return body;
  return prune(
    updateList(body, path, (list, idx) => {
      const lifted = list[idx].children.map((c) =>
        c.kind === "alt" ? ({ kind: "fixed", sym: c.sym, children: [] } as ETree) : c,
      );
      return [...list.slice(0, idx), ...lifted, ...list.slice(idx + 1)];
    }),
  );
};

// Can the node at `path` be unwrapped? Must be a group. Its lifted contents splice into the parent
// sequence — fine everywhere except inside an `anyOf`, which only holds emote alternatives.
export const canUnwrap = (body: ETree[], path: Path): boolean => {
  const n = getAt(body, path);
  if (!isGroup(n)) return false;
  return parentKind(body, path) !== "anyOf";
};

// ---- element constructors (for the add palette). New groups default to a single wildcard placeholder. ----

export const eFixed = (sym: string): ETree => ({ kind: "fixed", sym, children: [] });
export const eAlt = (sym: string): ETree => ({ kind: "alt", sym, children: [] });
export const eWildcard = (): ETree => ({ kind: "wildcard", children: [] });
export const eAny = (): ETree => ({ kind: "anyOf", children: [eAlt(WILDCARD)] });
export const eAnyOrder = (): ETree => ({ kind: "anyOrder", children: [eWildcard()] });
export const eOptional = (): ETree => ({ kind: "optional", children: [eWildcard()] });
export const eRepeat = (): ETree => ({ kind: "repeat", min: 1, max: 2, children: [eWildcard()] });

// Set a repeat's bounds (clamped valid: 0 ≤ min ≤ max, max ≥ 1).
export const setRepeatBounds = (body: ETree[], path: Path, min: number, max: number): ETree[] => {
  const lo = Math.max(0, Math.round(min));
  const hi = Math.max(1, lo, Math.round(max));
  return updateNode(body, path, (n) => (n.kind === "repeat" ? { ...n, min: lo, max: hi } : n));
};
