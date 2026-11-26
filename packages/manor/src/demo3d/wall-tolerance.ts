import type { Scope } from "@scene-lib/scope";
import { Value } from "@scene-lib/value";

import { el } from "./panel";
import { rememberedNumber } from "./remember";

// How much of a room a wall may hide and still stand (cutaway.ts), as the page keeps it: a share
// of the room's floor, said in hundredths. It is a number to be found by eye, so the dev menu has a
// slider for it, and what is chosen there is kept from one visit to the next.

/** What a first visit has: a wall may hide a twentieth of a room. */
export const DEFAULT_TOLERANCE_PERCENT = 5;
/** The slider's range and step, in hundredths of a room. At nothing, a wall may hide next to nothing, as before there was any tolerance. */
const MOST_PERCENT = 15;
const STEP_PERCENT = 0.5;
const HUNDREDTHS = 100;

const KEPT = rememberedNumber("manor3d.walls.tolerance");

const within = (percent: number): number => Math.max(0, Math.min(MOST_PERCENT, percent));

/** The share of a room a wall may hide: what the address asks for (`?tolerance=`, in hundredths), or what was last chosen, or what a first visit has. */
export const wallTolerance = (params: URLSearchParams): Value<number> => {
  const asked = params.get("tolerance");
  const percent = asked !== null && asked !== "" && Number.isFinite(Number(asked)) ? Number(asked) : (KEPT.get() ?? DEFAULT_TOLERANCE_PERCENT);
  return Value(within(percent) / HUNDREDTHS);
};

const says = (percent: number): string => `${percent}% of a room`;

/** The dev menu's part for it: a slider, and what it stands at. */
export const toleranceSection = (tolerance: Value<number>): { heading: string; build: (scope: Scope) => HTMLElement } => ({
  heading: "Walls",
  build: (scope) => {
    const row = el("label", "dev-check dev-tolerance");
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = String(MOST_PERCENT);
    slider.step = String(STEP_PERCENT);
    slider.className = "dev-slider";
    slider.setAttribute("aria-label", "How much of a room a wall may hide and still stand");
    slider.title = "How much of a room a wall may hide and still stand. At 0 it comes down for next to nothing — window.manor3d.tolerance";
    const shown = el("output", "dev-slider-says");
    scope.listen(slider, "input", () => {
      const percent = within(Number(slider.value));
      KEPT.set(percent);
      tolerance.set(percent / HUNDREDTHS);
    });
    scope.effect((use) => {
      // (Rounded to the slider's step: a share is kept as a fraction, which does not come back from hundredths exactly.)
      const percent = Math.round((use(tolerance) * HUNDREDTHS) / STEP_PERCENT) * STEP_PERCENT;
      slider.value = String(percent);
      shown.textContent = says(percent);
    });
    row.append(el("span", "dev-slider-name", "A wall may hide"), slider, shown);
    return row;
  },
});
