import type { Scope } from "@scene-lib/scope";

import { BASKET_HOLDS, CLOTHING_IDS, WARES, choicesFor, goodOf, goodsToSell, knowsShop, needless, outingOf, shopsKnown, stallsKnown, waresOf } from "../game";
import type { ClothingId, Game, GoodId, Shop, ShopId, Ware, WareId } from "../game";
import { el } from "./panel";

// What is to be bought in town, chosen on the town's card (map-card.ts): the shops the house has
// found in a row (none to begin with: they are found by exploring the town), and under them what the chosen shop sells, each by its picture with its price. One ware is
// chosen at a time, and whoever is sent goes for that.

export type WarePicker = { node: HTMLElement; /** The ware chosen. */ ware: () => Ware; /** Bring what it says up to the moment. */ refresh: () => void };

/** What was last chosen, kept from one card to the next. */
let chosen: WareId = "flour";

const COIN = "🪙";
/** What someone has with her. */
const BASKET = "🧺";

/** How many of a ware the house has put by, where that is counted: what is worn. */
const putBy = (game: Game, ware: WareId): number => ((CLOTHING_IDS as WareId[]).includes(ware) ? game.wardrobe[ware as ClothingId] : 0);

export const WarePicker = (scope: Scope, { game, changed }: { game: Game; /** Called when another ware is chosen. */ changed: () => void }): WarePicker => {
  const node = el("div", "map-wares");
  const shops = el("div", "map-card-row map-shops");
  shops.setAttribute("role", "tablist");
  const wares = el("div", "map-card-row map-shop-wares");
  node.append(shops, wares);

  const choose = (ware: WareId): void => {
    chosen = ware;
    changed();
  };
  // Going into a shop is choosing the first thing it sells.
  scope.listen(shops, "click", (e: MouseEvent) => {
    const shop = (e.target as Element).closest<HTMLElement>(".map-shop")?.dataset.shop as ShopId | undefined;
    if (shop) choose(waresOf(shop)[0].id);
  });
  /** The shops found that sell anything: a stall that only buys of the house is not among them (it is the other picker's, below). */
  const sellers = (): Shop[] => shopsKnown(game).filter((s) => waresOf(s.id).length > 0);
  /** The ware chosen, if its shop has been found; else the first thing the first shop found sells. (Only called with a shop found: the card offers buying only then.) */
  const settled = (): WareId => (knowsShop(game, WARES[chosen].shop) ? chosen : (waresOf(sellers()[0]?.id ?? WARES[chosen].shop)[0]?.id ?? chosen));
  scope.listen(wares, "click", (e: MouseEvent) => {
    const ware = (e.target as Element).closest<HTMLElement>(".map-ware")?.dataset.ware as WareId | undefined;
    if (ware) choose(ware);
  });

  let drawn = "";
  const refresh = (): void => {
    chosen = settled();
    const shop: ShopId = WARES[chosen].shop;
    const sold = waresOf(shop);
    const known = sellers();
    // Drawn again only when what it would show has changed.
    const now = JSON.stringify([chosen, known.map((s) => s.id), sold.map((w) => [putBy(game, w.id), needless(game, w.id)])]);
    if (now === drawn) return;
    drawn = now;
    shops.replaceChildren(
      ...known.map((s) => {
        const chip = el("button", "chip map-shop", s.glyph);
        chip.dataset.shop = s.id;
        chip.setAttribute("role", "tab");
        chip.setAttribute("aria-label", s.name);
        chip.title = s.name;
        chip.classList.toggle("on", s.id === shop);
        chip.setAttribute("aria-selected", String(s.id === shop));
        return chip;
      }),
    );
    wares.replaceChildren(
      ...sold.map((ware) => {
        const chip = el("button", "chip map-ware");
        chip.dataset.ware = ware.id;
        const have = putBy(game, ware.id);
        chip.append(el("span", "map-ware-glyph", ware.glyph), el("span", "map-ware-price", `${COIN} ${ware.price}`), ...(have > 0 ? [el("span", "map-ware-have", `×${have}`)] : []));
        chip.classList.toggle("on", ware.id === chosen);
        chip.classList.toggle("needless", needless(game, ware.id));
        chip.setAttribute("aria-pressed", String(ware.id === chosen));
        const says = `${ware.name}: ${ware.price} coin${ware.lot > 1 ? ` for ${ware.lot}` : ""}. ${ware.says}${have > 0 ? `. The house has ${have}` : ""}${needless(game, ware.id) ? ". There is no use for another just now" : ""}`;
        chip.setAttribute("aria-label", says);
        chip.title = says;
        return chip;
      }),
    );
  };
  refresh();
  return { node, ware: () => WARES[settled()], refresh };
};

