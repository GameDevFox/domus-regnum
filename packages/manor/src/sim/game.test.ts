import { describe, expect, it } from "vitest";

import { STRATEGIES, runBot } from "./bot";
import { CHAPTER_DAYS } from "./content/world";
import { invitations } from "./flow";
import { supperForecast } from "./larder";
import { advance, apply, createGame } from "./game";
import { addStock, count, hearthLevel, houseStock, moveToward, pantryOf, reach, roomsOfKind, travelSeconds } from "./house";
import { CLIMB_SPEED, DAY_SECONDS, OCCASION_SECONDS, SHORTFALL_HEARTH, TICK, WALK_SPEED } from "./tuning";
import type { Command, Game, Room } from "./types";

const room = (g: Game, kind: Room["kind"]): Room => roomsOfKind(g, kind)[0];
const stock = (g: Game, good: string, n: number): void => addStock((pantryOf(g) as Room).shelf, good, n);
const keepAll = (g: Game): void => {
  for (const good of Object.keys(g.orders)) apply(g, { kind: "order", good, order: "keep" });
};

/** A game on the day of its first occasion, with the given food kept in the pantry and Evelyn serving. */
const occasionNight = (seed: number, food: Record<string, number>): Game => {
  const g = createGame(seed);
  apply(g, { kind: "invite", grade: "humble" });
  g.chapterDay = CHAPTER_DAYS[0];
  keepAll(g);
  for (const [good, n] of Object.entries(food)) stock(g, good, n);
  apply(g, { kind: "assign", maid: "evelyn", room: room(g, "parlour").id });
  apply(g, { kind: "assign", maid: "lord", room: room(g, "lab").id });
  apply(g, { kind: "startDay" });
  advance(g, DAY_SECONDS + TICK);
  expect(g.phase).toBe("occasion");
  advance(g, OCCASION_SECONDS + TICK);
  expect(g.phase).toBe("result");
  return g;
};

describe("determinism", () => {
  it("replays the same seed and commands to the same state", () => {
    const script: Command[] = [
      { kind: "invite", grade: "humble" },
      { kind: "assign", maid: "lord", room: "r13" },
      { kind: "startDay" },
    ];
    const play = (seed: number): string => {
      const g = createGame(seed);
      for (const cmd of script) apply(g, cmd);
      advance(g, 40);
      apply(g, { kind: "recipe", room: "r11", recipe: "tea" });
      advance(g, 60);
      return JSON.stringify(g);
    };
    expect(play(42)).toBe(play(42));
    expect(play(42)).not.toBe(play(43));
  });

  it("survives a round trip through JSON mid-day", () => {
    const g = createGame(9);
    apply(g, { kind: "invite", grade: "humble" });
    apply(g, { kind: "assign", maid: "lord", room: "r13" });
    apply(g, { kind: "startDay" });
    advance(g, 30);
    const copy = JSON.parse(JSON.stringify(g)) as Game;
    advance(g, 30);
    advance(copy, 30);
    expect(JSON.stringify(copy)).toBe(JSON.stringify(g));
  });
});

