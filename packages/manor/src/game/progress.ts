import { minuteOfDay } from "./clock";
import { everySquare, tendingOf } from "./garden";
import { needOf } from "./game";
import { offered } from "./lab";
import { outingOf } from "./outing";
import { BEDTIME, DAY, WAKE } from "./tuning";
import type { BatchStep, Game } from "./types";

// How far through what she is at someone is: for a ring round the picture of her work in the
// list of the household (the author's, 2026-11-16: "I like the ring around the job badge"). Only
// what has an end is measured, and of that only what is done: a batch of baking, the day's round of the garden, an outing against
// when she is due back, a night's sleep. Keeping the shop has no end, and has no share.

export type Progress = {
  /** How far through it she is, from 0 to 1; null when what she is at has no end to measure. */
  share: number | null;
  /** She is stood waiting for something (flour, the oven, room on the shelf, something to sell). */
  waiting: boolean;
  /** She is at the last step of a thing counted by its steps: nothing more will be counted until the whole of it is done. */
  lastStep: boolean;
};

/**
 * On the last step, the share to show after so many seconds at it: it goes on from where the
 * steps left it towards the whole, quickly at first and ever more slowly, and never gets there
 * (the author's, 2026-11-16: "when you're on the last step, the bar continues to fill kind of
 * logarithmically, so it approaches but never reaches 100%. So in most cases, on average, when
 * she actually completes it, the bar should almost be completely full"). Without it the last
 * part of the ring would stand empty until the moment it was all done.
 */
export const nearing = (share: number, seconds: number): number => share + (1 - share) * (1 - Math.exp(-Math.max(0, seconds) / NEARING_SECONDS));
/** How quickly: after this long, some two thirds of what was left is filled. Setting a batch on the shelf takes about ten seconds, by when nineteen parts in twenty of it are. */
export const NEARING_SECONDS = 3.2;

/** The steps of a batch, in the order they are taken. */
const BATCH: BatchStep[] = ["fetch", "knead", "bake", "deliver"];

const within = (share: number): number => Math.max(0, Math.min(1, share));

/** How far through what she is at someone is; null when she is at nothing. */
export const progressOf = (game: Game, id: string): Progress | null => {
  // Out of doors: from when she was sent to when she is due home at the latest. (She is often back sooner.)
  const out = outingOf(game, id);
  if (out) return { share: within((game.clock - out.sent) / Math.max(1, out.back - out.sent)), waiting: false, lastStep: false };
  // Abed: the night, from bedtime to waking.
  if (game.abed[id] === "in") {
    const minute = minuteOfDay(game.clock);
    const since = minute >= BEDTIME ? minute - BEDTIME : minute + DAY - BEDTIME;
    return { share: within(since / (DAY - BEDTIME + WAKE)), waiting: false, lastStep: false };
  }
  const task = game.tasks[id];
  if (!task) return null;
  const waiting = needOf(game, id) !== null;
  if (task.job === "bake") {
    // A batch: fetched, kneaded, baked, set on the shelf. Only a step that is done counts (the author's, 2026-11-16: "I would like it to
    // start at empty, and then once the first task is complete, like once she grabs the flour, then you see the first slice of it"):
    // on her way to the pantry she is at nothing, and with the loaves in her arms she is three parts of four through.
    const done = BATCH.indexOf(task.step !== null && task.step !== "return" ? task.step : task.next);
    return { share: done / BATCH.length, waiting, lastStep: done === BATCH.length - 1 };
  }
  if (task.job === "garden") {
    // The day's round: of the squares she has in her care, those that want nothing more of her today.
    const hers = everySquare(game).filter(({ bed }) => bed.crop !== null || bed.wanted !== null);
    const left = hers.filter(({ bed }) => tendingOf(bed) !== null).length;
    return { share: hers.length > 0 ? 1 - left / hers.length : null, waiting, lastStep: false };
  }
  // The alchemy: the measure, as full as it is. (With nothing left to invent there is nothing to be through.)
  if (task.job === "lab") return { share: offered(game).length > 0 ? within(game.lab.progress / game.lab.needed) : null, waiting, lastStep: false };
  return { share: null, waiting, lastStep: false };
};
