import type { Scope } from "@scene-lib/scope";

import { callHome, outingOf } from "../game";
import type { Game } from "../game";
import { el } from "./dom";
import { LAYER, openLayer } from "./keys";
import { nameOf } from "./map-places";
import { homewardSays } from "./who-says";

// The menu on someone's token on the map: pressing her face there puts up a small menu by it
// (the author's list, 2026-11-16: "Should be able to click on her on the map and a menu pops up
// with "Return Home" as an option (we might add other items to this character menu later)").
// What is on it is a list, one entry an item: another item is one more entry. An item that
// cannot be done just now is shown, disabled, with why as its tooltip. A press anywhere else, or
// Esc, puts it away, and put away it is gone from the page.

export type TokenItem = {
  id: string;
  glyph: string;
  label: string;
  /** Why it cannot be done for her just now, if it cannot. */
  whyNot: (game: Game, id: string) => string | null;
  /** Do it. True if it was done. */
  run: (game: Game, id: string) => boolean;
};

/** Whether someone out is on her way home already: turned for it, or coming up the drive, or in. */
const homeward = (game: Game, id: string): boolean => {
  const out = outingOf(game, id);
  return out === undefined || out.homeward || out.state === "coming" || out.state === "returning";
};

export const TOKEN_ITEMS: TokenItem[] = [{ id: "home", glyph: "🏠", label: "Return home", whyNot: (game, id) => (homeward(game, id) ? homewardSays(id) : null), run: callHome }];

/** The items of her menu as they stand: each with why it cannot be done, if it cannot. */
export const tokenItems = (game: Game, id: string): { item: TokenItem; why: string | null }[] => TOKEN_ITEMS.map((item) => ({ item, why: item.whyNot(game, id) }));

/** How far under her token the menu hangs, in pixels. */
const BELOW_PX = 8;

export type TokenMenu = { node: HTMLElement; /** Set it by her token, where that is now, and bring its items up to the moment. */ refresh: () => void };

/** Where her token's middle is drawn in the pane, in pixels; and how many pixels of the pane a pixel of the map's sheet is just now. */
export type TokenAnchor = { x: number; y: number; scale: number };

type MenuProps = {
  game: Game;
  who: string;
  /** What it is set within, and the token it hangs from (null once she is off the map). */
  pane: HTMLElement;
  token: () => HTMLElement | null;
  /** Where the token is drawn: worked out from where it was put, so that the page is not asked every frame. */
  anchor: () => TokenAnchor | null;
  /** Put it away. */
  close: () => void;
};

export const TokenMenu = (scope: Scope, { game, who, pane, token, anchor, close }: MenuProps): TokenMenu => {
  const node = el("div", "map-token-menu");
  node.setAttribute("role", "menu");
  node.setAttribute("aria-label", nameOf(who));
  node.dataset.who = who;
  const items = TOKEN_ITEMS.map((item) => {
    const button = el("button", "map-token-item");
    button.setAttribute("role", "menuitem");
    button.dataset.item = item.id;
    button.append(el("span", "map-token-item-glyph", item.glyph), el("span", "", item.label));
    scope.listen(button, "click", () => {
      if (item.run(game, who)) close();
    });
    return { item, button };
  });
  node.append(...items.map(({ button }) => button));
  pane.append(node);
  scope.add(() => node.remove());

  // A press anywhere but on it or her token puts it away; and so does Esc, while it is on top (keys.ts: on the map, it is opened after the map is).
  openLayer(scope, LAYER.map, close);
  scope.listen(
    window,
    "pointerdown",
    (e: PointerEvent) => {
      const on = e.target as Node;
      if (!node.contains(on) && !token()?.contains(on)) close();
    },
    { capture: true },
  );

  /** How far below her token's middle the menu hangs, in pixels of the sheet: measured from the page only when what is under her face changes. */
  let drop = 0;
  /** What the slip under her face said when that was measured: undefined until it first is. */
  let slipSaid: string | null | undefined;
  /** Why each item cannot be done, as they were last set: null until they are first set. */
  let said: string | null = null;
  const refresh = (): void => {
    const face = token();
    const at = anchor();
    if (!face || !at) return close();
    const slip = face.querySelector(".map-token-status");
    const slipSays = slip?.textContent ?? null;
    if (slipSays !== slipSaid) {
      slipSaid = slipSays;
      const box = face.getBoundingClientRect();
      // Under the slip that says what she is at, where there is one, so that it is still read.
      const bottom = Math.max(box.bottom, slip?.getBoundingClientRect().bottom ?? box.bottom);
      drop = (bottom - (box.top + box.height / 2)) / at.scale;
    }
    const left = `${at.x}px`;
    const top = `${at.y + drop * at.scale + BELOW_PX}px`;
    if (node.style.left !== left || node.style.top !== top) Object.assign(node.style, { left, top });
    const now = tokenItems(game, who)
      .map(({ why }) => why ?? "")
      .join("\n");
    if (now === said) return;
    said = now;
    for (const { item, button } of items) {
      const why = item.whyNot(game, who);
      button.disabled = why !== null;
      const says = why ? `${item.label}. ${why}` : item.label;
      button.title = says;
      button.setAttribute("aria-label", says);
    }
  };
  refresh();
  items.find(({ button }) => !button.disabled)?.button.focus({ preventScroll: true });
  return { node, refresh };
};

/** The one menu that may be up on a map: put up by her token, taken down again by the same, and kept by her token as she goes. */
export const tokenMenus = (scope: Scope, { game, pane, tokenOf, anchorOf }: { game: Game; pane: HTMLElement; tokenOf: (who: string) => HTMLElement | null; anchorOf: (who: string) => TokenAnchor | null }): { toggle: (who: string) => void; refresh: () => void; /** Put away whichever is up. */ shut: () => void } => {
  let up: { who: string; scope: Scope; menu: TokenMenu } | null = null;
  const shut = (): void => {
    up?.scope.cleanup();
    up = null;
  };
  scope.add(shut);
  return {
    toggle: (who) => {
      const was = up?.who;
      shut();
      if (was === who) return;
      const inner = scope.child();
      up = { who, scope: inner, menu: TokenMenu(inner, { game, who, pane, token: () => tokenOf(who), anchor: () => anchorOf(who), close: shut }) };
    },
    refresh: () => up?.menu.refresh(),
    shut,
  };
};
