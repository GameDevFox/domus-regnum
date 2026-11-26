import { isHired } from "./content/hired";
import { GOODS, ROOM_DEFS } from "./content/house";
import { allStock, hasDevice, hearthLevel, receptionRooms, roomsOfKind, traitOf } from "./house";
import { plannedMenu } from "./larder";
import type { Game, GoodId, Maid, OccasionDef, Room } from "./types";
import { PLAIN_FOLK_PRICE_CAP, REGISTER_KINDS, servingFactors } from "./visitors";
import type { Evening } from "./visitors";

// What an occasion would score if the whole menu were served. It is deliberately optimistic about
// time and counts no fancies: it answers "is what I have enough?", not "will it all get to the
// table?". Two readings: with the household posted as it is this minute, and with it posted
// sensibly for the evening (the Master hosting with Evelyn beside him, and so on) — because at
// ten in the morning nobody is where they will be at dusk.

export type Forecast = {
  comfort: number;
  grace: number;
  hearth: number;
  score: number;
  target: number;
  seated: number;
  standing: number;
  /** Kinds of food the guests would get at least one of. */
  kinds: GoodId[];
  litRooms: number;
  rooms: number;
  /** Servings the plan calls for, to compare with what the maids can carry in an evening. */
  servings: number;
};

export type Posting = "now" | "evening";

/** Maids needed before one can be spared to play, or to mind the baths. */
const SPARE_FOR_MUSIC = 3;
const SPARE_FOR_BATH = 4;

export const forecast = (g: Game, posting: Posting = "evening", card?: OccasionDef): Forecast | null => {
  const def = card ?? g.occasion?.def ?? g.upcoming;
  if (!def) return null;
  const reception = receptionRooms(g);
  const stock = allStock(g);
  const candles = stock.candle ?? 0;
  const home = g.maids.filter((m) => !m.away);
  const hands = home.filter((m) => !m.isLord).length;
  const postedIn = (room: Room): Maid[] => home.filter((m) => m.room === room.id);
  const lord = home.find((m) => m.isLord);
  // Where the Master hosts: where he already is, if that is a reception room; otherwise the biggest.
  const bySeats = [...reception].sort((a, b) => ROOM_DEFS[b.kind].seats - ROOM_DEFS[a.kind].seats);
  const hostRoom = (lord && reception.find((r) => r.id === lord.room)) ?? (posting === "evening" ? bySeats[0] : undefined);
  const rooms = hostRoom ? [hostRoom, ...bySeats.filter((r) => r !== hostRoom)] : bySeats;
  const company = home.filter((m) => m.isLord || m.id === "evelyn" || traitOf(m) === "songbird" || traitOf(m) === "motherly");
  const staffed = (room: Room): boolean => postedIn(room).some((m) => !m.isLord);
  const eve: Evening = {
    twist: def.twist,
    lit: rooms.slice(0, candles).map((r) => r.id),
    music: posting === "evening" ? roomsOfKind(g, "music").length > 0 && hands >= SPARE_FOR_MUSIC : roomsOfKind(g, "music").some(staffed),
    bath: roomsOfKind(g, "bath").some((room) => hasDevice(room, "boiler") || (posting === "evening" ? hands >= SPARE_FOR_BATH : staffed(room))),
    quartet: isHired(g, "quartet"),
    chef: isHired(g, "chef"),
    staff: (room) => (posting === "evening" ? (room === hostRoom ? company : []) : postedIn(room)),
  };
  const seats: (Room | null)[] = [];
  let at = 0;
  let used = 0;
  for (let i = 0; i < def.guests; i++) {
    while (at < rooms.length && used >= ROOM_DEFS[rooms[at].kind].seats) {
      at += 1;
      used = 0;
    }
    seats.push(at < rooms.length ? rooms[at] : null);
    if (at < rooms.length) used += 1;
  }
  const remaining: Record<GoodId, number> = { ...stock };
  const each = def.twist === "harvest" ? 2 : 1;
  let comfort = 0;
  let grace = 0;
  let servings = 0;
  const kinds = new Set<GoodId>();
  seats.forEach((room, i) => {
    if (!room) return;
    const honour = i === 0;
    const worth = (good: GoodId): number => servingFactors(g, room, honour, good, eve).reduce((a, f) => a * f.factor, GOODS[good].value);
    let menu = plannedMenu(g, stock).filter((id) => (remaining[id] ?? 0) > 0);
    if (def.twist === "plainFolk") menu = menu.filter((id) => GOODS[id].price <= PLAIN_FOLK_PRICE_CAP);
    menu.sort((a, b) => GOODS[b].value - GOODS[a].value);
    // A samovar pours for everyone in its room, from no stock at all.
    const poured = hasDevice(room, "samovar") && (def.twist !== "plainFolk" || GOODS.tea.price <= PLAIN_FOLK_PRICE_CAP);
    if (poured) {
      grace += worth("tea");
      kinds.add("tea");
      menu = menu.filter((id) => id !== "tea");
    }
    if (def.twist === "register") menu = menu.slice(0, REGISTER_KINDS - (poured ? 1 : 0));
    for (const good of menu) {
      const n = Math.min(each, remaining[good] ?? 0);
      if (n <= 0) continue;
      remaining[good] -= n;
      servings += n;
      kinds.add(good);
      if (GOODS[good].pole === "comfort") comfort += worth(good) * n;
      else grace += worth(good) * n;
    }
  });
  const hearth = hearthLevel(g.hearth);
  return {
    comfort,
    grace,
    hearth,
    score: comfort * grace * hearth,
    target: def.target,
    seated: seats.filter((s) => s !== null).length,
    standing: seats.filter((s) => s === null).length,
    kinds: [...kinds],
    litRooms: Math.min(candles, rooms.length),
    rooms: rooms.length,
    servings,
  };
};
