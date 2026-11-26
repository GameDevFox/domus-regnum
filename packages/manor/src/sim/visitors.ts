import { isHired } from "./content/hired";
import { GOODS, POPULARITY, ROOM_DEFS } from "./content/house";
import { hasDevice, houseStock, logLine, pick, rand, randInt, reach, receptionRooms, roomsOfKind, takeReach, traitOf } from "./house";
import { onSale, perGuest, spareStock } from "./larder";
import {
  BATH_PRICE,
  BATH_RATE,
  BATH_SOAK_SECONDS,
  CUSTOMER_PATIENCE,
  DAY_SECONDS,
  FANCY_FACTOR,
  FANCY_GAP,
  FANCY_SECONDS,
  ORDER_PATIENCE,
  ORDER_PAY,
  ORDER_RATE,
  PATRON_ORDERS,
  PATRON_PATIENCE,
  PATRON_PAY,
  PATRON_RATE,
  RENOWN_TRAFFIC,
  SAMOVAR_DELAY,
  SAVOUR_SECONDS,
  SHOP_QUEUE,
} from "./tuning";
import type { Game, GoodId, Maid, Room, Stock, Visitor, VisitorKind } from "./types";

const FACES = ["🧑", "👩", "👨", "🧓", "👵", "👴", "👩‍🦰", "👨‍🦱", "👱‍♀️", "👩‍🦱", "👨‍🦳", "🧑‍🦰", "👧", "👦"];
const ORDER_FACE = "🧾";
/** Pseudo-good a bather "wants": a drawn bath. */
export const BATH = "_bath";

/** How long a departed visitor lingers in state for the exit animation. */
const LEAVE_SECONDS = 1.2;

// Traffic through the day: a quiet morning, a midday rush, a steady afternoon. Mean ≈ 1.
const RUSH_START = 0.35;
const RUSH_END = 0.6;
const RUSH_FACTOR = 2.1;
const QUIET_FACTOR = 0.6;
export const trafficShape = (t: number): number => {
  const f = t / DAY_SECONDS;
  return f >= RUSH_START && f < RUSH_END ? RUSH_FACTOR : QUIET_FACTOR;
};
export const isRush = (t: number): boolean => trafficShape(t) > 1;

const newVisitor = (g: Game, kind: VisitorKind, room: Room | null, wants: GoodId[], patience: number, spot: number): Visitor => {
  const v: Visitor = {
    id: g.nextVisitorId++,
    kind,
    room: room ? room.id : null,
    wants,
    had: [],
    patience,
    patienceMax: patience,
    claimedBy: null,
    spot,
    honour: false,
    busy: 0,
    leaving: -1,
    happy: true,
    face: kind === "order" ? ORDER_FACE : pick(g, FACES),
    fancy: null,
    fancyLeft: 0,
    noted: false,
  };
  g.visitors.push(v);
  return v;
};

export const present = (g: Game, room: Room): Visitor[] => g.visitors.filter((v) => v.room === room.id && v.leaving < 0);

const freeSpot = (g: Game, room: Room, cap: number): number => {
  const taken = new Set(present(g, room).map((v) => v.spot));
  for (let i = 0; i < cap; i++) if (!taken.has(i)) return i;
  return -1;
};

const traffic = (g: Game): number => (1 + g.renown * RENOWN_TRAFFIC) * trafficShape(g.t);

const ORDER_CHAPTER_CAP = 4;
const ORDER_MIN = 5;
const ORDER_MAX = 9;

