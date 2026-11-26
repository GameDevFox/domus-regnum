import { draw, newSearch } from "./discovery";
import type { Searching } from "./discovery";

// The odds of finding each thing a place holds, against the minutes spent looking: what the
// author asked for on 2026-11-16, "a graph … with like number of turns towards the bottom and
// then like chance of discovery along the other axis". They are not worked out by formula but
// by playing: the place is searched many times over with the very rules the game uses (`draw`
// in discovery.ts), each time with its own dice, and what happened is counted. So whatever the
// rules come to allow (aimed draws, pools that stay, blanks), the graph is of the rules as they
// are, and a place that exists nowhere but in a set of dials can be tried as well as a real one.
// A place of several decks is played as the game plays it: every minute, each deck makes its own
// draws, and what is first and last found is of the whole place.

/** Dice that are the same for the same seed (mulberry32). */
export const dice = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
};

/**
 * The odds of one thing: `by[m]` is the share of games in which it had been found within `m`
 * minutes (so `by[0]` is 0); the minute by which it is found in a tenth, a half and nine tenths
 * of games (null where it is not found so often within the minutes reckoned); in what share of
 * games it was the first thing found, and the last; and in what share it was never found.
 */
export type OddsOf = { id: string; by: number[]; early: number | null; typical: number | null; late: number | null; first: number; last: number; never: number };

/** The odds of everything a place holds: over so many games, each of at most so many minutes. */
export type Odds = { minutes: number; games: number; of: OddsOf[] };

/** How a place is looked over for the reckoning: by someone exploring it or gathering in it (each deck then makes its own draws a minute of that), how many games at the most, the dice, and the longest a game may go on. */
export type Reckoning = { how: "explore" | "gather"; games?: number; seed?: number; longest?: number };

/** Games played at the most and at the least, and about how many draws all of them together may make: a place with a great many points is played fewer times, so that the answer is not long in coming. */
const MOST_GAMES = 2000;
const FEWEST_GAMES = 200;
const DRAWS_IN_ALL = 1_500_000;
/** The longest a game is played, in minutes, unless told otherwise: ten hours. */
const LONGEST = 600;
const [TENTH, HALF, NINE_TENTHS] = [0.1, 0.5, 0.9];

/** The minute by which something was found in such a share of games: null if it was not found in so many. */
const minuteBy = (found: number[], games: number, share: number): number | null => {
  const wanted = Math.ceil(share * games);
  return found.length >= wanted && wanted > 0 ? found[wanted - 1] : null;
};

/** The draws a minute a deck makes for someone exploring or gathering: gathering's are never aimed. */
export const drawsOf = (deck: Searching, how: Reckoning["how"]): { aimed: number; stray: number } => (how === "explore" ? { aimed: deck.aimed, stray: deck.stray } : { aimed: 0, stray: deck.gather });

export const oddsOf = (decks: Searching[], { how, games = MOST_GAMES, seed = 1, longest = LONGEST }: Reckoning): Odds => {
  const draws = decks.map((deck) => drawsOf(deck, how));
  const perMinute = draws.reduce((sum, one) => sum + one.aimed + one.stray, 0);
  // With every point of every deck drawn there is nothing more to happen: no game is longer than the slowest deck lasts.
  const lasts = decks.map((deck, n) => {
    const points = deck.finds.reduce((sum, f) => sum + f.pool, 0) + deck.blanks;
    const each = draws[n].aimed + draws[n].stray;
    return each > 0 ? Math.ceil(points / each) : 0;
  });
  const minutes = Math.min(longest, Math.max(0, ...lasts));
  const played = Math.max(FEWEST_GAMES, Math.min(games, Math.floor(DRAWS_IN_ALL / Math.max(1, minutes * perMinute))));
  const finds = decks.flatMap((deck) => deck.finds);
  const at: Record<string, number[]> = Object.fromEntries(finds.map((f) => [f.id, []]));
  const first: Record<string, number> = {};
  const last: Record<string, number> = {};
  for (let game = 0; game < played; game++) {
    const searches = decks.map(newSearch);
    const chance = dice(seed + game);
    const found: string[] = [];
    for (let minute = 1; minute <= minutes && found.length < finds.length; minute++) {
      decks.forEach((deck, n) => {
        for (const id of draw(searches[n], deck, draws[n], (other) => found.includes(other), chance)) {
          found.push(id);
          at[id].push(minute);
        }
      });
    }
    if (found.length > 0) first[found[0]] = (first[found[0]] ?? 0) + 1;
    // The last is only the last if everything was found.
    if (found.length === finds.length && found.length > 0) last[found[found.length - 1]] = (last[found[found.length - 1]] ?? 0) + 1;
  }
  // The graph runs as far as anything happened, and no farther.
  const ran = Math.max(0, ...Object.values(at).map((minutesFound) => Math.max(0, ...minutesFound)));
  return {
    minutes: ran,
    games: played,
    of: finds.map(({ id }) => {
      const found = [...at[id]].sort((a, b) => a - b);
      const by = Array.from({ length: ran + 1 }, () => 0);
      for (const minute of found) by[minute] += 1;
      for (let minute = 1; minute <= ran; minute++) by[minute] += by[minute - 1];
      return {
        id,
        by: by.map((count) => count / played),
        early: minuteBy(found, played, TENTH),
        typical: minuteBy(found, played, HALF),
        late: minuteBy(found, played, NINE_TENTHS),
        first: (first[id] ?? 0) / played,
        last: (last[id] ?? 0) / played,
        never: 1 - found.length / played,
      };
    }),
  };
};
