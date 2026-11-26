import { burnChance, carryCap, twinNear } from "./agents";
import { occasionOver } from "./calendar";
import { HIRED, hiredCost, isHired } from "./content/hired";
import { GOODS, RECIPES, ROOM_DEFS, recipesFor } from "./content/house";
import { DEVICES } from "./content/devices";
import { MAID_DEFS, TRAITS } from "./content/people";
import { OCCASIONS, SITES, TWISTS } from "./content/world";
import { daysToOccasion, donationCost, epilogue, invitations, isOccasionDay, occasionScore, par, standing } from "./flow";
import { forecast } from "./forecast";
import { allStock, hearthLevel, hearthNext } from "./house";
import { household, perGuest, plannedMenu, supperForecast } from "./larder";
import { rerollCost, researchNeeded } from "./offers";
import { DAY_SECONDS, DONATION_HEARTH, GENEROUS_HEARTH, WAGE } from "./tuning";
import type { Game, Offer, Room, Stock, Visitor } from "./types";
import { BATH, isRush, present } from "./visitors";

// The whole game as plain text, for the command-line player and for anyone reading a transcript.

const stockLine = (stock: Stock): string =>
  Object.entries(stock)
    .filter(([, n]) => n > 0)
    .map(([good, n]) => `${GOODS[good].glyph}${n}`)
    .join(" ") || "—";

/** The name a room goes by on the command line: its kind, numbered when there are several. */
export const roomLabel = (g: Game, room: Room): string => {
  // Once there are two of a kind each goes by its id, which never changes as rooms are added.
  const same = g.rooms.filter((r) => r.kind === room.kind);
  return same.length > 1 ? `${room.kind}-${room.id}` : room.kind;
};

const goodLine = (id: string): string => {
  const def = GOODS[id];
  return `${def.glyph} ${def.name}${def.pole ? ` (${def.pole} ${def.value}, sells ${def.price})` : ` (ingredient, sells ${def.price})`}`;
};

const recipeLine = (id: string): string => {
  const r = RECIPES[id];
  const needs = Object.entries(r.needs).map(([good, n]) => `${n}${GOODS[good].glyph}`).join("+");
  return `${id}→${goodLine(r.makes)}${needs ? ` needs ${needs}` : ""}`;
};

const offerLine = (o: Offer): string => {
  if (o.kind === "hire") return `HIRE ${MAID_DEFS[o.ref].name} — ${TRAITS[MAID_DEFS[o.ref].trait].effect}`;
  if (o.kind === "room") return `ROOM ${ROOM_DEFS[o.ref as Room["kind"]].name} — ${ROOM_DEFS[o.ref as Room["kind"]].blurb}`;
  if (o.kind === "recipe") return `RECIPE ${recipeLine(o.ref)} — ${GOODS[RECIPES[o.ref].makes].note}`;
  if (o.kind === "luxury") return `GROCER'S VAN ${o.qty} × ${goodLine(o.ref)} — ${GOODS[o.ref].note} Enough for every guest; set by as Keep.`;
  return `WING open the ${o.ref} wing — four more rooms`;
};

const score = (n: number): string => Math.round(n).toLocaleString("en-US");

const visitorLine = (v: Visitor): string => {
  if (v.kind === "guest") return `guest#${v.id}${v.honour ? "(honour)" : ""} had ${v.had.length}${v.fancy ? ` FANCIES ${GOODS[v.fancy].glyph}${v.noted ? "(noted)" : ` (${v.fancyLeft.toFixed(0)}s — "note ${v.id}")`}` : ""}`;
  if (v.kind === "order") return `ORDER for ${v.wants.length}×${GOODS[v.wants[0]]?.glyph ?? "?"} at double price (${v.patience.toFixed(0)}s left)`;
  const fancy = v.fancy ? ` and FANCIES ${GOODS[v.fancy].glyph} too${v.noted ? " (noted)" : ` (${v.fancyLeft.toFixed(0)}s — "note ${v.id}", three times the price)`}` : "";
  if (v.wants.length === 0) return `patron#${v.id} finishing${fancy}`;
  return `${v.kind}#${v.id} wants ${v.wants.map((w) => (w === BATH ? "🛁" : GOODS[w].glyph)).join("")}${fancy}`;
};

