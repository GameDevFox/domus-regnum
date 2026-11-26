import { underWay } from "./bakery";
import { onShelf } from "./bakes";
import type { BakeId } from "./bakes";
import { nextWake } from "./clock";
import { PLACES, PLACE_IDS, THINGS, THING_IDS } from "./country";
import type { PlaceId } from "./country";
import { CURIOS, CURIO_IDS, curioFound } from "./curios";
import { comeUponNext, curioId } from "./discovery";
import type { CurioId } from "./curios";
import { CROPS, CROP_IDS, everySquare } from "./garden";
import type { CropId } from "./garden";
import { playNow, stepGame } from "./game";
import { intelBook } from "./intel";
import type { IntelEntry, IntelKind } from "./intel";
import { bakedBy, creditLoaves, isMaster } from "./mastery";
import { refund } from "./outing";
import { callHome } from "./outing-tell";
import { SCENES, sceneDue } from "./scenes";
import { DAY, HOUR, LOAVES_PER_SACK, MASTERY_LOAVES, SHOP_SHELF_HOLDS, WAKE } from "./tuning";
import type { DeviceId, Game } from "./types";
import { SHOPS, SHOP_IDS, WARES, knowsShop, shopsLeft } from "./wares";
import type { ItemId } from "./items";
import type { Ware, WareId } from "./wares";
import type { ShopId } from "./wares";

// The workshop: things done to the game from outside its rules, to make it quick to test. Each
// is a named command with nothing of the page in it, so the dev menu, a test and an agent's
// script all reach the same ones: the menu draws a button for each (src/demo3d/dev-menu.ts),
// and a script calls them by name (`window.manor3d.dev.run`).
//
// Running ahead plays the game's real rules, fast: everything that would have happened in
// between does. It stops of itself when the game waits for the player (a scene, or someone
// asking what she is to do).

export type DevCommand = {
  id: string;
  /** Which heading of the menu it is under. */
  group: "Time" | "Stock" | "Scenes" | "Outings" | "Garden" | "People";
  label: string;
  /** What it is, in words, where its label is only a sign. */
  says?: string;
  /** Do it. A command that gives so much of something gives this much, or its own usual amount if none is said. */
  run: (game: Game, amount?: number) => void;
};

/** How finely the game is stepped when it is run ahead, in seconds: the same step the page takes. */
const STEP = 1 / 60;
/** A coin, a sack and a lot at a time. */
const COIN_GIFT = 100;
const STOCK_GIFT = 12;
/** The longest a scene is waited for, in game minutes: two days. */
const SCENE_WAIT = 48 * HOUR;

/** Run the game on until its clock reaches a time, or until it waits for the player: a scene is due (it is begun at the next moment: on the page, after the black), or has begun, or someone asks what she is to do. */
export const runUntil = (game: Game, clock: number): void => {
  while (game.clock < clock) {
    if (sceneDue(game) !== null) return;
    const before = game.clock;
    stepGame(game, STEP);
    // The clock stands still for a scene, or for someone asking what she is to do: that is the player's to answer.
    if (game.clock === before && (game.scene !== null || game.asks.length > 0)) return;
  }
};

/** Run the game on to the morning of a day, by its count since the game began (the first is 1): everything between happens. A day that has begun already is left alone. */
export const runToDay = (game: Game, day: number): void => runUntil(game, (day - 1) * DAY + WAKE);

/** How much more the shop's shelf can be given: what it holds, less what is on it and what the bakers have under way. */
const shelfRoom = (game: Game): number => Math.max(0, SHOP_SHELF_HOLDS - onShelf(game) - underWay(game) * LOAVES_PER_SACK);

/** Each gives so much of one thing: the amount it is told, or its own usual amount (a hundred coin, a dozen of anything else). Its label is the thing's sign. */
const gifts: DevCommand[] = [
  { id: "coin", group: "Stock", label: "🪙", says: "Coin", run: (game, amount = COIN_GIFT) => void (game.coin += amount) },
  { id: "flour", group: "Stock", label: "🌾", says: "Sacks of flour", run: (game, amount = STOCK_GIFT) => void (game.flour += amount) },
  // No more on the shop's shelf than it holds, of everything together, with room left for the batches under way (each reckoned at the most a batch can be, as the baker does).
  { id: "loaves", group: "Stock", label: "🍞", says: "Loaves", run: (game, amount = STOCK_GIFT) => void (game.shelf.bread += Math.min(amount, shelfRoom(game))) },
  { id: "pies", group: "Stock", label: "🥧", says: "Berry pies", run: (game, amount = STOCK_GIFT) => void (game.shelf.pie += Math.min(amount, shelfRoom(game))) },
  // Each thing that is gathered out of doors.
  ...THING_IDS.map((thing): DevCommand => ({ id: thing, group: "Stock", label: THINGS[thing].glyph, says: THINGS[thing].name, run: (game, amount = STOCK_GIFT) => void (game.stock[thing] += amount) })),
  // …and each crop the garden bears.
  ...CROP_IDS.map((crop): DevCommand => ({ id: crop, group: "Stock", label: CROPS[crop].glyph, says: CROPS[crop].name, run: (game, amount = STOCK_GIFT) => void (game.stock[crop] += amount) })),
];

