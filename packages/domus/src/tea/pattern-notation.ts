// The 2-D "emote regex" pattern notation — see docs/design/cue-reading-system.md.
//
// A pattern is an ordered list of nodes. Most modifiers (any / any-order / optional / repeat / anchors)
// are *structural* and get drawn above/below the emote row by <PatternNotation>; only the wildcard reads
// naturally inline. `enumerate` expands a (finite) pattern to the full set of valid sequences — the
// source of truth for "which combinations are valid." Pure + deterministic.

import type { CueSymbol } from "./cues";

export type PatternNode =
  | { kind: "fixed"; symbol: CueSymbol } // one exact emote
  | { kind: "anyOf"; symbols: CueSymbol[] } // exactly one of these (regex char-class)
  | { kind: "wildcard" } // any single emote (regex `.`)
  | { kind: "optional"; nodes: PatternNode[] } // the whole sequence may be omitted — regex `(…)?`
  | { kind: "repeat"; nodes: PatternNode[]; min: number; max: number } // the sequence, min..max times — regex `(…){m,n}`
  | { kind: "anyOrder"; nodes: PatternNode[] }; // all must appear, in any order

export type NotatedPattern = {
  id: string;
  intent: string;
  nodes: PatternNode[];
  startAnchored?: boolean; // regex `^`
  endAnchored?: boolean; // regex `$`
};

export const WILDCARD = "∗"; // sentinel used in enumeration output for a wildcard slot

// Bracket label for a bounded repeat: "×3" when fixed, "×2–4" for a range.
export const repeatLabel = (min: number, max: number): string => (min === max ? `×${min}` : `×${min}–${max}`);

// Cartesian concat: given per-position option-lists (each option a symbol[]), all concatenations.
const product = (groups: CueSymbol[][][]): CueSymbol[][] =>
  groups.reduce<CueSymbol[][]>(
    (acc, options) => acc.flatMap((prefix) => options.map((opt) => [...prefix, ...opt])),
    [[]],
  );

const permutations = <T>(xs: T[]): T[][] =>
  xs.length <= 1
    ? [xs]
    : xs.flatMap((x, i) =>
        permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]),
      );

// All renderings of an ordered node sequence (each a symbol list).
const expandSeq = (nodes: PatternNode[]): CueSymbol[][] => product(nodes.map(expandNode));

// All renderings of a single node (each a symbol list; `[]` = the node contributed nothing).
const expandNode = (node: PatternNode): CueSymbol[][] => {
  switch (node.kind) {
    case "fixed":
      return [[node.symbol]];
    case "anyOf":
      return node.symbols.map((s) => [s]);
    case "wildcard":
      return [[WILDCARD]];
    case "optional":
      return [[], ...expandSeq(node.nodes)];
    case "repeat": {
      const one = expandSeq(node.nodes);
      const out: CueSymbol[][] = [];
      for (let n = node.min; n <= node.max; n++) {
        let cur: CueSymbol[][] = [[]];
        for (let k = 0; k < n; k++) cur = product([cur, one]);
        out.push(...cur);
      }
      return out;
    }
    case "anyOrder":
      return permutations(node.nodes).flatMap((perm) => product(perm.map(expandNode)));
  }
};

// The full set of valid sequences for a pattern (capped — repeats are otherwise unbounded).
export const enumerate = (pattern: NotatedPattern, cap = 64): CueSymbol[][] =>
  product(pattern.nodes.map(expandNode)).slice(0, cap);

// ---- Compact JSON form (authoring/storage) ----
// A pattern serializes to a JSON ARRAY: plain emote strings = fixed elements; objects = dynamic parts;
// the sentinels "^"/"$" as first/last elements = start/end anchors. See docs/design/cue-reading-system.md.
//   ["🥄","☕"]                          fixed
//   ["🥄",{"anyOrder":["☕","🟫"]}]       any order
//   ["🥄",{"any":["☕","🟫"]}]            any one of
//   ["🥄",{"optional":"☕"},"🟫"]         optional
//   ["🥄",{"wildcard":true}]             wildcard
//   ["🥄",{"repeat":"☕","min":1}]        one-or-more

type CompactEl =
  | string
  | { any: string[] }
  | { anyOrder: CompactEl[] }
  | { optional: CompactEl | CompactEl[] }
  | { wildcard: true }
  | { repeat: CompactEl | CompactEl[]; min?: number; max?: number };

