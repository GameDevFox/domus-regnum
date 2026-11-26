import { describe, expect, it } from "vitest";

import { layout } from "./pattern-layout";
import {
  addInto,
  addTop,
  canMove,
  canUnwrap,
  canWrap,
  deleteAt,
  eAlt,
  eAny,
  eAnyOrder,
  eFixed,
  eOptional,
  eRepeat,
  eWildcard,
  type ETree,
  getAt,
  insertAfter,
  moveAt,
  canShift,
  parentKind,
  type Path,
  setRepeatBounds,
  shiftAt,
  toAstList,
  toEList,
  unwrapAt,
  wrapAt,
} from "./pattern-edit";
import { type NotatedPattern, type PatternNode } from "./pattern-notation";

// ---- seeded RNG (reproducible failures) ----
const mkRng = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
};
const pick = <T>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const int = (rng: () => number, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const EMOTES = ["🥄", "☕", "🟫", "🫖", "🍰"];

// ---- random valid AST ----
const randomNode = (rng: () => number, budget: number): PatternNode => {
  const kinds = budget <= 0 ? ["fixed", "wildcard"] : ["fixed", "wildcard", "anyOf", "anyOrder", "optional", "repeat"];
  switch (pick(rng, kinds)) {
    case "fixed":
      return { kind: "fixed", symbol: pick(rng, EMOTES) };
    case "wildcard":
      return { kind: "wildcard" };
    case "anyOf":
      return { kind: "anyOf", symbols: Array.from({ length: int(rng, 1, 3) }, () => pick(rng, EMOTES)) };
    case "anyOrder":
      return { kind: "anyOrder", nodes: Array.from({ length: int(rng, 2, 3) }, () => randomNode(rng, budget - 1)) };
    case "optional":
      return { kind: "optional", nodes: Array.from({ length: int(rng, 1, 3) }, () => randomNode(rng, budget - 1)) };
    default: {
      const min = int(rng, 0, 2);
      return {
        kind: "repeat",
        nodes: Array.from({ length: int(rng, 1, 3) }, () => randomNode(rng, budget - 1)),
        min,
        max: int(rng, Math.max(1, min), Math.max(1, min) + 2),
      };
    }
  }
};
const randomPattern = (rng: () => number): NotatedPattern => ({
  id: "f",
  intent: "f",
  nodes: Array.from({ length: int(rng, 1, 4) }, () => randomNode(rng, 3)),
});

// ---- AST reference walks (independent of layout) ----
const leafPaths = (nodes: PatternNode[], base: Path = []): Path[] =>
  nodes.flatMap((n, i) => leafPathsOf(n, [...base, i]));
const leafPathsOf = (n: PatternNode, path: Path): Path[] => {
  switch (n.kind) {
    case "fixed":
    case "wildcard":
      return [path];
    case "anyOf":
      return n.symbols.map((_, i) => [...path, i]);
    case "optional":
    case "repeat":
    case "anyOrder":
      return n.nodes.flatMap((c, i) => leafPathsOf(c, [...path, i]));
  }
};
const containerPaths = (nodes: PatternNode[], base: Path = []): Path[] =>
  nodes.flatMap((n, i) => containerPathsOf(n, [...base, i]));
const containerPathsOf = (n: PatternNode, path: Path): Path[] => {
  switch (n.kind) {
    case "anyOf":
      return [path];
    case "optional":
    case "repeat":
    case "anyOrder":
      return [path, ...n.nodes.flatMap((c, i) => containerPathsOf(c, [...path, i]))];
    default:
      return [];
  }
};

const key = (p: Path) => p.join(".");
const isPrefix = (a: Path, b: Path) => a.length < b.length && a.every((v, i) => v === b[i]);
const eqPath = (a: Path, b: Path) => a.length === b.length && a.every((v, i) => v === b[i]);
const sortKeys = (ps: Path[]) => ps.map(key).sort();

// ---- LAYOUT invariants ----
describe("layout — fuzz invariants (leaf/container coverage)", () => {
  it("every leaf is one column, every group is one span, ranges nest & cover correctly", () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const rng = mkRng(seed);
      const pat = randomPattern(rng);
      const { cols, spans } = layout(pat);
      const ctx = `seed ${seed}: ${JSON.stringify(pat.nodes)}`;

      // 1. columns ↔ AST leaves, exactly (same set, no dupes/missing)
      expect(sortKeys(cols.map((c) => c.path)), `cols vs leaves — ${ctx}`).toEqual(sortKeys(leafPaths(pat.nodes)));
      // 2. spans ↔ AST containers, exactly
      expect(sortKeys(spans.map((s) => s.path)), `spans vs containers — ${ctx}`).toEqual(sortKeys(containerPaths(pat.nodes)));

      for (const s of spans) {
        // 3. well-formed range inside bounds
        expect(s.from <= s.to && s.from >= 0 && s.to < cols.length, `span range — ${ctx} ${key(s.path)}`).toBe(true);
        // 4. a span's [from,to] EXACTLY covers the columns whose path descends from it
        const covered = cols.map((c, i) => ({ i, under: eqPath(c.path, s.path) || isPrefix(s.path, c.path) })).filter((x) => x.under).map((x) => x.i);
        expect([Math.min(...covered), Math.max(...covered)], `span coverage — ${ctx} ${key(s.path)}`).toEqual([s.from, s.to]);
        expect(covered.length, `span contiguity — ${ctx}`).toBe(s.to - s.from + 1);
      }
      // 5. no partial overlaps between spans (tree projection → disjoint or nested)
      for (const a of spans)
        for (const b of spans) {
          if (a === b) continue;
          const disjoint = a.to < b.from || b.to < a.from;
          const nested = (a.from <= b.from && a.to >= b.to) || (b.from <= a.from && b.to >= a.to);
          expect(disjoint || nested, `overlap — ${ctx} [${a.from},${a.to}] vs [${b.from},${b.to}]`).toBe(true);
        }
    }
  });
});

