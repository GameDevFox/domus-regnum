import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import type { Odds, OddsOf } from "../game";
import { el } from "./dom";
import { MOST, MOST_BUCKETS, bucketsOf, newBucket, newDeck, within } from "./odds-areas";
import type { Area, Bucket, Deck } from "./odds-areas";
import { percent } from "./odds-chart";

// The table of the odds window: a block for each of an area's decks, each drawn from every
// minute on its own. In each, a row for each thing the deck holds, with its dials to be set (how
// many points there are of it, how many it needs, whether its points stay in the draw once it is
// found) and, beside them, what comes of them: when it is found as a rule, between when mostly,
// and how often it is the first found and the last, of everything in the area. Under the rows
// are the deck's own dials. A number typed here is the area's from that moment: the rows are not
// made again for it, only what comes of it is.

type TableProps = {
  area: Area;
  /** The area as it stands now, and its odds once they have been reckoned (null until then). */
  now: () => Area;
  reckoned: Value<{ area: string; odds: Odds } | null>;
  /** Change the area. `reshaped` says the rows themselves are different (a thing or a deck more or fewer), and are to be made again. */
  change: (to: (area: Area) => Area, reshaped?: boolean) => void;
};

const HEADS: { says: string; title: string }[] = [
  { says: "Thing", title: "What there is to find" },
  { says: "Points", title: "Its pool: how many points of it there are about. The more, the sooner it is found as a rule" },
  { says: "Needs", title: "How many of its points must be come upon before it is found" },
  { says: "Stays", title: "Once found, its points stay in the draw and are still in the way of finding the rest (berries are still all about a forest); unticked, they leave it (a shop that is known is not looked for)" },
  { says: "As a rule", title: "The minute by which it has been found in half of games" },
  { says: "Mostly", title: "Between which minutes it is found in four games of five: by the first in a tenth of games, by the second in nine tenths" },
  { says: "First", title: "In what share of games it is the first thing found in the area" },
  { says: "Last", title: "In what share of games it is the last thing found in the area" },
];
const NONE = "—";
/** Where the Stays heading is among them. */
const STAYS = 3;
/** The cells of what comes of a thing's dials: as a rule, mostly, first, last. */
const OUTCOMES = 4;

const number = (scope: Scope, value: number, least: number, most: number, says: string, set: (to: number) => void): HTMLInputElement => {
  const input = document.createElement("input");
  Object.assign(input, { type: "number", className: "odds-number", min: String(least), max: String(most), step: "1", value: String(value) });
  input.setAttribute("aria-label", says);
  input.title = says;
  scope.listen(input, "input", () => set(within(input.value, least, most)));
  return input;
};

const minutes = (minute: number | null): string => (minute === null ? NONE : `${minute} min`);
/** What comes of a thing's dials, cell by cell. */
const comesOf = (odds: OddsOf | undefined): string[] => {
  if (!odds) return ["…", "", "", ""];
  const never = odds.never > 0 ? ` (never in ${percent(odds.never)})` : "";
  return [`${minutes(odds.typical)}${never}`, odds.early === null ? NONE : `${odds.early}–${odds.late ?? "…"} min`, percent(odds.first), percent(odds.last)];
};

/** How a deck's points last, in words: at its draws a minute of exploring, and of gathering. */
const lastsSays = ({ buckets, blanks, stray, aimed, gather }: Deck): string => {
  const points = buckets.reduce((total, b) => total + b.pool, 0) + blanks;
  const exploring = stray + aimed;
  const lasts = (draws: number, of: string): string => `at ${draws} draw${draws === 1 ? "" : "s"} a minute of ${of} they last ${Math.ceil(points / draws)} minutes`;
  const ways = [...(exploring > 0 ? [lasts(exploring, "exploring")] : []), ...(gather > 0 ? [lasts(gather, "gathering")] : [])];
  const short = buckets.filter((b) => b.need > b.pool).map((b) => b.name);
  return `${points} points in all${ways.length > 0 ? `: ${ways.join("; ")}, and by then everything in it is found` : ", and no draw is made"}.${short.length > 0 ? ` Never found as it stands: ${short.join(", ")} (needs more points than there are of it).` : ""}`;
};

