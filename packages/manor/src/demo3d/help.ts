import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { PAD_STICKS, padOf } from "./gamepad";
import { LAYER, openLayer } from "./keys";
import { ACTION } from "./page-tuning";
import { remembered } from "./remember";
import { settingsSlot } from "./settings";
import { ui } from "./ui-layer";
import { WORKPLACES } from "./workplaces";
import "./controls.css";

// The controls, shown over the picture when asked for: what can be done, by what it is about,
// each with its keys or what the mouse does, and its button or stick on a controller. It is
// built from the same table the keys themselves are run from (main.ts) and the same one a
// controller's buttons are (gamepad.ts), so it cannot fall out of step with what they do.
// (The author's, 2026-11-16: ""Keys and mouse" -> "Controls"", "Game controller icon",
// "Reorganize controls page to look cleaner and add mappings for controller bindings".)

/** What a control is about: the headings of the card, in their order. */
export const CONTROL_GROUPS = [
  { id: "view", says: "The view" },
  { id: "people", says: "The household" },
  { id: "time", says: "Time" },
  { id: "menus", says: "Menus" },
  { id: "settings", says: "Settings" },
] as const;
export type ControlGroup = (typeof CONTROL_GROUPS)[number]["id"];

/** A control: what it does, and how it is done with the keys or the mouse, and on a controller (either may be wanting). */
export type ControlRow = { group: ControlGroup; does: string; shown?: string; pad?: string };
/** Something done from the keyboard, as the page's own table has it: by its name, so that a controller's button for it can be found. */
export type KeyBinding = { id: string; group: ControlGroup; shown: string; does: string };

/** The "don't show again" choice, kept in this browser. */
const HIDDEN = remembered("manor3d.help.hide");

/** Has this browser been told not to show the controls when the page opens? */
export const helpHidden = HIDDEN.get;

/** What is done with the mouse alone, or a stick alone. */
const BY_HAND: ControlRow[] = [
  { group: "view", shown: "Drag", pad: PAD_STICKS.right, does: "Turn and tilt the view" },
  { group: "view", shown: "Right-drag", does: "Slide the view" },
  { group: "view", shown: "Scroll", does: "Zoom" },
  { group: "people", pad: `${padOf(ACTION.focusPrevious)}  ${padOf(ACTION.focusNext)}`, does: "Follow the one before, or the next, of the household; after the last, nobody" },
  { group: "people", shown: "Click a person, or a name", does: "Follow them from floor to floor" },
  { group: "people", shown: `Click ${WORKPLACES.map((place) => place.glyph).join(" ")} by a name`, does: "Open that place's card: there, click the face of whoever is to have the work, and again to take it away" },
  { group: "people", shown: "Click a face on the map", does: "Their menu: Return home" },
  { group: "people", shown: "Click a step under a name", does: "Cancel what is to be done; 🏠 to ask for the walk home when it is done, or no longer" },
  { group: "people", shown: "Click a device, under Inventions", does: "Have the Master make it, when his measure is full" },
  { group: "menus", shown: "Click the map, at the right", does: "Open the map; scroll to draw nearer, drag to slide it" },
  { group: "menus", shown: "Click a place on the map", does: "See what can be done there, then click the face of whoever is to go; 🏠 to have them come home when it is done" },
  { group: "menus", shown: "Click the day, by the clock", does: "Open the calendar" },
  { group: "menus", shown: "Click a Flour row, under Buy", does: "Order that many sacks by the cart" },
];

/** The pan is the left stick's; any other key's button is found by the action's name. */
const PAN = "pan";

/** Every control, group by group: the keys first, each with its button if it has one, and then what is done by hand. */
export const controlRows = (keys: KeyBinding[]): ControlRow[] => {
  const all = [...keys.map(({ id, group, shown, does }): ControlRow => ({ group, shown, does, pad: id === PAN ? PAD_STICKS.left : padOf(id) })), ...BY_HAND];
  return CONTROL_GROUPS.flatMap(({ id }) => all.filter((row) => row.group === id));
};

