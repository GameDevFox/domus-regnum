import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { el } from "./dom";

// The graph of the odds window: minutes spent looking along the bottom, and up the side the
// chance that a thing has been found by then, a line for each thing. Every line begins at
// nothing and ends at the top (or as near it as the thing is ever found), so what is read off
// it is how soon it climbs: a line that is steep and early is found soon in every game, one
// that leans across the whole graph may be found at any time.
//
// Drawn by hand as an SVG: it is one graph of a handful of lines, and a charting library would
// be a dependency of the game for the sake of a dev tool. Its colours are the eight of a set
// checked to be told apart by the colour-blind, each thing keeping its own whatever else is
// shown; where they are pale against the paper, the legend and the table beside it name them.

/** A line of the graph: a thing, which of the eight colours is its own, and the share of games in which it was found within each minute. */
export type Line = { id: string; name: string; slot: number; by: number[] };
export type Graph = { minutes: number; lines: Line[]; /** What the minutes are of. */ spent: string };

const SVG = "http://www.w3.org/2000/svg";
/** The drawing's own measure, which the page scales to the room there is. */
const WIDE = 640;
const TALL = 250;
const EDGE = { left: 44, right: 14, top: 12, bottom: 38 };
/** The chances marked up the side. */
const CHANCES = [0, 0.25, 0.5, 0.75, 1];
/** The steps the minutes along the bottom may be marked in, and the most marks there are room for. */
const STEPS = [1, 2, 5, 10, 15, 30, 60, 120];
const MOST_MARKS = 9;
const PERCENT = 100;
/** How far the readout stands from the line it reads, in the drawing's measure. */
const READOUT_GAP = 10;
/** Past this share of the way across, the readout is put to the left of the line. */
const TURNS_AT = 0.6;

const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text = ""): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  node.textContent = text;
  return node;
};
/** A share as a whole number of hundredths. */
export const percent = (share: number): string => `${Math.round(share * PERCENT)}%`;
const colourOf = (slot: number): string => `var(--series-${slot + 1})`;

export const OddsChart = (scope: Scope, { graph }: { graph: Value<Graph | null> }): { node: HTMLElement } => {
  const node = el("div", "odds-chart");
  const legend = el("div", "odds-legend");
  const plot = el("div", "odds-plot");
  node.append(legend, plot);

  scope.effect((use, drawn) => {
    const now = use(graph);
    plot.replaceChildren();
    legend.replaceChildren();
    if (!now || now.minutes === 0 || now.lines.length === 0) {
      plot.append(el("p", "odds-empty", "Nothing is found here as it stands: there is nothing to find, or no draw is made."));
      return;
    }
    const { minutes, lines, spent } = now;
    const across = (minute: number): number => EDGE.left + (minute / minutes) * (WIDE - EDGE.left - EDGE.right);
    const up = (share: number): number => TALL - EDGE.bottom - share * (TALL - EDGE.top - EDGE.bottom);
    const picture = svg("svg", { viewBox: `0 0 ${WIDE} ${TALL}`, role: "img", class: "odds-svg" });
    picture.setAttribute("aria-label", `The chance each thing has been found, by the ${spent}: ${lines.map((line) => line.name).join(", ")}. The table beside it has the figures.`);

    // The ground: a hairline for each chance marked, and the minutes along the bottom.
    for (const chance of CHANCES) {
      picture.append(svg("line", { x1: EDGE.left, x2: WIDE - EDGE.right, y1: up(chance), y2: up(chance), class: "odds-grid" }), svg("text", { x: EDGE.left - 8, y: up(chance), class: "odds-tick odds-tick-side" }, percent(chance)));
    }
    const step = STEPS.find((size) => minutes / size <= MOST_MARKS) ?? STEPS[STEPS.length - 1];
    for (let minute = 0; minute <= minutes; minute += step) picture.append(svg("text", { x: across(minute), y: TALL - EDGE.bottom + 16, class: "odds-tick" }, String(minute)));
    picture.append(svg("text", { x: (EDGE.left + WIDE - EDGE.right) / 2, y: TALL - 4, class: "odds-tick odds-axis" }, spent));

    // The lines, each in its own colour.
    for (const line of lines) {
      const points = line.by.map((share, minute) => `${across(minute).toFixed(1)},${up(share).toFixed(1)}`).join(" ");
      picture.append(svg("polyline", { points, class: "odds-line", style: `stroke: ${colourOf(line.slot)}` }));
    }
    plot.append(picture);

    // The legend: with one thing there is nothing to tell apart, and the table names it.
    if (lines.length > 1) {
      for (const line of lines) {
        const item = el("span", "odds-legend-item");
        const key = el("span", "odds-key");
        key.style.background = colourOf(line.slot);
        item.append(key, el("span", "", line.name));
        legend.append(item);
      }
    }

    // The readout: the pointer finds a minute, and every line is read at it.
    let readout: { rule: SVGLineElement; dots: SVGCircleElement[]; card: HTMLElement } | null = null;
    const put = (): void => {
      readout?.rule.remove();
      readout?.dots.forEach((dot) => dot.remove());
      readout?.card.remove();
      readout = null;
    };
    drawn.listen(picture, "pointermove", (e: PointerEvent) => {
      const box = picture.getBoundingClientRect();
      const scale = WIDE / box.width;
      const minute = Math.max(0, Math.min(minutes, Math.round((((e.clientX - box.left) * scale - EDGE.left) / (WIDE - EDGE.left - EDGE.right)) * minutes)));
      put();
      const rule = svg("line", { x1: across(minute), x2: across(minute), y1: EDGE.top, y2: TALL - EDGE.bottom, class: "odds-rule" });
      const dots = lines.map((line) => svg("circle", { cx: across(minute), cy: up(line.by[minute] ?? 0), r: 4, class: "odds-dot", style: `fill: ${colourOf(line.slot)}` }));
      picture.append(rule, ...dots);
      const card = el("div", "odds-readout");
      card.append(el("div", "odds-readout-at", `After ${minute} minute${minute === 1 ? "" : "s"}`));
      // The likeliest first: the order the lines stand in at this minute.
      for (const line of [...lines].sort((a, b) => (b.by[minute] ?? 0) - (a.by[minute] ?? 0))) {
        const row = el("div", "odds-readout-row");
        const key = el("span", "odds-key");
        key.style.background = colourOf(line.slot);
        row.append(key, el("strong", "", percent(line.by[minute] ?? 0)), el("span", "", line.name));
        card.append(row);
      }
      const left = minute / minutes > TURNS_AT;
      card.style.top = `${(EDGE.top / TALL) * PERCENT}%`;
      if (left) card.style.right = `${((WIDE - across(minute) + READOUT_GAP) / WIDE) * PERCENT}%`;
      else card.style.left = `${((across(minute) + READOUT_GAP) / WIDE) * PERCENT}%`;
      plot.append(card);
      readout = { rule, dots, card };
    });
    drawn.listen(picture, "pointerleave", put);
  });

  return { node };
};
