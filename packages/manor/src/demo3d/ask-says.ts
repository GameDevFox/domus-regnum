import { WARES, goodOf, whatIs } from "../game";
import type { Ask, Did, Errand, Game, OutingDoing, Told } from "../game";
import { findSays } from "./find-says";
import { nameOf, nameWithin } from "./map-places";
import { placeSays } from "./outing-says";

// The question someone out of doors asks, in words: why she asks, in a line ("Sage has bought
// flour.", "Rose's basket is full.", "Sage and Rose have bought flour.", for a party). Each of
// the things she can be told has a key, for the page's checks.

/** What she was at, as a word for the line: "exploring", "buying flour". */
const doingSays = (did: Did): string => {
  if (did.doing === "buy") return `buying ${WARES[did.ware ?? "flour"].name.toLowerCase()}`;
  if (did.doing === "sell") return did.good ? `selling ${goodOf(did.good).name.toLowerCase()}` : "selling";
  return ({ explore: "exploring", gather: "gathering" } as Record<OutingDoing, string>)[did.doing];
};

/** What has come to an end, as the line says it: what she bought or sold; else that she is done. `has` and `is`, for one or more. */
const doneSays = (did: Did | undefined, has: string, is: string): string => {
  if (did?.doing === "buy") return `${has} bought ${WARES[did.ware ?? "flour"].name.toLowerCase()}`;
  if (did?.doing === "sell" && did.good) return `${has} sold ${goodOf(did.good).name.toLowerCase()}`;
  return `${is} done`;
};

/** What is queued next, as the line says it: "buy flour", "explore the forest", "go to the lake". */
const nextSays = (game: Game, next: Errand): string => {
  const place = placeSays(game, next.to);
  if (next.doing === "buy") return `buy ${WARES[next.ware ?? "flour"].name.toLowerCase()} at ${place}`;
  if (next.doing === "sell") return next.good ? `sell ${goodOf(next.good).name.toLowerCase()} at ${place}` : `sell at ${place}`;
  if (next.doing === "explore") return `explore ${place}`;
  if (next.doing === "gather") return `gather at ${place}`;
  return `go to ${place}`;
};

/** Names in a list, as they are said: "Sage", "Sage and Rose", "Sage, Rose and Evelyn". "The Master" is "the Master" after the first, and the first too `within` a sentence. */
export const namesSay = (ids: string[], within = false): string => {
  const names = ids.map((id, n) => (n > 0 || within ? nameWithin(id) : nameOf(id)));
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? "");
};

/** What she has found there, as the line names it, and whether she found it or came upon it (a curio is not looked for: it is come upon, as the card under the clock says of it). */
export const foundSays = (ask: Ask): { names: { name: string; glyph: string }[]; has: string } => {
  // (A way on to somewhere not yet seen is not named for where it goes.)
  const names = (ask.news ?? []).map((id) => (id.startsWith("way:") ? { name: "a way on", glyph: "🗺️" } : findSays(ask.place, id)));
  const has = names.length > 0 && (ask.news ?? []).every((id) => whatIs(ask.place, id)?.is === "curio") ? "has come upon" : "has found";
  return { names, has };
};

/** Why she asks, in a line without its full stop: for the card's name, and, with one, under her face. */
export const askLine = (game: Game, ask: Ask): string => {
  // A party asks as one: its names, and the words for more than one.
  const many = (ask.with ?? []).length > 0;
  const who = namesSay([ask.who, ...(ask.with ?? [])]);
  const has = many ? "have" : "has";
  const place = placeSays(game, ask.place);
  switch (ask.why) {
    case "place":
      return `${who} ${has} found ${place}`;
    case "found": {
      const found = foundSays(ask);
      const verb = many ? found.has.replace(/^has/, "have") : found.has;
      return found.names.length > 0 ? `${who} ${verb} ${found.names.map((one) => one.name.charAt(0).toLowerCase() + one.name.slice(1)).join(" and ")} at ${place}` : `${who} ${has} found ${place}`;
    }
    case "done":
      return `${who} ${doneSays(ask.did, has, many ? "are" : "is")}`;
    case "full":
      return many ? `${who}'s baskets are full` : `${who}'s basket is full`;
    case "time":
      return ask.did ? `${who}'s time ${doingSays(ask.did)} is up` : `${who}'s time there is up`;
    case "arrived":
      return `${who} ${has} come to ${place}`;
    case "stopped":
      return ask.did ? `${who} ${has} stopped ${doingSays(ask.did)}` : `${who} ${has} stopped`;
    case "stuck":
      // (A question with no step named, which the rules no longer put, is still a line: never a throw that takes the card off the map.)
      return ask.stuck?.next ? `${who} cannot ${nextSays(game, ask.stuck.next)}` : `${who} cannot go on`;
  }
};

/** A choice as a key, for the page's checks: "explore", "buy:flour", "go:lake". */
export const toldKey = (told: Told): string => (typeof told === "string" ? told : "buy" in told ? `buy:${told.buy}` : "sell" in told ? `sell:${told.sell}` : `go:${told.go}`);
