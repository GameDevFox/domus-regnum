import { PLACES, choicesFor, tell, whyNotTell } from "../game";
import type { Ask, Game, NotNow, PlaceId } from "../game";
import { askLine, foundSays } from "./ask-says";
import { MAP_ART, PIECES } from "./map-art";
import { faceOf } from "./map-places";
import { el } from "./panel";
import { notNowSays } from "./who-says";

// Someone out of doors has nothing left to do (she has found a place, or something it holds;
// what she was at is done; her basket is full; her time at it is up; she has come where she was
// only told to go), and asks what she is to do next. The question is put before the player over
// the map, and time stands still until it is answered (the game sees to that).
//
// It says who asks (a party asks once, with all their faces), where, and why, in a line; and
// has two answers: stay, and come home (the rules' `choicesFor` says whether each can be done,
// and if not, why: it is shown disabled with that as its tooltip). With something queued still
// to come (she asked on finding something, or what is queued next cannot be done, and the line
// says why), a third: go on with it. Nothing else is offered on it: what she is to do next is given from the
// place cards, which send someone waiting at a place as they send anyone (the author,
// 2026-11-16: "we shouldn't have any actions on the "What's next?" card that are already on the
// area card"). Told to stay, she waits, and the card of the place she is at is put up at once,
// so that the next press gives her something to do there; and time goes on standing still
// until it is given, or the card is put away (stay-hold.ts).

/** The answers the question has, each a picture with its name: everything else she can be told is done from the place cards. Going on is offered only with something queued. */
const ANSWERS: { told: "stay" | "on" | "home"; glyph: string; name: string }[] = [
  { told: "stay", glyph: "✋", name: "Stay: she waits there, and the place's card is put up to give her something to do. Time stands still until she is given it, or the card is put away" },
  { told: "on", glyph: "⏭️", name: "Go on with what is queued" },
  { told: "home", glyph: "🏠", name: "Come home" },
];

/** Which question a card puts: by who asks, where, why, what she has found there, and the step she is stuck on. Nobody asking is no question. */
export const askKey = (ask: Ask | undefined): string => (ask ? `${ask.who} at ${ask.place} (${ask.why}): ${(ask.news ?? []).join(", ")}${ask.stuck ? `; stuck on ${JSON.stringify(ask.stuck.next)} (${ask.stuck.why})` : ""}` : "");

/** The question and how its answers stand: a step taken out of her queue while she asks changes whether, and why not, she can go on. */
const cardKey = (game: Game, ask: Ask | undefined): string => (ask ? `${askKey(ask)} | ${ANSWERS.map(({ told }) => `${told} ${whyNotTell(game, ask.who, told)}`).join(", ")}` : "");

/** The question, as a card in the middle of the map. `answered` is called once it has been, with the answer. */
/** An answer's name, and why it cannot be told, if that is said in words: of her or him (`whom`), or of a party. */
export const answerSays = (name: string, why: NotNow | null, whom?: string): string => {
  const reason = why ? notNowSays(why, whom) : "";
  return reason ? `${name}. ${reason}` : name;
};

export const askCard = (game: Game, ask: Ask, answered: (told: "stay" | "on" | "home") => void): HTMLElement => {
  const place = PLACES[ask.place];
  const veil = el("div", "map-ask-veil");
  const card = el("section", "map-ask");
  card.setAttribute("role", "alertdialog");
  const line = askLine(game, ask);
  card.setAttribute("aria-label", line);
  const piece = el("img", "map-ask-piece");
  piece.src = MAP_ART + PIECES[ask.place].file;
  piece.alt = "";
  const says = el("p", "map-ask-says");
  const faces = el("span", "map-ask-faces");
  faces.append(...[ask.who, ...(ask.with ?? [])].map(faceOf));
  says.append(faces, el("span", "", `${line}.`));
  // What is queued next and cannot be done: why, in a line of its own.
  // (Of her or him; of a party, as of no one in particular.)
  const whom = ask.with ? undefined : ask.who;
  const stuck = ask.stuck && notNowSays(ask.stuck.why, whom) ? [el("p", "map-ask-why", `${notNowSays(ask.stuck.why, whom)}.`)] : [];
  // What she has found there, by its picture, beside the place's.
  const { names } = foundSays(ask);
  const finds = el("div", "map-ask-finds");
  for (const one of names) finds.append(el("span", "map-ask-find", one.glyph));

  // Staying and coming home, as the rules have them just now (`choicesFor`): either, if it cannot be done, disabled with why.
  const choices = choicesFor(game, ask.who);
  const ends = el("div", "map-ask-ends");
  ends.append(
    ...ANSWERS.filter(({ told }) => told !== "on" || choices.some((one) => one.told === "on")).map(({ told, glyph, name }) => {
      // (Not among them at all, she cannot be told it: as for nobody.)
      const choice = choices.find((one) => one.told === told);
      const why = choice ? choice.why : "nobody";
      const chip = el("button", "chip map-ask-choice map-ask-end");
      chip.append(el("span", "map-ware-glyph", glyph));
      chip.dataset.told = told;
      chip.disabled = why !== null;
      const said = answerSays(name, why, whom);
      chip.title = said;
      chip.setAttribute("aria-label", said);
      chip.addEventListener("click", () => {
        if (tell(game, ask.who, told)) answered(told);
      });
      return chip;
    }),
  );

  card.append(piece, ...(names.length > 0 ? [finds] : []), el("h2", "map-card-name", place.name), says, ...stuck, el("h3", "heading map-ask-heading", "What next?"), ends);
  veil.append(card);
  return veil;
};

/** The question waiting first, put up in a pane, and made again only when it is another, or its answers stand otherwise (`cardKey`): call what this returns to bring it up to the moment. `stayed` is called with the place she was told to stay at, and who asked. */
export const askOn = (pane: HTMLElement, game: Game, stayed: (place: PlaceId, who: string) => void): (() => boolean) => {
  let up: HTMLElement | null = null;
  let asked = "";
  /** Bring the question up to the moment; true while one is over the map. */
  const draw = (): boolean => {
    const [ask] = game.asks;
    const whose = cardKey(game, ask);
    if (whose === asked) return up !== null;
    asked = whose;
    up?.remove();
    up = ask
      ? askCard(game, ask, (told) => {
          draw();
          if (told === "stay") stayed(ask.place, ask.who);
        })
      : null;
    if (up) pane.append(up);
    return up !== null;
  };
  return draw;
};
