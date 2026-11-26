import { HOME } from "./country";
import type { PlaceId } from "./country";
import { isAsking, isHomeNext, outingOf } from "./outing";
import type { Game, OutingDoing } from "./types";
import type { GoodId, WareId } from "./wares";

// Someone's outing as a short list of steps, for whoever shows them: the walk to where she is
// bound; what she is to do there, if anything; her asking or waiting there; what she has queued
// after it, each by its place in the queue (outing-queue.ts); and the walk home, if it is queued
// or begun. Each is done, under way, or to come. It only reads the game.

export type StepState = "done" | "now" | "next";

export type Step =
  | { is: "walk"; to: PlaceId; state: StepState }
  | { is: "do"; doing: OutingDoing; at: PlaceId; ware: WareId | null; good: GoodId | null; state: StepState }
  | { is: "ask"; at: PlaceId; state: StepState }
  | { is: "wait"; at: PlaceId; state: StepState }
  /** Queued after what she is at: what, and where; `index` is its place in her queue. Sent only to go, `doing` is null. */
  | { is: "then"; doing: OutingDoing | null; at: PlaceId; ware: WareId | null; good: GoodId | null; index: number; state: StepState }
  | { is: "home"; state: StepState };

export const stepsOf = (game: Game, id: string): Step[] => {
  const outing = outingOf(game, id);
  if (!outing) return [];
  // Coming in, or turned for home on the road: the walk home is all there is.
  if (outing.state === "coming" || outing.state === "returning" || outing.to === HOME) return [{ is: "home", state: "now" }];
  const at = outing.to;
  const there = outing.state === "away" && game.clock >= outing.arrive;
  const steps: Step[] = [{ is: "walk", to: at, state: there ? "done" : "now" }];
  if (outing.doing !== null) steps.push({ is: "do", doing: outing.doing, at, ware: outing.buys, good: outing.sells, state: !there ? "next" : outing.homeward ? "done" : "now" });
  if (there && !outing.homeward && isAsking(game, id)) steps.push({ is: "ask", at, state: "now" });
  else if (there && !outing.homeward && outing.waits) steps.push({ is: "wait", at, state: "now" });
  if (outing.homeward) steps.push({ is: "home", state: there && game.clock >= outing.depart ? "now" : "next" });
  else for (const [index, next] of outing.queue.entries()) steps.push(isHomeNext(next) ? { is: "home", state: "next" } : { is: "then", doing: next.doing, at: next.to, ware: next.doing === "buy" ? (next.ware ?? "flour") : null, good: next.good ?? null, index, state: "next" });
  return steps;
};
