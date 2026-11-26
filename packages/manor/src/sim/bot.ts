import { GOODS, RECIPES, ROOM_DEFS, isReception, recipesFor } from "./content/house";
import { DEVICES } from "./content/devices";
import { HIREABLE } from "./content/people";
import { CHAPTERS } from "./content/world";
import { daysToOccasion, donationCost, invitations, isOccasionDay, occasionScore } from "./flow";
import { advance, apply } from "./game";
import { houseStock, reach, receptionRooms, roomsOfKind } from "./house";
import { whyNotTrade } from "./trade";
import type { Game, Maid, Room, RoomKind, Tier } from "./types";

// Scripted players. They exist to answer balance questions a human can't answer quickly: can a
// sensible plan make each target, does a lazy plan miss it, and do different plans both work?

export type Strategy = {
  name: string;
  /** Take the grand invitation when one is offered. */
  ambitious: boolean;
  /** Days before the occasion (0 = that day only) from which everything worth serving is kept back. */
  keepFrom: number;
  /** Where the Master spends ordinary days. */
  lord: "lab" | "host" | "kitchen";
  /** Supper the household is given. */
  supper: "none" | "shared" | "feast";
  /** Send someone to the forest when honey or berries would unlock something. */
  explores: boolean;
  /** Keep pressing on while the next step's risk is at most this. */
  nerve: number;
  /** Rooms to fit out, in order of preference. */
  build: RoomKind[];
  /** Watches the guests and catches their fancies. */
  attentive?: boolean;
  /** Does nothing but press the buttons the game requires. */
  idle?: boolean;
  /** Seconds between looks at the house during a live phase. */
  cadence: number;
};

const SERVE_ROOMS: RoomKind[] = ["shop", "parlour", "dining"];

const maids = (g: Game): Maid[] => g.maids.filter((m) => !m.isLord && !m.away);
const lordOf = (g: Game): Maid => g.maids.find((m) => m.isLord) as Maid;

const canMake = (g: Game, room: Room, recipeId: string): boolean =>
  Object.entries(RECIPES[recipeId].needs).every(([good, n]) => reach(g, room, good) + houseStock(g, good) >= n);

/** Make whatever the house has least of, counting dear things as scarcer. */
const pickRecipe = (g: Game, room: Room, taken: Set<string>): string | null => {
  const options = recipesFor(room.kind, g.recipes).filter((r) => canMake(g, room, r.id) && !taken.has(r.id));
  if (options.length === 0) return recipesFor(room.kind, g.recipes).find((r) => canMake(g, room, r.id))?.id ?? null;
  let best = options[0];
  let bestNeed = Infinity;
  for (const r of options) {
    const def = GOODS[r.makes];
    // Ingredients are only worth making while something needs them.
    const useful = def.pole !== null || g.rooms.some((x) => x.recipe && RECIPES[x.recipe].needs[r.makes] !== undefined) || g.recipes.some((id) => RECIPES[id].needs[r.makes] !== undefined && g.rooms.some((x) => x.kind === RECIPES[id].room));
    if (!useful) continue;
    const need = houseStock(g, r.makes) / Math.max(1, def.value + 1);
    if (need < bestNeed) {
      bestNeed = need;
      best = r;
    }
  }
  return best.id;
};

/** Put everything a room can usefully make on its rota and let the house balance itself. */
const setRecipes = (g: Game): void => {
  for (const room of g.rooms) {
    if (ROOM_DEFS[room.kind].role !== "produce") continue;
    for (const r of recipesFor(room.kind, g.recipes)) {
      const def = GOODS[r.makes];
      const useful = def.pole !== null || g.recipes.some((id) => RECIPES[id].needs[r.makes] !== undefined && g.rooms.some((x) => x.kind === RECIPES[id].room));
      const wanted = useful && canMake(g, room, r.id);
      if (wanted !== room.rota.includes(r.id)) apply(g, { kind: "rota", room: room.id, recipe: r.id });
    }
  }
};

