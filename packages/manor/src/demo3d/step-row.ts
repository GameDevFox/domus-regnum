import type { Scope } from "@scene-lib/scope";

import type { Game, PlaceId } from "../game";
import { el } from "./dom";
import { MAP_ART, PIECES } from "./map-art";
import { pressStep, stepChips } from "./step-chips";
import type { StepPress } from "./step-chips";
import "./step-row.css";

// Someone's steps on an outing, as a row of small chips (step-chips.ts says what each is and
// does): in her row of the household list, and on her card. A chip that does something when
// pressed is a button; one that is only shown is a picture. A queued thing at another place than
// the step's before has that place's piece beside its picture, as the map draws it, or a question
// mark for a place not yet visited. The row is empty, and hidden, while she is in the house.

export type StepRow = { node: HTMLElement; /** Bring it up to the moment: drawn again only when what it shows has changed. */ refresh: () => void };

/** Between one step and the next. */
const ON = "›";

/** A place, small: its piece, or a question mark where it is not yet found. */
const placeMark = (game: Game, place: PlaceId): HTMLElement => {
  if (game.places[place] !== "found") return el("span", "step-place step-place-unknown", "?");
  const piece = el("img", "step-place");
  piece.src = MAP_ART + PIECES[place].file;
  piece.alt = "";
  return piece;
};

export const StepRow = (scope: Scope, { game, id }: { game: Game; id: string }): StepRow => {
  const node = el("div", "steps");
  node.setAttribute("role", "group");
  node.setAttribute("aria-label", "Her steps");
  node.dataset.who = id;
  let drawn = "";
  const refresh = (): void => {
    const chips = stepChips(game, id);
    const now = JSON.stringify(chips);
    if (now === drawn) return;
    drawn = now;
    node.hidden = chips.length === 0;
    node.replaceChildren(
      ...chips.flatMap((chip, n) => {
        const step = el(chip.press ? "button" : "span", `step ${chip.state}${chip.lit === undefined ? "" : chip.lit ? " lit" : " unlit"}`);
        if (chip.place) step.append(placeMark(game, chip.place));
        step.append(chip.glyph);
        step.dataset.step = chip.is;
        if (chip.press) step.dataset.press = chip.press;
        if (chip.index !== undefined) step.dataset.index = String(chip.index);
        else step.setAttribute("role", "img");
        if (chip.lit !== undefined && chip.press) step.setAttribute("aria-pressed", String(chip.lit));
        step.title = chip.says;
        step.setAttribute("aria-label", chip.says);
        const between = el("span", "step-on", ON);
        between.setAttribute("aria-hidden", "true");
        return n === 0 ? [step] : [between, step];
      }),
    );
  };
  scope.listen(node, "click", (e: MouseEvent) => {
    const button = (e.target as Element).closest<HTMLElement>("button[data-press]");
    const press = button?.dataset.press as StepPress | undefined;
    if (!press) return;
    pressStep(game, id, press, Number(button?.dataset.index ?? -1));
    refresh();
  });
  refresh();
  return { node, refresh };
};
