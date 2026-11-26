import { GOODS } from "./content/house";
import { DEVICES } from "./content/devices";
import { MAID_DEFS } from "./content/people";
import { SITES } from "./content/world";
import { HALL_X, addStock, logLine, maidById, rand, randInt, store, takeAnywhere, traitOf } from "./house";
import { DECIDE_SECONDS, HURT_DAYS, PACK_SLOTS, STEP_SECONDS, TRAVEL_SECONDS } from "./tuning";
import type { Expedition, Game, Stock } from "./types";

// Sending someone out is a wager, not a timer. She arrives, takes what is at the edge, and then
// each further step is the player's call: more, and better, at a risk that is shown before it is
// taken. Food in the pack is a second chance; the right invention halves the danger.

const lootAt = (g: Game, exp: Expedition): Stock => {
  const depth = SITES[exp.site].depths[exp.depth];
  const found: Stock = {};
  for (const [good, lo, hi] of depth.loot) addStock(found, good, randInt(g, lo, hi));
  return found;
};

const describe = (found: Stock): string =>
  Object.entries(found)
    .map(([good, n]) => `${n} ${GOODS[good].glyph}`)
    .join(" ");

const riskAt = (exp: Expedition, depth: number): number => {
  const site = SITES[exp.site];
  if (depth >= site.depths.length) return 0;
  const base = site.depths[depth].risk;
  return site.key && exp.pack.includes(site.key) ? base / 2 : base;
};

/** Rations: food packed for the road. One is eaten to shrug off one mishap. */
const rationIndex = (exp: Expedition): number => exp.pack.findIndex((item) => GOODS[item] !== undefined);

export const canSend = (g: Game): boolean => g.phase === "morning" && (g.expedition === null || g.expedition.state === "home");

/** Why an expedition cannot be sent right now, or null if it can. */
export const whyNotSend = (g: Game, maidId: string): string | null => {
  if (g.phase !== "morning") return "expeditions set out in the morning, before the house opens";
  if (g.expedition && g.expedition.state !== "home") return "someone is already out";
  const maid = g.maids.find((m) => m.id === maidId);
  if (!maid) return "nobody of that name";
  if (maid.isLord) return "the Master does not go";
  if (maid.away) return `${MAID_DEFS[maidId].name} is away`;
  return null;
};

export const sendExpedition = (g: Game, maidId: string, siteId: string, pack: string[]): boolean => {
  if (!canSend(g) || !SITES[siteId]) return false;
  const maid = maidById(g, maidId);
  if (maid.isLord || maid.away) return false;
  const packed: string[] = [];
  for (const item of pack.slice(0, PACK_SLOTS)) {
    if (GOODS[item] && GOODS[item].pole === "comfort") {
      if (takeAnywhere(g, item, 1) === 1) packed.push(item);
    } else if (DEVICES[item] && DEVICES[item].fits === "pack" && g.spareDevices.includes(item)) packed.push(item);
  }
  maid.away = true;
  maid.room = null;
  maid.plan = [];
  g.expedition = { maid: maidId, site: siteId, pack: packed, depth: -1, haul: {}, timer: TRAVEL_SECONDS, state: "travelling", hurt: false, log: [], nextRisk: 0 };
  logLine(g, `${MAID_DEFS[maidId].name} set out for ${SITES[siteId].name.toLowerCase()}.`);
  return true;
};

const arriveAtDepth = (g: Game, exp: Expedition): void => {
  const site = SITES[exp.site];
  const found = lootAt(g, exp);
  for (const [good, n] of Object.entries(found)) addStock(exp.haul, good, n);
  exp.log.push(`${site.depths[exp.depth].text} Found ${describe(found)}.`);
  if (exp.depth + 1 >= site.depths.length) {
    exp.log.push("There is no further to go. She turns for home.");
    exp.state = "returning";
    exp.timer = TRAVEL_SECONDS;
    return;
  }
  exp.nextRisk = riskAt(exp, exp.depth + 1);
  exp.state = "deciding";
  exp.timer = DECIDE_SECONDS;
};

const mishap = (g: Game, exp: Expedition): void => {
  const site = SITES[exp.site];
  const maid = maidById(g, exp.maid);
  const hazard = site.depths[exp.depth + 1].hazard;
  if (traitOf(maid) === "forager" && !exp.log.some((l) => l.includes("knew better"))) {
    exp.log.push(`${hazard} But she knew better, and went round.`);
    exp.depth += 1;
    arriveAtDepth(g, exp);
    return;
  }
  const ration = rationIndex(exp);
  if (ration >= 0) {
    const eaten = exp.pack.splice(ration, 1)[0];
    exp.log.push(`${hazard} She sat down, ate the ${GOODS[eaten].name.toLowerCase()}, and felt equal to it after all.`);
    exp.depth += 1;
    arriveAtDepth(g, exp);
    return;
  }
  for (const good of Object.keys(exp.haul)) {
    exp.haul[good] = Math.floor(exp.haul[good] / 2);
    if (exp.haul[good] <= 0) delete exp.haul[good];
  }
  exp.hurt = true;
  exp.log.push(`${hazard} She is coming home with cuts and bruises, and half of what she had.`);
  exp.state = "returning";
  exp.timer = TRAVEL_SECONDS;
};

export const pressOn = (g: Game): void => {
  const exp = g.expedition;
  if (!exp || exp.state !== "deciding") return;
  exp.state = "pressing";
  exp.timer = STEP_SECONDS;
};

export const turnBack = (g: Game): void => {
  const exp = g.expedition;
  if (!exp || exp.state !== "deciding") return;
  exp.log.push("She turns for home.");
  exp.state = "returning";
  exp.timer = TRAVEL_SECONDS;
};

const comeHome = (g: Game, exp: Expedition): void => {
  const maid = maidById(g, exp.maid);
  maid.away = false;
  maid.pos = { x: HALL_X, y: 1 };
  for (const [good, n] of Object.entries(exp.haul)) store(g, good, n);
  // Uneaten rations go back in the pantry.
  for (const item of exp.pack) if (GOODS[item]) store(g, item, 1);
  if (exp.hurt) maid.hurtDays = HURT_DAYS;
  exp.state = "home";
  const haul = describe(exp.haul);
  logLine(g, `${MAID_DEFS[exp.maid].name} is home${haul ? ` with ${haul}` : " empty-handed"}${exp.hurt ? ", hurt" : ""}.`, exp.hurt ? "bad" : "good");
};

export const stepExpedition = (g: Game, dt: number): void => {
  const exp = g.expedition;
  if (!exp || exp.state === "home") return;
  exp.timer -= dt;
  if (exp.timer > 0) return;
  if (exp.state === "travelling") {
    exp.depth = 0;
    arriveAtDepth(g, exp);
  } else if (exp.state === "deciding") {
    turnBack(g);
  } else if (exp.state === "pressing") {
    if (rand(g) < exp.nextRisk) mishap(g, exp);
    else {
      exp.depth += 1;
      arriveAtDepth(g, exp);
    }
  } else if (exp.state === "returning") {
    comeHome(g, exp);
  }
};

/** The day is over: whoever is still out is home by nightfall with what she has. */
export const finishExpeditionNow = (g: Game): void => {
  const exp = g.expedition;
  if (!exp || exp.state === "home") return;
  if (exp.state === "travelling") {
    exp.depth = 0;
    arriveAtDepth(g, exp);
  }
  comeHome(g, exp);
};