// What is to be sold in town, chosen on the same card: the stalls the house has found that buy,
// and under them what of theirs the house has any of, or anyone waiting in town has with her,
// each by its picture with how many there are and what one fetches. One kind of thing is chosen
// at a time: whoever is sent from the house takes as much of it as her basket holds, and someone
// waiting in town sells what she has of it with her.

export type SalePicker = { node: HTMLElement; /** What is chosen to be sold: nothing, while the house has none of anything a found stall deals in. */ good: () => GoodId | null; refresh: () => void };

/** What was last chosen to be sold, kept from one card to the next. */
let selling: GoodId | null = null;

/** What those waiting in town have with them that a stall found there buys, kind by kind: what the rules would let each be told to sell (`choicesFor`), and how much of it she has. */
export const carriedInTown = (game: Game): Partial<Record<GoodId, number>> => {
  const carried: Partial<Record<GoodId, number>> = {};
  for (const id of game.household)
    for (const { told } of choicesFor(game, id)) if (typeof told === "object" && "sell" in told) carried[told.sell] = (carried[told.sell] ?? 0) + (outingOf(game, id)?.basket[told.sell] ?? 0);
  return carried;
};

export const SalePicker = (scope: Scope, { game, changed }: { game: Game; /** Called when another thing is chosen. */ changed: () => void }): SalePicker => {
  const node = el("div", "map-wares map-sales");
  const stalls = el("div", "map-card-row map-stalls");
  const goods = el("div", "map-card-row map-shop-wares");
  node.append(stalls, goods);
  scope.listen(goods, "click", (e: MouseEvent) => {
    const good = (e.target as Element).closest<HTMLElement>(".map-good")?.dataset.good as GoodId | undefined;
    if (!good) return;
    selling = good;
    changed();
  });
  /** What the house has some of to sell, at a stall it has found; or someone waiting in town has with her. */
  const stocked = (): ReturnType<typeof goodsToSell> => goodsToSell(game).filter((g) => g.have >= 1 || (carriedInTown(game)[g.good] ?? 0) > 0);
  /** What is chosen, if there is still some of it; else the first thing there is some of. */
  const settled = (): GoodId | null => (stocked().some((g) => g.good === selling) ? selling : (stocked()[0]?.good ?? null));

  let drawn = "";
  const refresh = (): void => {
    selling = settled();
    const have = stocked();
    const known = stallsKnown(game);
    const carried = carriedInTown(game);
    const now = JSON.stringify([selling, known.map((s) => s.id), have.map((g) => [g.good, Math.floor(g.have)]), carried]);
    if (now === drawn) return;
    drawn = now;
    // The stalls, each saying what it deals in: they are not pressed, since what is sold says where.
    stalls.replaceChildren(
      ...known.map((stall) => {
        const badge = el("span", "chip map-stall", stall.glyph);
        badge.dataset.shop = stall.id;
        badge.title = `${stall.name}: ${stall.says.replace(/^./, (first) => first.toLowerCase())}. It buys of the house too`;
        badge.setAttribute("aria-label", badge.title);
        badge.setAttribute("role", "img");
        return badge;
      }),
    );
    const nothing = el("span", "map-card-text map-nothing", "×0");
    nothing.title = "The house has none of anything these stalls deal in";
    goods.replaceChildren(
      ...(have.length === 0
        ? [nothing]
        : have.map(({ good, stall, have: count, price }) => {
            const { name, glyph } = goodOf(good);
            const chip = el("button", "chip map-good");
            chip.dataset.good = good;
            const withHer = carried[good] ?? 0;
            // What someone waiting in town has with her of it is in her basket: so many, beside a basket.
            chip.append(el("span", "map-ware-glyph", glyph), el("span", "map-ware-have", `×${Math.floor(count)}`), ...(withHer > 0 ? [el("span", "map-ware-have map-carried", `${BASKET} ×${withHer}`)] : []), el("span", "map-ware-price", `${COIN} ${price}`));
            chip.classList.toggle("on", good === selling);
            chip.setAttribute("aria-pressed", String(good === selling));
            const says = `${name}: ${Math.floor(count)} in the house${withHer > 0 ? `, and ${withHer} with her in town` : ""}, ${price} coin each at ${stall.name.toLowerCase()}. Sent from the house, she takes as many as ${BASKET_HOLDS}`;
            chip.setAttribute("aria-label", says);
            chip.title = says;
            return chip;
          })),
    );
  };
  refresh();
  return { node, good: settled, refresh };
};
