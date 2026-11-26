import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { beginScene, endScene, sceneDue } from "../game";
import type { Game } from "../game";
import type { FollowZoom, Shot } from "./follow-zoom";
import { EYE_LIFT, START } from "./page-tuning";
import { onThePage } from "./ui-layer";
import "./curtain.css";

// The black before a scene and after it, as in a tactics game's cutscene (the author's asking,
// 2026-11-16, "it should look like a cutscene from Disgaea"). When a scene is due the house stops
// and the page fades to black. In the dark the scene is staged (src/game/staging.ts: everyone not
// in it put away, its people on their marks), the view is set as the scene is to be looked at,
// and the clock's speed is put by and set to the ordinary ×1, and the pause with it (a scene due
// while time is paused still plays). Then it fades in, and the scene plays. When the scene is
// over it fades to black again; in the dark the house is put back as it was, and the speed, the
// pause and the view are given back; and it fades in on the house as it was.
//
// The black is on the page only while it is coming or going: faded in, it is taken out.

/** Seconds to fade to black, and back. */
const FADE_SECONDS = 0.6;
/** Seconds the page stays black; and at the least this many frames, so that what is drawn of the scene has been drawn before it is seen. */
const DARK_SECONDS = 0.3;
const DARK_FRAMES = 2;
/** The ordinary speed of the clock, which a scene is played at. */
const SCENE_SPEED = 1;
/** The longest moment the fade is moved on by, in seconds: a stalled frame does not skip the fade. */
const LONGEST_FRAME = 0.1;

type CurtainProps = {
  game: Game;
  /** Ticks once a frame, in seconds. */
  frame: Value<number>;
  speed: Value<number>;
  paused: Value<boolean>;
  zoom: FollowZoom;
};

type Phase = "closing" | "dark" | "opening";

export const mountCurtain = (scope: Scope, { game, frame, speed, paused, zoom }: CurtainProps): { held: () => boolean; on: () => boolean } => {
  /** What the black is doing, and for what: to begin a scene, or to end one. Null while it is not on the page. */
  let now: { phase: Phase; for: "begin" | "end"; t: number; frames: number; black: HTMLElement } | null = null;
  /** What was put by when the scene began, to be given back when it is over. */
  let kept: { speed: number; paused: boolean; shot: Shot } | null = null;
  let last = frame.peek();

  /** Whether the house should be stepped no further: a scene is due, or over, or the black is on the page. */
  const held = (): boolean => now !== null || (game.scene === null && sceneDue(game) !== null) || (game.scene?.done === true && game.staged !== null);

  const draw = (opacity: number): void => {
    if (now) now.black.style.opacity = String(Math.max(0, Math.min(1, opacity)));
  };

  /** In the dark: the scene staged, or the house put back. */
  const inTheDark = (): void => {
    if (now?.for === "begin") {
      const scene = sceneDue(game);
      if (!scene) return;
      kept = { speed: speed.peek(), paused: paused.peek(), shot: zoom.take() };
      speed.set(SCENE_SPEED);
      paused.set(false);
      beginScene(game, scene);
    } else endScene(game);
  };

  /** Still in the dark, once what is drawn has caught up: the view set as the scene looks first, or given back as it was. */
  const beforeTheLight = (): void => {
    if (now?.for === "begin") {
      const view = game.scene?.scene.stage?.view;
      const first = game.world.actors.find((a) => a.id === game.scene?.focus) ?? game.world.actors[0];
      if (view && first) zoom.look({ x: first.walker.pos.x, y: first.walker.pos.y + EYE_LIFT, z: first.walker.pos.z }, view.azimuth, START.polar, view.distance);
    } else if (kept) {
      speed.set(kept.speed);
      paused.set(kept.paused);
      zoom.put(kept.shot);
      kept = null;
    }
  };

  scope.effect((use) => {
    const time = use(frame);
    const dt = Math.min(LONGEST_FRAME, Math.max(0, time - last));
    last = time;
    if (!now) {
      const begins = game.scene === null && sceneDue(game) !== null;
      const ends = game.scene?.done === true && game.staged !== null;
      if (!begins && !ends) return;
      const black = document.createElement("div");
      black.className = "curtain";
      black.setAttribute("aria-hidden", "true");
      onThePage(black);
      now = { phase: "closing", for: begins ? "begin" : "end", t: 0, frames: 0, black };
      draw(0);
      return;
    }
    now.t += dt;
    now.frames += 1;
    if (now.phase === "closing") {
      draw(now.t / FADE_SECONDS);
      if (now.t < FADE_SECONDS) return;
      Object.assign(now, { phase: "dark", t: 0, frames: 0 });
      draw(1);
      inTheDark();
    } else if (now.phase === "dark") {
      if (now.t < DARK_SECONDS || now.frames < DARK_FRAMES) return;
      beforeTheLight();
      Object.assign(now, { phase: "opening", t: 0, frames: 0 });
    } else {
      draw(1 - now.t / FADE_SECONDS);
      if (now.t < FADE_SECONDS) return;
      now.black.remove();
      now = null;
    }
  });
  scope.add(() => now?.black.remove());

  // While the black is on the page nothing on it answers: not the keys, and not a click (the black is over everything).
  scope.listen(
    window,
    "keydown",
    (e: KeyboardEvent) => {
      if (!now) return;
      e.stopImmediatePropagation();
      e.preventDefault();
    },
    { capture: true },
  );

  return { held, on: () => now !== null };
};