/** Day arrivals: walk-ins and bulk orders at each shop, sit-in patrons in reception rooms, bathers. */
export const spawnDayVisitors = (g: Game, dt: number): void => {
  const selling = onSale(g);
  const tick = (key: string, rate: number): number => {
    g.arrivals[key] = (g.arrivals[key] ?? 0) + rate * dt;
    const n = Math.floor(g.arrivals[key]);
    g.arrivals[key] -= n;
    return n;
  };
  for (const shop of roomsOfKind(g, "shop")) {
    for (const good of selling) {
      for (let n = tick(`${shop.id}:${good}`, POPULARITY[good] * traffic(g)); n > 0; n--) {
        const spot = freeSpot(g, shop, SHOP_QUEUE);
        if (spot < 0) {
          g.today.lost += 1;
          continue;
        }
        newVisitor(g, "customer", shop, [good], CUSTOMER_PATIENCE, spot);
      }
    }
    // Now and then somebody wants a great many of one thing, and pays double for the trouble.
    const makeable = selling.filter((id) => GOODS[id].pole !== null && !GOODS[id].luxury);
    // (A chance each tick, not a running total: a slow total would be wiped every morning.)
    // Bigger houses get more of them: the rate climbs with the chapter.
    if (makeable.length > 0 && g.t < DAY_SECONDS - ORDER_PATIENCE && rand(g) < ORDER_RATE * Math.min(g.chapter, ORDER_CHAPTER_CAP) * dt) {
      const spot = freeSpot(g, shop, SHOP_QUEUE);
      if (spot < 0 || present(g, shop).some((v) => v.kind === "order")) continue;
      const good = pick(g, makeable);
      const count = randInt(g, ORDER_MIN, ORDER_MAX) + g.chapter;
      newVisitor(g, "order", shop, Array.from({ length: count }, () => good), ORDER_PATIENCE, spot);
    }
  }
  const served = selling.filter((id) => GOODS[id].pole !== null);
  if (served.length > 0) {
    for (const room of receptionRooms(g)) {
      // A tea room is open only while somebody is posted to it: nobody is shown into an empty one.
      const open = g.maids.some((m) => !m.isLord && !m.away && m.room === room.id);
      for (let n = tick(`${room.id}:patron`, open ? PATRON_RATE * traffic(g) : 0); n > 0; n--) {
        const spot = freeSpot(g, room, ROOM_DEFS[room.kind].seats);
        if (spot < 0) continue;
        const wants: GoodId[] = [];
        const pool = [...served];
        for (let i = 0; i < PATRON_ORDERS && pool.length > 0; i++) {
          const teaAt = pool.indexOf("tea");
          const at = i === 0 && teaAt >= 0 ? teaAt : Math.floor(rand(g) * pool.length);
          wants.push(pool[at]);
          pool.splice(at, 1);
        }
        const v = newVisitor(g, "patron", room, wants, PATRON_PATIENCE, spot);
        if (hasDevice(room, "samovar") && v.wants.includes("tea")) serveVisitor(g, room, null, v, "tea", 1);
      }
    }
  }
  for (const bath of roomsOfKind(g, "bath")) {
    for (let n = tick(`${bath.id}:bath`, BATH_RATE * traffic(g)); n > 0; n--) {
      if (present(g, bath).length > 0) continue;
      const v = newVisitor(g, "customer", bath, [BATH], PATRON_PATIENCE, 0);
      if (hasDevice(bath, "boiler")) serveVisitor(g, bath, null, v, BATH, 1);
    }
  }
};

/** Patience runs down while a visitor waits; visitors who have finished or given up leave. */
export const stepVisitors = (g: Game, dt: number): void => {
  for (const v of g.visitors) {
    if (v.leaving >= 0) {
      v.leaving += dt;
      continue;
    }
    if (v.fancy) {
      // Once noticed, a fancy is remembered until it is brought; unnoticed, it passes.
      if (!v.noted) v.fancyLeft -= dt;
      if (v.fancyLeft <= 0 || (v.kind === "guest" && !accepts(g, v, v.fancy))) {
        v.fancy = null;
        v.noted = false;
      }
    }
    if (v.busy > 0) {
      v.busy -= dt;
      if (v.busy <= 0 && v.kind !== "guest" && v.wants.length === 0 && !(v.fancy && v.noted)) v.leaving = 0;
      continue;
    }
    if (v.kind === "guest") continue;
    if (v.claimedBy === null) v.patience -= dt;
    if (v.patience <= 0) {
      v.happy = v.kind === "order" && v.had.length > 0;
      v.leaving = 0;
      g.today.lost += 1;
    }
  }
  g.visitors = g.visitors.filter((v) => v.leaving < LEAVE_SECONDS);
};

/** A till lets shop customers help themselves to what is on the counter. */
export const stepTills = (g: Game): void => {
  for (const shop of roomsOfKind(g, "shop")) {
    if (!hasDevice(shop, "till")) continue;
    let spare: Stock | null = null;
    for (const v of present(g, shop)) {
      if (v.busy > 0 || v.claimedBy !== null || v.wants.length === 0) continue;
      const good = v.wants[0];
      if (reach(g, shop, good) <= 0) continue;
      spare = spare ?? spareStock(g);
      const n = Math.min(v.kind === "order" ? v.wants.length : 1, reach(g, shop, good), spare[good] ?? 0);
      if (n <= 0) continue;
      const got = takeReach(g, shop, good, n);
      spare[good] -= got;
      if (got > 0) serveVisitor(g, shop, null, v, good, got);
    }
  }
};

