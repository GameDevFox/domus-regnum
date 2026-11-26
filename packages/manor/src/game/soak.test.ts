import { describe, expect, it } from "vitest";

import { playsWholeDays } from "../test-timeout";
import { advance, choose } from "../cutscene";
import { dayOf, isNight } from "./clock";
import { PLACE_IDS } from "./country";
import { outingOf } from "./outing";
import { explore, gather, goTo, sendToTown } from "./outing-send";
import { answer, callHome, cancel, choicesFor } from "./outing-tell";
import { orderFlour } from "./flour";
import { assign, createGame, stepGame } from "./game";
import { CROPS, PLOTS, SQUARES, everySquare, want, wantAll } from "./garden";
import { invent, offered } from "./lab";
import { rand } from "./place";
import { atCounter, whereSheMayBe } from "./test-kit";
import { DAY, HOUR, OUTING_LIMITS, SHOP_SHELF_HOLDS, SPOT, WAKE } from "./tuning";
import type { Game, JobId } from "./types";

playsWholeDays();

// Everything at once, for days, with a careless hand on the controls: jobs given and taken at
// random, people sent out at all hours, flour ordered, inventions made. Nothing here says what
// should happen; it says what must never: stock below nothing, someone through a wall, a night
// that does not end.

const HZ = 30;
const DAYS = 6;
/** Minutes between one careless command and the next. */
const MEDDLE_EVERY = 25;
/** A week of play is some three seconds of stepping on this machine, alone: more when every other test is running beside it. It is given its own limit, since the usual one is for a test that does one thing. */
const WEEK_TIMEOUT_MS = 20_000;
const JOBS: (JobId | null)[] = ["bake", "bake", "shop", "garden", null];
/** Loaves a careless week sells at the least, as a sign that the house did something with it. */
const WEEK_SOLD_AT_LEAST = 25;
/** How many kinds of careless command there are (`meddle`). */
const MEDDLINGS = 12;
/** Three weeks in the ordinary run of the tests; `SOAK_SEEDS=40` plays forty, for a longer look. */
const SEEDS = Array.from({ length: Number(process.env.SOAK_SEEDS ?? 3) }, (_, n) => n + 1);

/** One command chosen by chance. The game's own chance is not used: that would change the day being played. */
const meddle = (game: Game, dice: { rng: number }): void => {
  const pick = <T,>(from: T[]): T => from[Math.floor(rand(dice) * from.length)];
  const who = pick(game.household);
  const what = Math.floor(rand(dice) * MEDDLINGS);
  if (what <= 2) assign(game, who, pick(JOBS));
  else if (what === 3) sendToTown(game, who);
  else if (what === 4) orderFlour(game, pick([4, 12, 24]));
  // Anywhere, the caves too: until there is a way to them she is not sent.
  else if (what === 5) explore(game, who, pick(PLACE_IDS), { limit: pick(OUTING_LIMITS), homeByBed: pick([true, false]) });
  else if (what === 6) gather(game, who, pick(PLACE_IDS), { limit: pick(OUTING_LIMITS), homeByBed: pick([true, false]) });
  // A square of a plot, or the whole of one, is given a crop, or another, or none: one that is pulled when it is picked, or one that bears again.
  else if (what === 7) {
    const plot = Math.floor(rand(dice) * PLOTS);
    const crop = pick([null, "potato", "cucumber"] as const);
    if (rand(dice) < 0.5) wantAll(game, plot, crop);
    else want(game, plot, Math.floor(rand(dice) * SQUARES), crop);
  }
  // Someone out is sent only to go somewhere, called home, or has what she is at cancelled.
  else if (what === 9) goTo(game, who, pick(PLACE_IDS), { limit: pick(OUTING_LIMITS), homeByBed: pick([true, false]) });
  else if (what === 10) callHome(game, who);
  else if (what === 11) cancel(game, who);
  else if (game.lab.ready) invent(game, pick(offered(game)).id);
};