// ---- editor-tree helpers ----
const allPaths = (body: ETree[], base: Path = []): Path[] =>
  body.flatMap((n, i) => [[...base, i], ...allPaths(n.children, [...base, i])]);
const countKinds = (body: ETree[]): Record<string, number> => {
  const c: Record<string, number> = {};
  const walk = (list: ETree[]) => list.forEach((n) => ((c[n.kind] = (c[n.kind] ?? 0) + 1), walk(n.children)));
  walk(body);
  return c;
};
const randElement = (rng: () => number): ETree =>
  pick(rng, [eFixed(pick(rng, EMOTES)), eWildcard(), eAny(), eAnyOrder(), eOptional(), eRepeat()]);
// Every leaf's identity (emote / wildcard / alt), sorted — shifting only relocates leaves, never
// creates/destroys them, so this multiset is invariant across any number of shifts.
const leafBag = (body: ETree[]): string[] => {
  const out: string[] = [];
  const walk = (list: ETree[]) =>
    list.forEach((n) =>
      n.kind === "fixed" || n.kind === "alt" ? out.push(`${n.kind}:${n.sym}`) : n.kind === "wildcard" ? out.push("wild") : walk(n.children),
    );
  walk(body);
  return out.sort();
};
// Structural validity = the ETree is SELF-CONSISTENT: it equals its own normalized form. This catches
// hidden malformed structure that the AST projection would silently mask — e.g. a unary optional/repeat
// with 2 children (toAst reads only child[0], hiding the second) that prune would later drop wholesale.
const assertValid = (body: ETree[], ctx: string) => {
  expect(() => toAstList(body), `toAst threw — ${ctx}`).not.toThrow();
  expect(JSON.stringify(body), `ETree not self-consistent — ${ctx}`).toBe(JSON.stringify(toEList(toAstList(body))));
};

