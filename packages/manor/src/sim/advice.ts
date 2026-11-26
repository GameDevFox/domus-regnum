import { GOODS, ROOM_DEFS, isReception } from "./content/house";
import { MAID_DEFS } from "./content/people";
import { daysToOccasion, isOccasionDay } from "./flow";
import { allStock, receptionRooms, roomsOfKind } from "./house";
import type { Game } from "./types";
import { present } from "./visitors";

// The butler's quiet word: the one or two things most worth noticing right now. It never says
// what to do about them beyond the obvious — only what is going wrong, in plain words.

export type Advice = { text: string; urgent: boolean };

const MAX_LINES = 3;

export const advice = (g: Game): Advice[] => {
  const out: Advice[] = [];
  const live = g.phase === "day" || g.phase === "occasion";
  const stock = allStock(g);
  const has = (pole: "comfort" | "grace"): boolean => Object.entries(stock).some(([good, n]) => n > 0 && GOODS[good].pole === pole);
  const staffed = (roomId: string): boolean => g.maids.some((m) => m.room === roomId && !m.away);

  if (g.phase === "occasion") {
    for (const room of receptionRooms(g)) {
      if (present(g, room).length > 0 && !g.maids.some((m) => m.room === room.id && !m.isLord)) out.push({ text: `Guests in the ${ROOM_DEFS[room.kind].name.toLowerCase()} and nobody serving them.`, urgent: true });
    }
    const occ = g.occasion;
    const loose = g.visitors.filter((v) => v.fancy && !v.noted).length;
    if (loose > 0) out.push({ text: `${loose === 1 ? "A guest has" : `${loose} guests have`} taken a fancy to something. Click the 💭 and it is brought next, counting threefold.`, urgent: false });
    if (occ && occ.grace === 0 && occ.t > 8) out.push({ text: "No Grace served yet: Comfort × nothing is nothing.", urgent: true });
    if (occ && occ.comfort === 0 && occ.t > 8) out.push({ text: "No Comfort served yet: Grace × nothing is nothing.", urgent: true });
    return out.slice(0, MAX_LINES);
  }

  if (live) {
    for (const shop of roomsOfKind(g, "shop")) {
      if (present(g, shop).length >= 2 && !staffed(shop.id) && shop.device !== "till") out.push({ text: "Customers are waiting and nobody is at the counter.", urgent: true });
    }
    for (const room of receptionRooms(g)) {
      if (present(g, room).some((v) => v.kind === "patron") && !g.maids.some((m) => m.room === room.id && !m.isLord && !m.away)) out.push({ text: `A patron is waiting in the ${ROOM_DEFS[room.kind].name.toLowerCase()} with nobody to serve.`, urgent: false });
    }
    const fancies = g.visitors.filter((v) => v.kind === "patron" && v.fancy && !v.noted).length;
    if (fancies > 0) out.push({ text: "A patron at a tea table fancies something more. Click the 💭 and it is brought to her, at three times the price.", urgent: false });
    const LOST_WORTH_SAYING = 6;
    if (g.today.lost >= LOST_WORTH_SAYING && g.today.lost * 2 > g.today.sold) out.push({ text: `${g.today.lost} callers have gone away unserved today. That costs Renown. A second counter, a till, or fewer things on sale would help.`, urgent: false });
    for (const m of g.maids) {
      if (m.away) continue;
      if (/needs|no coin|nothing on the rota/.test(m.status)) out.push({ text: `${MAID_DEFS[m.id].name}: ${m.status}.`, urgent: true });
    }
  }
  // The first days: say the two things a new household gets wrong.
  const shops = roomsOfKind(g, "shop");
  const unmanned = shops.length > 0 && shops.every((s) => !staffed(s.id) && s.device !== "till");
  if (unmanned && (g.phase === "morning" || g.phase === "day") && present(g, shops[0]).length < 2) {
    const helpers = g.maids.filter((m) => !m.isLord && !m.away).length;
    out.push({ text: helpers < 2 ? "Nobody is at the shop counter. Until there is another maid, the Master could mind it: drag him there." : "Nobody is at the shop counter.", urgent: false });
  }
  if (g.day <= 2 && g.upcoming && !has("grace") && !g.rooms.some((r) => r.rota.includes("tea")) && g.phase !== "offers") {
    out.push({ text: "The kitchen is only making bread. Click it and put tea on its rota as well: guests will want Grace as well as Comfort.", urgent: false });
  }
  const idle = g.maids.filter((m) => !m.away && m.room === null);
  if (idle.length > 0 && g.phase !== "offers") out.push({ text: `${idle.map((m) => MAID_DEFS[m.id].name).join(" and ")} ${idle.length > 1 ? "have" : "has"} no post. Drag ${idle.length > 1 ? "them" : idle[0].isLord ? "him" : "her"} to a room.`, urgent: live });
  if (g.upcoming && isOccasionDay(g) && g.phase !== "offers" && g.phase !== "result" && !g.maids.some((m) => m.isLord && g.rooms.some((r) => r.id === m.room && isReception(r.kind)))) {
    out.push({ text: "Guests sit with the Master first, and Grace counts double where he hosts. He can go to the parlour whenever you like — the evening starts at dusk.", urgent: false });
  }
  if (g.spareDevices.some((id) => id !== "lantern" && id !== "firerod" && id !== "oilskin")) out.push({ text: "An invention is waiting to be installed.", urgent: false });

  if (g.upcoming) {
    const soon = daysToOccasion(g) <= 1;
    const twist = g.upcoming.twist;
    if (soon && !has("grace")) out.push({ text: `No Grace in the house (tea, cake, posies…). ${g.upcoming.name} scores Comfort × Grace.`, urgent: isOccasionDay(g) });
    if (soon && !has("comfort")) out.push({ text: `No Comfort in the house (bread, stew, pie…). ${g.upcoming.name} scores Comfort × Grace.`, urgent: isOccasionDay(g) });
    if (soon && receptionRooms(g).length === 0) out.push({ text: "There is nowhere to seat guests: no parlour or dining room.", urgent: true });
    if (twist === "candlelight" && (stock.candle ?? 0) === 0) out.push({ text: "Lady Lucia dines by candlelight, and there are no candles in the house.", urgent: soon });
    if (twist === "gourmet" && !Object.entries(stock).some(([good, n]) => n > 0 && GOODS[good].value >= 5)) out.push({ text: "The gourmet will not notice bread or plain tea, and the house has nothing better.", urgent: soon });
    const seats = g.rooms.reduce((a, r) => a + (isReception(r.kind) ? ROOM_DEFS[r.kind].seats : 0), 0);
    if (seats > 0 && seats < g.upcoming.guests) out.push({ text: `${g.upcoming.guests} guests are coming and there are ${seats} seats. The rest will stand in the hall, unserved.`, urgent: false });
  }
  return out.slice(0, MAX_LINES);
};