const setOrders = (g: Game, s: Strategy): void => {
  const keeping = daysToOccasion(g) <= s.keepFrom;
  for (const def of Object.values(GOODS)) {
    if (def.pole === null) {
      apply(g, { kind: "order", good: def.id, order: "keep" });
      continue;
    }
    // Supper looks after itself; keep everything once the occasion is near, and luxuries always.
    apply(g, { kind: "order", good: def.id, order: keeping || def.luxury ? "keep" : "sell" });
  }
};

/** Staff the house for an ordinary day: producers first, then a seller, then a runner, then the rest. */
const staffDay = (g: Game, s: Strategy): void => {
  const free = [...maids(g)];
  const take = (pred?: (m: Maid) => boolean): Maid | undefined => {
    const at = pred ? free.findIndex(pred) : 0;
    if (at < 0 || free.length === 0) return undefined;
    return free.splice(at, 1)[0];
  };
  const post = (m: Maid | undefined, room: Room | undefined): void => {
    if (m && room) apply(g, { kind: "assign", maid: m.id, room: room.id });
  };
  const kitchens = roomsOfKind(g, "kitchen");
  const shops = roomsOfKind(g, "shop");
  const tilled = shops.every((r) => r.device === "till");
  post(take((m) => m.id === "evelyn") ?? take(), kitchens[0]);
  if (!tilled) post(take((m) => m.id === "violet" || m.id === "rosalind") ?? take(), shops[0]);
  const gardens = roomsOfKind(g, "conservatory");
  post(take((m) => m.id === "marigold") ?? (gardens.length ? take() : undefined), gardens[0]);
  post(roomsOfKind(g, "stillroom").length ? take() : undefined, roomsOfKind(g, "stillroom")[0]);
  post(roomsOfKind(g, "music").length && isOccasionDay(g) ? take((m) => m.id !== "odette") : undefined, roomsOfKind(g, "music")[0]);
  const pantry = roomsOfKind(g, "pantry")[0];
  post(take((m) => m.id === "tabitha") ?? take(), pantry);
  const reception = receptionRooms(g);
  let i = 0;
  while (free.length > 0) {
    const spots = [...reception, ...kitchens.slice(1), ...roomsOfKind(g, "bath"), ...(tilled ? [] : shops)];
    if (spots.length === 0) break;
    post(take(), spots[i % spots.length]);
    i += 1;
  }
  const lord = lordOf(g);
  const lab = roomsOfKind(g, "lab")[0];
  // With one maid the house cannot both bake and sell: the Master minds the shop.
  const alone = maids(g).length < 2 && !tilled && shops.length > 0;
  const lordRoom = alone ? shops[0] : s.lord === "lab" ? lab : s.lord === "host" ? (reception[0] ?? lab) : (kitchens[1] ?? shops[0] ?? lab);
  apply(g, { kind: "assign", maid: lord.id, room: lordRoom.id });
};

/** Everyone to the reception rooms; the Master hosts, with Evelyn beside him if she is in the house. */
const staffOccasion = (g: Game): void => {
  const reception = receptionRooms(g).sort((a, b) => ROOM_DEFS[b.kind].seats - ROOM_DEFS[a.kind].seats);
  if (reception.length === 0) return;
  const music = roomsOfKind(g, "music")[0];
  const free = [...maids(g)];
  apply(g, { kind: "assign", maid: lordOf(g).id, room: reception[0].id });
  if (music && free.length > reception.length) {
    const player = free.findIndex((m) => m.id !== "violet" && m.id !== "evelyn" && m.id !== "odette");
    if (player >= 0) apply(g, { kind: "assign", maid: free.splice(player, 1)[0].id, room: music.id });
  }
  free.sort((a, b) => Number(b.id === "evelyn") - Number(a.id === "evelyn"));
  free.forEach((m, i) => apply(g, { kind: "assign", maid: m.id, room: reception[i % reception.length].id }));
};

