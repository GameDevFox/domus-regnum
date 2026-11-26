import type { Scope } from "@scene-lib/scope";

import { JOB_PLACES, assign, mayWork, outingOf } from "../game";
import type { Game } from "../game";
import { nameOf } from "./map-places";
import { el } from "./panel";
import { crewSays } from "./who-says";
import { WhoRow } from "./who-row";
import { WORKPLACES } from "./workplaces";
import type { Workplace } from "./workplaces";
import "./work.css";

// Who works at a place: the part of every such place's card that is the same (the author's,
// 2026-11-16: "should we instead assign the character from the task?"). A row of the
// household's faces, each pressed to give her the work and pressed again to take it from her;
// and, at the head of the card, who has it now. As many may have it as the work has places.

/** Nobody has the work: a head and shoulders with no face, and the words (the author's, 2026-11-16: "a blank silloette of a character head icon with text that says "No one assigned""). */
const NO_FACE = '<svg viewBox="0 0 30 30" width="30" height="30" aria-hidden="true"><circle cx="15" cy="15" r="14" fill="#e6dcc3" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="12" r="5" fill="currentColor"/><path d="M5.5 25.5a9.5 9.5 0 0 1 19 0" fill="currentColor"/></svg>';
export const NOBODY_SAYS = "No one assigned";
/** What someone is at when it is not a place's work, as a picture in the corner of her face. */
const OUT = "🗺️";
const ASLEEP = "💤";

type CrewProps = { game: Game; place: Workplace; /** The place at the head of the card where who has the work is said. */ slot: HTMLElement };

export const WorkCrew = (scope: Scope, { game, place, slot }: CrewProps): { node: HTMLElement; refresh: () => void } => {
  slot.classList.add("work-keeper");
  const places = JOB_PLACES[place.job];
  const who = WhoRow(scope, {
    ids: game.household,
    press: (id) => assign(game, id, game.posts[id] === place.job ? null : place.job),
    stateOf: (id) => {
      const held = game.posts[id] === place.job;
      const other = WORKPLACES.find((w) => w.job === game.posts[id]);
      const out = outingOf(game, id) !== undefined;
      // Not everyone may have every work: the alchemy is an alchemist's, and the rest cannot be pressed for it.
      const may = mayWork(id, place.job);
      // (What pressing her face does, in words: who-says.ts.)
      return { label: `${place.label}: ${nameOf(id)}`, title: crewSays(game, place, id, { may, held, other }), on: held, disabled: !may, out, doing: held ? undefined : (other?.glyph ?? (out ? OUT : game.abed[id] === "in" ? ASLEEP : undefined)) };
    },
  });
  who.node.setAttribute("role", "group");
  who.node.setAttribute("aria-label", `Who is ${place.label.toLowerCase()}`);

  let said: string | null = null;
  const refresh = (): void => {
    who.refresh();
    const has = game.household.filter((id) => game.posts[id] === place.job);
    if (has.join() === said) return;
    said = has.join();
    const names = has.map(nameOf).join(", ");
    const noFace = el("span", "work-keeper-none");
    noFace.innerHTML = NO_FACE;
    // How many have it, of how many may: said only where more than one may.
    const count = el("span", "work-count", places > 1 ? `${has.length} / ${places}` : "");
    count.title = `${has.length} of the ${places} places at this work are taken`;
    slot.replaceChildren(...(has.length > 0 ? [el("span", "work-keeper-name", names)] : [noFace, el("span", "work-keeper-name", NOBODY_SAYS)]), ...(places > 1 ? [count] : []));
    slot.dataset.who = has.join(" ");
    slot.title = has.length > 0 ? `${place.label}: ${names}` : `${place.nobody}: press a face to give it to someone`;
    slot.setAttribute("aria-label", slot.title);
  };
  refresh();
  return { node: who.node, refresh };
};
