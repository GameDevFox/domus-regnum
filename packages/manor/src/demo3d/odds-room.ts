import type { Scope } from "@scene-lib/scope";
import { Value } from "@scene-lib/value";

import { oddsOf, putBack, retune } from "../game";
import type { Game, Odds } from "../game";
import type { DevWindowButton } from "./dev-window";
import { mountDevWindow } from "./dev-window";
import { el } from "./dom";
import { areaOf, bucketsOf, copyOf, figuresOf, keptAreas, liveAreas, newArea, searchingOf } from "./odds-areas";
import type { Area } from "./odds-areas";
import { OddsChart } from "./odds-chart";
import type { Graph } from "./odds-chart";
import { OddsTable } from "./odds-table";
import "./odds.css";

// The odds of discovery, as a window of the dev menu's (the author, 2026-11-16: "The probability
// window should obviously have the graph, and then it should have a menu where you can pull up
// existing areas with their probability buckets, and maybe even the option to edit them live,
// and then also create a new one that doesn't have any effect on any place but is just for you
// to play around with and experiment for creating a new area down the line potentially").
//
// At the left, the areas: the places of the game's that hold anything to find, and areas of
// one's own that are nowhere in the game. In the middle, the graph of the one chosen
// (odds-chart.ts), reckoned by playing it many times over with the game's own rules
// (src/game/odds.ts), every deck of it together. Under it, deck by deck, its things and their
// dials (odds-table.ts).
//
// A place of the game's is edited live: a figure changed here is the game's from that moment
// (`retune` in src/game/discovery.ts), deck by deck, until the page is opened afresh. The edit is
// kept on the game being played (`game.dials`), and the tables the code was written with are not
// touched, so no other game sees it; the code's own figures are a button away (`putBack`). An area
// of one's own changes nothing, and is kept in this browser.

export type OddsRoom = {
  /** The button of the dev menu's that opens it. */
  button: DevWindowButton;
  open: Value<boolean>;
  areas: Value<Area[]>;
  chosen: Value<string>;
};

/** How long after the last change the odds are reckoned afresh, in milliseconds: not at every key of a number being typed. */
const RECKON_MS = 140;
const WAYS = [
  { id: "explore", says: "🧭 Exploring", title: "The odds for someone exploring the place: every draw a minute of it makes" },
  { id: "gather", says: "🧺 Gathering", title: "The odds for someone gathering in the place: she learns it by being in it, each set of pools making its own gathering draws a minute, none of them aimed" },
] as const;
type Way = (typeof WAYS)[number]["id"];

