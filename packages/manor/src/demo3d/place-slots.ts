import { CURIOS, PLACES, SHOPS, THINGS, slotsOf } from "../game";
import type { Game, PlaceId, Revealable } from "../game";
import { MAP_ART, PIECES } from "./map-art";
import { el } from "./panel";

// What there is to find at a place, drawn mark by mark: a slot for each way on, filling as
// minutes are spent exploring (and, in town, one for each shop, which fills the same way); one for each thing it holds; and one, in gold, for whatever was
// hidden there and has been come upon. (With the dev menu unlocked, what is hidden and not yet
// come upon has a slot too, faint and with a broken edge, so that it can be made known.) The same slots are on the place's card on the map and
// on its page in the intel menu. What they show is the rules' to say (`slotsOf`).

/** A way on that has been found, to a place nobody has been to yet: it is on the map now. */
const FOUND_WAY = "🗺️";
const UNKNOWN = "?";
/** Minutes are summed a step at a time and come out a hair short: thirty is shown as thirty. */
const whole = (minutes: number): number => Math.floor(minutes + 1e-6);
const PERCENT = 100;
/** How near something not yet found is to being found, in words: nothing, while nothing of it has been come upon. */
const nearly = (got: number): string => (got > 0 ? `: ${Math.floor(got * PERCENT)}% of the way to it` : "");

/**
 * The slots of a place. Each says, in its data, what it is (`slot`); where in the intel menu it
 * is spoken of, once it is known (`goto`: a kind and an id); and, while it is not known, what
 * would make it so (`reveal`), for trying things out.
 */
export const slotNodes = (game: Game, place: PlaceId, everything = false): HTMLElement[] => {
  return slotsOf(game, place, everything).map((slot) => {
    const node = el("span", "map-slot");
    const mark = (known: boolean, goto: string | null, reveal: Revealable | null): void => {
      node.classList.toggle("known", known);
      if (goto) node.dataset.goto = goto;
      if (reveal) node.dataset.reveal = JSON.stringify(reveal);
    };
    if (slot.is === "way") {
      node.classList.add("map-way-slot");
      node.dataset.slot = `way:${slot.to}`;
      node.classList.toggle("sought", slot.sought);
      // Not yet found, the slot fills as the minutes are spent; found, it shows what the way leads to, as far as that is known.
      node.style.setProperty("--got", String(slot.got));
      // Three states, each its own picture: not yet found, a question mark; found, a map; visited, the place itself.
      node.textContent = slot.on === "found" ? "" : slot.on === "unknown" ? FOUND_WAY : UNKNOWN;
      node.style.backgroundImage = slot.on === "found" ? `url("${MAP_ART}${PIECES[slot.to].file}")` : "";
      node.title = slot.on === "found" ? `A way on, to ${PLACES[slot.to].name.toLowerCase()}` : slot.on === "unknown" ? "A way on, to a place not yet visited" : `A way on, not yet found${nearly(slot.got)}`;
      mark(slot.on !== null, slot.on === "found" ? `place:${slot.to}` : null, slot.on === null ? { kind: "way", to: slot.to } : null);
    } else if (slot.is === "shop") {
      // A shop in town: a question mark that fills as the town is explored, and the shop's own picture once it is found.
      const shop = SHOPS.find((s) => s.id === slot.shop);
      node.classList.add("map-way-slot", "map-shop-slot");
      node.dataset.slot = `shop:${slot.shop}`;
      node.classList.toggle("sought", slot.sought);
      node.style.setProperty("--got", String(slot.got));
      node.textContent = slot.known ? (shop?.glyph ?? UNKNOWN) : UNKNOWN;
      node.title = slot.known ? `${shop?.name ?? "A shop"}: ${shop?.says.replace(/^./, (first) => first.toLowerCase()) ?? ""}` : `A shop, not yet found${nearly(slot.got)}`;
      mark(slot.known, null, slot.known ? null : { kind: "shop", id: slot.shop });
    } else if (slot.is === "thing") {
      // Something to be gathered: a question mark that fills as the place is gone over, until it is found; then its own picture.
      node.classList.add("map-thing-slot");
      node.dataset.slot = `thing:${slot.thing}`;
      node.classList.toggle("sought", slot.sought);
      node.style.setProperty("--got", String(slot.got));
      node.textContent = slot.known ? THINGS[slot.thing].glyph : UNKNOWN;
      node.title = slot.known ? `${THINGS[slot.thing].name} can be gathered here` : `Something can be gathered here: what, is not yet found${nearly(slot.got)}`;
      mark(slot.known, slot.known ? `thing:${slot.thing}` : null, slot.known ? null : { kind: "thing", id: slot.thing, at: place });
    } else {
      node.classList.add("map-curio-slot");
      node.dataset.slot = `curio:${slot.curio}`;
      node.classList.toggle("not-found", !slot.found);
      node.textContent = slot.found ? CURIOS[slot.curio].glyph : UNKNOWN;
      node.title = slot.found ? `${CURIOS[slot.curio].name}: come upon here` : "Something is hidden here, and not yet come upon";
      mark(slot.found, slot.found ? `thing:${slot.curio}` : null, slot.found ? null : { kind: "curio", id: slot.curio });
    }
    return node;
  });
};

/** What the slots of a place would show, as one string: drawn again only when it has changed. */
export const slotsSay = (game: Game, place: PlaceId, everything = false): string => JSON.stringify([slotsOf(game, place, everything), whole(game.explored[place] ?? 0)]);
