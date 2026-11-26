// Continuous cue-reading scoring — see docs/design/cue-reading-system.md.
//
// In the live tea, a guest's emotes stream CONTINUOUSLY (decorative noise + the occasional decoy), and
// every so often a real PATTERN is woven in (refill / clear). The player must notice and respond. The
// scoring embodies the "a good servant knows the need before the guest does" ethic:
//   - Respond after the pattern completes → points scaled by how QUICKLY (decays, can go negative).
//   - Respond BEFORE it completes (a correct early call) → MEGA points; the more symbols still missing,
//     the bigger the prize — and the bigger the gamble (a 🥄 might be noise, a refill, or a clear).
//   - A wrong call, or a real pattern left unanswered too long, drifts past zero to a floor.
// Pure + deterministic; the UI feeds it the facts (which it knows from the injection ground truth).

export type CueScoreConfig = {
  base: number; // points for a clean on-time correct read
  earlyBonusPerSymbol: number; // added per still-missing symbol on a correct EARLY call (the risk reward)
  graceMs: number; // full `base` if answered within this long after completion
  decayPerMs: number; // points lost per ms once past grace
  floor: number; // most negative a single read can score (miss / very late / wrong)
  wrongPenalty: number; // a wrong intent (a realized gamble)
  falseAlarmPenalty: number; // responding when nothing was actually being asked (fussing)
};

export const DEFAULT_CUE_SCORE: CueScoreConfig = {
  base: 100,
  earlyBonusPerSymbol: 80,
  graceMs: 700,
  decayPerMs: 0.06, // ~1.67s past grace to bleed `base` down to 0
  floor: -60,
  wrongPenalty: -60,
  falseAlarmPenalty: -25,
};

export type CueResponse = {
  correct: boolean; // intent matched the active injected pattern
  symbolsRemaining: number; // pattern symbols not yet shown when answered (>0 ⇒ an early call)
  reactionMs: number; // ms after completion (≥0); ignored when symbolsRemaining > 0
};

const clampFloor = (x: number, floor: number) => Math.max(floor, x);

// Points a response earns. Early+correct = base + bonus (mega). On-time correct = base, decaying with
// reaction time and floored (goes negative when very late). Wrong = penalty.
export const scoreCue = (r: CueResponse, cfg: CueScoreConfig = DEFAULT_CUE_SCORE): number => {
  if (!r.correct) return cfg.wrongPenalty;
  if (r.symbolsRemaining > 0) return cfg.base + cfg.earlyBonusPerSymbol * r.symbolsRemaining;
  const past = Math.max(0, r.reactionMs - cfg.graceMs);
  return Math.round(clampFloor(cfg.base - cfg.decayPerMs * past, cfg.floor));
};

// The live "potential" if the player committed a CORRECT read right now — drives the ticking HUD.
export const potentialScore = (
  r: Omit<CueResponse, "correct">,
  cfg: CueScoreConfig = DEFAULT_CUE_SCORE,
): number => scoreCue({ ...r, correct: true }, cfg);

// A real (injected) pattern left unanswered until its window closes scores the floor.
export const missScore = (cfg: CueScoreConfig = DEFAULT_CUE_SCORE): number => cfg.floor;

// The Scoring Window: ms after completion at which a correct response decays all the way to the floor —
// i.e. the moment "time runs out." Constant, independent of the emote rate. The miss deadline uses this
// so points-hit-floor and miss coincide.
export const floorReachedMs = (cfg: CueScoreConfig = DEFAULT_CUE_SCORE): number =>
  cfg.graceMs + (cfg.base - cfg.floor) / cfg.decayPerMs;

// The active thing in the stream the player might respond to. `intent: null` = a decoy (e.g. a lone 🥄
// that goes nowhere) — safe to ignore. `injected` distinguishes a real request (miss is penalized) from
// a decoy (ignoring it is correct).
export type ActiveCue = {
  intent: "refill" | "clear" | null;
  injected: boolean;
  length: number; // symbols in the full sequence
  emitted: number; // how many have appeared so far
  completeAtMs: number | null; // when the final symbol appeared (null while still in progress)
};

// Turn an in-flight cue + the player's pressed intent into scoreable facts.
export const evaluateResponse = (
  cue: ActiveCue,
  responseIntent: "refill" | "clear",
  nowMs: number,
): CueResponse => ({
  correct: cue.intent === responseIntent,
  symbolsRemaining: Math.max(0, cue.length - cue.emitted),
  reactionMs: cue.completeAtMs == null ? 0 : Math.max(0, nowMs - cue.completeAtMs),
});

export type Rating = "Intuitive" | "Astute" | "Attentive" | "Slow" | "Missed";

const ASTUTE_FRAC = 0.66; // "Astute" = kept at least this fraction of base (fast, but not anticipated)

// Band a points value for feedback. Only a correct EARLY call clears `base` → "Intuitive".
export const ratingFor = (points: number, cfg: CueScoreConfig = DEFAULT_CUE_SCORE): Rating =>
  points > cfg.base
    ? "Intuitive"
    : points >= cfg.base * ASTUTE_FRAC
      ? "Astute"
      : points > 0
        ? "Attentive"
        : points > cfg.floor
          ? "Slow"
          : "Missed";
