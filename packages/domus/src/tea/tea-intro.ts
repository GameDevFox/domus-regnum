// The Tea Time first-visit intro: Aki (the live scene avatar) explains the cue-reading game via
// the VN engine's dialogue box, then runs a gentle in-scene practice round — emotes stream above
// her head (no decoys, no scoring ladder, one clear pattern) and the player calls Refill or Clear.
// The VN script owns the words + branching; this module owns the engine, the intro phase machine,
// and the demo stream driver. All of it hangs off the scene app instance (one intro per app, so
// it survives React remounts and runs once per page session).

import { Value } from "@kitsune/common-web";
import { script, VNEngine, type Engine } from "@kitsune/vn";

import { type AkiSceneApp } from "../aki/aki-app";
import { POSES, type PoseName } from "../aki/names";
import { freshStream, respondStream, tickStream, type Stream, type StreamConfig } from "./cue-stream";
import { CUE_GLYPH, CUE_SEQUENCES, NOISE_GLYPHS } from "./data";
import { track } from "../analytics";

export type IntroPhase = "idle" | "dialogue" | "demo" | "done";

// The start stinger, dual-encoded (Opus/WebM primary, AAC fallback — see TODO.md's audio note).
// Preloaded by the title card on mount so the script's exec plays from buffer, inside the start
// click's gesture (the autoplay unlock flows: click → begin() → engine.start() → exec, all sync).
const STINGER = { opus: "/audio/tea-stinger.webm", aac: "/audio/tea-stinger.m4a" };
let stingerEl: HTMLAudioElement | null = null;
export const preloadStinger = (): HTMLAudioElement => {
  if (!stingerEl) {
    const url = new Audio().canPlayType('audio/webm; codecs="opus"') ? STINGER.opus : STINGER.aac;
    stingerEl = new Audio(url);
    stingerEl.preload = "auto"; // fetching without a gesture is allowed; only play() needs one
    stingerEl.load();
  }
  return stingerEl;
};
const playStinger = () => {
  const audio = preloadStinger();
  audio.currentTime = 0;
  audio.play().catch((err) => console.warn("[tea] stinger didn't play:", err));
};

// Tutorial pacing — friendlier than the real game: no decoys, an early guaranteed pattern, and a
// long answer window. The real game's tuning lives in CueView.tsx.
const FRAME_MS = 100;
const EMIT_MS = 1150; // readable stream pace
const TUTORIAL: Omit<StreamConfig, "rng"> = {
  windowMs: 6000, // generous — this is practice
  decoyLingerMs: 0, // no decoys (patternChance 1) — the value is never used
  gapMs: 1200,
  forceAfter: 4, // a pattern within the first handful of emotes, guaranteed
  injectChance: 0.35,
  patternChance: 1,
  sequences: CUE_SEQUENCES,
  noisePoolSize: NOISE_GLYPHS.length,
};

// What the script's actor state means on Aki's rig. Applied by the stage's onActorChange binding
// (TeaIntro) — full-state + idempotent, so replays and mount flushes are safe. `mood` is a tea
// vocabulary (the engine just carries it); `pose` maps straight onto the rig's pose names —
// script usage: .say("Aki", "…", { actor: { pose: "gesture" } }) or .actor("Aki", { pose: "gesture" }).
export type AkiMood = "neutral" | "proud" | "sheepish";
export const applyMood = (state: AkiSceneApp["state"], mood: unknown): void => {
  state.eyes.set(mood === "proud" ? "happy" : "open");
  state.drop.set(mood === "sheepish");
  state.angryMark.set(false);
};
export const applyActorState = (state: AkiSceneApp["state"], actor: Record<string, unknown>): void => {
  applyMood(state, actor.mood);
  const pose = actor.pose;
  state.pose.set(POSES.includes(pose as PoseName) ? (pose as PoseName) : "relaxed-hands");
};

export type Intro = {
  engine: Engine;
  phase: Value<IntroPhase>;
  // Kick off the intro (no-op unless idle) — called once the scene is revealed + Aki is seated.
  begin: () => void;
  // The player's call during the demo. "early" = nothing was being asked (show a hint, keep playing).
  respond: (intent: "refill" | "clear") => "answered" | "early";
  // Internal seams for the hot-reload rebuild (below): stop live timers / relaunch the demo.
  dispose: () => void;
  beginDemo: () => void;
};

