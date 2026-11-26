import type { Scope } from "@scene-lib/scope";
import { Value } from "@scene-lib/value";

import { INTEL_KINDS, anyUnknown, intelBook, intelOf, listedIn, revealableOf, tally } from "../game";
import type { CurioId, Game, IntelEntry, IntelKind } from "../game";
import { mountReader } from "./curio-reader";
import { MAP_ART, PIECES } from "./map-art";
import { tileLookOf } from "./book-tile";
import { mountMenu } from "./menu";
import { el } from "./panel";
import { slotNodes, slotsSay } from "./place-slots";
import { revealOn, setReveal } from "./reveal";
import "./book.css";

// The intel menu: everything there is to know in the game, kind by kind, each known or still a
// question mark (the author's asking, 2026-11-14: "sort of like an encyclopedia or bestiary").
// What is hidden is not there until it is found. What it shows is the rules' to say
// (`intelBook` in src/game/intel.ts); this is only the page.

type BookProps = { game: Game; /** Ticks once a frame, in seconds. */ frame: Value<number>; /** Whether the dev menu is unlocked: a right-click on a question mark then makes the thing known. */ dev: Value<boolean> };

export type Book = { open: Value<boolean>; /** The curio being looked at, if one is. */ reading: Value<CurioId | null> };

const KEY = "i";
/** The book is read again from the game this often while it is open, in seconds. */
const READ_EVERY = 0.25;
const PERCENT = 100;
/** Each kind's sign and name, for its tab. */
const KINDS: Record<IntelKind, { glyph: string; name: string }> = {
  place: { glyph: "🗺️", name: "Places" },
  thing: { glyph: "🧺", name: "Things" },
  crop: { glyph: "🌱", name: "Crops" },
  recipe: { glyph: "🍞", name: "Recipes" },
  ability: { glyph: "⭐", name: "Abilities" },
  invention: { glyph: "⚗️", name: "Inventions" },
};
/** What was hidden, and found. */
const HIDDEN = "✨";
const UNKNOWN = "?";

const percent = (share: number): string => `${Math.round(share * PERCENT)}%`;

/** An entry's picture: a place's piece as it is set down on the map, anything else by its sign. */
const pictureOf = (entry: IntelEntry, className: string): HTMLElement => {
  if (!entry.place) return el("span", `${className} book-glyph`, entry.glyph);
  const piece = el("img", `${className} book-piece`);
  piece.src = MAP_ART + PIECES[entry.place].file;
  piece.alt = "";
  return piece;
};

