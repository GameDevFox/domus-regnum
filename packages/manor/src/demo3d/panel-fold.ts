import type { Scope } from "@scene-lib/scope";
import { Value } from "@scene-lib/value";

import { remembered } from "./remember";

// The panel can be folded away: a small button at its corner narrows it to what the house has,
// one thing under another, and opens it again. The choice is kept in this browser.

/** The choice, kept in this browser. */
const FOLDED = remembered("manor3d.panel.folded");

/** Two chevrons: pointing in, to fold the panel; pointing out, to open it. */
const chevrons = (out: boolean): string =>
  `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="${out ? "M4 3.5 8.5 8 4 12.5M8.5 3.5 13 8l-4.5 4.5" : "M12 3.5 7.5 8l4.5 4.5M7.5 3.5 3 8l4.5 4.5"}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Puts the fold button on the panel. Returns whether the panel is folded, for whoever lays the picture out round it. */
export const mountPanelFold = (scope: Scope): Value<boolean> => {
  const folded = Value(FOLDED.get());
  const panel = document.getElementById("panel");
  if (!panel) return folded;
  const button = document.createElement("button");
  button.className = "panel-fold";
  scope.listen(button, "click", () => folded.update((f) => !f));
  scope.effect((use) => {
    const now = use(folded);
    FOLDED.set(now);
    panel.classList.toggle("folded", now);
    button.innerHTML = chevrons(now);
    // The picture is what pressing it does.
    const label = now ? "Open the panel" : "Fold the panel away";
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-expanded", String(!now));
    button.title = label;
  });
  panel.prepend(button);
  scope.add(() => button.remove());
  return folded;
};
