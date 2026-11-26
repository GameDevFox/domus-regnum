import { DEVICES, DEVICE_IDS } from "./content/devices";
import { GOODS, LUXURIES } from "./content/house";
import { allStock, logLine, pick, rand, randInt, store, takeAnywhere } from "./house";
import { spareStock } from "./larder";
import { DAY_SECONDS, TRADER_RATE, TRADER_SECONDS } from "./tuning";
import type { Game, GoodId, Trader } from "./types";
import { earn } from "./visitors";

// Someone at the door. Traders come when they come: a pedlar with forest goods, a carter with a
// luxury going cheap, a housekeeper from up the road who will take all of something off your
// hands. Each waits a short while for an answer and is gone.

const INGREDIENTS: GoodId[] = ["honey", "berries", "herbs", "fish"];
const PEDLAR_DISCOUNT = 0.75;
const BUYER_PREMIUM = 2;
const BUYER_MIN_STOCK = 6;
const BUYER_MAX = 12;
const EDGE_SECONDS = 12;

const pedlar = (g: Game): Trader => {
  const a = pick(g, INGREDIENTS);
  const b = pick(g, INGREDIENTS.filter((x) => x !== a));
  const gives = { [a]: randInt(g, 3, 5), [b]: randInt(g, 2, 3) };
  const worth = Object.entries(gives).reduce((sum, [good, n]) => sum + GOODS[good].price * n, 0);
  const cost = Math.max(2, Math.round(worth * PEDLAR_DISCOUNT));
  const list = Object.entries(gives).map(([good, n]) => `${n} ${GOODS[good].glyph}`).join(" and ");
  return { face: "🧙", text: `A pedlar with a pack from the woods: ${list} for ${cost} coin.`, cost, gives, takes: {}, left: TRADER_SECONDS };
};

const carter = (g: Game): Trader => {
  const good = pick(g, LUXURIES);
  const n = randInt(g, 3, 5);
  const cost = Math.round(GOODS[good].price * n * PEDLAR_DISCOUNT * Math.min(g.chapter, 6));
  return { face: "🚚", text: `A carter with a part-case going cheap: ${n} ${GOODS[good].glyph} ${GOODS[good].name.toLowerCase()} for ${cost} coin.`, cost, gives: { [good]: n }, takes: {}, left: TRADER_SECONDS };
};

const TINKER_PRICE = 35;

/** A tinker with a piece of expedition gear the house does not have. */
const tinker = (g: Game): Trader | null => {
  const gear = DEVICE_IDS.filter((id) => DEVICES[id].fits === "pack" && !g.ownedDevices.includes(id));
  if (gear.length === 0) return null;
  const id = pick(g, gear);
  return { face: "🧑‍🔧", text: `A tinker with something for the road: ${DEVICES[id].glyph} ${DEVICES[id].name}. ${DEVICES[id].effect} ${TINKER_PRICE} coin.`, cost: TINKER_PRICE, gives: {}, takes: {}, device: id, left: TRADER_SECONDS };
};

const buyer = (g: Game): Trader | null => {
  // Only what can be spared: never the guests' share, never tonight's supper.
  const stock = spareStock(g);
  const options = Object.keys(stock).filter((good) => GOODS[good].pole !== null && !GOODS[good].luxury && stock[good] >= BUYER_MIN_STOCK);
  if (options.length === 0) return null;
  const good = pick(g, options);
  const n = Math.min(stock[good], BUYER_MAX);
  const pay = GOODS[good].price * n * BUYER_PREMIUM;
  return { face: "👩‍🍳", text: `A housekeeper from up the road, caught short: she will take ${n} ${GOODS[good].glyph} ${GOODS[good].name.toLowerCase()} off you for ${pay} coin.`, cost: -pay, gives: {}, takes: { [good]: n }, left: TRADER_SECONDS };
};

export const stepTrader = (g: Game, dt: number): void => {
  if (g.trader) {
    g.trader.left -= dt;
    if (g.trader.left <= 0) g.trader = null;
    return;
  }
  if (g.t < EDGE_SECONDS || g.t > DAY_SECONDS - TRADER_SECONDS - EDGE_SECONDS) return;
  if (rand(g) >= TRADER_RATE * dt) return;
  const roll = rand(g);
  const BUYER_SHARE = 0.4;
  const CARTER_SHARE = 0.65;
  const TINKER_SHARE = 0.8;
  g.trader = (roll < BUYER_SHARE ? buyer(g) : null) ?? (roll < CARTER_SHARE && g.chapter >= 2 ? carter(g) : null) ?? (roll < TINKER_SHARE ? tinker(g) : null) ?? pedlar(g);
};

/** Why the trade on offer cannot be made, or null if it can. */
export const whyNotTrade = (g: Game): string | null => {
  const t = g.trader;
  if (!t) return "nobody is at the door";
  if (t.cost > g.coin) return "not enough coin";
  const stock = allStock(g);
  for (const [good, n] of Object.entries(t.takes)) if ((stock[good] ?? 0) < n) return `not enough ${GOODS[good].name.toLowerCase()} left`;
  return null;
};

export const acceptTrade = (g: Game): boolean => {
  const t = g.trader;
  if (!t || whyNotTrade(g) !== null) return false;
  for (const [good, n] of Object.entries(t.takes)) takeAnywhere(g, good, n);
  for (const [good, n] of Object.entries(t.gives)) store(g, good, n);
  if (t.device && !g.ownedDevices.includes(t.device)) {
    g.ownedDevices.push(t.device);
    g.spareDevices.push(t.device);
  }
  if (t.cost >= 0) {
    g.coin -= t.cost;
    g.today.spent += t.cost;
  } else earn(g, -t.cost);
  logLine(g, t.cost >= 0 ? `Bought from the door for ${t.cost} coin.` : `Sold at the door for ${-t.cost} coin.`, "good");
  g.trader = null;
  return true;
};

export const dismissTrader = (g: Game): void => {
  g.trader = null;
};
