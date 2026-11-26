import { describe, expect, it } from "vitest";

import { MAIN_DECK, RARE_DECK } from "./country";
import { curioId, shopId, thingId, wayId, writtenAt } from "./discovery";
import type { Searching } from "./discovery";
import { oddsOf } from "./odds";
import type { Odds, OddsOf } from "./odds";

// The odds of finding each thing a place holds, by the minutes spent looking (odds.ts): reckoned
// by playing the place over many times with the game's own draws.

const EXPLORE = { how: "explore" } as const;
/** A deck of a made-up place, with a draw a minute of gathering. */
const deck = (dials: Omit<Searching, "id" | "gather">, id = MAIN_DECK): Searching => ({ id, gather: 1, ...dials });
/** The longest the tablet can take, gathering: every one of its deck's 1080 points drawn at one a minute (exploring, at two a minute, half as long). */
const TABLET_LATEST = 1080;
const of = (odds: Odds, id: string): OddsOf => odds.of.find((one) => one.id === id) as OddsOf;

describe("the odds of a place", () => {
  /** One point among ten, a draw a minute: it is as likely to be the first drawn as the last. */
  const ONE_IN_TEN: Searching = deck({ finds: [{ id: "a", pool: 1, need: 1, lingers: false }], blanks: 9, aimed: 0, stray: 1, aim: "rolled" });

  it("are, minute by minute, the share of games in which the thing had been found by then: one point in ten is a tenth more each minute", () => {
    const odds = oddsOf([ONE_IN_TEN], EXPLORE);
    expect(odds.minutes).toBe(10);
    const { by } = of(odds, "a");
    expect(by.length).toBe(11);
    expect(by[0]).toBe(0);
    for (let minute = 1; minute <= 10; minute++) expect(by[minute], `minute ${minute}`).toBeCloseTo(minute / 10, 1);
    expect(by[10]).toBe(1);
  });

  it("say when it is found as a rule, and between when mostly: by which minute in a tenth, a half and nine tenths of games", () => {
    const { early, typical, late, never } = of(oddsOf([ONE_IN_TEN], EXPLORE), "a");
    // (A tenth of games at the first minute, more or less: so the tenth game is found at the first minute or the second.)
    expect([1, 2]).toContain(early);
    expect([5, 6]).toContain(typical);
    expect([9, 10]).toContain(late);
    expect((early ?? 0) < (typical ?? 0) && (typical ?? 0) < (late ?? 0)).toBe(true);
    expect(never).toBe(0);
  });

  it("are the same for the same dice, and not for other dice", () => {
    const again = (seed: number): number[] => of(oddsOf([ONE_IN_TEN], { ...EXPLORE, seed }), "a").by;
    expect(again(4)).toEqual(again(4));
    expect(again(4)).not.toEqual(again(5));
  });

  it("run no longer than the points last, nor than the longest a game may go on; and say how often a thing was not found in that time", () => {
    const slow: Searching = deck({ finds: [{ id: "a", pool: 1, need: 1, lingers: false }], blanks: 99, aimed: 0, stray: 1, aim: "rolled" });
    const odds = oddsOf([slow], { ...EXPLORE, longest: 25 });
    expect(odds.minutes).toBeLessThanOrEqual(25);
    expect(of(odds, "a").never).toBeCloseTo(0.75, 1);
    // Not found in half of games within the time: there is no minute by which it is found as a rule.
    expect(of(odds, "a")).toMatchObject({ typical: null, late: null });
    // What can never be found, needing more points than there are of it, never is.
    const never: Searching = deck({ finds: [{ id: "a", pool: 2, need: 3, lingers: false }], blanks: 0, aimed: 0, stray: 1, aim: "rolled" });
    expect(of(oddsOf([never], EXPLORE), "a")).toMatchObject({ never: 1, typical: null, first: 0, last: 0 });
    // And beside something that never is, nothing is the last found: the last is only the last when everything has been.
    const beside: Searching = deck({ finds: [{ id: "found", pool: 5, need: 1, lingers: false }, { id: "a", pool: 2, need: 3, lingers: false }], blanks: 0, aimed: 0, stray: 1, aim: "rolled" });
    expect(of(oddsOf([beside], EXPLORE), "found")).toMatchObject({ never: 0, first: 1, last: 0 });
  });

  it("say how often each thing is the first found, and the last: the plentiful first, the scarce last", () => {
    const pair: Searching = deck({ finds: [{ id: "plenty", pool: 9, need: 1, lingers: false }, { id: "scarce", pool: 1, need: 1, lingers: false }], blanks: 0, aimed: 0, stray: 1, aim: "rolled" });
    const odds = oddsOf([pair], EXPLORE);
    expect(of(odds, "plenty").first).toBeCloseTo(0.9, 1);
    expect(of(odds, "scarce").last).toBeCloseTo(0.9, 1);
    expect(of(odds, "plenty").first + of(odds, "scarce").first).toBeCloseTo(1, 6);
  });

  it("are of the draws the deck makes: aimed, things are found at an even beat; and more draws a minute find them sooner", () => {
    const two: Searching = deck({ finds: [{ id: "a", pool: 10, need: 10, lingers: false }, { id: "b", pool: 10, need: 10, lingers: false }], blanks: 50, aimed: 1, stray: 0, aim: "rolled" });
    const beat = oddsOf([two], EXPLORE);
    // One of the two at ten minutes, as often the one as the other; both at twenty.
    expect(of(beat, "a").by[9]).toBe(0);
    expect(of(beat, "a").by[10] + of(beat, "b").by[10]).toBeCloseTo(1, 6);
    expect(of(beat, "a").by[20]).toBe(1);
    expect(beat.minutes).toBe(20);
    const faster = oddsOf([{ ...ONE_IN_TEN, stray: 5 }], EXPLORE);
    expect(faster.minutes).toBe(2);
  });

  it("are reckoned over fewer games where a place has a great many points, and never over too few", () => {
    expect(oddsOf([ONE_IN_TEN], EXPLORE).games).toBe(2000);
    const vast: Searching = deck({ finds: [{ id: "a", pool: 5, need: 1, lingers: false }], blanks: 100_000, aimed: 0, stray: 4, aim: "rolled" });
    const fewer = oddsOf([vast], EXPLORE).games;
    expect(fewer).toBeLessThan(2000);
    expect(fewer).toBeGreaterThan(200);
    // At sixty draws a minute for ten hours a game, the draws there are to spend would run to a few dozen games: two hundred are played all the same.
    expect(oddsOf([{ ...vast, stray: 60 }], EXPLORE).games).toBe(200);
  });

  it("of nothing, or with no draws made, are nothing", () => {
    expect(oddsOf([deck({ finds: [], blanks: 0, aimed: 0, stray: 4, aim: "rolled" })], EXPLORE)).toMatchObject({ minutes: 0, of: [] });
    expect(oddsOf([{ ...ONE_IN_TEN, stray: 0 }], EXPLORE)).toMatchObject({ minutes: 0, of: [{ id: "a", by: [0], never: 1 }] });
  });
});