const time: DevCommand[] = [
  { id: "hour", group: "Time", label: "Run an hour", run: (game) => runUntil(game, game.clock + HOUR) },
  { id: "morning", group: "Time", label: "Run to the next morning", run: (game) => runUntil(game, nextWake(game.clock)) },
  // Running stops of itself when a scene begins; if none does, it stops after two days.
  { id: "scene", group: "Time", label: "Run until a scene begins", run: (game) => runUntil(game, game.clock + SCENE_WAIT) },
];

/** One for each scene the game has: play it now, due or not, seen or not. */
const scenes: DevCommand[] = SCENES.map(({ id }) => ({ id: `play:${id}`, group: "Scenes", label: `Play “${id}”`, run: (game) => void playNow(game, id) }));

const garden: DevCommand[] = [
  // Every plot with something growing in it is ripe: for seeing a harvest without waiting out its days. Today's watering is cleared with it, so a crop that bears again is as thirsty as after any picking.
  {
    id: "ripen",
    group: "Garden",
    label: "🌱 Ripen what is growing",
    run: (game) =>
      everySquare(game).forEach(({ bed }) => {
        if (bed.crop === null) return;
        bed.grown = CROPS[bed.crop].days;
        bed.watered = false;
      }),
  },
];

const outings: DevCommand[] = [
  // What lies hidden is come upon by the very next draw of its deck: the first minute anyone explores or gathers at its place. For seeing it found without a month's gathering.
  ...CURIO_IDS.map((id): DevCommand => ({ id, group: "Outings", label: `${CURIOS[id].glyph} Come upon next at ${PLACES[CURIOS[id].place].name.toLowerCase()}`, says: `${CURIOS[id].name}: the next draw at ${PLACES[CURIOS[id].place].name.toLowerCase()} comes upon it, exploring or gathering`, run: (game) => comeUponNext(game, CURIOS[id].place, curioId(id)) })),
  // (Finding every place, and knowing every crop, were here: a right-click on a tab of the intel menu does as much, since 2026-11-16.)
  {
    id: "home",
    group: "Outings",
    label: "Bring everyone home",
    // Whoever is out is at the door this moment, with what she has. Not yet out at the gate, she is called home as the rules call her (she comes straight in again, or stays in), with her party: a party still leaving the house is not split.
    run: (game) => {
      for (const outing of game.outings.filter((o) => o.state === "leaving")) callHome(game, outing.who);
      for (const outing of game.outings.filter((o) => o.state === "away")) {
        // A ware not yet bought is not hers: its price is the house's again.
        refund(game, outing);
        Object.assign(outing, { doing: null, sells: null, waits: false, homeward: true, done: true, queue: [] });
        outing.depart = Math.min(outing.depart, game.clock);
        outing.back = game.clock;
      }
      game.asks = [];
    },
  },
];

const people: DevCommand[] = [
  // His measure is full the next moment he is at work: the rule that marks it is the game's own.
  { id: "measure", group: "People", label: "Fill the Master's measure", run: (game) => void (game.lab.progress = game.lab.needed) },
  { id: "mastery", group: "People", label: "Everyone masters bread", run: (game) => game.household.forEach((id) => creditLoaves(game, id, MASTERY_LOAVES)) },
];

/** One thing there is to know, named so that it can be made known: a place, a way on from one, a thing (at one place, or wherever it is), a recipe, an ability, an invention. */
export type Revealable =
  | { kind: "place"; id: PlaceId }
  | { kind: "way"; to: PlaceId }
  | { kind: "shop"; id: ShopId }
  /** Anything spoken of on the intel menu's page of things: something gathered (at one place, or wherever it grows), or something sold in town. */
  | { kind: "thing"; id: ItemId; at?: PlaceId }
  | { kind: "curio"; id: CurioId }
  | { kind: "crop"; id: CropId }
  | { kind: "recipe"; id: BakeId }
  | { kind: "ability"; id: string }
  /** The mastery of bread, for one of the household: as if she had baked the loaves that earn it. */
  | { kind: "mastery"; who: string }
  | { kind: "invention"; id: DeviceId }
  /** Everything there is to know, what is hidden included; or all of one kind of it. */
  | { kind: "all"; of?: IntelKind };

