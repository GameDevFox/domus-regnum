import type { Call, Option, Step, Where } from "./types";

// The words a scene is written in: each makes one step.

export const say = (who: string | null, text: string): Step => ({ do: "say", who, text });
/** The scene's own voice: a line nobody speaks. */
export const tell = (text: string): Step => say(null, text);
export const enter = (who: string, at: Where): Step => ({ do: "enter", who, at });
export const leave = (who: string): Step => ({ do: "leave", who });
/** Send someone through each of these in turn, and wait for her. */
export const walk = (who: string, ...to: Where[]): Step => ({ do: "walk", who, to, wait: true });
/** The same, without waiting: the scene goes on while she walks. `arrive` waits for her later. */
export const start = (who: string, ...to: Where[]): Step => ({ do: "walk", who, to, wait: false });
export const arrive = (...who: string[]): Step => ({ do: "arrive", who });
export const face = (who: string, toward: Where): Step => ({ do: "face", who, toward });
export const wait = (seconds: number): Step => ({ do: "wait", seconds });
export const focus = (who: string | null): Step => ({ do: "focus", who });
export const choice = (...options: Option[]): Step => ({ do: "choice", options });
export const call = (run: Call): Step => ({ do: "call", run });
