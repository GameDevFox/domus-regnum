import { isOccasionDay } from "./calendar";
import { GOODS, RECIPES, ROOM_DEFS, isReception } from "./content/house";
import { TWIN_OF } from "./content/people";
import {
  HALL_X,
  addStock,
  count,
  hasDevice,
  hearthLevel,
  houseStock,
  maidById,
  moveToward,
  neighbours,
  pantryOf,
  rand,
  reach,
  receptionRooms,
  roomById,
  roomPos,
  roomsOfKind,
  say,
  stockTotal,
  takeReach,
  traitOf,
  travelSeconds,
} from "./house";
import { onSale, plannedMenu, spareStock } from "./larder";
import { BATH_DRAW_SECONDS, CARRY, CLIMB_SPEED, LOAD_SECONDS, PRESTOCK, SERVE_SECONDS, SHELF_CAP, SUPPLY_LOAD, WALK_SPEED } from "./tuning";
import type { Game, GoodId, Maid, RecipeId, Room, Step, Stock, Visitor, WorkAction } from "./types";
import { BATH, accepts, present, serveVisitor } from "./visitors";

// What each maid does with her time. A maid has an assignment (a room) and a short plan of
// primitive steps; when the plan runs out, the room's role decides the next one. The player never
// issues steps — only assignments, recipes and standing orders — so everything here has to read
// clearly from the outside: a maid walking to the cellar is fetching, a maid standing still has a
// reason shown over her head.

const EVELYN_BURN_BASE = 0.5;
const EVELYN_BURN_PER_LEVEL = 0.07;
const EVELYN_EXCEPTIONAL = 3;
/** Batches' worth of an ingredient fetched per trip. */
const INGREDIENT_BATCHES = 4;
const AT_ROOM = 0.02;
const SAY_CHANCE = 0.12;

const hurtFactor = (m: Maid): number => (m.hurtDays > 0 ? 0.5 : 1);

export const twinNear = (g: Game, m: Maid): boolean => {
  const other = TWIN_OF[m.id];
  if (!other || !m.room) return false;
  const sister = g.maids.find((x) => x.id === other);
  if (!sister || sister.away || !sister.room) return false;
  return neighbours(roomById(g, m.room), roomById(g, sister.room));
};

export const workSpeed = (g: Game, m: Maid): number => hurtFactor(m) * (twinNear(g, m) ? 2 : 1);
export const walkFactor = (m: Maid): number => hurtFactor(m) * (m.tool === "slippers" ? 2 : 1);
export const carryCap = (m: Maid): number => CARRY * (traitOf(m) === "strong" ? 3 : 1) * (m.tool === "tray" ? 3 : 1);

export const currentRoom = (g: Game, m: Maid): Room | null =>
  g.rooms.find((r) => Math.abs(m.pos.y - r.floor) < AT_ROOM && Math.abs(m.pos.x - (r.col + 0.5)) < AT_ROOM) ?? null;

const atRoom = (m: Maid, room: Room): boolean => Math.abs(m.pos.y - room.floor) < AT_ROOM && Math.abs(m.pos.x - (room.col + 0.5)) < AT_ROOM;

const walk = (to: Room): Step => ({ kind: "walk", to: to.id });
const work = (seconds: number, action: WorkAction): Step => ({ kind: "work", seconds, total: seconds, action });

export const burnChance = (g: Game): number => Math.max(0, EVELYN_BURN_BASE - EVELYN_BURN_PER_LEVEL * (hearthLevel(g.hearth) - 1));

/**
 * Rooms goods may be fetched from. By day: anywhere that is not itself serving, so nothing
 * ping-pongs between two sideboards. In the evening the shop is shut and may be raided, and so may
 * another reception room — but only for what its own guests will not be wanting (see `spareOn`).
 */
const isSource = (g: Game, room: Room, forRoom: Room): boolean => {
  if (room === forRoom) return false;
  if (isReception(room.kind) || room.kind === "shop") return g.phase === "occasion" && forRoom.kind !== "shop";
  return true;
};