const useInventions = (g: Game): void => {
  while (g.pending.length > 0) apply(g, { kind: "choose", index: 0 });
  for (const id of [...g.spareDevices]) {
    const def = DEVICES[id];
    if (def.fits === "pack") continue;
    if (def.fits === "tool") {
      const m = maids(g).find((x) => x.tool === null) ?? g.maids.find((x) => x.tool === null && !x.isLord);
      if (m) apply(g, { kind: "install", device: id, maid: m.id });
      continue;
    }
    const room = g.rooms.find((r) => def.fits.includes(r.kind) && r.device === null);
    if (room) apply(g, { kind: "install", device: id, room: room.id });
  }
};

const wantsFromForest = (g: Game): boolean =>
  g.recipes.some((id) => {
    const r = RECIPES[id];
    if (!g.rooms.some((room) => room.kind === r.room)) return false;
    return Object.keys(r.needs).some((good) => (good === "honey" || good === "berries" || good === "herbs") && houseStock(g, good) < 3);
  });

const shop = (g: Game, s: Strategy): void => {
  // Keep enough back for tomorrow's provisions.
  const RESERVE = 6;
  let bought = true;
  while (bought) {
    bought = false;
    const ranked = g.offers
      .map((o, index) => ({ o, index }))
      .filter(({ o }) => !o.sold && g.coin - o.cost >= RESERVE)
      .sort((a, b) => score(g, s, b.o) - score(g, s, a.o));
    const top = ranked.find(({ o }) => score(g, s, o) > 0);
    if (top && apply(g, { kind: "buy", index: top.index })) bought = true;
  }
  // With the occasion near and coin to spare, engage help for the evening.
  if (s.ambitious && daysToOccasion(g) <= 1) for (const id of ["quartet", "chef", "footmen"]) apply(g, { kind: "engage", id });
  // Coin with nowhere better to go is given to the parish.
  const SPARE_FACTOR = 3;
  while (s.supper === "feast" && g.coin > donationCost(g) * SPARE_FACTOR && apply(g, { kind: "donate" })) continue;
};

const score = (g: Game, s: Strategy, o: Game["offers"][number]): number => {
  if (o.kind === "hire") return HIREABLE.includes(o.ref) ? 100 - maids(g).length * 12 : 0;
  if (o.kind === "room") {
    const kind = o.ref as RoomKind;
    const have = roomsOfKind(g, kind).length;
    const at = s.build.indexOf(kind);
    if (at < 0 || have > 0) return 0;
    // No point fitting out a room nobody can staff.
    return maids(g).length >= 2 ? 80 - at * 10 : 0;
  }
  if (o.kind === "recipe") return 60;
  if (o.kind === "wing") return g.coin > o.cost * 2 ? 40 : 0;
  // A case from the grocer's van, once the house can spare it.
  if (o.kind === "luxury") return s.ambitious && g.coin > o.cost * 1.5 ? 50 : 0;
  return 0;
};

export type RunResult = {
  strategy: string;
  seed: number;
  tiers: Tier[];
  scores: number[];
  targets: number[];
  occasions: string[];
  coinEarned: number;
  hearth: number;
  maids: number;
  days: number;
};

const SAFETY_STEPS = 200000;

