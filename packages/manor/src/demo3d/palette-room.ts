import type { Texture } from "three";

import type { Scope } from "@scene-lib/scope";
import { Value } from "@scene-lib/value";

import { mountColourPicker } from "./colour-picker";
import type { DevWindowButton } from "./dev-window";
import { mountDevWindow } from "./dev-window";
import { Palette, WEARERS, figureUrl, portraitUrl } from "./palette";
import { el } from "./panel";
import "./palette.css";

// The colour room: palette swaps tried out with room to see them. Someone is chosen at the
// left; in the middle she is shown large, as her portrait (which can be flipped to face the
// other way, as it is at the right of a scene) or as the picture of her that walks the house
// (which can be turned through the four ways she is ever seen in it); and at the right is the
// colour of the part of her that is repainted, picked with the old Color Demo's picker.

type RoomProps = { /** Give a figure's picture another skin, or (null) its own again. */ reskin: (sprite: string, view: "front" | "back", map: Texture | null) => void };

export type PaletteRoom = {
  /** The colours picked, by whose they are. */
  picked: () => Record<string, string>;
  /** The button of the dev menu's that opens the room. */
  button: DevWindowButton;
};

/** The ready colours under the picker: the old Color Demo's own. */
const PRESETS = ["#e03b3b", "#f2c53d", "#3b7de0", "#a05cd0", "#8a5a2b", "#2d2d32", "#3cc4c8", "#6f9e3f"];

/** The four ways someone is seen in the house, in the order she turns through them: each one of her two drawings, as drawn or mirrored. */
const TURNS: { view: "front" | "back"; mirrored: boolean; says: string }[] = [
  { view: "front", mirrored: false, says: "Facing you, turned to the left" },
  { view: "front", mirrored: true, says: "Facing you, turned to the right" },
  { view: "back", mirrored: true, says: "Facing away, turned to the right" },
  { view: "back", mirrored: false, says: "Facing away, turned to the left" },
];
const PICTURES = ["Portrait", "Figure"] as const;

export const mountPaletteRoom = (scope: Scope, { reskin }: RoomProps): PaletteRoom => {
  const { picked, wear, colourOf } = Palette(scope, { reskin });
  const open = Value(false);
  // What is being looked at, kept from one opening of the room to the next.
  let who = WEARERS[0];
  let picture: (typeof PICTURES)[number] = "Portrait";
  let flipped = false;
  let turn = 0;

  const fill = (shown: Scope, room: HTMLElement): void => {
    // Who.
    const people = el("nav", "palette-who");
    const whoButtons = WEARERS.map((wearer) => {
      const button = el("button", "palette-person");
      const face = el("img", "palette-face");
      face.alt = "";
      button.append(face, el("span", "", wearer.name));
      shown.listen(button, "click", () => {
        who = wearer;
        draw();
      });
      people.append(button);
      return { wearer, button, face };
    });

    // Her picture, large; which picture; and turning it.
    const stage = el("div", "palette-stage");
    const tabs = el("div", "palette-tabs");
    const tabButtons = PICTURES.map((kind) => {
      const button = el("button", "chip", kind);
      shown.listen(button, "click", () => {
        picture = kind;
        draw();
      });
      tabs.append(button);
      return { kind, button };
    });
    const view = el("div", "palette-view");
    const big = el("img", "palette-big");
    big.alt = "";
    view.append(big);
    const turns = el("div", "palette-turns");
    const flip = el("button", "chip", "⇄ Flip");
    flip.title = "Face her the other way, as she is at the right of a scene";
    shown.listen(flip, "click", () => {
      flipped = !flipped;
      draw();
    });
    const turnBy = (by: number, glyph: string, label: string): HTMLButtonElement => {
      const button = el("button", "chip", glyph);
      button.setAttribute("aria-label", label);
      button.title = label;
      shown.listen(button, "click", () => {
        turn = (turn + by + TURNS.length) % TURNS.length;
        draw();
      });
      return button;
    };
    const left = turnBy(-1, "↺", "Turn her to the left");
    const right = turnBy(1, "↻", "Turn her to the right");
    const facing = el("span", "palette-facing");
    stage.append(tabs, view, turns);

    // The colour of the part of her that is repainted.
    const pick = el("div", "palette-pick");
    const part = el("div", "palette-part");
    const host = el("div", "palette-picker");
    const note = el("p", "palette-note");
    const undo = el("button", "chip", "↺ As drawn");
    const picker = mountColourPicker(host, {
      presets: PRESETS,
      onChange: (hex) => {
        picker.show(hex);
        void wear(who, hex).then(draw);
      },
    });
    shown.listen(undo, "click", () => void wear(who, null).then(draw));
    pick.append(part, host, undo, note);

    const body = el("div", "palette-body");
    body.append(people, stage, pick);
    room.append(body);

    const draw = (): void => {
      for (const { wearer, button, face } of whoButtons) {
        button.classList.toggle("on", wearer === who);
        button.setAttribute("aria-pressed", String(wearer === who));
        face.src = wearer.portraitPaints ? portraitUrl(wearer.portrait) : figureUrl(wearer.sprite, "front");
      }
      for (const { kind, button } of tabButtons) {
        button.classList.toggle("on", kind === picture);
        button.setAttribute("aria-pressed", String(kind === picture));
      }
      const portrait = picture === "Portrait";
      const now = TURNS[turn];
      big.src = portrait ? portraitUrl(who.portrait) : figureUrl(who.sprite, now.view);
      big.classList.toggle("figure", !portrait);
      big.classList.toggle("mirrored", portrait ? flipped : now.mirrored);
      big.dataset.turn = portrait ? "" : String(turn);
      // A portrait is flipped; a figure is turned.
      facing.textContent = portrait ? (flipped ? "Facing left, as at the right of a scene" : "Facing right, as at the left of a scene") : now.says;
      turns.replaceChildren(...(portrait ? [flip, facing] : [left, right, facing]));
      part.textContent = `${who.name}: ${who.part.toLowerCase()}`;
      picker.show(colourOf(who));
      const cannot = portrait && !who.portraitPaints;
      note.textContent = cannot ? `In this portrait the ${who.part.toLowerCase()} has no colour of its own to be told by, so it is not repainted here: only on the figure.` : "";
      note.hidden = !cannot;
    };
    draw();

    shown.add(() => picker.unmount());
  };
  mountDevWindow(scope, { open, title: "Colours", closeSays: "Close the colour room", className: "palette-room", fill });

  return { picked, button: { glyph: "🎨", label: "Colours", title: "Look at each person large, turn her about, and give her dress another colour", open: () => open.set(true) } };
};