/** One deck's block: its name, its rows, its dials, and what is done with it. What comes of the figures is set into each row's cells by the table. */
const DeckBlock = (scope: Scope, { deck, own, decks, change }: { deck: Deck; own: boolean; decks: number; change: TableProps["change"] }): { node: HTMLElement; rows: { id: string; outcome: HTMLElement[] }[]; sum: HTMLElement } => {
  const node = el("section", "odds-deck");
  node.dataset.deck = deck.id;
  node.append(el("h4", "odds-deck-name", `Set of pools: ${deck.id}`));
  const setDeck = (to: (deck: Deck) => Deck, reshaped = false): void => change((a) => ({ ...a, decks: a.decks.map((d) => (d.id === deck.id ? to(d) : d)) }), reshaped);
  const setBucket = (id: string, to: Partial<Bucket>): void => setDeck((d) => ({ ...d, buckets: d.buckets.map((b) => (b.id === id ? { ...b, ...to } : b)) }));
  const table = el("table", "odds-table");
  const head = el("tr", "");
  for (const { says, title } of HEADS) {
    const cell = el("th", "", says);
    cell.title = title;
    head.append(cell);
  }
  head.append(el("th", ""));
  table.append(head);

  const rows = deck.buckets.map((bucket) => {
    const row = el("tr", "");
    row.dataset.bucket = bucket.id;
    const named = el("td", "");
    const thing = el("div", "odds-thing");
    named.append(thing);
    const key = el("span", "odds-key");
    key.style.background = `var(--series-${bucket.slot + 1})`;
    thing.append(key);
    if (own) {
      const name = el("input", "odds-name");
      Object.assign(name, { type: "text", value: bucket.name, maxLength: 24 });
      name.setAttribute("aria-label", "What this thing is called");
      scope.listen(name, "input", () => setBucket(bucket.id, { name: name.value }));
      thing.append(name);
    } else {
      const name = el("span", "", `${bucket.glyph} ${bucket.name}`.trim());
      // (What is hidden in the game has no question mark there until it is found: said here, since it is not a dial.)
      if (bucket.hidden) name.title = "Hidden in the game: nothing stands for it until it is found";
      thing.append(name);
    }
    const cell = (...within: (Node | string)[]): HTMLTableCellElement => {
      const made = el("td", "");
      made.append(...within);
      return made;
    };
    const stays = document.createElement("input");
    Object.assign(stays, { type: "checkbox", checked: bucket.lingers, disabled: !own });
    stays.setAttribute("aria-label", `${bucket.name}: its points stay in the draw once it is found`);
    stays.title = own ? HEADS[STAYS].title : `${HEADS[STAYS].title}. In the game this goes by what the thing is: what grows stays, a way on, a shop or something hidden does not`;
    scope.listen(stays, "change", () => setBucket(bucket.id, { lingers: stays.checked }));
    const outcome = Array.from({ length: OUTCOMES }, () => el("td", "odds-comes"));
    row.append(
      named,
      cell(number(scope, bucket.pool, 0, MOST.pool, `${bucket.name}: points in its pool`, (pool) => setBucket(bucket.id, { pool }))),
      cell(number(scope, bucket.need, 1, MOST.need, `${bucket.name}: points it needs`, (need) => setBucket(bucket.id, { need }))),
      cell(stays),
      ...outcome,
    );
    const last = el("td", "");
    if (own) {
      const remove = el("button", "chip odds-remove", "✕");
      remove.setAttribute("aria-label", `Take ${bucket.name} out of the area`);
      remove.title = "Take this thing out of the area";
      scope.listen(remove, "click", () => setDeck((d) => ({ ...d, buckets: d.buckets.filter((b) => b.id !== bucket.id) }), true));
      last.append(remove);
    }
    row.append(last);
    table.append(row);
    return { id: bucket.id, outcome };
  });
  node.append(table);

  // The deck's own dials.
  const dials = el("div", "odds-dials");
  const dial = (label: string, title: string, input: HTMLElement): HTMLElement => {
    const made = el("label", "odds-dial");
    made.title = title;
    made.append(el("span", "", label), input);
    return made;
  };
  const aim = document.createElement("select");
  aim.className = "odds-number odds-aim";
  for (const [value, says] of [["rolled", "one rolled for"], ["nearest", "the nearest to found"]] as const) aim.append(new Option(says, value, false, deck.aim === value));
  scope.listen(aim, "change", () => setDeck((d) => ({ ...d, aim: aim.value === "nearest" ? "nearest" : "rolled" })));
  dials.append(
    dial("Dead ends", "Blank points: they count towards nothing, and stretch the time this set takes without changing what in it is found before what", number(scope, deck.blanks, 0, MOST.blanks, "Blank points", (blanks) => setDeck((d) => ({ ...d, blanks })))),
    dial("Stray draws a minute", "Draws a minute of exploring makes of this set, from all its points left, whatever they are of", number(scope, deck.stray, 0, MOST.draws, "Stray draws a minute", (stray) => setDeck((d) => ({ ...d, stray })))),
    dial("Aimed draws a minute", "Draws a minute of exploring makes of this set from the pool of one thing, until it is found: things are then found at an even beat. No place of the game's uses them", number(scope, deck.aimed, 0, MOST.draws, "Aimed draws a minute", (aimed) => setDeck((d) => ({ ...d, aimed })))),
    dial("Aimed at", "How the one thing aimed draws are aimed at is chosen", aim),
    dial("Gathering draws a minute", "Stray draws a minute of gathering makes of this set: she learns the place by being in it", number(scope, deck.gather, 0, MOST.draws, "Gathering draws a minute", (gather) => setDeck((d) => ({ ...d, gather })))),
  );
  if (own) {
    const add = el("button", "chip odds-add", "＋ Add a thing");
    add.title = `Another thing to find, in this set: an area holds ${MOST_BUCKETS} at the most, in all its sets together`;
    add.disabled = deck.buckets.length >= MOST_BUCKETS;
    scope.listen(add, "click", () =>
      change((a) => {
        const bucket = newBucket(a);
        return bucket ? { ...a, decks: a.decks.map((d) => (d.id === deck.id ? { ...d, buckets: [...d.buckets, bucket] } : d)) } : a;
      }, true),
    );
    dials.append(add);
    if (decks > 1) {
      const drop = el("button", "chip odds-drop-deck", "✕ Take this set away");
      drop.title = "Take this set of pools, and everything in it, out of the area";
      scope.listen(drop, "click", () => change((a) => ({ ...a, decks: a.decks.filter((d) => d.id !== deck.id) }), true));
      dials.append(drop);
    }
  }
  const sum = el("p", "odds-sum");
  node.append(dials, sum);
  return { node, rows, sum };
};

