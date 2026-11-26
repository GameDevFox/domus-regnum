import { giveOrders, go, isIdle, removeActor, work } from "../space";
import { minuteOfDay } from "./clock";
import { APPROACHES, comeBy, goBy } from "./grounds";
import { CART_FROM, CART_UNTIL, DAY, DELIVERY_FEE, DELIVERY_HOURS, FLOUR_COST, HANDLING_SECONDS, HOUR } from "./tuning";
import type { Game } from "./types";

// Flour is ordered, not bought off a shelf: it is paid for at once, with a fee for the cart
// whatever its load, and it comes some hours later. The carter brings it in at the kitchen's
// back door and sets it on the pantry shelf himself; only then is it there to bake with.

const CARTER_SPRITE = "townsman";

/** What an order costs: the sacks, and the cart. */
export const orderCost = (sacks: number): number => sacks * FLOUR_COST + DELIVERY_FEE;

/** When an order placed now will be at the door: so many hours on, or first thing tomorrow if that is after the carter's day. */
export const dueAt = (clock: number): number => {
  const at = clock + DELIVERY_HOURS * HOUR;
  const minute = minuteOfDay(at);
  const midnight = at - minute;
  if (minute < CART_FROM) return midnight + CART_FROM;
  return minute <= CART_UNTIL ? at : midnight + DAY + CART_FROM;
};

/** Order so many sacks, if there is the coin for them and for the cart. */
export const orderFlour = (game: Game, sacks: number): boolean => {
  const cost = orderCost(sacks);
  if (sacks < 1 || game.coin < cost) return false;
  game.coin -= cost;
  game.orders += 1;
  game.deliveries.push({ id: `carter-${game.orders}`, sacks, ordered: game.clock, due: dueAt(game.clock), state: "coming" });
  return true;
};

/** Sacks paid for and not yet on the pantry shelf. */
export const flourOnItsWay = (game: Game): number => game.deliveries.filter((d) => d.state !== "leaving").reduce((sum, d) => sum + d.sacks, 0);

export const stepDeliveries = (game: Game): void => {
  const { world } = game;
  for (const delivery of [...game.deliveries]) {
    if (delivery.state === "coming") {
      if (game.clock < delivery.due) continue;
      // His cart is in the lane: he carries the sacks up the back path and in.
      comeBy(world, APPROACHES.back, { id: delivery.id, name: "The carter", sprite: CARTER_SPRITE }, [go(world.plan.stores.flour), work(HANDLING_SECONDS, "setting down"), { do: "put" }]).carrying = "flour";
      delivery.state = "carrying";
      continue;
    }
    const carter = world.actors.find((a) => a.id === delivery.id);
    if (carter && !isIdle(carter)) continue;
    if (delivery.state === "carrying") {
      game.flour += delivery.sacks;
      delivery.state = "leaving";
      giveOrders(world, delivery.id, goBy(world, APPROACHES.back));
    } else {
      removeActor(world, delivery.id);
      game.deliveries.splice(game.deliveries.indexOf(delivery), 1);
    }
  }
};
