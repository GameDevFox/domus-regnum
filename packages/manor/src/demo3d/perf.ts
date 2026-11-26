import type { WebGLRenderer } from "three";
import Stats from "three/examples/jsm/libs/stats.module.js";

import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { remembered } from "./remember";
import { settingsSlot } from "./settings";
import { ui } from "./ui-layer";

// How hard the page is working, as a graph in the corner: frames a second, then (click it)
// milliseconds a frame, memory, and draws a frame. The graph is stats.js, which three.js ships;
// a round button under the walls' two, drawn as a little graph, shows and hides it, and the
// choice is remembered in this browser.

const SHOWN = remembered("manor3d.perf.show");
/** Has this browser been told to show the graph? */
export const perfShown = SHOWN.get;

/** The top of the draws-a-frame graph: more than the busiest view of the house makes. */
const MOST_DRAWS = 600;

const GRAPH = '<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><path d="M3 19h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M4 15l4-5 3 3 3.5-6 3.5 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

type PerfProps = { shown: Value<boolean>; key: string; renderer: WebGLRenderer };

/** Mounts the button and the graph. Call `frame` once for every frame drawn. */
export const mountPerf = (scope: Scope, { shown, key, renderer }: PerfProps): { frame: () => void } => {
  const stats = new Stats();
  const draws = stats.addPanel(new Stats.Panel("draws", "#f6d98a", "#2b2420"));
  // It comes placed in the top left corner by its own styles: the page's place it instead.
  stats.dom.style.cssText = "";
  stats.dom.className = "perf-graph";
  stats.dom.title = "Frames a second. Click for milliseconds a frame, memory, and draws a frame.";

  const button = document.createElement("button");
  button.className = "round-button perf-button";
  button.innerHTML = GRAPH;
  scope.listen(button, "click", () => shown.update((s) => !s));
  settingsSlot("settings-perf").append(button);

  scope.effect((use) => {
    const on = use(shown);
    SHOWN.set(on);
    // Shown, it is on the page; hidden, it is not there at all.
    if (on) ui().append(stats.dom);
    else stats.dom.remove();
    const label = on ? "The performance graph is showing: press to hide it" : "Show the performance graph";
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(on));
    button.classList.toggle("on", on);
    button.title = `${label} — key ${key.toUpperCase()}`;
  });
  scope.add(() => {
    button.remove();
    stats.dom.remove();
  });

  const frame = (): void => {
    if (!shown.peek()) return;
    stats.update();
    draws.update(renderer.info.render.calls, MOST_DRAWS);
  };
  return { frame };
};