export const buildIntroScript = (hooks: { startDemo: () => void; endIntro: () => void }) =>
  script()
    .label("start")
    // The director states intents; the performers (below) know how. Both fire inside the start
    // click's gesture (audio unlock holds), then the script holds until Aki is ACTUALLY seated —
    // the spring reports completion, no guessed timer. A click skips her to her mark.
    .action("audio", "stinger")
    .action("Aki", "enter", { from: "right" })
    .await("Aki")
    .wait(1500) // seated — a breath while the stinger rings out
    .action("Aki", "bow") // fire-and-continue: the bow plays UNDER the greeting, not before it
    .say("Aki", "Ah—{w=0.6} you made it! Please, sit —{w=0.4} the tea is almost ready.")
    .say("Aki", "My name is Aki. I'll be your guide as we explore various gameplay features of Domus Regnum together.")
    .actor("Aki", { pose: "gesture" })
    .say("Aki", "Today we're going to cover the {b}emote system{/}.")
    .actor("Aki", { pose: "joined-hands" })
    .say("Aki", "The emote system allows you to see subtle cues from various characters which might give you an idea of what they're thinking or feeling.")
    .say("Aki", "As a host you must learn to anticipate the needs of your guests.")
    .say("Aki", "The sign of a good host is knowing what their guest needs before they do.")
    // The two teaching beats crawl slowly (script-level textSpeed override), then back to the
    // stage's default pace for banter.
    .textSpeed(26)
    .say("Aki",
      `For example, when the guest places their {b}spoon{/} on their {b}saucer{/} in a certain way, ` +
      `you'll see ${CUE_GLYPH.spoon} ${CUE_GLYPH.saucer} (in that order) which means they'd like a {b}Refill{/}.`
    )
    .say("Aki", "However, take care. There are other patterns that look similar which can have different meanings.")
    .say(
      "Aki",
      `For example, if you see ` +
      `${CUE_GLYPH.spoon} ${CUE_GLYPH.saucer} ${CUE_GLYPH.table} or ` +
      `${CUE_GLYPH.spoon} ${CUE_GLYPH.table} ${CUE_GLYPH.saucer}` +
      `, that means they are ready to have their table cleared.`,
    )
    .textSpeed()
    .say("Aki", "Any other emotes that don't fit a pattern can be ignored.")
    .menu("Ready?", [
      { text: "Start Practice Round", target: "demo" },
      { text: "No, thank you.", target: "skip" },
    ])

    .label("demo")
    .actor("Aki", { mood: "neutral", pose: "relaxed-hands" }) // clear verdict mood + gesture before the round
    .exec(hooks.startDemo) // dialogue closes; the stream takes over (see the demo driver below)
    .jump("standby") // HALT — without this the script falls through into "right" and the engine
    // sits awaiting-advance on an unmounted dialogue box (Aki mouth-flaps through the demo)

    .label("right")
    .say("Aki", "Well done! You seem to have a knack for this.", { actor: { mood: "proud" } })
    .menu("One more time?", [
      { text: "Yes, please.", target: "demo" },
      { text: "No, thank you.", target: "outro" },
    ])

    .label("wrong")
    .say("Aki",
      "Oops… You served the guest, but not in the correct way. " +
      "Remember to make sure you're not mistaking one pattern for another.",
      { actor: { mood: "sheepish" } }
    )
    .menu("Try again?", [
      { text: "Yes, please.", target: "demo" },
      { text: "No, thank you.", target: "outro" },
    ])

    .label("missed")
    .say("Aki",
      "Oops… it looks like you either missed the pattern or weren't quick enough. " +
      "We must remember to not keep our guests waiting.",
      { actor: { mood: "sheepish" } })
    .menu("Try again?", [
      { text: "Yes, please.", target: "demo" },
      { text: "No, thank you.", target: "outro" },
    ])

    .label("skip")
    .say("Aki", "Very well. Until next time.")
    .jump("outro")

    .label("outro")
    .say("Aki", "Please, won't you enjoy a cup of tea with me before you go?", { actor: { mood: "neutral" } })
    .exec(hooks.endIntro)

    // Terminal parking spot: jumping here runs off the end of the script → status "done" (which
    // also drops the talking flag via the snapshot subscription).
    .label("standby")
    .build();

