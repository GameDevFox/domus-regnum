import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { FLOOR_ORDER } from "../space";
import type { FloorId, Plan } from "../space";
import { layersOf } from "./floor-layers";
import type { LayerKind } from "./floor-layers";
import type { View } from "./house-view";
import { ui } from "./ui-layer";

// The floor chooser: a little house in section, a roof over a stack of storeys with the cellars
// below the lawn. Each layer is pressed like a button but drawn as what it is. It is built from
// the plan, so a house with more storeys, or more cellars, or none, gets the right stack: every
// storey above ground between the ground floor and the roof, every storey below it under the grass.

const SVG = "http://www.w3.org/2000/svg";
/** Drawing sizes, in the widget's own pixels. */
const WIDTH = 136;
const WALL_INSET = 14;
const ROOF_HEIGHT = 46;
const STOREY_HEIGHT = 36;
const CELLAR_HEIGHT = 30;
const LAWN_HEIGHT = 7;
const WINDOW = { w: 16, h: 17 };

const node = (tag: string, attrs: Record<string, string | number>, parent?: Element): SVGElement => {
  const made = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) made.setAttribute(k, String(v));
  parent?.append(made);
  return made;
};

/** A brick or stone bond as a repeating pattern, so walls of any size are laid in the same courses. */
const bond = (svg: SVGElement, id: string, fill: string, joint: string, w: number, h: number): void => {
  const defs = node("defs", {}, svg);
  const pattern = node("pattern", { id, width: w, height: h * 2, patternUnits: "userSpaceOnUse" }, defs);
  node("rect", { width: w, height: h * 2, fill: joint }, pattern);
  node("rect", { x: 0.5, y: 0.5, width: w - 1, height: h - 1, fill }, pattern);
  node("rect", { x: -w / 2 + 0.5, y: h + 0.5, width: w - 1, height: h - 1, fill }, pattern);
  node("rect", { x: w / 2 + 0.5, y: h + 0.5, width: w - 1, height: h - 1, fill }, pattern);
};

const pane = (svg: SVGElement, x: number, y: number): void => {
  node("rect", { x: x - 1.5, y: y - 1.5, width: WINDOW.w + 3, height: WINDOW.h + 3, fill: "#e6dcc6" }, svg);
  node("rect", { class: "pane", x, y, width: WINDOW.w, height: WINDOW.h }, svg);
  node("rect", { x: x + WINDOW.w / 2 - 0.75, y, width: 1.5, height: WINDOW.h, fill: "#e6dcc6" }, svg);
  node("rect", { x, y: y + WINDOW.h * 0.45, width: WINDOW.w, height: 1.5, fill: "#e6dcc6" }, svg);
  node("rect", { x: x - 3, y: y + WINDOW.h + 1.5, width: WINDOW.w + 6, height: 2.5, fill: "#cfc4ab" }, svg);
};