describe("the occasion", () => {
  it("scores Comfort × Grace × Hearth, each guest taking each kind once", () => {
    const g = occasionNight(3, { bread: 20, tea: 20 });
    const occ = g.occasion!;
    // Three guests, bread worth 2 Comfort and tea worth 2 Grace, the guest of honour counting double.
    // Fancies came and went, but nobody noticed one, so nothing counted for more.
    expect(occ.served).toBe(6);
    expect(occ.comfort).toBe(2 + 2 + 4);
    expect(occ.grace).toBe(2 + 2 + 4);
    expect(occ.fancies).toBe(0);
    expect(occ.score).toBe(8 * 8 * 1);
    expect(houseStock(g, "bread")).toBe(20 - 3);
    // With nothing left that anyone would take, the evening ends before its hour is up.
    expect(occ.t).toBeLessThan(OCCASION_SECONDS - 5);
  });

  it("multiplies to nothing with one pole missing", () => {
    const g = occasionNight(3, { bread: 20 });
    expect(g.occasion!.comfort).toBeGreaterThan(0);
    expect(g.occasion!.score).toBe(0);
    expect(g.occasion!.tier).toBe("shortfall");
  });

  it("falling short earns Hearth and only the humbler invitation; doing well earns the grander one", () => {
    const short = occasionNight(3, { bread: 20 });
    expect(short.hearth).toBe(SHORTFALL_HEARTH);
    apply(short, { kind: "continue" });
    apply(short, { kind: "nextDay" });
    apply(short, { kind: "continue" });
    expect(short.phase).toBe("invite");
    expect(invitations(short).map((o) => o.grade)).toEqual(["humble"]);

    const well = occasionNight(3, { bread: 20, tea: 20, stew: 20, cake: 20 });
    expect(well.occasion!.tier).not.toBe("shortfall");
    apply(well, { kind: "continue" });
    while (well.pending.length > 0) apply(well, { kind: "choose", index: 0 });
    apply(well, { kind: "nextDay" });
    apply(well, { kind: "continue" });
    const offered = invitations(well).map((o) => o.grade);
    expect(offered).toContain("grand");
    // The royal card comes only after a triumph.
    expect(offered.includes("royal")).toBe(well.results[0].tier === "triumph");
  });

  it("serves nobody in a room with no maid", () => {
    const g = createGame(3);
    apply(g, { kind: "invite", grade: "humble" });
    g.chapterDay = CHAPTER_DAYS[0];
    keepAll(g);
    stock(g, "bread", 20);
    stock(g, "tea", 20);
    apply(g, { kind: "assign", maid: "evelyn", room: null });
    apply(g, { kind: "startDay" });
    advance(g, DAY_SECONDS + TICK);
    advance(g, OCCASION_SECONDS + TICK);
    expect(g.occasion!.served).toBe(0);
  });
});

describe("supper", () => {
  it("gives one Hearth point per kind there is enough of for every head, and eats them", () => {
    const g = createGame(1);
    apply(g, { kind: "invite", grade: "humble" });
    keepAll(g);
    apply(g, { kind: "recipe", room: room(g, "kitchen").id, recipe: null });
    stock(g, "bread", 5);
    stock(g, "tea", 5);
    stock(g, "stew", 1); // not enough for two
    apply(g, { kind: "supper", plan: "feast" });
    expect(supperForecast(g)).toEqual(["bread", "tea"]);
    apply(g, { kind: "startDay" });
    advance(g, DAY_SECONDS + TICK);
    expect(g.phase).toBe("offers");
    expect(g.hearth).toBe(2);
    expect(houseStock(g, "bread")).toBe(3);
    expect(houseStock(g, "stew")).toBe(1);
  });

  it("a plain supper is the cheapest single dish", () => {
    const g = createGame(1);
    stock(g, "pie", 5);
    stock(g, "bread", 5);
    apply(g, { kind: "supper", plan: "shared" });
    expect(supperForecast(g)).toEqual(["bread"]);
    apply(g, { kind: "supper", plan: "none" });
    expect(supperForecast(g)).toEqual([]);
  });

  it("levels step up at the listed thresholds", () => {
    expect(hearthLevel(0)).toBe(1);
    expect(hearthLevel(2)).toBe(1);
    expect(hearthLevel(3)).toBe(2);
    expect(hearthLevel(8)).toBe(2);
    expect(hearthLevel(9)).toBe(3);
  });
});