export const render = (g: Game): string => {
  const out: string[] = [];
  const level = hearthLevel(g.hearth);
  const next = hearthNext(g.hearth);
  const stock = allStock(g);
  out.push(`=== Day ${g.day} · chapter ${g.chapter}, day ${g.chapterDay} · phase: ${g.phase.toUpperCase()}${g.phase === "day" ? ` · ${g.t.toFixed(0)}/${DAY_SECONDS}s${isRush(g.t) ? " (MIDDAY RUSH)" : ""}` : ""} ===`);
  out.push(`Coin ${g.coin} · Hearth ×${level} (${g.hearth}${next ? `/${next}` : ""} points) · Renown ${g.renown} (each point brings more walk-ins)`);
  if (g.upcoming && !occasionOver(g)) {
    const d = daysToOccasion(g);
    out.push(`OCCASION: ${g.upcoming.name} — ${g.upcoming.guests} guests, target ${score(g.upcoming.target)} — ${isOccasionDay(g) ? "TONIGHT, at the end of this day" : d === 1 ? "TOMORROW evening (the end of the next day)" : `the evening of chapter day ${g.chapterDay + d} (today is chapter day ${g.chapterDay})`}`);
    out.push(`  Guest of honour: ${g.upcoming.honourName}. ${TWISTS[g.upcoming.twist].name}: ${TWISTS[g.upcoming.twist].rule}`);
    out.push(`  Score = Comfort × Grace × Hearth level. Each guest takes each kind on the menu once. Guests sit in the Master's room first.`);
    out.push(`  MENU (everything worth serving, unless struck off with "menu <good> off"): ${(g.occasion ? g.occasion.menu : plannedMenu(g, stock)).map((id) => GOODS[id].glyph).join("") || "nothing in the house"} · set aside for the guests and never sold or eaten: ${g.upcoming.guests * perGuest(g)} of each`);
    const f = forecast(g, "evening");
    const now = forecast(g, "now");
    if (f && g.phase !== "occasion") out.push(`  FORECAST if the whole menu were served, with the household posted for the evening (the Master hosting, Evelyn beside him): Comfort ${score(f.comfort)} × Grace ${score(f.grace)} × Hearth ${f.hearth} = ${score(f.score)} (${f.kinds.length} kinds, ${f.seated} seated${f.standing ? `, ${f.standing} STANDING unserved` : ""}, ${f.litRooms}/${f.rooms} rooms candle-lit, ${f.servings} servings to carry). Posted exactly as they are this minute it would be ${score(now?.score ?? 0)}. Fancies caught come on top.`);
  }
  if (g.phase === "invite") {
    out.push("INVITATIONS on the table:");
    for (const o of invitations(g)) out.push(`  [${o.grade}] ${o.name}: ${o.guests} guests, target ${score(o.target)}${o.target > (OCCASIONS.find((x) => x.id === o.id)?.target ?? o.target) ? ` — RAISED from the usual ${score(OCCASIONS.find((x) => x.id === o.id)?.target ?? 0)}, because the county has heard what this house can do` : ""} (${g.results.length ? `last time the house scored ${score(g.results[g.results.length - 1].score)}; on that form it might manage about ${score(par(g, o.chapter))} this time` : "a first occasion usually scores somewhere between 500 and 20,000"}; twice the target is a triumph). ${TWISTS[o.twist].name}: ${TWISTS[o.twist].rule} ${o.intro}`);
  }
  if (g.occasion) {
    const occ = g.occasion;
    out.push(`THE EVENING: ${occ.t.toFixed(0)}/${occ.length}s · Comfort ${score(occ.comfort)} × Grace ${score(occ.grace)} × Hearth ${occ.done ? occ.level : level} = ${score(occasionScore(g))} / target ${score(occ.def.target)}${occ.tier ? ` → ${occ.tier.toUpperCase()}` : ""} · ${occ.served} servings, ${occ.fancies} fancies caught (×3 each)`);
  }
  out.push("ROOMS (floor 0 = cellar):");
  for (let floor = 3; floor >= 0; floor--) {
    for (const room of g.rooms.filter((r) => r.floor === floor)) {
      if (room.kind === "closed") continue;
      const def = ROOM_DEFS[room.kind];
      const here = g.maids.filter((m) => m.room === room.id && !m.away).map((m) => MAID_DEFS[m.id].name);
      const vis = present(g, room);
      const bits = [`  f${floor} ${roomLabel(g, room).padEnd(13)} [${room.id}]`];
      if (room.recipe) bits.push(`making ${GOODS[RECIPES[room.recipe].makes].glyph}`);
      if (def.role === "produce") bits.push(`rota: ${room.rota.join("+") || "EMPTY"} (can make: ${recipesFor(room.kind, g.recipes).map((r) => r.id).join("/")})`);
      if (room.device) bits.push(`[${DEVICES[room.device].name}]`);
      if (def.seats) bits.push(`${def.seats} seats`);
      bits.push(`shelf: ${stockLine(room.shelf)}`);
      if (here.length) bits.push(`staff: ${here.join(", ")}`);
      if (vis.length) bits.push(`visitors: ${vis.map(visitorLine).join("; ")}`);
      out.push(bits.join(" · "));
    }
  }
  out.push("HOUSEHOLD:");
  for (const m of g.maids) {
    const def = MAID_DEFS[m.id];
    const lent = g.lent?.maid === m.id;
    const where = lent ? "LENT OUT" : m.away ? "AWAY" : m.room ? roomLabel(g, g.rooms.find((r) => r.id === m.room) as Room) : "unassigned";
    const extra = m.id === "evelyn" ? ` (burns ${Math.round(burnChance(g) * 100)}% of batches)` : twinNear(g, m) ? " (sister near: ×2 now)" : "";
    out.push(`  ${m.id.padEnd(9)} ${where.padEnd(13)} ${m.away ? "" : m.status || "…"}${m.hurtDays > 0 ? ` [HURT ${m.hurtDays}d: half speed]` : ""}${m.tool ? ` [${DEVICES[m.tool].name}]` : ""} — ${TRAITS[def.trait].effect}${extra} carries ${carryCap(m)}`);
  }
  out.push(`STOCK: ${stockLine(stock)}`);
  const have = Object.keys(GOODS).filter((id) => (stock[id] ?? 0) > 0);
  out.push(`ORDERS: sell ${have.filter((id) => g.orders[id] === "sell").map((id) => GOODS[id].glyph).join("") || "—"} · keep ${have.filter((id) => g.orders[id] === "keep").map((id) => GOODS[id].glyph).join("") || "—"} (the guests' share and the household's supper are never sold, whatever the order)`);
  const table = supperForecast(g, stock);
  const heads = household(g);
  out.push(`SUPPER plan: ${g.supperPlan} (feast = one of every food there are ${heads} of, one each) → tonight ${table.length ? `${table.map((d) => GOODS[d].glyph).join("")} (Hearth +${table.length})` : "nothing (Hearth +0)"} · WAGES: ${g.wages} (${WAGE[g.wages]} coin per maid a night${g.wages === "generous" ? `, Hearth +${GENEROUS_HEARTH}` : ""})`);
  out.push(`RECIPES KNOWN: ${g.recipes.map(recipeLine).join(" | ")}`);
  out.push(`LAB: research ${g.research}/${researchNeeded(g)}s${g.spareDevices.length ? ` · spare devices: ${g.spareDevices.map((id) => `${id} (${DEVICES[id].effect})`).join("; ")}` : ""}`);
  if (g.pending.length) {
    const p = g.pending[0];
    if (p.kind === "invention") out.push(`CHOOSE AN INVENTION: ${p.options.map((id, i) => `(${i + 1}) ${DEVICES[id].name} — ${DEVICES[id].effect} [fits: ${Array.isArray(DEVICES[id].fits) ? (DEVICES[id].fits as string[]).join("/") : DEVICES[id].fits}]`).join("  ")}`);
    else if (p.kind === "gift") out.push(`GIFT: ${p.text} ("choose 1" to go on)`);
    else out.push(`SCENE — ${p.title}: ${p.text} ("choose 1" to go on)`);
  }
  if (g.upcoming && !occasionOver(g)) out.push(`ENGAGED FOR THE OCCASION: ${(g.hired ?? []).join(", ") || "nobody"} · on offer ("engage <id>", any time before the evening): ${HIRED.filter((h) => !isHired(g, h.id)).map((h) => `${h.id} ${hiredCost(g, h.id)} coin (${h.effect})`).join(" | ")}`);
  if (g.trader) out.push(`AT THE DOOR (${g.trader.left.toFixed(0)}s): ${g.trader.face} ${g.trader.text} → "trade" or "dismiss"`);
  if (g.expedition && g.expedition.state !== "home") {
    const e = g.expedition;
    out.push(`EXPEDITION: ${MAID_DEFS[e.maid].name} at ${SITES[e.site].name} — ${e.state}, haul ${stockLine(e.haul)}, pack ${e.pack.join(",") || "empty"}`);
    for (const line of e.log.slice(-2)) out.push(`    ${line}`);
    if (e.state === "deciding") out.push(`    DECIDE: "press" on (${Math.round(e.nextRisk * 100)}% chance of losing half and coming home hurt) or turn "back"? (${e.timer.toFixed(0)}s)`);
  }
  if (g.phase === "offers") {
    out.push(`OFFERS (reroll costs ${rerollCost(g)}; "donate" ${donationCost(g)} coin to the parish for Hearth +${DONATION_HEARTH}):`);
    g.offers.forEach((o, i) => out.push(`  (${i + 1}) ${o.sold ? "SOLD " : ""}${o.cost} coin — ${offerLine(o)}`));
  }
  if (g.phase === "day" || g.phase === "offers") out.push(`TODAY: sold ${g.today.sold}, went away unserved ${g.today.lost}, made ${g.today.made}, earned ${g.today.coinEarned}, spent on provisions and wages ${g.today.spent}`);
  if (g.results.length) out.push(`RESULTS: ${g.results.map((r) => `${r.occasion} [${r.grade}]: ${r.tier} (${score(r.score)}/${score(r.target)})`).join(" · ")} · Standing ${standing(g)}`);
  if (g.phase === "ended") {
    const e = epilogue(g);
    out.push(`THE SEASON IS OVER — "${e.title}". ${e.text}`);
  }
  const recent = g.log.slice(-6);
  if (recent.length) out.push("LOG:", ...recent.map((l) => `  d${l.day} ${l.text}`));
  return out.join("\n");
};
