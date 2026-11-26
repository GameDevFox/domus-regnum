// Pure layout for the 2-D notation: flattens a NotatedPattern into emote COLUMNS + group SPANS
// (brackets), each carrying its tree `path` (matching the editor's ETree indices). Extracted from
// PatternNotation.tsx so it can be fuzz-tested independently of rendering.

import { type Path } from "./pattern-edit";
import { type NotatedPattern, type PatternNode, repeatLabel } from "./pattern-notation";

export { type Path } from "./pattern-edit"; // re-export — one Path type, one home
export type Col = { sym?: string; wild?: boolean; path: Path };
export type Span = { from: number; to: number; label: string; place: "above" | "below"; path: Path };

// Lay out an ordered node sequence: each child at `[...path, i]`, its spans offset by the running column
// count so every column/span index is absolute within the returned block.
const layoutSeq = (nodes: PatternNode[], path: Path): { cols: Col[]; spans: Span[] } => {
  const cols: Col[] = [];
  const spans: Span[] = [];
  nodes.forEach((n, i) => {
    const l = layoutNode(n, [...path, i]);
    l.spans.forEach((sp) => spans.push({ ...sp, from: sp.from + cols.length, to: sp.to + cols.length }));
    cols.push(...l.cols);
  });
  return { cols, spans };
};

// Lay one node out into columns + relative spans, threading the tree path onto each (offsets applied by
// the caller). Paths mirror the editor's ETree indices (anyOf alternatives are children `[...path, i]`).
const layoutNode = (node: PatternNode, path: Path): { cols: Col[]; spans: Span[] } => {
  switch (node.kind) {
    case "fixed":
      return { cols: [{ sym: node.symbol, path }], spans: [] };
    case "wildcard":
      return { cols: [{ wild: true, path }], spans: [] };
    case "anyOf": {
      const cols: Col[] = node.symbols.map((s, i) => ({ sym: s, path: [...path, i] }));
      return { cols, spans: [{ from: 0, to: cols.length - 1, label: "any", place: "above", path }] };
    }
    case "optional": {
      const { cols, spans } = layoutSeq(node.nodes, path);
      return { cols, spans: [...spans, { from: 0, to: cols.length - 1, label: "optional", place: "below", path }] };
    }
    case "repeat": {
      const { cols, spans } = layoutSeq(node.nodes, path);
      return { cols, spans: [...spans, { from: 0, to: cols.length - 1, label: repeatLabel(node.min, node.max), place: "above", path }] };
    }
    case "anyOrder": {
      const { cols, spans } = layoutSeq(node.nodes, path);
      return { cols, spans: [...spans, { from: 0, to: cols.length - 1, label: "any order", place: "above", path }] };
    }
  }
};

export const layout = (pattern: NotatedPattern): { cols: Col[]; spans: Span[] } => layoutSeq(pattern.nodes, []);
