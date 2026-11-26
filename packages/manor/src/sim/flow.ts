import { chapterLength, daysToOccasion, isOccasionDay, occasionOver } from "./calendar";
import { DEVICES } from "./content/devices";
import { HIRED_BY_ID, hiredCost, isHired } from "./content/hired";
import { GOODS } from "./content/house";
import { MAID_DEFS } from "./content/people";
import { CHAPTERS, OCCASIONS, SCENES, TWISTS } from "./content/world";
import { finishExpeditionNow } from "./expedition";
import { addStock, hearthLevel, houseStock, logLine, pantryOf, pick, takeAnywhere } from "./house";
import { household, plannedMenu, supperForecast } from "./larder";
import { addMaid, makeOffers, researchNeeded } from "./offers";
import {
  DONATION_BASE,
  DONATION_GROWTH,
  DONATION_HEARTH,
  ENDLESS_GROWTH,
  EVENING_LINGER,
  GENEROUS_HEARTH,
  OCCASION_SECONDS,
  SABBATH_HEARTH,
  SHORTFALL_HEARTH,
  STIPEND,
  TRIUMPH_FACTOR,
  WAGE,
} from "./tuning";
import type { Game, GoodId, Grade, OccasionDef, Room, Stats, Tier, Visitor } from "./types";
import { accepts, earn, seatGuests, seatingOrder, servingValue, stillHungry } from "./visitors";

// The shape of a chapter: an invitation is accepted, working days pass, the last day ends in the
// occasion, and whatever happens there decides which invitation comes next. Nothing ends the
// game: falling short costs standing and earns the household something else.

export { chapterLength, daysToOccasion, isOccasionDay };

export const emptyStats = (): Stats => ({ sold: 0, lost: 0, made: 0, coinEarned: 0, spent: 0, suppers: 0, feasts: 0 });

const ENDLESS_TWISTS = ["none", "gourmet", "register", "candlelight", "harvest", "brisk"];
const ENDLESS_GUESTS_BASE = 14;
const ENDLESS_GUESTS_STEP = 2;

/** The invitations on the table for a chapter. A grand one needs last time to have gone well. */
export const invitations = (g: Game): OccasionDef[] => {
  if (g.chapter > CHAPTERS) {
    const round = g.chapter - CHAPTERS;
    const last = OCCASIONS.find((o) => o.id === "gala") as OccasionDef;
    const twist = ENDLESS_TWISTS[(g.seed + round) % ENDLESS_TWISTS.length];
    return [
      {
        ...last,
        id: `season${round}`,
        name: `The Season Continues (${round})`,
        chapter: g.chapter,
        guests: ENDLESS_GUESTS_BASE + ENDLESS_GUESTS_STEP * round,
        target: Math.max(last.target * Math.pow(ENDLESS_GROWTH, round), round2((g.results[g.results.length - 1]?.score ?? 0) * 2)),
        honourName: "The county",
        honourFace: "🎩",
        twist,
        intro: "There is always another season.",
        gift: { kind: "coin", ref: "coin", amount: 200 * round },
      },
    ];
  }
  const all = OCCASIONS.filter((o) => o.chapter === g.chapter).map((o) => ({ ...o, target: askFor(g, o) }));
  const last = g.results.length > 0 ? g.results[g.results.length - 1].tier : "shortfall";
  // The first chapter has nothing to go on: both of its cards are on the table.
  if (g.results.length === 0) return all;
  return all.filter((o) => o.grade === "humble" || (o.grade === "grand" && last !== "shortfall") || (o.grade === "royal" && last === "triumph"));
};

// What a card asks. Each has a usual figure, but the county has heard what this house can do: a
// house that did far better than usual last time is asked for more, in proportion. Houses differ
// by a thousandfold in what they score, and one fixed ladder left most of them with no evening
// in doubt. The figure is always on the card before it is accepted.
const GROWTH_INTO_CHAPTER = [0, 0, 40, 10, 6];
const ASK_OF_PAR: Record<Grade, number> = { grand: 1 / 2, royal: 2, humble: 0 };
/** The humble card never asks more than half of what the house actually did last time. */
const HUMBLE_OF_LAST = 1 / 2;
const LATER_GROWTH = 6;