const mustHold = (game: Game, when: string): void => {
  expect(game.coin, `coin ${when}`).toBeGreaterThanOrEqual(0);
  expect(game.flour, `flour ${when}`).toBeGreaterThanOrEqual(0);
  expect(game.shelf.bread, `loaves ${when}`).toBeGreaterThanOrEqual(0);
  for (const [thing, lots] of Object.entries(game.stock)) expect(lots, `${thing} ${when}`).toBeGreaterThanOrEqual(0);
  expect(game.shelf.bread, `loaves ${when}`).toBeLessThanOrEqual(SHOP_SHELF_HOLDS);
  expect(Number.isFinite(game.clock), `the clock ${when}`).toBe(true);
  // Nothing is asked at night: what she does in it is reckoned when the house wakes.
  expect(isNight(game.clock) && game.asks.length > 0, `a question at night ${when}`).toBe(false);
  // Someone a scene has brought on may be out of doors, where there is no floor: the drive is hers to walk.
  const callers = Object.keys(game.scene?.scene.cast ?? {}).filter((who) => !game.household.includes(who));
  for (const actor of game.world.actors.filter((a) => !callers.includes(a.id))) expect(whereSheMayBe(game, actor), `${actor.id} is off the floor ${when}`).toBe(true);
  // Everyone of the household is in the house or out on an errand (or put away while a scene plays), never both and never neither.
  for (const id of game.household) {
    const inHouse = game.world.actors.filter((a) => a.id === id).length;
    const away = outingOf(game, id)?.state === "away" || (game.staged?.actors.some((a) => a.id === id) && inHouse === 0) ? 1 : 0;
    expect(inHouse + away, `${id} ${when}`).toBe(1);
  }
  // Whatever is claimed is claimed by someone who is baking, or carrying her last loaves through.
  for (const [spot, id] of Object.entries(game.claims)) expect(game.tasks[id ?? ""]?.job, `${spot} is held by ${id}, who is not baking, ${when}`).toBe("bake");
  expect(atCounter(game).length, `customers at the counter ${when}`).toBeLessThanOrEqual(SPOT.places.length);
  // In the garden nothing has grown past ripe, and nothing grows where nothing is.
  for (const { bed } of everySquare(game)) {
    expect(bed.grown, `a square's growth ${when}`).toBeLessThanOrEqual(bed.crop ? CROPS[bed.crop].days : 0);
    expect(bed.grown, `a square's growth ${when}`).toBeGreaterThanOrEqual(0);
  }
  expect(new Set(atCounter(game).map((c) => c.place)).size, `customers each at a place of her own ${when}`).toBe(atCounter(game).length);
};

describe("a careless week", () => {
  for (const seed of SEEDS) {
    it(`never breaks the house (seed ${seed})`, () => {
      const game = createGame(undefined, seed);
      const dice = { rng: seed * 7919 };
      game.coin = 200;
      // (A crop that bears again is known as well as the first, so that both kinds are grown.)
      game.garden.known.push("cucumber");
      let nextMeddle = game.clock;
      let lastMorning = 1;
      let nightBegan: number | null = null;
      let steps = 0;
      while (dayOf(game.clock) <= DAYS) {
        stepGame(game, 1 / HZ);
        steps += 1;
        // A scene is moved on as soon as it waits for the player: a line is passed, a question answered by chance.
        if (game.scene?.waiting?.for === "advance") advance(game.scene);
        else if (game.scene?.waiting?.for === "choice") choose(game.scene, Math.floor(rand(dice) * game.scene.waiting.options.length));
        // Whoever asks what she is to do is told something, at once: time stands still until she is.
        if (game.asks.length > 0) {
          const tellable = choicesFor(game, game.asks[0].who).filter((choice) => choice.why === null);
          expect(answer(game, tellable[Math.floor(rand(dice) * tellable.length)].told), "an answer offered as one that can be done is taken").toBe(true);
        }
        if (game.clock >= nextMeddle) {
          meddle(game, dice);
          nextMeddle = game.clock + MEDDLE_EVERY;
        }
        if (steps % HZ === 0) mustHold(game, `on day ${dayOf(game.clock)} at minute ${Math.floor(game.clock % DAY)}`);
        // Every night ends: from bedtime, the house is awake again within the hours an errand sent at the last minute can keep it up.
        if (isNight(game.clock) && nightBegan === null) nightBegan = steps;
        if (!isNight(game.clock) && nightBegan !== null) {
          nightBegan = null;
          lastMorning = dayOf(game.clock);
        }
        if (nightBegan !== null) expect((steps - nightBegan) / HZ, `the night after day ${lastMorning} did not end`).toBeLessThan(4 * HOUR);
      }
      expect(lastMorning).toBe(DAYS + 1 > lastMorning ? lastMorning : DAYS + 1);
      expect(game.clock).toBeGreaterThan(DAYS * DAY + WAKE - DAY);
      // And the house did something with the week. (Less than it once did: told by chance to stay where she is, someone may be out for days, until a job calls her home.)
      expect(game.sold).toBeGreaterThan(WEEK_SOLD_AT_LEAST);
    }, WEEK_TIMEOUT_MS);
  }
});
