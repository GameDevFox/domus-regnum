import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { el } from "./dom";
import { LAYER, openLayer } from "./keys";
import { CROSS } from "./map-places";
import { devTools } from "./ui-layer";

// A window opened from the dev menu: something with room of its own, over everything, where a
// row of the menu would not hold it. The colour room was the first, and the odds of discovery
// the second; what they share is here. A window has a title and a cross, and is put away by the
// cross, by Esc, or by a press on the dark round it. While it is open it has the keys: what is
// typed in it is not heard by the house.

export type DevWindowProps = {
  open: Value<boolean>;
  title: string;
  /** What the cross is called. */
  closeSays: string;
  /** A class of its own, for its size and what is laid out in it. */
  className: string;
  /** Put what it holds into it, under its title. The scope is of this opening of it. */
  fill: (shown: Scope, room: HTMLElement) => void;
};

/** A button of the dev menu's that opens a window: they stand in a row of their own at the top of the menu. */
export type DevWindowButton = { glyph: string; label: string; title: string; open: () => void };

export const mountDevWindow = (scope: Scope, { open, title, closeSays, className, fill }: DevWindowProps): void => {
  scope.effect((use, shown) => {
    if (!use(open)) return;
    const veil = el("div", "dev-window-veil");
    const room = el("div", `dev-window ${className}`);
    room.setAttribute("role", "dialog");
    room.setAttribute("aria-label", title);
    const shut = el("button", "map-card-close");
    shut.innerHTML = CROSS;
    shut.setAttribute("aria-label", closeSays);
    shut.title = "Close — key Esc";
    const top = el("div", "help-top");
    top.append(el("h2", "title", title), shut);
    room.append(top);
    fill(shown, room);
    veil.append(room);
    devTools().append(veil);

    shown.listen(shut, "click", () => open.set(false));
    // A click on the dark round the window closes it; a click in the window does not.
    shown.listen(veil, "click", (e: MouseEvent) => {
      if (e.target === veil) open.set(false);
    });
    shown.listen(
      window,
      "keydown",
      (e: KeyboardEvent) => {
        // The window has the keys while it is open: what is typed in it is not heard by the house. Esc is let by, to shut it: it is drawn over everything else (keys.ts).
        if (e.key !== "Escape") e.stopImmediatePropagation();
      },
      { capture: true },
    );
    openLayer(shown, LAYER.devWindow, () => open.set(false));
    shown.add(() => veil.remove());
  });
};