// ---- the occasion: fancies ----

/** Seated guests who could still be given something on tonight's menu that the house has. */
export const stillHungry = (g: Game): Visitor[] => {
  const occ = g.occasion;
  if (!occ) return [];
  const inHouse = occ.menu.filter((good) => houseStock(g, good) > 0);
  return g.visitors.filter((v) => v.kind === "guest" && v.room !== null && v.leaving < 0 && inHouse.some((good) => accepts(g, v, good)));
};

/** Now and then a guest takes a fancy to one particular thing. Catch it and it counts threefold. */
export const stepFancies = (g: Game, dt: number): void => {
  const occ = g.occasion;
  if (!occ || g.phase !== "occasion") {
    patronFancies(g, dt);
    return;
  }
  g.arrivals.fancy = (g.arrivals.fancy ?? 0) + dt;
  if (g.arrivals.fancy < FANCY_GAP) return;
  g.arrivals.fancy = 0;
  const candidates = stillHungry(g).filter((v) => !v.fancy);
  if (candidates.length === 0) return;
  const v = pick(g, candidates);
  const options = occ.menu.filter((good) => houseStock(g, good) > 0 && accepts(g, v, good));
  if (options.length === 0) return;
  v.fancy = pick(g, options);
  // Evelyn reads a room: where she is, a guest's fancy shows for twice as long.
  const room = g.rooms.find((r) => r.id === v.room);
  v.fancyLeft = FANCY_SECONDS * (room && maidsIn(g, room).some((m) => m.id === "evelyn") ? 2 : 1);
  v.noted = false;
};

const PATRON_FANCY_GAP = 9;

/** By day a patron at a tea table may fancy something more than she ordered: an extra sale, at three times the price. */
const patronFancies = (g: Game, dt: number): void => {
  g.arrivals.fancy = (g.arrivals.fancy ?? 0) + dt;
  if (g.arrivals.fancy < PATRON_FANCY_GAP) return;
  g.arrivals.fancy = 0;
  const candidates = g.visitors.filter((v) => v.kind === "patron" && v.leaving < 0 && !v.fancy && v.room !== null);
  if (candidates.length === 0) return;
  const v = pick(g, candidates);
  const spare = spareStock(g);
  const options = onSale(g, spare).filter((good) => GOODS[good].pole !== null && !v.wants.includes(good) && !v.had.includes(good));
  if (options.length === 0) return;
  v.fancy = pick(g, options);
  const room = g.rooms.find((r) => r.id === v.room);
  v.fancyLeft = FANCY_SECONDS * (room && maidsIn(g, room).some((m) => m.id === "evelyn") ? 2 : 1);
  v.noted = false;
};

/** The host notices a guest's fancy. */
export const noteFancy = (g: Game, visitorId: number): boolean => {
  const v = g.visitors.find((x) => x.id === visitorId);
  if (!v || !v.fancy || v.noted) return false;
  v.noted = true;
  return true;
};

// ---- what a guest will take, and what a serving is worth ----

export const REGISTER_KINDS = 3;
export const PLAIN_FOLK_PRICE_CAP = GOODS.cake.price;
/** Guests stay the whole evening. A large finite number, so the state stays plain JSON. */
const GUEST_PATIENCE = 1e9;
const GOURMET_FLOOR = 6;
const HONOUR_FACTOR = 2;

/** Would this visitor take this good right now? */
export const accepts = (g: Game, v: Visitor, good: GoodId): boolean => {
  if (v.kind !== "guest") return v.wants.includes(good) || (v.fancy === good && v.noted);
  const def = GOODS[good];
  const occ = g.occasion;
  if (!def || def.pole === null || !occ || !occ.menu.includes(good) || g.offMenu.includes(good)) return false;
  const twist = occ.def.twist;
  const hadTimes = v.had.filter((h) => h === good).length;
  if (hadTimes >= perGuest(g)) return false;
  if (twist === "plainFolk" && def.price > PLAIN_FOLK_PRICE_CAP) return false;
  if (twist === "register") {
    // Three kinds and no more — and she will wait for the three dearest in the house rather
    // than fill up on whatever happens to be on the sideboard.
    const had = new Set(v.had);
    const left = REGISTER_KINDS - had.size;
    if (left <= 0) return false;
    const dearest = occ.menu
      .filter((id) => !had.has(id) && !g.offMenu.includes(id) && houseStock(g, id) > 0)
      .sort((a, b) => GOODS[b].value - GOODS[a].value || a.localeCompare(b));
    return dearest.slice(0, left).includes(good);
  }
  return true;
};