/** What a house usually manages next, on the strength of its last occasion. Zero with no history. */
export const par = (g: Game, chapter: number): number => {
  const last = g.results.length > 0 ? g.results[g.results.length - 1].score : 0;
  return last * (GROWTH_INTO_CHAPTER[chapter] ?? LATER_GROWTH);
};

/** Round to two significant figures, so a target reads as a round number. */
const round2 = (n: number): number => {
  if (n <= 0) return 0;
  const unit = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1));
  return Math.round(n / unit) * unit;
};

export const askFor = (g: Game, o: OccasionDef): number => {
  const last = g.results.length > 0 ? g.results[g.results.length - 1].score : 0;
  const ask = o.grade === "humble" ? last * HUMBLE_OF_LAST : par(g, o.chapter) * ASK_OF_PAR[o.grade];
  return Math.max(o.target, round2(ask));
};

/** Standing at the season's end: what was hosted, and how well. */
const GRADE_POINTS = { humble: 1, grand: 2, royal: 4 } as const;
export const standing = (g: Game): number =>
  g.results.reduce((sum, r) => sum + (r.tier === "shortfall" ? 0 : GRADE_POINTS[r.grade] + (r.tier === "triumph" ? 1 : 0)), 0);

export const acceptInvitation = (g: Game, grade: Grade): void => {
  const options = invitations(g);
  const def = options.find((o) => o.grade === grade) ?? options[0];
  g.upcoming = def;
  g.phase = "morning";
  logLine(g, `Accepted: ${def.name}. ${def.honourName} — ${TWISTS[def.twist].name}.`);
};

export const startDay = (g: Game): void => {
  g.phase = "day";
  g.t = 0;
  g.today = emptyStats();
  g.arrivals = {};
  g.visitors = [];
  g.trader = null;
  if (g.expedition && g.expedition.state === "home") g.expedition = null;
};

/** The working day is over: on the last day of a chapter the occasion begins, otherwise evening. */
export const endDay = (g: Game): void => {
  g.visitors = [];
  g.trader = null;
  for (const m of g.maids) m.plan = m.plan.filter((s) => s.kind === "walk" || s.kind === "put");
  finishExpeditionNow(g);
  if (isOccasionDay(g) && g.upcoming) beginOccasion(g);
  else evening(g);
};

const BRISK_FACTOR = 0.5;

const beginOccasion = (g: Game): void => {
  const def = g.upcoming as OccasionDef;
  g.occasion = {
    def,
    comfort: 0,
    grace: 0,
    t: 0,
    served: 0,
    lit: [],
    menu: plannedMenu(g),
    fancies: 0,
    idle: 0,
    length: OCCASION_SECONDS * (def.twist === "brisk" ? BRISK_FACTOR : 1),
    done: false,
    tier: null,
    score: 0,
    level: hearthLevel(g.hearth),
  };
  // Remember where everyone works by day: they go back to it once the guests have gone.
  for (const m of g.maids) m.dayRoom = m.room;
  g.phase = "occasion";
  g.t = 0;
  g.arrivals = {};
  seatGuests(g);
  // Footmen engaged for the night go to the rooms the guests are in.
  if (isHired(g, "footmen")) {
    const rooms = seatingOrder(g).filter((room) => g.visitors.some((v) => v.room === room.id));
    ["footman1", "footman2"].forEach((id, i) => {
      if (rooms.length === 0 || g.maids.some((m) => m.id === id)) return;
      const footman = addMaid(g, id);
      footman.room = rooms[i % rooms.length].id;
    });
  }
  logLine(g, `${def.name} begins.`);
};

export const occasionScore = (g: Game): number => {
  const occ = g.occasion;
  if (!occ) return 0;
  return occ.done ? occ.score : occ.comfort * occ.grace * hearthLevel(g.hearth);
};

/** The most valuable thing still in the house that this guest would take (there is one: she is still hungry). */
const bestLeft = (g: Game, v: Visitor): GoodId => {
  const room = g.rooms.find((r) => r.id === v.room) as Room;
  const options = (g.occasion?.menu ?? []).filter((good) => houseStock(g, good) > 0 && accepts(g, v, good));
  return options.sort((a, b) => servingValue(g, room, v, b) - servingValue(g, room, v, a))[0];
};

