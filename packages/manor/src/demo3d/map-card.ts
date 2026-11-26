import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { OUTING_LIMITS, PLACES, SHOPS_AT, THINGS, USUAL_TERMS, backAt, choicesFor, intelOf, doingsAt, explore, gather, gathersIn, goTo, isAsking, nextBedtime, outingOf, outingStatus, sendToTown, timeText, timesFrom, timesOf, walkMinutes, whyNotSend, goodOf, lotsToSell, priceOf, queueReturn, sellInTown, tell, whyNotSell } from "../game";
import type { Errand, Game, GoodId, NotNow, OutingDoing, PlaceId, Terms } from "../game";
import { SendModes } from "./card-send";
import { MAP_ART, PIECES } from "./map-art";
import { CROSS, nameOf } from "./map-places";
import { named } from "./dom";
import { el } from "./panel";
import { slotNodes, slotsSay } from "./place-slots";
import type { Considering } from "./plans";
import { revealOn } from "./reveal";
import { SalePicker, WarePicker, carriedInTown } from "./town-wares";
import { saleSays } from "./outing-says";
import { WhoRow } from "./who-row";
import { answerFirstSays, asksAfterSays, backSays, fromWhereSays, hereAlreadySays, noneWithSays, notNowSays } from "./who-says";

// The card for a place on the map, shown when the place is pressed: how far it is, what has
// been found there, what can be done there, and who is to go. In town, something is bought:
// which shop and which of its wares is chosen there (town-wares.ts).
// Anywhere else is explored, always, found or not; and a place that has been found and holds
// something can be gathered in. Before all of these, she can be sent only to go there, and asked
// what to do when she is there (the author's list, 2026-11-16: "Currently there's no seam to have
// her go to a location FIRST and then do stuff there"). Pressing someone's face sends her: from
// the house; or, on the road or waiting at a place, from where she is. In town, someone waiting
// there sells what she has with her. Someone asking what next is answered first.
//
// She is sent to do a thing, and asks what next when it is done; unless the return is asked for
// beforehand, by the chip with the house on it, which is unlit until it is pressed and goes out
// again once she is sent (the author, 2026-11-16: "if a player knows ahead of time that they want
// them to return, they should have some way to end that operation on to the end of the last
// action"). Two more things bound her, set here too: the longest she may stay, and whether she
// is to be home before bed. And how a press sends her (card-send.ts): at once, or added after
// what she is at (➕); alone, or chosen to go with others as one party (👥).

type CardProps = {
  game: Game;
  place: PlaceId;
  /** The outing the player is thinking of: the pointer is on someone's face. The dial shows how long she would be. */
  considering: Value<Considering | null>;
  /** Put the card away. */
  close: () => void;
  /** Whether the dev menu is unlocked. */
  dev: Value<boolean>;
};

export type PlaceCard = { node: HTMLElement; /** Bring what it says up to the moment. */ refresh: () => void };

const HOUR = 60;
const PERCENT = 100;
/** Minutes are summed a step at a time and come out a hair short: thirty is shown as thirty. This much is added back before they are cut to whole ones. */
const SUMMED_SHORT_BY = 1e-6;
const whole = (minutes: number): number => Math.floor(minutes + SUMMED_SHORT_BY);
/** What she can be sent to do at a place: a thing there, or only to go. */
type Doing = OutingDoing | "go";
/** What was last chosen, kept from one card to the next: what to do, the longest she may stay, and whether she is to be home before bed. */
// (Nothing is chosen until something is pressed: a card then opens on the first thing that can be done there, which in town is buying, exploring being offered everywhere.)
let wanted: Doing | null = null;
let limit = USUAL_TERMS.limit;
let homeByBed = USUAL_TERMS.homeByBed;
/** Whether the return is asked for beforehand: unlit until pressed, and put out again once someone is sent. */
let thenHome = false;
const terms = (): Terms => ({ limit, homeByBed, thenHome });

const stayText = (minutes: number): string => (minutes < HOUR ? `${minutes} min` : `${minutes / HOUR} h`);
/** In words, for a screen reader and a tooltip. */
const staySays = (minutes: number): string => (minutes < HOUR ? `${minutes} minutes` : minutes === HOUR ? "1 hour" : `${minutes / HOUR} hours`);

