import { MASTERY_LOAVES, bakedBy, homeNext, isMaster, outingOf, outingStatus, timeText, timesFrom } from "../game";
import type { Game, NotNow, Outing, PlaceId, Terms } from "../game";
import { nameOf, pronounsOf } from "./map-places";
import { left, minutesSays, placeSays, statusSays } from "./outing-says";
import type { Workplace } from "./workplaces";

// The sentences of the page that speak of one of the household by "she" or "he": each takes her
// or his words from the cast (`pronounsOf`, map-places.ts), so that the Master is "he" in every
// tooltip (the playtest of 2026-11-17, 1.3). A sentence of no one in particular (whoever is sent,
// a party) is written as it was, with "she". Only words are made here: the cards that put them up
// are map-card.ts, card-send.ts, work-crew.ts, ask-mark.ts, character-card.ts and panel.ts.

/** Why someone cannot be sent, in words for the tooltip: of her or him, or, with no one named, of whoever is. */
export const notNowSays = (why: NotNow, id?: string): string => {
  const p = pronounsOf(id);
  const says: Record<NotNow, string> = {
    nobody: "",
    out: `${p.Subject} is out already`,
    full: `${p.Possessive} basket is full`,
    night: "Nobody is sent out at night",
    coin: "There is not the coin for it",
    late: `${p.Subject} could not be there and home again before bed`,
    needless: "There is no use for another just now",
    shop: "Nobody of the house knows where that is sold yet",
    nothing: "There is none of it in the house to sell",
  };
  return says[why];
};

/** When someone out is back, as far as it is known: at a time, once it is settled; by a time at the latest, with the return asked for; and not known, while she is to ask what next. */
export const backSays = (out: Outing): string => {
  const p = pronounsOf(out.who);
  return out.done ? `Back at ${timeText(out.back)}` : out.homeward || homeNext(out) ? `Back when it is done, and by ${timeText(out.back)}` : `${p.Subject} asks what next when it is done: when ${p.subject} is back is not known`;
};

/** What someone out is at, for the tooltip on her row of the household: asking, that time stands still until she is told. */
export const outTitle = (game: Game, out: Outing): string => {
  const p = pronounsOf(out.who);
  const status = outingStatus(game, out);
  const says = statusSays(game, status, out.who);
  return status.is === "asking" ? `Out: ${says}. Time stands still until ${p.subject} is told: press ${p.possessive} name to see ${p.possessive} question` : `Out: ${says}. ${backSays(out)}`;
};

/** The mark by the clock: who is waiting to be told what next. */
export const askMarkSays = (id: string): string => {
  const p = pronounsOf(id);
  return `${nameOf(id)} is waiting to be told what next, and time stands still until ${p.subject} is. Press to see ${p.possessive} question`;
};

/** Her loaves, on her character card: towards the mastery of bread, or with it. */
export const bakedText = (id: string, baked: number, master: boolean): string => (master ? `Loaves baked: ${baked}. ${pronounsOf(id).Subject} has the mastery of bread` : `Loaves baked: ${baked} of the ${MASTERY_LOAVES} that earn the mastery of bread`);

// On a place's card (map-card.ts).

/** Asking what next, she is answered first. */
export const answerFirstSays = (id: string): string => {
  const p = pronounsOf(id);
  return `${p.Subject} is asking what ${p.subject} is to do next: answer ${p.object} first`;
};
/** Sent only to go where she is waiting. */
export const hereAlreadySays = (id: string): string => `${pronounsOf(id).Subject} is here already`;
/** Told to sell a thing she does not carry. */
export const noneWithSays = (id: string): string => {
  const p = pronounsOf(id);
  return `${p.Subject} has none of it with ${p.object}`;
};
/** What comes after she is sent, with the return not asked for: that she asks; begun without a capital, as it follows a clause. */
export const asksAfterSays = (id: string, onlyGo: boolean): string => {
  const p = pronounsOf(id);
  return onlyGo ? `${p.subject} asks what to do when ${p.subject} is there` : `${p.subject} asks what next when it is done`;
};
/** Where someone out would be sent from (the author's list, 2026-11-16): waiting here, she begins at once; waiting at another place, she goes on from there; on the road, she turns where she is. */
export const fromWhereSays = (game: Game, id: string, place: PlaceId, terms: Terms): string => {
  const p = pronounsOf(id);
  const out = outingOf(game, id);
  const status = out ? outingStatus(game, out) : null;
  if (status?.is === "waiting" && status.at === place) return `${p.Subject} is here, and begins at once`;
  const off = `${minutesSays(left(timesFrom(game, id, place, terms).arrive - game.clock))} off`;
  return status?.is === "waiting" ? `${p.Subject} is at ${placeSays(game, status.at)}, and goes on from there: ${off}` : `${p.Subject} is on the road, and turns for here where ${p.subject} is: ${off}`;
};

/** Why someone out cannot be asked home: already on the way. */
export const homewardSays = (id: string): string => `${pronounsOf(id).Subject} is on ${pronounsOf(id).possessive} way home already`;

// How a press on her face sends her (card-send.ts).

/** Out, she cannot be chosen for a party. */
export const partyFromHouseSays = (id: string): string => `${pronounsOf(id).Subject} is out: a party is sent from the house`;
/** Chosen for the party, or not yet. */
export const chosenSays = (id: string, on: boolean): string => (on ? `Chosen to go with the party. Press to leave ${pronounsOf(id).object} out` : `Press to choose ${pronounsOf(id).object} for the party`);
/** ➕ lit, her face adds the thing after what she is at. */
export const addAfterSays = (id: string, label: string): string => `Add after what ${pronounsOf(id).subject} is at: ${label}`;
/** …and why it cannot be added, if it cannot. */
export const addNotNowSays = (id: string, why: NotNow): string => notNowSays(why, id) || `Nothing can be added for ${pronounsOf(id).object} just now`;

// Who works at a place (work-crew.ts).

/** Why someone cannot be given a kind of work, where not everyone can. */
const NOT_HERS: Partial<Record<Workplace["job"], string>> = { lab: "Only an alchemist can be given the alchemy" };

/** What pressing her face on a place of work does: give it to her, or take it from her; out, she comes home for it. And, for the baking, how far she is towards mastering it. */
export const crewSays = (game: Game, place: Workplace, id: string, { may, held, other }: { may: boolean; held: boolean; other?: Workplace }): string => {
  const p = pronounsOf(id);
  const out = outingOf(game, id) !== undefined;
  // Out of doors, she is called home for it (the rules' `assign`), and is not kept from it.
  const says = !may ? (NOT_HERS[place.job] ?? `This is not work ${p.subject} can be given`) : held ? `Press to take it from ${p.object}` : out ? `${p.Subject} is out: ${p.subject} comes home for it${other ? `, and leaves ${other.called} for it` : ""}` : other ? `Press to give it to ${p.object}: ${p.subject} leaves ${other.called} for it` : `Press to give it to ${p.object}`;
  const more = place.job === "bake" ? (isMaster(game, id) ? ` ${p.Subject} has mastered bread.` : ` ${bakedBy(game, id)} of ${MASTERY_LOAVES} loaves towards mastering it.`) : "";
  return `${place.label}: ${nameOf(id)}. ${says}.${more}`;
};
