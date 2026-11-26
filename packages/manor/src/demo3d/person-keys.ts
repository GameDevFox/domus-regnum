// The keys that follow the household, one each: the Master's is the backtick, the key left of
// 1 (the author's list, 2026-11-16: "Make "The Master" bound to `1` or even better, maybe even
// "`""), and the rest are numbered from 1 in the order of the list. The dev menu is opened by
// the same key with Shift, the tilde (dev-menu.ts).

/** The Master, by his id. */
const MASTER = "master";
export const MASTER_KEY = "`";
/** Shift and the Master's key: the dev menu. */
export const DEV_MENU_KEY = "~";

/**
 * The household in the order the page lists it: the Master at the head (the author, 2026-11-17:
 * "move The Master to the top of the stack on the character view"), then the rest as the game
 * has them. Only the page's order: the game's own (who pays for a party, who is stepped first)
 * is as it was.
 */
export const listed = (ids: string[]): string[] => [...ids.filter((id) => id === MASTER), ...ids.filter((id) => id !== MASTER)];

/** The key for each of the household, in the order they are listed. */
export const householdKeys = (ids: string[]): string[] => {
  let numbered = 0;
  return ids.map((id) => (id === MASTER ? MASTER_KEY : String(++numbered)));
};
