// The typewriter's brain, pure and renderer-agnostic (the ActorTracker pattern): walks a parsed
// LineItem stream — text segments with per-segment pace ({cps=8}/{cps=*2}), pauses ({w}/{w=1.5}),
// paragraph breaks ({p}), and {fast} preseeds — and answers "how many glyphs are visible now?".
// Renderers feed it wall-clock dt and clicks; it never touches the DOM or a clock of its own.
//
// Semantics (Ren'Py-matching):
//   • a click during reveal completes to the NEXT pause, not the whole line
//   • a bare {w} pauses until click(); {w=s} resumes itself after s seconds of advanceTime
//   • instant base speed (0/Infinity) still honors pauses — text jumps between them
//   • {fast} makes everything before it (pauses included) already-revealed at construction
//   • while paused, the speaker is NOT talking (see isTalking) — mouths stop for the beat

import { LineItem } from "./rich-text";

export type RevealPause = { kind: "click" } | { kind: "time"; remaining: number };

export type RevealWalk = {
  // Advance wall time; baseCps is resolved per call (the stage's live textSpeed).
  advanceTime: (dtSeconds: number, baseCps: number) => void;
  // A click on the textbox: resumes a click-pause, else completes to the next pause.
  // Returns false when the line was already settled (caller should advance the script).
  click: () => boolean;
  // Jump to the very end, pauses and all (restored/settled lines show whole).
  completeAll: () => void;
  pos: () => number; // visible glyph count (integer, for painting)
  paused: () => RevealPause | null;
  settled: () => boolean;
  // Revealing right now (not settled, not paused) — the reveal-bound talking signal.
  isTalking: () => boolean;
};

export const RevealWalk = (items: LineItem[]): RevealWalk => {
  let itemIdx = 0;
  let posInItem = 0; // fractional glyphs into the current text item
  let consumed = 0; // whole glyphs of completed items
  let pause: RevealPause | null = null;

  const rateOf = (item: Extract<LineItem, { kind: "text" }>, base: number): number =>
    item.cps ?? (item.cpsMul !== undefined ? base * item.cpsMul : base);

  const settled = () => itemIdx >= items.length && pause === null;

  // Consume items instantly until a pause or the end. honorPauses=false blasts through ({fast}
  // preseed, completeAll).
  const jump = (honorPauses: boolean) => {
    pause = null;
    while (itemIdx < items.length) {
      const item = items[itemIdx];
      if (item.kind === "text") {
        consumed += item.text.length;
        posInItem = 0;
        itemIdx++;
      } else if (item.kind === "wait" && honorPauses) {
        pause = item.seconds !== undefined ? { kind: "time", remaining: item.seconds } : { kind: "click" };
        itemIdx++; // the wait itself is consumed; the pause now gates continuation
        return;
      } else {
        itemIdx++; // break (visual), fast (no-op mid-walk), or an ignored wait
      }
    }
  };

  // {fast}: everything before the LAST fast marker is pre-revealed, prior pauses cancelled.
  const lastFast = items.reduce((acc, it, i) => (it.kind === "fast" ? i : acc), -1);
  if (lastFast >= 0) {
    while (itemIdx <= lastFast) {
      const item = items[itemIdx];
      if (item.kind === "text") consumed += item.text.length;
      itemIdx++;
    }
  }

  const advanceTime = (dtSeconds: number, baseCps: number) => {
    let dt = dtSeconds;
    if (pause?.kind === "click") return;
    if (pause?.kind === "time") {
      pause.remaining -= dt;
      if (pause.remaining > 0) return;
      dt = -pause.remaining; // leftover time keeps revealing past the pause
      pause = null;
    }
    while (itemIdx < items.length) {
      const item = items[itemIdx];
      if (item.kind === "wait") {
        pause = item.seconds !== undefined ? { kind: "time", remaining: item.seconds } : { kind: "click" };
        itemIdx++;
        // A zero-length timed wait resolves within this same call.
        if (pause.kind === "time") {
          pause.remaining -= dt;
          if (pause.remaining > 0) return;
          dt = -pause.remaining;
          pause = null;
          continue;
        }
        return;
      }
      if (item.kind !== "text") {
        itemIdx++; // break / fast
        continue;
      }
      const rate = rateOf(item, baseCps);
      if (!Number.isFinite(rate) || rate <= 0) {
        // Instant segment: whole thing appears, dt untouched.
        consumed += item.text.length;
        posInItem = 0;
        itemIdx++;
        continue;
      }
      const remaining = item.text.length - posInItem;
      const canReveal = dt * rate;
      if (canReveal < remaining - 1e-9) { // epsilon: FP drift must not strand a segment's last glyph
        posInItem += canReveal;
        return; // dt spent mid-segment
      }
      dt -= remaining / rate;
      consumed += item.text.length;
      posInItem = 0;
      itemIdx++;
    }
  };

  return {
    advanceTime,
    click: () => {
      if (settled()) return false;
      if (pause) {
        pause = null; // resume (a timed pause is also click-skippable)
        return true;
      }
      posInItem = 0; // jump() re-adds the current item's FULL length — partial progress folds in
      jump(true); // complete to the next pause, Ren'Py-style
      return true;
    },
    completeAll: () => {
      posInItem = 0;
      jump(false);
    },
    pos: () => Math.floor(consumed + posInItem),
    paused: () => pause,
    settled,
    isTalking: () => !settled() && pause === null,
  };
};
