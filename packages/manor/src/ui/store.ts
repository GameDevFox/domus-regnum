import { useSyncExternalStore } from "react";

import { advance, apply, createGame, isLive } from "../sim/game";
import { TICK } from "../sim/tuning";
import type { Command, Game } from "../sim/types";
import { observe } from "./effects";
import { sfxNew, sfxTap } from "./sound";

// One mutable Game, stepped by the browser's frame clock. React re-renders off a version counter
// rather than off the game object, which the sim mutates in place.

export type Selection = { kind: "maid"; id: string } | { kind: "room"; id: string } | null;

export type Ui = {
  game: Game;
  version: number;
  paused: boolean;
  speed: number;
  selection: Selection;
  /** Index of a room offer waiting for the player to pick the room it goes in. */
  placing: number | null;
  /** A spare device waiting to be installed. */
  installing: string | null;
  showHelp: boolean;
  dragging: string | null;
  /** The evening's offers are put aside for a moment so the house can be seen. */
  peek: boolean;
  /** Dusk has fallen and the evening has not been begun: the clock is held. */
  dusk: boolean;
  toasts: Toast[];
};

/** A line that flares over the house and fades: a level gained, a wing opened. */
export type Toast = { id: number; text: string; born: number };

const SAVE_KEY = "manor.save.v1";
const SPEEDS = [1, 2, 4, 8];
/** Never simulate more than this much per frame: a background tab must not fast-forward a day. */
const MAX_FRAME_SECONDS = 0.25;

const load = (): Game | null => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as Game) : null;
  } catch {
    return null;
  }
};

const newSeed = (): number => Math.floor(Math.random() * 1e9);

const saved = load();
const ui: Ui = {
  game: saved ?? createGame(newSeed()),
  version: 0,
  paused: false,
  speed: 1,
  selection: null,
  placing: null,
  installing: null,
  showHelp: saved === null,
  dragging: null,
  peek: false,
  dusk: false,
  toasts: [],
};

const listeners = new Set<() => void>();
const emit = (): void => {
  ui.version += 1;
  for (const l of listeners) l();
};

export const save = (): void => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(ui.game));
  } catch {
    // Storage full or blocked: the game still runs, it just won't resume.
  }
};

export const dispatch = (cmd: Command): boolean => {
  const phase = ui.game.phase;
  const ok = apply(ui.game, cmd);
  // A new day always begins with the clock running.
  if (ok && cmd.kind === "startDay") ui.paused = false;
  if (ok && cmd.kind === "assign") sfxTap();
  if (ok && (cmd.kind === "buy" || cmd.kind === "install")) sfxNew();
  if (ui.game.phase !== phase || !isLive(ui.game)) save();
  emit();
  return ok;
};

export const setUi = (patch: Partial<Ui>): void => {
  Object.assign(ui, patch);
  emit();
};

export const newGame = (seed: number = newSeed()): void => {
  ui.game = createGame(seed);
  ui.selection = null;
  ui.placing = null;
  ui.installing = null;
  ui.paused = false;
  ui.peek = false;
  ui.dusk = false;
  ui.toasts = [];
  save();
  emit();
};

export const togglePause = (): void => setUi({ paused: !ui.paused });
export const setSpeed = (speed: number): void => setUi({ speed, paused: false });
/** Changing speed from the keyboard leaves a paused game paused. */
export const cycleSpeed = (): void => setUi({ speed: SPEEDS[(SPEEDS.indexOf(ui.speed) + 1) % SPEEDS.length] });
export { SPEEDS };

let last = 0;
let carry = 0;
let lastPhase = ui.game.phase;

/** Is anything on screen that should hold the clock? */
const blocked = (): boolean => ui.paused || ui.dusk || ui.showHelp || ui.game.pending.length > 0;

let nextToast = 1;
const TOAST_SECONDS = 4.5;
export const toast = (text: string): void => {
  ui.toasts.push({ id: nextToast++, text, born: performance.now() / 1000 });
};
export { TOAST_SECONDS };

const frame = (now: number): void => {
  const real = Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
  last = now;
  const g = ui.game;
  if (!(isLive(g) && blocked())) {
    carry += real * (isLive(g) ? ui.speed : 1);
    const whole = Math.floor(carry / TICK) * TICK;
    if (whole > 0) {
      advance(g, whole);
      carry -= whole;
    }
  }
  if (g.phase !== lastPhase) {
    // Dusk: hold the clock until the player says the evening may begin.
    if (g.phase === "occasion") ui.dusk = true;
    if (g.phase !== "offers") ui.peek = false;
    lastPhase = g.phase;
    save();
  }
  observe(g, now / 1000);
  ui.toasts = ui.toasts.filter((t) => now / 1000 - t.born < TOAST_SECONDS);
  emit();
  requestAnimationFrame(frame);
};

export const startLoop = (): void => {
  last = performance.now();
  requestAnimationFrame(frame);
};

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Re-render on every frame. Components read the live game object straight off the returned Ui. */
export const useUi = (): Ui => {
  useSyncExternalStore(subscribe, () => ui.version);
  return ui;
};

export const getUi = (): Ui => ui;

// Test and debugging handle: Playwright and the console drive the same store the player does.
declare global {
  interface Window {
    manor?: { ui: Ui; dispatch: typeof dispatch; advance: (seconds: number) => void; newGame: typeof newGame; setUi: typeof setUi };
  }
}
if (typeof window !== "undefined") {
  window.manor = {
    ui,
    dispatch,
    advance: (seconds: number) => {
      advance(ui.game, seconds);
      emit();
    },
    newGame,
    setUi,
  };
}