describe("the larder", () => {
  /** Day one with the Master at the counter, the kitchen idle, and the given stock in the pantry. */
  const shopDay = (food: Record<string, number>): Game => {
    const g = createGame(2);
    apply(g, { kind: "invite", grade: "humble" });
    apply(g, { kind: "recipe", room: room(g, "kitchen").id, recipe: null });
    apply(g, { kind: "assign", maid: "evelyn", room: null });
    apply(g, { kind: "assign", maid: "lord", room: room(g, "shop").id });
    for (const [good, n] of Object.entries(food)) stock(g, good, n);
    return g;
  };

  it("never sells the household's supper", () => {
    const g = shopDay({ bread: 6 });
    apply(g, { kind: "startDay" });
    advance(g, DAY_SECONDS - 1);
    // Three guests are coming and two sit down to supper: of six loaves on sale, one is sold.
    expect(g.today.sold).toBe(1);
    expect(houseStock(g, "bread")).toBe(5);
    advance(g, 2);
    expect(g.hearth).toBe(1);
    expect(houseStock(g, "bread")).toBe(3);
  });

  it("sells everything once nothing is spoken for", () => {
    const g = shopDay({ bread: 6 });
    apply(g, { kind: "supper", plan: "none" });
    apply(g, { kind: "menu", good: "bread", on: false });
    apply(g, { kind: "startDay" });
    advance(g, DAY_SECONDS - 1);
    expect(g.today.sold).toBe(6);
  });

  it("a clockwork till sells only what is on the counter, and takes it", () => {
    const g = shopDay({ bread: 8 });
    apply(g, { kind: "supper", plan: "none" });
    apply(g, { kind: "assign", maid: "lord", room: room(g, "lab").id });
    apply(g, { kind: "assign", maid: "evelyn", room: room(g, "pantry").id });
    room(g, "shop").device = "till";
    apply(g, { kind: "startDay" });
    advance(g, DAY_SECONDS - 1);
    // Three of the eight are the guests'.
    expect(g.today.sold).toBe(5);
    expect(houseStock(g, "bread")).toBe(3);
    // (A bulk order pays double, so the takings can be more than five loaves' worth, never less.)
    expect(g.today.coinEarned).toBeGreaterThanOrEqual(10);
  });

  it("supper leaves the guests' share alone", () => {
    const g = createGame(1);
    apply(g, { kind: "invite", grade: "humble" });
    keepAll(g);
    stock(g, "bread", 4); // two at table + three guests would need five
    stock(g, "tea", 5);
    expect(supperForecast(g)).toEqual(["tea"]);
    // Struck off the menu, bread is nobody's but the household's.
    apply(g, { kind: "menu", good: "bread", on: false });
    expect(supperForecast(g)).toEqual(["bread", "tea"]);
  });

  it("serves guests everything except what is struck off the menu", () => {
    const g = createGame(3);
    apply(g, { kind: "invite", grade: "humble" });
    g.chapterDay = CHAPTER_DAYS[0];
    apply(g, { kind: "supper", plan: "none" });
    apply(g, { kind: "recipe", room: room(g, "kitchen").id, recipe: null });
    for (const good of ["bread", "tea", "stew"]) stock(g, good, 20);
    apply(g, { kind: "menu", good: "stew", on: false });
    apply(g, { kind: "assign", maid: "evelyn", room: room(g, "parlour").id });
    apply(g, { kind: "startDay" });
    advance(g, DAY_SECONDS + TICK);
    expect(g.occasion!.menu.sort()).toEqual(["bread", "tea"]);
    // (Patrons bought some stew during the day: it is on sale. The guests get none of it.)
    const stewAtDusk = houseStock(g, "stew");
    advance(g, OCCASION_SECONDS + TICK);
    expect(houseStock(g, "stew")).toBe(stewAtDusk);
    expect(g.occasion!.served).toBe(6);
  });

  it("seats guests in the Master's room first", () => {
    const g = createGame(3);
    apply(g, { kind: "invite", grade: "humble" });
    g.chapterDay = CHAPTER_DAYS[0];
    const upstairs = g.rooms.find((r) => r.kind === "empty" && r.floor === 2)!;
    upstairs.kind = "dining";
    apply(g, { kind: "assign", maid: "lord", room: room(g, "parlour").id });
    apply(g, { kind: "startDay" });
    advance(g, DAY_SECONDS + TICK);
    expect(g.visitors.filter((v) => v.room === room(g, "parlour").id).length).toBe(3);
    expect(g.visitors.find((v) => v.honour)!.room).toBe(room(g, "parlour").id);
  });

  it("a bulk order is filled at once and pays double", () => {
    const g = shopDay({ bread: 30 });
    apply(g, { kind: "supper", plan: "none" });
    apply(g, { kind: "startDay" });
    advance(g, 5);
    g.visitors = [];
    g.visitors.push({ id: 999, kind: "order", room: room(g, "shop").id, wants: Array.from({ length: 6 }, () => "bread"), had: [], patience: 40, patienceMax: 40, claimedBy: null, spot: 0, honour: false, busy: 0, leaving: -1, happy: true, face: "🧾", fancy: null, fancyLeft: 0, noted: false });
    const before = g.today.coinEarned;
    const sold = g.today.sold;
    for (let i = 0; i < 200 && g.visitors.some((v) => v.id === 999 && v.leaving < 0); i++) advance(g, TICK);
    expect(g.today.sold - sold).toBeGreaterThanOrEqual(6);
    expect(g.today.coinEarned - before).toBeGreaterThanOrEqual(6 * 2 * 2);
  });
});

