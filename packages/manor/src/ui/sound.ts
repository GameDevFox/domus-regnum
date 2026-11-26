// Small synthesised sounds: no audio files. Everything is a short pluck or chime, quiet enough to
// sit under a long session. The browser only lets audio start after a click or a key, so the
// context is created on the first one.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

const MASTER_GAIN = 0.16;
const MUTE_KEY = "manor.muted";

try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  muted = false;
}

export const unlockAudio = (): void => {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return;
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER_GAIN;
  master.connect(ctx.destination);
};

export const isMuted = (): boolean => muted;

export const toggleMute = (): boolean => {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : MASTER_GAIN;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Not remembered, then.
  }
  return muted;
};

type Note = { freq: number; at?: number; dur?: number; type?: OscillatorType; gain?: number };

const play = (notes: Note[]): void => {
  if (!ctx || !master || muted) return;
  const now = ctx.currentTime;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const start = now + (n.at ?? 0);
    const dur = n.dur ?? 0.18;
    osc.type = n.type ?? "triangle";
    osc.frequency.value = n.freq;
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(n.gain ?? 0.5, start + 0.008);
    env.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(env);
    env.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
};

// A pentatonic scale: any run of these sounds agreeable.
const SCALE = [392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];

/** A coin in the till. */
export const sfxCoin = (): void => play([{ freq: 1318.5, dur: 0.09, gain: 0.3 }, { freq: 1760, at: 0.05, dur: 0.14, gain: 0.3 }]);

/** A serving at an occasion: higher the more it was worth. */
export const sfxServe = (value: number, grace: boolean): void => {
  const step = Math.min(SCALE.length - 1, Math.floor(Math.log2(Math.max(1, value))));
  play([{ freq: SCALE[step] * (grace ? 1 : 0.5), dur: 0.3, type: grace ? "sine" : "triangle", gain: 0.5 }]);
};

/** A batch out of the oven. */
export const sfxBatch = (): void => play([{ freq: 330, dur: 0.1, gain: 0.25 }, { freq: 440, at: 0.07, dur: 0.14, gain: 0.25 }]);

/** Burnt. */
export const sfxBurnt = (): void => play([{ freq: 180, dur: 0.25, type: "sawtooth", gain: 0.18 }, { freq: 140, at: 0.1, dur: 0.3, type: "sawtooth", gain: 0.18 }]);

/** Someone walked out unserved. */
export const sfxLost = (): void => play([{ freq: 260, dur: 0.16, type: "sine", gain: 0.25 }, { freq: 208, at: 0.1, dur: 0.22, type: "sine", gain: 0.25 }]);

/** The house opens. */
export const sfxBell = (): void => play([{ freq: 880, dur: 0.6, type: "sine", gain: 0.4 }, { freq: 1320, dur: 0.5, type: "sine", gain: 0.15 }]);

/** A pick-up or a put-down. */
export const sfxTap = (): void => play([{ freq: 520, dur: 0.06, type: "sine", gain: 0.25 }]);

export const sfxResult = (tier: "shortfall" | "success" | "triumph"): void => {
  if (tier === "shortfall") play([{ freq: 392, dur: 0.4, type: "sine" }, { freq: 330, at: 0.25, dur: 0.5, type: "sine" }, { freq: 262, at: 0.55, dur: 0.9, type: "sine" }]);
  else {
    const run = tier === "triumph" ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [523.25, 659.25, 783.99];
    play(run.map((freq, i) => ({ freq, at: i * 0.13, dur: i === run.length - 1 ? 1.0 : 0.3, gain: 0.5 })));
  }
};

/** A bird somewhere in the garden: two or three quick falling notes. */
export const sfxBird = (): void => {
  const base = 2200 + Math.random() * 1400;
  const notes = 2 + Math.floor(Math.random() * 2);
  play(Array.from({ length: notes }, (_, i) => ({ freq: base * (1 - i * 0.08), at: i * 0.09, dur: 0.07, type: "sine" as OscillatorType, gain: 0.07 })));
};

/** A cricket after dark. */
export const sfxCricket = (): void => play(Array.from({ length: 4 }, (_, i) => ({ freq: 4300, at: i * 0.055, dur: 0.03, type: "sine" as OscillatorType, gain: 0.035 })));

/** A fancy caught: just what was wanted. */
export const sfxFancy = (): void => play([{ freq: 1046.5, dur: 0.12, type: "sine", gain: 0.45 }, { freq: 1568, at: 0.08, dur: 0.12, type: "sine", gain: 0.45 }, { freq: 2093, at: 0.16, dur: 0.35, type: "sine", gain: 0.4 }]);

/** Something new: an invention, a hire, a room. */
export const sfxNew = (): void => play([{ freq: 659.25, dur: 0.14 }, { freq: 880, at: 0.1, dur: 0.14 }, { freq: 1174.66, at: 0.2, dur: 0.4 }]);
