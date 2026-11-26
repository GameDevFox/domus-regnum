import { GOODS, ROOM_DEFS, isReception } from "./content/house";
import { MAID_DEFS } from "./content/people";
import { HEARTH_LEVELS, STAIR_COL } from "./tuning";
import type { DeviceId, Game, GoodId, LogEntry, Maid, MaidId, Room, RoomId, Stock, TraitId, Vec } from "./types";

// Seeded randomness (mulberry32): the only source of chance in the sim, so a seed plus a command
// list replays exactly.
export const rand = (g: Game): number => {
  g.rng = (g.rng + 0x6d2b79f5) >>> 0;
  let t = g.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const randInt = (g: Game, lo: number, hi: number): number => lo + Math.floor(rand(g) * (hi - lo + 1));

export const pick = <T>(g: Game, list: T[]): T => list[Math.floor(rand(g) * list.length)];

export const shuffled = <T>(g: Game, list: T[]): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand(g) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export const roomById = (g: Game, id: RoomId): Room => {
  const room = g.rooms.find((r) => r.id === id);
  if (!room) throw new Error(`no room ${id}`);
  return room;
};

export const maidById = (g: Game, id: MaidId): Maid => {
  const maid = g.maids.find((m) => m.id === id);
  if (!maid) throw new Error(`no maid ${id}`);
  return maid;
};

export const roomPos = (room: Room): Vec => ({ x: room.col + 0.5, y: room.floor });
export const HALL_X = STAIR_COL + 0.5;

export const pantryOf = (g: Game): Room | undefined => g.rooms.find((r) => r.kind === "pantry");
export const roomsOfKind = (g: Game, kind: Room["kind"]): Room[] => g.rooms.filter((r) => r.kind === kind);
export const receptionRooms = (g: Game): Room[] => g.rooms.filter((r) => isReception(r.kind));
export const hasDevice = (room: Room, id: DeviceId): boolean => room.device === id;

export const traitOf = (maid: Maid): TraitId => MAID_DEFS[maid.id].trait;
export const maidName = (maid: Maid): string => MAID_DEFS[maid.id].name;

/** Seconds to walk between two points: along the floor to the stair, up or down, along again. */
export const travelSeconds = (a: Vec, b: Vec, walk: number, climb: number): number => {
  if (Math.abs(a.y - b.y) < 0.001) return Math.abs(a.x - b.x) / walk;
  return (Math.abs(a.x - HALL_X) + Math.abs(b.x - HALL_X)) / walk + Math.abs(a.y - b.y) / climb;
};

/** Advance a point toward a target by dt seconds of travel. Returns true on arrival. */
export const moveToward = (pos: Vec, target: Vec, dt: number, walk: number, climb: number): boolean => {
  let left = dt;
  const EPS = 0.0001;
  for (let guard = 0; guard < 4 && left > EPS; guard++) {
    const sameFloor = Math.abs(pos.y - target.y) < EPS;
    if (sameFloor) {
      const dx = target.x - pos.x;
      const need = Math.abs(dx) / walk;
      if (need <= left) {
        pos.x = target.x;
        pos.y = target.y;
        return true;
      }
      pos.x += Math.sign(dx) * walk * left;
      return false;
    }
    const toStair = HALL_X - pos.x;
    if (Math.abs(toStair) > EPS) {
      const need = Math.abs(toStair) / walk;
      if (need > left) {
        pos.x += Math.sign(toStair) * walk * left;
        return false;
      }
      pos.x = HALL_X;
      left -= need;
      continue;
    }
    const dy = target.y - pos.y;
    const need = Math.abs(dy) / climb;
    if (need > left) {
      pos.y += Math.sign(dy) * climb * left;
      return false;
    }
    pos.y = target.y;
    left -= need;
  }
  return Math.abs(pos.x - target.x) < EPS && Math.abs(pos.y - target.y) < EPS;
};

// ---- stock ----

export const count = (stock: Stock, good: GoodId): number => stock[good] ?? 0;

export const addStock = (stock: Stock, good: GoodId, n: number): void => {
  if (n <= 0) return;
  stock[good] = count(stock, good) + n;
};

export const removeStock = (stock: Stock, good: GoodId, n: number): number => {
  const taken = Math.min(n, count(stock, good));
  if (taken <= 0) return 0;
  const left = count(stock, good) - taken;
  if (left <= 0) delete stock[good];
  else stock[good] = left;
  return taken;
};

export const stockTotal = (stock: Stock): number => Object.values(stock).reduce((a, b) => a + b, 0);

/** What a maid standing in this room can reach: its shelf, plus the pantry through a dumbwaiter. */
export const reach = (g: Game, room: Room, good: GoodId): number => {
  const own = count(room.shelf, good);
  const pantry = pantryOf(g);
  if (pantry && pantry !== room && hasDevice(room, "dumbwaiter")) return own + count(pantry.shelf, good);
  return own;
};

export const takeReach = (g: Game, room: Room, good: GoodId, n: number): number => {
  let got = removeStock(room.shelf, good, n);
  const pantry = pantryOf(g);
  if (got < n && pantry && pantry !== room && hasDevice(room, "dumbwaiter")) got += removeStock(pantry.shelf, good, n - got);
  return got;
};

/** Everything of one good in the house: shelves and hands. */
export const houseStock = (g: Game, good: GoodId): number =>
  g.rooms.reduce((a, r) => a + count(r.shelf, good), 0) + g.maids.reduce((a, m) => a + count(m.carrying, good), 0);

export const allStock = (g: Game): Stock => {
  const out: Stock = {};
  for (const r of g.rooms) for (const [good, n] of Object.entries(r.shelf)) addStock(out, good, n);
  for (const m of g.maids) for (const [good, n] of Object.entries(m.carrying)) addStock(out, good, n);
  return out;
};

/** Take goods from wherever they are, pantry first. Used by supper and by packing. */
export const takeAnywhere = (g: Game, good: GoodId, n: number): number => {
  let left = n;
  const pantry = pantryOf(g);
  const order = pantry ? [pantry, ...g.rooms.filter((r) => r !== pantry)] : g.rooms;
  for (const room of order) {
    if (left <= 0) break;
    left -= removeStock(room.shelf, good, left);
  }
  return n - left;
};

/** Put goods in the pantry (or, with no pantry, the first room). */
export const store = (g: Game, good: GoodId, n: number): void => {
  const room = pantryOf(g) ?? g.rooms[0];
  addStock(room.shelf, good, n);
};

// ---- hearth ----

export const hearthLevel = (points: number): number => {
  let level = 1;
  for (let i = 1; i < HEARTH_LEVELS.length; i++) if (points >= HEARTH_LEVELS[i]) level = i + 1;
  return level;
};

export const hearthNext = (points: number): number | null => {
  const level = hearthLevel(points);
  return level < HEARTH_LEVELS.length ? HEARTH_LEVELS[level] : null;
};

// ---- log & speech ----

const LOG_MAX = 60;

export const logLine = (g: Game, text: string, tone: LogEntry["tone"] = "plain"): void => {
  g.log.push({ t: g.t, day: g.day, text, tone });
  if (g.log.length > LOG_MAX) g.log.shift();
};

const SAY_SECONDS = 2.6;

export const say = (g: Game, maid: Maid, key: string): void => {
  const lines = MAID_DEFS[maid.id].lines[key];
  if (!lines || lines.length === 0) return;
  maid.say = pick(g, lines);
  maid.sayLeft = SAY_SECONDS;
};

export const goodName = (good: GoodId): string => `${GOODS[good].glyph} ${GOODS[good].name}`;
export const roomName = (room: Room): string => ROOM_DEFS[room.kind].name;

/** Same room, or side by side on the same floor. */
export const neighbours = (a: Room, b: Room): boolean => a.floor === b.floor && Math.abs(a.col - b.col) <= 1;
