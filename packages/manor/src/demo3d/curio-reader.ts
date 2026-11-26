import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { CURIOS } from "../game";
import type { CurioId } from "../game";
import { CarvedWriting } from "./carved-writing";
import { LAYER, openLayer } from "./keys";
import { CROSS } from "./map-places";
import { el } from "./panel";
import { ui } from "./ui-layer";
import "./book.css";

// Looking at a curio that is in the house: the thing itself, large, with what is written on it.
// Nothing here says what the writing means: it is the player's to read.

type ReaderProps = { /** The curio being looked at, if one is. */ reading: Value<CurioId | null> };

export const mountReader = (scope: Scope, { reading }: ReaderProps): void => {
  scope.effect((use, shown) => {
    const id = use(reading);
    if (id === null) return;
    const curio = CURIOS[id];
    const veil = el("div", "reader-veil");
    const slab = el("div", "reader-slab");
    slab.setAttribute("role", "dialog");
    slab.setAttribute("aria-label", curio.name);
    slab.dataset.curio = id;
    const close = el("button", "reader-close");
    close.innerHTML = CROSS;
    close.setAttribute("aria-label", "Put it down");
    close.title = "Put it down — key Esc";
    // The writing is drawn, a picture to a line: its letters are not in the page to be copied out (carved-writing.ts).
    const text = el("div", "reader-text");
    text.append(...curio.lines.map((line) => CarvedWriting(shown, { text: line, className: "reader-line" })));
    slab.append(close, text);
    veil.append(slab);
    ui().append(veil);
    shown.add(() => veil.remove());
    shown.listen(close, "click", () => reading.set(null));
    shown.listen(veil, "click", (e: MouseEvent) => {
      if (e.target === veil) reading.set(null);
    });
    // Esc puts it down, while it is on top (keys.ts).
    openLayer(shown, LAYER.over, () => reading.set(null));
  });
};
