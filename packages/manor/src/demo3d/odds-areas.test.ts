import { afterEach, describe, expect, it } from "vitest";

import { GATHER_DRAWS, MAIN_DECK, createGame, retune, writtenAt } from "../game";
import { MOST_BUCKETS, areaOf, bucketsOf, copyOf, figuresOf, keptAreas, liveAreas, newArea, newBucket, newDeck, searchingOf, within } from "./odds-areas";
import type { Area } from "./odds-areas";

// The areas the odds window shows (odds-areas.ts): the game's places, and areas of one's own.

/** A game with no edits of its own: its places' dials are as the code has them. */
const GAME = createGame(undefined, 1);

describe("the game's places, as areas", () => {
  it("are those that hold anything to find, each with its decks, its things named and its dials as the game has them", () => {
    expect(liveAreas(GAME).map((area) => [area.id, area.name, area.place])).toEqual([["place:town", "The town", "town"], ["place:forest", "The forest", "forest"]]);
    const forest = areaOf(GAME, "forest");
    expect(forest.decks.map((deck) => deck.id)).toEqual(["main", "rare"]);
    expect(bucketsOf(forest).map((b) => `${b.glyph} ${b.name}: ${b.pool}/${b.need}${b.lingers ? " stays" : ""}${b.hidden ? " hidden" : ""}`)).toEqual(["🗺️ The way on to the caves: 8/6", "🫐 Berries: 200/40 stays", "🌿 Herbs: 120/40 stays", "🪨 A stone tablet: 1/1 hidden"]);
    // Each thing has a colour of its own, across all the decks.
    expect(bucketsOf(forest).map((b) => b.slot)).toEqual([0, 1, 2, 3]);
    expect(forest.decks[1]).toMatchObject({ blanks: 1079, stray: 2, aimed: 0, gather: 1 });
    expect(bucketsOf(areaOf(GAME, "town")).map((b) => b.name)).toContain("The miller's");
  });

  it("give the game's rules back the very dials they were made of", () => {
    expect(searchingOf(areaOf(GAME, "forest"))).toEqual(writtenAt("forest"));
    expect(searchingOf(areaOf(GAME, "town"))).toEqual(writtenAt("town"));
  });

  it("are as they stand in the game they are of: a game's own edit is in its area, and in no other game's", () => {
    const edited = createGame(undefined, 1);
    const forest = areaOf(edited, "forest");
    const [main, rare] = searchingOf(forest);
    retune(edited, "forest", MAIN_DECK, { ...main, blanks: 77 });
    expect(searchingOf(areaOf(edited, "forest"))).toEqual([{ ...main, blanks: 77 }, rare]);
    expect(searchingOf(areaOf(createGame(undefined, 1), "forest"))).toEqual(writtenAt("forest"));
  });
});

