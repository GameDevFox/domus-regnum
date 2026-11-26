import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { ITEMS, ITEM_IDS } from "../game";
import type { Game } from "../game";
import { el } from "./panel";

// What the house has, as two rows of small pictures with a number each: what it holds (coin,
// flour in the pantry, loaves on the shop's shelf, and every other item there is, once the house
// has it: the list is the game's, src/game/items.ts), and how the customers took it (loaves sold,
// customers who went without, and how much custom the shop has won). Each row is its own box, so
// a number growing wider never pushes a picture from one row onto the other. What can be bought
// is in market.ts.

type LedgerProps = { game: Game; frame: Value<number> };

/** The numbers are read from the game this often, in seconds. */
const TALLY_EVERY = 0.2;

type Tally = { glyph: string; label: string; read: (game: Game) => number; /** Not shown until this is so: a thing the house has not yet met is not on its books. */ once?: (game: Game) => boolean };

/** One row each: what the house holds, which is every item there is (src/game/items.ts), each from when it is on the house's books; and how the customers took it. */
const TALLIES: Tally[][] = [
  ITEM_IDS.map((id): Tally => ({ glyph: ITEMS[id].glyph, label: ITEMS[id].held, read: ITEMS[id].count, once: ITEMS[id].shown })),
  [
    { glyph: "🙂", label: "Loaves and pies sold", read: (g) => g.sold },
    { glyph: "🙁", label: "Customers who went without: gave up waiting, or found the counter full", read: (g) => g.lost },
    { glyph: "👥", label: "Custom, in times the first day's. It grows after a day on which nobody went without", read: (g) => g.custom },
  ],
];

export const mountLedger = (scope: Scope, { game, frame }: LedgerProps): void => {
  const host = document.getElementById("ledger");
  if (!host) return;

  const tallies = TALLIES.flatMap((group) => {
    const row = el("div", "ledger-row");
    host.append(row);
    return group.map((tally) => {
      const box = el("span", "tally");
      const count = el("span", "tally-count");
      box.title = tally.label;
      box.hidden = tally.once !== undefined;
      box.setAttribute("role", "img");
      box.append(el("span", "tally-glyph", tally.glyph), count);
      row.append(box);
      return { tally, box, count, shown: NaN };
    });
  });

  const refresh = (): void => {
    for (const t of tallies) {
      if (t.box.hidden) t.box.hidden = !(t.tally.once?.(game) ?? true);
      const n = t.tally.read(game);
      if (n === t.shown) continue;
      // A number that has just changed blinks once, so a purchase or a sale is seen to land.
      if (!Number.isNaN(t.shown)) {
        t.box.classList.remove("changed");
        void t.box.offsetWidth;
        t.box.classList.add("changed");
      }
      t.shown = n;
      t.count.textContent = String(n);
      t.box.setAttribute("aria-label", `${t.tally.label}: ${n}`);
    }
  };

  let next = 0;
  scope.effect((use) => {
    const now = use(frame);
    if (now < next) return;
    next = now + TALLY_EVERY;
    refresh();
  });
};