/** What makes an entry of the intel menu known. */
export const revealableOf = (entry: IntelEntry): Revealable => (entry.curio ? { kind: "curio", id: entry.curio } : ({ kind: entry.kind, id: entry.id } as Revealable));

/** The entries of the intel menu that `all` covers and that are not yet known. */
const unknownOf = (game: Game, of?: IntelKind): IntelEntry[] => intelBook(game).filter((entry) => !entry.known && (of === undefined || entry.kind === of));

/** Whether there is anything left for `all` to make known. */
export const anyUnknown = (game: Game, of?: IntelKind): boolean => unknownOf(game, of).length > 0 || ((of === undefined || of === "place") && shopsLeft(game).length > 0);

/** All of one kind, in words. */
const ALL_OF: Record<IntelKind, string> = { place: "every place", thing: "every thing", crop: "every crop", recipe: "every recipe", ability: "every ability", invention: "every invention" };

/**
 * Make one thing known, as if the house had come to know it in the ordinary way: for trying
 * things out (a right-click on a question mark, with the dev menu unlocked). The game is as it
 * would be had it happened, so everything that shows it agrees: a place is found, a way on is
 * on the map, a thing has been gathered, a recipe baked, an ability earned (by the first of
 * the household who has not got it), an invention made. All of a kind, or everything, is each
 * of them in turn.
 */
export const reveal = (game: Game, what: Revealable): void => {
  if (what.kind === "all") {
    for (const entry of unknownOf(game, what.of)) reveal(game, revealableOf(entry));
    // The town's shops are of the places: they have no page of their own in the menu, and are found with them.
    if (what.of === undefined || what.of === "place") for (const id of SHOP_IDS) reveal(game, { kind: "shop", id });
  }
  else if (what.kind === "place") game.places[what.id] = "found";
  else if (what.kind === "way") game.places[what.to] ??= "unknown";
  else if (what.kind === "shop") {
    if (!knowsShop(game, what.id)) game.shops.push(what.id);
  }
  else if (what.kind === "thing") {
    // Something sold in town is known of once its shop has been found.
    const sold = WARES[what.id as WareId] as Ware | undefined;
    if (sold && !knowsShop(game, sold.shop)) game.shops.push(sold.shop);
    for (const place of PLACE_IDS.filter((id) => (what.at ?? id) === id)) {
      for (const { thing } of PLACES[place].holds.filter((h) => h.thing === what.id)) {
        const finds = (game.finds[place] ??= []);
        if (!finds.includes(thing)) finds.push(thing);
      }
    }
  } else if (what.kind === "curio") {
    // What was hidden is in the house, as if it had been come upon and brought home.
    if (!curioFound(game, what.id)) game.curios.push(what.id);
  } else if (what.kind === "crop") {
    if (!game.garden.known.includes(what.id)) game.garden.known.push(what.id);
  } else if (what.kind === "recipe") {
    if (!game.recipes.includes(what.id)) game.recipes.push(what.id);
  } else if (what.kind === "ability") {
    const next = game.household.find((id) => !isMaster(game, id));
    if (next) creditLoaves(game, next, MASTERY_LOAVES - bakedBy(game, next));
  } else if (what.kind === "mastery") {
    if (game.household.includes(what.who) && !isMaster(game, what.who)) creditLoaves(game, what.who, MASTERY_LOAVES - bakedBy(game, what.who));
  } else if (!game.devices.includes(what.id)) game.devices.push(what.id);
};

/** What a thing that can be made known is, in a few words: for saying what a right-click on its question mark would make known. */
export const revealSays = (game: Game, what: Revealable): string => {
  if (what.kind === "all") return what.of ? ALL_OF[what.of] : "everything there is to know";
  if (what.kind === "way") return `the way on to ${PLACES[what.to].name.toLowerCase()}`;
  if (what.kind === "shop") return SHOPS.find((s) => s.id === what.id)?.name.toLowerCase() ?? what.id;
  if (what.kind === "curio") return CURIOS[what.id].name;
  if (what.kind === "mastery") return "the mastery of bread, for her";
  const name = intelBook(game).find((entry) => entry.kind === what.kind && entry.id === what.id)?.name ?? what.id;
  return what.kind === "thing" && what.at ? `${name}, at ${PLACES[what.at].name.toLowerCase()}` : name;
};

export const DEV_COMMANDS: DevCommand[] = [...time, ...gifts, ...scenes, ...outings, ...garden, ...people];

/** Run a command by its name. False if there is none of that name. */
export const runDev = (game: Game, id: string, amount?: number): boolean => {
  const command = DEV_COMMANDS.find((c) => c.id === id);
  command?.run(game, amount);
  return command !== undefined;
};
