import { occasionOver } from "./calendar";
import { GOODS } from "./content/house";
import { MAID_DEFS } from "./content/people";
import { allStock } from "./house";
import type { Game, GoodId, Stock } from "./types";

// What in the larder is spoken for. Three claims compete for every good thing the house makes:
// the guests, the household's own supper, and the shop — in that order. The guests' share is
// never eaten and never sold; supper is never sold; the shop gets what is left of anything
// marked Sell.

/** Everyone who sits down to supper: the Master and every maid under the roof. */
export const household = (g: Game): number => g.maids.filter((m) => g.lent?.maid !== m.id && !MAID_DEFS[m.id].livery).length;

/** What the guests will be offered: everything worth serving that has not been struck off the menu. */
export const plannedMenu = (g: Game, stock: Stock = allStock(g)): GoodId[] =>
  Object.keys(GOODS).filter((id) => GOODS[id].pole !== null && (stock[id] ?? 0) > 0 && !g.offMenu.includes(id));

/** How many of each kind one guest takes under tonight's rule. */
export const perGuest = (g: Game): number => ((g.occasion?.def ?? g.upcoming)?.twist === "harvest" ? 2 : 1);

/** Until the occasion is over, this many of each kind on the menu are the guests'. */
export const guestShare = (g: Game, good: GoodId): number => {
  if (!g.upcoming || occasionOver(g) || GOODS[good].pole === null || g.offMenu.includes(good)) return 0;
  return g.upcoming.guests * perGuest(g);
};

/** Foods there is enough of for everyone at the table once the guests' share is set aside, cheapest first. */
export const supperTable = (g: Game, stock: Stock = allStock(g)): GoodId[] => {
  const heads = household(g);
  return Object.keys(stock)
    .filter((good) => GOODS[good].edible && !GOODS[good].luxury && good !== "elixir" && stock[good] >= heads + guestShare(g, good))
    .sort((x, y) => GOODS[x].price - GOODS[y].price);
};

/** What tonight's supper would be: a plain supper is the cheapest dish; a full table is one of everything. */
export const supperForecast = (g: Game, stock: Stock = allStock(g)): GoodId[] => {
  if (g.supperPlan === "none") return [];
  const table = supperTable(g, stock);
  return g.supperPlan === "feast" ? table : table.slice(0, 1);
};

/** Everything in the house beyond the guests' share and tonight's supper: what the shop may sell. */
export const spareStock = (g: Game): Stock => {
  const stock = allStock(g);
  const heads = household(g);
  const spare: Stock = {};
  for (const good of Object.keys(stock)) spare[good] = stock[good] - guestShare(g, good);
  for (const good of supperForecast(g, stock)) spare[good] -= heads;
  return spare;
};

/** Goods on sale right now: marked Sell, with some to spare. */
export const onSale = (g: Game, spare: Stock = spareStock(g)): GoodId[] => Object.keys(GOODS).filter((id) => g.orders[id] === "sell" && (spare[id] ?? 0) > 0);