type HelpProps = { open: Value<boolean>; keys: KeyBinding[] };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};

/** A controller, as a picture: for the button, and for the head of the controller's column. */
const CONTROLLER = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M7.200 6.500h9.600c2.700 0 4.300 2.100 4.800 5.200l.6 3.900c.3 1.800-.8 3-2.200 3-1 0-1.800-.5-2.500-1.400l-1.200-1.700h-8.600l-1.200 1.700c-.7.900-1.500 1.400-2.500 1.400-1.400 0-2.500-1.200-2.200-3l.6-3.900c.5-3.100 2.100-5.200 4.800-5.200z" fill="currentColor"/><path d="M8.200 9.300v3.800M6.300 11.200h3.800" stroke="var(--paper)" stroke-width="1.500" stroke-linecap="round"/><circle cx="15.300" cy="12.300" r="1.050" fill="var(--paper)"/><circle cx="17.700" cy="10.100" r="1.050" fill="var(--paper)"/></svg>';
const KEYBOARD = "⌨️";

const table = (heading: string, rows: ControlRow[]): HTMLElement => {
  const block = el("section", "help-block controls-block");
  block.dataset.group = heading;
  block.append(el("h3", "heading", heading));
  const list = el("div", "controls-list");
  for (const row of rows) {
    const line = el("div", "controls-row");
    line.append(el("span", "controls-keys", row.shown ?? ""), el("span", "controls-pad", row.pad ?? ""), el("span", "controls-does", row.does));
    list.append(line);
  }
  block.append(list);
  return block;
};

/** Puts the controls on the page while `open` is true, and takes them off again when it is not. A round button among the settings, drawn as a controller, asks for them. */
export const mountHelp = (scope: Scope, { open, keys }: HelpProps): void => {
  const ask = el("button", "help-button controls-button");
  ask.innerHTML = CONTROLLER;
  ask.setAttribute("aria-label", "Controls: keys, mouse and controller");
  ask.title = "Controls — key ?";
  scope.listen(ask, "click", () => open.update((o) => !o));
  settingsSlot("settings-help").append(ask);
  scope.add(() => ask.remove());

  scope.effect((use, shown) => {
    if (!use(open)) return;
    const veil = el("div", "help-veil");
    const card = el("div", "help-card controls-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", "Controls");
    const close = el("button", "chip help-close", "Close");
    close.title = "Close — key Esc";
    const top = el("div", "help-top");
    top.append(el("h2", "title", "Controls"), close);
    // What the two columns are: the keys and the mouse, and a controller.
    const columns = el("div", "controls-row controls-columns");
    const pad = el("span", "controls-pad");
    pad.innerHTML = CONTROLLER;
    pad.title = "On a controller";
    const board = el("span", "controls-keys", KEYBOARD);
    board.title = "With the keys, or the mouse";
    columns.append(board, pad, el("span", "controls-does"));
    // Ticked, the card stays away when the page opens; it can be unticked here at any time.
    const again = el("label", "help-again");
    const tick = document.createElement("input");
    tick.type = "checkbox";
    tick.checked = helpHidden();
    again.append(tick, "Don't show again");
    shown.listen(tick, "change", () => HIDDEN.set(tick.checked));
    const rows = controlRows(keys);
    card.append(top, columns, ...CONTROL_GROUPS.map(({ id, says }) => table(says, rows.filter((row) => row.group === id))), again);
    veil.append(card);
    ui().append(veil);
    // A click on the dark around the card closes it; a click on the card does not.
    shown.listen(veil, "click", (e: MouseEvent) => {
      if (e.target === veil) open.set(false);
    });
    shown.listen(close, "click", () => open.set(false));
    shown.add(() => veil.remove());
    openLayer(shown, LAYER.card, () => open.set(false));
  });
};