const draw = (kind: LayerKind, id: string): SVGElement => {
  const height = kind === "roof" ? ROOF_HEIGHT : kind === "cellar" ? CELLAR_HEIGHT : STOREY_HEIGHT;
  const svg = node("svg", { viewBox: `0 0 ${WIDTH} ${height}`, width: WIDTH, height, "aria-hidden": "true" });
  const inner = WIDTH - WALL_INSET * 2;
  if (kind === "roof") {
    // Two chimneys behind a slate gable with deep eaves.
    for (const x of [34, 92]) {
      node("rect", { x, y: 8, width: 12, height: 26, fill: "#9c5a45" }, svg);
      node("rect", { x: x - 1.5, y: 6, width: 15, height: 4, fill: "#8d8a84" }, svg);
    }
    node("polygon", { class: "wall", points: `2,${height} ${WIDTH / 2},4 ${WIDTH - 2},${height}`, fill: "#4f5b6b" }, svg);
    for (const y of [16, 26, 36]) {
      const half = ((y - 4) / (height - 4)) * (WIDTH / 2 - 2);
      node("rect", { x: WIDTH / 2 - half, y, width: half * 2, height: 1.4, fill: "#39424f" }, svg);
    }
    node("rect", { x: 0, y: height - 4, width: WIDTH, height: 4, fill: "#e6dcc6" }, svg);
    return svg;
  }
  if (kind === "cellar") {
    // Dug into the earth: a vault of stone with the stores in it.
    node("rect", { width: WIDTH, height, fill: "#4a3a2e" }, svg);
    bond(svg, id, "#7b7872", "#56534f", 14, 6);
    node("rect", { class: "wall", x: WALL_INSET, y: 0, width: inner, height: height - 4, fill: `url(#${id})` }, svg);
    node("path", { class: "pane", d: `M${WIDTH / 2 - 11},${height - 4} v-11 a11,11 0 0 1 22,0 v11 z` }, svg);
    for (const x of [30, 44, 92, 106]) {
      node("ellipse", { cx: x, cy: height - 11, rx: 6, ry: 7, fill: "#7a5330" }, svg);
      node("rect", { x: x - 6, y: height - 13, width: 12, height: 1.5, fill: "#2a2a2e" }, svg);
    }
    return svg;
  }
  bond(svg, id, "#9c5a45", "#cdbfa6", 12, 5);
  node("rect", { class: "wall", x: WALL_INSET, y: 0, width: inner, height, fill: `url(#${id})` }, svg);
  // A band of stone at the foot of each storey, where the floor is.
  node("rect", { x: WALL_INSET - 2, y: height - 4, width: inner + 4, height: 4, fill: "#8d8a84" }, svg);
  const sill = 8;
  if (kind === "ground") {
    pane(svg, WALL_INSET + 12, sill);
    pane(svg, WIDTH - WALL_INSET - 12 - WINDOW.w, sill);
    // The front door, with a light over it and a step.
    node("rect", { x: WIDTH / 2 - 10, y: 6, width: 20, height: height - 10, fill: "#e6dcc6" }, svg);
    node("rect", { x: WIDTH / 2 - 8, y: 13, width: 16, height: height - 17, fill: "#2f5d50" }, svg);
    node("rect", { class: "pane", x: WIDTH / 2 - 8, y: 8, width: 16, height: 4 }, svg);
    node("circle", { cx: WIDTH / 2 + 5, cy: 23, r: 1.2, fill: "#c9a85a" }, svg);
  } else {
    for (const x of [WALL_INSET + 12, WIDTH / 2 - WINDOW.w / 2, WIDTH - WALL_INSET - 12 - WINDOW.w]) pane(svg, x, sill);
  }
  return svg;
};

type FloorsProps = { plan: Plan; view: Value<View>; look: (view: View) => void };

export const mountFloors = (scope: Scope, { plan, view, look }: FloorsProps): void => {
  const root = document.createElement("nav");
  root.className = "floors";
  root.setAttribute("aria-label", "Floors");
  const stack = document.createElement("div");
  stack.className = "floors-stack";

  // From the top down: the roof, the storeys above ground from the highest, the lawn, the cellars.
  const layers = layersOf(FLOOR_ORDER.map((id: FloorId) => ({ id, name: plan.storeys[id].name, y: plan.storeys[id].y })));
  const hasCellar = layers.some((l) => l.kind === "cellar");

  const buttons = layers.map((layer, n) => {
    const button = document.createElement("button");
    button.className = `storey storey-${layer.kind}`;
    button.setAttribute("aria-label", layer.label);
    button.title = layer.kind === "roof" ? `${layer.label} — key H, or R from the top floor` : `${layer.label} — keys R and F`;
    button.append(draw(layer.kind, `bond-${n}`));
    scope.listen(button, "click", () => look(layer.id));
    // The lawn lies between the ground floor and the first cellar.
    if (layer.kind === "cellar" && layers[n - 1]?.kind !== "cellar") {
      const lawn = document.createElement("div");
      lawn.className = "floors-lawn";
      lawn.style.height = `${LAWN_HEIGHT}px`;
      stack.append(lawn);
    }
    stack.append(button);
    return { layer, button };
  });
  if (!hasCellar) {
    const lawn = document.createElement("div");
    lawn.className = "floors-lawn";
    lawn.style.height = `${LAWN_HEIGHT}px`;
    stack.append(lawn);
  }

  root.append(stack);
  ui().append(root);
  scope.add(() => root.remove());

  scope.effect((use) => {
    const current = use(view);
    stack.classList.toggle("whole", current === "house");
    for (const { layer, button } of buttons) {
      const on = layer.id === current;
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", String(on));
    }
  });
};
