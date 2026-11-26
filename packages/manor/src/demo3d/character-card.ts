import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { ITEMS, MASTERY_LOAVES, WARES, statsOf } from "../game";
import type { Carried, ItemId, WareId } from "../game";
import type { Game } from "../game";
import { GLYPHS } from "./figures";
import { faceOf, faceOfSprite, nameOf } from "./map-places";
import { el } from "./panel";
import { revealOn, setReveal } from "./reveal";
import { StepRow } from "./step-row";
import { ui } from "./ui-layer";
import { bakedText } from "./who-says";
import "./character-card.css";

// A card at the right for whoever is being followed: her face and name, and what there is to
// say of her. (The author's asking, 2026-11-14: "when each character is focused, I want a
// little character menu to show up on the right-hand side that shows stats for that character":
// so far, the loaves she has baked and what she is carrying.) What it says is the rules' to
// say (`statsOf` in src/game/person.ts). Out of doors, her steps are under her name, as in
// her row of the household (step-row.ts). What she is mastering is at the foot, under a heading
// of its own, each with a star: faint until it is earned (the author's, 2026-11-16: "Star icon
// next to mastery. Move mastery to bottom under "Mastery" header"). One she has not begun on is
// not shown; but with the dev menu unlocked it is, for one of the household, and a right-click
// on it earns it (the author's list, 2026-11-16: "Dev mode shows materies for a character, even
// at "0 / X" right clicking unlocks it").

type CardProps = { game: Game; /** Who is being followed, if anyone. */ following: Value<string | null>; /** Ticks once a frame, in seconds. */ frame: Value<number>; /** Whether the dev menu is unlocked. */ dev: Value<boolean> };

/** She is read from the game this often, in seconds. */
const READ_EVERY = 0.25;
const BAKED = "🥖";
const MASTER = "⭐";
const HANDS = "🤲";
/** Goods with no picture of their own. */
const SOMETHING = "📦";
const NOTHING = "—";

/** What someone carries, in words: each thing by its name in the house's list of things, lowered to sit in the sentence, and as many as she has. */
export const carryingText = (carrying: Carried[]): string => (carrying.length > 0 ? `Carrying: ${carrying.map(({ goods, count }) => `${(ITEMS[goods as ItemId]?.name ?? goods).toLowerCase()} ×${count}`).join(", ")}` : "Carrying nothing");

export const mountCharacterCard = (scope: Scope, { game, following, frame, dev }: CardProps): void => {
  scope.effect((use, shown) => {
    const id = use(following);
    const actor = game.world.actors.find((a) => a.id === id);
    // (One of the household is hers whether she is in the house or out on the map; anyone else, only while she is here.)
    const hers = id !== null && game.household.includes(id);
    if (id === null || (!actor && !hers)) return;
    const name = actor?.name ?? nameOf(id);
    const card = el("aside", "character-card");
    card.setAttribute("aria-label", name);
    card.dataset.who = id;
    const face = actor ? faceOfSprite(actor.sprite) : faceOf(id);
    face.classList.add("character-face");
    const top = el("div", "character-top");
    top.append(face, el("h2", "character-name", name));
    const carrying = el("div", "character-stat character-carrying");
    carrying.setAttribute("role", "img");
    const baked = el("div", "character-stat character-mastery");
    baked.setAttribute("role", "img");
    // Only the household bake: a customer has no loaves to her name, and nothing to master.
    const heading = el("h3", "heading character-heading", "Mastery");
    // Out of doors, her steps (step-row.ts), under her name: one of the household only, since only they go out. On the card only while there are any.
    const steps = hers ? StepRow(shown, { game, id }) : null;
    card.append(top, carrying);
    ui().append(card);
    shown.add(() => card.remove());

    let next = 0;
    let said = "";
    // With the dev menu unlocked, a right-click on a mastery not yet earned earns it: the card is read again at once.
    revealOn(shown, card, {
      game,
      dev,
      then: () => {
        next = 0;
      },
    });
    shown.effect((useIn) => {
      const at = useIn(frame);
      const trying = useIn(dev);
      if (at < next) return;
      next = at + READ_EVERY;
      if (steps) {
        steps.refresh();
        if (steps.node.hidden) steps.node.remove();
        else if (!steps.node.isConnected) top.after(steps.node);
      }
      const stats = statsOf(game, id);
      const now = JSON.stringify([stats, trying]);
      if (now === said) return;
      said = now;
      const bakedSays = bakedText(id, stats.baked, stats.master);
      // A mastery she has not begun on is not shown at all (the author's, 2026-11-16: "Don't show any mastery on a character that is "0 / X"").
      // (A customer has baked nothing, and so has none.) With the dev menu unlocked, one of the household's is shown from the first, to be earned by a right-click.
      if (stats.baked > 0 || (trying && hers)) card.append(heading, baked);
      else {
        heading.remove();
        baked.remove();
      }
      const star = el("span", "character-glyph character-star", MASTER);
      star.classList.toggle("earned", stats.master);
      baked.replaceChildren(star, el("span", "character-glyph", BAKED), el("span", "character-count", stats.master ? String(stats.baked) : `${stats.baked} / ${MASTERY_LOAVES}`));
      baked.title = bakedSays;
      baked.dataset.says = bakedSays;
      baked.setAttribute("aria-label", bakedSays);
      setReveal(baked, hers && !stats.master ? { kind: "mastery", who: id } : null);
      const carryingSays = carryingText(stats.carrying);
      carrying.replaceChildren(el("span", "character-glyph", HANDS), ...(stats.carrying.length > 0 ? stats.carrying.map((c) => el("span", "character-count", `${GLYPHS[c.goods] ?? WARES[c.goods as WareId]?.glyph ?? SOMETHING} ×${c.count}`)) : [el("span", "character-count", NOTHING)]));
      carrying.title = carryingSays;
      carrying.setAttribute("aria-label", carryingSays);
    });
  });
};
