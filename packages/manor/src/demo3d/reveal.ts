import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { reveal, revealSays } from "../game";
import type { Game, Revealable } from "../game";

// With the dev menu unlocked, a right-click on a question mark makes the thing known: wherever a
// question mark stands for something there is to know, it says in its data what would make it
// known (`data-reveal`), and this is what hears the right-click. (The author's asking,
// 2026-11-14, for trying things out without playing up to them.) And with the pointer on such a
// question mark, its tooltip says what the right-click would make known (the author's, later
// the same day: "for ALL question marks"). The same is heard on a tab of the intel menu, for all
// of its kind, and on the menu's name, for everything (the author's, 2026-11-16).

type RevealProps = { game: Game; /** Whether the dev menu is unlocked. */ dev: Value<boolean>; /** Called when something has been made known: to draw again at once. */ then?: () => void };

/** Say of an element what a right-click on it would make known; or, with null, that it would make nothing known. */
export const setReveal = (on: HTMLElement, what: Revealable | null): void => {
  if (what) on.dataset.reveal = JSON.stringify(what);
  else {
    delete on.dataset.reveal;
    // (Its tooltip goes back to what it said of itself before a right-click was offered.)
    if (on.dataset.says !== undefined) on.title = on.dataset.says;
  }
};

/** Hear right-clicks on the question marks under an element, for as long as the scope lasts. */
export const revealOn = (scope: Scope, root: HTMLElement, { game, dev, then }: RevealProps): void => {
  // The tooltip of a question mark under the pointer: what it says of itself, and, with the dev menu unlocked, what a right-click would make known.
  scope.listen(root, "mouseover", (e: MouseEvent) => {
    const on = (e.target as Element).closest<HTMLElement>("[data-reveal]");
    if (!on) return;
    on.dataset.says ??= on.title;
    const plain = on.dataset.says;
    on.title = dev.peek() ? `${plain}${plain ? ". " : ""}Right-click to reveal: ${revealSays(game, JSON.parse(on.dataset.reveal ?? "null") as Revealable)}` : plain;
  });
  scope.listen(root, "contextmenu", (e: MouseEvent) => {
    const on = (e.target as Element).closest<HTMLElement>("[data-reveal]");
    if (!on || !dev.peek()) return;
    e.preventDefault();
    reveal(game, JSON.parse(on.dataset.reveal ?? "null") as Revealable);
    then?.();
  });
};
