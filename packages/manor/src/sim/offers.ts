import { occasionOver } from "./calendar";
import { FITTABLE, GOODS, LEARNABLE, LUXURIES, RECIPES, ROOM_DEFS } from "./content/house";
import { DEVICES, DEVICE_IDS } from "./content/devices";
import { HIREABLE, MAID_DEFS, TWIN_OF } from "./content/people";
import { HALL_X, logLine, pick, roomById, say, shuffled, store } from "./house";
import { perGuest } from "./larder";
import { EAST_WING_COL, INVENTION_CHOICES, MAX_MAIDS, OFFER_COUNT, REROLL_BASE, RESEARCH_FIRST, RESEARCH_STEP, WEST_WING_COL, WING_COST } from "./tuning";
import type { DeviceId, Game, Maid, MaidId, Offer, RoomKind } from "./types";

// The evening's offers: someone looking for a place, a room that could be fitted out, a recipe
// for sale. Three at a time, into a house with few rooms and few beds — the choice is the point.

const maidCount = (g: Game): number => g.maids.filter((m) => !m.isLord).length;

const hireOffers = (g: Game): Offer[] =>
  HIREABLE.filter((id) => !g.maids.some((m) => m.id === id))
    .filter((id) => maidCount(g) + (TWIN_OF[id] ? 2 : 1) <= MAX_MAIDS)
    .map((id) => ({ kind: "hire", ref: id, cost: MAID_DEFS[id].hireCost, sold: false }) as Offer);

const roomOffers = (g: Game): Offer[] =>
  g.rooms.some((r) => r.kind === "empty") ? FITTABLE.map((kind) => ({ kind: "room", ref: kind, cost: ROOM_DEFS[kind].cost, sold: false }) as Offer) : [];

/** With more guests coming than there are seats, somebody will have a room to let: put that offer first. */
const seatsShort = (g: Game): boolean => {
  const seats = g.rooms.reduce((sum, r) => sum + ROOM_DEFS[r.kind].seats * (r.kind === "parlour" || r.kind === "dining" ? 1 : 0), 0);
  return g.upcoming !== null && seats < g.upcoming.guests;
};

const recipeOffers = (g: Game): Offer[] =>
  LEARNABLE.filter((r) => !g.recipes.includes(r.id) && g.rooms.some((room) => room.kind === RECIPES[r.id].room)).map(
    (r) => ({ kind: "recipe", ref: r.id, cost: r.cost, sold: false }) as Offer,
  );

const wingOffers = (g: Game): Offer[] => {
  const out: Offer[] = [];
  const crowded = g.rooms.filter((r) => r.kind === "empty").length <= 1;
  if (!crowded) return out;
  if (!g.wingsOpen.west) out.push({ kind: "wing", ref: "west", cost: WING_COST, sold: false });
  else if (!g.wingsOpen.east) out.push({ kind: "wing", ref: "east", cost: WING_COST * 2, sold: false });
  return out;
};

export const makeOffers = (g: Game): Offer[] => {
  const hires = shuffled(g, hireOffers(g));
  const rooms = shuffled(g, roomOffers(g));
  if (seatsShort(g)) rooms.sort((a, b) => Number(b.ref === "dining" || b.ref === "parlour") - Number(a.ref === "dining" || a.ref === "parlour"));
  const recipes = shuffled(g, recipeOffers(g));
  const wings = wingOffers(g);
  const out: Offer[] = [];
  // The first evening always brings Violet to the door: the house needs a second pair of hands.
  if (g.day === 1 && g.rerolls === 0) {
    const violet = hires.find((o) => o.ref === "violet");
    if (violet) {
      out.push(violet);
      hires.splice(hires.indexOf(violet), 1);
    }
  }
  // One of each kind where there is one, then fill from whatever is left.
  const lanes = [wings, hires, rooms, recipes];
  for (const lane of lanes) if (out.length < OFFER_COUNT && lane.length > 0) out.push(lane.shift() as Offer);
  const rest = shuffled(g, [...hires, ...rooms, ...recipes]);
  while (out.length < OFFER_COUNT && rest.length > 0) out.push(rest.shift() as Offer);
  const offers = out.slice(0, OFFER_COUNT);
  // The grocer's van: one case early in the season, two once the house is known.
  const VAN_TWO_FROM_CHAPTER = 3;
  const first = grocerOffer(g, null);
  if (first) offers.push(first);
  const second = first && g.chapter >= VAN_TWO_FROM_CHAPTER ? grocerOffer(g, first.ref) : null;
  if (second) offers.push(second);
  return offers;
};