/** Each thing that can be done: its picture, its name, and what it is in a sentence. */
const DOINGS: Record<Doing, { glyph: string; label: string; says: string; kind: Considering["kind"] }> = {
  go: { glyph: "🚶", label: "Go", says: "Only go there: what she is to do there is asked when she is there", kind: "walk" },
  buy: { glyph: "🧺", label: "Buy", says: "Buy one thing in town, and bring it home", kind: "errand" },
  sell: { glyph: "💰", label: "Sell", says: "Sell what the house has too much of, at a stall that deals in it: as much of one thing as her basket holds, and what it fetches comes home with her", kind: "errand" },
  explore: { glyph: "🧭", label: "Explore", says: "Explore: she goes over the place for as long as she may stay. What turns up, if anything does, is as it falls out, and she asks what to do next when it does. Nothing is brought home", kind: "explore" },
  gather: { glyph: "🧺", label: "Gather", says: "Gather, until her basket is full: what is here is brought home, and a little is learned of the place the while", kind: "gather" },
};

/**
 * What a place's card is made of, as one line: what can be done there, and what has been found there to do it
 * with (the shops and stalls in town, the things to gather). The card is put up for these as they stand; when
 * the line is another, the card is to be made again (the author's list, 2026-11-16: "Discovering a shop didn't
 * unlock it's activity on the card. Had to close and open the card again for it to show up").
 */
export const cardShape = (game: Game, place: PlaceId): string => JSON.stringify([game.places[place], doingsAt(game, place), place === SHOPS_AT ? game.shops : [], game.finds[place] ?? []]);

