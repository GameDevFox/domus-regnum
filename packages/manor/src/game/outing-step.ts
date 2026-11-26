import { FACE_ANGLE, giveOrders, go, isIdle, stepIn, stepOut, work } from "../space";
import type { Actor } from "../space";
import { stepBaker } from "./bakery";
import { HOME, THING_IDS } from "./country";
import { bringHome } from "./curios";
import { CROP_IDS } from "./garden";
import { stepGardener } from "./gardener";
import { APPROACHES, goBy, wayIn } from "./grounds";
import { endOuting, partyOutings } from "./outing";
import { atPlace } from "./outing-place";
import { DRIVE_MINUTES, HANDLING_SECONDS } from "./tuning";
import type { Game, Outing } from "./types";
import { WARES, WARE_IDS, takeIn } from "./wares";
import type { GoodId } from "./wares";

// An outing, minute by minute: she puts down what she was at and goes out at the front door and
// down the drive; is off the property, at the place or on the road (outing-place.ts); is seen
// at the gate again a walk up the drive before she is due at the door; and comes in with what
// she has, carrying it through to its shelf.

/** Every kind of goods, in the order they are carried through: what is gathered, then what is grown. */
const GOOD_IDS: GoodId[] = [...THING_IDS, ...CROP_IDS];

/** The shelf a kind of goods is carried to: its own, or, grown in the garden, the pantry's spare shelf, as the gardener carries it. None, it is the house's at once. */
const shelfOf = (game: Game, good: GoodId): string | undefined => game.world.plan.stores[good] ?? ((CROP_IDS as string[]).includes(good) ? game.world.plan.stores.produce : undefined);

/**
 * In at the door, which is when she said she would be. What she came upon, the coin she has, and
 * every ware with no shelf of its own (a book, something to wear) are the house's as she comes in
 * with them. Flour, and goods (what she gathered, and what she took to sell and did not sell), are
 * carried through to their shelves before they can be used: each kind to its own, one after
 * another. True if there is something to carry.
 */
const comeIn = (game: Game, outing: Outing): boolean => {
  bringHome(game, outing);
  game.coin += outing.purse;
  outing.purse = 0;
  for (const ware of WARE_IDS) {
    const count = outing.bought[ware] ?? 0;
    if (ware === "flour" || count === 0) continue;
    // A ware is taken in a lot at a time: a book is read once for each bought.
    for (let lot = 0; lot < Math.round(count / WARES[ware].lot); lot++) takeIn(game, ware, WARES[ware].lot);
    delete outing.bought[ware];
  }
  for (const good of GOOD_IDS) {
    if (!outing.basket[good] || shelfOf(game, good)) continue;
    game.stock[good] += outing.basket[good] ?? 0;
    delete outing.basket[good];
  }
  const kinds = [...((outing.bought.flour ?? 0) > 0 ? ["flour" as const] : []), ...GOOD_IDS.filter((good) => (outing.basket[good] ?? 0) > 0)];
  if (kinds.length === 0) return false;
  giveOrders(game.world, outing.who, kinds.flatMap((kind) => [{ do: "take" as const, goods: kind }, go(kind === "flour" ? game.world.plan.stores.flour : shelfOf(game, kind)!), work(HANDLING_SECONDS, "setting down"), { do: "put" as const }]));
  return true;
};

/** What she carried through is on its shelves. */
const putAway = (game: Game, outing: Outing): void => {
  if (outing.bought.flour) takeIn(game, "flour", outing.bought.flour);
  for (const good of GOOD_IDS) game.stock[good] += outing.basket[good] ?? 0;
};

/** Move one outing on. `standDown` has her put down the job she was at, loaves in her arms apart. */
export const stepOuting = (game: Game, outing: Outing, standDown: (id: string) => void): void => {
  const { world } = game;
  const actor: Actor | undefined = world.actors.find((a) => a.id === outing.who);
  if (outing.state === "leaving" && actor) {
    if (!outing.setOff) {
      // Loaves in her arms are set on the shelf first, as when a job is taken from her.
      if (game.tasks[outing.who]) standDown(outing.who);
      const carrying = game.tasks[outing.who];
      if (carrying?.job === "bake") {
        stepBaker(game, actor, carrying);
        return;
      }
      // …and someone out in the garden comes in first.
      if (carrying?.job === "garden") {
        stepGardener(game, actor, carrying);
        return;
      }
      outing.setOff = true;
      // Out at the front door, and down the drive to the gate.
      giveOrders(world, outing.who, [{ do: "put" }, ...goBy(world, APPROACHES.front)]);
    } else if (isIdle(actor)) {
      outing.gone = stepOut(world, outing.who);
      outing.state = "away";
      // A party sets out together, when the last of it is out at the gate: whoever is there first waits for the rest, gone from the property and not yet on the road.
      const party = partyOutings(game, outing);
      if (party.some((one) => one.state !== "away")) outing.left = null;
      else for (const one of party) one.left = game.clock;
    }
  } else if (outing.state === "away" && outing.gone) {
    if (outing.to !== HOME && game.clock >= outing.arrive) atPlace(game, outing);
    // Turned for home, she is seen at the gate again a walk up the drive before she is due at the door.
    if (!outing.homeward || game.clock < outing.back - DRIVE_MINUTES) return;
    const home = outing.gone;
    outing.gone = null;
    stepIn(world, home, FACE_ANGLE.n);
    giveOrders(world, outing.who, [{ do: "path", points: wayIn(world, APPROACHES.front) }]);
    outing.state = "coming";
  } else if (outing.state === "coming" && actor && isIdle(actor)) {
    if (comeIn(game, outing)) outing.state = "returning";
    else endOuting(game, outing);
  } else if (outing.state === "returning" && actor && isIdle(actor)) {
    putAway(game, outing);
    endOuting(game, outing);
  }
};