describe("an area of one's own", () => {
  it("is nowhere in the game, begins with two things, and has a name no other has", () => {
    const first = newArea(liveAreas(GAME));
    expect(first).toMatchObject({ name: "New area 1", place: null });
    expect(first.decks.map((deck) => [deck.id, deck.gather])).toEqual([[MAIN_DECK, GATHER_DRAWS]]);
    expect(bucketsOf(first).map((b) => [b.name, b.slot])).toEqual([["A", 0], ["B", 1]]);
    expect(bucketsOf(first)[0].pool).toBeGreaterThan(bucketsOf(first)[1].pool);
    expect(newArea([...liveAreas(GAME), first]).name).toBe("New area 2");
  });

  /** An area with its one deck's things put as given. */
  const withBuckets = (area: Area, buckets: Area["decks"][number]["buckets"]): Area => ({ ...area, decks: [{ ...area.decks[0], buckets }] });

  it("is given another thing with the first colour, letter and id that are free, and holds no more than there are colours", () => {
    const area = newArea([]);
    const [first] = bucketsOf(area);
    // With its first thing taken out, the next one made takes up what that one had.
    expect(newBucket(withBuckets(area, bucketsOf(area).slice(1)))).toMatchObject({ name: "A", slot: 0, id: first.id });
    // (The letter is the first that no thing there is called, whatever colour is free: with the first thing renamed to B, the next is A.)
    expect(newBucket(withBuckets(area, [{ ...first, name: "B" }]))).toMatchObject({ name: "A", slot: 1 });
    let full = area;
    for (let n = bucketsOf(area).length; n < MOST_BUCKETS; n++) {
      const bucket = newBucket(full);
      full = withBuckets(full, [...bucketsOf(full), ...(bucket ? [bucket] : [])]);
    }
    expect(bucketsOf(full).length).toBe(MOST_BUCKETS);
    expect(new Set(bucketsOf(full).map((b) => b.slot)).size).toBe(MOST_BUCKETS);
    expect(new Set(bucketsOf(full).map((b) => b.id)).size).toBe(MOST_BUCKETS);
    expect(newBucket(full)).toBeNull();
  });

  it("is given another deck, with a name none of its decks has and a thing of its own whose colour, letter and id are free in every deck", () => {
    const area = newArea([]);
    const second = newDeck(area);
    expect(second).toMatchObject({ id: "set 2", aimed: 0, gather: GATHER_DRAWS });
    expect(second.buckets).toMatchObject([{ name: "C", slot: 2, id: "bucket:3" }]);
    const both: Area = { ...area, decks: [...area.decks, second] };
    expect(newDeck(both).id).toBe("set 3");
    expect(newBucket(both)).toMatchObject({ name: "D", slot: 3 });
    // The figures of both go to the game's rules as two decks.
    expect(searchingOf(both).map((deck) => [deck.id, deck.finds.length])).toEqual([[MAIN_DECK, 2], ["set 2", 1]]);
  });

  it("can be a copy of another: its figures, and none of its ties to the game; and the other is not touched by what is done to it", () => {
    const forest = areaOf(GAME, "forest");
    const copy = copyOf(forest, liveAreas(GAME));
    expect(copy).toMatchObject({ name: "The forest, copy 1", place: null });
    expect(searchingOf(copy)).toEqual(searchingOf(forest));
    copy.decks[0].buckets[0].pool = 999;
    expect(forest.decks[0].buckets[0].pool).toBe(8);
  });

  it("has its figures set down to be copied out", () => {
    expect(JSON.parse(figuresOf(areaOf(GAME, "forest")))).toEqual({
      name: "The forest",
      decks: {
        main: { blanks: 0, stray: 4, aimed: 0, aim: "rolled", gather: 1, finds: [{ name: "The way on to the caves", pool: 8, need: 6, lingers: false }, { name: "Berries", pool: 200, need: 40, lingers: true }, { name: "Herbs", pool: 120, need: 40, lingers: true }] },
        rare: { blanks: 1079, stray: 2, aimed: 0, aim: "rolled", gather: 1, finds: [{ name: "A stone tablet", pool: 1, need: 1, lingers: false }] },
      },
    });
  });
});

describe("a number typed into a dial", () => {
  it("is a whole number within what the dial may be, and the least it may be if it is no number", () => {
    expect(within("12", 0, 100)).toBe(12);
    expect(within("12.9", 0, 100)).toBe(12);
    expect(within("-4", 1, 100)).toBe(1);
    expect(within("5000", 0, 100)).toBe(100);
    expect(within("", 1, 100)).toBe(1);
    expect(within("abc", 0, 100)).toBe(0);
  });
});

describe("areas kept in the browser", () => {
  const store = new Map<string, string>();
  const stub = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) };
  afterEach(() => {
    store.clear();
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  it("are one's own only: a place of the game's is not kept, being the game's to say", () => {
    Object.assign(globalThis, { localStorage: stub });
    const own = newArea([]);
    keptAreas.set([areaOf(GAME, "forest"), own]);
    expect(keptAreas.get()).toEqual([own]);
    expect((JSON.parse(store.get("manor3d.odds.areas") ?? "[]") as Area[]).map((area) => area.id)).toEqual([own.id]);
  });

  it("are let go where what is kept is no longer an area, and are none where nothing can be kept", () => {
    expect(keptAreas.get()).toEqual([]);
    Object.assign(globalThis, { localStorage: stub });
    const own = newArea([]);
    store.set("manor3d.odds.areas", JSON.stringify([own, { ...own, decks: "none" }, { ...own, decks: [] }, { id: "x" }, { ...own, place: "forest" }, 7]));
    expect(keptAreas.get()).toEqual([own]);
    store.set("manor3d.odds.areas", "not json");
    expect(keptAreas.get()).toEqual([]);
  });

  it("are read, where they were kept before areas had decks, as an area of one deck: its things and dials, and the usual draws a minute of gathering", () => {
    Object.assign(globalThis, { localStorage: stub });
    const own = newArea([]);
    const { buckets, blanks, aimed, stray, aim } = own.decks[0];
    store.set("manor3d.odds.areas", JSON.stringify([{ id: own.id, name: "The marsh", place: null, buckets, blanks, aimed, stray, aim }]));
    expect(keptAreas.get()).toEqual([{ id: own.id, name: "The marsh", place: null, decks: [{ id: MAIN_DECK, buckets, blanks, aimed, stray, aim, gather: GATHER_DRAWS }] }]);
  });
});