const LUXURY_CHAPTER_CAP = 6;

/** The grocer's van: one luxury by the case, enough for every guest at the coming occasion. */
const grocerOffer = (g: Game, not: string | null): Offer | null => {
  if (!g.upcoming || occasionOver(g)) return null;
  const ref = pick(g, LUXURIES.filter((id) => id !== not));
  const qty = g.upcoming.guests * perGuest(g);
  // The grander the house, the more the grocer asks: the price climbs with the chapter.
  return { kind: "luxury", ref, cost: GOODS[ref].price * qty * Math.min(g.chapter, LUXURY_CHAPTER_CAP), sold: false, qty };
};

export const rerollCost = (g: Game): number => REROLL_BASE * Math.pow(2, g.rerolls);

export const reroll = (g: Game): boolean => {
  const cost = rerollCost(g);
  if (g.coin < cost) return false;
  g.coin -= cost;
  g.rerolls += 1;
  g.offers = makeOffers(g);
  return true;
};

const newMaid = (id: MaidId): Maid => ({
  id,
  isLord: id === "lord",
  pos: { x: HALL_X, y: 1 },
  room: null,
  carrying: {},
  plan: [],
  tool: null,
  hurtDays: 0,
  away: false,
  status: "",
  say: "",
  sayLeft: 0,
});

export const addMaid = (g: Game, id: MaidId): Maid => {
  const maid = newMaid(id);
  g.maids.push(maid);
  return maid;
};

const openWing = (g: Game, wing: "west" | "east"): void => {
  const col = wing === "west" ? WEST_WING_COL : EAST_WING_COL;
  for (const room of g.rooms) if (room.col === col && room.kind === "closed") room.kind = "empty";
  g.wingsOpen[wing] = true;
  logLine(g, `The ${wing} wing is open: four more rooms.`, "good");
};

/** Buy an offer. A room offer needs the empty room to fit out. */
export const buy = (g: Game, index: number, roomId?: string): boolean => {
  const offer = g.offers[index];
  if (!offer || offer.sold || g.coin < offer.cost) return false;
  if (offer.kind === "room") {
    const room = roomId ? roomById(g, roomId) : g.rooms.find((r) => r.kind === "empty");
    if (!room || room.kind !== "empty") return false;
    const kind = offer.ref as RoomKind;
    room.kind = kind;
    room.recipe = defaultRecipe(g, kind);
    room.rota = room.recipe ? [room.recipe] : [];
    logLine(g, `Fitted out a ${ROOM_DEFS[kind].name.toLowerCase()}.`, "good");
  } else if (offer.kind === "hire") {
    if (maidCount(g) + (TWIN_OF[offer.ref] ? 2 : 1) > MAX_MAIDS) return false;
    const maid = addMaid(g, offer.ref);
    say(g, maid, "hired");
    const twin = TWIN_OF[offer.ref];
    if (twin) addMaid(g, twin);
    logLine(g, twin ? `${MAID_DEFS[offer.ref].name} and ${MAID_DEFS[twin].name} joined the household.` : `${MAID_DEFS[offer.ref].name} joined the household.`, "good");
  } else if (offer.kind === "recipe") {
    if (!g.recipes.includes(offer.ref)) g.recipes.push(offer.ref);
    logLine(g, `Learned a recipe.`, "good");
  } else if (offer.kind === "wing") {
    openWing(g, offer.ref as "west" | "east");
  } else if (offer.kind === "luxury") {
    store(g, offer.ref, offer.qty ?? 1);
    g.orders[offer.ref] = "keep";
    logLine(g, `Bought ${offer.qty} ${GOODS[offer.ref].glyph} ${GOODS[offer.ref].name.toLowerCase()} from the grocer's van, and set them by for the guests.`, "good");
  }
  g.coin -= offer.cost;
  offer.sold = true;
  return true;
};

