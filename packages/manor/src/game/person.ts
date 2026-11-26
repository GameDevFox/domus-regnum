import { BAKES } from "./bakes";
import type { BakeId } from "./bakes";
import { THING_IDS } from "./country";
import { CROP_IDS } from "./garden";
import { bakedBy, isMaster } from "./mastery";
import { outingOf } from "./outing";
import type { Game } from "./types";
import { WARE_IDS } from "./wares";

/** What coin is called among what someone carries. */
export const COIN = "coin";

// What there is to say of one person, for whoever shows it (the card at the right while she is
// followed). So far: how much bread she has baked, and what she has in her arms.

/** So many of one kind of goods: a sack of flour, four loaves, seven lots of berries. */
export type Carried = { goods: string; count: number };

export type PersonStats = {
  /** Loaves she has baked, ever; and whether that has earned her the mastery of bread. */
  baked: number;
  master: boolean;
  /** What she has in her arms or her basket, kind by kind; nothing, with her hands free. */
  carrying: Carried[];
};

/** What someone is carrying, and how many of it. */
const carriedBy = (game: Game, id: string): Carried[] => {
  const outing = outingOf(game, id);
  // Out of doors, or in again with it: what is in her basket, kind by kind; the wares she has bought; and the coin she has for what she sold.
  if (outing && outing.state !== "leaving") {
    const basket = [...THING_IDS, ...CROP_IDS].flatMap((good) => (outing.basket[good] ? [{ goods: good, count: outing.basket[good] ?? 0 }] : []));
    const wares = WARE_IDS.flatMap((ware) => (outing.bought[ware] ? [{ goods: ware, count: outing.bought[ware] ?? 0 }] : []));
    return [...basket, ...wares, ...(outing.purse > 0 ? [{ goods: COIN, count: outing.purse }] : [])];
  }
  const task = game.tasks[id];
  // What the gardener has picked and not yet brought in.
  if (task?.job === "garden") return CROP_IDS.flatMap((crop) => (task.has[crop] ? [{ goods: crop, count: task.has[crop] ?? 0 }] : []));
  // A baker's batch: one sack until it is out of the oven, and then as many as a batch makes.
  if (task?.job === "bake" && task.has !== null) return [{ goods: task.has, count: task.has === task.makes ? BAKES[task.has as BakeId].batch : 1 }];
  const goods = game.world.actors.find((a) => a.id === id)?.carrying;
  return goods ? [{ goods, count: 1 }] : [];
};

export const statsOf = (game: Game, id: string): PersonStats => ({ baked: bakedBy(game, id), master: isMaster(game, id), carrying: carriedBy(game, id) });
