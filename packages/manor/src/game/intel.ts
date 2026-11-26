import { CAST } from "../space";
import { BAKES, BAKE_IDS, needsOf } from "./bakes";
import type { BakeId } from "./bakes";
import { HOME, PLACES, PLACE_IDS, THINGS, walkMinutes } from "./country";
import type { Known, PlaceId, ThingId } from "./country";
import { CURIOS, curioFound, curiosAt } from "./curios";
import type { CurioId } from "./curios";
import { CROPS, CROP_IDS, bearsSays } from "./garden";
import type { CropId } from "./garden";
import { DEVICES, hasDevice } from "./lab";
import { PACE_SAYS, isMaster } from "./mastery";
import { isTarget, nearness, shopId, thingId, wayId } from "./discovery";
import { MASTERY_LOAVES } from "./tuning";
import { ITEMS, ITEM_IDS } from "./items";
import type { Item } from "./items";
import { SHOPS, SHOPS_AT, knowsShop, shopsKnown, shopsLeft } from "./wares";
import type { ShopId } from "./wares";
import type { Game } from "./types";

// Intel: everything there is to know in the game, and how much of it the house knows. One
// list, for whoever shows it (the intel menu; `packages/domus/docs/design/23-intel.md`). A new
// game knows the house, the town, flour and how to bake bread; the rest is there to be found,
// and is shown as a question mark until it is.
//
// What is hidden is not on the list until it is found: no question mark stands for it, and it
// is not counted in what there is to know. Found, it is over and above.

export type IntelKind = "place" | "thing" | "crop" | "recipe" | "ability" | "invention";
export const INTEL_KINDS: IntelKind[] = ["place", "thing", "crop", "recipe", "ability", "invention"];

export type IntelEntry = {
  kind: IntelKind;
  id: string;
  /** What it is called, its sign, and what is known of it in a line or two: for showing once it is known. */
  name: string;
  glyph: string;
  says: string[];
  known: boolean;
  /** Not listed, and not counted, until it is known. */
  hidden: boolean;
  /** A place's entry is of this place; a curio's entry is of this curio, which can be looked at once it is in the house. */
  place?: PlaceId;
  curio?: CurioId;
};

const lower = (name: string): string => name.toLowerCase();
const nameOf = (id: string): string => CAST.find((c) => c.id === id)?.name ?? id;
/** Words joined as a list: "berries and herbs". */
const listed = (words: string[]): string => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);

/** The things known to be gathered at a place, and the places a thing is known to be gathered at. */
const foundAt = (game: Game, place: PlaceId): ThingId[] => game.finds[place] ?? [];
const placesOf = (game: Game, thing: ThingId): PlaceId[] => PLACE_IDS.filter((place) => foundAt(game, place).includes(thing));

/**
 * How much of what there is to know of a place the house knows, as a share: nothing until it
 * has been found; then the share of its question marks (its ways on, and the things it holds)
 * that are answered, which is the whole when it has none. What is hidden there is over and
 * above the whole, and each such find weighs what one question mark does: three marks and one
 * hidden find, all found, is four thirds. (Where there are no marks, a find weighs the whole.)
 */
export const intelOf = (game: Game, place: PlaceId): number => {
  if (game.places[place] !== "found") return 0;
  const { leads, holds } = PLACES[place];
  // (The town's shops are marks of it too: each is to be found, as a way on is.)
  const shops = place === SHOPS_AT ? SHOPS : [];
  const marks = leads.length + holds.length + shops.length;
  const answered = leads.filter((lead) => game.places[lead.to] !== undefined).length + holds.filter((holding) => foundAt(game, place).includes(holding.thing)).length + shops.filter((shop) => knowsShop(game, shop.id)).length;
  const come = curiosAt(place).filter((id) => curioFound(game, id)).length;
  return marks > 0 ? (answered + come) / marks : 1 + come;
};

/**
 * What there is to find at a place, mark by mark, as far as each has been found: its ways on,
 * the things it holds, and whatever was hidden there and has been come upon. What is hidden
 * and not yet come upon is not among them: nothing tells of it. (Unless everything is asked
 * for, as it is while things are being tried out: then it is, marked as not yet found.)
 */
