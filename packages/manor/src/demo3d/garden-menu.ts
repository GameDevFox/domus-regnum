import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { CROPS, PLOT_AT, SQUARES, SQUARES_ACROSS, bearsSays, daysLeft, isRipe, want, wantAll } from "../game";
import type { CropId, Game, Square } from "../game";
import { mountMenu } from "./menu";
import { el } from "./panel";
import { WorkCrew } from "./work-crew";
import { workplaceOf } from "./workplaces";
import "./garden.css";

// The kitchen garden's own menu (the author's asking, 2026-11-14: "Most of the time the garden
// menu is just idle space so it makes sense that most of the time it would be off screen").
// Its four plots are set out as they are seen from beyond the garden, looking back at the house
// (the author's, 2026-11-14: "as if you were looking at the crops from the back side of the
// house beyond the garden, rather than from inside the house"): the house at the top, the
// north at the bottom, the east at the left. Each plot is of six squares. A crop is taken
// up from the row of seeds, and a square is pressed to say that it is to be sown there; pressed
// again, nothing is. Who sees to the garden is chosen here too, by her face, as at every place of
// work (work-crew.ts).

type GardenProps = { game: Game; /** Ticks once a frame, in seconds. */ frame: Value<number> };

const GARDEN = workplaceOf("garden");
export const GARDEN_KEY = GARDEN.key;
/** The garden is read from the game this often while its menu is open, in seconds. */
const READ_EVERY = 0.25;
const EMPTY = "＋";
const RIPE = "✓";
const WATERED = "💧";
const lower = (name: string): string => name.toLowerCase();
/** Where each plot is set out on the card: its column and row, counted from the south-east, which is the top left to someone looking at the house from beyond the garden. */
const rank = (values: number[], value: number): number => [...new Set(values)].sort((a, b) => b - a).indexOf(value);
const SET_OUT = PLOT_AT.map((at) => ({ column: rank(PLOT_AT.map((p) => p.x), at.x) + 1, row: rank(PLOT_AT.map((p) => p.z), at.z) + 1 }));
/** The rows of the card: the house at the top; then the plots, with the aisle between their first row and their second. */
const HOUSE_ROW = 1;
const AISLE_AFTER = 1;
const rowOf = (plotRow: number): number => HOUSE_ROW + plotRow + (plotRow > AISLE_AFTER ? 1 : 0);

/** The crop taken up from the row of seeds: kept while the menu is shut, so that it opens as it was left. */
let seed: CropId | null = null;

/** What a square is, in words: for a screen reader and a tooltip. */
const squareSays = (bed: Square): string => {
  const left = daysLeft(bed);
  const is =
    bed.crop === null
      ? bed.wanted
        ? `empty: ${lower(CROPS[bed.wanted].name)} to be sown here`
        : "empty, and nothing is to be sown here"
      : isRipe(bed)
        ? `${lower(CROPS[bed.crop].name)}, ripe: to be picked`
        : `${lower(CROPS[bed.crop].name)}, ${left} watered day${left === 1 ? "" : "s"} from ripe${bed.watered ? ", watered today" : ", not yet watered today"}`;
  return `${is}${bed.crop !== null && bed.wanted !== bed.crop ? `. After this is picked: ${bed.wanted ? lower(CROPS[bed.wanted].name) : "nothing"}` : ""}`;
};

