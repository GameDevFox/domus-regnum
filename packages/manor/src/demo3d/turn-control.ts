import type { Scope } from "@scene-lib/scope";

import { ui } from "./ui-layer";

// The two turn buttons, at the foot of the screen: arrows, no words.

type TurnProps = { turn: (direction: 1 | -1) => void };

export const mountTurnControl = (scope: Scope, { turn }: TurnProps): void => {
  const root = document.createElement("div");
  root.className = "pill pill-bottom";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Turn the view");
  for (const [glyph, direction, label, key] of [["⟲", 1, "Turn anticlockwise", "Q"], ["⟳", -1, "Turn clockwise", "E"]] as [string, 1 | -1, string, string][]) {
    const button = document.createElement("button");
    button.className = "pill-button pill-glyph";
    button.textContent = glyph;
    button.setAttribute("aria-label", label);
    button.title = `${label} — key ${key}`;
    scope.listen(button, "click", () => turn(direction));
    root.append(button);
  }
  ui().append(root);
  scope.add(() => root.remove());
};
