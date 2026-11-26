import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { settingSays, settingsSlot } from "./settings";
import type { SettingsSlot } from "./settings";

// A choice between two ways, among the settings: a round button whose picture is how it is now,
// and whose words are what pressing it does. How the walls come and go, and which of them come
// down, are both this (walls-toggle.ts); so is where the picture is centred (view-centre.ts).

/** One of the two ways: its picture, its name on the card, what it is in words, and what pressing the button then does. */
export type Way = { picture: string; name: string; says: string; press: string };

type SettingToggleProps = {
  /** Which of the two ways it is. */
  on: Value<boolean>;
  /** The two ways: while `on` is false, and while it is true. */
  off: Way;
  onWay: Way;
  /** True when the button reads as pressed: the way that is not the one a first visit has. */
  pressed: (on: boolean) => boolean;
  /** Keep the choice for the next visit. */
  keep: (on: boolean) => void;
  /** Where on the settings card it goes, its own class, and its key if it has one. */
  slot: SettingsSlot;
  named: string;
  key?: string;
};

/**
 * Keep a choice for the next visit each time it is changed, by its button or its key; but not the
 * way the page opened in, which may be the page's address speaking (`?rooms=all`) and not a choice.
 */
export const keepChanges = (scope: Scope, on: Value<boolean>, keep: (on: boolean) => void): void => {
  let opened = true;
  scope.effect((use) => {
    const now = use(on);
    if (!opened) keep(now);
    opened = false;
  });
};

export const mountSettingToggle = (scope: Scope, { on, off, onWay, pressed, keep, slot, named, key }: SettingToggleProps): void => {
  const button = document.createElement("button");
  button.className = `round-button ${named}`;
  scope.listen(button, "click", () => on.update((o) => !o));
  keepChanges(scope, on, keep);
  scope.effect((use) => {
    const now = use(on);
    const way = now ? onWay : off;
    button.innerHTML = way.picture;
    // Its row on the card is named for the way it is now.
    settingSays(slot, way.name);
    const label = `${way.says}. ${way.press}.`;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(pressed(now)));
    button.title = key === undefined ? label : `${label} Key ${key.toUpperCase()}`;
  });
  settingsSlot(slot).append(button);
  scope.add(() => button.remove());
};