/** With nothing left on the menu that anyone would take, the carriages are called early. */
export const eveningSpent = (g: Game, dt: number): boolean => {
  const occ = g.occasion;
  if (!occ) return false;
  // Only guests somebody could serve hold the evening open: a room with nobody posted is not waiting on anything.
  const served = (roomId: string | null): boolean => g.maids.some((m) => !m.isLord && !m.away && m.room === roomId);
  const waiting = stillHungry(g).filter((v) => served(v.room) && servingValue(g, g.rooms.find((r) => r.id === v.room) as Room, v, bestLeft(g, v)) > 0);
  const quiet = waiting.length === 0 && !g.visitors.some((v) => v.busy > 0) && !g.maids.some((m) => m.plan[0]?.kind === "work" && m.plan[0].action.kind === "serve");
  // An evening at which nothing has been served yet is not over: it has not begun. Leave time to put that right.
  occ.idle = quiet && occ.served > 0 ? occ.idle + dt : 0;
  return occ.idle >= EVENING_LINGER;
};

const SUCCESS_RENOWN = 1;
const TRIUMPH_RENOWN = 2;
const KNOWN_RECIPE_COIN = 25;
const OWNED_DEVICE_COIN = 80;
const LENT_DAYS = 2;

export const finishOccasion = (g: Game): void => {
  const occ = g.occasion;
  if (!occ || occ.done) return;
  const score = occasionScore(g);
  const tier: Tier = score >= occ.def.target * TRIUMPH_FACTOR ? "triumph" : score >= occ.def.target ? "success" : "shortfall";
  occ.score = score;
  occ.level = hearthLevel(g.hearth);
  occ.done = true;
  occ.tier = tier;
  g.visitors = [];
  // The hired help goes home with the carriages.
  g.maids = g.maids.filter((m) => !MAID_DEFS[m.id].livery);
  g.hired = [];
  for (const m of g.maids) m.plan = [];
  g.results.push({ occasion: occ.def.name, grade: occ.def.grade, tier, score, target: occ.def.target });
  if (tier === "shortfall") {
    g.hearth += SHORTFALL_HEARTH;
    logLine(g, `${occ.def.name} fell short. The household sat up late in the kitchen afterwards, and were closer for it.`, "bad");
    // The rival Master wagered on the evening. Violet, over the Master's head, accepted.
    const violet = g.maids.find((m) => m.id === "violet" && !m.away);
    if (occ.def.id === "rival" && violet) {
      g.lent = { maid: "violet", days: LENT_DAYS };
      violet.away = true;
      violet.room = null;
      g.pending.push({ kind: "note", ...SCENES.violetLost });
    }
  } else {
    const gained = tier === "triumph" ? TRIUMPH_RENOWN : SUCCESS_RENOWN;
    g.favour += gained;
    g.renown += gained;
    logLine(g, tier === "triumph" ? `${occ.def.name} was a triumph. People will talk.` : `${occ.def.name} went well.`, "good");
    // A triumph sends the Master back to the laboratory with an idea.
    if (tier === "triumph") {
      g.research += researchNeeded(g);
      logLine(g, "The Master went straight from the door to the laboratory, with an idea.", "good");
    }
    const gift = occ.def.gift;
    if (gift.kind === "coin") {
      earn(g, gift.amount ?? 0);
      g.pending.push({ kind: "gift", text: `${occ.def.honourName} left a purse: ${gift.amount} coin.` });
    } else if (gift.kind === "recipe") {
      if (g.recipes.includes(gift.ref)) {
        earn(g, KNOWN_RECIPE_COIN);
        g.pending.push({ kind: "gift", text: `${occ.def.honourName} sent a recipe you already know, and ${KNOWN_RECIPE_COIN} coin with it.` });
      } else {
        g.recipes.push(gift.ref);
        const good = GOODS[gift.ref];
        g.pending.push({ kind: "gift", text: `${occ.def.honourName} sent a recipe: ${good.glyph} ${good.name}. ${good.note}` });
      }
    } else if (!g.ownedDevices.includes(gift.ref)) {
      g.ownedDevices.push(gift.ref);
      g.spareDevices.push(gift.ref);
      g.pending.push({ kind: "gift", text: `${occ.def.honourName} sent a gift: ${DEVICES[gift.ref].glyph} ${DEVICES[gift.ref].name}. ${DEVICES[gift.ref].effect} It is in the laboratory, waiting to be put somewhere.` });
    } else {
      earn(g, OWNED_DEVICE_COIN);
      g.pending.push({ kind: "gift", text: `${occ.def.honourName} left a purse: ${OWNED_DEVICE_COIN} coin.` });
    }
  }
  g.phase = "result";
};

