import { giveOrders, go, isIdle, removeActor, work } from "../space";
import type { Actor } from "../space";
import { shopHours } from "./clock";
import { BAKES, bestOnShelf } from "./bakes";
import { APPROACHES, comeBy, goBy } from "./grounds";
import { isAt, rand } from "./place";
import { hasDevice } from "./lab";
import { CUSTOMER_EVERY, CUSTOMER_PATIENCE, REACH_SECONDS, SERVE_SECONDS, SPOT, TILL_SECONDS } from "./tuning";
import type { Customer, Game, Task } from "./types";

// The shop: while somebody keeps it customers come in at the gate, walk up to the street door
// and in at it. One who finds a place free at the counter stands at it, and is served a loaf
// from the shelf behind it in the order they came (or a pie, if there is one: the best thing on
// the shelf, bakes.ts); one who finds the counter full walks out
// again, and one who waits too long goes away with nothing. Each goes off the way she came.

const CUSTOMER_SPRITES = ["townswoman", "townsman"];

/** A customer is sold the best thing on the shelf, and goes off with it. False if the shelf is bare. */
const sell = (game: Game, customer: Customer): boolean => {
  const goods = bestOnShelf(game);
  if (goods === null) return false;
  game.shelf[goods] -= 1;
  game.coin += BAKES[goods].price;
  game.sold += 1;
  game.today.sold += 1;
  customer.state = "leaving";
  giveOrders(game.world, customer.id, [{ do: "take", goods }, ...goBy(game.world, APPROACHES.shop)]);
  return true;
};

/** Whoever has stood at the counter longest without being seen to. */
const nextInTurn = (game: Game): Customer | undefined => game.customers.filter((c) => c.state === "waiting").sort((a, b) => b.waited - a.waited)[0];

export const stepKeeper = (game: Game, actor: Actor, task: Task & { job: "shop" }): void => {
  if (!isIdle(actor)) return;
  const { world } = game;
  if (task.step === "serve") {
    const customer = game.customers.find((c) => c.id === task.customer);
    // The loaf she reached down is hers to sell, unless a customer at the till has had the last one
    // meanwhile: then hers goes on waiting, in her turn.
    if (customer?.state === "attended" && !sell(game, customer)) customer.state = "waiting";
  }
  task.step = null;
  task.customer = null;
  const goods = bestOnShelf(game);
  const next = goods !== null ? nextInTurn(game) : undefined;
  if (next && goods !== null) {
    next.state = "attended";
    task.step = "serve";
    task.customer = next.id;
    giveOrders(world, actor.id, [go(SPOT.reach), work(REACH_SECONDS, "fetching"), { do: "take", goods }, go(SPOT.counter), work(SERVE_SECONDS, "serving"), { do: "put" }]);
  } else if (!isAt(world, actor, SPOT.counter)) {
    task.step = "return";
    giveOrders(world, actor.id, [go(SPOT.counter)]);
  }
};

/** Someone goes without bread: she gave up waiting for it, or found the counter full and walked on. */
const turnAway = (game: Game): void => {
  game.lost += 1;
  game.today.lost += 1;
};

/** The shop is open in shop hours, while somebody has the job of keeping it and is in the house to do it; or, with a clockwork till, with nobody at all. */
export const shopOpen = (game: Game): boolean => shopHours(game.clock) && (hasDevice(game, "till") || game.household.some((id) => game.posts[id] === "shop" && !game.outings.some((o) => o.who === id)));

/** Someone comes onto the property, bound for the shop. */
const arrive = (game: Game): void => {
  game.arrivals += 1;
  const id = `customer-${game.arrivals}`;
  comeBy(game.world, APPROACHES.shop, { id, name: "A customer", sprite: CUSTOMER_SPRITES[Math.floor(rand(game) * CUSTOMER_SPRITES.length)] });
  game.customers.push({ id, place: null, state: "coming", waited: 0 });
};

/** She is in at the shop's door: she goes to a place at the counter if one is free, and if every one is taken she walks out again, and goes without. */
const atTheDoor = (game: Game, customer: Customer): void => {
  const taken = new Set(game.customers.map((c) => (c.state === "leaving" ? null : c.place)));
  const place = SPOT.places.findIndex((_, n) => !taken.has(n));
  if (place === -1) {
    turnAway(game);
    customer.state = "leaving";
    giveOrders(game.world, customer.id, goBy(game.world, APPROACHES.shop));
    return;
  }
  customer.place = place;
  customer.state = "arriving";
  giveOrders(game.world, customer.id, [go(SPOT.places[place])]);
};

export const stepCustomers = (game: Game, dt: number): void => {
  if (shopOpen(game)) {
    game.untilCustomer -= dt;
    if (game.untilCustomer <= 0) {
      arrive(game);
      game.untilCustomer = (CUSTOMER_EVERY / game.custom) * (0.5 + rand(game));
    }
  }
  for (const customer of [...game.customers]) {
    const actor = game.world.actors.find((a) => a.id === customer.id);
    const arrived = !actor || isIdle(actor);
    if (customer.state === "coming" && arrived) atTheDoor(game, customer);
    else if (customer.state === "arriving" && arrived) customer.state = "waiting";
    else if (customer.state === "waiting") {
      customer.waited += dt;
      // At a clockwork till she helps herself, if there is a loaf and nobody is already fetching one for her.
      if (hasDevice(game, "till") && customer.waited >= TILL_SECONDS && sell(game, customer)) continue;
      if (customer.waited >= CUSTOMER_PATIENCE) {
        turnAway(game);
        customer.state = "leaving";
        giveOrders(game.world, customer.id, goBy(game.world, APPROACHES.shop));
      }
    } else if (customer.state === "leaving" && arrived) {
      removeActor(game.world, customer.id);
      game.customers.splice(game.customers.indexOf(customer), 1);
    }
  }
};