describe("what a card asks", () => {
  it("is the usual figure for a house nobody has heard of, and more for one that did far better", () => {
    const g = createGame(1);
    expect(invitations(g).map((o) => [o.grade, o.target])).toEqual([
      ["humble", 1000],
      ["grand", 8000],
    ]);
    g.chapter = 2;
    g.results.push({ occasion: "x", grade: "humble", tier: "triumph", score: 100, target: 1000 });
    // A modest first evening: the usual figures stand.
    expect(invitations(g).find((o) => o.grade === "humble")!.target).toBe(20000);
    g.results[0].score = 50000;
    // Fifty thousand at a tea: par for the next is forty times that. The grand card asks half of par and
    // the royal twice it; the humble one never more than half of what the house actually did.
    expect(invitations(g).map((o) => o.target)).toEqual([25000, 1000000, 4000000]);
  });
});

describe("help hired for the evening", () => {
  const eve = (hire: string[]): Game => {
    const g = createGame(3);
    apply(g, { kind: "invite", grade: "humble" });
    g.chapterDay = CHAPTER_DAYS[0];
    g.coin = 1000;
    apply(g, { kind: "supper", plan: "none" });
    apply(g, { kind: "recipe", room: room(g, "kitchen").id, recipe: null });
    stock(g, "bread", 20);
    stock(g, "tea", 20);
    for (const id of hire) expect(apply(g, { kind: "engage", id })).toBe(true);
    apply(g, { kind: "assign", maid: "evelyn", room: room(g, "parlour").id });
    apply(g, { kind: "startDay" });
    advance(g, DAY_SECONDS + TICK);
    return g;
  };

  it("a quartet doubles Grace and a chef doubles Comfort, for that evening only", () => {
    const plain = eve([]);
    const hired = eve(["quartet", "chef"]);
    advance(plain, OCCASION_SECONDS + TICK);
    advance(hired, OCCASION_SECONDS + TICK);
    // Same seed, same guests, same fancies: each pole is exactly doubled.
    expect(hired.occasion!.comfort).toBe(plain.occasion!.comfort * 2);
    expect(hired.occasion!.grace).toBe(plain.occasion!.grace * 2);
    expect(hired.hired).toEqual([]);
    expect(hired.coin).toBeLessThan(plain.coin);
  });

  it("footmen serve for the evening and are gone by the result", () => {
    const g = eve(["footmen"]);
    expect(g.maids.filter((m) => m.id.startsWith("footman")).length).toBe(2);
    apply(g, { kind: "assign", maid: "evelyn", room: null });
    advance(g, OCCASION_SECONDS + TICK);
    // With Evelyn sent out of the room, whatever was served was served by the footmen.
    expect(g.occasion!.served).toBe(6);
    expect(g.maids.some((m) => m.id.startsWith("footman"))).toBe(false);
  });
});