/** Play a whole season (or `chapters` of it) with a strategy. */
export const runBot = (g: Game, s: Strategy, chapters: number = CHAPTERS): RunResult => {
  const occasions: string[] = [];
  for (let guard = 0; guard < SAFETY_STEPS; guard++) {
    if (g.phase === "ended" || g.chapter > chapters) break;
    if (g.phase === "invite") {
      const options = invitations(g);
      const grand = options.some((o) => o.grade === "grand");
      apply(g, { kind: "invite", grade: s.ambitious && grand ? "grand" : "humble" });
      // Candles for a candle-lit evening, if there is a still-room to make them.
      void options;
      occasions.push(g.upcoming?.name ?? "?");
    } else if (g.phase === "morning") {
      if (!s.idle) {
        apply(g, { kind: "supper", plan: s.supper });
        const GENEROUS_PURSE = 80;
        apply(g, { kind: "wages", plan: s.supper === "feast" && g.coin > GENEROUS_PURSE ? "generous" : "fair" });
        useInventions(g);
        setOrders(g, s);
        setRecipes(g);
        if (s.explores && !isOccasionDay(g) && maids(g).length >= 3 && wantsFromForest(g)) {
          const scout = maids(g).find((m) => m.id === "hazel") ?? maids(g).find((m) => m.id !== "evelyn" && m.id !== "violet");
          const ration = houseStock(g, "bread") > 0 ? ["bread"] : [];
          if (scout) apply(g, { kind: "expedition", maid: scout.id, site: "forest", pack: ration });
        }
        staffDay(g, s);
      }
      apply(g, { kind: "startDay" });
    } else if (g.phase === "day") {
      advance(g, s.cadence);
      if (s.idle || g.phase !== "day") continue;
      useInventions(g);
      setRecipes(g);
      // Take a fair trade at the door: sell surplus except on the day itself, buy when flush.
      if (g.trader && whyNotTrade(g) === null) {
        const t = g.trader;
        const FLUSH_FACTOR = 2;
        apply(g, (t.cost < 0 ? !isOccasionDay(g) : g.coin > t.cost * FLUSH_FACTOR) ? { kind: "trade" } : { kind: "dismiss" });
      }
      const exp = g.expedition;
      if (exp && exp.state === "deciding") apply(g, exp.nextRisk <= s.nerve ? { kind: "press" } : { kind: "turnBack" });
      // Someone home from the forest goes back to work.
      if (g.maids.some((m) => !m.away && !m.isLord && m.room === null)) staffDay(g, s);
    } else if (g.phase === "occasion") {
      if (!s.idle && g.t === 0) staffOccasion(g);
      if (s.attentive) for (const v of g.visitors) if (v.fancy && !v.noted) apply(g, { kind: "note", visitor: v.id });
      advance(g, Math.min(s.cadence, 2));
    } else if (g.phase === "result") {
      apply(g, { kind: "continue" });
    } else if (g.phase === "offers") {
      while (g.pending.length > 0) apply(g, { kind: "choose", index: 0 });
      if (!s.idle) shop(g, s);
      apply(g, { kind: "nextDay" });
    } else if (g.phase === "sabbath") {
      apply(g, { kind: "continue" });
    } else break;
  }
  return {
    strategy: s.name,
    seed: g.seed,
    tiers: g.results.map((r) => r.tier),
    scores: g.results.map((r) => r.score),
    targets: g.results.map((r) => r.target),
    occasions,
    coinEarned: g.stats.coinEarned,
    hearth: g.hearth,
    maids: g.maids.length - 1,
    days: g.day,
  };
};

export const STRATEGIES: Strategy[] = [
  { name: "idle", ambitious: false, keepFrom: 0, lord: "lab", supper: "shared", explores: false, nerve: 0, build: [], idle: true, cadence: 5 },
  { name: "shopkeeper", ambitious: false, keepFrom: 0, lord: "lab", supper: "none", explores: false, nerve: 0, build: ["kitchen", "shop"], cadence: 4 },
  { name: "steady", ambitious: true, keepFrom: 0, lord: "lab", supper: "shared", explores: true, nerve: 0.25, build: ["conservatory", "dining", "stillroom", "music"], cadence: 3, attentive: true },
  { name: "hearth", ambitious: false, keepFrom: 1, lord: "host", supper: "feast", explores: true, nerve: 0.2, build: ["conservatory", "dining", "kitchen"], cadence: 3 },
  { name: "inventor", ambitious: true, keepFrom: 1, lord: "lab", supper: "feast", explores: true, nerve: 0.45, build: ["dining", "stillroom", "conservatory", "music"], cadence: 3, attentive: true },
  { name: "banquet", ambitious: true, keepFrom: 1, lord: "kitchen", supper: "feast", explores: true, nerve: 0.4, build: ["dining", "kitchen", "stillroom", "music", "bath"], cadence: 3, attentive: true },
];

export const describeScore = (g: Game): string => `${Math.round(occasionScore(g))}`;
export const receptionSeats = (g: Game): number => receptionRooms(g).reduce((a, r) => a + ROOM_DEFS[r.kind].seats, 0);
export const servesReception = (kind: RoomKind): boolean => isReception(kind) || SERVE_ROOMS.includes(kind);
