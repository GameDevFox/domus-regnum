import type { Game } from "../types";

// Help engaged for one occasion and gone the morning after. This is where a full purse goes late
// in the season: each costs more the grander the house has become.
export type HiredDef = { id: string; name: string; glyph: string; base: number; effect: string };

export const HIRED: HiredDef[] = [
  { id: "quartet", name: "A string quartet", glyph: "🎻", base: 40, effect: "For the evening, every serving of Grace in the house counts double (on top of any music of your own)." },
  { id: "chef", name: "A chef from town", glyph: "👨‍🍳", base: 40, effect: "For the evening, every serving of Comfort in the house counts double." },
  { id: "footmen", name: "Two footmen", glyph: "🤵", base: 25, effect: "Two more pairs of hands to serve, for the evening only." },
];

export const HIRED_BY_ID: Record<string, HiredDef> = Object.fromEntries(HIRED.map((h) => [h.id, h]));

/** What it costs to engage this for the coming occasion: the square of the chapter. */
export const hiredCost = (g: Game, id: string): number => HIRED_BY_ID[id].base * Math.min(g.chapter, MAX_PRICE_CHAPTER) * Math.min(g.chapter, MAX_PRICE_CHAPTER);
const MAX_PRICE_CHAPTER = 6;

export const isHired = (g: Game, id: string): boolean => (g.hired ?? []).includes(id);