export const PlaceCard = (scope: Scope, { game, place, considering, close, dev }: CardProps): PlaceCard => {
  const found = game.places[place] === "found";
  const { name, holds } = PLACES[place];
  const doings = doingsAt(game, place);
  /** What she can be sent for: only to go, first, and then each thing that can be done here. */
  const offers: Doing[] = doings.length > 0 ? ["go", ...doings] : [];
  const walk = walkMinutes(place);
  /** What is to be done: what was last chosen, if it can be done here; else the first thing that can be done here. */
  const doing = (): Doing | undefined => (wanted !== null && offers.includes(wanted) ? wanted : doings[0]);

  const node = el("section", "map-card");
  node.dataset.card = place;
  node.setAttribute("aria-label", found ? name : "A place not yet visited");

  // What it is: its piece and its name, or a question mark.
  const top = el("div", "map-card-top");
  if (found) {
    const piece = el("img", "map-card-piece");
    piece.src = MAP_ART + PIECES[place].file;
    piece.alt = "";
    top.append(piece);
  } else top.append(el("span", "map-card-unknown", "?"));
  const shut = el("button", "map-card-close");
  shut.innerHTML = CROSS;
  named(shut, "Put this card away");
  scope.listen(shut, "click", close);
  top.append(el("h2", "map-card-name", found ? name : "Not yet visited"), shut);

  // How far it is.
  const far = el("div", "map-card-row");
  far.title = `${walk} minutes' walk from the house, each way`;
  far.append(el("span", "map-card-glyph", "🚶"), el("span", "map-card-text", `${walk} min`));
  node.append(top, far);

  // What has been found here, slot by slot (place-slots.ts): a tick, where there was never anything to find. And how much of the place is known.
  const slots = el("span", "map-card-slots");
  let slotsSaid = "";
  const nothing = el("span", "map-slot known", "✓");
  // (Not "nothing to be found": what is hidden is not known of until it is, and exploring is always offered.)
  nothing.title = "Nothing here is known of that is still to be found";
  const share = el("span", "map-card-share");
  const foundRow = el("div", "map-card-row map-card-found");
  // (In town, what there is to find is its shops: a slot each, as a way on has.)
  if (found) {
    foundRow.append(el("span", "map-card-glyph", "🔎"), slots, share);
    node.append(foundRow);
  }
  // With the dev menu unlocked, a right-click on a question mark here makes the thing known.
  revealOn(scope, node, { game, dev, then: () => refresh() });

  // In town: which shop, and which of its wares.
  const picker = doings.includes("buy") ? WarePicker(scope, { game, changed: () => refresh() }) : null;
  // …and at which stall what is sold, and what.
  const sale = doings.includes("sell") ? SalePicker(scope, { game, changed: () => refresh() }) : null;
  const sold = (): GoodId | null => sale?.good() ?? null;
  /** What is to be done, in a word or two: buying and selling say what. */
  const labelOf = (now: Doing): string => {
    const good = sold();
    return now === "buy" && picker ? `Buy ${picker.ware().name.toLowerCase()}` : now === "sell" && good ? `Sell ${goodOf(good).name.toLowerCase()}` : DOINGS[now].label;
  };
  /** Why someone cannot be sent to do what is chosen, if she cannot. */
  const whyNot = (id: string, now: Doing): NotNow | null => {
    const good = sold();
    return now === "sell" ? (good ? whyNotSell(game, id, good) : "nothing") : whyNotSend(game, id, now === "go" ? null : now, { to: place, terms: terms() }, picker?.ware().id);
  };

  // What can be done here, after only going, and for how long.
  const choices = offers.map((what) => {
    const button = el("button", "chip map-doing", `${DOINGS[what].glyph} ${DOINGS[what].label}`);
    button.title = DOINGS[what].says;
    button.dataset.doing = what;
    scope.listen(button, "click", () => {
      wanted = what;
      refresh();
    });
    return { what, button };
  });
  const what = el("div", "map-card-row map-card-doings");
  what.append(...choices.map((c) => c.button));
  // What bounds her: the longest she may stay, and whether she is to be home before bed. Buying flour is of a fixed length, and has neither.
  const bounds = el("div", "map-card-row map-card-stays");
  const chips = OUTING_LIMITS.map((minutes) => {
    const chip = el("button", "chip map-stay", stayText(minutes));
    named(chip, `At most ${staySays(minutes)} there`);
    scope.listen(chip, "click", () => {
      limit = minutes;
      refresh();
    });
    return { minutes, chip };
  });
  const bed = el("button", "chip map-bed", "🛏️");
  scope.listen(bed, "click", () => {
    homeByBed = !homeByBed;
    refresh();
  });
  /** What she would bring home: the flour and its price, or how full the basket would be at the most. */
  const brings = el("span", "map-card-brings");
  // The return asked for beforehand: lit, she comes home when it is done, without asking.
  const back = el("button", "chip map-bed map-then", "🏠");
  scope.listen(back, "click", () => {
    thenHome = !thenHome;
    refresh();
  });
  const limits = el("span", "map-card-glyph", "⏳");
  // (The bed and the house kept together at the end: where the row is too narrow for all of it, they go under the stays as one, and no chip is broken over two lines.)
  const ends = el("span", "map-card-stay-ends");
  ends.append(bed, back);
  bounds.append(limits, ...chips.map((c) => c.chip), ends);

  /** Minutes she would be gone at the most, sent now; and the sending of her. */
  // (Someone on the road is turned round where she is: for her it is reckoned from there, and not from the house.)
  const gone = (id?: string): number => {
    const times = id ? timesFrom(game, id, place, terms()) : timesOf(game.clock, place, terms());
    // Only going, she would be home a walk after she was there.
    if (doing() === "go") return times.arrive + walk - game.clock;
    return (doing() === "buy" || doing() === "sell" ? backAt(game.clock) : times.back) - game.clock;
  };
  // Someone waiting in town sells what she has with her (the rules' `tell`), and anyone else what the house has, taken from the pantry as she goes.
  const sell = (id: string): boolean => {
    const good = sold();
    if (good === null) return false;
    if (!outingOf(game, id)) return sellInTown(game, id, good, thenHome);
    return tell(game, id, { sell: good }) && (!thenHome || queueReturn(game, id, true));
  };
  /** Why someone out cannot be told to sell what is chosen, in words, if she cannot: only someone waiting in town sells, and only what she has with her. */
  const sellOut = (id: string): string | null => {
    const good = sold();
    const choice = choicesFor(game, id).find(({ told }) => typeof told === "object" && "sell" in told && told.sell === good);
    if (choice) return choice.why ? notNowSays(choice.why, id) : null;
    return choicesFor(game, id).length > 0 ? noneWithSays(id) : "Only someone waiting in town sells what she has with her";
  };
  const sendNow = (id: string): boolean => {
    const now = doing();
    if (now === "sell") return sell(id);
    if (now === "buy") return sendToTown(game, id, picker?.ware().id, thenHome);
    if (now === "go") return goTo(game, id, place, terms());
    return now === "gather" ? gather(game, id, place, terms()) : explore(game, id, place, terms());
  };
  /** Sent, the return asked for is spent: the next sending asks again. */
  const send = (id: string): void => {
    if (sendNow(id)) thenHome = false;
  };

  /** What comes after she is sent, as her face says it: home by a time, with the return asked for; else that she asks. */
  const after = (id: string): string => {
    const now = doing();
    if (!thenHome) return asksAfterSays(id, now === "go");
    const fixed = (now === "buy" || now === "sell") && !outingOf(game, id);
    return `${fixed ? "back at" : "back by"} ${timeText(game.clock + gone(id))}${fixed ? "" : " at the latest"}`;
  };
  /** Where someone out would be sent from: here, at another place, or on the road (who-says.ts). */
  const fromWhere = (id: string): string => fromWhereSays(game, id, place, terms());

  /** What a press would send her to do, as the rules have it. */
  const errandNow = (): Errand | null => {
    const now = doing();
    const good = sold();
    if (!now || (now === "sell" && !good)) return null;
    return now === "go" ? { to: place, doing: null } : now === "buy" ? { to: place, doing: "buy", ware: picker?.ware().id } : now === "sell" ? { to: place, doing: "sell", good: good ?? undefined } : { to: place, doing: now };
  };
  /** Why someone cannot be sent alone just now, in words, as her face says it; null if she can be. */
  const whyAlone = (id: string): string | null => {
    const now = doing();
    if (!now) return "Nothing to be done here";
    const out = outingOf(game, id);
    const here = out !== undefined && outingStatus(game, out).is === "waiting" && out.to === place;
    const notNow = whyNot(id, now);
    return now === "sell" && out ? sellOut(id) : now === "go" && here ? hereAlreadySays(id) : notNow && notNowSays(notNow, id);
  };
  const modes = SendModes(scope, {
    game,
    errand: errandNow,
    terms,
    whyAlone,
    changed: () => refresh(),
    sent: () => {
      thenHome = false;
      refresh();
    },
  });

  // Who is to go: each of the household, by her face (who-row.ts). While the pointer is on her, or she has the focus, the dial shows how long she would be gone.
  const who = WhoRow(scope, {
    ids: game.household,
    press: (id) => {
      const taken = modes.press(id);
      if (taken === "queued") thenHome = false;
      else if (!taken) send(id);
      considering.set(null);
      refresh();
    },
    over: (id) => {
      const now = doing();
      considering.set(id && now && whyNot(id, now) === null && !isAsking(game, id) && modes.stateOf(id, "") === null ? { who: id, kind: DOINGS[now].kind, gone: gone(id), open: !thenHome } : null);
    },
    stateOf: (id) => {
      const now = doing();
      if (!now) return { label: nameOf(id), title: nameOf(id), disabled: true };
      const out = outingOf(game, id);
      const label = `${labelOf(now)}: ${nameOf(id)}`;
      // Asking what next, she is answered first: on the map, where the question is.
      if (isAsking(game, id)) return { label, title: `${label}. ${answerFirstSays(id)}`, disabled: true, out: true };
      const otherwise = modes.stateOf(id, label);
      if (otherwise) return otherwise;
      const why = whyAlone(id);
      const says = why !== null ? (out ? `Out. ${backSays(out)}. ${why}` : why) : out ? `${fromWhere(id)}; ${after(id)}` : after(id).replace(/^./, (first) => first.toUpperCase());
      return { label, title: `${label}. ${says}`, disabled: why !== null, out: out !== undefined };
    },
  });
  if (doings.length) node.append(...(picker ? [picker.node] : []), ...(sale ? [sale.node] : []), what, bounds, modes.node, who.node);
  scope.add(() => considering.set(null));

  const refresh = (): void => {
    foundRow.title = `${whole(game.explored[place] ?? 0)} minutes' worth of exploring done here`;
    // The slots are drawn again when what they would show has changed.
    // (With the dev menu unlocked, what is hidden here has a slot before it is come upon.)
    const say = slotsSay(game, place, dev.peek());
    if (say !== slotsSaid) {
      slotsSaid = say;
      const nodes = slotNodes(game, place, dev.peek());
      slots.replaceChildren(...(nodes.length > 0 ? nodes : [nothing]));
    }
    const known = intelOf(game, place);
    share.textContent = `${Math.round(known * PERCENT)}%`;
    share.classList.toggle("over", known > 1);
    share.title = known > 1 ? "All there was to know of this place, and something nothing told of" : "How much of what there is to know of this place is known";

    const now = doing();
    if (!now) return;
    picker?.refresh();
    for (const { what: choice, button } of choices) {
      button.classList.toggle("on", choice === now);
      button.setAttribute("aria-pressed", String(choice === now));
    }
    for (const { minutes, chip } of chips) {
      chip.classList.toggle("on", minutes === limit);
      chip.setAttribute("aria-pressed", String(minutes === limit));
    }
    // The bed is lit while she is to be home before it; and it says when she would have to leave here, which is earlier the farther the place.
    const leaveBy = nextBedtime(game.clock) - walk;
    bed.classList.toggle("on", homeByBed);
    bed.setAttribute("aria-pressed", String(homeByBed));
    named(bed, homeByBed ? `Home before bed: she leaves here by ${timeText(leaveBy)}. Press to let her stay out overnight` : `She may stay out overnight. Press to have her home before bed: she would leave here by ${timeText(leaveBy)}`);
    // Buying and selling are of a fixed length, and only going is no time there: neither has a longest stay; and buying and selling are not held to bed. The return is asked for, or not, for every kind of sending.
    const fixed = now === "buy" || now === "sell";
    // ➕ lit, what is added is done on the terms of the outing it joins (outing-queue.ts): the longest stay and the bed would be ignored, and are not shown. (The return asked for is kept: it is queued after it.)
    const queuing = modes.queuing();
    limits.hidden = fixed || now === "go" || queuing;
    for (const { chip } of chips) chip.hidden = fixed || now === "go" || queuing;
    bed.hidden = fixed || queuing;
    back.classList.toggle("on", thenHome);
    back.setAttribute("aria-pressed", String(thenHome));
    named(back, thenHome ? "Then home: when it is done she comes home, without asking. Press to have her ask what next instead" : "Then home: not asked for, so when it is done she asks what next. Press to have her come home when it is done, without asking");
    // The shops and their wares are for buying, and the stalls and what they take for selling: each is put by while something else is to be done.
    if (picker) picker.node.hidden = now !== "buy";
    if (sale) sale.node.hidden = now !== "sell";
    sale?.refresh();
    const times = timesOf(game.clock, place, terms());
    // Each thing she would bring, by its picture: only what has been found here is gathered.
    const basket = gathersIn(game, place, Math.max(0, times.depart - times.arrive));
    const lots = holds.flatMap(({ thing }) => (basket[thing] ? [`${THINGS[thing].glyph} ×${basket[thing]}`] : []));
    const ware = picker?.ware();
    // Selling: what she would take, and what it would fetch.
    const good = sold();
    // (With none of it in the house, what someone waiting in town has with her.)
    const taken = good ? lotsToSell(game, good) || (carriedInTown(game)[good] ?? 0) : 0;
    brings.textContent = now === "buy" && ware ? `×${ware.lot} ${ware.glyph}  🪙 ${ware.price}` : now === "sell" ? (good ? `×${taken} ${goodOf(good).glyph} → 🪙 ${taken * priceOf(good)}` : "") : now === "gather" ? lots.join("  ") || "×0" : "";
    brings.title = now === "sell" && good ? saleSays(taken, good) : now === "gather" ? "What she would bring home, at the most" : now === "buy" && ware ? `${ware.name}: ${ware.price} coin${ware.lot > 1 ? ` for ${ware.lot}, and no cart to pay` : ""}` : DOINGS[now].says;
    // What she would bring is said beside what she is to do.
    if (brings.textContent && brings.parentElement !== what) what.append(brings);
    else if (!brings.textContent) brings.remove();
    modes.refresh();
    who.refresh();
  };
  refresh();
  return { node, refresh };
};