const supper = (g: Game): void => {
  const dishes = supperForecast(g);
  const heads = household(g);
  for (const good of dishes) takeAnywhere(g, good, heads);
  g.hearth += dishes.length;
  g.lastSupper = dishes.length === 0 ? "none" : dishes.length === 1 ? "shared" : "feast";
  if (dishes.length > 1) g.stats.feasts += 1;
  else if (dishes.length === 1) g.stats.suppers += 1;
  const names = dishes.map((d) => GOODS[d].glyph).join(" ");
  if (dishes.length === 0) logLine(g, g.supperPlan === "none" ? "No supper together tonight." : `Nothing in the larder there was ${heads} of: no supper together.`, "plain");
  else logLine(g, `The household sat down together: ${names}. Hearth +${dishes.length}.`, "good");
};

const wages = (g: Game): void => {
  const staff = g.maids.filter((m) => !m.isLord && g.lent?.maid !== m.id).length;
  if (staff === 0) return;
  const plan = g.wages === "generous" && g.coin >= WAGE.generous * staff ? "generous" : "fair";
  const due = WAGE[plan] * staff;
  if (g.coin < due) {
    g.hearth = Math.max(0, g.hearth - 1);
    logLine(g, "There was not enough in the purse for wages. Nobody complained, which was worse. Hearth −1.", "bad");
    return;
  }
  g.coin -= due;
  g.today.spent += due;
  if (plan === "generous") {
    g.hearth += GENEROUS_HEARTH;
    logLine(g, `Wages paid, and generously: ${due} coin. Hearth +${GENEROUS_HEARTH}.`, "good");
  } else logLine(g, `Wages paid: ${due} coin.`);
};

/** Tidy up, eat together, pay everyone, heal, and see who and what is on offer. */
export const evening = (g: Game): void => {
  const pantry = pantryOf(g);
  if (pantry) {
    for (const room of g.rooms) {
      if (room === pantry) continue;
      for (const [good, n] of Object.entries(room.shelf)) addStock(pantry.shelf, good, n);
      room.shelf = {};
    }
    for (const m of g.maids) {
      for (const [good, n] of Object.entries(m.carrying)) addStock(pantry.shelf, good, n);
      m.carrying = {};
      m.plan = [];
    }
  }
  const before = hearthLevel(g.hearth);
  supper(g);
  wages(g);
  if (hearthLevel(g.hearth) > before) logLine(g, `The Hearth burns brighter: every occasion now counts ×${hearthLevel(g.hearth)}.`, "good");
  for (const m of g.maids) {
    if (m.hurtDays <= 0) continue;
    if (takeAnywhere(g, "elixir", 1) === 1) {
      m.hurtDays = 0;
      logLine(g, `${MAID_DEFS[m.id].name} took the elixir and is mended.`, "good");
    } else m.hurtDays -= 1;
  }
  if (g.lent) {
    g.lent.days -= 1;
    if (g.lent.days <= 0) {
      const back = g.maids.find((m) => m.id === g.lent?.maid);
      if (back) back.away = false;
      g.lent = null;
      g.renown += 1;
      g.pending.push({ kind: "note", ...SCENES.violetReturned });
    }
  }
  wordOfMouth(g);
  g.stats.sold += g.today.sold;
  g.stats.lost += g.today.lost;
  g.stats.made += g.today.made;
  g.stats.coinEarned += g.today.coinEarned;
  g.stats.spent += g.today.spent;
  g.rerolls = 0;
  g.offers = makeOffers(g);
  g.phase = "offers";
};

const GOOD_DAY_SALES = 10;
const BAD_DAY_LOST = 6;