/** How many of a good a room can give up: all of it, less what guests seated there would still take. */
const spareOn = (g: Game, room: Room, good: GoodId): number => {
  const have = count(room.shelf, good);
  if (g.phase !== "occasion" || !isReception(room.kind) || have === 0) return have;
  return Math.max(0, have - present(g, room).filter((v) => accepts(g, v, good)).length);
};

const dearest = (a: GoodId, b: GoodId): number => GOODS[b].value + GOODS[b].price - (GOODS[a].value + GOODS[a].price);

/** The best single room to fetch a set of goods from: most of what is wanted, then nearest. */
const bestSource = (g: Game, m: Maid, forRoom: Room, wanted: Stock, first?: GoodId): { room: Room; goods: Stock } | null => {
  let best: { room: Room; goods: Stock; got: number; far: number } | null = null;
  const cap = carryCap(m);
  // Dearest first, so a short trip brings the things worth most; a noticed fancy goes ahead of all.
  const ids = Object.keys(wanted).sort((a, b) => Number(b === first) - Number(a === first) || dearest(a, b));
  for (const room of g.rooms) {
    if (!isSource(g, room, forRoom)) continue;
    if (first && spareOn(g, room, first) === 0 && g.rooms.some((r) => isSource(g, r, forRoom) && spareOn(g, r, first) > 0)) continue;
    const goods: Stock = {};
    let got = 0;
    for (const good of ids) {
      const n = Math.min(wanted[good], spareOn(g, room, good), cap - got);
      if (n > 0) {
        goods[good] = n;
        got += n;
      }
    }
    if (got === 0) continue;
    const far = travelSeconds(m.pos, roomPos(room), WALK_SPEED, CLIMB_SPEED);
    if (!best || got > best.got || (got === best.got && far < best.far)) best = { room, goods, got, far };
  }
  return best ? { room: best.room, goods: best.goods } : null;
};

const fetchPlan = (src: Room, goods: Stock, home: Room): Step[] => [walk(src), { kind: "take", goods }, walk(home), { kind: "put" }];
const glyphs = (goods: Stock): string => Object.keys(goods).map((id) => GOODS[id].glyph).join("");

// ---- roles ----

const nearestOfKind = (g: Game, m: Maid, kind: Room["kind"]): Room | null => {
  let best: Room | null = null;
  let far = Infinity;
  for (const room of roomsOfKind(g, kind)) {
    const d = travelSeconds(m.pos, roomPos(room), WALK_SPEED, CLIMB_SPEED);
    if (d < far) {
      far = d;
      best = room;
    }
  }
  return best;
};

/** The next thing a room should make: of the recipes on its rota that can be made, the one the house has least of. */
const nextRecipe = (g: Game, room: Room): RecipeId | null => {
  if (room.rota.length === 0) return null;
  const makeable = room.rota.filter((id) => Object.entries(RECIPES[id].needs).every(([good, n]) => houseStock(g, good) >= n));
  if (makeable.length === 0) return room.rota[0];
  let best = makeable[0];
  for (const id of makeable) if (houseStock(g, RECIPES[id].makes) < houseStock(g, RECIPES[best].makes)) best = id;
  return best;
};

