import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { DELIVERY_FEE, DELIVERY_HOURS, FLOUR_COST, ORDER_SIZES, dayOf, orderCost, orderFlour, timeText } from "../game";
import type { Game } from "../game";
import { el } from "./panel";

// What the house can buy, under its own heading: one row for each thing for sale, what it is on
// the left and what it costs on the right. Flour is ordered, in three sizes, each a button of its
// own on the one row: how many sacks, and the whole price, cart and all, so the saving on a
// large order is there to be read. Under the row, what has been ordered and when it will come.

type MarketProps = { game: Game; frame: Value<number> };

/** The rows are brought up to date this often, in seconds. */
const MARKET_EVERY = 0.2;
const FLOUR = "🌾";
const CART = "🚚";

export const mountMarket = (scope: Scope, { game, frame }: MarketProps): void => {
  const host = document.getElementById("market");
  if (!host) return;

  const row = el("div", "ware sizes");
  const got = el("span", "ware-gets");
  got.append(el("span", "ware-glyph", FLOUR), el("span", "ware-name", "Flour"));
  const sizes = el("span", "ware-sizes");
  row.append(got, sizes);
  host.append(row);
  const rows = ORDER_SIZES.map((sacks) => {
    const cost = orderCost(sacks);
    const button = el("button", "size");
    button.title = `Order ${sacks} sacks of flour: ${sacks * FLOUR_COST} coin, and ${DELIVERY_FEE} for the cart. It comes in ${DELIVERY_HOURS} hours, or first thing tomorrow.`;
    button.setAttribute("aria-label", button.title);
    button.append(el("span", "size-count", `×${sacks}`), el("span", "ware-price", `🪙 ${cost}`));
    scope.listen(button, "click", () => {
      orderFlour(game, sacks);
      refresh();
    });
    sizes.append(button);
    return { cost, button };
  });

  // What is on its way: a cart, what it carries, and when it is due.
  const coming = el("div", "coming");
  coming.setAttribute("role", "list");
  host.append(coming);
  let shown = "";

  const refresh = (): void => {
    for (const { cost, button } of rows) button.disabled = game.coin < cost;
    const due = game.deliveries.filter((d) => d.state !== "leaving");
    const key = due.map((d) => `${d.id}:${d.state}`).join(",");
    if (key === shown) return;
    shown = key;
    coming.replaceChildren(
      ...due.map((d) => {
        const tomorrow = dayOf(d.due) > dayOf(game.clock);
        const at = d.state === "carrying" ? "here" : `${timeText(d.due)}${tomorrow ? " tomorrow" : ""}`;
        const row = el("span", "cart");
        row.setAttribute("role", "listitem");
        row.title = `${d.sacks} sacks of flour, ${d.state === "carrying" ? "being carried in now" : `due at ${at}`}`;
        row.setAttribute("aria-label", row.title);
        row.append(el("span", "cart-glyph", CART), el("span", "cart-load", `${FLOUR} ${d.sacks}`), el("span", "cart-due", d.state === "carrying" ? "🚪" : `${timeText(d.due)}${tomorrow ? " ☾" : ""}`));
        return row;
      }),
    );
  };

  let next = 0;
  scope.effect((use) => {
    const now = use(frame);
    if (now < next) return;
    next = now + MARKET_EVERY;
    refresh();
  });
};