/** A day on which nobody went away unserved is talked about; so is a day when half of them did. */
const wordOfMouth = (g: Game): void => {
  const { sold, lost } = g.today;
  if (sold >= GOOD_DAY_SALES && lost === 0) {
    g.renown += 1;
    logLine(g, "Not one caller went away unserved today. Word gets round: Renown +1.", "good");
  } else if (lost >= BAD_DAY_LOST && lost * 2 > sold && g.renown > 0) {
    g.renown -= 1;
    logLine(g, `${lost} callers went away unserved today. Word gets round: Renown −1.`, "bad");
  }
};

/** Engage help for the coming occasion. */
export const engage = (g: Game, id: string): boolean => {
  if (!HIRED_BY_ID[id] || !g.upcoming || occasionOver(g) || g.phase === "occasion" || isHired(g, id)) return false;
  const cost = hiredCost(g, id);
  if (g.coin < cost) return false;
  g.coin -= cost;
  g.hired = [...(g.hired ?? []), id];
  logLine(g, `Engaged for the occasion: ${HIRED_BY_ID[id].name.toLowerCase()}, ${cost} coin.`, "good");
  return true;
};

export const donationCost = (g: Game): number => Math.round(DONATION_BASE * Math.pow(DONATION_GROWTH, g.donations));

/** A gift to the parish: coin into Hearth, at a price that doubles each time. */
export const donate = (g: Game): boolean => {
  const cost = donationCost(g);
  if (g.phase !== "offers" || g.coin < cost) return false;
  const before = hearthLevel(g.hearth);
  g.coin -= cost;
  g.donations += 1;
  g.hearth += DONATION_HEARTH;
  logLine(g, `A gift to the parish: ${cost} coin. Hearth +${DONATION_HEARTH}.`, "good");
  if (hearthLevel(g.hearth) > before) logLine(g, `The Hearth burns brighter: every occasion now counts ×${hearthLevel(g.hearth)}.`, "good");
  return true;
};

const SABBATH_LINES = [
  "The Sabbath. The shop is shut, the range is cold, and nobody is asked for anything.",
  "The Sabbath. Evelyn reads aloud. Nobody mentions the laboratory.",
  "The Sabbath. A long walk, a late breakfast, and the bell not rung once.",
];

/** Leave the offers screen: the next morning, or — after an occasion — the Sabbath and a new chapter. */
export const nextDay = (g: Game): void => {
  g.offers = [];
  if (g.expedition && g.expedition.state === "home") g.expedition = null;
  if (isOccasionDay(g)) {
    g.phase = "sabbath";
    const before = hearthLevel(g.hearth);
    g.hearth += SABBATH_HEARTH;
    for (const m of g.maids) m.hurtDays = 0;
    logLine(g, pick(g, SABBATH_LINES));
    if (hearthLevel(g.hearth) > before) logLine(g, `The Hearth burns brighter: every occasion now counts ×${hearthLevel(g.hearth)}.`, "good");
    return;
  }
  g.occasion = null;
  g.day += 1;
  g.chapterDay += 1;
  g.coin += STIPEND;
  logLine(g, `The Crown's stipend: ${STIPEND} coin.`);
  g.phase = "morning";
};

/** After the Sabbath: the next chapter's invitations, or the end of the season. */
export const afterSabbath = (g: Game): void => {
  const finishedSeason = g.chapter === CHAPTERS && !g.endless;
  g.occasion = null;
  for (const m of g.maids) {
    if (m.dayRoom !== undefined && !m.away && g.rooms.some((r) => r.id === m.dayRoom)) m.room = m.dayRoom;
    m.dayRoom = undefined;
  }
  g.day += 2;
  g.chapter += 1;
  g.chapterDay = 1;
  g.upcoming = null;
  g.coin += STIPEND;
  g.phase = finishedSeason ? "ended" : "invite";
};

export const continueEndless = (g: Game): void => {
  g.endless = true;
  g.phase = "invite";
};

/** One line for the end of the season, by where the house ended up. */
export const epilogue = (g: Game): { title: string; text: string } => {
  const level = hearthLevel(g.hearth);
  const wins = g.results.filter((r) => r.tier !== "shortfall").length;
  const WARM = 5;
  const ADMIRED = 3;
  if (wins >= ADMIRED && level >= WARM) return SCENES.endBoth;
  if (wins >= ADMIRED) return SCENES.endAdmired;
  if (level >= WARM) return SCENES.endLoved;
  return SCENES.endBeginning;
};
