import { homeNext, timeText } from "../game";
import { placeSays } from "./outing-says";
import type { Game, Outing } from "../game";
import { CAST } from "../space";

// What the house is waiting for, as stretches of time to draw on the day's dial: each begun at
// one moment and due at another. A length on the dial is a length of time, so a plan is read
// there the way the shop's hours are: a cart on its way, someone gone out, and, before she is
// sent, how long she would be gone.

export type DialPlan = {
  id: string;
  /** What it is: the picture at its end, and its colour. */
  kind: "cart" | "errand" | "explore" | "gather" | "walk";
  /** The clocks it began at and is due at, in the game's minutes. */
  from: number;
  to: number;
  /** In words, for a tooltip and a screen reader. */
  says: string;
  /** Not begun: what would be, were she sent now. Drawn faintly. */
  ghost?: boolean;
  /** When it ends is not known: someone out who is to ask what next when what she is at is done. It is drawn to when she would be home were she then told to come, with a question at its end. */
  open?: boolean;
};

/** An outing the player is thinking of: who, which kind, and how many minutes she would be gone from now. */
export type Considering = { who: string; kind: "errand" | "explore" | "gather" | "walk"; gone: number; /** The return not asked for: when she would be back is not known. */ open?: boolean };

const nameOf = (id: string): string => CAST.find((c) => c.id === id)?.name ?? id;
/** (Bound somewhere with nothing chosen to do there, asking or waiting, or on her way home, an outing is a walk.) */
const kindOf = (outing: Outing): Considering["kind"] => (outing.doing === "buy" || outing.doing === "sell" ? "errand" : (outing.doing ?? "walk"));
/** (A place not yet found is not named: outing-says.ts.) */
const whereOf = (game: Game, outing: Outing): string => (outing.homeward ? "on her way home" : outing.doing === "buy" || outing.doing === "sell" ? "in town" : outing.doing === null ? `out, at or bound for ${placeSays(game, outing.to)}` : `${outing.doing === "gather" ? "gathering at" : "exploring"} ${placeSays(game, outing.to)}`);
/** Whether when she is back is not known: she is to ask what next, the return not asked for. */
export const isOpen = (outing: Outing): boolean => !outing.homeward && !homeNext(outing) && outing.state !== "coming" && outing.state !== "returning";
const backOf = (outing: Outing): string => (isOpen(outing) ? `; she asks what next when it is done, so when she is back is not known` : `, back ${outing.done ? "at" : "by"} ${timeText(outing.back)}`);

/** The plans the game has in hand just now, and the outing being thought about, if one is. */
export const plansOf = (game: Game, considering: Considering | null = null): DialPlan[] => [
  ...game.deliveries.filter((d) => d.state === "coming").map((d) => ({ id: d.id, kind: "cart" as const, from: d.ordered, to: d.due, says: `${d.sacks} sacks of flour on their way` })),
  ...game.outings.filter((o) => o.state !== "returning").map((o) => ({ id: `outing-${o.who}`, kind: kindOf(o), from: o.sent, to: o.back, says: `${nameOf(o.who)} ${whereOf(game, o)}${backOf(o)}`, ...(isOpen(o) ? { open: true } : {}) })),
  ...(considering === null ? [] : [{ id: "considering", kind: considering.kind, from: game.clock, to: game.clock + considering.gone, says: considering.open ? `${nameOf(considering.who)} would ask what next when it is done, and could be back at ${timeText(game.clock + considering.gone)} at the soonest` : `${nameOf(considering.who)} would be back at ${timeText(game.clock + considering.gone)}`, ghost: true, ...(considering.open ? { open: true } : {}) }]),
];

/** Two lists of plans are the same if nothing in them has changed: the dial is redrawn only when they are not. */
export const samePlans = (a: DialPlan[], b: DialPlan[]): boolean => a.length === b.length && a.every((p, n) => p.id === b[n].id && p.kind === b[n].kind && p.from === b[n].from && p.to === b[n].to && p.open === b[n].open);
