import type { Scope } from "@scene-lib/scope";
import { Value } from "@scene-lib/value";

import type { Game } from "../game";
import { el } from "./dom";
import { faceOf } from "./map-places";
import { askMarkSays } from "./who-says";

// A mark by the clock while someone out of doors is waiting to be told what next, and the
// question is not on the screen: time stands still until she is told, and this says why. It is
// her face with a question mark; pressed, it opens the map on her question. (The question is put
// up once when she asks, and may be put aside: map-view.ts.)

/** How often the game is looked at for a question, in seconds. */
const LOOK_EVERY = 0.25;
const ASKING = "❓";

export type AskMark = { node: HTMLElement; /** Whether someone is waiting to be told: the clock stands still. */ held: Value<boolean> };

export const AskMark = (scope: Scope, { game, frame, show }: { game: Game; frame: Value<number>; /** Open the map, where the question is. */ show: () => void }): AskMark => {
  const node = el("button", "pill-button pill-ask");
  node.hidden = true;
  const held = Value(false);
  scope.listen(node, "click", show);
  let next = 0;
  let drawn = "";
  scope.effect((use) => {
    const now = use(frame);
    if (now < next) return;
    next = now + LOOK_EVERY;
    const [ask] = game.asks;
    held.set(ask !== undefined);
    const who = ask?.who ?? "";
    if (who === drawn) return;
    drawn = who;
    node.hidden = !ask;
    node.replaceChildren(...(ask ? [faceOf(who), el("span", "pill-ask-mark", ASKING)] : []));
    const says = ask ? askMarkSays(who) : "";
    node.title = says;
    node.setAttribute("aria-label", says);
  });
  return { node, held };
};
