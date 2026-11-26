import { describe, expect, it } from "vitest";

import { outOfDoors, spotOf } from "../space";
import { assign } from "./game";
import { GATE, toTheRight } from "./grounds";
import { outingOf } from "./outing";
import { sendToTown } from "./outing-send";
import { atCounter, gameAt, person, roomOf, run, until, whereSheMayBe } from "./test-kit";
import { DRIVE_MINUTES } from "./tuning";
import { SPOT } from "./tuning";
import type { Game } from "./types";

// Visitors are seen from the moment they are on the property: they come in at its edge, walk up
// to a door, and go off the way they came. (The carter's way is in flour.test.ts.)

const near = (a: { x: number; z: number }, b: { x: number; z: number }, within: number): boolean => Math.hypot(a.x - b.x, a.z - b.z) < within;
/** Where the drive meets the walk along the shop front, and where that walk meets the shop's steps: the two corners of a customer's way. */
const CORNERS = [{ x: 10, z: 13.7 }, { x: 3.25, z: 13.7 }];
/** How near the middle of the gate, or a corner of the way, she is when she is at it, in metres: she keeps a little to her right of the way. */
const AT_THE_GATE = 0.4;
const AT_A_CORNER = 0.7;
/** The shop is kept, there is bread, and the first customer has just come onto the property. */
const firstCustomer = (): { game: Game; id: string } => {
  const game = gameAt();
  until(game, () => game.arrivals === 1, 120);
  return { game, id: game.customers[0].id };
};
/** Follow someone until something is so of her, noting each kind of place she is in as she comes to it, and that she is never where she may not be. */
const follow = (game: Game, id: string, so: () => boolean, been: string[] = []): string[] => {
  until(game, () => {
    const actor = game.world.actors.find((a) => a.id === id);
    if (!actor || so()) return true;
    const room = roomOf(game, id) ?? "out of doors";
    if (been[been.length - 1] !== room) been.push(room);
    expect(whereSheMayBe(game, actor), `${id} is off her way`).toBe(true);
    return false;
  }, 180);
  return been;
};

describe("a customer", () => {
  it("is first seen at the gate, out of doors, with no place at the counter yet", () => {
    const { game, id } = firstCustomer();
    // (To her right of the middle of the gate: the east, as she faces the house.)
    expect(near(person(game, id).walker.pos, GATE, AT_THE_GATE)).toBe(true);
    expect(person(game, id).walker.pos.x).toBeGreaterThan(GATE.x);
    expect(outOfDoors(game.world, person(game, id))).toBe(true);
    // She faces up the drive, to the north, as she comes in: she does not turn about on the spot first.
    expect(Math.cos(person(game, id).walker.heading)).toBeCloseTo(-1, 6);
    expect(game.customers[0]).toMatchObject({ state: "coming", place: null });
    expect(atCounter(game)).toEqual([]);
  });

  it("walks up the drive, along the shop front and in at the shop's street door, and then to a place at the counter", () => {
    const { game, id } = firstCustomer();
    const turned = CORNERS.map(() => false);
    let cameInAt = { x: 0, z: 0 };
    const been = follow(game, id, () => {
      CORNERS.forEach((corner, n) => (turned[n] ||= near(person(game, id).walker.pos, corner, AT_A_CORNER)));
      if (game.customers[0].state === "coming") cameInAt = { ...person(game, id).walker.pos };
      return game.customers[0].state === "waiting";
    });
    expect(been).toEqual(["out of doors", "shop"]);
    expect(turned).toEqual([true, true]);
    // She comes in at the middle of the door, whichever side of the way she kept to.
    expect(near(cameInAt, spotOf(game.world, SPOT.door), 0.05)).toBe(true);
    expect(game.customers[0].place).toBe(0);
  });

  it("is a while about it: the house sees her coming for a good ten seconds before she is in at the door", () => {
    const { game, id } = firstCustomer();
    const from = game.world.t;
    until(game, () => !outOfDoors(game.world, person(game, id)), 60);
    expect(game.world.t - from).toBeGreaterThan(10);
    expect(game.world.t - from).toBeLessThan(20);
    // She has not been given a place while she walked: that is found at the door.
    expect(game.customers[0].state).toBe("coming");
  });

  it("served, goes off the way she came with her loaf, and is gone at the gate", () => {
    const { game, id } = firstCustomer();
    follow(game, id, () => game.customers[0].state === "leaving");
    expect(game.sold).toBe(1);
    let last = { ...person(game, id).walker.pos };
    const been = follow(game, id, () => {
      last = { ...person(game, id).walker.pos };
      return false;
    });
    expect(been).toEqual(["shop", "out of doors"]);
    // Gone at the gate, on the other side of it from the one she came in at: those coming and those going pass.
    expect(near(last, GATE, AT_THE_GATE)).toBe(true);
    expect(last.x).toBeLessThan(GATE.x);
    expect(game.customers.some((c) => c.id === id)).toBe(false);
  });

  it("who gives up waiting goes off the same way, with nothing", () => {
    const { game, id } = firstCustomer();
    assign(game, "rose", null);
    follow(game, id, () => game.customers[0].state === "leaving");
    expect(game.sold).toBe(0);
    let last = { ...person(game, id).walker.pos };
    const been = follow(game, id, () => {
      last = { ...person(game, id).walker.pos };
      return false;
    });
    expect(been).toEqual(["shop", "out of doors"]);
    expect(near(last, GATE, AT_THE_GATE)).toBe(true);
  });

  it("who finds the counter full comes in at the door, walks out again, and has gone without", () => {
    const game = gameAt();
    assign(game, "evelyn", null);
    game.shelf.bread = 0;
    game.custom = 6;
    until(game, () => atCounter(game).length === 3, 120);
    // The next to come up the drive finds no place.
    until(game, () => game.customers.some((c) => c.state === "coming"), 60);
    const unlucky = game.customers.find((c) => c.state === "coming");
    if (!unlucky) throw new Error("nobody is coming");
    const lost = game.lost;
    const been = follow(game, unlucky.id, () => false);
    expect(been).toEqual(["out of doors", "shop", "out of doors"]);
    expect(unlucky.place).toBeNull();
    expect(game.lost).toBeGreaterThan(lost);
  });
});

