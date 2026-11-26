import { outingOf } from "../game";
import type { Game } from "../game";

// Told to stay ("What next?", ✋), she waits, and the card of the place she is at is put up to
// give her something to do there. Time goes on standing still while that is being chosen (the
// author's list, 2026-11-18: 'Clock stays paused if user selects "Wait" on "What Next?"
// window.'): she was told to stay so as to be told more, and the minutes spent choosing it are
// not hers to lose. It stands until she is given something (sent to do it, something queued for
// her, or called home), or until the card is put away or the map shut, which is to leave her
// waiting. The page holds it (map-view.ts says when, main.ts keeps the clock still, and the
// clock shows it as it shows a question waiting); the rules know nothing of it, and a game
// played without the page runs on.

/** Whether someone told to stay is still only waiting. (Given anything, she waits no longer: sent to it, called home, or something queued for her, the rules have her at it at once.) */
export const stillWaiting = (game: Game, who: string): boolean => outingOf(game, who)?.waits === true;

/** Whether time is still held for her: she has been given nothing yet, and a place's card is still up to give it from. */
export const heldFor = (game: Game, who: string | null, cardUp: boolean): boolean => who !== null && cardUp && stillWaiting(game, who);