export const maidsIn = (g: Game, room: Room): Maid[] =>
  g.maids.filter((m) => !m.away && m.room === room.id && Math.abs(m.pos.x - (room.col + 0.5)) < 0.45 && Math.abs(m.pos.y - room.floor) < 0.05);

/** Is anyone playing in a music room? Doubles Grace across the whole house. */
export const musicPlaying = (g: Game): boolean => roomsOfKind(g, "music").some((room) => maidsIn(g, room).some((m) => !m.isLord));
/** Is anyone keeping a bath-house hot? Doubles Comfort across the whole house. */
export const bathTended = (g: Game): boolean => roomsOfKind(g, "bath").some((room) => hasDevice(room, "boiler") || maidsIn(g, room).some((m) => !m.isLord));

/** What an evening's rules are: the real ones once it has begun, or a forecast's assumptions. */
export type Evening = { twist: string; lit: string[]; music: boolean; bath: boolean; quartet: boolean; chef: boolean; staff: (room: Room) => Maid[] };

export const eveningNow = (g: Game): Evening => ({
  twist: g.occasion?.def.twist ?? "none",
  lit: g.occasion?.lit ?? [],
  music: musicPlaying(g),
  bath: bathTended(g),
  quartet: isHired(g, "quartet"),
  chef: isHired(g, "chef"),
  staff: (room) => maidsIn(g, room),
});

/** The multipliers on one serving, itemised so the UI can show where a number came from. */
export const servingFactors = (g: Game, room: Room, honour: boolean, good: GoodId, eve: Evening = eveningNow(g)): { label: string; factor: number }[] => {
  const def = GOODS[good];
  const out: { label: string; factor: number }[] = [];
  const twist = eve.twist;
  const here = eve.staff(room);
  if (honour) out.push({ label: "guest of honour", factor: HONOUR_FACTOR });
  if (twist === "gourmet" && def.value < GOURMET_FLOOR) out.push({ label: "beneath the gourmet", factor: 0 });
  if (twist === "envoy" && def.value < GOURMET_FLOOR) out.push({ label: "beneath the envoy", factor: 0 });
  if (twist === "visitation" && room.device !== null) out.push({ label: "alchemy on show", factor: 0 });
  if (twist === "precedence" && !here.some((m) => m.isLord)) out.push({ label: "not at the Master's table", factor: 0 });
  if (def.pole === "comfort") {
    if (twist === "plainFolk") out.push({ label: "plain folk", factor: 2 });
    if (hasDevice(room, "hearthstone")) out.push({ label: "hearthstone", factor: 2 });
    if (here.some((m) => traitOf(m) === "motherly")) out.push({ label: "motherly", factor: 2 });
    if (eve.bath) out.push({ label: "hot baths", factor: 2 });
    if (eve.chef) out.push({ label: "a chef from town", factor: 2 });
  } else {
    const lit = eve.lit.includes(room.id);
    if ((twist === "candlelight" || twist === "envoy") && !lit) out.push({ label: "no candles", factor: 0 });
    if (lit) out.push({ label: "candlelight", factor: 2 });
    if (hasDevice(room, "crystal") || eve.music) out.push({ label: "music", factor: 2 });
    if (eve.quartet) out.push({ label: "a string quartet", factor: 2 });
    if (here.some((m) => traitOf(m) === "songbird")) out.push({ label: "songbird", factor: 2 });
    const lord = here.find((m) => m.isLord);
    if (lord) out.push(here.some((m) => m.id === "evelyn") ? { label: "the Master hosting, Evelyn beside him", factor: 3 } : { label: "the Master hosting", factor: 2 });
  }
  return out;
};

export const servingValue = (g: Game, room: Room, v: Visitor, good: GoodId, eve?: Evening): number =>
  servingFactors(g, room, v.honour, good, eve).reduce((a, f) => a * f.factor, GOODS[good].value) * (v.fancy === good && v.noted ? FANCY_FACTOR : 1);