const decideProduce = (g: Game, m: Maid, room: Room): void => {
  room.recipe = nextRecipe(g, room);
  const recipe = room.recipe ? RECIPES[room.recipe] : null;
  if (!recipe) {
    m.status = "nothing on the rota";
    return;
  }
  const out = recipe.makes;
  const dumb = hasDevice(room, "dumbwaiter");
  const pantry = pantryOf(g);
  if (count(room.shelf, out) >= SHELF_CAP) {
    if (dumb && pantry) {
      addStock(pantry.shelf, out, count(room.shelf, out));
      delete room.shelf[out];
    } else {
      const shop = g.orders[out] === "sell" ? nearestOfKind(g, m, "shop") : null;
      const dest = shop ?? pantry;
      if (!dest) {
        m.status = "shelf full";
        return;
      }
      m.plan = [{ kind: "take", goods: { [out]: carryCap(m) } }, walk(dest), { kind: "put" }, walk(room)];
      m.status = `carrying ${GOODS[out].glyph} ${shop ? "to the shop" : "to the pantry"}`;
      return;
    }
  }
  for (const [good, n] of Object.entries(recipe.needs)) {
    if (reach(g, room, good) >= n) continue;
    const src = bestSource(g, m, room, { [good]: n * INGREDIENT_BATCHES });
    if (!src) {
      m.status = `needs ${GOODS[good].glyph}`;
      return;
    }
    m.plan = fetchPlan(src.room, src.goods, room);
    m.status = `fetching ${GOODS[good].glyph}`;
    return;
  }
  if (recipe.coin > 0 && room.supplies <= 0 && !dumb && pantry) {
    m.plan = [walk(pantry), work(LOAD_SECONDS, { kind: "load" }), walk(room), { kind: "supplies" }];
    m.status = "fetching provisions";
    return;
  }
  if (g.coin < recipe.coin) {
    m.status = "no coin for provisions";
    return;
  }
  // What goes into the batch is taken as it is begun, so two cooks never count on the same honey.
  for (const [good, n] of Object.entries(recipe.needs)) takeReach(g, room, good, n);
  g.coin -= recipe.coin;
  g.today.spent += recipe.coin;
  if (recipe.coin > 0 && !dumb) room.supplies = Math.max(0, room.supplies - 1);
  const quick = hasDevice(room, "everwarm") || hasDevice(room, "sunlamp") ? 2 : 1;
  m.plan = [work(recipe.seconds / quick, { kind: "batch", recipe: recipe.id })];
  m.status = `making ${GOODS[out].glyph}`;
};

/** Goods worth having on hand in a serving room when nobody is waiting. */
const standingMenu = (g: Game, room: Room): GoodId[] => {
  if (g.phase === "occasion") return g.occasion?.menu ?? [];
  const selling = onSale(g).filter((id) => room.kind === "shop" || GOODS[id].pole !== null);
  // On the day itself, a reception room lays in tonight's menu whenever it has a quiet moment.
  const staging = isReception(room.kind) && g.upcoming !== null && isOccasionDay(g);
  return staging ? [...new Set([...selling, ...plannedMenu(g)])] : selling;
};

/** The best thing on hand for a visitor: a noticed fancy first, then whatever is worth most. */
const bestOnHand = (g: Game, room: Room, v: Visitor, spare: Stock | null): GoodId | null => {
  const ok = (good: GoodId): boolean => accepts(g, v, good) && reach(g, room, good) > 0 && (spare === null || (spare[good] ?? 0) > 0);
  if (v.fancy && v.noted && ok(v.fancy)) return v.fancy;
  let best: GoodId | null = null;
  for (const good of Object.keys(GOODS)) {
    if (!ok(good)) continue;
    if (!best || GOODS[good].value > GOODS[best].value) best = good;
  }
  return best;
};

/** Goods other people are already carrying, or have set out to fetch, for this room. */
const incoming = (g: Game, room: Room, me: Maid): Stock => {
  const out: Stock = {};
  for (const other of g.maids) {
    if (other === me || other.away) continue;
    const bound = other.room === room.id || other.plan.some((s) => s.kind === "walk" && s.to === room.id);
    if (!bound) continue;
    for (const [good, n] of Object.entries(other.carrying)) addStock(out, good, n);
    for (const s of other.plan) if (s.kind === "take") for (const [good, n] of Object.entries(s.goods)) addStock(out, good, n);
  }
  return out;
};

