import { RARE_DECK } from "./country";
import type { PlaceId } from "./country";
import { write } from "./deseret";
import type { Game, Outing } from "./types";

// Curios (a working word): things come upon out of doors that are not what anyone was sent for.
// One is hidden at a place: nobody knows it is there, no question mark stands for it, and it
// counts for nothing in what there is to find at the place until it is found; found, it is over
// and above. (The author's, 2026-11-13: `packages/domus/docs/design/23-intel.md`, "Hidden finds".)
//
// It is found as anything a place holds is, by drawing points from a pool (discovery.ts): it has
// its pool and need, and lies in one of the place's decks, a set of pools of its own with a
// great many dead ends, drawn from every minute anyone is there, exploring or gathering (the
// author, 2026-11-16: "the tablet would only have 1 out of 1, and so you just have to hit it
// randomly"; packages/domus/docs/design/22, "A place has as many sets of pools as are wanted").
// Whoever comes upon it has it with her, and it is in the house, to be looked at, when she is home.

export type CurioId = "tablet";

export type Curio = Readonly<{
  name: string;
  glyph: string;
  /** Where it lies. */
  place: PlaceId;
  /** How it is found there (discovery.ts): its points, how many of them must be come upon, and which of the place's decks they are in. */
  pool: number;
  need: number;
  deck: string;
  /** What is written on it, line by line, if anything is. */
  lines: readonly string[];
}>;

/** As the code has them, and nothing writes into them: a game's own edits of the dials are the game's (discovery.ts, `retune`). */
export const CURIOS: Readonly<Record<CurioId, Curio>> = {
  tablet: {
    name: "A stone tablet",
    glyph: "🪨",
    place: "forest",
    // One point, alone in the forest's rare deck: the first of its points come upon finds it.
    pool: 1,
    need: 1,
    deck: RARE_DECK,
    // PLACEHOLDER, at the author's word ("tell the devs to fix this, tell the devs to put some
    // actual real intel or clue here"): "Devs, fix this. Put real intel here." What goes here in
    // the end is to be of real use, and not to be had any other way. In the Deseret alphabet,
    // spelled as it sounds: the spelling is the author's to check.
    lines: [write("d e v z", "f i k s", "dh i s"), write("p uu t", "r ee l", "i n t e l", "h ee r")],
  },
};

export const CURIO_IDS = Object.keys(CURIOS) as CurioId[];

/** The curios that lie at a place. */
export const curiosAt = (place: PlaceId): CurioId[] => CURIO_IDS.filter((id) => CURIOS[id].place === place);

/** Whether a curio has been found: it is in the house, or in the basket of someone on her way home with it. */
export const curioFound = (game: Game, id: CurioId): boolean => game.curios.includes(id) || game.outings.some((o) => o.found.includes(id));

/** She is home: what she came upon is in the house. */
export const bringHome = (game: Game, outing: Outing): void => {
  game.curios.push(...outing.found);
  outing.found = [];
};