export type PlaceSlot =
  /** A way on: where it leads; whether that place is not yet on the map (null), on it as a question mark, or found; how near it is to being found, as a share of the exploring it takes; and whether exploring is out to find it next. */
  | { is: "way"; to: PlaceId; on: Known | null; got: number; sought: boolean }
  /** A shop in town: whether it has been found; how near it is to being found, as a share of the exploring it takes; and whether exploring is out to find it next. */
  | { is: "shop"; shop: ShopId; known: boolean; got: number; sought: boolean }
  /** A thing that can be gathered there: whether it has been found, and how near it is to being. */
  | { is: "thing"; thing: ThingId; known: boolean; got: number; sought: boolean }
  | { is: "curio"; curio: CurioId; found: boolean };

export const slotsOf = (game: Game, place: PlaceId, everything = false): PlaceSlot[] => {
  const { leads, holds } = PLACES[place];
  // How near each is to found, and whether it is what exploring is on to, are the search's to say (discovery.ts).
  const sought = (id: string): boolean => isTarget(game, place, id);
  return [
    ...leads.map((lead): PlaceSlot => ({ is: "way", to: lead.to, on: game.places[lead.to] ?? null, got: nearness(game, place, wayId(lead.to)), sought: sought(wayId(lead.to)) })),
    ...(place === SHOPS_AT ? SHOPS : []).map((shop): PlaceSlot => ({ is: "shop", shop: shop.id, known: knowsShop(game, shop.id), got: nearness(game, place, shopId(shop.id)), sought: sought(shopId(shop.id)) })),
    ...holds.map((holding): PlaceSlot => ({ is: "thing", thing: holding.thing, known: foundAt(game, place).includes(holding.thing), got: nearness(game, place, thingId(holding.thing)), sought: sought(thingId(holding.thing)) })),
    ...curiosAt(place).flatMap((curio): PlaceSlot[] => (curioFound(game, curio) || everything ? [{ is: "curio", curio, found: curioFound(game, curio) }] : [])),
  ];
};

const placeEntry = (game: Game, id: PlaceId): IntelEntry => {
  const { name, leads } = PLACES[id];
  const things = foundAt(game, id).map((thing) => lower(THINGS[thing].name));
  const ways = leads.filter((lead) => game.places[lead.to] !== undefined).map((lead) => (game.places[lead.to] === "found" ? lower(PLACES[lead.to].name) : "a place not yet visited"));
  const says = [
    id === HOME ? "Home" : `${walkMinutes(id)} minutes' walk from the house`,
    // Of the town, what each shop found in it sells; and, while there is one left to find, that there is more to it.
    ...(id === SHOPS_AT ? [...shopsKnown(game).map((shop) => `${shop.name}: ${shop.says.replace(/^./, (first) => first.toLowerCase())}`), ...(shopsLeft(game).length > 0 ? ["Not all of it has been looked into"] : [])] : []),
    ...(things.length > 0 ? [`${listed(things)} can be gathered here`.replace(/^./, (first) => first.toUpperCase())] : []),
    ...ways.map((to) => `A way leads on to ${to}`),
  ];
  return { kind: "place", id, name, glyph: "🗺️", says, known: game.places[id] === "found", hidden: false, place: id };
};

const thingEntry = (game: Game, id: ThingId): IntelEntry => {
  // (A place it is known of, but that nobody has been to, is not named.)
  const places = placesOf(game, id).map((place) => (game.places[place] === "found" ? lower(PLACES[place].name) : "a place not yet visited"));
  const into = BAKE_IDS.filter((bake) => game.recipes.includes(bake) && needsOf(bake).some(([thing]) => thing === id)).map((bake) => lower(BAKES[bake].name));
  return { kind: "thing", id, name: THINGS[id].name, glyph: THINGS[id].glyph, says: [`Gathered at ${listed(places)}`, ...(into.length > 0 ? [`Goes into ${listed(into)}`] : [])], known: places.length > 0, hidden: false };
};

