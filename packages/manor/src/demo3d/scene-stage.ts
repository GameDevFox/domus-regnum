import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { advance, choose } from "../cutscene";
import type { Playing, Side } from "../cutscene";
import type { Game } from "../game";
import { portraitUrl } from "./palette";
import { el } from "./panel";
import { onThePage } from "./ui-layer";
import "./scene.css";

// A cutscene, as it is seen: the people of it walk the house as they always do, and over the
// picture the line being spoken is shown in a box at the foot of the screen, with a tall
// portrait of whoever stands at each side. A portrait slides in from its own side when someone
// first speaks there; the one who is speaking is lit, and the other is in shade. The portraits
// are drawn facing right: at the right of the screen they are shown mirrored, so that the two
// face each other.
//
// A click anywhere, Space or Enter moves the scene on from a line; a choice is made by pressing
// it, or its number. While a scene plays nothing else on the page answers.

type StageProps = {
  game: Game;
  /** Ticks once a frame, in seconds. */
  frame: Value<number>;
  /** Who the view is following: the scene says who it is looking at. */
  following: Value<string | null>;
  /** The map is shut when a scene begins: the scene is in the house. */
  mapOpen: Value<boolean>;
};

const SIDES: Side[] = ["left", "right"];
const NEXT_KEYS = [" ", "enter"];

export const mountSceneStage = (scope: Scope, { game, frame, following, mapOpen }: StageProps): void => {
  /** What is on the page for the scene being played, and what of the scene it was last drawn from. */
  let stage: { playing: Playing; root: HTMLElement; box: HTMLElement; name: HTMLElement; text: HTMLElement; choices: HTMLElement; portraits: Record<Side, HTMLImageElement | null>; drawn: { line: Playing["line"]; asking: unknown; focus: string | null; sides: Record<Side, string | null> } } | null = null;

  const begin = (playing: Playing): NonNullable<typeof stage> => {
    const root = el("div", "scene");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "A scene");
    const box = el("div", "scene-box");
    const name = el("div", "scene-name");
    const text = el("p", "scene-text");
    const next = el("span", "scene-next", "▼");
    next.setAttribute("aria-hidden", "true");
    box.append(name, text, next);
    // Nothing is said until the first line: the box is not on show until then.
    box.hidden = true;
    const choices = el("div", "scene-choices");
    root.append(box, choices);
    onThePage(root);
    // A click anywhere moves the scene on from a line. A choice is pressed for itself.
    root.addEventListener("click", (e) => {
      if (!(e.target as Element).closest(".scene-choice")) advance(playing);
    });
    mapOpen.set(false);
    return { playing, root, box, name, text, choices, portraits: { left: null, right: null }, drawn: { line: null, asking: null, focus: null, sides: { left: null, right: null } } };
  };

  const end = (): void => {
    stage?.root.remove();
    stage = null;
    following.set(null);
  };

  const draw = (now: NonNullable<typeof stage>): void => {
    const { playing, drawn } = now;
    const { cast } = playing.scene;
    // Where the scene looks, the view goes.
    if (playing.focus !== drawn.focus) {
      drawn.focus = playing.focus;
      if (playing.focus !== null) following.set(playing.focus);
    }
    // Whoever stands at each side: her portrait comes in from that side when she first stands there.
    for (const side of SIDES) {
      const who = playing.sides[side];
      if (who !== drawn.sides[side]) {
        drawn.sides[side] = who;
        now.portraits[side]?.remove();
        now.portraits[side] = null;
        if (who !== null && cast[who]) {
          const portrait = el("img", `scene-portrait ${side}`);
          portrait.src = portraitUrl(cast[who].portrait);
          portrait.alt = "";
          portrait.dataset.who = who;
          now.root.prepend(portrait);
          now.portraits[side] = portrait;
        }
      }
      const shown = now.portraits[side];
      shown?.classList.toggle("speaking", who !== null && playing.line?.who === who);
      // A portrait repainted while it is on show (a palette swap, from the dev menu) is shown repainted.
      const src = who !== null && cast[who] ? portraitUrl(cast[who].portrait) : null;
      if (shown && src !== null && shown.dataset.src !== src) {
        shown.dataset.src = src;
        shown.src = src;
      }
    }
    // The line, and whose it is: her name is over it, at her side.
    if (playing.line !== drawn.line) {
      drawn.line = playing.line;
      const who = playing.line?.who ?? null;
      now.box.hidden = playing.line === null;
      now.name.textContent = who === null ? "" : (cast[who]?.name ?? who);
      now.name.hidden = who === null;
      now.name.classList.toggle("right", who !== null && playing.sides.right === who);
      now.text.textContent = playing.line?.text ?? "";
      now.box.classList.toggle("voice", playing.line !== null && who === null);
    }
    // A choice: each answer a button, with its number.
    const asking = playing.waiting?.for === "choice" ? playing.waiting : null;
    if (asking !== drawn.asking) {
      drawn.asking = asking;
      now.choices.replaceChildren(
        ...(asking?.options ?? []).map((option, n) => {
          const button = el("button", "scene-choice");
          button.append(el("kbd", "key", String(n + 1)), el("span", "", option.text));
          button.addEventListener("click", () => choose(playing, n));
          return button;
        }),
      );
    }
    now.root.classList.toggle("asking", asking !== null);
  };

  scope.effect((use) => {
    use(frame);
    const playing = game.scene;
    if (stage && stage.playing !== playing) end();
    if (!playing) return;
    stage ??= begin(playing);
    draw(stage);
  });
  scope.add(end);

  // While a scene plays, the keys are its own: Space and Enter move it on, a number answers, and nothing else is heard.
  scope.listen(
    window,
    "keydown",
    (e: KeyboardEvent) => {
      const playing = game.scene;
      if (!playing || e.ctrlKey || e.metaKey || e.altKey) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      const key = e.key.toLowerCase();
      if (NEXT_KEYS.includes(key)) advance(playing);
      else if (/^[1-9]$/.test(key)) choose(playing, Number(key) - 1);
    },
    { capture: true },
  );
};