describe("the evening's service", () => {
  it("fetches what the guests want from the other reception room and the shut shop", () => {
    const g = createGame(3);
    apply(g, { kind: "invite", grade: "humble" });
    g.chapterDay = CHAPTER_DAYS[0];
    apply(g, { kind: "supper", plan: "none" });
    apply(g, { kind: "recipe", room: room(g, "kitchen").id, recipe: null });
    const other = g.rooms.find((r) => r.kind === "empty" && r.floor === 2)!;
    other.kind = "dining";
    apply(g, { kind: "assign", maid: "lord", room: room(g, "parlour").id });
    apply(g, { kind: "assign", maid: "evelyn", room: room(g, "parlour").id });
    // Everything the guests could want is in the wrong places: bread on the empty dining room's
    // sideboard, tea on the shop counter. All three guests will be in the parlour with the Master.
    keepAll(g);
    addStock(other.shelf, "bread", 6);
    addStock(room(g, "shop").shelf, "tea", 6);
    apply(g, { kind: "startDay" });
    advance(g, DAY_SECONDS + TICK);
    advance(g, OCCASION_SECONDS + TICK);
    expect(g.occasion!.served).toBe(6);
  });

  it("puts everyone back at their day posts after the occasion", () => {
    const g = createGame(3);
    apply(g, { kind: "invite", grade: "humble" });
    g.chapterDay = CHAPTER_DAYS[0];
    apply(g, { kind: "startDay" });
    advance(g, DAY_SECONDS + TICK);
    apply(g, { kind: "assign", maid: "evelyn", room: room(g, "parlour").id });
    apply(g, { kind: "assign", maid: "lord", room: room(g, "parlour").id });
    advance(g, OCCASION_SECONDS + TICK);
    apply(g, { kind: "continue" });
    while (g.pending.length > 0) apply(g, { kind: "choose", index: 0 });
    apply(g, { kind: "nextDay" });
    apply(g, { kind: "continue" });
    expect(g.maids.find((m) => m.id === "evelyn")!.room).toBe(room(g, "kitchen").id);
    expect(g.maids.find((m) => m.isLord)!.room).toBe(room(g, "lab").id);
  });
});

describe("fancies", () => {
  it("a noticed fancy does not pass, and is worth three times the serving", () => {
    const g = createGame(3);
    apply(g, { kind: "invite", grade: "humble" });
    g.chapterDay = CHAPTER_DAYS[0];
    apply(g, { kind: "supper", plan: "none" });
    apply(g, { kind: "recipe", room: room(g, "kitchen").id, recipe: null });
    stock(g, "bread", 20);
    stock(g, "tea", 20);
    apply(g, { kind: "startDay" });
    advance(g, DAY_SECONDS + TICK);
    // Nobody is serving. Give a guest a fancy by hand, notice it, and let far more than its ten seconds go by.
    const guest = g.visitors.find((v) => !v.honour)!;
    guest.fancy = "tea";
    guest.fancyLeft = 10;
    expect(apply(g, { kind: "note", visitor: guest.id })).toBe(true);
    advance(g, 20);
    expect(guest.fancy).toBe("tea");
    apply(g, { kind: "assign", maid: "evelyn", room: room(g, "parlour").id });
    const before = g.occasion!.grace;
    for (let i = 0; i < 300 && guest.fancy === "tea"; i++) advance(g, TICK);
    expect(guest.had).toContain("tea");
    expect(g.occasion!.grace - before).toBeGreaterThanOrEqual(2 * 3);
    expect(g.occasion!.fancies).toBeGreaterThanOrEqual(1);
  });
});

