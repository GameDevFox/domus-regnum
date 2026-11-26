import type { Scope } from "@scene-lib/scope";
import { Value } from "@scene-lib/value";

import { DEV_COMMANDS, sceneDue } from "../game";
import type { DevCommand, Game } from "../game";
import type { DevWindowButton } from "./dev-window";
import { LAYER, onPageKey, openLayer } from "./keys";
import { liveReload } from "./live-reload";
import { CROSS } from "./map-places";
import { el } from "./panel";
import { DEV_MENU_KEY, MASTER_KEY } from "./person-keys";
import { remembered } from "./remember";
import { devTools } from "./ui-layer";
import "./dev-menu.css";

// The dev menu: things done to the game from outside its rules, to make it quick to test. It is
// locked until the false book in the laboratory is pulled (secret-book.ts), or the page is
// opened with `?dev=1`; unlocked, a wrench to the left of the gear opens it, or the tilde (Shift
// and the backtick: the backtick alone is the Master's, person-keys.ts), in the middle of the
// window, and Esc puts it away. Its buttons are the game's own named commands (src/game/dev.ts), which a script reaches by the same names
// (`window.manor3d.dev`), and a few things of the page's own: whether this tab takes live
// reload, a new game. (The faster clock is on the clock's own buttons in dev mode: transport.ts.) Dev mode is put off again by the button beside the cross. What opens into a window of its own (the colour room,
// the odds of discovery) is a row of larger buttons at the top, over the sections (the author,
// 2026-11-16: "everything from the dev menu that opens up into its own window should kind of be
// organized as, you know, bigger buttons towards the top of the dev menu, and then you have all
// the different sections below it").

type DevMenuProps = {
  game: Game;
  /** Whether the menu is unlocked. */
  unlocked: Value<boolean>;
  /** What opens into a window of its own: a row of larger buttons at the top of the menu. */
  windows: DevWindowButton[];
  /** Parts of the menu that are not the game's commands: each a heading and what is under it. */
  sections: { heading: string; build: (scope: Scope) => HTMLElement }[];
};

/** Whether it is unlocked, kept in this browser. */
const UNLOCKED = remembered("manor3d.dev");
/** What the page's address may say for no. Anything else it says is yes. */
const NO = ["", "0", "false", "no", "off"];
/** How long a notice stays, in milliseconds. */
const NOTICE_MS = 3200;
/** What the amount under Stock begins at. */
const STOCK_AMOUNT = 10;
const GROUPS: DevCommand["group"][] = ["Time", "Stock", "Scenes", "Outings", "Garden", "People"];

