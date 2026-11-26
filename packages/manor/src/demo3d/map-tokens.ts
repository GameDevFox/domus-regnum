import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { outingStatus, partyOf, whereabouts } from "../game";
import type { Game, MapPoint, Outing } from "../game";
import { TOKEN_RADIUS } from "./map-art";
import { namesSay } from "./ask-says";
import { faceOf, pointOf, px } from "./map-places";
import { drawnAt } from "./map-travel";
import { el } from "./panel";
import { statusSays, statusShort } from "./outing-says";
import { tokenMenus } from "./token-menu";
import type { TokenAnchor } from "./token-menu";

// The faces of whoever is out of doors, on the map's sheet: each where she is, with what she is
// at on a slip under her (map-view.ts sets the sheet down). People at the same point stand side
// by side. A party (the rules' outing-party.ts) is drawn as one: its faces close together and
// overlapping, at the point where the first of it is, ringed alike, with one slip under the
// first that says what the party is at and whose faces they are. Pressed, a face puts up her
// menu (token-menu.ts), which for one of a party is the party's.

/** People at the same point of the map stand this far apart, in the map's units, so that each can be seen. */
const SIDE_BY_SIDE = 0.034;
/** A party's faces are closer than that, so that they are seen to be together: this share of it. */
const PARTY_CLOSE = 0.6;

type TokensProps = {
  game: Game;
  /** The layer of the sheet they are set down on, and the pane their menus hang in. */
  tokens: HTMLElement;
  pane: HTMLElement;
  /** Who is being followed: she is marked, and the map is brought to her once as she is first seen. */
  following: Value<string | null>;
  bring: (at: MapPoint) => void;
  /** Where a point of the map is drawn in the pane just now, from where the sheet is set (map-view.ts): a face's menu is hung by it. */
  onPane: (at: MapPoint) => TokenAnchor;
};

export type MapTokens = { draw: () => void; menus: ReturnType<typeof tokenMenus> };

export const MapTokens = (shown: Scope, { game, tokens, pane, following, bring, onPane }: TokensProps): MapTokens => {
  /** Everyone out of doors, each where she is; and the point of the map her face is set at. */
  const faces = new Map<string, HTMLElement>();
  const setAt = new Map<string, MapPoint>();
  /** Her menu, put up by pressing her face. */
  const menus = tokenMenus(shown, {
    game,
    pane,
    tokenOf: (who) => faces.get(who) ?? null,
    anchorOf: (who) => {
      const at = setAt.get(who);
      return at ? onPane(at) : null;
    },
  });
  // Enter or Space on a face puts up her menu, as a press does. One listener for every face, so that a face taken off the map leaves nothing listening behind it.
  shown.listen(tokens, "keydown", (e: KeyboardEvent) => {
    const who = (e.target as Element).closest<HTMLElement>(".map-token")?.dataset.who;
    if (!who || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    menus.toggle(who);
  });
  /** Whoever is followed, once the map has been brought to her: it is brought once, and then left to be slid about. */
  let broughtTo: string | null = null;

  const faceFor = (who: string): HTMLElement => {
    const known = faces.get(who);
    if (known) return known;
    const face = faceOf(who);
    face.classList.add("map-token");
    face.dataset.who = who;
    // Pressed, her menu is put up by it; from the keyboard too (heard below, by the layer of faces).
    face.setAttribute("role", "button");
    face.tabIndex = 0;
    Object.assign(face.style, { width: px(TOKEN_RADIUS * 2), height: px(TOKEN_RADIUS * 2) });
    // Under her face, what she is at: how far off she is, or how full her basket.
    face.append(el("span", "map-token-status"));
    faces.set(who, face);
    tokens.append(face);
    return face;
  };

  /** Where one out alone, or the first of a party, is drawn, and the point she stands still at. */
  const placed = (outing: Outing): { at: MapPoint; spot: string } | null => {
    const where = whereabouts(outing, game.clock);
    if (!where) return null;
    // On the way she is where the way is drawn; at a place she is busy about it, walking from spot to spot with a step in her walk (map-travel.ts).
    const still = pointOf(where);
    const drawn = drawnAt(outing, game.clock) ?? { ...still, lift: 0 };
    return { at: { x: drawn.x, y: drawn.y - drawn.lift }, spot: `${still.x.toFixed(3)},${still.y.toFixed(3)}` };
  };

  const draw = (): void => {
    const out = new Set<string>();
    /** How many stand at each point already, so that the next stands beside them. */
    const standing = new Map<string, number>();
    // Each out alone, and each party by the first of it: the rest of a party are drawn with her.
    for (const outing of game.outings) {
      const party = partyOf(game, outing.who);
      if (party[0] !== outing.who) continue;
      const where = placed(outing);
      if (!where) continue;
      const beside = standing.get(where.spot) ?? 0;
      standing.set(where.spot, beside + 1);
      const status = outingStatus(game, outing);
      const says = `${namesSay(party)}, ${statusSays(game, status, party.length === 1 ? outing.who : undefined)}`;
      for (const [n, who] of party.entries()) {
        out.add(who);
        const face = faceFor(who);
        const label = face.firstElementChild as HTMLElement;
        // One slip, under the first of a party.
        const short = n === 0 ? statusShort(status) : "";
        if (label.textContent !== short) label.textContent = short;
        face.classList.toggle("party", party.length > 1);
        const at = { x: where.at.x + beside * SIDE_BY_SIDE + n * SIDE_BY_SIDE * PARTY_CLOSE, y: where.at.y };
        setAt.set(who, at);
        // (Set only when she has moved: nothing on the page is changed for a face standing still.)
        const [left, top] = [px(at.x), px(at.y)];
        if (face.style.left !== left || face.style.top !== top) Object.assign(face.style, { left, top });
        // Whoever is followed is marked; and the map is brought to her, the once, as she is first seen on it.
        const hers = following.peek() === who;
        face.classList.toggle("followed", hers);
        if (hers && broughtTo !== who) {
          broughtTo = who;
          bring(where.at);
        }
        if (face.title !== says) {
          face.title = says;
          face.setAttribute("aria-label", says);
        }
      }
    }
    if (broughtTo !== null && following.peek() !== broughtTo) broughtTo = null;
    for (const [who, face] of faces) {
      if (out.has(who)) continue;
      face.remove();
      faces.delete(who);
      setAt.delete(who);
    }
  };
  return { draw, menus };
};
