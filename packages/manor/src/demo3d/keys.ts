import type { Scope } from "@scene-lib/scope";

// What a key press means, decided in one place, from where the focus is and which layers are up.
//
// A key is the page's own (`pageKey`) unless Ctrl, Cmd or Alt is held; or a box is being typed in,
// whose keys are all its own but Esc; or a control the focus was brought to other than by the
// mouse is to be pressed by Space or Enter; or something under the focus has acted on it already, and said so
// by cancelling it (a face on the map, a slot of the intel card). The page's keys are heard by
// whatever is listening for them (`onPageKey`): the bindings in main.ts, each menu's own key, the
// dev menu's, and the map's while it is open.
//
// Esc closes the layer on top (`closeTop`): of everything open, the one drawn highest, and of
// those drawn alike the one opened last (`topLayer`). Each layer says, as it opens, how high it
// is drawn (`openLayer`, by the CSS z-index of its veil: `LAYER`) and how it is closed, and is
// taken off the list as it closes. With no layer open, Esc lets go of whoever is followed.
//
// Two things still take the keys before any of this, in the capture phase: a scene, whose keys
// are its own while it plays (scene-stage.ts), and the black before and after it (curtain.ts).
// A dev window, too, has every key but Esc while it is open (dev-window.ts).

/** What of a key press decides what it means. */
export type Press = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; defaultPrevented: boolean };

/** Where the focus is: in a box being typed in; on a control the keyboard brought it to; or anywhere else. */
export type Focus = "typing" | "pressing" | "page";

const ESCAPE = "escape";
/** The keys that press a control that has the focus. */
const PRESS_KEYS = [" ", "enter"];

/** The page's own key, by its lower-case name; or null if the key is something else's. */
export const pageKey = (press: Press, focus: Focus): string | null => {
  if (press.ctrlKey || press.metaKey || press.altKey || press.defaultPrevented) return null;
  const key = press.key.toLowerCase();
  if (focus === "typing") return key === ESCAPE ? key : null;
  if (focus === "pressing" && PRESS_KEYS.includes(key)) return null;
  return key;
};

/** The kinds of box whose keys are not typing: a tick box, a choice of one, a button. */
const PRESSED_INPUTS = ["checkbox", "radio", "button", "submit", "reset"];
/** What is pressed as a button is, by Space or Enter, once it has the focus. */
const PRESSED = "button, summary, a[href], [role='button'], [role='menuitem'], [role='tab'], input";

/**
 * Where the focus is, from what a key press went to. A control the mouse gave the focus to (a
 * button just clicked keeps it) is not counted as one to be pressed from the keyboard: Space then
 * still pauses, as it always has, and does not press the clock's last button again. One the focus
 * was brought to otherwise (a menu's first item, as it opens) is pressed by Space and Enter.
 */
export const focusOf = (target: EventTarget | null, pointed: EventTarget | null): Focus => {
  if (!(target instanceof HTMLElement)) return "page";
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return "typing";
  if (target instanceof HTMLInputElement && !PRESSED_INPUTS.includes(target.type)) return "typing";
  return target !== pointed && target.matches(PRESSED) ? "pressing" : "page";
};

/** How high each kind of layer is drawn: the z-index of its veil in the CSS (map.css, demo3d.css, menu.css, calendar.css, book.css, dev-menu.css). */
export const LAYER = {
  /** The map, and a face's menu on it. */
  map: 3,
  /** A menu, a place of work's card, the list of keys, the settings, the calendar. */
  card: 5,
  /** The dev menu, and a curio being looked at. */
  over: 6,
  /** A window opened from the dev menu. */
  devWindow: 9,
} as const;

/** A layer that is open: how high it is drawn, when it was opened (a count), and how it is closed. */
export type Layer = { z: number; opened: number; close: () => void };

/** The layer on top: the one drawn highest, and of those drawn alike the one opened last. */
export const topLayer = <L extends { z: number; opened: number }>(layers: L[]): L | null => layers.reduce<L | null>((top, layer) => (top === null || layer.z > top.z || (layer.z === top.z && layer.opened > top.opened) ? layer : top), null);

/** The layers open on the page, and how many have been opened. (One page, so one list.) */
const open: Layer[] = [];
let openings = 0;

/** A layer is open for as long as the scope lasts: Esc closes it while it is on top. */
export const openLayer = (scope: Scope, z: number, close: () => void): void => {
  openings += 1;
  const layer: Layer = { z, opened: openings, close };
  open.push(layer);
  scope.add(() => {
    const at = open.indexOf(layer);
    if (at >= 0) open.splice(at, 1);
  });
};

/** Close the layer on top. False if none is open. */
export const closeTop = (): boolean => {
  const top = topLayer(open);
  top?.close();
  return top !== null;
};

type Hearer = (key: string, e: KeyboardEvent) => void;
const hearers: Hearer[] = [];

/** Hear the page's own keys, for as long as the scope lasts. */
export const onPageKey = (scope: Scope, hear: Hearer): void => {
  hearers.push(hear);
  scope.add(() => {
    const at = hearers.indexOf(hear);
    if (at >= 0) hearers.splice(at, 1);
  });
};

/** The one listener: each key press is judged here, and handed to whatever hears the page's keys. Mounted once, by main.ts. */
export const mountKeys = (scope: Scope): void => {
  // What the mouse (or a finger) gave the focus to: the focus that comes while a press is down.
  let pressing = false;
  let pointed: EventTarget | null = null;
  scope.listen(window, "pointerdown", () => (pressing = true), { capture: true });
  for (const up of ["pointerup", "pointercancel"]) scope.listen(window, up, () => (pressing = false), { capture: true });
  scope.listen(window, "focusin", (e: FocusEvent) => (pointed = pressing ? e.target : null));
  scope.listen(window, "keydown", (e: KeyboardEvent) => {
    const key = pageKey(e, focusOf(e.target, pointed));
    if (key === null) return;
    // (A copy: what a key does may open or close something that hears the keys.)
    for (const hear of [...hearers]) hear(key, e);
  });
};
