import { assign, stepMaids } from "./agents";
import { GOODS, RECIPES, ROOM_DEFS } from "./content/house";
import { ORNAMENT_BY_ID } from "./content/ornaments";
import { pressOn, sendExpedition, stepExpedition, turnBack } from "./expedition";
import { acceptInvitation, afterSabbath, continueEndless, donate, emptyStats, endDay, engage, evening, eveningSpent, finishOccasion, nextDay, startDay } from "./flow";
import { roomById } from "./house";
import { addMaid, buy, checkInvention, chooseInvention, demolish, install, reroll } from "./offers";
import { acceptTrade, dismissTrader, stepTrader } from "./trade";
import { COLS, DAY_SECONDS, EAST_WING_COL, FLOORS, PAPER_COST, STAIR_COL, START_COIN, TICK, WEST_WING_COL } from "./tuning";
import type { Command, Game, Order, Room, RoomKind } from "./types";
import { noteFancy, spawnDayVisitors, stepFancies, stepSamovars, stepTills, stepVisitors } from "./visitors";

// The public face of the sim: make a game, step it, send it commands.

/** The house as the season opens: [floor][inner-left, inner-right]. Floor 0 is the cellar. */
const START_ROOMS: [RoomKind, RoomKind][] = [
  ["pantry", "empty"],
  ["kitchen", "shop"],
  ["parlour", "empty"],
  ["lab", "empty"],
];
const INNER_LEFT_COL = 1;

export const roomId = (floor: number, col: number): string => `r${floor}${col}`;

const makeRooms = (): Room[] => {
  const rooms: Room[] = [];
  for (let floor = 0; floor < FLOORS; floor++) {
    for (let col = 0; col < COLS; col++) {
      if (col === STAIR_COL) continue;
      const wing = col === WEST_WING_COL || col === EAST_WING_COL;
      const kind: RoomKind = wing ? "closed" : START_ROOMS[floor][col === INNER_LEFT_COL ? 0 : 1];
      rooms.push({ id: roomId(floor, col), col, floor, kind, device: null, shelf: {}, recipe: null, rota: [], supplies: 0, water: 0 });
    }
  }
  return rooms;
};

export const createGame = (seed: number): Game => {
  const orders: Record<string, Order> = {};
  for (const good of Object.values(GOODS)) orders[good.id] = good.pole === null || good.luxury ? "keep" : "sell";
  const g: Game = {
    seed,
    rng: seed >>> 0,
    phase: "invite",
    day: 1,
    chapter: 1,
    chapterDay: 1,
    t: 0,
    coin: START_COIN,
    hearth: 0,
    favour: 0,
    rooms: makeRooms(),
    maids: [],
    visitors: [],
    nextVisitorId: 1,
    recipes: Object.values(RECIPES)
      .filter((r) => r.starter)
      .map((r) => r.id),
    orders,
    offMenu: [],
    passedOver: [],
    spareDevices: [],
    ownedDevices: [],
    research: 0,
    inventions: 0,
    pending: [],
    offers: [],
    rerolls: 0,
    occasion: null,
    upcoming: null,
    expedition: null,
    results: [],
    log: [],
    stats: emptyStats(),
    today: emptyStats(),
    arrivals: {},
    supperPlan: "feast",
    lastSupper: "none",
    renown: 0,
    wingsOpen: { west: false, east: false },
    endless: false,
    wages: "fair",
    trader: null,
    donations: 0,
    lent: null,
  };
  const kitchen = g.rooms.find((r) => r.kind === "kitchen") as Room;
  const lab = g.rooms.find((r) => r.kind === "lab") as Room;
  kitchen.recipe = "bread";
  kitchen.rota = ["bread"];
  const lord = addMaid(g, "lord");
  const evelyn = addMaid(g, "evelyn");
  lord.room = lab.id;
  lord.pos = { x: lab.col + 0.5, y: lab.floor };
  evelyn.room = kitchen.id;
  evelyn.pos = { x: kitchen.col + 0.5, y: kitchen.floor };
  return g;
};

/** One fixed tick. */
const tick = (g: Game): void => {
  const dt = TICK;
  if (g.phase === "day") {
    spawnDayVisitors(g, dt);
    stepFancies(g, dt);
    stepTills(g);
    stepMaids(g, dt);
    stepVisitors(g, dt);
    stepExpedition(g, dt);
    stepTrader(g, dt);
    checkInvention(g);
    g.t += dt;
    if (g.t >= DAY_SECONDS - TICK / 2) endDay(g);
  } else if (g.phase === "occasion") {
    const occ = g.occasion;
    stepSamovars(g);
    stepFancies(g, dt);
    stepMaids(g, dt);
    stepVisitors(g, dt);
    g.t += dt;
    if (occ) {
      occ.t = g.t;
      if (g.t >= occ.length - TICK / 2 || eveningSpent(g, dt)) finishOccasion(g);
    }
  } else {
    // Between days the household still walks to where it has been sent.
    stepMaids(g, dt);
  }
};

