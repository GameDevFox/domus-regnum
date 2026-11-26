import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { BEDTIME, DUSK, SHOP_OPENS, SHOP_SHUTS, WAKE, dayOf, timeText } from "../game";
import { dialAt, spanOnDial } from "./dial";
import type { DialPlan } from "./plans";

// The time of day as a picture: the sun going over an arch from waking to bedtime, with the
// shop's hours and the evening marked on it, and the moon going back along the horizon at night.
// Time runs evenly from left to right, so a length on the arch is a length of time. The day's
// number and the time in figures sit either side; the words are for a screen reader and a tooltip.
// What the house is waiting for is drawn on the same arch: a cart on its way is the stretch from
// when it was ordered to when it is due, with a picture of it at the end.

const SVG = "http://www.w3.org/2000/svg";
/** The drawing's own units: the arch's span and height, and the room left round it for the sun. */
const SPAN = 96;
const RISE = 22;
const PAD = 8;
const WIDTH = SPAN + PAD * 2;
const HEIGHT = RISE + PAD * 2;
/** How many short lines the arch is drawn with. */
const FACETS = 32;

const at = (along: number, up: number): string => `${(PAD + along * SPAN).toFixed(1)},${(PAD + RISE - up * RISE).toFixed(1)}`;

/** The arch between two places along it, as a path: its own ends exactly, and the facets between. */
const arc = (a: number, b: number): string => {
  const between = Array.from({ length: FACETS + 1 }, (_, n) => n / FACETS).filter((along) => along > a && along < b);
  return `M ${[a, ...between, b].map((along) => at(along, Math.sin(Math.PI * along))).join(" L ")}`;
};

/** The stretch of the arch between two times of day, as a path. */
const stretch = (from: number, to: number): string => arc(dialAt(from).along, to === BEDTIME ? 1 : dialAt(to).along);

/** The picture at the end of each kind of plan; and, for a kind that ought to be over by bedtime, the one shown when it will not be. */
const PLAN_GLYPH: Record<DialPlan["kind"], string> = { cart: "🚚", errand: "🧺", explore: "🧭", gather: "🧺", walk: "🚶" };
const LATE_GLYPH: Partial<Record<DialPlan["kind"], string>> = { errand: "🌙", explore: "🌙", gather: "🌙", walk: "🌙" };
/** At the end of an outing whose end is not known, where it would be if she were told to come home then: she is to ask what next, as her token's slip says while she asks. */
const OPEN_GLYPH = "❓";
/** How large a plan's picture is, and how far under the arch it hangs, in the drawing's units: there is room inside the arch and none above it. */
const GLYPH_SIZE = 9;
const GLYPH_DROP = 10;

const draw = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
};

/** The dial, as an element to be put wherever time is shown. `daytime` is the game's clock, in minutes; `plans` is what the house is waiting for. */
export const DayDial = (scope: Scope, daytime: Value<number>, plans: Value<DialPlan[]>): HTMLElement => {
  const root = document.createElement("div");
  root.className = "dial";
  root.setAttribute("role", "img");

  const time = document.createElement("span");
  time.className = "dial-time";

  const svg = draw("svg", { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, width: WIDTH, height: HEIGHT, "aria-hidden": "true" });
  svg.classList.add("dial-arch");
  const horizon = draw("line", { x1: PAD - 4, x2: PAD + SPAN + 4, y1: PAD + RISE, y2: PAD + RISE, class: "dial-horizon" });
  const whole = draw("path", { d: stretch(WAKE, BEDTIME), class: "dial-day-line" });
  const shop = draw("path", { d: stretch(SHOP_OPENS, SHOP_SHUTS), class: "dial-shop" });
  const evening = draw("path", { d: stretch(DUSK, BEDTIME), class: "dial-evening" });
  const sun = draw("circle", { r: 5, class: "dial-sun" });
  // The moon is a disc with a bite out of it.
  const moon = draw("path", { d: "M 0,-5 A 5,5 0 1 0 5,0 A 4,4 0 0 1 0,-5 Z", class: "dial-moon" });
  const planned = draw("g", { class: "dial-plans" });
  svg.append(horizon, whole, shop, evening, planned, sun, moon);
  root.append(svg, time);

  /** Draw each plan's part of today: its stretch of the arch, and its picture where it ends if it ends today. */
  const drawPlans = (list: DialPlan[], clock: number): void => {
    planned.replaceChildren(
      ...list.flatMap((plan) => {
        const span = spanOnDial(plan.from, plan.to, clock);
        if (!span) return [];
        const line = draw("path", { d: arc(span.from, span.to), class: `dial-plan dial-plan-${plan.kind}${span.ends ? "" : " runs-on"}${plan.ghost ? " ghost" : ""}${plan.open ? " open" : ""}` });
        const title = draw("title", {});
        title.textContent = plan.says;
        line.append(title);
        const picture = !span.ends ? LATE_GLYPH[plan.kind] : plan.open ? OPEN_GLYPH : PLAN_GLYPH[plan.kind];
        if (!picture) return [line];
        const [x, y] = at(span.to, Math.sin(Math.PI * span.to)).split(",").map(Number);
        // Never below the horizon: near either end of the arch the picture sits on it.
        const glyph = draw("text", { x, y: Math.min(y + GLYPH_DROP, PAD + RISE - 1), "font-size": GLYPH_SIZE, "text-anchor": "middle", class: "dial-plan-glyph" });
        glyph.textContent = picture;
        return [line, glyph];
      }),
    );
  };

  let shownMinute = -1;
  let shownPlans: DialPlan[] | null = null;
  scope.effect((use) => {
    const clock = use(daytime);
    const list = use(plans);
    // The picture is redrawn when the minute changes, or the plans do: not every frame.
    const minute = Math.floor(clock);
    if (minute === shownMinute && list === shownPlans) return;
    shownMinute = minute;
    shownPlans = list;
    drawPlans(list, clock);
    const mark = dialAt(clock);
    const [x, y] = at(mark.along, mark.up).split(",");
    sun.setAttribute("cx", x);
    sun.setAttribute("cy", y);
    moon.setAttribute("transform", `translate(${x} ${y})`);
    root.classList.toggle("night", mark.night);
    const text = timeText(clock);
    const number = dayOf(clock);
    time.textContent = text;
    root.setAttribute("aria-label", `Day ${number}, ${text}${mark.night ? ", night" : ""}${list.map((p) => `; ${p.says}`).join("")}`);
    root.title = "The day, from waking to bedtime. Gold: the shop is open. Blue: evening.";
  });
  return root;
};