describe("keeping to the right of a way", () => {
  it("is a line beside the line, on the walker's own right: east as she walks north, west as she walks south", () => {
    const north = toTheRight([{ x: 0, z: 10 }, { x: 0, z: 0 }]);
    expect(north[0].x).toBeGreaterThan(0);
    expect(north).toEqual([{ x: north[0].x, z: 10 }, { x: north[0].x, z: 0 }]);
    const south = toTheRight([{ x: 0, z: 0 }, { x: 0, z: 10 }]);
    expect(south[0].x).toBeCloseTo(-north[0].x, 9);
  });

  it("is as far to the right at a point part-way along a straight stretch as at its ends", () => {
    const [first, middle, last] = toTheRight([{ x: 0, z: 10 }, { x: 0, z: 5 }, { x: 0, z: 0 }]);
    expect(middle.x).toBeCloseTo(first.x, 9);
    expect(last.x).toBeCloseTo(first.x, 9);
    expect(middle.z).toBeCloseTo(5, 9);
  });

  it("turns a corner on the inside or the outside of it, as far from the one stretch as from the other", () => {
    // North, then west: her right is east, then north. The corner of the line beside is east and north of the corner.
    const [start, corner, end] = toTheRight([{ x: 0, z: 10 }, { x: 0, z: 0 }, { x: -10, z: 0 }]);
    expect(corner.x).toBeCloseTo(start.x, 9);
    expect(corner.z).toBeCloseTo(end.z, 9);
    expect(corner.z).toBeCloseTo(-start.x, 9);
  });
});

describe("the household", () => {
  it("are not seen out of doors while nobody is sent anywhere", () => {
    const game = gameAt();
    run(game, 240, () => {
      for (const id of game.household) {
        const actor = game.world.actors.find((a) => a.id === id);
        if (actor) expect(outOfDoors(game.world, actor), `${id} is out of doors`).toBe(false);
      }
    });
  });

  it("sent to a place on the map, walk out at the front door and down the drive, and are gone at the gate: not at the door", () => {
    const game = gameAt(9 * 60);
    game.coin = 100;
    sendToTown(game, "sage", "flour", true);
    let onDrive = 0;
    until(game, () => {
      const sage = game.world.actors.find((a) => a.id === "sage");
      if (!sage) return true;
      expect(whereSheMayBe(game, sage), "she is off her way").toBe(true);
      if (outOfDoors(game.world, sage)) onDrive += 1;
      return false;
    }, 120);
    // Some seconds of walking out of doors, and the last that is seen of her is at the gate, on her right of it going out.
    expect(onDrive).toBeGreaterThan(60 * 4);
    const gone = outingOf(game, "sage")?.gone?.walker.pos;
    expect(near(gone ?? { x: 0, z: 0 }, GATE, AT_THE_GATE)).toBe(true);
    expect(gone?.x).toBeLessThan(GATE.x);
    expect(outingOf(game, "sage")).toMatchObject({ state: "away", left: game.clock });
  });

  it("come home by the gate and the drive: seen there a walk before they are due, and in at the front door when they said", () => {
    const game = gameAt(9 * 60);
    game.coin = 100;
    sendToTown(game, "sage", "flour", true);
    const outing = outingOf(game, "sage");
    if (!outing) throw new Error("she was not sent");
    until(game, () => outing.state === "coming", 4 * 60);
    const sage = person(game, "sage");
    expect(game.clock).toBeCloseTo(outing.back - DRIVE_MINUTES, 0);
    expect(near(sage.walker.pos, GATE, AT_THE_GATE)).toBe(true);
    until(game, () => {
      expect(whereSheMayBe(game, sage), "she is off her way").toBe(true);
      return outing.state !== "coming";
    }, 60);
    // At the door when she said she would be, not before: and in the hall.
    expect(game.clock).toBeCloseTo(outing.back, 0);
    expect(roomOf(game, "sage")).toBe("hall");
    expect(outing.state).toBe("returning");
  });
});
