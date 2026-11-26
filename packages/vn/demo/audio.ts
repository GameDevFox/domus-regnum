// HOST-side audio for the demo — NOT part of @kitsune/vn. It rides entirely on the engine's `exec`
// hook: background music is a fire-and-forget exec (the host tracks "now playing"); transient sounds
// (a one-shot sting, a looping ambient that should stop when you move on) use `effect`, whose
// returned cleanup is registered via ctx.onLeave and fires when the beat is left. This is the whole
// point of keeping audio out of the engine — the engine does dialogue, the game does sound.

import { effect } from "../src/index";

const SOUND: Record<string, string> = {
  "music-meadow": "/assets/music-meadow.opus",
  "music-club": "/assets/music-club.ogg",
  "sfx-select": "/assets/sfx-select.opus",
  "ambient-clock": "/assets/ambient-clock.ogg",
};

const MUSIC_VOL = 0.5;
const SFX_VOL = 0.7;

// Logical state mirror, published on window so the headless harness can verify the wiring (what the
// host THINKS is playing) without needing to actually hear anything.
const activeOneShots = new Set<string>();
let currentMusicName: string | null = null;
const publish = () => {
  if (typeof window === "undefined") return;
  (window as unknown as { vnAudio: unknown }).vnAudio = {
    music: currentMusicName,
    active: [...activeOneShots],
  };
};

// Linearly ramp an element's volume; pause it at the end of a fade-out.
const ramp = (el: HTMLAudioElement, to: number, ms: number) => {
  const from = el.volume;
  const start = performance.now();
  const step = () => {
    const p = ms <= 0 ? 1 : Math.min(1, (performance.now() - start) / ms);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * p));
    if (p < 1) requestAnimationFrame(step);
    else if (to === 0) el.pause();
  };
  requestAnimationFrame(step);
};

let currentMusic: HTMLAudioElement | null = null;

export const audio = {
  // Persistent background music: crossfade to `name`, looping. No cleanup — it plays until changed
  // or explicitly stopped; the host owns "now playing". A no-op if it's already current.
  music(name: string | null, fadeMs = 700) {
    if (name === currentMusicName) return;
    const prev = currentMusic;
    if (prev) ramp(prev, 0, fadeMs);
    currentMusicName = name;
    if (name && SOUND[name]) {
      const next = new Audio(SOUND[name]);
      next.loop = true;
      next.volume = 0;
      void next.play().catch(() => {}); // may reject until a user gesture — the demo clicks first
      ramp(next, MUSIC_VOL, fadeMs);
      currentMusic = next;
    } else {
      currentMusic = null;
    }
    publish();
  },

  // Play `name` once (or looping for an ambient). Returns a stop fn — pass it to onLeave for a
  // transient sound that should end when the player moves on.
  play(name: string, opts: { loop?: boolean } = {}): () => void {
    const url = SOUND[name];
    if (!url) return () => {};
    const el = new Audio(url);
    el.loop = !!opts.loop;
    el.volume = SFX_VOL;
    activeOneShots.add(name);
    publish();
    const stop = () => {
      el.pause();
      el.currentTime = 0;
      activeOneShots.delete(name);
      publish();
    };
    el.addEventListener("ended", () => {
      activeOneShots.delete(name);
      publish();
    });
    void el.play().catch(() => {});
    return stop;
  },
};

// ---- exec-ready utilities (what scripts actually call) ----

// Persistent: change background music. Fire-and-forget, no cleanup; host tracks "now playing".
export const playMusic = (name: string) => () => audio.music(name);

// One-shot sting: fire and let it ring out — no onLeave (it cleans itself up on "ended").
export const playSting = (name: string) => () => void audio.play(name);

// Transient looping ambient: starts on the beat, stops when you advance off it (onLeave) — the
// "voice clip" pattern. `effect` wires audio.play's returned stop fn to onLeave for us.
export const playAmbient = (name: string) => effect(() => audio.play(name, { loop: true }));
