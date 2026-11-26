import { describe, expect, it } from "vitest";

import { BAKES } from "./bakes";
import { APPROACHES, comeBy } from "./grounds";
import { stepCustomers, stepKeeper } from "./shop";
import { gameAt, person, until } from "./test-kit";
import { isIdle } from "../space";
import { CUSTOMER_PATIENCE, TILL_SECONDS } from "./tuning";
import type { Customer, Game, Task } from "./types";

// The shop (shop.ts), at the moments where a customer is served or given up on, and the minute
// the next one comes in at the gate, for customers and shelves made up whole.

/** A customer already at the counter in the given state, with a figure on the property. */
const standing = (game: Game, state: Customer["state"], waited: number, id = "customer-9"): Customer => {
  comeBy(game.world, APPROACHES.shop, { id, name: "A customer", sprite: "townsman" });
  const customer: Customer = { id, place: 0, state, waited };
  game.customers.push(customer);
  return customer;
};
const withTill = (game: Game): void => {
  game.devices.push("till");
};

describe("a clockwork till", () => {
  it("serves a customer who has waited as long as the till takes, to the second", () => {
    const game = gameAt();
    withTill(game);
    game.shelf.bread = 2;
    const customer = standing(game, "waiting", TILL_SECONDS);
    const coin = game.coin;
    stepCustomers(game, 0);
    expect(customer.state).toBe("leaving");
    expect(game.shelf.bread).toBe(1);
    expect(game.coin).toBe(coin + BAKES.bread.price);
    expect(game.sold).toBe(1);
    expect(game.today.sold).toBe(1);
  });

  it("does not serve one who has waited less", () => {
    const game = gameAt();
    withTill(game);
    game.shelf.bread = 2;
    const customer = standing(game, "waiting", TILL_SECONDS - 0.5);
    stepCustomers(game, 0);
    expect(customer.state).toBe("waiting");
    expect(game.shelf.bread).toBe(2);
  });

  it("does not serve herself where there is no till, however long she has waited", () => {
    const game = gameAt();
    game.shelf.bread = 2;
    const customer = standing(game, "waiting", TILL_SECONDS + 1);
    stepCustomers(game, 0);
    expect(customer.state).toBe("waiting");
    expect(game.shelf.bread).toBe(2);
  });
});

describe("a customer's patience", () => {
  it("runs out when she has waited as long as she will, to the second: she goes without", () => {
    const game = gameAt();
    const customer = standing(game, "waiting", CUSTOMER_PATIENCE - 1);
    stepCustomers(game, 0);
    expect(customer.state).toBe("waiting");
    const last = standing(game, "waiting", CUSTOMER_PATIENCE, "customer-10");
    stepCustomers(game, 0);
    expect(last.state).toBe("leaving");
    expect(game.lost).toBe(1);
    expect(game.today.lost).toBe(1);
  });
});

describe("the next customer coming in at the gate", () => {
  it("comes when the time until the next has run down to nothing, exactly", () => {
    const game = gameAt();
    withTill(game);
    game.untilCustomer = 0;
    stepCustomers(game, 0);
    expect(game.arrivals).toBe(1);
    expect(game.customers).toHaveLength(1);
    expect(game.untilCustomer).toBeGreaterThan(0);
  });

  it("does not come while there is still time to wait", () => {
    const game = gameAt();
    withTill(game);
    game.untilCustomer = 3;
    stepCustomers(game, 1);
    expect(game.arrivals).toBe(0);
    expect(game.untilCustomer).toBe(2);
  });
});

describe("the keeper at the counter", () => {
  /** The keeper, idle, in the middle of fetching a loaf for a customer at the counter. */
  const serving = (game: Game, customerId: string): { task: Task & { job: "shop" }; keeper: ReturnType<typeof person> } => {
    const keeper = person(game, "evelyn");
    until(game, () => isIdle(keeper), 120);
    return { keeper, task: { job: "shop", step: "serve", customer: customerId } };
  };

  it("puts back in the queue a customer whose loaf was taken by another while she fetched it, and is no longer serving her", () => {
    const game = gameAt();
    game.shelf.bread = 0;
    game.shelf.pie = 0;
    const customer = standing(game, "attended", 3);
    const { keeper, task } = serving(game, customer.id);
    stepKeeper(game, keeper, task);
    expect(customer.state).toBe("waiting");
    expect(task.customer).toBeNull();
  });

  it("serves a customer from the shelf, and is no longer serving her", () => {
    const game = gameAt();
    game.shelf.bread = 1;
    game.shelf.pie = 0;
    const customer = standing(game, "attended", 3);
    const { keeper, task } = serving(game, customer.id);
    const coin = game.coin;
    stepKeeper(game, keeper, task);
    expect(customer.state).toBe("leaving");
    expect(game.coin).toBe(coin + BAKES.bread.price);
    expect(task.customer).toBeNull();
  });

  it("does not fall over for a customer who has gone from the counter", () => {
    const game = gameAt();
    game.shelf.bread = 1;
    const { keeper, task } = serving(game, "customer-gone");
    expect(() => stepKeeper(game, keeper, task)).not.toThrow();
    expect(game.shelf.bread).toBe(1);
  });
});
