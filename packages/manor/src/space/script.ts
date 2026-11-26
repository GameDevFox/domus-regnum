import { giveOrders, isIdle } from "./world";
import type { Order, World } from "./world";

// The demo's stand-in for the game: each person works through a round of errands, for ever.
// Nothing here decides anything; it only hands out orders the way the game's rules will.

export const go = (spot: string): Order => ({ do: "go", spot });
export const work = (seconds: number, label: string): Order => ({ do: "work", seconds, label });

/** Seconds spent taking something down from a shelf, or setting it down. */
const HANDLING_SECONDS = 1.2;

/** Walk to wherever a kind of goods is kept and pick it up. */
export const fetch = (world: World, goods: string): Order[] => [go(world.plan.stores[goods]), work(HANDLING_SECONDS, "fetching"), { do: "take", goods }];
export const deliver = (spot: string): Order[] => [go(spot), work(HANDLING_SECONDS, "setting down"), { do: "put" }];
const make = (spot: string, seconds: number, label: string, makes: string): Order[] => [go(spot), work(seconds, label), { do: "take", goods: makes }];

export type Round = (world: World) => Order[];

/** How a sentence speaks of someone: as who does a thing, as whom it is done to, and as whose a thing is. */
export type Pronouns = { subject: string; object: string; possessive: string };
export const SHE: Pronouns = { subject: "she", object: "her", possessive: "her" };
export const HE: Pronouns = { subject: "he", object: "him", possessive: "his" };

/** `pronouns`: hers or his, said here once for each of the cast; every sentence of the page takes them from here. */
export type Cast = { id: string; name: string; pronouns: Pronouns; sprite: string; start: string; /** The spot beside her own bed. */ bed: string; rounds: Round[] };

export const CAST: Cast[] = [
  {
    id: "evelyn",
    name: "Evelyn",
    pronouns: SHE,
    sprite: "evelyn",
    start: "kitchen.table.n",
    bed: "dormitory.bed1",
    rounds: [
      (w) => [...fetch(w, "flour"), go("kitchen.table.n"), work(3, "kneading"), ...make("kitchen.oven", 4, "baking", "bread"), ...deliver("pantry.bread")],
      (w) => [...fetch(w, "jam"), go("kitchen.table.s"), work(3, "filling"), ...make("kitchen.oven", 3, "baking", "cake"), ...deliver("shop.shelf")],
      (w) => [...fetch(w, "tea"), ...make("kitchen.range", 3, "brewing", "teapot"), ...deliver("parlour.table")],
      (w) => [...fetch(w, "honey"), go("kitchen.table.n"), work(2.5, "glazing"), ...make("kitchen.oven", 3, "baking", "cake"), ...deliver("dining.sideboard")],
    ],
  },
  {
    id: "rose",
    name: "Rose",
    pronouns: SHE,
    sprite: "maid-rose",
    start: "shop.counter",
    bed: "dormitory.bed2",
    rounds: [
      (w) => [...fetch(w, "bread"), ...deliver("shop.counter"), work(4, "serving")],
      (w) => [...fetch(w, "wine"), ...deliver("dining.sideboard")],
      (w) => [...fetch(w, "cake"), ...deliver("shop.window"), go("shop.counter"), work(4, "serving")],
      (w) => [...fetch(w, "cheese"), ...deliver("passage.sideboard"), go("dining.table.n"), work(3, "laying the table")],
      (w) => [...fetch(w, "cider"), ...deliver("kitchen.dresser")],
    ],
  },
  {
    id: "sage",
    name: "Sage",
    pronouns: SHE,
    sprite: "maid-sage",
    start: "dormitory.linen",
    bed: "dormitory.bed3",
    rounds: [
      (w) => [...fetch(w, "linen"), go("bedroom.bed"), work(4, "making the bed"), { do: "put" }],
      (w) => [...fetch(w, "towels"), ...deliver("bath.tub"), go("landing.window"), work(2, "dusting")],
      () => [go("parlour.table"), work(1.5, "clearing"), { do: "take", goods: "china" }, go("kitchen.sink"), work(4, "washing up"), ...deliver("kitchen.dresser")],
      (w) => [...fetch(w, "linen"), go("dormitory.bed"), work(3, "making the beds"), { do: "put" }, go("study.books"), work(3, "dusting")],
      (w) => [...fetch(w, "china"), ...deliver("dining.table.s"), go("parlour.piano"), work(3, "polishing")],
    ],
  },
  {
    id: "master",
    name: "The Master",
    pronouns: HE,
    sprite: "master",
    start: "lab.bench",
    bed: "bedroom.bed",
    rounds: [
      () => [go("lab.furnace"), work(4, "stoking"), go("lab.bench"), work(6, "distilling")],
      (w) => [...fetch(w, "elixir"), go("study.desk"), work(6, "writing up"), { do: "put" }],
      (w) => [...fetch(w, "book"), ...deliver("lab.desk"), work(4, "reading")],
      () => [go("parlour.table"), work(5, "taking tea"), go("hall.door"), work(2, "looking out")],
      () => [go("lab.books"), work(3, "looking something up"), go("lab.bench"), work(5, "distilling")],
    ],
  },
];

export type Script = { step: () => void };

/** Keeps everyone in the cast supplied with their next errand. */
export const runScript = (world: World, cast: Cast[] = CAST): Script => {
  const turn = new Map<string, number>(cast.map((c) => [c.id, 0]));
  const step = (): void => {
    for (const member of cast) {
      const actor = world.actors.find((a) => a.id === member.id);
      if (!actor || !isIdle(actor)) continue;
      const n = turn.get(member.id) ?? 0;
      giveOrders(world, member.id, member.rounds[n % member.rounds.length](world));
      turn.set(member.id, n + 1);
    }
  };
  return { step };
};
