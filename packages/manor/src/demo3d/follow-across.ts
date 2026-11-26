import type { Value } from "@scene-lib/value";

import { outingOf } from "../game";
import type { Game } from "../game";

// Whoever is followed is followed from one view to the other (the author's asking, 2026-11-14:
// "When a character is focused and they travel between the house and another location or vice
// versa, it should follow them to the other view"). Gone out at the gate, she is on the map,
// and the map is opened; back at the gate, she is on the grounds again, and the map is shut so
// that she is seen walking up the drive.

/** Whoever is followed, and whether she is off the property just now: out on the map. */
export type Followed = { id: string | null; abroad: boolean };

export const NOBODY: Followed = { id: null, abroad: false };

/**
 * The view to go to as whoever is followed leaves the property or comes back onto it: the map
 * as she goes, the house as she comes home. Null while nothing of the kind has happened: she
 * is where she was, or someone else is followed now (whose view was gone to when she was chosen).
 */
export const viewAcross = (was: Followed, now: Followed): "map" | "house" | null => (now.id === null || now.id !== was.id || now.abroad === was.abroad ? null : now.abroad ? "map" : "house");

type AcrossProps = { game: Game; following: Value<string | null>; mapOpen: Value<boolean> };

/**
 * What is done once a frame about whoever is followed: someone who has gone from the house for
 * good (a customer out of the door) is let go of; one of the household gone out at the gate is
 * followed still, and the view goes with her, to the map and home again.
 */
export const followerAcross = ({ game, following, mapOpen }: AcrossProps): (() => void) => {
  let last = NOBODY;
  return () => {
    const id = following.peek();
    const abroad = outingOf(game, id ?? "")?.state === "away";
    if (id !== null && !abroad && !game.world.actors.some((a) => a.id === id)) following.set(null);
    const now = { id: following.peek(), abroad };
    const across = viewAcross(last, now);
    last = now;
    if (across) mapOpen.set(across === "map");
  };
};
