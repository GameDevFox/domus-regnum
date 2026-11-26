import { HOME, PLACES } from "./country";
import type { PlaceId, ThingId } from "./country";
import { BASKET_HOLDS } from "./tuning";
import type { Game, Outing } from "./types";
import { isAsking, lotsOf } from "./outing";
import { WARES } from "./wares";
import type { GoodId, WareId } from "./wares";

// What someone on an outing is at, this minute: for whoever shows it (the list of the household,
// her token on the map). On the way, it is where she is bound and how many minutes off it is;
// at a place, it is what she is doing there and how far she has got with it.

export type OutingStatus =
  /** On her way out, to the front door and the gate; on the drive again, coming home; or in at the door and carrying what she has to its shelf: she is on the property. */
  | { is: "leaving" }
  | { is: "coming" }
  | { is: "returning" }
  /** On the way: where she is bound (the place she was sent to, or home), and how many minutes off it is; and, bound for a place, whether she has nothing chosen to do there (sent only to go, or what she was to do cancelled). */
  | { is: "walking"; to: PlaceId; minutes: number; idle?: true }
  /** At the place, with time stood still until she is told what she is to do there. */
  | { is: "asking"; at: PlaceId }
  /** At the place with nothing to do there, and not asking: told to stay; or come there in the night, to ask when the house wakes. */
  | { is: "waiting"; at: PlaceId }
  /** In town buying: what, how many of it, and how many minutes until it is bought. */
  | { is: "buying"; at: PlaceId; ware: WareId; load: number; minutes: number }
  /** In town selling: what, how many lots of it, and how many minutes until it is sold. */
  | { is: "selling"; at: PlaceId; good: GoodId; load: number; minutes: number }
  /** Gathering: what of the place's is in her basket so far, kind by kind in the order the place holds them (nothing, until the first lot is picked); how many lots her basket has in it, of everything; and how many it holds. */
  | { is: "gathering"; at: PlaceId; picked: { thing: ThingId; lots: number }[]; load: number; holds: number }
  /** Exploring: and no more. How far on she is is not said under her (the author's list, 2026-11-16: "Let's disable exploration progress under the character for now. We can keep it on the card icons"): a place's card says how far each thing in it is come upon (intel.ts). */
  | { is: "exploring"; at: PlaceId };

export const outingStatus = (game: Game, outing: Outing): OutingStatus => {
  if (outing.state !== "away") return { is: outing.state };
  const { clock } = game;
  const at = outing.to;
  if (clock < outing.arrive) return { is: "walking", to: at, minutes: outing.arrive - clock, ...(outing.doing === null && at !== HOME ? { idle: true as const } : {}) };
  if (outing.homeward && clock >= outing.depart) return { is: "walking", to: HOME, minutes: outing.back - clock };
  if (isAsking(game, outing.who)) return { is: "asking", at };
  if (outing.waits || outing.doing === null) return { is: "waiting", at };
  if (outing.doing === "sell" && outing.sells) return { is: "selling", at, good: outing.sells, load: outing.basket[outing.sells] ?? 0, minutes: outing.depart - clock };
  if (outing.doing === "buy" && outing.buys) return { is: "buying", at, ware: outing.buys, load: WARES[outing.buys].lot, minutes: outing.depart - clock };
  if (outing.doing === "gather") {
    const picked = PLACES[at].holds.flatMap(({ thing }) => (outing.basket[thing] ? [{ thing, lots: outing.basket[thing] ?? 0 }] : []));
    return { is: "gathering", at, picked, load: lotsOf(outing.basket), holds: BASKET_HOLDS };
  }
  return { is: "exploring", at };
};
