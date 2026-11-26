// App-hosts for the Aki component: self-contained Three apps (canvas/renderer/ortho-camera/scene/scope +
// state Values) assembled with the Builder, mounted via the reactive registry, and rendered by
// <ThreeView>. Two framings share one Aki component + one Builder skeleton (`buildAkiApp`):
//   • portraitApp — the /aki tab: camera zoom (Value) + pan (Value), Aki centred at the origin.
//   • sceneApp    — the /tea scene: fixed camera, Aki placed via position/scale Values (drag/scroll).
// State lives in Values so React drives it declaratively (useApp/useValue) and the app persists across
// React unmount (see <ThreeView>).

import { OrthographicCamera, Scene, Vector3, WebGLRenderer } from "three";

import { Builder } from "@kitsune/common";
import { batch, mount, Scope, setupHMR, spring, Value } from "@kitsune/common-web";
import type { ThreeApp } from "@kitsune/common-web/src/react";

import { Aki, type AkiProps } from "./aki";
import { Emote, type EmoteState } from "./emote";
import { BASE_HEIGHT } from "./layout";
import { type EyesName, type MouthName, type PoseName } from "./names";

setupHMR(); // let the kitsuneHMR plugin hot-swap the Aki component in place

// Tailwind: make <ThreeView>'s div fill its parent and stretch the canvas it appends to 100%.
export const CANVAS_FILL = "absolute inset-0 h-full w-full [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full";

const MAX_PIXEL_RATIO = 2; // cap DPR — retina crispness without 3×+ fill cost

// ---- shared character state (the declarative surface both views + React drive) ----
export type AkiState = {
  pose: Value<PoseName>;
  eyes: Value<EyesName>;
  mouth: Value<MouthName>;
  glasses: Value<boolean>;
  ears: Value<boolean>;
  angryMark: Value<boolean>;
  drop: Value<boolean>;
  blink: Value<boolean>;
  talking: Value<boolean>;
};
// Every view's state also carries the live canvas size (set by resize) for framing math, plus a
// `loading` flag that flips false once Aki's textures have loaded (drives the scene's loading screen).
export type Framed = { width: Value<number>; height: Value<number>; loading: Value<boolean> };

const makeAkiState = (): AkiState => ({
  pose: Value<PoseName>("relaxed-hands"),
  eyes: Value<EyesName>("open"),
  mouth: Value<MouthName>("closed"),
  glasses: Value(false),
  ears: Value(false),
  angryMark: Value(false),
  drop: Value(false),
  blink: Value(true),
  talking: Value(false),
});

const characterProps = (s: AkiState): AkiProps => ({ ...s }); // AkiState keys ARE the character props

const setFrustum = (cam: OrthographicCamera, x: number, y: number, halfW: number, halfH: number) => {
  cam.left = x - halfW;
  cam.right = x + halfW;
  cam.top = y + halfH;
  cam.bottom = y - halfH;
  cam.updateProjectionMatrix();
};

// The shared skeleton: canvas/renderer/ortho-camera/scene/scope + `makeState`, mounts Aki with
// `contentProps`, and each frame updates the camera via `frame` then renders. `resize` records the
// canvas size into state.width/height for the framing math.
const buildAkiApp = async <S extends AkiState & Framed>(
  makeState: () => S,
  contentProps: (s: S) => AkiProps,
  frame: (cam: OrthographicCamera, s: S) => void,
  extras?: (scene: Scene, scope: Scope, state: S, time: Value<number>) => void, // mount extra scene content (e.g. emotes)
): Promise<ThreeApp & { state: S }> => {
  // The frame clock, published per-frame (batched) — per-frame animation (the emote system)
  // rides this Value instead of a private RAF, so a virtual clock could drive it.
  const time = Value(0);
  const { data } = await Builder()
    .add("canvas", () => document.createElement("canvas"))
    .add(
      "renderer",
      ({ canvas }) => {
        const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
        renderer.setClearColor(0x000000, 0); // transparent → whatever's behind the canvas shows through
        return renderer;
      },
      ["canvas"],
      (renderer) => (renderer.setAnimationLoop(null), renderer.dispose()),
    )
    .add("camera", () => {
      const cam = new OrthographicCamera(-1, 1, 1, -1, -10, 10);
      cam.position.z = 5;
      return cam;
    })
    .add("scene", () => new Scene())
    .add("scope", () => Scope())
    .add("state", makeState)
    .add(
      "content",
      ({ scene, scope, state }) => {
        const aki = mount(Aki, contentProps(state), scene, scope);
        void aki.ready.then(() => state.loading.set(false)); // reveal the scene once textures are in
        extras?.(scene, scope, state, time);
        return aki;
      },
      ["scene", "scope", "state"],
    )
    .add(
      "animate",
      ({ renderer, scene, camera, state }) =>
        (t: number) => {
          batch(() => time.set(t));
          frame(camera, state);
          renderer.render(scene, camera);
        },
      ["renderer", "scene", "camera", "state"],
    )
    .add(
      "resize",
      ({ renderer, state }) =>
        (w: number, h: number) => {
          renderer.setSize(w, h, false); // CSS size is handled by the canvas fill classes
          state.width.set(w);
          state.height.set(h);
        },
      ["renderer", "state"],
    )
    .run();

  data.renderer.setAnimationLoop(data.animate);
  return { renderer: data.renderer, resize: data.resize, state: data.state };
};