export const mountBook = (scope: Scope, { game, frame, dev }: BookProps): Book => {
  const reading = Value<CurioId | null>(null);
  mountReader(scope, { reading });
  // (The page says when the dev menu is unlocked, so that a question mark that can be made known shows it under the pointer.)
  scope.effect((use) => void document.body.classList.toggle("dev-unlocked", use(dev)));

  /** The tab being looked at, and the entry picked in it: kept while the book is shut, so that it opens where it was left. */
  let kind: IntelKind = "place";
  let picked: string | null = null;

  const fill = (shown: Scope, { card, title, slot: count }: { card: HTMLElement; title: HTMLElement; slot: HTMLElement }): void => {
    const tabs = el("div", "book-tabs");
    tabs.setAttribute("role", "tablist");
    const grid = el("div", "book-grid");
    const detail = el("div", "book-detail");
    card.append(tabs, grid, detail);

    let drawn = "";
    const draw = (): void => {
      const book = intelBook(game);
      // Drawn again only when what it would show has changed.
      const now = JSON.stringify([kind, picked, dev.peek(), book.map((e) => [e.known, e.says]), book.map((e) => (e.place ? [intelOf(game, e.place), slotsSay(game, e.place, dev.peek())] : 0))]);
      if (now === drawn) return;
      drawn = now;
      const all = tally(book);
      count.textContent = `${all.known} / ${all.of}${all.hidden > 0 ? `  ${HIDDEN} ${all.hidden}` : ""}`;
      count.title = `${all.known} of the ${all.of} things there are to know${all.hidden > 0 ? `, and ${all.hidden} that nothing told of` : ""}`;
      // (With the dev menu unlocked, a right-click on the menu's name makes everything known, and one on a tab all of its kind: reveal.ts.)
      setReveal(title, anyUnknown(game) ? { kind: "all" } : null);
      tabs.replaceChildren(
        ...INTEL_KINDS.map((k) => {
          const of = tally(book.filter((e) => e.kind === k));
          const tab = el("button", "chip book-tab", `${KINDS[k].glyph} ${KINDS[k].name}`);
          tab.append(el("span", "book-tab-count", `${of.known}/${of.of}${of.hidden > 0 ? ` ${HIDDEN}` : ""}`));
          tab.setAttribute("role", "tab");
          tab.setAttribute("aria-selected", String(k === kind));
          tab.setAttribute("aria-label", `${KINDS[k].name}: ${of.known} of ${of.of} known`);
          tab.dataset.kind = k;
          setReveal(tab, anyUnknown(game, k) ? { kind: "all", of: k } : null);
          tab.classList.toggle("on", k === kind);
          return tab;
        }),
      );
      // (With the dev menu unlocked, what is hidden is listed before it is found: shown for what it is, and marked as not yet come upon.)
      const entries = listedIn(book, dev.peek()).filter((e) => e.kind === kind);
      // The entry looked at: the one picked, if it is of this kind and known; otherwise the first that is known.
      const looked = entries.find((e) => e.id === picked && e.known) ?? entries.find((e) => e.known) ?? null;
      grid.replaceChildren(
        ...entries.map((entry) => {
          const tile = el("button", "book-tile");
          tile.dataset.id = entry.id;
          tile.dataset.known = String(entry.known);
          tile.classList.toggle("on", entry === looked);
          tile.classList.toggle("hidden-find", entry.hidden);
          const look = tileLookOf(entry, dev.peek());
          if (look.shown) tile.append(pictureOf(entry, "book-tile-picture"), el("span", "book-tile-name", entry.name));
          else tile.append(el("span", "book-unknown", UNKNOWN));
          // (Not yet known, and shown for what it is: a mark in its corner says which look it has.)
          tile.classList.toggle("not-known", look.unfound === "not-known");
          tile.classList.toggle("not-found", look.unfound === "not-found");
          if (look.unfound) tile.append(el("span", "book-tile-mark", look.unfound === "not-found" ? HIDDEN : UNKNOWN));
          // (Not known, it cannot be pressed; but it is not switched off, so that a right-click on it is still heard: reveal.ts.)
          tile.setAttribute("aria-disabled", String(!entry.known));
          setReveal(tile, entry.known ? null : revealableOf(entry));
          const says = look.says;
          tile.setAttribute("aria-label", says);
          tile.title = says;
          return tile;
        }),
      );
      detail.replaceChildren();
      if (!looked) {
        detail.append(el("p", "book-nothing", `${UNKNOWN} ${UNKNOWN} ${UNKNOWN}`));
        return;
      }
      detail.dataset.id = looked.id;
      const words = el("div", "book-words");
      words.append(el("h3", "book-name", looked.name), ...looked.says.map((line) => el("p", "book-says", line)));
      if (looked.place) {
        // How much of the place is known: over the hundred when what was hidden there has been found.
        const share = intelOf(game, looked.place);
        const known = el("p", "book-share", `🔎 ${percent(share)}`);
        known.classList.toggle("over", share > 1);
        known.title = share > 1 ? "All there was to know of it, and something nothing told of" : "How much of what there is to know of it is known";
        // What there is to find there, slot by slot, as on its card on the map: a found one leads to its own page here.
        const slots = el("div", "book-slots");
        slots.append(known, ...slotNodes(game, looked.place, dev.peek()));
        for (const slot of slots.querySelectorAll<HTMLElement>("[data-goto]")) {
          slot.setAttribute("role", "button");
          slot.tabIndex = 0;
          slot.title = `${slot.title}. Press to read of it`;
        }
        words.append(slots);
      }
      if (looked.curio) {
        const look = el("button", "chip book-look", "👁 Look at it");
        look.disabled = !game.curios.includes(looked.curio);
        look.dataset.look = looked.curio;
        words.append(look);
      }
      detail.append(pictureOf(looked, "book-picture"), words);
    };

    // Drawn as it opens, so that it is never seen empty; and then kept up with the game.
    draw();
    let next = 0;
    shown.effect((useIn) => {
      const at = useIn(frame);
      if (at < next) return;
      next = at + READ_EVERY;
      draw();
    });
    shown.listen(card, "click", (e: MouseEvent) => {
      const on = e.target as Element;
      const tab = on.closest<HTMLElement>(".book-tab");
      const tile = on.closest<HTMLButtonElement>(".book-tile");
      const look = on.closest<HTMLButtonElement>(".book-look");
      const goto = on.closest<HTMLElement>("[data-goto]")?.dataset.goto;
      if (tab) kind = tab.dataset.kind as IntelKind;
      else if (tile && tile.getAttribute("aria-disabled") !== "true") picked = tile.dataset.id ?? null;
      else if (look && !look.disabled) reading.set(look.dataset.look as CurioId);
      // A found slot of a place leads to the page of what it is.
      else if (goto) [kind, picked] = goto.split(":") as [IntelKind, string];
      draw();
    });
    shown.listen(card, "keydown", (e: KeyboardEvent) => {
      const goto = (e.target as Element).closest<HTMLElement>("[data-goto]")?.dataset.goto;
      if (!goto || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      [kind, picked] = goto.split(":") as [IntelKind, string];
      draw();
    });
    revealOn(shown, card, { game, dev, then: draw });
  };

  // (The button, the key, the card and the shutting of it are any menu's: menu.ts.)
  const open = mountMenu(scope, { game, title: "Intel", called: "the intel menu", holds: "what the house knows", key: KEY, way: { glyph: "📖", button: "book-button", side: "middle" }, card: "book", slot: "book-tally", blocks: true, fill });
  return { open, reading };
};
