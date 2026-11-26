// Aki — the BEHAVIOR layer: a thin wrapper over the raw AkiRig (aki-rig.ts) that adds autonomy. It takes
// higher-level intent (the selected `eyes`/`mouth`, plus `blink`/`talking`), owns the blink + talk timer
// loops, and drives the rig's LIVE eyes/mouth Values over time — so `eyes` here is an *intent* (blink can
// transiently override what's drawn), whereas the rig's `eyes` is exactly what's on screen. Everything
// else (pose/accessories/markers/transform) passes straight through to the rig. Mount this for the
// autonomous character; mount AkiRig directly for frame-perfect manual control.

import { Group, Vector3 } from "three";

import { mount, peek, type Scope, type UsedAs, Value } from "@kitsune/common-web";

import { AkiRig } from "./aki-rig";
import { type EyesName, type MouthName, type PoseName } from "./names";

export type AkiProps = {
  pose?: UsedAs<PoseName>;
  eyes?: UsedAs<EyesName>; // the SELECTED expression (blink may transiently override the drawn frame)
  mouth?: UsedAs<MouthName>; // the SELECTED mouth (talk cycles frames while active)
  glasses?: UsedAs<boolean>;
  ears?: UsedAs<boolean>;
  angryMark?: UsedAs<boolean>;
  drop?: UsedAs<boolean>;
  blink?: UsedAs<boolean>;
  talking?: UsedAs<boolean>;
  position?: UsedAs<Vector3>;
  scale?: UsedAs<number>;
};

// Expressions that already read as shut — blinking these just flickers the eyes open, so the blink loop
// keeps running (resumes on open-eyed expressions) but skips the visual swap.
const CLOSED_EYES = new Set<EyesName>(["closed", "happy", "embarrassed"]);
const TALK_FRAMES = ["semi-open", "open", "semi-open", "closed"] as const satisfies readonly MouthName[];

const BLINK_FRAME_MS = 55; // step between blink frames (full swap ≈ 165 ms)
const BLINK_GAP_MIN_MS = 2500;
const BLINK_GAP_JITTER_MS = 3500; // gap between blinks = min + random·jitter
const TALK_FRAME_MS = 100; // mouth cycle ~10fps

export const Aki = (scope: Scope, props: AkiProps = {}): { mesh: Group; ready: Promise<void> } => {
  const {
    pose = "relaxed-hands",
    eyes = "open",
    mouth = "closed",
    glasses = false,
    ears = false,
    angryMark = false,
    drop = false,
    blink = true,
    talking = false,
    position = new Vector3(),
    scale = 1,
  } = props;

  // The live frames the rig actually draws. Blink/talk write these; a manual eyes/mouth change resets them.
  const liveEyes = Value<EyesName>(peek(eyes));
  const liveMouth = Value<MouthName>(peek(mouth));

  // intent → live (show a manual change immediately; blink/talk take over from there)
  scope.effect((use) => liveEyes.set(use(eyes)));
  scope.effect((use) => liveMouth.set(use(mouth)));

  // ---- blink: gated on `blink`; timers on the per-run scope so they clear when it flips ----
  scope.effect((use, runScope) => {
    if (!use(blink)) {
      liveEyes.set(peek(eyes)); // restore the selected eyes when blinking is off
      return;
    }
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const at = (fn: () => void, ms: number) => {
      const t = setTimeout(() => (timers.delete(t), fn()), ms);
      timers.add(t);
    };
    const once = () => {
      if (CLOSED_EYES.has(peek(eyes))) return;
      // The restore frame peeks at FIRE time — the selected eyes may have changed mid-blink.
      const frames: (() => EyesName)[] = [() => "semi-open", () => "closed", () => "semi-open", () => peek(eyes)];
      frames.forEach((f, i) => at(() => liveEyes.set(f()), BLINK_FRAME_MS * i));
    };
    const schedule = () => at(() => (once(), schedule()), BLINK_GAP_MIN_MS + Math.random() * BLINK_GAP_JITTER_MS);
    schedule();
    runScope.add(() => timers.forEach(clearTimeout));
  });

  // ---- talk: gated on `talking`; cycles the mouth, restores the selected mouth on stop ----
  scope.effect((use, runScope) => {
    if (!use(talking)) {
      liveMouth.set(peek(mouth));
      return;
    }
    let frame = 0;
    const id = setInterval(() => liveMouth.set(TALK_FRAMES[frame++ % TALK_FRAMES.length]), TALK_FRAME_MS);
    runScope.add(() => (clearInterval(id), liveMouth.set(peek(mouth))));
  });

  // Drive the raw rig with the live frames + straight-through props. `mount` registers it (HMR-swappable).
  const group = new Group();
  const rig = mount(AkiRig, { pose, eyes: liveEyes, mouth: liveMouth, glasses, ears, angryMark, drop, position, scale }, group, scope);
  return { mesh: group, ready: rig.ready };
};