// ============================ portrait (/aki) ============================
// Figure world bounds (base spans y∈[-0.5, 0.5]; ears to ~0.565) + margin; used for fit + pan clamping.
export const PORTRAIT = { FIGURE_TOP: 0.6, FIGURE_BOTTOM: -0.55, FIGURE_HALF_W: 0.4, DEFAULT_ZOOM: 0.38 };
const FIT_H = PORTRAIT.FIGURE_TOP - PORTRAIT.FIGURE_BOTTOM;
const INITIAL_PAN = { x: 0, y: 0.077 };

// css px per world unit at a zoom: fit fills the viewport height; 1:1 maps a base pixel to a CSS pixel.
const scaleFor = (zoom: number, viewH: number) => {
  const fit = viewH / FIT_H;
  return fit + zoom * (BASE_HEIGHT - fit);
};
// Half-extents of the visible world window at a zoom + viewport (exported for the drag handler).
export const portraitMetrics = (zoom: number, w: number, h: number) => {
  const halfH = h / scaleFor(zoom, h) / 2;
  return { halfH, halfW: halfH * (w / h) };
};
const clamp1 = (c: number, half: number, lo: number, hi: number) => (hi - lo <= 2 * half ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, c)));
export const clampPortraitPan = (pan: { x: number; y: number }, zoom: number, w: number, h: number) => {
  const { halfW, halfH } = portraitMetrics(zoom, w, h);
  return { x: clamp1(pan.x, halfW, -PORTRAIT.FIGURE_HALF_W, PORTRAIT.FIGURE_HALF_W), y: clamp1(pan.y, halfH, PORTRAIT.FIGURE_BOTTOM, PORTRAIT.FIGURE_TOP) };
};

export type PortraitState = AkiState & Framed & { zoom: Value<number>; pan: Value<{ x: number; y: number }> };
export type AkiPortraitApp = ThreeApp & { state: PortraitState };

export const portraitApp = (): Promise<AkiPortraitApp> =>
  buildAkiApp<PortraitState>(
    () => ({ ...makeAkiState(), zoom: Value(PORTRAIT.DEFAULT_ZOOM), pan: Value({ ...INITIAL_PAN }), width: Value(1), height: Value(1), loading: Value(true) }),
    characterProps,
    (cam, s) => {
      const { halfW, halfH } = portraitMetrics(s.zoom.peek(), s.width.peek(), s.height.peek());
      const { x, y } = s.pan.peek();
      setFrustum(cam, x, y, halfW, halfH);
    },
  );

// ============================ scene (/tea) ============================
const SCENE = { FRAME_TOP: 0.62, FRAME_BOTTOM: -0.32 };
// Where Aki waits before her entrance: fully past the frame's right edge (frame halfW maxes out
// around 0.76 at the widest aspect, plus her half-width at scene scale ≈ 0.6).
const SLIDE_IN_FROM_X = 1.6;
const SLIDE_IN = { stiffness: 14, damping: 7.5 }; // an unhurried ≈2s glide (critical damping ≈ 2·√stiffness)
const SCENE_FRAME_H = SCENE.FRAME_TOP - SCENE.FRAME_BOTTOM; // world height of the fixed scene frame
export const SCENE_PLACEMENT = { x: 0.238, y: -0.225, scale: 1.558 }; // hand-tuned resting placement
// Where an emote appears in the scene (world units): just above Aki's head, a touch in front (z). Size
// is world height. Hand-placed — tweak to taste.
export const EMOTE_ANCHOR = new Vector3(0.25, 0.50, 0.02);
export const EMOTE_SIZE = 0.16;

export type SceneState = AkiState &
  Framed & {
    position: Value<Vector3>;
    scale: Value<number>;
    emote: Value<EmoteState | null>;
    // Flipped when the player starts the scene (the title gate) — fades the title card.
    revealed: Value<boolean>;
    // The emote column feed on the right. Hidden until something actually streams to it
    // (the tutorial demo / the in-scene cue game); bubbles dissolve in place while hidden.
    emoteColumn: Value<boolean>;
    // Aki's performance repertoire (assigned by the scene app once its scope exists) — the VN
    // performer surface: "enter" (slide-in spring, done = actually settled at her mark), "bow"
    // (a quick dip). Every handle: done resolves on completion, skip snaps to the end state.
    // Structurally matches @kitsune/vn's PerformanceHandle without this file knowing about vn.
    akiPerform?: (name: string, params: Record<string, unknown>) => { done: Promise<void>; skip: () => void } | void;
  };
