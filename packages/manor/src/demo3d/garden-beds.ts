import { Mesh } from "three";
import type { Group } from "three";

import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { CROPS, PLOT_SIZE, SQUARES_ACROSS, SQUARES_DEEP, everySquare, isRipe, squareAt } from "../game";
import type { CropId, Game } from "../game";
import { LAWN, PLOT_EARTH } from "./exterior";
import { b, ball } from "./furniture-kit";
import { group } from "./parts";

// What stands in the kitchen garden's plots, square by square: nothing in an empty square; in a
// sown one, plants that are small when they are sown and full-grown when they are ripe; and,
// ripe, the colour of what they bear. A square's earth is darker for the day it has been
// watered. (The plots themselves, the bare earth and its ridges, are the grounds': exterior.ts.)

type BedsProps = { game: Game; /** Ticks once a frame, in seconds. */ frame: Value<number> };

/** A square's plants: so many across and so many deep; and how much of the square, each way, they and its wet earth take up. */
const PLANTS = { across: 2, deep: 2 };
const FILLS = 0.86;
/** A plant's size: just sown, and full-grown. */
const SPROUT = 0.04;
const GROWN = 0.14;
const LEAF = ["#6fa04a", "#4f8040"];
const WET_EARTH = "#3f2a1c";
/** What each crop is seen to bear, when it is ripe. */
const BEARS: Record<CropId, string> = {
  wheat: "#e3c46a",
  potato: "#c9a66b",
  cabbage: "#a9d18e",
  cucumber: "#3f7d3a",
  strawberry: "#d93a4a",
  tomato: "#e0452f",
  corn: "#f0c94a",
  pumpkin: "#e8862a",
  eggplant: "#6a3d8f",
  pineapple: "#e3b23c",
  onion: "#d8c9a8",
  yam: "#b5524a",
  carrot: "#ee8a2e",
  pepper: "#4f9e3a",
};

export const GardenBeds = (scope: Scope, { game, frame }: BedsProps): { mesh: Group } => {
  const lawn = LAWN;
  const mesh = group();
  // (Named, so that a script can count what stands in the plots.)
  mesh.name = "garden-beds";
  const clear = (): void => {
    for (const part of [...mesh.children]) {
      mesh.remove(part);
      if (part instanceof Mesh) part.geometry.dispose();
    }
  };
  scope.add(clear);

  let drawn = "";
  scope.effect((use) => {
    use(frame);
    // Drawn again only when a square has changed.
    const now = JSON.stringify(everySquare(game).map(({ bed }) => [bed.crop, bed.grown, bed.watered]));
    if (now === drawn) return;
    drawn = now;
    clear();
    const size = { w: PLOT_SIZE.w / SQUARES_ACROSS, d: PLOT_SIZE.d / SQUARES_DEEP };
    const top = lawn + PLOT_EARTH;
    for (const { plot, square, bed } of everySquare(game)) {
      const at = squareAt(plot, square);
      // Watered today, the earth is dark with it.
      if (bed.watered) mesh.add(b(size.w * FILLS, 0.01, size.d * FILLS, WET_EARTH, at.x, top, at.z));
      if (bed.crop === null) continue;
      const ripe = isRipe(bed);
      const tall = SPROUT + (GROWN - SPROUT) * Math.min(1, bed.grown / CROPS[bed.crop].days);
      for (let i = 0; i < PLANTS.across; i++) {
        for (let j = 0; j < PLANTS.deep; j++) {
          const x = at.x + ((i + 0.5) / PLANTS.across - 0.5) * size.w * FILLS;
          const z = at.z + ((j + 0.5) / PLANTS.deep - 0.5) * size.d * FILLS;
          mesh.add(ball(tall, LEAF[(i + j) % LEAF.length], x, top + tall, z));
          // Ripe, what it bears is seen on it.
          if (ripe) mesh.add(ball(tall * 0.6, BEARS[bed.crop], x + tall * 0.5, top + tall * 1.5, z + tall * 0.3));
        }
      }
    }
  });

  return { mesh };
};