/** Advance the sim by a span of seconds, in fixed ticks. Stops early if the phase changes. */
export const advance = (g: Game, seconds: number): void => {
  const phase = g.phase;
  const ticks = Math.round(seconds / TICK);
  for (let i = 0; i < ticks && g.phase === phase; i++) tick(g);
};

/** True while the clock is running and the player's hands matter moment to moment. */
export const isLive = (g: Game): boolean => g.phase === "day" || g.phase === "occasion";

export const apply = (g: Game, cmd: Command): boolean => {
  switch (cmd.kind) {
    case "assign": {
      if (cmd.room !== null) {
        const room = roomById(g, cmd.room);
        if (ROOM_DEFS[room.kind].role === "none") return false;
      }
      if (g.maids.find((m) => m.id === cmd.maid)?.away) return false;
      assign(g, cmd.maid, cmd.room);
      return true;
    }
    case "recipe": {
      const room = roomById(g, cmd.room);
      if (cmd.recipe !== null && (!g.recipes.includes(cmd.recipe) || RECIPES[cmd.recipe].room !== room.kind)) return false;
      // A batch already under way is finished as it was begun; the next one is the new recipe.
      room.recipe = cmd.recipe;
      room.rota = cmd.recipe ? [cmd.recipe] : [];
      return true;
    }
    case "rota": {
      // Put a recipe on a room's rota, or take it off.
      const room = roomById(g, cmd.room);
      if (!g.recipes.includes(cmd.recipe) || RECIPES[cmd.recipe].room !== room.kind) return false;
      room.rota = room.rota.includes(cmd.recipe) ? room.rota.filter((id) => id !== cmd.recipe) : [...room.rota, cmd.recipe];
      if (room.rota.length === 0) room.recipe = null;
      return true;
    }
    case "menu":
      if (!GOODS[cmd.good] || GOODS[cmd.good].pole === null) return false;
      g.offMenu = g.offMenu.filter((id) => id !== cmd.good);
      if (!cmd.on) g.offMenu.push(cmd.good);
      return true;
    case "order":
      if (!GOODS[cmd.good]) return false;
      g.orders[cmd.good] = cmd.order;
      return true;
    case "supper":
      g.supperPlan = cmd.plan;
      return true;
    case "wages":
      g.wages = cmd.plan;
      return true;
    case "invite":
      if (g.phase !== "invite") return false;
      acceptInvitation(g, cmd.grade);
      return true;
    case "startDay":
      if (g.phase !== "morning") return false;
      startDay(g);
      return true;
    case "buy":
      return g.phase === "offers" ? buy(g, cmd.index, cmd.room) : false;
    case "reroll":
      return g.phase === "offers" ? reroll(g) : false;
    case "donate":
      return donate(g);
    case "nextDay":
      if (g.phase !== "offers") return false;
      nextDay(g);
      return true;
    case "continue":
      if (g.phase === "result") evening(g);
      else if (g.phase === "sabbath") afterSabbath(g);
      else if (g.phase === "ended") continueEndless(g);
      else return false;
      return true;
    case "choose": {
      const first = g.pending[0];
      if (!first) return false;
      if (first.kind === "invention") chooseInvention(g, cmd.index);
      else g.pending.shift();
      return true;
    }
    case "install":
      return install(g, cmd.device, cmd.room, cmd.maid);
    case "uninstall": {
      const room = roomById(g, cmd.room);
      if (!room.device) return false;
      g.spareDevices.push(room.device);
      room.device = null;
      return true;
    }
    case "carriages":
      if (g.phase !== "occasion") return false;
      finishOccasion(g);
      return true;
    case "expedition":
      return sendExpedition(g, cmd.maid, cmd.site, cmd.pack);
    case "press":
      pressOn(g);
      return true;
    case "turnBack":
      turnBack(g);
      return true;
    case "note":
      return noteFancy(g, cmd.visitor);
    case "trade":
      return acceptTrade(g);
    case "dismiss":
      dismissTrader(g);
      return true;
    case "demolish":
      return isLive(g) ? false : demolish(g, cmd.room);
    case "engage":
      return engage(g, cmd.id);
    case "ornament": {
      // Bought for its own sake: it costs coin and does nothing else.
      const def = ORNAMENT_BY_ID[cmd.id];
      const owned = g.ornaments ?? [];
      if (!def || owned.includes(cmd.id) || g.coin < def.cost) return false;
      g.coin -= def.cost;
      g.ornaments = [...owned, cmd.id];
      return true;
    }
    case "paper": {
      const room = roomById(g, cmd.room);
      if (g.coin < PAPER_COST || room.kind === "closed" || room.paper === cmd.paper) return false;
      g.coin -= PAPER_COST;
      room.paper = cmd.paper;
      return true;
    }
  }
};
