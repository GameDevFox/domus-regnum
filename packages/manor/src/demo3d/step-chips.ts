import { WARES, callHome, cancel, goodOf, isAsking, outingOf, queueReturn, stepsOf, unqueue } from "../game";
import type { Game, OutingDoing, PlaceId, Step, StepState } from "../game";
import { placeSays } from "./outing-says";

// Someone's outing as a row of small chips, one a step (the author's "activity queue", 2026-11-16,
// in packages/domus/docs/design/22-reset-direction.md: "it fills up their activity queue with the
// steps that they need to complete that, such as walk to the destination, you know, place the
// order, and then return"): the walk, what she is to do, her asking or waiting, and the walk home.
// Done, under way, or to come, each is told by how it looks. What she is to do, or is doing, is
// cancelled by pressing it. What she has queued after it follows, in order, each with the
// picture of its place where that is another than the step's before (the author agreed it,
// 2026-11-16: "Her row of steps shows all that is queued, in order, and pressing a step takes it
// out"); pressed, it is taken out. And the walk home is always there for someone out: lit while
// it is asked for, and pressed to ask for it or no longer. The steps are the rules' (`stepsOf`).

/** What pressing a chip does: cancel what she is to do; take a queued thing out (`index`); ask for the walk home when it is done, or no longer; have her come home now. Nothing, for a step that is only shown. */
export type StepPress = "cancel" | "drop" | "queue" | "unqueue" | "home";

export type StepChip = {
  /** Which step it is, for the page and its checks: "walk", "do", "ask", "wait", "home". */
  is: Step["is"];
  glyph: string;
  state: StepState;
  /** What it is and how far on, and what pressing it does: for its tooltip and a screen reader. */
  says: string;
  press: StepPress | null;
  /** The walk home: lit while it is asked for, or begun. */
  lit?: boolean;
  /** Queued: its place in her queue, for taking it out. */
  index?: number;
  /** The place it is at, shown by its picture: where it is another than the place of the step before. */
  place?: PlaceId;
};

const WALK = "🚶";
const ASK = "❓";
const WAIT = "✋";
const HOME = "🏠";
const DOING_GLYPH: Record<OutingDoing, string> = { explore: "🧭", gather: "🧺", buy: "🧺", sell: "💰" };
/** What is done at a step: a thing, or, queued only to go there, nothing. */
type Doing = Extract<Step, { is: "do" | "then" }>;
const STATE_SAYS: Record<StepState, string> = { done: "done", now: "under way", next: "to come" };

/** What she is to do, as the chip says it: "Explore the forest", "Buy flour", "Go to the lake". */
const doSays = (game: Game, step: Doing): string => {
  if (step.doing === null) return `Go to ${placeSays(game, step.at)}`;
  if (step.doing === "buy") return `Buy ${WARES[step.ware ?? "flour"].name.toLowerCase()}`;
  if (step.doing === "sell") return step.good ? `Sell ${goodOf(step.good).name.toLowerCase()}` : "Sell";
  return `${step.doing === "explore" ? "Explore" : "Gather at"} ${placeSays(game, step.at)}`;
};

const doGlyph = (step: Doing): string => (step.doing === null ? WALK : step.doing === "buy" && step.ware ? WARES[step.ware].glyph : step.doing === "sell" && step.good ? goodOf(step.good).glyph : DOING_GLYPH[step.doing]);

/** The chip for one of her steps. */
const chipOf = (game: Game, id: string, step: Step): StepChip => {
  const state = STATE_SAYS[step.state];
  switch (step.is) {
    case "walk":
      return { is: "walk", glyph: WALK, state: step.state, says: `Walk to ${placeSays(game, step.to)}: ${state}`, press: null };
    case "do": {
      const cancels = step.state !== "done";
      const queued = (outingOf(game, id)?.queue.length ?? 0) > 0;
      const then = queued ? "she goes on to what is queued after it" : step.state === "next" ? "she goes on there, and asks what next when she is there" : "she stops, and asks what next";
      return { is: "do", glyph: doGlyph(step), state: step.state, says: `${doSays(game, step)}: ${state}${cancels ? `. Press to cancel it: ${then}` : ""}`, press: cancels ? "cancel" : null };
    }
    case "ask":
      return { is: "ask", glyph: ASK, state: step.state, says: `Asking what she is to do next, at ${placeSays(game, step.at)}: answer her on the map`, press: null };
    case "wait":
      return { is: "wait", glyph: WAIT, state: step.state, says: `Waiting at ${placeSays(game, step.at)}: send her from a place's card`, press: null };
    case "then":
      return { is: "then", glyph: doGlyph(step), state: step.state, says: `Then: ${doSays(game, step)}${step.doing === "buy" || step.doing === "sell" ? ` at ${placeSays(game, step.at)}` : ""}. Press to take it out`, press: "drop", index: step.index };
    case "home": {
      const out = outingOf(game, id);
      // On her way home already, or coming in: nothing to ask for.
      if (!out || out.homeward || out.state === "coming" || out.state === "returning") return { is: "home", glyph: HOME, state: step.state, says: `The walk home: ${state}`, press: null, lit: true };
      return { is: "home", glyph: HOME, state: step.state, says: "Home when it is done, without asking: asked for. Press to have her ask what next instead", press: "unqueue", lit: true };
    }
  }
};

/** The walk home, not asked for: shown all the same, unlit, to be pressed. Asking or waiting, she has nothing to be done with first: pressed, she comes home now. */
const homeToAsk = (game: Game, id: string): StepChip => {
  const free = isAsking(game, id) || outingOf(game, id)?.waits === true;
  return free
    ? { is: "home", glyph: HOME, state: "next", says: "Home: not asked for. Press to have her come home now", press: "home", lit: false }
    : { is: "home", glyph: HOME, state: "next", says: "Home when it is done: not asked for, so she asks what next. Press to have her come home when it is done, without asking", press: "queue", lit: false };
};

/** The place a step is at; none for the walk home. */
const placeOf = (step: Step): PlaceId | null => (step.is === "walk" ? step.to : step.is === "home" ? null : step.at);

/** Her steps as chips, for someone out; nothing for anyone in the house. A queued thing shows its place where it is another than the step's before; the walk home is always the last. */
export const stepChips = (game: Game, id: string): StepChip[] => {
  const steps = stepsOf(game, id);
  if (steps.length === 0) return [];
  const chips = steps.map((step, n) => {
    const chip = chipOf(game, id, step);
    const at = placeOf(step);
    return step.is === "then" && at !== null && at !== placeOf(steps[n - 1]) ? { ...chip, place: at } : chip;
  });
  return chips.some((chip) => chip.is === "home") ? chips : [...chips, homeToAsk(game, id)];
};

/** Do what pressing a chip does (`index`, for a queued thing taken out). True if it was done. */
export const pressStep = (game: Game, id: string, press: StepPress, index = -1): boolean => {
  if (press === "cancel") return cancel(game, id);
  if (press === "home") return callHome(game, id);
  if (press === "drop") return unqueue(game, id, index);
  return queueReturn(game, id, press === "queue");
};
