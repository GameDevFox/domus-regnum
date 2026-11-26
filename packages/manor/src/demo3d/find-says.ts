import { CURIOS, PLACES, SHOPS, THINGS, whatIs } from "../game";
import type { PlaceId } from "../game";

// What something to be found at a place is called, and its picture: a way on, a thing that
// grows there, a shop, a curio. For whoever names it: the odds window's table, and the question someone
// asks on finding it.

export const findSays = (place: PlaceId, id: string): { name: string; glyph: string } => {
  const what = whatIs(place, id);
  if (what?.is === "way") return { name: `The way on to ${PLACES[what.to].name.toLowerCase()}`, glyph: "🗺️" };
  if (what?.is === "thing") return { name: THINGS[what.thing].name, glyph: THINGS[what.thing].glyph };
  if (what?.is === "curio") return { name: CURIOS[what.curio].name, glyph: CURIOS[what.curio].glyph };
  const shop = what?.is === "shop" ? SHOPS.find((s) => s.id === what.shop) : undefined;
  return shop ? { name: shop.name, glyph: shop.glyph } : { name: id, glyph: "" };
};