export const defaultRecipe = (g: Game, kind: RoomKind): string | null => {
  const known = g.recipes.map((id) => RECIPES[id]).filter((r) => r.room === kind);
  return known.length > 0 ? known[0].id : null;
};

// ---- the laboratory ----

export const researchNeeded = (g: Game): number => RESEARCH_FIRST + RESEARCH_STEP * g.inventions;

/** Turn finished research into a choice of devices. */
export const checkInvention = (g: Game): void => {
  if (g.research < researchNeeded(g)) return;
  if (g.pending.some((p) => p.kind === "invention")) return;
  // Expedition gear is a tinker's trade, not the Master's: it comes to the door, not out of the laboratory.
  const pool = DEVICE_IDS.filter((id) => !g.ownedDevices.includes(id) && DEVICES[id].fits !== "pack");
  if (pool.length === 0) return;
  g.research -= researchNeeded(g);
  g.inventions += 1;
  // Devices for rooms the house does not have are a poor choice to be offered; put them last.
  const usable = (id: DeviceId): boolean => {
    const fits = DEVICES[id].fits;
    return typeof fits === "string" || fits.some((kind) => g.rooms.some((r) => r.kind === kind));
  };
  // Fresh ideas first: whatever was shown last time and passed over goes to the back of the queue.
  const fresh = (id: DeviceId): boolean => !g.passedOver.includes(id);
  const rank = (id: DeviceId): number => (usable(id) ? 0 : 2) + (fresh(id) ? 0 : 1);
  const ordered = shuffled(g, pool).sort((a, b) => rank(a) - rank(b));
  g.pending.push({ kind: "invention", options: ordered.slice(0, INVENTION_CHOICES) });
  logLine(g, "The Master has something to show you.", "good");
};

export const chooseInvention = (g: Game, index: number): void => {
  const at = g.pending.findIndex((p) => p.kind === "invention");
  if (at < 0) return;
  const pending = g.pending[at];
  if (pending.kind !== "invention") return;
  const id = pending.options[Math.max(0, Math.min(index, pending.options.length - 1))];
  g.pending.splice(at, 1);
  g.passedOver = pending.options.filter((x) => x !== id);
  g.ownedDevices.push(id);
  g.spareDevices.push(id);
  logLine(g, `Invented: ${DEVICES[id].glyph} ${DEVICES[id].name}.`, "good");
};

/** Put a spare device in a room or a maid's hands. Whatever it replaces goes back to the shelf. */
export const install = (g: Game, id: DeviceId, roomId?: string, maidId?: string): boolean => {
  const def = DEVICES[id];
  const at = g.spareDevices.indexOf(id);
  if (!def || at < 0) return false;
  if (def.fits === "pack") return false;
  if (def.fits === "tool") {
    const maid = g.maids.find((m) => m.id === maidId);
    if (!maid) return false;
    g.spareDevices.splice(at, 1);
    if (maid.tool) g.spareDevices.push(maid.tool);
    maid.tool = id;
    return true;
  }
  const room = roomId ? roomById(g, roomId) : undefined;
  if (!room || !def.fits.includes(room.kind)) return false;
  g.spareDevices.splice(at, 1);
  if (room.device) {
    g.spareDevices.push(room.device);
    logLine(g, `A room holds one device: the ${DEVICES[room.device].name.toLowerCase()} came out to make way, and is back in the laboratory.`, "plain");
  }
  room.device = id;
  return true;
};

/** Strip a room back to bare boards so it can be fitted out as something else. */
export const demolish = (g: Game, roomId: string): boolean => {
  const room = roomById(g, roomId);
  if (room.kind === "closed" || room.kind === "empty" || room.kind === "pantry" || room.kind === "lab") return false;
  if (room.device) g.spareDevices.push(room.device);
  for (const m of g.maids) if (m.room === room.id) m.room = null;
  room.device = null;
  room.recipe = null;
  room.rota = [];
  room.kind = "empty";
  return true;
};
