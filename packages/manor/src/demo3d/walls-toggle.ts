import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { remembered } from "./remember";
import { mountSettingToggle } from "./setting-toggle";

// The two choices about the walls, each a round button among the settings (setting-toggle.ts).
//
// How they come and go: sliding up and down, or there and gone at once. Drawn as a wall with an
// arrow beside it (sliding) or a bolt (at once).
//
// Which of them come down while nobody is followed: only those of the rooms with someone in
// them, the rest staying shut; or those of the whole storey, so that every room is seen into.
// Drawn as four rooms from above, all shut but the one with someone in it, or all open.
//
// On the card each is named for the way it is now, in the author's words (2026-11-16): "Wall
// Hiding: Sliding" (default) or "Wall Hiding: Instant"; "Wall Hiding: With Characters"
// (default) or "Wall Hiding: All Rooms".

/** The choices, kept in this browser. */
const INSTANT = remembered("manor3d.walls.instant");
const ALL_ROOMS = remembered("manor3d.walls.all-rooms");

/** Has this browser been told the walls should come and go at once? If it remembers nothing, they slide. */
export const wallsInstant = INSTANT.get;
/** Are only the rooms with someone in them to be opened? They are, unless this browser has been told to open the whole storey. */
export const wallsByRoom = (): boolean => !ALL_ROOMS.get();

const WALL = '<rect x="3" y="11" width="10" height="8" rx="1" fill="currentColor"/>';
/** A wall half up, its upper part in outline, and an arrow up and down beside it. */
const SLIDING = `<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">${WALL}<rect x="3.5" y="3.5" width="9" height="7" rx="1" fill="none" stroke="currentColor" stroke-dasharray="2 1.5"/><path d="M17.5 4v14M15 6.5 17.5 4 20 6.5M15 15.5 17.5 18 20 15.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
/** The same wall, and a bolt beside it. */
const AT_ONCE = `<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">${WALL}<rect x="3" y="3" width="10" height="8" rx="1" fill="currentColor" opacity="0.55"/><path d="M18.5 3 15 11h2.6L16 19l4.5-9.5h-2.6L19.5 3z" fill="currentColor"/></svg>`;

/** Four rooms seen from above, and someone in the one at the lower left. */
const PLAN = '<path d="M3.5 3.5h15v15h-15zM11 3.5v15M3.5 11h15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>';
const SOMEONE = '<circle cx="7.25" cy="14.75" r="1.9" fill="currentColor"/>';
/** A room that is shut: filled in. The three that nobody is in. */
const SHUT = '<path d="M3.5 3.5h7.5v7.5h-7.5zM11 3.5h7.5v7.5h-7.5zM11 11h7.5v7.5h-7.5z" fill="currentColor" opacity="0.6"/>';
/** All four open. */
const WHOLE_STOREY = `<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">${PLAN}${SOMEONE}</svg>`;
/** All shut but the one she is in. */
const HER_ROOM = `<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">${SHUT}${PLAN}${SOMEONE}</svg>`;

type WallsToggleProps = { /** True while the walls slide; false while they come and go at once. */ slide: Value<boolean>; key: string };

export const mountWallsToggle = (scope: Scope, { slide, key }: WallsToggleProps): void =>
  mountSettingToggle(scope, {
    on: slide,
    off: { picture: AT_ONCE, name: "Wall Hiding: Instant", says: "Walls appear at once", press: "Press to have them slide up and down" },
    onWay: { picture: SLIDING, name: "Wall Hiding: Sliding", says: "Walls slide up and down", press: "Press to have them appear at once" },
    pressed: (sliding) => !sliding,
    keep: (sliding) => INSTANT.set(!sliding),
    slot: "settings-walls",
    named: "walls-button",
    key,
  });

type RoomsToggleProps = { /** True while only the rooms with someone in them are opened; false while the whole storey is. */ byRoom: Value<boolean>; key: string };

export const mountRoomsToggle = (scope: Scope, { byRoom, key }: RoomsToggleProps): void =>
  mountSettingToggle(scope, {
    on: byRoom,
    off: { picture: WHOLE_STOREY, name: "Wall Hiding: All Rooms", says: "Every room of the storey is opened", press: "Press to open only the rooms with someone in them" },
    onWay: { picture: HER_ROOM, name: "Wall Hiding: With Characters", says: "Only the rooms with someone in them are opened", press: "Press to open every room of the storey" },
    pressed: (rooms) => !rooms,
    keep: (rooms) => ALL_ROOMS.set(!rooms),
    slot: "settings-rooms",
    named: "rooms-button",
    key,
  });