export const mountGardenMenu = (scope: Scope, { game, frame }: GardenProps): Value<boolean> => {
  const fill = (shown: Scope, { card, slot: keeper }: { card: HTMLElement; slot: HTMLElement }): void => {
    const seeds = el("div", "garden-seeds");
    seeds.setAttribute("role", "group");
    seeds.setAttribute("aria-label", "What is to be sown");
    const field = el("div", "garden-field");

    const plots = game.garden.plots.map((_, p) => {
      const plot = el("div", "plot");
      plot.dataset.plot = String(p);
      plot.setAttribute("role", "group");
      plot.setAttribute("aria-label", `Plot ${p + 1}`);
      plot.style.gridColumn = String(SET_OUT[p].column);
      // (A row is left between the plots for the aisle.)
      plot.style.gridRow = String(rowOf(SET_OUT[p].row));
      const squares = Array.from({ length: SQUARES }, (_unused, s) => {
        const tile = el("button", "square");
        tile.dataset.square = String(s);
        const glyph = el("span", "square-glyph");
        const state = el("span", "square-state");
        const next = el("span", "square-next");
        const bar = el("span", "square-bar");
        tile.append(glyph, state, next, bar);
        // Pressing a square says that the crop taken up is to be sown there next; pressed again, that nothing is.
        shown.listen(tile, "click", () => {
          if (seed === null) return;
          want(game, p, s, game.garden.plots[p].squares[s].wanted === seed ? null : seed);
          show();
        });
        return { tile, glyph, state, next, bar };
      });
      const beds = el("div", "plot-squares");
      beds.style.gridTemplateColumns = `repeat(${SQUARES_ACROSS}, minmax(0, 1fr))`;
      // (A plot's squares are counted from its north-west, which is its bottom right from here: so they are set down last first.)
      beds.append(...[...squares].reverse().map((sq) => sq.tile));
      // The whole plot at once: every square of it the crop taken up, or, if they all are already, nothing.
      const all = el("button", "chip plot-all", "▦");
      shown.listen(all, "click", () => {
        if (seed === null) return;
        wantAll(game, p, game.garden.plots[p].squares.every((bed) => bed.wanted === seed) ? null : seed);
        show();
      });
      plot.append(beds, all);
      return { node: plot, squares, all };
    });
    const aisle = el("div", "garden-aisle");
    aisle.style.gridRow = String(HOUSE_ROW + AISLE_AFTER + 1);
    const house = el("div", "garden-house", "🏠");
    house.title = "The house: the garden is seen from beyond it, looking back";
    house.style.gridRow = String(HOUSE_ROW);
    house.setAttribute("aria-hidden", "true");
    // (The plots are put on the field in their own order, whatever their places on it.)
    field.append(...plots.map((plot) => plot.node), aisle, house);
    const crew = WorkCrew(shown, { game, place: GARDEN, slot: keeper });
    card.append(crew.node, seeds, field);

    let drawn = "";
    const show = (): void => {
      const { known } = game.garden;
      if (seed === null || !known.includes(seed)) seed = known[0] ?? null;
      // Who sees to it: nothing is sown, watered or picked while nobody does.
      crew.refresh();
      const now = JSON.stringify([game.garden.plots, known, seed]);
      if (now === drawn) return;
      drawn = now;

      // The seeds: each crop the house knows, with how long it takes and what a square bears.
      seeds.replaceChildren(
        ...known.map((id) => {
          const { name, glyph, days, again, bears } = CROPS[id];
          const chip = el("button", "chip seed");
          chip.dataset.crop = id;
          chip.append(el("span", "seed-glyph", glyph), el("span", "seed-figures", `☀${days}${again !== null ? ` ↻${again}` : ""} ×${bears}`));
          chip.classList.toggle("on", id === seed);
          chip.setAttribute("aria-pressed", String(id === seed));
          const says = `${name}: ripe ${days} watered days after sowing${again !== null ? `, and again every ${again}` : ""}; a square bears ${bearsSays(id)}`;
          chip.setAttribute("aria-label", says);
          chip.title = says;
          return chip;
        }),
      );

      game.garden.plots.forEach((plot, p) => {
        plot.squares.forEach((bed, s) => {
          const { tile, glyph, state, next, bar } = plots[p].squares[s];
          const ripe = isRipe(bed);
          // What is in it; or, empty, what is to be sown in it; or nothing.
          const seen = bed.crop ?? bed.wanted;
          glyph.textContent = seen ? CROPS[seen].glyph : EMPTY;
          tile.classList.toggle("growing", bed.crop !== null);
          tile.classList.toggle("ripe", ripe);
          tile.classList.toggle("to-sow", bed.crop === null && bed.wanted !== null);
          tile.classList.toggle("wet", bed.watered);
          state.textContent = bed.crop === null ? "" : ripe ? RIPE : `${daysLeft(bed)}${bed.watered ? ` ${WATERED}` : ""}`;
          // What is to be sown next is shown beside what grows, when it is something else (or nothing).
          next.textContent = bed.crop !== null && bed.wanted !== bed.crop ? `→ ${bed.wanted ? CROPS[bed.wanted].glyph : "✕"}` : "";
          bar.style.setProperty("--grown", String(bed.crop ? Math.min(1, bed.grown / CROPS[bed.crop].days) : 0));
          const says = `Plot ${p + 1}, square ${s + 1}: ${squareSays(bed)}`;
          tile.setAttribute("aria-label", says);
          tile.title = seed ? `${says}. Press to have ${lower(CROPS[seed].name)} sown here next, or nothing` : says;
        });
        const full = seed !== null && plot.squares.every((bed) => bed.wanted === seed);
        const says = seed === null ? `Plot ${p + 1}` : full ? `Plot ${p + 1}: press to have nothing sown in any of it` : `Plot ${p + 1}: press to have ${lower(CROPS[seed].name)} sown in all of it`;
        plots[p].all.setAttribute("aria-label", says);
        plots[p].all.title = says;
        plots[p].all.classList.toggle("on", full);
      });
    };
    // A crop is taken up by pressing it in the row of seeds.
    shown.listen(seeds, "click", (e: MouseEvent) => {
      const crop = (e.target as Element).closest<HTMLElement>(".seed")?.dataset.crop as CropId | undefined;
      if (!crop) return;
      seed = crop;
      show();
    });
    show();

    let next = 0;
    shown.effect((use) => {
      const at = use(frame);
      if (at < next) return;
      next = at + READ_EVERY;
      show();
    });
  };

  return mountMenu(scope, { game, title: "Garden", called: "the garden", holds: GARDEN.holds, key: GARDEN_KEY, card: "garden-card", slot: "garden-keeper", blocks: false, fill });
};
