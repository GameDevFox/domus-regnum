import { Measure, Opening, resolveMeasure } from "../types";
import { MIN_SEGMENT_M } from "./constants";

// Pure math for wall openings (holes that doors/windows fill). Two halves:
//
//   1. Measure resolution — a value relative to a parent length is `{scale, offset}`, resolved
//      as `scale·L + offset` (types.ts `Measure`). UNCLAMPED by design (negative and >1 scales
//      are legal — overhang semantics). A hole is `pos` (its CENTER along the side) + `size`
//      (its width), two Measures total, so a door can scale with its wall ({0.15, 0}), stay
//      fixed ({0, 0.9}), or hug an end ({1, -(margin + width/2)}).
//
//   2. Run splitting — subtract the resolved hole ranges from a side's extent and lay the
//      remaining stretches back onto the cell grid as wall-run segments (cell + span + end
//      trims), the same trim machinery the corner posts already use. Texture continuity falls
//      out: a segment's u-start equals its circuit coordinate (front face anchors at
//      `startCell·tile` so `runStart + trimStart` = the segment's world start; the back face
//      anchors mirror-wise via `trimEnd`).


// Resolve an opening to its [start, end] range along a side of length L (pos = center).
// Returns null for degenerate or fully-outside holes; clamps partial overhangs to the side.
const MIN_HOLE = 0.05; // narrower than this is a crack, not an opening
export const resolveOpening = (
  pos: Measure,
  size: Measure,
  length: number,
): [number, number] | null => {
  const center = resolveMeasure(pos, length);
  const width = resolveMeasure(size, length);
  if (width < MIN_HOLE) return null;
  const start = Math.max(0, center - width / 2);
  const end = Math.min(length, center + width / 2);
  return end - start < MIN_HOLE ? null : [start, end];
};

// Sort + merge overlapping/touching ranges (two doors sharing wall space become one gap).
export const mergeRanges = (ranges: [number, number][]): [number, number][] => {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  sorted.forEach(([s, e]) => {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  });
  return out;
};

// One wall-run segment between holes: covers cells [startCell, startCell + span) along the
// side, with end trims shaving the mesh back to the exact world extent [start, end].
export type RunSegment = {
  startCell: number; // cell index along the side (0 = the side's first cell)
  span: number; // covered cells (integer ≥ 1)
  trimStart: number; // meters shaved off the −run end
  trimEnd: number; // meters shaved off the +run end
  start: number; // world extent along the side (= startCell·tile + trimStart)
  end: number;
};

// Split a side of length L into wall segments around `holes` (resolved, merged ranges). The
// side's end trims (the corner-post pull-backs — passed PER END, since a killed corner un-trims
// its end so the run extends to the vertex) shrink the buildable extent first — unless a hole
// already swallows that end. Segments snap to covering cells; the trims carry the exact
// geometry, so nav blocking stays per-edge (a partially-walled edge still blocks — agents
// don't squeeze past half a wall) while fully-open cells go passable.
export const splitRuns = (
  L: number,
  holes: [number, number][],
  startTrim: number,
  endTrim: number,
  tile: number,
): RunSegment[] => {
  const merged = mergeRanges(holes.filter(([s, e]) => e > s));
  const lo = 0 + startTrim;
  const hi = L - endTrim;
  const segments: RunSegment[] = [];
  let cursor = lo;
  const emit = (gs: number, ge: number) => {
    if (ge - gs < MIN_SEGMENT_M) return; // sliver between holes — not worth a mesh
    const eps = 1e-9;
    const startCell = Math.max(0, Math.floor(gs / tile + eps));
    const endCell = Math.min(Math.round(L / tile), Math.ceil(ge / tile - eps));
    segments.push({
      startCell,
      span: endCell - startCell,
      trimStart: gs - startCell * tile,
      trimEnd: endCell * tile - ge,
      start: gs,
      end: ge,
    });
  };
  merged.forEach(([hs, he]) => {
    emit(cursor, Math.min(hs, hi));
    cursor = Math.max(cursor, he);
  });
  emit(cursor, hi);
  return segments;
};

// A side's resolved holes PLUS whether any of them touch the side's ends — the corner rule
// (decided 2026-06-12): a hole whose UNCLAMPED extent reaches a vertex (flush counts) removes
// that corner's post, regardless of which node supplied the opening (bare hole, door, window).
export type SideHoles = {
  ranges: [number, number][]; // clamped + merged, for run splitting
  touchesStart: boolean; // some hole reaches the side's start vertex
  touchesEnd: boolean; // …or its end vertex
};

const TOUCH_EPS = 1e-6;

// Resolve a node's `holes` prop value (an array of opening specs, in whatever shape bindings
// delivered them) for one side. `side === null` skips the side filter (the two-point `wall`
// has no sides — every opening applies along its run). Tolerant of malformed entries — a bad
// spec is skipped, never thrown (matching the evaluator's conventions).
export const resolveSideHoles = (
  specs: unknown,
  side: string | null,
  length: number,
): SideHoles => {
  // A single binding delivers one Opening object; literals/multi-bindings deliver arrays.
  const list = Array.isArray(specs) ? specs : specs != null ? [specs] : [];
  const ranges: [number, number][] = [];
  let touchesStart = false;
  let touchesEnd = false;
  list.forEach((raw) => {
    const o = raw as Partial<Opening> | null;
    if (!o || (side !== null && o.side !== side) || !o.pos || !o.size) return;
    if (typeof o.pos.scale !== "number" || typeof o.pos.offset !== "number") return;
    if (typeof o.size.scale !== "number" || typeof o.size.offset !== "number") return;
    const r = resolveOpening(o.pos, o.size, length);
    if (!r) return;
    ranges.push(r);
    // Touch tests use the UNCLAMPED extent (center ± width/2).
    const center = resolveMeasure(o.pos as Measure, length);
    const half = resolveMeasure(o.size as Measure, length) / 2;
    if (center - half <= TOUCH_EPS) touchesStart = true;
    if (center + half >= length - TOUCH_EPS) touchesEnd = true;
  });
  return { ranges: mergeRanges(ranges), touchesStart, touchesEnd };
};
