import type { Scope } from "@scene-lib/scope";

import { faceOf, nameOf } from "./map-places";
import { el } from "./panel";
import "./who-row.css";

// The choosing of people for a thing: a face each, with her name under it. Pressing a face does
// what the thing the row is on says: it sends her to a place (map-card.ts), or gives her the work
// of a place and takes it from her again (work-card.ts). The row knows nothing of either.

/** How a face stands just now. */
export type WhoState = {
  /** What pressing her does, for a screen reader; and the same with what else there is to say, for whoever asks. */
  label: string;
  title: string;
  /** Lit: she has this already, and pressing her takes it from her. Left out where there is nothing to be lit for. */
  on?: boolean;
  /** She cannot be pressed just now. */
  disabled?: boolean;
  /** She is out of doors. */
  out?: boolean;
  /** What she is at now, as a picture in the corner of her face: pressing her takes her from it. Nothing, when she is at nothing. */
  doing?: string;
};

type WhoRowProps = {
  ids: string[];
  press: (id: string) => void;
  stateOf: (id: string) => WhoState;
  /** The pointer is on someone, or she has the focus; or, with null, on nobody any more. */
  over?: (id: string | null) => void;
};

export type WhoRow = { node: HTMLElement; refresh: () => void };

export const WhoRow = (scope: Scope, { ids, press, stateOf, over }: WhoRowProps): WhoRow => {
  const node = el("div", "who-row");
  const people = ids.map((id) => {
    const button = el("button", "who");
    button.dataset.who = id;
    const doing = el("span", "who-doing");
    doing.setAttribute("aria-hidden", "true");
    button.append(faceOf(id), doing, el("span", "who-name", nameOf(id)));
    scope.listen(button, "click", () => {
      press(id);
      refresh();
    });
    if (over) {
      for (const on of ["pointerenter", "focus"]) scope.listen(button, on, () => over(id));
      for (const off of ["pointerleave", "blur"]) scope.listen(button, off, () => over(null));
    }
    node.append(button);
    return { id, button, doing };
  });

  const refresh = (): void => {
    for (const { id, button, doing } of people) {
      const state = stateOf(id);
      button.disabled = state.disabled ?? false;
      button.classList.toggle("out", state.out ?? false);
      button.classList.toggle("on", state.on ?? false);
      if (state.on === undefined) button.removeAttribute("aria-pressed");
      else button.setAttribute("aria-pressed", String(state.on));
      button.setAttribute("aria-label", state.label);
      button.title = state.title;
      doing.textContent = state.doing ?? "";
      doing.hidden = !state.doing;
    }
  };
  refresh();
  return { node, refresh };
};
