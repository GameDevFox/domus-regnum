import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { remembered } from "./remember";
import { mountSettingToggle } from "./setting-toggle";

// Where the picture is centred, a choice among the settings (setting-toggle.ts): on the window,
// or in the room the panel leaves of it.
//
// Centred on the window is what a first visit has (the author's, 2026-11-18: "New setting (on by
// default) where gameplay view (manor and map) is perfectly centered on the screen at all times
// regardless of any ui elements, their size, or position."). Then neither the house nor the map
// is moved for the panel, open or folded: the house's picture is not slid aside (main.ts,
// `resize`), and the frame the map is looked at through is the whole window (map-view.ts).
//
// The other way is how the page was before: on a wide screen both are centred in what the panel
// leaves, and folding the panel away gives them its room.
//
// Either way, what is set on the map's frame (a place's card, a question) is set clear of the
// panel: that is furniture, not the picture.
//
// Drawn as the window with a mark at the middle of it; or as the window with the panel down its
// left side and the mark at the middle of the rest.

/** The choice, kept in this browser: remembered only when it is not what a first visit has. */
const BESIDE = remembered("manor3d.view.beside-panel");

/** Is the picture centred on the window? It is, unless this browser has been told to centre it in what the panel leaves. */
export const viewCentred = (): boolean => !BESIDE.get();

const WINDOW = '<rect x="2.5" y="4.5" width="17" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/>';
/** A mark at a point: a ring with a dot in it. */
const mark = (x: number): string => `<circle cx="${x}" cy="11" r="3.1" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="${x}" cy="11" r="1.1" fill="currentColor"/>`;
/** The middle of the window, and the middle of what a panel down its left side leaves of it. */
const MIDDLE = 11;
const MIDDLE_OF_THE_REST = 13.75;
const ON_THE_WINDOW = `<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">${WINDOW}${mark(MIDDLE)}</svg>`;
const BESIDE_THE_PANEL = `<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">${WINDOW}<rect x="2.5" y="4.5" width="5.5" height="13" rx="1.5" fill="currentColor" opacity="0.6"/>${mark(MIDDLE_OF_THE_REST)}</svg>`;

type CentreToggleProps = { /** True while the picture is centred on the window; false while it is centred in what the panel leaves. */ centred: Value<boolean> };

export const mountCentreToggle = (scope: Scope, { centred }: CentreToggleProps): void =>
  mountSettingToggle(scope, {
    on: centred,
    off: { picture: BESIDE_THE_PANEL, name: "View: Beside the Panel", says: "The view is centred in the room the panel leaves", press: "Press to centre it on the screen" },
    onWay: { picture: ON_THE_WINDOW, name: "View: Centred", says: "The view is centred on the screen", press: "Press to centre it in the room the panel leaves" },
    pressed: (onWindow) => !onWindow,
    keep: (onWindow) => BESIDE.set(!onWindow),
    slot: "settings-centre",
    named: "centre-button",
  });
