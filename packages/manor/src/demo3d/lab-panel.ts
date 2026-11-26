import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { DEVICES, invent, offered } from "../game";
import type { DeviceId, Game } from "../game";
import { el } from "./panel";

/** A name as it sits in the middle of a sentence. */
const lower = (name: string): string => name.charAt(0).toLowerCase() + name.slice(1);

// The Master's inventing, under its own heading: a measure that his work in the laboratory
// fills; the devices to choose from, when it is full; and the ones already made. What each
// device does is on it as a tooltip, in a sentence.

type LabProps = { game: Game; frame: Value<number> };

/** The section is brought up to date this often, in seconds. */
const LAB_EVERY = 0.25;
const ALEMBIC = "⚗️";

export const mountLab = (scope: Scope, { game, frame }: LabProps): void => {
  const host = document.getElementById("lab");
  if (!host) return;

  // The measure: a bar that fills as he works.
  const measure = el("div", "measure");
  measure.setAttribute("role", "progressbar");
  measure.setAttribute("aria-valuemin", "0");
  const fill = el("span", "measure-fill");
  const track = el("span", "measure-track");
  track.append(fill);
  measure.append(el("span", "measure-glyph", ALEMBIC), track);
  // What there is to choose, when the measure is full; and what has been made.
  const offers = el("div", "offers");
  const made = el("div", "made");
  made.setAttribute("role", "list");
  host.append(measure, offers, made);

  let shown = "";
  const refresh = (): void => {
    const { lab } = game;
    const left = offered(game);
    measure.hidden = left.length === 0;
    measure.classList.toggle("full", lab.ready);
    fill.style.width = `${(lab.progress / lab.needed) * 100}%`;
    measure.setAttribute("aria-valuemax", String(lab.needed));
    measure.setAttribute("aria-valuenow", String(Math.floor(lab.progress)));
    measure.title = lab.ready ? "An invention is ready: choose which" : `The Master's work in his laboratory: ${Math.floor(lab.progress)} of ${lab.needed} minutes towards an invention. It fills only while he is at work there`;
    measure.setAttribute("aria-label", measure.title);

    // The rows are rebuilt only when what they show changes.
    const key = `${lab.ready}|${game.devices.join(",")}`;
    if (key === shown) return;
    shown = key;
    offers.replaceChildren(
      ...(lab.ready ? left : []).map((device) => {
        const button = el("button", "ware offer");
        button.dataset.device = device.id;
        // (Named the same in both, and by what pressing does.)
        const makes = `Make the ${lower(device.name)}: ${device.effect}`;
        button.title = makes;
        button.setAttribute("aria-label", makes);
        const got = el("span", "ware-gets");
        got.append(el("span", "ware-glyph", device.glyph), el("span", "ware-name", device.name));
        button.append(got, el("span", "ware-price", "✨"));
        return button;
      }),
    );
    made.replaceChildren(
      ...DEVICES.filter((d) => game.devices.includes(d.id)).map((device) => {
        const chip = el("span", "device", device.glyph);
        chip.setAttribute("role", "listitem");
        const madeSays = `Made: the ${lower(device.name)}. ${device.effect}`;
        chip.title = madeSays;
        chip.setAttribute("aria-label", madeSays);
        return chip;
      }),
    );
  };

  // One listener for the offers, which are drawn afresh: a listener on each would outlive it in the page's scope.
  scope.listen(offers, "click", (e: MouseEvent) => {
    const device = (e.target as Element).closest<HTMLElement>(".offer")?.dataset.device as DeviceId | undefined;
    if (!device) return;
    invent(game, device);
    refresh();
  });

  let next = 0;
  scope.effect((use) => {
    const now = use(frame);
    if (now < next) return;
    next = now + LAB_EVERY;
    refresh();
  });
};