const decideServe = (g: Game, m: Maid, room: Room): void => {
  const evening = g.phase === "occasion";
  // Guests with a noticed fancy first, then the guest of honour, then in order of arrival.
  const here = present(g, room).sort((a, b) => Number(b.noted) - Number(a.noted) || Number(b.honour) - Number(a.honour) || a.id - b.id);
  if (room.kind === "bath") {
    if (evening) {
      m.status = "keeping the water hot";
      return;
    }
    const bather = here.find((v) => v.wants.includes(BATH) && v.claimedBy === null);
    if (bather) {
      bather.claimedBy = m.id;
      m.plan = [work(BATH_DRAW_SECONDS, { kind: "serve", visitor: bather.id, good: BATH })];
      m.status = "drawing a bath";
    } else m.status = here.length > 0 ? "bath in use" : "waiting for bathers";
    return;
  }
  // By day the household's supper is not for sale; in the evening everything on the menu is served.
  const spare = evening ? null : spareStock(g);
  const quick = traitOf(m) === "toTheLetter" ? 2 : 1;
  for (const v of here) {
    if (v.busy > 0 || (v.claimedBy !== null && v.claimedBy !== m.id)) continue;
    const good = bestOnHand(g, room, v, spare);
    if (!good) continue;
    v.claimedBy = m.id;
    m.plan = [work(SERVE_SECONDS / quick, { kind: "serve", visitor: v.id, good })];
    m.status = `serving ${GOODS[good].glyph}`;
    return;
  }
  // Nothing on hand that anyone wants: fetch what is wanted.
  const wanted: Stock = {};
  let first: GoodId | undefined;
  for (const v of here) {
    for (const good of evening ? (g.occasion?.menu ?? []) : [...new Set([...v.wants, ...(v.fancy && v.noted ? [v.fancy] : [])])]) {
      if (!accepts(g, v, good) || (spare !== null && (spare[good] ?? 0) <= 0)) continue;
      wanted[good] = (wanted[good] ?? 0) + (v.kind === "order" ? v.wants.length : 1);
    }
    if (v.fancy && v.noted && !first && reach(g, room, v.fancy) === 0) first = v.fancy;
  }
  // What is already on its way here in somebody else's hands need not be fetched twice.
  const coming = incoming(g, room, m);
  for (const good of Object.keys(wanted)) {
    wanted[good] -= reach(g, room, good) + (coming[good] ?? 0);
    if (wanted[good] <= 0) delete wanted[good];
  }
  if (first && wanted[first] === undefined) first = undefined;
  if (Object.keys(wanted).length > 0) {
    const src = bestSource(g, m, room, wanted, first);
    if (src) {
      m.plan = fetchPlan(src.room, src.goods, room);
      m.status = `fetching ${glyphs(src.goods)}`;
      return;
    }
  }
  // A quiet moment: lay in what is likely to be asked for.
  const lay: Stock = {};
  for (const good of standingMenu(g, room)) {
    const short = PRESTOCK - reach(g, room, good);
    if (short > 0) lay[good] = short;
  }
  if (Object.keys(lay).length > 0 && !hasDevice(room, "dumbwaiter")) {
    const src = bestSource(g, m, room, lay);
    if (src) {
      m.plan = fetchPlan(src.room, src.goods, room);
      m.status = "stocking up";
      return;
    }
  }
  m.status = here.some((v) => v.busy <= 0) ? "nothing to serve" : "";
};

/** In the evening the runner keeps the reception rooms supplied, so whoever is serving need not leave. */
const runEvening = (g: Game, m: Maid, pantry: Room): void => {
  const menu = g.occasion?.menu ?? [];
  const cap = carryCap(m);
  let best: { to: Room; wanted: Stock; need: number } | null = null;
  for (const to of receptionRooms(g)) {
    if (hasDevice(to, "dumbwaiter")) continue;
    const guests = present(g, to).filter((v) => v.kind === "guest");
    const wanted: Stock = {};
    let need = 0;
    for (const good of menu) {
      const short = guests.filter((v) => accepts(g, v, good)).length - count(to.shelf, good);
      if (short > 0) {
        wanted[good] = short;
        need += short;
      }
    }
    if (need > 0 && (!best || need > best.need)) best = { to, wanted, need };
  }
  if (best) {
    const src = bestSource(g, m, best.to, best.wanted);
    if (src) {
      m.plan = [walk(src.room), { kind: "take", goods: src.goods }, walk(best.to), { kind: "put" }];
      m.status = `running ${glyphs(src.goods)} up to the ${ROOM_DEFS[best.to.kind].name.toLowerCase()}`;
      void cap;
      return;
    }
  }
  if (!atRoom(m, pantry)) m.plan = [walk(pantry)];
  m.status = "";
};

