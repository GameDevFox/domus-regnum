import type { Scope } from "@scene-lib/scope";
import { Value } from "@scene-lib/value";

import { LAYER, openLayer } from "./keys";
import { CROSS } from "./map-places";
import { el } from "./panel";
import { ui } from "./ui-layer";

// The small controls that are seldom wanted are kept together behind one button, a gear in the
// top right corner: the controls, how the walls are hidden and which of them are, where the
// picture is centred, and the performance graph.
// Pressing the gear lays them out on a card, each with its name beside it. Their keys work
// whether the card is open or not.

/** Each control kept here: where its button is put, and what it is called on the card. */
const KEPT = [
  { slot: "settings-help", says: "Controls" },
  // (These two say which way they are, and are named afresh when they are changed: setting-toggle.ts.)
  { slot: "settings-walls", says: "Wall Hiding" },
  { slot: "settings-rooms", says: "Wall Hiding" },
  // (As those two: view-centre.ts.)
  { slot: "settings-centre", says: "View" },
  { slot: "settings-perf", says: "Performance" },
] as const;

export type SettingsSlot = (typeof KEPT)[number]["slot"];

/** Where a control kept in the settings puts its button: its place on the card, or the page itself if there is no card. */
export const settingsSlot = (slot: SettingsSlot): HTMLElement => document.getElementById(slot) ?? ui();

/** Name a control's row on the card afresh: a choice between two ways says which it is now. */
export const settingSays = (slot: SettingsSlot, says: string): void => {
  const name = document.getElementById(`${slot}-says`);
  if (name) name.textContent = says;
};

/** How many teeth the cog has, and the turn between one and the next, in degrees. */
const TEETH = 8;
const TOOTH_TURN = 360 / TEETH;
/** A cog: a thick ring with square teeth round it and a hole through the middle. Drawn solid, so that it reads as a wheel and not as a sun. */
const GEAR = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g fill="currentColor">${Array.from({ length: TEETH }, (_, n) => `<rect x="9.9" y="1.4" width="4.2" height="5.2" rx="0.9" transform="rotate(${n * TOOTH_TURN} 12 12)"/>`).join("")}</g><circle cx="12" cy="12" r="5.4" fill="none" stroke="currentColor" stroke-width="4"/></svg>`;

/** Puts the gear and its card on the page. Call before the controls it keeps are mounted. Returns whether the card is open. */
export const mountSettings = (scope: Scope): Value<boolean> => {
  const open = Value(false);
  const gear = el("button", "round-button settings-button");
  gear.innerHTML = GEAR;
  gear.setAttribute("aria-label", "Settings");
  gear.title = "Settings: controls, wall hiding, the view, performance";
  scope.listen(gear, "click", () => open.update((o) => !o));

  const veil = el("div", "settings-veil");
  const card = el("div", "help-card settings-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Settings");
  // (A cross in the corner, as the menus have: the author's, 2026-11-16.)
  const close = el("button", "settings-close");
  close.innerHTML = CROSS;
  close.setAttribute("aria-label", "Close the settings");
  close.title = "Close — key Esc";
  const top = el("div", "help-top");
  top.append(el("h2", "title", "Settings"), close);
  card.append(top);
  for (const { slot, says } of KEPT) {
    const row = el("div", "settings-row");
    const place = el("span", "settings-slot");
    place.id = slot;
    const name = el("span", "settings-says", says);
    name.id = `${slot}-says`;
    row.append(place, name);
    card.append(row);
  }
  veil.append(card);
  ui().append(gear, veil);
  scope.add(() => {
    gear.remove();
    veil.remove();
  });

  scope.listen(close, "click", () => open.set(false));
  // A click on the dark round the card closes it; a click on the card does not.
  scope.listen(veil, "click", (e: MouseEvent) => {
    if (e.target === veil) open.set(false);
  });
  // The controls are a card of their own: asking for them puts this one away.
  scope.listen(settingsSlot("settings-help"), "click", () => open.set(false));

  scope.effect((use, inner) => {
    const shown = use(open);
    // Shut, the card is out of the page, not merely unseen.
    veil.hidden = !shown;
    // Opened, it is put last in the page, so that it is drawn over any card opened before it, as Esc takes it to be (keys.ts).
    if (shown) {
      ui().append(veil);
      openLayer(inner, LAYER.card, () => open.set(false));
    }
    gear.classList.toggle("on", shown);
    gear.setAttribute("aria-expanded", String(shown));
  });
  return open;
};
