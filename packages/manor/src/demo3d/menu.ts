import type { Scope } from "@scene-lib/scope";
import { Value } from "@scene-lib/value";

import type { Game } from "../game";
import { LAYER, onPageKey, openLayer } from "./keys";
import { CROSS } from "./map-places";
import { el } from "./panel";
import { ui } from "./ui-layer";
import "./menu.css";

// A menu of the page: something that is off the screen until it is asked for, since most of the
// time it would only be standing there. A key opens it, and a round button over the map's tile
// if it has one (the card of a place of work is opened from over the place itself: place-icons.ts);
// it is a card, and its cross or Esc shuts it. The intel menu (book.ts) and the garden (garden-menu.ts)
// are both this, and differ in what is on the card and in whether it blocks: the intel menu lies
// over a veil that nothing can be pressed through, and a press on the veil shuts it too; the garden
// is a window, with the page about it as alive as ever (someone is given the garden in the list of
// the household while it is open).

type MenuProps = {
  game: Game;
  /** What heads the card ("Intel"), and what it is called in a sentence ("the intel menu"). */
  title: string;
  called: string;
  /** What the button says is in it, after "Open the intel menu: ". */
  holds: string;
  key: string;
  /** Its round button over the map's tile, if it has one: its picture, its own class, and which place there is its. */
  way?: { glyph: string; button: string; side: "left" | "middle" | "right" };
  /** The card's own class, and that of the place in its head for a line of its own (a tally, say). */
  card: string;
  slot: string;
  /** True for a card over a veil, which keeps the page behind it from being pressed; false for a window, which leaves it alone. */
  blocks: boolean;
  /** Put on the card what it is to show: called each time it is opened, with a scope that ends when it is shut. */
  fill: (shown: Scope, parts: { card: HTMLElement; /** Its name, at its head. */ title: HTMLElement; slot: HTMLElement }) => void;
};

export const mountMenu = (scope: Scope, { game, title, called, holds, key, way, card: own, slot: slotClass, blocks, fill }: MenuProps): Value<boolean> => {
  const open = Value(false);

  if (way) {
    const button = el("button", `round-button menu-button ${way.button} on-the-${way.side}`, way.glyph);
    scope.listen(button, "click", () => open.update((o) => !o));
    scope.effect((use) => {
      const shown = use(open);
      const label = shown ? `Close ${called}` : `Open ${called}: ${holds}`;
      button.classList.toggle("on", shown);
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", String(shown));
      button.title = `${label} — key ${key.toUpperCase()}`;
    });
    ui().append(button);
    scope.add(() => button.remove());
  }

  // Its key, one of the page's (keys.ts: not while a box is typed in), and not in a scene, whose keys are its own.
  onPageKey(scope, (pressed) => {
    if (pressed !== key || game.scene !== null) return;
    open.update((o) => !o);
  });

  scope.effect((use, shown) => {
    if (!use(open)) return;
    const veil = el("div", blocks ? "menu-veil" : "menu-window");
    const card = el("div", `help-card ${own}`);
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", title);
    const slot = el("span", `menu-slot ${slotClass}`);
    const close = el("button", "map-card-close");
    close.innerHTML = CROSS;
    close.setAttribute("aria-label", `Close ${called}`);
    close.title = "Close — key Esc";
    const top = el("div", "menu-top");
    const name = el("h2", "title", title);
    top.append(name, slot, close);
    card.append(top);
    veil.append(card);
    ui().append(veil);
    shown.add(() => veil.remove());
    fill(shown, { card, title: name, slot });

    shown.listen(close, "click", () => open.set(false));
    if (blocks)
      shown.listen(veil, "click", (e: MouseEvent) => {
        if (e.target === veil) open.set(false);
      });
    // Esc shuts it while it is on top: a curio looked at over it is put down first (keys.ts).
    openLayer(shown, LAYER.card, () => open.set(false));
  });

  return open;
};
