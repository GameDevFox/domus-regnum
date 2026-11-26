import { CAST, giveOrders, inRect, isIdle } from "../space";
import type { Actor } from "../space";
import { INVENTION_GROWTH, INVENTION_MINUTES, MINUTES_PER_SECOND } from "./tuning";
import type { DeviceId, Game, JobId, LabTask } from "./types";

// Alchemy, as the house meets it: the hours an alchemist is at work in the laboratory become devices.
// It is a job like the baking, given at the laboratory, and only an alchemist may have it (the
// author's, 2026-11-16: "Alchemy lab as an assignable job that ONLY alchemists (current only The
// Master) can be assigned to"). A new game gives it to the Master, who is the only one.
// Each does one thing, and that thing is a step: a chore gone for good, or a time halved. None
// replaces anybody. It takes the drudgery off her, so that she can be put where a person is
// needed. They are carried over from the 2D game, where they fit a bakery.

export type Device = { id: DeviceId; glyph: string; name: string; /** What it does, in a sentence. */ effect: string };

export const DEVICES: Device[] = [
  { id: "dumbwaiter", glyph: "🛗", name: "Dumbwaiter", effect: "Carries for the kitchen: flour comes up in it from the pantry and loaves go through it to the shop. Nobody walks either way again" },
  { id: "everwarm", glyph: "♨️", name: "Ever-warm oven", effect: "Never needs stoking: a batch bakes in half the time" },
  { id: "till", glyph: "⚙️", name: "Clockwork till", effect: "Customers serve themselves at the counter: nobody has to keep the shop" },
];

const LABORATORY = "laboratory";

export const hasDevice = (game: Game, id: DeviceId): boolean => game.devices.includes(id);

/** The devices not yet made: what there is to choose from. */
export const offered = (game: Game): Device[] => DEVICES.filter((d) => !hasDevice(game, d.id));

/** Who is an alchemist: the Master, and nobody else yet. */
export const ALCHEMISTS: string[] = ["master"];
export const isAlchemist = (id: string): boolean => ALCHEMISTS.includes(id);

/** Whether someone may be given a job: anybody may have any, but the alchemy, which is an alchemist's. */
export const mayWork = (id: string, job: JobId): boolean => job !== "lab" || isAlchemist(id);

/** An alchemist's day at the alchemy: the Master's own, between his laboratory and his study (src/space/script.ts). */
const ALCHEMY = CAST.find((c) => c.id === "master")?.rounds ?? [];

/** Whoever has the alchemy goes on with it, round by round; with the measure full he waits to be told what it is spent on, and with nothing left to invent there is nothing to go on with. */
export const stepAlchemist = (game: Game, actor: Actor, task: LabTask): void => {
  if (!isIdle(actor)) return;
  if (game.lab.ready || offered(game).length === 0 || ALCHEMY.length === 0) {
    task.step = null;
    return;
  }
  // (He begins where in his day he always began: by his place in the household, as the rounds of housework do.)
  const n = game.turns[actor.id] ?? game.household.indexOf(actor.id);
  giveOrders(game.world, actor.id, ALCHEMY[n % ALCHEMY.length](game.world));
  game.turns[actor.id] = n + 1;
  task.step = "work";
};

/**
 * Whether anyone who has the alchemy is at work in the laboratory this moment: there, and busy at
 * something. (A round of it takes him up to the study and to his tea as well, which fill nothing.)
 */
export const inventing = (game: Game): boolean => {
  const room = game.world.plan.rooms.find((r) => r.id === LABORATORY);
  if (!room) return false;
  return game.world.actors.some((actor) => {
    if (game.posts[actor.id] !== "lab" || actor.busy <= 0) return false;
    const { pos } = actor.walker;
    return Math.abs(pos.y - game.world.plan.storeys[room.floor].y) < 0.01 && inRect(room.rect, pos.x, pos.z);
  });
};

/** His work fills the measure; full, it waits for the choice. With nothing left to invent it does not fill. */
export const stepLab = (game: Game, dt: number): void => {
  const { lab } = game;
  if (lab.ready || offered(game).length === 0 || !inventing(game)) return;
  fill(game, dt * MINUTES_PER_SECOND);
};

/** The measure is so many minutes fuller; full, it waits for the choice. */
const fill = (game: Game, minutes: number): void => {
  const { lab } = game;
  lab.progress = Math.min(lab.needed, lab.progress + minutes);
  if (lab.progress < lab.needed) return;
  lab.ready = true;
  game.feats.push({ who: "master", what: "invention", at: game.clock });
};

/** Something read fills a share of the measure, whoever read it and wherever he is. Nothing, with the measure full or nothing left to invent. */
export const study = (game: Game, share: number): void => {
  if (game.lab.ready || offered(game).length === 0) return;
  fill(game, game.lab.needed * share);
};

/** Choose the device the full measure is spent on. It is made at once, and the next takes longer. */
export const invent = (game: Game, id: DeviceId): boolean => {
  if (!game.lab.ready || hasDevice(game, id)) return false;
  game.devices.push(id);
  game.lab = { progress: 0, needed: game.lab.needed * INVENTION_GROWTH, ready: false };
  return true;
};

export const newLab = (): Game["lab"] => ({ progress: 0, needed: INVENTION_MINUTES, ready: false });