// ---- OPS invariants ----
describe("edit ops — fuzz invariants", () => {
  it("random op sequences keep the tree valid; moves conserve every node", () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const rng = mkRng(seed);
      let body = toEList(randomPattern(rng).nodes);
      assertValid(body, `seed ${seed} init`);

      for (let step = 0; step < 40; step++) {
        const paths = allPaths(body);
        if (paths.length === 0) {
          // body emptied (a delete pruned everything) — reseed with an element and continue
          body = addTop(body, eFixed(pick(rng, EMOTES)));
          assertValid(body, `seed ${seed} step ${step} reseed`);
          continue;
        }
        const before = JSON.stringify(toAstList(body));
        const op = pick(rng, ["addTop", "addInto", "insertAfter", "move", "wrap", "unwrap", "delete", "repeat"]);
        const ctx = `seed ${seed} step ${step} op ${op}: ${before}`;

        if (op === "move") {
          const cands = paths.filter((p) => canMove(body, p, -1) || canMove(body, p, 1));
          if (!cands.length) continue;
          const p = pick(rng, cands);
          const dir: -1 | 1 = canMove(body, p, 1) ? 1 : -1;
          const kindsBefore = countKinds(body);
          const moved = moveAt(body, p, dir);
          // a shift must NEVER add/remove/duplicate any node (the reported "wrappers appear/disappear")
          expect(countKinds(moved), `move changed node counts — ${ctx}`).toEqual(kindsBefore);
          // and it must be reversible
          const backPath = [...p.slice(0, -1), p[p.length - 1] + dir];
          expect(JSON.stringify(toAstList(moveAt(moved, backPath, (-dir) as -1 | 1))), `move not reversible — ${ctx}`).toBe(before);
          body = moved;
        } else if (op === "wrap") {
          const kind = pick(rng, ["optional", "repeat", "anyOrder", "anyOf"] as const);
          const p = pick(rng, paths);
          if (!canWrap(body, p, kind)) continue;
          body = canWrap(body, p, kind) ? wrapAtChecked(body, p, kind) : body;
        } else if (op === "unwrap") {
          const cands = paths.filter((p) => canUnwrap(body, p));
          if (!cands.length) continue;
          body = deleteWrapKeep(body, pick(rng, cands));
        } else if (op === "delete") {
          if (paths.length <= 1) continue;
          body = deleteAt(body, pick(rng, paths));
        } else if (op === "repeat") {
          const reps = paths.filter((p) => getAt(body, p)?.kind === "repeat");
          if (!reps.length) continue;
          body = setRepeatBounds(body, pick(rng, reps), int(rng, 0, 3), int(rng, 1, 4));
        } else if (op === "addTop") {
          body = addTop(body, randElement(rng));
        } else if (op === "addInto") {
          // every container holds a sequence now (any / any order / optional / repeat); anyOf takes alts
          const conts = paths.filter((p) => {
            const k = getAt(body, p)?.kind;
            return k === "anyOrder" || k === "anyOf" || k === "optional" || k === "repeat";
          });
          if (!conts.length) continue;
          const p = pick(rng, conts);
          body = addInto(body, p, getAt(body, p)!.kind === "anyOf" ? eAlt(pick(rng, EMOTES)) : randElement(rng));
        } else if (op === "insertAfter") {
          // a sibling can now land in ANY sequence (no unary containers left); anyOf lists take alts
          const p = pick(rng, paths);
          body = insertAfter(body, p, parentKind(body, p) === "anyOf" ? eAlt(pick(rng, EMOTES)) : randElement(rng));
        }
        assertValid(body, ctx);
      }
    }
  });
});

// small wrappers that also assert wrap/unwrap change counts by exactly one group
const wrapAtChecked = (body: ETree[], p: Path, kind: "optional" | "repeat" | "anyOrder" | "anyOf"): ETree[] => {
  const after = wrapAt(body, p, kind);
  const b = countKinds(body);
  const a = countKinds(after);
  expect((a[kind] ?? 0) - (b[kind] ?? 0), `wrap added != 1 ${kind}`).toBe(1);
  return after;
};
const deleteWrapKeep = (body: ETree[], p: Path): ETree[] => {
  const before = getAt(body, p)!;
  const after = unwrapAt(body, p);
  // unwrapping a group removes exactly that one group and lifts its contents — nothing else vanishes
  const got = (countKinds(after)[before.kind] ?? 0) - (countKinds(body)[before.kind] ?? 0);
  expect(got, `unwrap should remove exactly one ${before.kind}: ${JSON.stringify(toAstList(body))}`).toBe(-1);
  return after;
};

// ---- SHIFT traversal invariants ----
describe("shiftAt — fuzz traversal invariants", () => {
  it("following the returned path across many shifts carries the element intact & conserves leaves", () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const rng = mkRng(seed);
      let body = toEList(randomPattern(rng).nodes);
      const bag = leafBag(body);
      // track one element by its returned path; its subtree must stay byte-for-byte identical throughout
      let path = pick(rng, allPaths(body));
      const tracked = JSON.stringify(getAt(body, path));

      for (let step = 0; step < 30; step++) {
        const dir: -1 | 1 = pick(rng, [-1, 1]);
        const ctx = `seed ${seed} step ${step} dir ${dir}: ${JSON.stringify(toAstList(body))} @ ${path.join(".")}`;
        const movable = canShift(body, path, dir);
        const r = shiftAt(body, path, dir);

        if (!movable) {
          // canShift and shiftAt must agree: no move means the body is untouched
          expect(JSON.stringify(r.body), `no-op mismatch — ${ctx}`).toBe(JSON.stringify(body));
        }
        assertValid(r.body, ctx);
        expect(leafBag(r.body), `leaves not conserved — ${ctx}`).toEqual(bag);
        expect(JSON.stringify(getAt(r.body, r.path)), `tracked element changed — ${ctx}`).toBe(tracked);
        body = r.body;
        path = r.path;
      }
    }
  });
});