const curioEntry = (game: Game, id: CurioId): IntelEntry => {
  const { name, glyph, place } = CURIOS[id];
  return { kind: "thing", id, name, glyph, says: [`Come upon at ${lower(PLACES[place].name)}`, game.curios.includes(id) ? "It is in the house" : "It is on its way home"], known: curioFound(game, id), hidden: true, curio: id };
};

/** An item's entry on the page of things, if that is where it is spoken of: something gathered, something come upon, or something plain, which says of itself what there is to say. */
const itemEntry = (game: Game, item: Item): IntelEntry[] => {
  if (item.intel.kind !== "thing") return [];
  if (item.intel.is === "gathered") return [thingEntry(game, item.id as ThingId)];
  if (item.intel.is === "curio") return [curioEntry(game, item.id as CurioId)];
  return [{ kind: "thing", id: item.id, name: item.name, glyph: item.glyph, says: item.intel.says(game), known: item.intel.known(game), hidden: false }];
};

/** A crop is known when the house knows how to grow it. */
const cropEntry = (game: Game, id: CropId): IntelEntry => {
  const { name, glyph, days, again } = CROPS[id];
  const says = ["Grown in the kitchen garden", `Ripe ${days} watered days after it is sown; a square of a plot bears ${bearsSays(id)}`, again === null ? "It is pulled when it is picked, and sown again" : `Picked, it bears again in ${again} days`];
  return { kind: "crop", id, name, glyph, says, known: game.garden.known.includes(id), hidden: false };
};

const recipeEntry = (game: Game, id: BakeId): IntelEntry => {
  const { name, glyph, batch, units, price } = BAKES[id];
  const makings = ["a sack of flour", ...needsOf(id).map(([thing, lots]) => `${lots} lot${lots === 1 ? "" : "s"} of ${lower(THINGS[thing].name)}`)];
  return { kind: "recipe", id, name, glyph, says: [`${listed(makings)} ${makings.length === 1 ? "makes" : "make"} ${batch} ${units}`.replace(/^./, (first) => first.toUpperCase()), `Sold at ${price} coin each`], known: game.recipes.includes(id), hidden: false };
};

/** The abilities there are to earn. One so far: the mastery of bread. */
const abilityEntries = (game: Game): IntelEntry[] => {
  const masters = game.household.filter((id) => isMaster(game, id)).map(nameOf);
  return [{ kind: "ability", id: "bread", name: "Mastery of bread", glyph: "🥖", says: [`Earned by baking ${MASTERY_LOAVES} loaves: kneading and handling go ${PACE_SAYS}`, `${listed(masters)} ${masters.length === 1 ? "has" : "have"} it`], known: masters.length > 0, hidden: false }];
};

/** Everything there is to know, kind by kind, each known or not. */
export const intelBook = (game: Game): IntelEntry[] => [
  ...PLACE_IDS.map((id) => placeEntry(game, id)),
  // The page of things is every item there is that is not a crop or something baked (items.ts): none is on it by being written here.
  ...ITEM_IDS.flatMap((id) => itemEntry(game, ITEMS[id])),
  ...CROP_IDS.map((id) => cropEntry(game, id)),
  ...BAKE_IDS.map((id) => recipeEntry(game, id)).reverse(),
  ...abilityEntries(game),
  ...DEVICES.map((device): IntelEntry => ({ kind: "invention", id: device.id, name: device.name, glyph: device.glyph, says: [device.effect], known: hasDevice(game, device.id), hidden: false })),
];

/** The entries that are on the list: what is hidden is not, until it is known. (Unless everything is asked for: for trying things out.) */
export const listedIn = (entries: IntelEntry[], everything = false): IntelEntry[] => entries.filter((entry) => everything || entry.known || !entry.hidden);

/** How much is known: how many of the things there are to know, of how many; and how many hidden things beside. */
export const tally = (entries: IntelEntry[]): { known: number; of: number; hidden: number } => ({
  known: entries.filter((entry) => entry.known && !entry.hidden).length,
  of: entries.filter((entry) => !entry.hidden).length,
  hidden: entries.filter((entry) => entry.known && entry.hidden).length,
});