export const OddsTable = (scope: Scope, { area, now, reckoned, change }: TableProps): HTMLElement => {
  const own = area.place === null;
  const node = el("div", "odds-figures");
  const blocks = area.decks.map((deck) => DeckBlock(scope, { deck, own, decks: area.decks.length, change }));
  node.append(...blocks.map((block) => block.node));
  if (own) {
    const more = el("button", "chip odds-add-deck", "＋ Add a set of pools");
    more.title = "Another set of pools, drawn from every minute beside the others and knowing nothing of them, with its own dead ends and draws";
    more.disabled = bucketsOf(area).length >= MOST_BUCKETS;
    scope.listen(more, "click", () => change((a) => ({ ...a, decks: [...a.decks, newDeck(a)] }), true));
    node.append(more);
  }

  // What comes of the figures: said again whenever they have been reckoned afresh.
  scope.effect((use) => {
    const got = use(reckoned);
    const odds = got?.area === area.id ? got.odds : null;
    const decksNow = now().decks;
    area.decks.forEach((deck, n) => {
      const { rows, sum } = blocks[n];
      for (const { id, outcome } of rows) comesOf(odds?.of.find((one) => one.id === id)).forEach((text, cell) => (outcome[cell].textContent = odds ? text : cell === 0 ? "…" : ""));
      const current = decksNow.find((d) => d.id === deck.id) ?? deck;
      sum.textContent = `${lastsSays(current)}${odds ? ` Reckoned over ${odds.games} games.` : ""}`;
    });
  });
  return node;
};