// A one-element sequence serializes to the bare element (compact + backward-compatible with the old
// single-child form); multi-element sequences serialize to an array.
const serializeSeq = (nodes: PatternNode[]): CompactEl | CompactEl[] =>
  nodes.length === 1 ? serializeNode(nodes[0]) : nodes.map(serializeNode);

const serializeNode = (n: PatternNode): CompactEl => {
  switch (n.kind) {
    case "fixed":
      return n.symbol;
    case "anyOf":
      return { any: n.symbols };
    case "wildcard":
      return { wildcard: true };
    case "optional":
      return { optional: serializeSeq(n.nodes) };
    case "repeat":
      return { repeat: serializeSeq(n.nodes), min: n.min, max: n.max };
    case "anyOrder":
      return { anyOrder: n.nodes.map(serializeNode) };
  }
};

export const serializePattern = (pattern: NotatedPattern): string => {
  const arr: CompactEl[] = pattern.nodes.map(serializeNode);
  if (pattern.startAnchored) arr.unshift("^");
  if (pattern.endAnchored) arr.push("$");
  return JSON.stringify(arr, null, 2);
};

export type ParseResult = { ok: true; pattern: NotatedPattern } | { ok: false; error: string };

const parseNode = (el: unknown): PatternNode => {
  if (typeof el === "string") {
    if (el === "^" || el === "$") throw new Error("'^'/'$' anchors are only allowed as the first/last element");
    if (el.length === 0) throw new Error("empty emote");
    return { kind: "fixed", symbol: el };
  }
  if (el && typeof el === "object") {
    const o = el as Record<string, unknown>;
    if (Array.isArray(o.any)) {
      if (o.any.length === 0 || !o.any.every((s) => typeof s === "string")) throw new Error("'any' needs a non-empty list of emotes");
      return { kind: "anyOf", symbols: o.any as string[] };
    }
    if (Array.isArray(o.anyOrder)) {
      if (o.anyOrder.length === 0) throw new Error("'anyOrder' needs at least one member");
      return { kind: "anyOrder", nodes: o.anyOrder.map(parseNode) };
    }
    // optional/repeat wrap an ordered SEQUENCE; accept a bare element (old form) or an array.
    if ("optional" in o) {
      const seq = Array.isArray(o.optional) ? o.optional : [o.optional];
      if (seq.length === 0) throw new Error("'optional' needs at least one element");
      return { kind: "optional", nodes: seq.map(parseNode) };
    }
    if (o.wildcard === true) return { kind: "wildcard" };
    if ("repeat" in o) {
      // BOUNDED only: min defaults to 1, max defaults to min (a fixed count). 0 ≤ min ≤ max, max ≥ 1.
      const min = o.min === undefined ? 1 : o.min;
      const max = o.max === undefined ? min : o.max;
      if (
        typeof min !== "number" ||
        typeof max !== "number" ||
        !Number.isInteger(min) ||
        !Number.isInteger(max) ||
        min < 0 ||
        max < min ||
        max < 1
      )
        throw new Error("'repeat' must be bounded: integer min/max with 0 ≤ min ≤ max and max ≥ 1");
      const seq = Array.isArray(o.repeat) ? o.repeat : [o.repeat];
      if (seq.length === 0) throw new Error("'repeat' needs at least one element");
      return { kind: "repeat", nodes: seq.map(parseNode), min, max };
    }
  }
  throw new Error("unrecognized pattern element");
};

// Parse the compact JSON form into a NotatedPattern, or report why it's invalid.
export const parsePattern = (json: string, id = "custom", intent = "Custom"): ParseResult => {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "not valid JSON" };
  }
  if (!Array.isArray(raw)) return { ok: false, error: "pattern must be a JSON array" };
  let startAnchored = false;
  let endAnchored = false;
  const body = raw.slice();
  if (body[0] === "^") {
    startAnchored = true;
    body.shift();
  }
  if (body[body.length - 1] === "$") {
    endAnchored = true;
    body.pop();
  }
  if (body.length === 0) return { ok: false, error: "pattern is empty" };
  try {
    const nodes = body.map(parseNode);
    return { ok: true, pattern: { id, intent, nodes, startAnchored, endAnchored } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid pattern" };
  }
};

// Whether enumerate lists ALL valid sequences. Now always true — `repeat` is bounded, so no node is
// unbounded — but kept as the single point of truth in case an unbounded node is ever added.
export const isFinite_ = (pattern: NotatedPattern): boolean => {
  const finite = (n: PatternNode): boolean =>
    n.kind === "repeat" || n.kind === "optional" || n.kind === "anyOrder" ? n.nodes.every(finite) : true;
  return pattern.nodes.every(finite);
};
