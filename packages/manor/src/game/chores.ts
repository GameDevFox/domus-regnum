import { CAST, giveOrders, go, isIdle, work } from "../space";
import type { Actor, Round } from "../space";
import type { Game } from "./types";

// What people do when they have no job: the Master is at his leisure, in his study and at his
// tea, and everyone else does the housework. It earns nothing; it is the house being lived in.
// (His laboratory is a job, and is lab.ts: taken off it, he is not seen at it.)

const roundsOf = (id: string): Round[] => CAST.find((c) => c.id === id)?.rounds ?? [];
const HOUSEWORK = roundsOf("sage");
/** The Master with nothing to do: he reads, he takes tea, he looks out at the door. */
const LEISURE: Round[] = [
  () => [go("study.desk"), work(8, "reading")],
  () => [go("parlour.table"), work(5, "taking tea"), go("hall.door"), work(2, "looking out")],
  () => [go("study.books"), work(4, "browsing")],
];

export const stepChores = (game: Game, actor: Actor): void => {
  if (!isIdle(actor)) return;
  const rounds = actor.id === "master" ? LEISURE : HOUSEWORK;
  // Each starts at a different place in the list, so two idle maids are not in step.
  const n = game.turns[actor.id] ?? game.household.indexOf(actor.id);
  giveOrders(game.world, actor.id, rounds[n % rounds.length](game.world));
  game.turns[actor.id] = n + 1;
};
