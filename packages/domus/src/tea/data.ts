// Cue-reading + emote content for the Tea tab's LIVE surfaces (/tea and /tea/emote). The
// conversation-recipe content (guests/ingredients/starters) was removed 2026-07-03 (recover from git
// history 161207a; local copy in the gitignored tmp/ai-quarantine/).

import type { CuePattern, CueSymbol } from "./cues";
import { enumerate, type NotatedPattern } from "./pattern-notation";

// Curated emote pool — on-theme tea/Victorian glyphs, shared by the Pattern Builder palette and the
// tea-party scene's reaction emotes. Refine over time (single source of truth for "which emotes exist").
export const EMOTE_POOL = [
  "🥄", "☕", "🟫", "🫖", "🍰", "🍪", "🍵", "🧁", "🍯", "🥛", "🍓",
  "🌹", "🪭", "🧤", "🎩", "🕯️", "📜", "💌", "👒", "😊", "🐕",
];

// ---- Cue-reading (emote) content (MVP) — the two starter patterns + their glyphs (see cues.ts). ----

export const CUE_GLYPH: Record<CueSymbol, string> = {
  spoon: "🥄",
  saucer: "☕",
  table: "🟫",
  dog: "🐕", // an off-pattern "interrupt" symbol (breaks the chain) — for flavor + teaching
};

export const CUE_LABEL: Record<CueSymbol, string> = {
  spoon: "spoon",
  saucer: "saucer",
  table: "table",
  dog: "dog",
};

// MVP patterns: a very explicit refill, and a slightly more complex clear with order-variants. The
// refill sequence is also a strict prefix of one clear variant — that overlap is the timing tension.
export const CUE_PATTERNS: CuePattern[] = [
  { id: "refill", intent: "refill", sequences: [["spoon", "saucer"]] },
  {
    id: "clear",
    intent: "clear",
    sequences: [
      ["spoon", "saucer", "table"],
      ["spoon", "table", "saucer"],
    ],
  },
];

// Human-facing copy per intent, for the UI.
export const CUE_INTENT_LABEL: Record<string, string> = {
  refill: "Ready for refill",
  clear: "Ready to clear dishes",
};

// Decorative ambient emotes — pure noise that is NOT part of any pattern (a guest fanning herself,
// smiling, glancing about…). They fill the continuous stream so the real patterns must be *noticed*.
export const NOISE_GLYPHS: string[] = ["🪭", "😊", "💬", "🧤", "🌸", "💭", "😌", "👀", "🎩", "🥀"];

// ---- Pattern notation (the legend the player reads) ----
// The two live requests, expressed in the 2-D notation. These drive the on-screen legend rendered
// by <PatternNotation>, and CUE_SEQUENCES below is DERIVED from them via enumerate().
const fix = (symbol: CueSymbol) => ({ kind: "fixed" as const, symbol });

export const NOTATED_REQUESTS: NotatedPattern[] = [
  { id: "refill", intent: "Refill", nodes: [fix("spoon"), fix("saucer")] },
  {
    id: "clear",
    intent: "Clear",
    nodes: [fix("spoon"), { kind: "anyOrder", nodes: [fix("saucer"), fix("table")] }],
  },
];

// The injectable patterns as flat symbol sequences, for the continuous game's ground-truth
// injection. Derived from the notation so the legend and the stream can never disagree (the
// pattern id doubles as the intent).
export const CUE_SEQUENCES: { intent: "refill" | "clear"; symbols: CueSymbol[] }[] =
  NOTATED_REQUESTS.flatMap((req) =>
    enumerate(req).map((symbols) => ({ intent: req.id as "refill" | "clear", symbols })),
  );

// A guide that demonstrates each notation kind (uses the service glyphs so it renders concretely).
export const NOTATION_SHOWCASE: { note: string; pattern: NotatedPattern }[] = [
  { note: "fixed order", pattern: { id: "g-fixed", intent: "", nodes: [fix("spoon"), fix("saucer")] } },
  {
    note: "any one of",
    pattern: { id: "g-any", intent: "", nodes: [fix("spoon"), { kind: "anyOf", symbols: ["saucer", "table"] }] },
  },
  {
    note: "any order",
    pattern: { id: "g-order", intent: "", nodes: [{ kind: "anyOrder", nodes: [fix("spoon"), fix("saucer"), fix("table")] }] },
  },
  {
    note: "optional middle",
    pattern: { id: "g-opt", intent: "", nodes: [fix("spoon"), { kind: "optional", nodes: [fix("saucer")] }, fix("table")] },
  },
  {
    note: "wildcard",
    pattern: { id: "g-wild", intent: "", nodes: [fix("spoon"), { kind: "wildcard" }] },
  },
  {
    note: "repeat 2–4×",
    pattern: { id: "g-rep", intent: "", nodes: [fix("spoon"), { kind: "repeat", nodes: [fix("saucer")], min: 2, max: 4 }] },
  },
  {
    note: "anchored",
    pattern: { id: "g-anchor", intent: "", nodes: [fix("spoon"), fix("saucer")], startAnchored: true, endAnchored: true },
  },
];