const WRENCH_PATH = '<path d="M20.5 6.4a5 5 0 0 1-6.6 5.9l-7.3 7.3a2 2 0 0 1-2.9-2.9l7.3-7.3A5 5 0 0 1 17.6 3.5L14.4 6.7l.7 2.2 2.2.7z" fill="currentColor"/>';
const WRENCH = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${WRENCH_PATH}</svg>`;
/** The same wrench, smaller, in a ring with a line through it: dev mode, off. */
const NO_WRENCH = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g transform="translate(12 12) scale(0.62) translate(-12 -12)">${WRENCH_PATH}</g><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.9 4.9l14.2 14.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

/**
 * Whether the menu begins unlocked: as the page's address says, if it says (`?dev=1`, `?dev=true`,
 * anything but a no; `?dev=0` locks it); else as this browser remembers.
 */
export const devUnlocked = (params: URLSearchParams): boolean => {
  const asked = params.get("dev");
  return asked === null ? UNLOCKED.get() : !NO.includes(asked.toLowerCase());
};

export const mountDevMenu = (scope: Scope, { game, unlocked, windows, sections }: DevMenuProps): void => {
  const open = Value(false);
  /** A notice, for a moment, under the clock. */
  const notice = (text: string): void => {
    const note = el("div", "dev-notice", text);
    note.setAttribute("role", "status");
    devTools().append(note);
    setTimeout(() => note.remove(), NOTICE_MS);
  };

  // Locked and unlocked: it is said each time, and kept.
  let first = true;
  scope.effect((use) => {
    const now = use(unlocked);
    UNLOCKED.set(now);
    if (!first) notice(now ? "Dev mode enabled" : "Dev mode disabled");
    first = false;
    if (!now) open.set(false);
  });

  // Unlocked, a wrench is beside the gear; and the menu, while it is open.
  scope.effect((use, shown) => {
    if (!use(unlocked)) return;
    const wrench = el("button", "round-button dev-button");
    wrench.innerHTML = WRENCH;
    wrench.setAttribute("aria-label", "Dev menu");
    wrench.title = `Dev menu — key ${DEV_MENU_KEY} (Shift + ${MASTER_KEY})`;
    shown.listen(wrench, "click", () => open.update((o) => !o));
    onPageKey(shown, (key) => {
      if (key === DEV_MENU_KEY) open.update((o) => !o);
    });
    shown.effect((useIn) => {
      const on = useIn(open);
      wrench.classList.toggle("on", on);
      wrench.setAttribute("aria-expanded", String(on));
    });
    devTools().append(wrench);
    shown.add(() => wrench.remove());
  });

  scope.effect((use, shown) => {
    if (!use(unlocked) || !use(open)) return;
    // In the middle of the window, over everything but its own wrench; Esc, the cross, or a press on the dark round it puts it away.
    const veil = el("div", "dev-veil");
    const panel = el("div", "help-card dev-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Dev menu");
    const close = el("button", "map-card-close dev-close");
    close.innerHTML = CROSS;
    close.setAttribute("aria-label", "Close the dev menu");
    close.title = "Close — key Esc";
    // To the left of the cross: dev mode put off again (the author's list, 2026-11-16: the Lock button "moved to left of close button", to say "Disable Dev Mode", with "a wrench with a circle and line through it").
    const off = el("button", "chip dev-off");
    off.innerHTML = NO_WRENCH;
    off.append(el("span", "", "Disable Dev Mode"));
    off.title = "Put dev mode off again: the wrench goes, and the false book stands back in its place";
    const top = el("div", "dev-top");
    const ends = el("div", "dev-ends");
    ends.append(off, close);
    top.append(el("h2", "title", "Dev menu"), ends);
    shown.listen(off, "click", () => unlocked.set(false));
    panel.append(top);
    shown.listen(close, "click", () => open.set(false));
    shown.listen(veil, "click", (e: MouseEvent) => {
      if (e.target === veil) open.set(false);
    });
    // Esc shuts it while it is on top: a window opened from it, the colour room for one, is drawn over it and has Esc first (keys.ts).
    openLayer(shown, LAYER.over, () => open.set(false));
    const head = (text: string): HTMLElement => el("h3", "dev-heading", text);
    const button = (label: string, title: string, run: () => void, says?: string): HTMLButtonElement => {
      const made = el("button", "chip dev-command", label);
      made.title = title;
      if (says) made.setAttribute("aria-label", says);
      shown.listen(made, "click", run);
      return made;
    };
    // The windows: each a larger button, by its picture and its name.
    const opens = el("div", "dev-windows");
    for (const { glyph, label, title, open: openIt } of windows) {
      const made = el("button", "dev-window-button");
      made.title = title;
      made.append(el("span", "dev-window-glyph", glyph), el("span", "", label));
      made.querySelector(".dev-window-glyph")?.setAttribute("aria-hidden", "true");
      shown.listen(made, "click", openIt);
      opens.append(made);
    }
    if (windows.length > 0) panel.append(opens);
    // One amount for everything under Stock: each of its buttons gives that much of its own thing.
    const amount = document.createElement("input");
    Object.assign(amount, { type: "number", className: "dev-amount", min: "1", step: "1", value: String(STOCK_AMOUNT) });
    amount.setAttribute("aria-label", "How much each button under Stock gives");
    amount.title = "How much each button under Stock gives";
    const asked = (): number => Math.max(1, Math.floor(Number(amount.value)) || STOCK_AMOUNT);
    for (const group of GROUPS) {
      const row = el("div", "dev-row");
      if (group === "Stock") row.append(amount);
      row.append(
        ...DEV_COMMANDS.filter((c) => c.group === group).map((c) =>
          button(c.label, group === "Stock" ? `${c.says ?? c.label}: add the amount in the box — window.manor3d.dev.run("${c.id}", amount)` : `window.manor3d.dev.run("${c.id}")`, () => {
            const playing = game.scene !== null || sceneDue(game) !== null;
            c.run(game, group === "Stock" ? asked() : undefined);
            // A scene is due of it, or has begun: the menu gets out of its way.
            if (!playing && (game.scene !== null || sceneDue(game) !== null)) open.set(false);
          }, group === "Stock" && c.says ? `Add ${c.says.toLowerCase()}` : undefined),
        ),
      );
      panel.append(head(group), row);
    }
    for (const section of sections) panel.append(head(section.heading), section.build(shown));
    // The page's own: not of the game, so not among its commands.
    const page = el("div", "dev-row");
    const live = el("label", "dev-check");
    const tick = document.createElement("input");
    tick.type = "checkbox";
    tick.checked = liveReload.get();
    tick.disabled = !liveReload.there;
    shown.listen(tick, "change", () => {
      liveReload.set(tick.checked);
      notice(tick.checked ? "Live reload on for this tab" : "Live reload off for this tab: reload by hand to take changes");
    });
    live.append(tick, "Live reload in this tab");
    live.title = liveReload.there ? "Off, this tab is left as it is when the code changes, until it is reloaded by hand" : "There is no live reload in this build";
    // (The faster speeds are on the clock itself in dev mode: transport.ts.)
    page.append(
      live,
      button("New game", "Open the page afresh", () => location.reload()),
    );
    panel.append(head("Page"), page);
    veil.append(panel);
    devTools().append(veil);
    shown.add(() => veil.remove());
  });
};