/** The pantry maid is the runner: provisions out, finished goods to the shop or the cellar. */
const decideRun = (g: Game, m: Maid, pantry: Room): void => {
  if (g.phase === "occasion") {
    runEvening(g, m, pantry);
    return;
  }
  const staffed = (room: Room): boolean => g.maids.some((x) => !x.away && x.room === room.id);
  for (const room of g.rooms) {
    if (ROOM_DEFS[room.kind].role !== "produce" || !room.recipe || hasDevice(room, "dumbwaiter")) continue;
    if (RECIPES[room.recipe].coin > 0 && room.supplies <= 1 && staffed(room)) {
      m.plan = [walk(pantry), work(LOAD_SECONDS, { kind: "load" }), walk(room), { kind: "supplies" }];
      m.status = "taking up provisions";
      return;
    }
  }
  const cap = carryCap(m);
  const shops = roomsOfKind(g, "shop");
  let best: { from: Room; to: Room; goods: Stock; got: number } | null = null;
  for (const from of g.rooms) {
    if (ROOM_DEFS[from.kind].role !== "produce" && from !== pantry) continue;
    for (const to of [pantry, ...shops]) {
      if (to === from) continue;
      const goods: Stock = {};
      let got = 0;
      for (const [good, n] of Object.entries(from.shelf)) {
        const selling = g.orders[good] === "sell";
        const isInput = from.recipe ? RECIPES[from.recipe].needs[good] !== undefined : false;
        if (isInput && from !== pantry) continue;
        let take = 0;
        if (to.kind === "shop") take = selling ? Math.min(n, SHELF_CAP - count(to.shelf, good)) : 0;
        else take = !selling || shops.length === 0 ? n : 0;
        take = Math.min(take, cap - got);
        if (take > 0) {
          goods[good] = take;
          got += take;
        }
      }
      if (got > 0 && (!best || got > best.got)) best = { from, to, goods, got };
    }
  }
  // Don't bother with a trip for a crumb.
  if (best && best.got >= 2) {
    m.plan = [walk(best.from), { kind: "take", goods: best.goods }, walk(best.to), { kind: "put" }, walk(pantry)];
    m.status = `running ${glyphs(best.goods)} to the ${ROOM_DEFS[best.to.kind].name.toLowerCase()}`;
    return;
  }
  m.status = "";
};

const decide = (g: Game, m: Maid): void => {
  m.status = "";
  if (!m.room) {
    m.status = "unassigned";
    return;
  }
  const room = roomById(g, m.room);
  if (!atRoom(m, room)) {
    m.plan = [walk(room)];
    return;
  }
  if (stockTotal(m.carrying) > 0) {
    m.plan = [{ kind: "put" }];
    return;
  }
  if (g.phase !== "day" && g.phase !== "occasion") return;
  const role = ROOM_DEFS[room.kind].role;
  if (m.isLord && isReception(room.kind)) {
    m.status = "hosting";
    return;
  }
  if (g.phase === "occasion" && role !== "serve" && role !== "perform" && role !== "run") {
    m.status = "the kitchens are closed";
    return;
  }
  if (role === "produce") decideProduce(g, m, room);
  else if (role === "serve") decideServe(g, m, room);
  else if (role === "run") decideRun(g, m, room);
  else if (role === "research") {
    if (m.isLord) {
      m.plan = [work(1, { kind: "research" })];
      m.status = "at work";
    } else m.status = traitOf(m) === "bookish" ? "assisting" : "tidying the laboratory";
  } else if (role === "perform") {
    if (!m.isLord) {
      m.plan = [work(1, { kind: "perform" })];
      m.status = "playing";
    } else m.status = "does not play";
  } else m.status = "nothing to do here";
};

// ---- stepping ----

