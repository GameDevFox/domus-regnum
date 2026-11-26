import { Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { CUE_GLYPH, EMOTE_POOL } from "./data";
import {
  addInto,
  addTop,
  canShift,
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
  parentKind,
  type Path,
  setRepeatBounds,
  shiftAt,
  toEList,
  toPattern,
  unwrapAt,
  wrapAt,
  type WrapKind,
} from "./pattern-edit";
import { enumerate, isFinite_, parsePattern, serializePattern, WILDCARD } from "./pattern-notation";
import { PatternNotation } from "./PatternNotation";

// Pattern Builder (/tea/builder). A structural TREE editor: click any node at any depth to select it,
// then delete / move ◀▶ / wrap it; add elements into the selected group or the top sequence. The JSON
// textarea is a two-way mirror (storage format in pattern-notation.ts). Tree state (`body`) is the
// source of truth for the buttons; the textarea re-syncs on valid edits.

// Wildcard first, then the curated emote pool (shared with the tea-party scene, see data.ts).
const PALETTE = [WILDCARD, ...EMOTE_POOL];
const DEFAULT_BODY: ETree[] = toEList([{ kind: "fixed", symbol: "🥄" }, { kind: "anyOrder", nodes: [{ kind: "fixed", symbol: "☕" }, { kind: "fixed", symbol: "🟫" }] }]);

const glyph = (sym?: string) => (sym === WILDCARD ? "✦" : (sym && CUE_GLYPH[sym]) || sym || "?");

export const PatternBuilder = () => {
  const [body, setBody] = useState<ETree[]>(DEFAULT_BODY);
  const [anchors, setAnchors] = useState({ start: false, end: false });
  const [sel, setSel] = useState<Path | null>(null);
  const [text, setText] = useState(() => serializePattern(toPattern(DEFAULT_BODY)));
  const [jsonValid, setJsonValid] = useState(true);
  const [showValid, setShowValid] = useState(true);
  const [wrapMode, setWrapMode] = useState(false); // when on, the next group button WRAPS the selection

  const selNode = sel ? getAt(body, sel) : null;

  // Commit a tree edit: update body + re-sync the JSON, keeping anchors.
  const commit = (next: ETree[], nextSel: Path | null = sel) => {
    setBody(next);
    setSel(nextSel && getAt(next, nextSel) ? nextSel : null);
    setText(serializePattern({ ...toPattern(next), startAnchored: anchors.start, endAnchored: anchors.end }));
    setJsonValid(true);
  };

  const onText = (raw: string) => {
    setText(raw);
    const r = parsePattern(raw);
    if (r.ok) {
      setBody(toEList(r.pattern.nodes));
      setAnchors({ start: !!r.pattern.startAnchored, end: !!r.pattern.endAnchored });
      setSel(null);
      setJsonValid(true);
    } else {
      setJsonValid(false);
    }
  };

  // ---- toolbar actions (operate on the selection) ----
  const del = () => sel && commit(deleteAt(body, sel), null);
  const unwrap = () => sel && commit(unwrapAt(body, sel), null); // drop the container, keep its contents
  // Shift one column through the structure (swaps / descends into / pops out of adjacent containers).
  const shift = (dir: -1 | 1) => {
    if (!sel || !canShift(body, sel, dir)) return;
    const r = shiftAt(body, sel, dir);
    commit(r.body, r.path);
  };
  // A group button either WRAPS the selection (wrap mode) or ADDS a new group (normal mode).
  const onPart = (kind: WrapKind, make: () => ETree) => {
    if (wrapMode) {
      if (sel && canWrap(body, sel, kind)) commit(wrapAt(body, sel, kind), sel);
      setWrapMode(false);
    } else addPart(make);
  };
  const partDisabled = (kind: WrapKind) => (wrapMode ? !sel || !canWrap(body, sel, kind) : partsBlocked);
  // Add an element relative to the selection: INTO it if it's a group (any / any order / optional /
  // repeat all hold a sequence), otherwise as a sibling to its RIGHT; with no selection, append to the
  // sequence. `altEl` is the anyOf-member form (only emotes have one) — parts can't live inside an `any`.
  const add = (el: ETree, altEl?: ETree) => {
    if (!sel) {
      commit(addTop(body, el), [body.length]);
      return;
    }
    if (selNode?.kind === "anyOf") {
      if (altEl) commit(addInto(body, sel, altEl), [...sel, selNode.children.length]);
      return; // a part can't go inside an `any`
    }
    if (selNode?.kind === "anyOrder" || selNode?.kind === "optional" || selNode?.kind === "repeat") {
      commit(addInto(body, sel, el), [...sel, selNode.children.length]); // append inside the group
      return;
    }
    // a leaf → insert as its next sibling (inside whatever sequence it lives in), respecting an `anyOf` parent
    const inAny = parentKind(body, sel) === "anyOf";
    if (inAny && !altEl) return;
    const nextPath = [...sel.slice(0, -1), sel[sel.length - 1] + 1];
    commit(insertAfter(body, sel, inAny ? altEl! : el), nextPath);
  };
  const addEmote = (sym: string) =>
    sym === WILDCARD ? add(eWildcard(), eAlt(WILDCARD)) : add(eFixed(sym), eAlt(sym));
  const addPart = (make: () => ETree) => add(make());

  const pattern = toPattern(body, { id: "custom", intent: "Custom" });
  const previewPattern = { ...pattern, startAnchored: anchors.start, endAnchored: anchors.end };
  const valid = body.length > 0 ? enumerate(previewPattern) : [];
  const finite = isFinite_(previewPattern);
  // Parts can't be added inside an `any` (it only holds emote alternatives) — block when the `any`
  // itself, or one of its alternatives, is selected.
  const partsBlocked = selNode?.kind === "anyOf" || (!!sel && parentKind(body, sel) === "anyOf");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pt-2">
      <p className="text-muted-foreground text-center text-sm">
        <strong>Pattern Builder</strong> — click any element (at any depth) to select it, then
        delete / move / wrap it. Add elements into the selected group, or to the sequence. Or edit the
        JSON directly.
      </p>

      {/* The notation IS the editor — click an emote or a group's bracket to select it. */}
      <div
        className="flex min-h-[5rem] items-center justify-center rounded-lg border bg-card/50 p-4"
        onClick={() => setSel(null)}
      >
        {body.length === 0 ? (
          <span className="text-muted-foreground text-sm">empty — add an element below</span>
        ) : (
          <PatternNotation pattern={previewPattern} selected={sel} onSelect={setSel} />
        )}
      </div>

      {/* Repeat bounds bar — appears under the view when a repeat is selected (repeats are BOUNDED). */}
      {sel && selNode?.kind === "repeat" && (
        <div className="border-border/60 bg-card/40 mx-auto flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
          <span className="text-muted-foreground">repeat the contents</span>
          <label className="flex items-center gap-1">
            min
            <input
              type="number"
              min={0}
              value={selNode.min ?? 1}
              onChange={(e) => commit(setRepeatBounds(body, sel, Number(e.target.value), selNode.max ?? 1), sel)}
              className="bg-card/60 w-14 rounded border px-1 py-0.5 tabular-nums"
            />
          </label>
          <label className="flex items-center gap-1">
            max
            <input
              type="number"
              min={1}
              value={selNode.max ?? 1}
              onChange={(e) => commit(setRepeatBounds(body, sel, selNode.min ?? 1, Number(e.target.value)), sel)}
              className="bg-card/60 w-14 rounded border px-1 py-0.5 tabular-nums"
            />
          </label>
          <span className="text-muted-foreground text-xs">
            {(selNode.min ?? 1) === (selNode.max ?? 1) ? `exactly ${selNode.min ?? 1}×` : `${selNode.min ?? 1}–${selNode.max ?? 1}×`}
          </span>
        </div>
      )}

      {/* Selection toolbar — three clusters spread across the width: shift ◀▶ · structure (Wrap/Unwrap) · destructive (Delete/Clear) */}
      <div className="flex flex-col gap-1">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button size="sm" variant="secondary" disabled={!sel || !canShift(body, sel, -1)} onClick={() => shift(-1)}>
              ◀
            </Button>
            <Button size="sm" variant="secondary" disabled={!sel || !canShift(body, sel, 1)} onClick={() => shift(1)}>
              ▶
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={wrapMode ? "default" : "secondary"}
              disabled={!sel || selNode?.kind === "alt"}
              onClick={() => setWrapMode((w) => !w)}
            >
              Wrap
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="text-red-400"
              disabled={!sel || !canUnwrap(body, sel)}
              onClick={unwrap}
            >
              <Trash2 className="mr-1 size-4" /> Unwrap
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="secondary" className="text-red-400" disabled={!sel} onClick={del} aria-label="Delete">
              <Trash2 className="size-4" />
            </Button>
            <Button size="sm" variant="secondary" className="text-red-400" onClick={() => commit([], null)}>
              <Trash2 className="mr-1 size-4" /> Clear
            </Button>
          </div>
        </div>
        {wrapMode && <span className="text-primary text-xs">↻ pick a group to wrap the selection</span>}
      </div>

      {/* Add palette — groups on top, emotes below; each a bordered group (no text labels). */}
      <div className="flex flex-col gap-2">
        <div className="border-border/60 flex flex-wrap items-center gap-1 rounded-lg border p-1.5">
          <Button size="sm" variant="secondary" disabled={partDisabled("anyOf")} onClick={() => onPart("anyOf", eAny)}>
            any
          </Button>
          <Button size="sm" variant="secondary" disabled={partDisabled("anyOrder")} onClick={() => onPart("anyOrder", eAnyOrder)}>
            any order
          </Button>
          <Button size="sm" variant="secondary" disabled={partDisabled("optional")} onClick={() => onPart("optional", eOptional)}>
            optional
          </Button>
          <Button size="sm" variant="secondary" disabled={partDisabled("repeat")} onClick={() => onPart("repeat", eRepeat)}>
            repeat
          </Button>
        </div>
        <div className="border-border/60 flex flex-wrap items-center gap-1 rounded-lg border p-1.5">
          {PALETTE.map((g) => (
            <Button key={g} size="sm" variant="secondary" className="text-lg" disabled={wrapMode} onClick={() => addEmote(g)}>
              {glyph(g)}
            </Button>
          ))}
        </div>
      </div>

      {/* JSON editor */}
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground flex items-center justify-between text-xs">
          <span>JSON</span>
          {!jsonValid && <span className="text-red-400 font-medium">Invalid Pattern</span>}
        </span>
        <textarea
          value={text}
          onChange={(e) => onText(e.target.value)}
          spellCheck={false}
          rows={8}
          className={`bg-card/60 w-full rounded-lg border p-2 font-mono text-xs ${jsonValid ? "border-border" : "border-red-400/60"}`}
        />
      </label>

      {/* Valid combinations — collapsible vertical list */}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setShowValid((s) => !s)}
          className="text-muted-foreground flex w-fit items-center gap-1 text-sm hover:text-foreground"
        >
          <span>{showValid ? "▾" : "▸"}</span>
          Valid combinations ({valid.length}
          {finite ? "" : "+"})
        </button>
        {showValid && (
          <div className="border-border/50 flex max-h-48 flex-col gap-1 overflow-auto rounded-lg border p-2">
            {valid.map((seq, i) => (
              <div key={i} className="text-lg leading-tight">
                {seq.length === 0 ? <span className="text-muted-foreground text-sm">∅ (empty)</span> : seq.map(glyph).join(" ")}
              </div>
            ))}
            {!finite && <span className="text-muted-foreground text-xs">… (unbounded — sample shown)</span>}
          </div>
        )}
      </div>
    </div>
  );
};