export type AkiSceneApp = ThreeApp & { state: SceneState };

export const sceneApp = (): Promise<AkiSceneApp> =>
  buildAkiApp<SceneState>(
    () => ({
      ...makeAkiState(),
      // She starts OFF-frame right; the reveal effect below springs her to the resting placement.
      position: Value(new Vector3(SLIDE_IN_FROM_X, SCENE_PLACEMENT.y, 0)),
      scale: Value(SCENE_PLACEMENT.scale),
      width: Value(1),
      height: Value(1),
      loading: Value(true),
      emote: Value<EmoteState | null>(null),
      revealed: Value(false),
      emoteColumn: Value(false),
    }),
    (s) => ({ ...characterProps(s), position: s.position, scale: s.scale }),
    (cam, s) => {
      const halfH = SCENE_FRAME_H / 2;
      const centerY = (SCENE.FRAME_TOP + SCENE.FRAME_BOTTOM) / 2;
      setFrustum(cam, 0, centerY, halfH * (s.width.peek() / s.height.peek()), halfH);
    },
    (scene, scope, state, time) => {
      mount(
        Emote,
        { emote: state.emote, time, position: EMOTE_ANCHOR, size: EMOTE_SIZE, column: state.emoteColumn },
        scene,
        scope,
      );

      // Aki's performance repertoire for the VN script's `action`/`await`. Each performance owns a
      // child scope (cleanup = the motion lets go of her position) and a `finish` that is both the
      // natural completion and the skip ("place her at her end state NOW").
      const REST = new Vector3(SCENE_PLACEMENT.x, SCENE_PLACEMENT.y, 0);
      const SETTLE_EPS = 0.005; // world units — visually indistinguishable from seated (don't wait out the asymptotic tail)
      const BOW_DEPTH = 0.045; // world units — a polite dip, not a stage bow
      const BOW_S = 0.55; // full down-and-up
      let entered = false;

      const performance = (run: (slide: Scope, finish: () => void, base: Vector3) => void) => {
        const slide = scope.child();
        let resolve!: () => void;
        const done = new Promise<void>((r) => (resolve = r));
        const base = state.position.peek().clone();
        const finish = () => {
          slide.cleanup(); // re-entrant-safe (scope guards); effects die before the end-state task
          resolve(); // idempotent: resolving twice is a no-op
        };
        run(slide, finish, base);
        return { done, skip: finish };
      };

      // "enter": a spring from wherever she stands to her mark; done = genuinely settled.
      const enter = () => {
        state.revealed.set(true); // fades the title card
        if (entered) return { done: Promise.resolve(), skip: () => {} };
        entered = true;
        return performance((slide, finish) => {
          // End state FIRST: cleanup runs tasks in reverse, so this fires AFTER the effect
          // teardowns — writing the final position with no live watchers left to re-trigger.
          slide.add(() => state.position.set(REST.clone()));
          const goal = Value(state.position.peek().clone()); // spring starts where she stands
          const sprung = spring(slide, time, goal, SLIDE_IN);
          slide.effect((use) => state.position.set(use(sprung)));
          slide.effect((use) => {
            if (use(state.position).distanceTo(REST) < SETTLE_EPS) finish();
          });
          goal.set(REST.clone()); // and off she glides
        });
      };

      // "bow": a quick sinusoidal dip from where she stands — fire alongside a line for a greeting.
      const bow = () =>
        performance((slide, finish, base) => {
          slide.add(() => state.position.set(base.clone())); // end state = back upright (runs after teardowns)
          const t0 = time.peek();
          slide.effect((use) => {
            const p = (use(time) - t0) / 1000 / BOW_S;
            if (p >= 1) {
              finish();
              return;
            }
            state.position.set(new Vector3(base.x, base.y - BOW_DEPTH * Math.sin(Math.PI * p), base.z));
          });
        });

      state.akiPerform = (name) => {
        if (name === "enter") return enter();
        if (name === "bow") return bow();
        console.warn(`[aki] no such performance "${name}"`);
      };

      // Dev probe (same spirit as the game app's window.domus): lets e2e/drives read her actual
      // position instead of guessing from pixels. Stripped from prod builds.
      if (import.meta.env.DEV) {
        (window as unknown as Record<string, unknown>).__akiScene = { position: state.position, rest: REST, talking: state.talking };
      }
    },
  );