describe("the odds of a place of several decks", () => {
  /** One point among ten, made up: drawn from once a minute exploring, unless another rate is given. */
  const tenth = (id: string, stray = 1, gather = 1): Searching => ({ ...deck({ finds: [{ id, pool: 1, need: 1, lingers: false }], blanks: 9, aimed: 0, stray, aim: "rolled" }, `deck ${id}`), gather });

  it("are of every deck played together, each at its own draws a minute: a thing is found at its own deck's pace, whatever the others' are", () => {
    const odds = oddsOf([tenth("slow"), tenth("fast", 5)], EXPLORE);
    // The slow deck's ten points last ten minutes, and the game as long; the fast one's are gone in two.
    expect(odds.minutes).toBe(10);
    expect(of(odds, "fast").by[2]).toBe(1);
    expect(of(odds, "slow").by[2]).toBeCloseTo(0.2, 1);
    expect(of(odds, "slow").by[10]).toBe(1);
    // What is first and last found is of the whole place.
    expect(of(odds, "fast").first).toBeGreaterThan(0.75);
    expect(of(odds, "slow").last).toBeCloseTo(of(odds, "fast").first, 6);
  });

  it("for someone gathering, are of each deck's own draws a minute of gathering", () => {
    const odds = oddsOf([tenth("slow", 1, 5), tenth("fast", 5, 1)], { how: "gather" });
    expect(of(odds, "slow").by[2]).toBe(1);
    expect(of(odds, "fast").by[2]).toBeCloseTo(0.2, 1);
    expect(odds.minutes).toBe(10);
  });
});

describe("the odds of the places there are", () => {
  it("in the forest: berries in about a quarter of an hour, herbs in about half an hour, the way on late, and all within its 82 minutes", () => {
    // (Of its main deck: the stone tablet's deck beside it is reckoned below.)
    const odds = oddsOf(writtenAt("forest").filter((one) => one.id === MAIN_DECK), EXPLORE);
    expect(odds.minutes).toBeLessThanOrEqual(82);
    expect(of(odds, thingId("berries")).typical).toBeGreaterThan(12);
    expect(of(odds, thingId("berries")).typical).toBeLessThan(22);
    expect(of(odds, thingId("herbs")).typical).toBeGreaterThan(22);
    expect(of(odds, thingId("herbs")).typical).toBeLessThan(34);
    expect(of(odds, wayId("caves")).typical).toBeGreaterThan(40);
    expect(of(odds, wayId("caves")).last).toBeGreaterThan(0.8);
  });

  it("in the town: the miller's the first found in a third of games, the herbalist's stall the last in more than half", () => {
    const odds = oddsOf(writtenAt("town"), EXPLORE);
    expect(of(odds, shopId("miller")).first).toBeCloseTo(6 / 17, 1);
    expect(of(odds, shopId("herbalist")).last).toBeGreaterThan(0.5);
    expect(odds.minutes).toBeLessThanOrEqual(150);
  });

  it("in the forest's rare deck, the stone tablet: within 540 minutes of exploring at the latest and half that as a rule; at gathering's one draw a minute, twice as long", () => {
    const tablet = (how: "explore" | "gather"): OddsOf => of(oddsOf(writtenAt("forest"), { how, longest: TABLET_LATEST }), curioId("tablet"));
    const exploring = tablet("explore");
    expect(exploring.never).toBe(0);
    expect(exploring.by[exploring.by.length - 1]).toBe(1);
    expect(exploring.by.length - 1).toBeLessThanOrEqual(TABLET_LATEST / 2);
    expect(exploring.typical).toBeGreaterThan(220);
    expect(exploring.typical).toBeLessThan(320);
    const gathering = tablet("gather");
    expect(gathering.never).toBe(0);
    expect(gathering.by.length - 1).toBeLessThanOrEqual(TABLET_LATEST);
    expect(gathering.typical).toBeGreaterThan(460);
    expect(gathering.typical).toBeLessThan(620);
    // (Its deck is the rare one, and the forest's own things are not in it.)
    expect(writtenAt("forest").find((one) => one.id === RARE_DECK)?.finds.map((find) => find.id)).toEqual([curioId("tablet")]);
  });
});