/** Apply a serving: coin from a customer, patron or order; Comfort or Grace from an occasion guest. */
export const serveVisitor = (g: Game, room: Room, maid: Maid | null, v: Visitor, good: GoodId, count: number): void => {
  v.claimedBy = null;
  // Charm works across a counter, not a tea table.
  const charm = maid && traitOf(maid) === "charming" && room.kind === "shop" ? 2 : 1;
  if (good === BATH) {
    earn(g, BATH_PRICE * charm);
    v.wants = [];
    v.busy = BATH_SOAK_SECONDS;
    return;
  }
  const def = GOODS[good];
  if (v.kind === "guest") {
    const occ = g.occasion;
    if (!occ) return;
    const value = servingValue(g, room, v, good);
    if (def.pole === "comfort") occ.comfort += value;
    else occ.grace += value;
    occ.served += 1;
    if (v.fancy === good) {
      // Only a fancy somebody noticed counts for more: brought by luck, it is just a serving.
      if (v.noted) occ.fancies += 1;
      v.fancy = null;
      v.noted = false;
    }
    v.had.push(good);
    v.busy = SAVOUR_SECONDS;
    return;
  }
  const fancied = v.fancy === good && v.noted;
  for (let i = 0; i < count; i++) {
    const at = v.wants.indexOf(good);
    if (at >= 0) v.wants.splice(at, 1);
    v.had.push(good);
  }
  if (fancied) {
    v.fancy = null;
    v.noted = false;
  }
  earn(g, def.price * count * (v.kind === "order" ? ORDER_PAY : v.kind === "patron" ? PATRON_PAY : 1) * charm * (fancied ? FANCY_FACTOR : 1));
  g.today.sold += count;
  if (good === "tea") v.patienceMax *= 2;
  if (v.kind !== "order") v.patience = v.patienceMax;
  if (v.wants.length === 0) {
    if (v.kind === "patron") v.busy = SAVOUR_SECONDS;
    else v.leaving = 0;
  }
};

export const earn = (g: Game, coin: number): void => {
  g.coin += coin;
  g.today.coinEarned += coin;
};

/** The order guests are seated in: the host's room first, then the bigger rooms. Each fills before the next. */
export const seatingOrder = (g: Game, rooms: Room[] = receptionRooms(g)): Room[] => {
  const hosted = (room: Room): number => (g.maids.some((m) => m.isLord && !m.away && m.room === room.id) ? 1 : 0);
  return [...rooms].sort((a, b) => hosted(b) - hosted(a) || ROOM_DEFS[b.kind].seats - ROOM_DEFS[a.kind].seats);
};

/** Seat the guests for an occasion and light the candles. */
export const seatGuests = (g: Game): void => {
  const occ = g.occasion;
  if (!occ) return;
  g.visitors = [];
  const rooms = seatingOrder(g);
  for (const room of rooms) {
    const holder = g.rooms.find((r) => (r.shelf.candle ?? 0) > 0);
    if (!holder) break;
    holder.shelf.candle -= 1;
    if (holder.shelf.candle <= 0) delete holder.shelf.candle;
    occ.lit.push(room.id);
  }
  let standing = 0;
  let at = 0;
  let used = 0;
  for (let i = 0; i < occ.def.guests; i++) {
    while (at < rooms.length && used >= ROOM_DEFS[rooms[at].kind].seats) {
      at += 1;
      used = 0;
    }
    const room = at < rooms.length ? rooms[at] : null;
    const v = newVisitor(g, "guest", room, [], GUEST_PATIENCE, room ? used : standing++);
    if (room) used += 1;
    if (i === 0) {
      v.honour = true;
      v.face = occ.def.honourFace;
    }
  }
  if (standing > 0) logLine(g, `${standing} guest${standing > 1 ? "s" : ""} could not be seated and stood in the hall all evening.`, "bad");
  if (occ.lit.length < rooms.length && rooms.length > 0) logLine(g, occ.lit.length === 0 ? "No candles: the rooms were lit by lamp." : "Not enough candles for every room.", "plain");
};

/** A samovar pours for everyone in its room a few seconds into the evening. */
export const stepSamovars = (g: Game): void => {
  const occ = g.occasion;
  if (!occ || occ.t < SAMOVAR_DELAY) return;
  for (const room of receptionRooms(g)) {
    if (!hasDevice(room, "samovar")) continue;
    for (const v of present(g, room)) {
      if (v.kind !== "guest" || v.had.includes("tea")) continue;
      if (!occ.menu.includes("tea")) occ.menu.push("tea");
      if (accepts(g, v, "tea")) serveVisitor(g, room, null, v, "tea", 1);
    }
  }
};
