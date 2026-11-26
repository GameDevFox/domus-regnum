import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { SEASONS, dateOfDay, dateSays, dayOf } from "../game";
import type { Game } from "../game";
import { AskMark } from "./ask-mark";
import { DayDial } from "./day-dial";
import type { DialPlan } from "./plans";
import { ui } from "./ui-layer";

// Time, in one place at the top of the screen: what time it is, stop it, or choose how fast it runs.
// In dev mode two more speeds are beside the usual three, to make it quick to test (the author's
// list, 2026-11-16: "In Dev Mode x16 and x64 show up in normal time menu (remove redundant from
// Dev Menu)").

export const SPEEDS = [1, 2, 4];
/** The speeds beside those, in dev mode. */
export const DEV_SPEEDS = [16, 64];

/**
 * The pause button: its picture, its name and its title. The name is what pressing does, and the
 * title begins with it. Held by a question, time is not running, so the picture is the play sign
 * (faint: demo3d.css); its name then says first why the clock stands, and then that pressing it
 * pauses all the same, so that the picture and the name do not disagree.
 */
export const pauseSays = (stopped: boolean, held: boolean): { glyph: string; label: string; title: string } => {
  if (stopped) return { glyph: "▶", label: "Resume", title: held ? "Resume — key Space. Time stands still until she is told what next" : "Resume — key Space" };
  if (held) return { glyph: "▶", label: "Time stands still until she is told what next: press to pause", title: "Time stands still until she is told what next: press to pause — key Space" };
  return { glyph: "❚❚", label: "Pause", title: "Pause — key Space" };
};

type TransportProps = {
  paused: Value<boolean>;
  /** Whether time stands still for someone told to stay, who is being given something to do (stay-hold.ts). */
  staying: Value<boolean>;
  speed: Value<number>;
  /** The game's clock, in minutes. */
  daytime: Value<number>;
  /** What the house is waiting for, drawn on the dial. */
  plans: Value<DialPlan[]>;
  /** Whether the calendar is open: the leaf at the head of the clock opens it. */
  calendar: Value<boolean>;
  /** Whether dev mode is on: the faster speeds are shown while it is. */
  dev: Value<boolean>;
  game: Game;
  frame: Value<number>;
  /** Open the map, where a question waiting is put. */
  openMap: () => void;
};

export const mountTransport = (scope: Scope, { paused, staying, speed, daytime, plans, calendar, dev, game, frame, openMap }: TransportProps): void => {
  const root = document.createElement("div");
  root.className = "pill pill-top";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Time");
  // The day, as a leaf of a calendar: the day of the season, under a band of the season's colour. Pressing it opens the calendar.
  const leaf = document.createElement("button");
  leaf.className = "dial-day";
  scope.listen(leaf, "click", () => calendar.update((open) => !open));
  let leafDay = -1;
  scope.effect((use) => {
    const count = dayOf(use(daytime));
    leaf.setAttribute("aria-expanded", String(use(calendar)));
    if (count === leafDay) return;
    leafDay = count;
    const date = dateOfDay(count);
    leaf.textContent = String(date.day);
    leaf.dataset.season = SEASONS[date.season].id;
    leaf.setAttribute("aria-label", `Calendar: ${dateSays(date)}`);
    leaf.title = `${dateSays(date)}. Open the calendar — key C`;
  });
  // While someone is waiting to be told what next, a mark by the dial says so (ask-mark.ts).
  const asking = AskMark(scope, { game, frame, show: openMap });
  root.append(leaf, DayDial(scope, daytime, plans), asking.node);

  const pause = document.createElement("button");
  pause.className = "pill-button pill-glyph";
  scope.listen(pause, "click", () => paused.update((p) => !p));
  root.append(pause);

  const rates = [...SPEEDS, ...DEV_SPEEDS].map((rate) => {
    const button = document.createElement("button");
    const fast = DEV_SPEEDS.includes(rate);
    button.className = `pill-button${fast ? " pill-dev" : ""}`;
    button.textContent = `×${rate}`;
    button.setAttribute("aria-label", `Speed ×${rate}`);
    button.title = fast ? `Speed ×${rate}. Dev mode: run the clock ${rate} times as fast` : `Speed ×${rate} — key Tab steps through the speeds`;
    // Choosing a speed is also saying "go".
    scope.listen(button, "click", () => {
      speed.set(rate);
      paused.set(false);
    });
    root.append(button);
    return { rate, button };
  });

  ui().append(root);
  scope.add(() => root.remove());

  // The faster speeds are on the clock only in dev mode; put off, a fast clock goes back to the fastest of the usual.
  scope.effect((use) => {
    const on = use(dev);
    for (const { rate, button } of rates) if (DEV_SPEEDS.includes(rate)) button.hidden = !on;
    if (!on && DEV_SPEEDS.includes(speed.peek())) speed.set(SPEEDS[SPEEDS.length - 1]);
  });

  scope.effect((use) => {
    const stopped = use(paused);
    const current = use(speed);
    // Held by a question, or for someone told to stay who is being given something to do, time is not running, and the clock does not look as though it were: the play sign, faint, and no speed lit.
    const asked = use(asking.held);
    const chosen = use(staying);
    const held = asked || chosen;
    const says = pauseSays(stopped, held);
    pause.textContent = says.glyph;
    pause.setAttribute("aria-label", says.label);
    pause.title = says.title;
    pause.classList.toggle("on", stopped);
    pause.classList.toggle("held", held && !stopped);
    for (const { rate, button } of rates) {
      const on = !stopped && !held && rate === current;
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", String(on));
    }
  });
};