export const mountOddsRoom = (scope: Scope, { game }: { game: Game }): OddsRoom => {
  const open = Value(false);
  const areas = Value<Area[]>([...liveAreas(game), ...keptAreas.get()]);
  const chosen = Value(areas.peek()[0]?.id ?? "");
  const way = Value<Way>("explore");
  /** Counted up when what the table is made of is different (another area, a thing more or fewer, figures put back), as against a number typed into it. */
  const shape = Value(0);
  const reckoned = Value<{ area: string; odds: Odds } | null>(null);
  const graph = Value<Graph | null>(null);

  const areaNow = (): Area | undefined => areas.peek().find((a) => a.id === chosen.peek()) ?? areas.peek()[0];
  const reshape = (): void => shape.update((n) => n + 1);
  /** An area is changed: in the game too, if it is a place of the game's (each deck of it whose figures are other than they were); and kept, if it is one's own. */
  const change = (id: string, to: (area: Area) => Area, reshaped = false): void => {
    const before = areas.peek().find((a) => a.id === id);
    areas.update((all) => all.map((a) => (a.id === id ? to(a) : a)));
    const area = areas.peek().find((a) => a.id === id);
    const { place } = area ?? {};
    if (area && before && place) {
      const was = searchingOf(before);
      for (const deck of searchingOf(area)) if (JSON.stringify(deck) !== JSON.stringify(was.find((one) => one.id === deck.id))) retune(game, place, deck.id, deck);
    }
    keptAreas.set(areas.peek());
    if (reshaped) reshape();
  };
  const choose = (id: string): void => {
    chosen.set(id);
    reshape();
  };

  // The reckoning: of the area chosen, as it is being looked over, a moment after the last change. Only while the window is open.
  scope.effect((use, pending) => {
    if (!use(open)) return;
    const id = use(chosen);
    const area = use(areas).find((a) => a.id === id);
    const how = use(way);
    if (!area) return;
    const timer = setTimeout(() => {
      const odds = oddsOf(searchingOf(area), { how });
      reckoned.set({ area: area.id, odds });
      graph.set({ minutes: odds.minutes, spent: how === "explore" ? "minutes spent exploring" : "minutes spent gathering", lines: odds.of.flatMap((one) => bucketsOf(area).filter((b) => b.id === one.id).map((b) => ({ id: b.id, name: `${b.glyph} ${b.name}`.trim(), slot: b.slot, by: one.by }))) });
    }, RECKON_MS);
    pending.add(() => clearTimeout(timer));
  });

  mountDevWindow(scope, {
    open,
    title: "Discovery odds",
    closeSays: "Close the odds",
    className: "odds-room",
    fill: (shown, room) => {
      const body = el("div", "odds-body");
      const list = el("nav", "odds-areas");
      list.setAttribute("aria-label", "Areas");
      const main = el("div", "odds-main");
      body.append(list, main);
      room.append(body);

      // The areas: the game's places first, then one's own, then the making of another.
      shown.effect((use, made) => {
        const all = use(areas);
        const id = use(chosen);
        list.replaceChildren();
        for (const area of all) {
          const button = el("button", "odds-area");
          button.classList.toggle("on", area.id === id);
          button.setAttribute("aria-pressed", String(area.id === id));
          button.append(el("span", "odds-area-name", area.name), el("span", "odds-area-kind", area.place ? "in the game" : "its own"));
          made.listen(button, "click", () => choose(area.id));
          list.append(button);
        }
        const fresh = el("button", "chip odds-new", "＋ New area");
        fresh.title = "An area that is nowhere in the game: nothing is changed by it, and it is kept in this browser";
        made.listen(fresh, "click", () => {
          const area = newArea(areas.peek());
          areas.update((before) => [...before, area]);
          keptAreas.set(areas.peek());
          choose(area.id);
        });
        list.append(fresh);
      });

      // The one chosen: made again when it is another, or is made of other things; not for a number typed into it.
      shown.effect((use, made) => {
        use(shape);
        main.replaceChildren();
        const area = areaNow();
        if (!area) return;
        const own = area.place === null;

        const head = el("div", "odds-head");
        if (own) {
          const name = el("input", "odds-area-title");
          Object.assign(name, { type: "text", value: area.name, maxLength: 40 });
          name.setAttribute("aria-label", "What this area is called");
          made.listen(name, "input", () => change(area.id, (a) => ({ ...a, name: name.value })));
          head.append(name);
        } else head.append(el("h3", "odds-area-title", area.name));
        const ways = el("div", "odds-ways");
        for (const { id, says, title } of WAYS) {
          const chip = el("button", "chip", says);
          chip.title = title;
          made.listen(chip, "click", () => way.set(id));
          made.effect((useIn) => {
            chip.classList.toggle("on", useIn(way) === id);
            chip.setAttribute("aria-pressed", String(useIn(way) === id));
          });
          ways.append(chip);
        }
        head.append(ways);

        const chart = OddsChart(made, { graph });
        const note = el("p", "odds-note", own ? "An area of its own: nothing in the game is changed by it. It is kept in this browser." : "A place of the game's: a figure changed here is the game's at once, and that set of pools is then searched afresh (what has been found there stays found). It lasts until the page is opened again.");
        const table = OddsTable(made, { area, now: () => areaNow() ?? area, reckoned, change: (to, reshaped) => change(area.id, to, reshaped) });

        // What is done with the whole of it.
        const acts = el("div", "odds-acts");
        const copy = el("button", "chip", "⧉ Copy to a new area");
        copy.title = "An area of its own with these figures, to try things on: this one is left as it is";
        made.listen(copy, "click", () => {
          const copied = copyOf(areaNow() ?? area, areas.peek());
          areas.update((before) => [...before, copied]);
          keptAreas.set(areas.peek());
          choose(copied.id);
        });
        acts.append(copy);
        const { place } = area;
        if (place) {
          const back = el("button", "chip", "↺ As written");
          back.title = "Put the place's figures back as the code has them, every set of pools of it";
          made.listen(back, "click", () => {
            putBack(game, place);
            areas.update((all) => all.map((a) => (a.id === area.id ? areaOf(game, place) : a)));
            reshape();
          });
          acts.append(back);
        } else {
          const drop = el("button", "chip", "🗑 Delete this area");
          made.listen(drop, "click", () => {
            areas.update((all) => all.filter((a) => a.id !== area.id));
            keptAreas.set(areas.peek());
            choose(areas.peek()[0]?.id ?? "");
          });
          acts.append(drop);
        }
        // Its figures, set down to be copied out: for handing to whoever writes them into the code.
        const figures = el("input", "odds-copy");
        Object.assign(figures, { type: "text", readOnly: true });
        figures.setAttribute("aria-label", "This area's figures, to copy");
        figures.title = "This area's figures, to copy";
        made.listen(figures, "focus", () => figures.select());
        made.effect((useIn) => {
          figures.value = figuresOf(useIn(areas).find((a) => a.id === area.id) ?? area);
        });
        acts.append(figures);

        main.append(head, chart.node, note, table, acts);
      });
    },
  });

  return { open, areas, chosen, button: { glyph: "🎲", label: "Discovery odds", title: "The chance of finding each thing a place holds, by the minutes spent looking: the game's places, and areas of your own to try figures on", open: () => open.set(true) } };
};
