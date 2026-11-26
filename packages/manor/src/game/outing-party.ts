import { outingOf } from "./outing";
import { begin, send, whyNotAll } from "./outing-send";
import type { Errand, Game, NotNow, Terms } from "./types";

// Several people sent out together, as one party (Claude's proposal, agreed by the author with
// "Yes", 2026-11-16, in packages/domus/docs/design/22-reset-direction.md, "Several people
// together"). They travel as one: the same road, the same clocks, the same queue, and one
// question when they ask what next, which answered is answered for all; whatever is done to
// one of them (re-sending her, cancelling, calling her home, queuing) is done to the party.
// Each carries her own basket of twelve lots, which is how more is carried: gathering, each
// fills her own at the place's pace, and the party has done when every basket is full;
// exploring, each makes her own draws, so two go over a place twice as fast; what each comes
// upon is her own. A ware is bought once, for the party, by the first of it, who pays; selling,
// each sells all she carries of the goods. Coming home, each walks in and puts away what she
// has. They set out when the last of them is out at the gate (outing-step.ts). A party is sent
// from the house only: it cannot be joined once it has set out, nor split.

/** Who is named, each once, in the order first named: someone named twice is one of the party once, and pays once. */
const eachOnce = (ids: string[]): string[] => [...new Set(ids)];

/** Why these people cannot be sent out together on an errand just now, if they cannot: none of them may be out already. One alone is sent as she always was. */
export const whyNotParty = (game: Game, named: string[], errand: Errand, terms: Terms): NotNow | null => {
  const ids = eachOnce(named);
  if (ids.length === 0) return "nobody";
  if (ids.length > 1 && ids.some((id) => outingOf(game, id))) return "out";
  return whyNotAll(game, ids, errand, terms);
};

/** Send these people out together on an errand, as one party, the first of them the one who pays. One alone is sent as she always was. True if they were sent. */
export const sendParty = (game: Game, named: string[], errand: Errand, terms: Terms): boolean => {
  const ids = eachOnce(named);
  if (ids.length === 1) return send(game, ids[0], errand, terms);
  if (whyNotParty(game, ids, errand, terms) !== null) return false;
  ids.forEach((id, n) => begin(game, id, errand, terms, n === 0));
  for (const id of ids) outingOf(game, id)!.party = [...ids];
  return true;
};
