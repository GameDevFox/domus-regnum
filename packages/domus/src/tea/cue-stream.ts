// The continuous cue-reading game's LOGIC core, extracted pure from CueView so it unit-tests:
// emotes stream on ONE uniform beat — decorative noise, the occasional decoy (a lone 🥄 that goes
// nowhere), and every so often a real injected pattern (refill/clear). Scoring windows are absolute
// ms, independent of the emote rate. The React panel owns rendering + score tallying; this owns the
// state machine (what emits, when a cue opens/expires, how a response lands).

import { type ActiveCue, type CueResponse, evaluateResponse } from "./cue-game";
import { type CueSymbol } from "./cues";

export type StreamSequence = { intent: "refill" | "clear"; symbols: CueSymbol[] };

export type StreamConfig = {
  windowMs: number; // a completed request decays to the miss floor over this
  decoyLingerMs: number; // a decoy is answerable (and ignorable) this long, then vanishes safely
  gapMs: number; // breather after a resolution before the stream can inject again
  forceAfter: number; // force an injection if this many idle emotes pass with none
  injectChance: number; // chance an idle emote beat instead starts a cue
  patternChance: number; // of those, the chance it's a real pattern (vs. a decoy)
  sequences: StreamSequence[]; // the injectable patterns (ground truth)
  noisePoolSize: number; // the UI's decorative-glyph pool size (events carry an index into it)
  rng: () => number; // injectable so tests are deterministic
};

// The active cue carries its symbol list (so the emitter knows the next symbol). `resolved` =
// already answered while still delivering — it keeps emitting its remaining symbols (so an
// anticipated pattern still completes on screen) but no longer scores or counts as a miss.
export type StreamCue = ActiveCue & { symbols: CueSymbol[]; resolved?: boolean };

export type Stream = {
  clock: number;
  nextEmitAt: number; // when the next emote (of ANY kind) is due — the single uniform emote rate
  active: StreamCue | null;
  idleUntil: number; // no injection before this (the post-resolution breather)
  idleEmits: number; // idle emotes since the last injection (for forceAfter)
};

export const freshStream = (firstEmitAtMs: number): Stream => ({
  clock: 0,
  nextEmitAt: firstEmitAtMs,
  active: null,
  idleUntil: 0,
  idleEmits: 0,
});

// What one emote beat produced — the UI maps these to glyphs.
export type EmitEvent = { kind: "symbol"; symbol: CueSymbol } | { kind: "noise"; index: number };

// Decide + emit ONE emote on the uniform beat: continue a pattern in progress, else maybe start a
// pattern/decoy, else noise. Pattern symbols ride the same beat as noise → the emote rate is constant.
export const emitOne = (s: Stream, cfg: StreamConfig): EmitEvent => {
  if (s.active?.injected && s.active.emitted < s.active.length) {
    const symbol = s.active.symbols[s.active.emitted];
    s.active.emitted += 1;
    if (s.active.emitted >= s.active.length) s.active.completeAtMs = s.clock;
    return { kind: "symbol", symbol };
  }
  if (!s.active && s.clock >= s.idleUntil && (s.idleEmits >= cfg.forceAfter || cfg.rng() < cfg.injectChance)) {
    s.idleEmits = 0;
    if (cfg.rng() < cfg.patternChance) {
      const seq = cfg.sequences[Math.floor(cfg.rng() * cfg.sequences.length)];
      s.active = {
        intent: seq.intent,
        injected: true,
        length: seq.symbols.length,
        emitted: 1,
        completeAtMs: seq.symbols.length <= 1 ? s.clock : null,
        symbols: seq.symbols,
      };
      return { kind: "symbol", symbol: seq.symbols[0] };
    }
    // a decoy lone 🥄 (goes nowhere) — safe to ignore, a trap to act on
    s.active = { intent: null, injected: false, length: 1, emitted: 1, completeAtMs: s.clock, symbols: ["spoon"] };
    return { kind: "symbol", symbol: "spoon" };
  }
  s.idleEmits += 1;
  return { kind: "noise", index: Math.floor(cfg.rng() * cfg.noisePoolSize) };
};

export type TickResult = { emitted: EmitEvent | null; missed: boolean };

// Advance the clock one frame: emit if the beat is due, then expire a completed cue (all absolute
// ms). `emitMs` is read per-tick so a live rate change (the dev slider) applies immediately.
export const tickStream = (s: Stream, frameMs: number, emitMs: number, cfg: StreamConfig): TickResult => {
  s.clock += frameMs;
  let emitted: EmitEvent | null = null;
  if (s.clock >= s.nextEmitAt) {
    emitted = emitOne(s, cfg);
    s.nextEmitAt += emitMs;
  }
  let missed = false;
  if (s.active?.completeAtMs != null) {
    const age = s.clock - s.active.completeAtMs;
    if (s.active.resolved) {
      s.active = null; // already answered; it has now finished displaying → retire it quietly
      s.idleUntil = s.clock + cfg.gapMs;
    } else if (s.active.injected && age > cfg.windowMs) {
      missed = true; // a need went unmet
      s.active = null;
      s.idleUntil = s.clock + cfg.gapMs;
    } else if (!s.active.injected && age > cfg.decoyLingerMs) {
      s.active = null; // a decoy correctly ignored — no penalty
    }
  }
  return { emitted, missed };
};

export type RespondResult =
  | { kind: "falseAlarm" } // fussing when nothing was (still) being asked
  | { kind: "read"; facts: CueResponse; intent: ActiveCue["intent"] };

// The player calls an intent. On a live cue this evaluates the read and either lets a mid-delivery
// pattern finish on screen (resolved — an anticipated call still completes visually) or retires it.
export const respondStream = (s: Stream, intent: "refill" | "clear", cfg: StreamConfig): RespondResult => {
  if (!s.active || s.active.resolved) return { kind: "falseAlarm" };
  const facts = evaluateResponse(s.active, intent, s.clock);
  const intentWas = s.active.intent;
  if (s.active.injected && s.active.emitted < s.active.length) {
    s.active.resolved = true;
  } else {
    s.active = null;
    s.idleUntil = s.clock + cfg.gapMs;
  }
  return { kind: "read", facts, intent: intentWas };
};