const makeIntro = (app: AkiSceneApp, resume?: { phase: Value<IntroPhase> }): Intro => {
  const phase = resume?.phase ?? Value<IntroPhase>("idle"); // hot rebuilds keep the live phase Value
  const { state } = app;

  // ---- demo stream driver (DOM interval — the Tea tab is plain React, no harness clock) ----
  let stream: Stream | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let played = false; // set true once a practice round starts → endIntro reports complete vs skip
  const cfg: StreamConfig = { ...TUTORIAL, rng: Math.random };

  const stopDemo = () => {
    clearInterval(timer);
    timer = undefined;
    stream = null;
  };

  const resetFace = () => {
    state.eyes.set("open");
    state.drop.set(false);
    state.angryMark.set(false);
  };

  const startDemo = () => {
    played = true; // engaged the practice — distinguishes "completed" from "skipped" at endIntro
    resetFace();
    state.emoteColumn.set(true); // the feed is in use now — reveal the pillar
    phase.set("demo");
    stream = freshStream(EMIT_MS);
    timer = setInterval(() => {
      if (!stream) return;
      const { emitted, missed } = tickStream(stream, FRAME_MS, EMIT_MS, cfg);
      if (emitted)
        state.emote.set({
          glyph: emitted.kind === "symbol" ? CUE_GLYPH[emitted.symbol] : NOISE_GLYPHS[emitted.index],
        });
      if (missed) {
        stopDemo();
        track("tea-practice", { result: "missed" });
        phase.set("dialogue");
        engine.start("missed"); // its line carries mood: sheepish — the rig reacts via onActorChange
      }
    }, FRAME_MS);
  };

  const endIntro = () => {
    track(played ? "tea-tutorial-complete" : "tea-tutorial-skip");
    resetFace();
    phase.set("done");
  };

  // The performer registry: the script's `action` intents land here. Aki's rig owns her entrance
  // (aki-app builds the spring + real settle detection); the audio team owns the stinger.
  const engine = VNEngine(buildIntroScript({ startDemo, endIntro }), {
    performers: {
      Aki: (name, params) => state.akiPerform?.(name, params),
      audio: (name) => {
        if (name === "stinger") playStinger(); // fire-and-forget — nothing awaits the ring-out
        else console.warn(`[tea] audio can't perform "${name}"`);
      },
    },
  });

  const respond: Intro["respond"] = (intent) => {
    if (!stream) return "early";
    const result = respondStream(stream, intent, cfg);
    if (result.kind === "falseAlarm") return "early"; // nothing asked (or already answered) — hint, keep going
    stopDemo();
    const correct = result.facts.correct;
    track("tea-practice", { result: correct ? "right" : "wrong" });
    if (correct) state.emote.set({ glyph: "🎉" }); // scene effect; the FACE comes from the script's mood
    phase.set("dialogue");
    engine.start(correct ? "right" : "wrong");
    return "answered";
  };

  return {
    engine,
    phase,
    begin: () => {
      if (phase.peek() !== "idle") return;
      phase.set("dialogue");
      engine.start();
    },
    respond,
    dispose: () => {
      stopDemo();
      engine.interrupt(); // skip any running performances — a discarded engine must not orphan a half-finished slide
      state.talking.set(false);
    },
    beginDemo: startDemo,
  };
};

// One intro per scene-app instance — the app is a page-lifetime singleton (ThreeView keeps it
// across React remounts), so the intro runs once per visit and its state survives tab switches.
const intros = new WeakMap<AkiSceneApp, Intro>();

// The live intro, stashed OUTSIDE the module so a hot re-eval can find and rebuild it (module
// state is fresh after every edit). Dev-only plumbing; harmless single global in prod.
type Live = { app: AkiSceneApp; intro: Intro };
const liveRef = globalThis as typeof globalThis & { __teaIntroLive?: Live };

export const getIntro = (app: AkiSceneApp): Intro => {
  let intro = intros.get(app);
  if (!intro) {
    intro = makeIntro(app);
    intros.set(app, intro);
    liveRef.__teaIntroLive = { app, intro };
  }
  return intro;
};

// ---- hot reload: edit this file and the CURRENT BEAT replays live ----
// On re-eval we rebuild the live intro against the NEW script, reusing the durable pieces (the
// phase Value; Aki's `entered` guard lives on the app) and restarting the engine at the label it
// was in — position by NAME survives line edits where a raw pc would drift — and fast-forwards
// to the BEAT you were on (says stream past, waits/joins skip, actions stay silent: no stinger
// blip, no re-bow). React-refresh re-renders the .tsx consumers, which call getIntro() and pick
// up the rebuilt intro (the stage remounts onto the new engine). Structural edits ABOVE your
// line can drift the landing by the number of beats added/removed — nearest-beat is the best
// an edited script can promise.
if (import.meta.hot) {
  const live = liveRef.__teaIntroLive;
  if (live && live.intro.phase.peek() !== "idle") {
    const { app, intro: old } = live;
    const label = old.engine.snapshot().label;
    const phase = old.phase;
    old.dispose(); // stop the old demo timer / talking flag before the new engine takes over
    const next = makeIntro(app, { phase });
    intros.set(app, next);
    liveRef.__teaIntroLive = { app, intro: next };
    if (phase.peek() === "dialogue")
      next.engine.start(label, { toBeat: old.engine.snapshot().beat });
    else if (phase.peek() === "demo") next.beginDemo(); // relaunch a fresh practice round
  }
}
