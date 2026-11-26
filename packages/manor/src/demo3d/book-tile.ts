import type { IntelEntry } from "../game";

/** How an entry's tile is to be drawn. */
export type TileLook = {
  /** Its own picture and name are shown (otherwise a question mark). */
  shown: boolean;
  /** Which of the not-yet-known looks it has, if either: ordinary, or hidden and not yet come upon. */
  unfound: "not-known" | "not-found" | null;
  /** What it says of itself, for its tooltip and its label. */
  says: string;
};

/** Hidden things are not listed until found, so only with the dev menu unlocked is one seen before. With it, anything not yet known is shown for what it is. */
export const tileLookOf = (entry: IntelEntry, dev: boolean): TileLook => {
  if (entry.known) return { shown: true, unfound: null, says: entry.name };
  if (entry.hidden) return { shown: true, unfound: "not-found", says: `${entry.name}: hidden, and not yet come upon` };
  if (dev) return { shown: true, unfound: "not-known", says: `${entry.name}: not yet known` };
  return { shown: false, unfound: null, says: "Not yet known" };
};