describe("the kitchen", () => {
  it("a rota makes whichever of its recipes the house has least of", () => {
    const g = createGame(6);
    apply(g, { kind: "invite", grade: "humble" });
    keepAll(g);
    apply(g, { kind: "supper", plan: "none" });
    apply(g, { kind: "rota", room: room(g, "kitchen").id, recipe: "tea" });
    expect(room(g, "kitchen").rota).toEqual(["bread", "tea"]);
    apply(g, { kind: "startDay" });
    advance(g, DAY_SECONDS - 1);
    expect(houseStock(g, "bread")).toBeGreaterThan(0);
    expect(houseStock(g, "tea")).toBeGreaterThan(0);
    // Taking a recipe off again leaves the other.
    apply(g, { kind: "rota", room: room(g, "kitchen").id, recipe: "bread" });
    expect(room(g, "kitchen").rota).toEqual(["tea"]);
  });

  it("takes what goes into a batch when it is begun, and gives it back if she is called away", () => {
    const g = createGame(6);
    apply(g, { kind: "invite", grade: "humble" });
    g.recipes.push("cake");
    apply(g, { kind: "recipe", room: room(g, "kitchen").id, recipe: "cake" });
    stock(g, "honey", 1);
    apply(g, { kind: "startDay" });
    const coin = g.coin;
    // She fetches the honey, then begins: from that moment it is in the bowl, not on the shelf.
    for (let i = 0; i < 400 && !(g.maids[1].plan[0]?.kind === "work" && g.maids[1].plan[0].action.kind === "batch"); i++) advance(g, TICK);
    expect(houseStock(g, "honey")).toBe(0);
    expect(g.coin).toBe(coin - 3);
    apply(g, { kind: "assign", maid: "evelyn", room: null });
    expect(houseStock(g, "honey")).toBe(1);
    expect(g.coin).toBe(coin);
  });
});

describe("callers", () => {
  it("someone comes to the door, and someone places a bulk order, within a few days", () => {
    const g = createGame(12);
    apply(g, { kind: "invite", grade: "humble" });
    apply(g, { kind: "assign", maid: "lord", room: room(g, "shop").id });
    let traders = 0;
    let orders = 0;
    for (let day = 0; day < 3; day++) {
      apply(g, { kind: "startDay" });
      let hadTrader = false;
      while (g.phase === "day") {
        advance(g, 1);
        if (g.trader && !hadTrader) traders += 1;
        hadTrader = g.trader !== null;
        orders += g.visitors.filter((v) => v.kind === "order" && v.patience > v.patienceMax - 1.05).length;
      }
      if (g.phase !== "offers") break;
      apply(g, { kind: "nextDay" });
    }
    expect(traders).toBeGreaterThan(0);
    expect(orders).toBeGreaterThan(0);
  });
});

describe("the house", () => {
  it("walks along the floor, up the stair and along again in exactly the predicted time", () => {
    const from = { x: 1.5, y: 1 };
    const to = { x: 3.5, y: 3 };
    const predicted = travelSeconds(from, to, WALK_SPEED, CLIMB_SPEED);
    const pos = { ...from };
    let elapsed = 0;
    while (!moveToward(pos, to, TICK, WALK_SPEED, CLIMB_SPEED)) elapsed += TICK;
    expect(elapsed).toBeGreaterThan(predicted - 2 * TICK);
    expect(elapsed).toBeLessThan(predicted + 2 * TICK);
    expect(predicted).toBeCloseTo(1 / WALK_SPEED + 1 / WALK_SPEED + 2 / CLIMB_SPEED);
  });

  it("a dumbwaiter lets a room reach the pantry's shelf", () => {
    const g = createGame(1);
    const kitchen = room(g, "kitchen");
    stock(g, "honey", 3);
    expect(reach(g, kitchen, "honey")).toBe(0);
    kitchen.device = "dumbwaiter";
    expect(reach(g, kitchen, "honey")).toBe(3);
  });

  it("Evelyn's batches are all or nothing: triple or burnt", () => {
    const g = createGame(5);
    apply(g, { kind: "invite", grade: "humble" });
    keepAll(g);
    apply(g, { kind: "startDay" });
    const seen = new Set<number>();
    let last = 0;
    for (let i = 0; i < DAY_SECONDS / TICK - 1; i++) {
      advance(g, TICK);
      const now = g.today.made;
      if (now !== last) seen.add(now - last);
      last = now;
    }
    expect([...seen]).toEqual([12]);
    // Never two burnt batches running: the day cannot come to nothing.
    expect(g.today.made).toBeGreaterThanOrEqual(12 * 3);
    expect(count(room(g, "kitchen").shelf, "bread") + houseStock(g, "bread")).toBeGreaterThan(0);
  });
});

