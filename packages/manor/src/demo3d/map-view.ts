import { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { HOME, onMap } from "../game";
import type { Game, Known, PlaceId } from "../game";
import { sendAlone } from "./card-send";
import { LAYER, onPageKey, openLayer } from "./keys";
import { MAP_ART, PARCHMENT, PIECES } from "./map-art";
import { askKey, askOn } from "./map-ask";
import { PlaceCard, cardShape } from "./map-card";
import { CROSS, MINUS, PLUS, SHEET_PX, faceOf, placeNode, px, waysDrawn } from "./map-places";
import { MapTokens } from "./map-tokens";
import { revealOn } from "./reveal";
import { heldFor } from "./stay-hold";
import { farthest, held, nearest, reachOf, slidBy, wholeReach, zoomedAt } from "./map-zoom";
import type { Frame, MapLook } from "./map-zoom";
import { WIDE_SCREEN } from "./page-tuning";
import { el } from "./panel";
import type { Considering } from "./plans";
import { ui } from "./ui-layer";
import "./map.css";

// The map: the country round the house, on a sheet of parchment laid over the picture. A place
// the house has found is a set piece in its own shape; one it only knows is there is a round
// token with a question mark. Whoever is out of doors is seen on the way she is walking.
//
// Pressing a place asks what can be done there and who is to go (map-card.ts). Pressing someone's
// face puts up her menu by it (token-menu.ts).
//
// It takes the whole window, with its way out in the top right corner. It can be drawn near and
// slid about, and drawn back only as far as takes in what is on it (map-zoom.ts). Time goes on
// while it is open, and the clock stays above it.
//
// The panel stays above it too (the author's, 2026-11-18: "should always show the left side menu,
// whether we're on the manor screen or the map screen"): the desk runs under the panel, and
// whatever is set on the map's frame (a place's card, a question) is set clear of it, by
// `--map-clear`. That is on a wide screen (main.ts, WIDE_SCREEN); on a narrower one the panel would
// leave the map too little, and the map lies over it (demo3d.css).
//
// Where the map itself is centred is a setting (view-centre.ts). Centred on the window, as a first
// visit has it, the frame the sums are done in (map-zoom.ts) is the whole window, and the panel
// stands over the map's left. The other way the frame begins to the right of the panel, so that
// opened the map has every place clear of it, and folding the panel away gives the map its room.

type MapProps = {
  game: Game;
  open: Value<boolean>;
  /** Ticks once a frame, in seconds. */
  frame: Value<number>;
  /** The outing the player is thinking of, for the dial. */
  considering: Value<Considering | null>;
  /** The key that opens and closes it. */
  key: string;
  /** Whether the dev menu is unlocked: a right-click on a question mark then makes the thing known. */
  dev: Value<boolean>;
  /** Who is being followed, if anyone: out on the map, she is marked, and the map is brought to her. */
  following: Value<string | null>;
  /** Whether the map is centred on the window, or in what the panel leaves of it (view-centre.ts). */
  centred: Value<boolean>;
  /** Set while time stands still for someone told to stay, who is being given something to do (stay-hold.ts). */
  staying: Value<boolean>;
};

export type MapHandle = {
  /** What is being looked at, and the farthest out the view may draw back; null while the map is shut. */
  look: () => (MapLook & { farthest: number }) | null;
  /** Pull the paper so many pixels across and down, while the map is open: for whatever slides it that is not its own keys or a drag. */
  slide: (dx: number, dy: number) => void;
};

/** A press that moves farther than this is the map being slid, not a place being pressed. */
const CLICK_SLACK_PX = 5;
/** The card for a place is brought up to the moment this often, in seconds. */
const CARD_EVERY = 0.25;
/** A turn of the wheel draws nearer or farther by this much for each pixel it reports. */
const WHEEL_RATE = 0.0015;
/** One press of a zoom button, or of + or -. */
const ZOOM_STEP = 1.4;
/** One press of an arrow slides the map this many pixels. */
const SLIDE_STEP = 80;
/** Scales nearer each other than this are the same: for telling whether a zoom button has anything left to do. */
const SAME_SCALE = 0.5;
/** The room left between the panel and what of the map is looked at. */
const PANEL_GAP_PX = 16;

const NEARER_KEYS = ["+", "="];
const FARTHER_KEYS = ["-", "_"];
/** The keys that slide the house's view slide the map instead while it is open: which way each pulls the paper, in steps. */
/** Whether the house knows the same of each place in two readings of it. */
const sameKnowing = (a: Partial<Record<PlaceId, Known>>, b: Partial<Record<PlaceId, Known>>): boolean => {
  const ids = Object.keys(a) as PlaceId[];
  return ids.length === Object.keys(b).length && ids.every((id) => a[id] === b[id]);
};

const SLIDE_KEYS: Record<string, [number, number]> = { arrowleft: [1, 0], a: [1, 0], arrowright: [-1, 0], d: [-1, 0], arrowup: [0, 1], w: [0, 1], arrowdown: [0, -1], s: [0, -1] };

export const mountMap = (scope: Scope, { game, open, frame, considering, key, dev, following, centred, staying }: MapProps): MapHandle => {
  // The way in: the map itself, small, in the corner of the screen, with the faces of whoever is out on it.
  const button = el("button", "map-widget");
  button.style.backgroundImage = `url("${MAP_ART}${PIECES.manor.file}"), url("${MAP_ART}${PARCHMENT}")`;
  const abroad = el("span", "map-widget-out");
  button.append(abroad);
  scope.listen(button, "click", () => open.update((o) => !o));
  let nextAbroad = 0;
  let abroadNow = "";
  /** The question the map was last opened for (map-ask.ts, `askKey`): it is opened once for each. */
  let putUp = "";
  scope.effect((use) => {
    const now = use(frame);
    if (now < nextAbroad) return;
    nextAbroad = now + CARD_EVERY;
    // Someone out of doors has begun asking what she is to do: the question is on the map, so the map is opened, once. Shut again, it stays shut: the question waits, and the clock says so (ask-mark.ts) (the author's list, 2026-11-16: "Focusing on another character pops awkwardly back to the "What next?" dialogue if the first is in the manor and the other is in town").
    const asking = askKey(game.asks[0]);
    if (asking !== putUp) {
      putUp = asking;
      if (asking) open.set(true);
    }
    const out = game.outings.filter((o) => o.state === "away").map((o) => o.who);
    if (out.join() === abroadNow) return;
    abroadNow = out.join();
    abroad.replaceChildren(...out.map(faceOf));
  });
  scope.effect((use) => {
    const shown = use(open);
    const label = shown ? "Close the map" : "Open the map";
    button.classList.toggle("on", shown);
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(shown));
    button.title = `${label} — key ${key.toUpperCase()}`;
  });
  ui().append(button);
  scope.add(() => button.remove());

  // Fetched as the page opens, so that the map does not fill in piece by piece the first time it is looked at.
  for (const file of [PARCHMENT, ...Object.values(PIECES).map((p) => p.file)]) new Image().src = MAP_ART + file;

  const panel = document.getElementById("panel");
  /** The sliding of the map that is open, if it is. */
  let slideNow: ((dx: number, dy: number) => void) | null = null;
  /** Where the map was being looked at when it was last shut: it opens there again. */
  let look: MapLook | null = null;
  let seen: (MapLook & { farthest: number }) | null = null;

  scope.effect((use, shown) => {
    if (!use(open)) return;
    const veil = el("div", "map-veil");
    const pane = el("div", "map-frame");
    pane.setAttribute("role", "dialog");
    pane.setAttribute("aria-label", "The map");
    const sheet = el("div", "map-sheet");
    sheet.style.backgroundImage = `url("${MAP_ART}${PARCHMENT}")`;
    Object.assign(sheet.style, { width: px(1), height: px(1) });
    const places = el("div", "map-places");
    // With the dev menu unlocked, a right-click on a place's question mark finds the place.
    revealOn(shown, places, { game, dev });
    const tokens = el("div", "map-tokens");
    sheet.append(places, tokens);

    const close = el("button", "map-close");
    close.innerHTML = CROSS;
    close.setAttribute("aria-label", "Close the map");
    close.title = "Close — key Esc";
    const nearer = el("button", "map-zoom-button");
    nearer.innerHTML = PLUS;
    nearer.setAttribute("aria-label", "Nearer");
    nearer.title = "Nearer — key +";
    const farther = el("button", "map-zoom-button");
    farther.innerHTML = MINUS;
    farther.setAttribute("aria-label", "Farther");
    farther.title = "Farther — key -";
    const zoom = el("div", "map-zoom");
    zoom.append(nearer, farther);
    pane.append(sheet, close, zoom);
    veil.append(pane);
    ui().append(veil);
    shown.add(() => {
      // Shut while drawn right back, it opens drawn right back, however the window, the panel or the setting has changed meanwhile; otherwise it opens where it was being looked at.
      if (drawnBack()) look = null;
      veil.remove();
      seen = null;
    });

    /** How much of the pane's left the panel stands over, with a little room: what is set on the frame is set to the right of it. */
    const besideNow = (): number => (panel === null || pane.clientWidth < WIDE_SCREEN ? 0 : Math.round(panel.getBoundingClientRect().right) + PANEL_GAP_PX);
    let beside = besideNow();
    /** Where the frame the map is looked at through begins: at the pane's left while the map is centred on the window, and otherwise clear of the panel. */
    let clear = centred.peek() ? 0 : beside;
    pane.style.setProperty("--map-clear", `${beside}px`);
    const size = (): Frame => ({ w: Math.max(1, pane.clientWidth - clear), h: pane.clientHeight });
    /** The frame's size when the sheet was last set: what is drawn on it is placed by this, without asking the page each frame. */
    let setIn: Frame = { w: 0, h: 0 };
    let reach = reachOf(onMap(game).map((p) => p.at));
    /** What of the country is drawn just now: the pieces are set down again only when it changes. */
    let drawn: Partial<Record<PlaceId, Known>> | null = null;
    /** The place whose card is up, and the card. */
    let picked: PlaceId | null = null;
    let card: PlaceCard | null = null;
    /** What the card was made of when it was put up (`cardShape`): it is made again when that is otherwise. */
    let shaped = "";
    let cardScope: Scope | null = null;

    const show = (next: MapLook): void => {
      const within = size();
      setIn = within;
      look = held(next, within, reach);
      const limit = farthest(within, reach);
      seen = { ...look, farthest: limit };
      sheet.style.transform = `translate(${clear + within.w / 2 - look.x * look.scale}px, ${within.h / 2 - look.y * look.scale}px) scale(${look.scale / SHEET_PX})`;
      // A zoom button with nothing left to do says so.
      farther.disabled = look.scale - limit < SAME_SCALE;
      nearer.disabled = nearest(within, reach) - look.scale < SAME_SCALE;
    };
    const current = (): MapLook => look ?? wholeReach(size(), reach);
    /** Whether the view is drawn right back, to all that may be seen. */
    const drawnBack = (): boolean => look !== null && look.scale - farthest(size(), reach) < SAME_SCALE;
    const zoomBy = (factor: number, at?: { x: number; y: number }): void => {
      const within = size();
      show(zoomedAt(current(), within, reach, factor, at ?? { x: within.w / 2, y: within.h / 2 }));
    };
    const slide = (dx: number, dy: number): void => show(slidBy(current(), size(), reach, dx, dy));
    slideNow = slide;
    shown.add(() => (slideNow = null));

    /** Put up the card for a place, or take the card down. */
    const pick = (place: PlaceId | null): void => {
      // The manor is home: a press on it is the way back to the house, and the map is put away (the author's, 2026-11-16:
      // "Clicking on the manor on the map takes us back to the manor view"). A question waiting is put aside with it, as by any way of shutting the map.
      if (place === HOME) return open.set(false);
      cardScope?.cleanup();
      card?.node.remove();
      card = null;
      cardScope = null;
      picked = place;
      for (const node of places.querySelectorAll("[data-place]")) node.classList.toggle("picked", (node as HTMLElement).dataset.place === place);
      if (place === null) return;
      cardScope = Scope();
      card = PlaceCard(cardScope, { game, place, considering, close: () => pick(null), dev });
      shaped = cardShape(game, place);
      pane.append(card.node);
    };
    shown.add(() => pick(null));

    /** Set the places down as the house knows them now. */
    const drawPlaces = (): void => {
      if (drawn !== null && sameKnowing(game.places, drawn)) return;
      const before = drawn;
      drawn = { ...game.places };
      const onIt = onMap(game);
      // Those lower on the map are set down last, so that they stand in front of those above them.
      // A place found while the map is being looked at is seen to be set down.
      const nodes = [...onIt].sort((a, b) => a.at.y - b.at.y).map((p) => placeNode(game, p, before !== null && before[p.id] === "unknown" && game.places[p.id] === "found"));
      places.replaceChildren(waysDrawn(game), ...nodes);
      // The card says what the place is: it is made again when that changes.
      pick(picked);
      // Drawn right back, the view stays drawn right back when the map grows: the new place is seen at once.
      const wasWhole = drawnBack();
      reach = reachOf(onIt.map((p) => p.at));
      show(wasWhole ? wholeReach(size(), reach) : current());
    };

    // Whoever is out of doors, each where she is, and a party as one (map-tokens.ts).
    // (A point of the sheet is drawn so far from the middle of the pane as it is from the point looked at, times the scale: the transform `show` sets.)
    const onPane = (at: { x: number; y: number }): { x: number; y: number; scale: number } => {
      const now = current();
      return { x: clear + setIn.w / 2 + (at.x - now.x) * now.scale, y: setIn.h / 2 + (at.y - now.y) * now.scale, scale: now.scale / SHEET_PX };
    };
    const { draw: drawTokens, menus } = MapTokens(shown, { game, tokens, pane, following, bring: (at) => show({ ...current(), x: at.x, y: at.y }), onPane });

    drawPlaces();
    drawTokens();
    // The question someone out of doors is asking, over the map; told to stay, the card of the place she is at is put up, to give her something to do there.
    // …and time stands still until she is given it, or the card is put away, or the map shut (stay-hold.ts).
    let stayer: string | null = null;
    shown.add(() => staying.set(false));
    const drawAsk = askOn(pane, game, (place, who) => {
      sendAlone();
      pick(place);
      stayer = who;
      staying.set(true);
    });

    let nextCard = 0;
    shown.effect((useIn) => {
      const now = useIn(frame);
      drawPlaces();
      drawTokens();
      // A question over the map puts away any face's menu: it would stand over the question's veil, and be pressed with the question waiting.
      if (drawAsk()) menus.shut();
      menus.refresh();
      if (!heldFor(game, stayer, card !== null)) stayer = null;
      staying.set(stayer !== null);
      if (now < nextCard) return;
      nextCard = now + CARD_EVERY;
      // Something has been found at the place the card is of, or can no longer be done there: the card is put up afresh, with what can be done there now.
      if (picked !== null && card !== null && cardShape(game, picked) !== shaped) pick(picked);
      card?.refresh();
    });

    /** The window or the panel is another size: the map is looked at through what there is now, and drawn right back it stays so. */
    const reframe = (): void => {
      const wasWhole = drawnBack();
      beside = besideNow();
      clear = centred.peek() ? 0 : beside;
      pane.style.setProperty("--map-clear", `${beside}px`);
      show(wasWhole ? wholeReach(size(), reach) : current());
    };
    shown.listen(window, "resize", reframe);
    // The panel folded away or opened, or grown wider with what is on it, gives the map more room or less.
    if (panel !== null) {
      const watching = new ResizeObserver(() => (besideNow() === beside ? undefined : reframe()));
      watching.observe(panel);
      shown.add(() => watching.disconnect());
    }
    shown.listen(close, "click", () => open.set(false));
    shown.listen(nearer, "click", () => zoomBy(ZOOM_STEP));
    shown.listen(farther, "click", () => zoomBy(1 / ZOOM_STEP));
    shown.listen(
      pane,
      "wheel",
      (e: WheelEvent) => {
        e.preventDefault();
        const box = pane.getBoundingClientRect();
        zoomBy(Math.exp(-e.deltaY * WHEEL_RATE), { x: e.clientX - box.left - clear, y: e.clientY - box.top });
      },
      { passive: false },
    );

    // One finger or the mouse slides the map; two fingers draw it nearer and farther about the point between them.
    const fingers = new Map<number, { x: number; y: number }>();
    const between = (): { x: number; y: number; apart: number } => {
      const [a, b] = [...fingers.values()];
      const box = pane.getBoundingClientRect();
      return { x: (a.x + b.x) / 2 - box.left - clear, y: (a.y + b.y) / 2 - box.top, apart: Math.hypot(a.x - b.x, a.y - b.y) };
    };
    /** Where the press that is under way began, and on which place if on one; null once it has moved too far to be a press. */
    let press: { x: number; y: number; place: PlaceId | null; who: string | null } | null = null;
    shown.listen(pane, "pointerdown", (e: PointerEvent) => {
      // The card and the buttons at the corners are pressed in the ordinary way.
      if ((e.target as Element).closest(".map-card, .map-ask-veil, .map-close, .map-zoom, .map-token-menu")) return;
      // Only the first button presses and drags: a right-click is left to whatever is under it (reveal.ts).
      if (e.button !== 0) return;
      pane.setPointerCapture(e.pointerId);
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const on = (e.target as Element).closest<HTMLElement>("button[data-place]")?.dataset.place as PlaceId | undefined;
      const who = (e.target as Element).closest<HTMLElement>(".map-token")?.dataset.who ?? null;
      press = fingers.size === 1 ? { x: e.clientX, y: e.clientY, place: on ?? null, who } : null;
    });
    shown.listen(pane, "pointermove", (e: PointerEvent) => {
      const was = fingers.get(e.pointerId);
      if (!was) return;
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_SLACK_PX) press = null;
      if (fingers.size === 1) {
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        slide(e.clientX - was.x, e.clientY - was.y);
        return;
      }
      const before = between();
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const after = between();
      if (before.apart > 0) zoomBy(after.apart / before.apart, after);
      slide(after.x - before.x, after.y - before.y);
    });
    shown.listen(pane, "pointerup", (e: PointerEvent) => {
      if (!fingers.delete(e.pointerId) || !press) return;
      // A press on someone's face puts her menu up, or takes it down; a press on a place puts its card up, or takes it down if it is up; a press on the bare map takes any card down.
      if (press.who) menus.toggle(press.who);
      else pick(press.place === picked ? null : press.place);
      press = null;
    });
    shown.listen(pane, "pointercancel", (e: PointerEvent) => {
      fingers.delete(e.pointerId);
      press = null;
    });
    // From the keyboard, a place is pressed as any button is.
    shown.listen(places, "click", (e: MouseEvent) => {
      const on = (e.target as Element).closest<HTMLElement>("button[data-place]")?.dataset.place as PlaceId | undefined;
      if (e.detail === 0 && on) pick(on === picked ? null : on);
    });

    // Esc shuts it while it is on top; its keys are the page's (keys.ts: not while a box is typed in).
    openLayer(shown, LAYER.map, () => open.set(false));
    onPageKey(shown, (pressed) => {
      if (NEARER_KEYS.includes(pressed)) zoomBy(ZOOM_STEP);
      else if (FARTHER_KEYS.includes(pressed)) zoomBy(1 / ZOOM_STEP);
      else if (SLIDE_KEYS[pressed]) slide(SLIDE_KEYS[pressed][0] * SLIDE_STEP, SLIDE_KEYS[pressed][1] * SLIDE_STEP);
    });
  });

  return { look: () => seen, slide: (dx, dy) => slideNow?.(dx, dy) };
};
