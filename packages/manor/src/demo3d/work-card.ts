import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { BAKES, BAKE_IDS, DEVICES, bestToBake, hasDevice, offered } from "../game";
import type { Game, JobId } from "../game";
import { mountMenu } from "./menu";
import { el } from "./panel";
import { WorkCrew } from "./work-crew";
import type { Workplace } from "./workplaces";

// The card of a place of work that has nothing of its own to set out: the kitchen, the shop and the laboratory.
// (The garden's has its plots, and is garden-menu.ts.) What the place has to work with, as
// pictures and numbers, and who works there (work-crew.ts). It is a window, as the garden's is.

type WorkCardProps = { game: Game; /** Ticks once a frame, in seconds. */ frame: Value<number>; place: Workplace };

/** The card is read from the game this often while it is open, in seconds. */
const READ_EVERY = 0.25;
const PERCENT = 100;

type Fact = { says: string; title: string };

/** What the shop's shelf holds, bake by bake: only what the kitchen has made or has had on the shelf, so that nothing is shown before it is known; and the customers waiting. */
export const shopFacts = (game: Game): Fact[] => {
  const waiting = game.customers.filter((c) => c.state === "waiting").length;
  return [
    ...BAKE_IDS.filter((bake) => game.recipes.includes(bake) || game.shelf[bake] > 0).map((bake) => ({ says: `${BAKES[bake].glyph} ${game.shelf[bake]}`, title: `${BAKES[bake].name} on the shelf: ${game.shelf[bake]}, at ${BAKES[bake].price} coin each` })),
    { says: `👥 ${waiting}`, title: `${waiting} waiting at the counter` },
  ];
};

/** What a place has to work with just now. */
const FACTS: Partial<Record<JobId, (game: Game) => Fact[]>> = {
  bake: (game) => {
    const next = BAKES[bestToBake(game)];
    return [
      { says: `🌾 ${game.flour}`, title: `${game.flour} sack${game.flour === 1 ? "" : "s"} of flour in the pantry: a batch takes one` },
      { says: `→ ${next.glyph} ×${next.batch}`, title: `A batch begun now would be ${next.name.toLowerCase()}: the best thing the pantry has the makings of` },
    ];
  },
  shop: shopFacts,
  lab: (game) => {
    const made = DEVICES.filter((d) => hasDevice(game, d.id));
    const left = offered(game).length;
    const full = Math.floor((game.lab.progress / game.lab.needed) * PERCENT);
    return [
      left === 0 ? { says: "⚗️ ✓", title: "There is nothing left to invent" } : game.lab.ready ? { says: "⚗️ ✨", title: "The measure is full: choose what it is spent on, under Inventions in the list at the left" } : { says: `⚗️ ${full}%`, title: `The measure of the next invention is ${full}% full: it fills while an alchemist is at work here` },
      ...made.map((d) => ({ says: d.glyph, title: `Made: the ${d.name.charAt(0).toLowerCase() + d.name.slice(1)}. ${d.effect}` })),
    ];
  },
};

export const mountWorkCard = (scope: Scope, { game, frame, place }: WorkCardProps): Value<boolean> => {
  const fill = (shown: Scope, { card, slot }: { card: HTMLElement; slot: HTMLElement }): void => {
    const facts = el("div", "work-facts");
    const crew = WorkCrew(shown, { game, place, slot });
    card.append(facts, crew.node);
    let said = "";
    const show = (): void => {
      crew.refresh();
      const now = FACTS[place.job]?.(game) ?? [];
      if (JSON.stringify(now) === said) return;
      said = JSON.stringify(now);
      facts.replaceChildren(
        ...now.map((fact) => {
          const chip = el("span", "work-fact", fact.says);
          chip.title = fact.title;
          return chip;
        }),
      );
    };
    show();
    let next = 0;
    shown.effect((use) => {
      const at = use(frame);
      if (at < next) return;
      next = at + READ_EVERY;
      show();
    });
  };
  return mountMenu(scope, { game, title: place.name, called: place.called, holds: place.holds, key: place.key, card: `work-card work-card-${place.job}`, slot: "work-slot", blocks: false, fill });
};