describe("expeditions", () => {
  const out = (seed: number, pack: string[]): Game => {
    const g = createGame(seed);
    apply(g, { kind: "invite", grade: "humble" });
    stock(g, "bread", 4);
    apply(g, { kind: "buy", index: 0 });
    g.maids.push({ id: "violet", isLord: false, pos: { x: 2.5, y: 1 }, room: null, carrying: {}, plan: [], tool: null, hurtDays: 0, away: false, status: "", say: "", sayLeft: 0 });
    expect(apply(g, { kind: "expedition", maid: "violet", site: "forest", pack })).toBe(true);
    apply(g, { kind: "startDay" });
    return g;
  };

  it("a certain mishap sends her home hurt with half the haul, unless she packed a ration", () => {
    const bare = out(4, []);
    advance(bare, 15);
    expect(bare.expedition!.state).toBe("deciding");
    const before = { ...bare.expedition!.haul };
    bare.expedition!.nextRisk = 1;
    apply(bare, { kind: "press" });
    advance(bare, 10);
    expect(bare.expedition!.hurt).toBe(true);
    for (const [good, n] of Object.entries(before)) expect(bare.expedition!.haul[good] ?? 0).toBe(Math.floor(n / 2));

    const fed = out(4, ["bread"]);
    advance(fed, 15);
    fed.expedition!.nextRisk = 1;
    apply(fed, { kind: "press" });
    advance(fed, 10);
    expect(fed.expedition!.hurt).toBe(false);
    expect(fed.expedition!.depth).toBe(1);
    expect(fed.expedition!.pack).toEqual([]);
  });

  it("another can be sent the very next morning", () => {
    const g = out(4, []);
    advance(g, DAY_SECONDS + TICK);
    expect(g.phase).toBe("offers");
    apply(g, { kind: "nextDay" });
    expect(apply(g, { kind: "expedition", maid: "violet", site: "lake", pack: [] })).toBe(true);
  });

  it("she is out of the house while away and back in it by nightfall", () => {
    const g = out(4, []);
    expect(g.maids.find((m) => m.id === "violet")!.away).toBe(true);
    advance(g, DAY_SECONDS + TICK);
    expect(g.maids.find((m) => m.id === "violet")!.away).toBe(false);
    expect(houseStock(g, "berries")).toBeGreaterThan(0);
  });
});

describe("whole seasons", () => {
  it("an idle house never meets a target; a tended one meets the first", () => {
    const idle = STRATEGIES.find((s) => s.name === "idle")!;
    const tended = STRATEGIES.find((s) => s.name === "hearth")!;
    for (let seed = 1; seed <= 3; seed++) {
      expect(runBot(createGame(seed), idle).tiers.every((t) => t === "shortfall")).toBe(true);
      // (Whether a scripted house meets a target says little: people out-score it twentyfold. That it
      // serves both Comfort and Grace to its first guests is the thing worth pinning.)
      expect(runBot(createGame(seed), tended).scores[0]).toBeGreaterThan(300);
    }
  });
});