const complete = (g: Game, m: Maid, action: WorkAction): void => {
  const room = currentRoom(g, m);
  if (!room) return;
  if (action.kind === "batch") {
    const recipe = RECIPES[action.recipe];
    let mult = 1;
    if (traitOf(m) === "fiftyFifty" && room.kind === "kitchen") {
      // Never two disasters running: after a burnt batch the next comes out right.
      const burnt = !m.burntLast && rand(g) < burnChance(g);
      m.burntLast = burnt;
      mult = burnt ? 0 : EVELYN_EXCEPTIONAL;
      say(g, m, burnt ? "burnt" : "perfect");
    }
    if (traitOf(m) === "greenThumb" && room.kind === "conservatory") mult *= 2;
    const made = recipe.batch * mult;
    addStock(room.shelf, recipe.makes, made);
    g.today.made += made;
  } else if (action.kind === "serve") {
    const v = g.visitors.find((x) => x.id === action.visitor);
    if (!v || v.leaving >= 0) return;
    if (action.good === BATH) {
      serveVisitor(g, room, m, v, BATH, 1);
      return;
    }
    // An order is filled as far as the counter and the larder allow, all at once.
    const wantCount = v.kind === "order" ? v.wants.filter((w) => w === action.good).length : 1;
    const allowed = g.phase === "occasion" ? wantCount : Math.min(wantCount, spareStock(g)[action.good] ?? 0);
    const got = takeReach(g, room, action.good, allowed);
    if (got < 1) {
      v.claimedBy = null;
      return;
    }
    serveVisitor(g, room, m, v, action.good, got);
    if (rand(g) < SAY_CHANCE) say(g, m, "serve");
  } else if (action.kind === "research") {
    const helper = g.maids.some((x) => !x.isLord && !x.away && x.room === room.id && atRoom(x, room) && traitOf(x) === "bookish");
    g.research += helper ? 2 : 1;
  }
};

const stepMaid = (g: Game, m: Maid, dt: number): void => {
  if (m.away) return;
  if (m.sayLeft > 0) m.sayLeft -= dt;
  if (m.plan.length === 0) decide(g, m);
  if (!m.room && m.plan.length === 0) {
    // Unassigned staff wait in the ground-floor hall.
    moveToward(m.pos, { x: HALL_X, y: 1 }, dt, WALK_SPEED * walkFactor(m), CLIMB_SPEED * walkFactor(m));
    return;
  }
  // Instant steps chain within one tick; a walk or a spell of work ends the tick.
  for (let guard = 0; guard < 6 && m.plan.length > 0; guard++) {
    const step = m.plan[0];
    if (step.kind === "walk") {
      const arrived = moveToward(m.pos, roomPos(roomById(g, step.to)), dt, WALK_SPEED * walkFactor(m), CLIMB_SPEED * walkFactor(m));
      if (arrived) m.plan.shift();
      return;
    }
    if (step.kind === "work") {
      step.seconds -= dt * workSpeed(g, m);
      if (step.seconds > 0) return;
      m.plan.shift();
      complete(g, m, step.action);
      return;
    }
    const room = currentRoom(g, m);
    if (step.kind === "take" && room) {
      let space = carryCap(m) - stockTotal(m.carrying);
      for (const [good, n] of Object.entries(step.goods)) {
        const got = takeReach(g, room, good, Math.min(n, space));
        addStock(m.carrying, good, got);
        space -= got;
      }
    } else if (step.kind === "put") {
      const dest = room ?? pantryOf(g);
      if (dest) for (const [good, n] of Object.entries(m.carrying)) addStock(dest.shelf, good, n);
      m.carrying = {};
    } else if (step.kind === "supplies" && room) {
      room.supplies += SUPPLY_LOAD;
    }
    m.plan.shift();
  }
};

export const stepMaids = (g: Game, dt: number): void => {
  for (const m of g.maids) stepMaid(g, m, dt);
};

/** Send a maid to a room (or to the hall). Whatever she was doing is dropped. */
export const assign = (g: Game, maidId: string, roomId: string | null): void => {
  const m = maidById(g, maidId);
  if (m.away) return;
  for (const v of g.visitors) if (v.claimedBy === m.id) v.claimedBy = null;
  // A batch abandoned half-made gives back what went into it.
  const step = m.plan[0];
  const here = currentRoom(g, m);
  if (step && step.kind === "work" && step.action.kind === "batch" && here) {
    const recipe = RECIPES[step.action.recipe];
    for (const [good, n] of Object.entries(recipe.needs)) addStock(here.shelf, good, n);
    g.coin += recipe.coin;
    g.today.spent -= recipe.coin;
    if (recipe.coin > 0 && !hasDevice(here, "dumbwaiter")) here.supplies += 1;
  }
  m.plan = [];
  m.room = roomId;
  m.status = "";
};
