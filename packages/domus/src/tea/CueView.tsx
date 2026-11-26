import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  type ActiveCue,
  DEFAULT_CUE_SCORE,
  floorReachedMs,
  missScore,
  potentialScore,
  type Rating,
  ratingFor,
  scoreCue,
} from "./cue-game";
import {
  type EmitEvent,
  freshStream,
  respondStream,
  type Stream,
  type StreamConfig,
  tickStream,
} from "./cue-stream";
import { type CueSymbol, streamIntent } from "./cues";
import {
  CUE_GLYPH,
  CUE_INTENT_LABEL,
  CUE_PATTERNS,
  CUE_SEQUENCES,
  NOISE_GLYPHS,
  NOTATED_REQUESTS,
  NOTATION_SHOWCASE,
} from "./data";
import { PatternNotation } from "./PatternNotation";

const REVEAL_MS = 1150; // gap between emitted symbols
const SETTLE_MS = 1500; // quiet gap after the last symbol → "she's settled" (safe to commit)

export type CueResult = { correct: boolean; intent: string };

// One cue read: a guest's `target` emote sequence streams in over time; the player responds (or waits)
// and is judged against what she actually wanted (streamIntent — chain-breaks handled). Self-contained
// (its own timers, cleaned up); calls onDone when the player continues past the verdict. Reused by the
// standalone CuePanel and the conversation occasion's interleave.
export const CueBeat = ({ target, onDone }: { target: CueSymbol[]; onDone: (r: CueResult) => void }) => {
  const [shown, setShown] = useState<CueSymbol[]>([]);
  const [settled, setSettled] = useState(false);
  const [verdict, setVerdict] = useState<null | { ok: boolean; text: string }>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setShown([]);
    setSettled(false);
    setVerdict(null);
    timers.current.forEach(clearTimeout);
    timers.current = [];
    target.forEach((sym, i) => {
      timers.current.push(setTimeout(() => setShown((s) => [...s, sym]), REVEAL_MS * (i + 1)));
    });
    timers.current.push(setTimeout(() => setSettled(true), REVEAL_MS * target.length + SETTLE_MS));
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [target]);

  const trueIntent = streamIntent(target, CUE_PATTERNS) ?? "refill";

  const act = (intent: string) => {
    if (verdict) return;
    const ok = intent === trueIntent;
    setVerdict({
      ok,
      text: ok
        ? settled
          ? "Read cleanly — well anticipated."
          : "A correct read, though you jumped early."
        : `Misread — ${CUE_INTENT_LABEL[trueIntent]?.toLowerCase() ?? "you misjudged her"}.`,
    });
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-end">
        <span className="text-muted-foreground text-sm">{settled ? "The guest is settled now." : "The guest is watching…"}</span>
      </div>

      <div className="flex min-h-[4rem] items-center justify-center gap-2 rounded-lg border bg-card/40 p-4 text-3xl">
        {shown.length === 0 ? (
          <span className="text-muted-foreground text-sm">The guest settles in…</span>
        ) : (
          shown.map((sym, i) => (
            <span key={i} aria-label={sym}>
              {CUE_GLYPH[sym] ?? "•"}
            </span>
          ))
        )}
      </div>

      {verdict ? (
        <Card>
          <CardHeader>
            <CardTitle className={`text-center text-lg ${verdict.ok ? "text-green-500" : "text-red-400"}`}>
              {verdict.ok ? "✓ Correct" : "✗ Misread"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <p className="text-muted-foreground text-center text-sm">{verdict.text}</p>
            <Button size="sm" onClick={() => onDone({ correct: verdict.ok, intent: trueIntent })}>
              Continue
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <p className="text-muted-foreground text-xs">Respond (or wait):</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => act("refill")}>
              ☕ Refill
            </Button>
            <Button variant="secondary" onClick={() => act("clear")}>
              🟫 Clear the setting
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---- The continuous cue-reading game ----
// Emotes stream continuously: decorative NOISE, the occasional DECOY (a lone 🥄 that goes nowhere), and
// every so often a real injected PATTERN (refill / clear). The player watches and responds; scoring
// (cue-game.ts) rewards speed and — riskily — anticipation. Timer-driven; the scoring is pure + tested.

const FRAME_MS = 100; // clock granularity
const EMIT_MS = 850; // the EMOTE RATE — how often ANY emote spawns (slider / future per-character mood).
const EMIT_MS_MIN = 300; // dev-slider bounds; the slider is inverted (right = faster = lower ms), so a
const EMIT_MS_MAX = 1600; // value maps through (MIN + MAX) - v — deriving keeps the flip in sync with the bounds.
const FEED_MIN_OPACITY = 0.35; // oldest visible feed glyph (newest fades up to 1)
// The SCORING WINDOW is in absolute ms, INDEPENDENT of the emote rate: a request, once complete, decays
// over the same real time whether the guest is chatty-fast or calm-slow. WINDOW_MS is derived so a
// correct answer hits the floor exactly when the request times out (miss).
const WINDOW_MS = Math.round(floorReachedMs()); // = grace + decay-to-floor
const DECOY_LINGER_MS = 1200; // a decoy is "answerable" (and ignorable) this long, then vanishes safely
const GAP_MS = 700; // breather after a resolution before the stream can inject again
const FEED_CAP = 11; // visible emote history
const FORCE_AFTER = 11; // force an injection if this many idle emotes pass with none
const INJECT_CHANCE = 0.3; // chance an idle emote beat instead starts a cue
const PATTERN_CHANCE = 0.72; // of those, the chance it's a real pattern (vs. a decoy)

type FeedItem = { id: number; glyph: string };

// The stream state machine lives in cue-stream.ts (pure + tested); this wires it to React.
const STREAM_CFG: StreamConfig = {
  windowMs: WINDOW_MS,
  decoyLingerMs: DECOY_LINGER_MS,
  gapMs: GAP_MS,
  forceAfter: FORCE_AFTER,
  injectChance: INJECT_CHANCE,
  patternChance: PATTERN_CHANCE,
  sequences: CUE_SEQUENCES,
  noisePoolSize: NOISE_GLYPHS.length,
  rng: () => pseudoRandom(),
};

const glyphOf = (e: EmitEvent): string =>
  e.kind === "symbol" ? (CUE_GLYPH[e.symbol] ?? "•") : NOISE_GLYPHS[e.index];

type Last = { rating: Rating; points: number; text: string };
// One debug row per active pattern (toggleable; reveals the answer key + live countdowns — dev only).
type DebugRow = { label: string; points: number; toFloorMs: number; decoy: boolean };

export const CuePanel = () => {
  const [running, setRunning] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [reads, setReads] = useState(0);
  const [last, setLast] = useState<Last | null>(null);
  // Dev-only: the EMOTE RATE. NOT shipping — becomes a per-character/mood parameter (fast = harder to
  // read but more impressed by a prompt reply; slow = easier but less impressed). See the design doc.
  const [emitMs, setEmitMs] = useState(EMIT_MS);
  const emitMsRef = useRef(EMIT_MS);
  // Dev-only debug panel: the live answer key + per-pattern countdowns.
  const [debug, setDebug] = useState(false);
  const [debugRows, setDebugRows] = useState<DebugRow[]>([]);
  const [guide, setGuide] = useState(false); // the notation key (reference)
  const g = useRef<Stream>(freshStream(EMIT_MS));
  const idGen = useRef(0);

  const pushGlyph = (glyph: string) =>
    setFeed((f) => [...f, { id: idGen.current++, glyph }].slice(-FEED_CAP));

  const resolveMiss = () => {
    const pts = missScore();
    setTotal((t) => t + pts);
    setReads((r) => r + 1);
    setLast({
      rating: "Missed",
      points: pts,
      text: "Service Missed"
    });
  };

  // Build the debug rows (answer key + live countdowns) for the one active cue, if any.
  const computeDebug = (s: Stream): DebugRow[] => {
    const a = s.active;
    if (!a || a.resolved) return [];
    if (!a.injected) {
      const left = DECOY_LINGER_MS - (s.clock - (a.completeAtMs ?? s.clock));
      return [{ label: "decoy (🥄) — ignore", points: DEFAULT_CUE_SCORE.wrongPenalty, toFloorMs: Math.max(0, left), decoy: true }];
    }
    const remaining = Math.max(0, a.length - a.emitted);
    if (remaining > 0) {
      // still arriving — the early-call prize, and the full time until it would floor
      return [
        {
          label: `${a.intent?.toUpperCase()} (incoming)`,
          points: potentialScore({ symbolsRemaining: remaining, reactionMs: 0 }),
          toFloorMs: remaining * emitMsRef.current + WINDOW_MS,
          decoy: false,
        },
      ];
    }
    const reactionMs = s.clock - (a.completeAtMs ?? s.clock);
    return [
      {
        label: `${a.intent?.toUpperCase()} (open)`,
        points: potentialScore({ symbolsRemaining: 0, reactionMs }),
        toFloorMs: Math.max(0, WINDOW_MS - reactionMs),
        decoy: false,
      },
    ];
  };

  // The frame loop. Emotes (noise AND pattern symbols) spawn on ONE uniform rate (emitMs); scoring is
  // ms-based and independent of it. Renders nothing that reveals an active cue (integrity guard) —
  // except the opt-in debug panel below.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const s = g.current;
      const { emitted, missed } = tickStream(s, FRAME_MS, emitMsRef.current, STREAM_CFG);
      if (emitted) pushGlyph(glyphOf(emitted));
      if (missed) resolveMiss();
      if (debug) setDebugRows(computeDebug(s));
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [running, debug]);

  const respond = (intent: "refill" | "clear") => {
    if (!running) return;
    const result = respondStream(g.current, intent, STREAM_CFG);
    if (result.kind === "falseAlarm") {
      // fussing when nothing was (still) being asked
      const pts = DEFAULT_CUE_SCORE.falseAlarmPenalty;
      setTotal((t) => t + pts);
      setLast({
        rating: "Missed",
        points: pts,
        text: "Misread"
      });
      return;
    }
    const pts = scoreCue(result.facts);
    const rating = ratingFor(pts);
    setTotal((t) => t + pts);
    setReads((r) => r + 1);
    setLast({ rating, points: pts, text: feedbackText(rating, result.facts.correct, result.intent) });
  };

  const start = () => {
    g.current = freshStream(EMIT_MS);
    setFeed([]);
    setTotal(0);
    setReads(0);
    setLast(null);
    setRunning(true);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pt-2">
      {/* The valid requests, in the 2-D notation. Reference (the rules) — reveals no active state. */}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        {NOTATED_REQUESTS.map((req) => (
          <div key={req.id} className="flex items-center gap-2">
            <span className="text-muted-foreground w-12 text-right text-sm">{req.intent}</span>
            <PatternNotation pattern={req} />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setGuide((x) => !x)}
          className={`text-muted-foreground rounded border px-1.5 py-0.5 text-xs ${guide ? "border-primary text-foreground" : "opacity-60"}`}
        >
          notation key
        </button>
      </div>

      {guide && (
        <div className="border-border/60 bg-card/30 flex flex-col gap-2 rounded-lg border p-3">
          <span className="text-muted-foreground text-xs opacity-70">
            Notation key — modifiers sit above/below the row (a 2-D "emote regex"):
          </span>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {NOTATION_SHOWCASE.map(({ note, pattern }) => (
              <div key={pattern.id} className="flex items-center gap-2">
                <span className="text-muted-foreground w-20 text-right text-xs">{note}</span>
                <PatternNotation pattern={pattern} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm">
          Standing: <strong className="text-foreground text-base">{total}</strong>
          <span className="text-muted-foreground"> · {reads} read</span>
        </span>
        {/* Neutral status only — it must NOT change with cue activity, or it would telegraph the spawn. */}
        <span className="text-muted-foreground text-sm">{running ? "…watching" : "ready"}</span>
      </div>

      {/* The emote stream — centered, newest on the right */}
      <div className="flex min-h-[4rem] items-center justify-center gap-2 overflow-hidden rounded-lg border bg-card/40 p-4 text-3xl">
        {feed.length === 0 ? (
          <span className="text-muted-foreground text-sm">{running ? "The guest is settling in…" : "Press Begin once you're ready."}</span>
        ) : (
          feed.map((it, i) => (
            <span key={it.id} style={{ opacity: FEED_MIN_OPACITY + ((1 - FEED_MIN_OPACITY) * (i + 1)) / feed.length }}>
              {it.glyph}
            </span>
          ))
        )}
      </div>

      {last && (
        <p
          className={`text-center text-sm ${last.points > DEFAULT_CUE_SCORE.base
            ? "text-green-400"
            : last.points > 0
              ? "text-muted-foreground"
              : "text-red-400"
            }`}
        >
          <strong>{last.rating}</strong> ({last.points > 0 ? `+${last.points}` : last.points}) — {last.text}
        </p>
      )}

      <div className="flex items-center justify-center gap-2">
        {running ? (
          <>
            <Button variant="secondary" onClick={() => respond("refill")}>
              ☕ Refill
            </Button>
            <Button variant="secondary" onClick={() => respond("clear")}>
              🟫 Clear
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRunning(false)}>
              Pause
            </Button>
          </>
        ) : (
          <Button onClick={start}>{reads > 0 ? "Begin again" : "Begin"}</Button>
        )}
      </div>

      {/* Dev-only tuning control (not shipping). Faster = harder to read; later becomes a
          per-character / per-mood parameter. */}
      <label className="text-muted-foreground mx-auto flex items-center gap-2 text-xs">
        <span className="opacity-60">dev · emote speed</span>
        <span>slow</span>
        <input
          type="range"
          min={EMIT_MS_MIN}
          max={EMIT_MS_MAX}
          step={50}
          // The slider's left edge = slow (high ms); invert so dragging right = faster.
          value={EMIT_MS_MIN + EMIT_MS_MAX - emitMs}
          onChange={(e) => {
            const ms = EMIT_MS_MIN + EMIT_MS_MAX - Number(e.target.value);
            setEmitMs(ms);
            emitMsRef.current = ms;
          }}
          className="accent-primary"
        />
        <span>fast</span>
        <span className="w-12 text-right tabular-nums opacity-60">{emitMs}ms</span>
        <button
          type="button"
          onClick={() => {
            setDebug((d) => !d);
            setDebugRows([]);
          }}
          className={`ml-2 rounded border px-1.5 py-0.5 ${debug ? "border-primary text-foreground" : "opacity-60"}`}
        >
          debug
        </button>
      </label>

      {/* Dev-only debug panel: the live answer key — each active pattern, its points if triggered NOW
          (counting down to the floor) and ms left before the penalty floor (counting down to 0). */}
      {debug && (
        <div className="border-border/60 bg-card/40 text-muted-foreground mx-auto w-full max-w-md rounded-lg border p-3 font-mono text-xs">
          <div className="mb-1 flex justify-between opacity-60">
            <span>active patterns (debug)</span>
            <span>floor at {WINDOW_MS}ms · pts→{DEFAULT_CUE_SCORE.floor}</span>
          </div>
          {debugRows.length === 0 ? (
            <div className="opacity-50">— none —</div>
          ) : (
            debugRows.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className={r.decoy ? "text-red-400" : "text-foreground"}>{r.label}</span>
                <span className="flex gap-4 tabular-nums">
                  <span className={r.decoy ? "text-red-400" : r.points > 0 ? "text-green-400" : "text-red-400"}>
                    {r.points > 0 ? `+${r.points}` : r.points} pts
                  </span>
                  <span className="w-16 text-right">{Math.round(r.toFloorMs)}ms</span>
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// Flavor for a resolved read.
const feedbackText = (rating: Rating, correct: boolean, intent: ActiveCue["intent"]): string => {
  if (!correct) {
    return intent == null
      ? "No such service required."
      : `Miss! — Expected ${CUE_INTENT_LABEL[intent]?.toLowerCase() ?? "something else"}.`;
  }
  switch (rating) {
    case "Intuitive":
      return "Anticipated before she finished — masterful.";
    case "Astute":
      return "Read promptly and well.";
    case "Attentive":
      return "Served, if a touch slow.";
    default:
      return "Only just in time.";
  }
};

// A tiny LCG so the stream is lively without Math.random in module scope (and to keep it cheap). Seeded
// off a mutable counter — variety, not determinism (this is a live toy, not a tested unit).
let rngState = 0x2545f4;
const pseudoRandom = (): number => {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return rngState / 0x7fffffff;
};
