import { HOME, PLACES, waysOnMap } from "../game";
import type { Game, MapPoint, Place, Whereabouts } from "../game";
import { CAST, SHE } from "../space";
import type { Pronouns } from "../space";
import { MAP_ART, PIECES, PIECE_FOOT, UNKNOWN_RADIUS, WAY_GAP } from "./map-art";
import { el } from "./dom";

// What is set down on the map's sheet: the places, the ways between them, and the faces of
// whoever is out of doors. Each is an ordinary page element laid out in the sheet's own pixels.

/** The sheet is laid out this many pixels to a unit of the map, and then scaled: so that sizes on it can be given in whole pixels. */
export const SHEET_PX = 1000;
export const px = (units: number): string => `${units * SHEET_PX}px`;

const SVG = "http://www.w3.org/2000/svg";

/** A sign drawn in the middle of a round button: a letter from a typeface sits where its baseline puts it, which is seldom the middle. */
const sign = (path: string): string => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
export const CROSS = sign("M3.5 3.5l9 9M12.5 3.5l-9 9");
export const PLUS = sign("M8 2.5v11M2.5 8h11");
export const MINUS = sign("M2.5 8h11");
const spriteOf = (id: string): string => CAST.find((c) => c.id === id)?.sprite ?? id;
export const nameOf = (id: string): string => CAST.find((c) => c.id === id)?.name ?? id;
/** A name as it sits in the middle of a sentence: "The Master" is "the Master" there. */
export const nameWithin = (id: string): string => nameOf(id).replace(/^The /, "the ");
/** Someone's pronouns as the sentences want them: hers or his, from the cast (src/space/script.ts), and each with a capital to begin a sentence. Anyone not of the cast, or no one in particular (a party, whoever is sent), is "she", as the sentences are written. */
export type Said = Pronouns & { Subject: string; Possessive: string };
const capital = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);
export const pronounsOf = (id?: string): Said => {
  const words = CAST.find((c) => c.id === id)?.pronouns ?? SHE;
  return { ...words, Subject: capital(words.subject), Possessive: capital(words.possessive) };
};

/** How far down its picture each figure's head begins, in the picture's pixels: the maids' and the townswoman's are all at one height, and the men are taller. */
const HEAD_TOP: Record<string, number> = { master: 23, townsman: 33 };
const USUAL_HEAD_TOP = 48;
/** A face is cut with this much of the picture above the head; and this is what a pixel of the picture is, as a share of how far the cut can be moved down it (map.css: the picture is 256 by 352, drawn 2.56 times the face's width). */
const ABOVE_HEAD = 8;
const PIXEL_AS_SHARE = 3.52 / 352 / 2.52;

/** A face, round, cut from the picture of one of the figures that walk the house: from where that figure's head is (map.css says how much of it). */
export const faceOfSprite = (sprite: string): HTMLElement => {
  const face = el("span", "map-face");
  face.style.backgroundImage = `url("${import.meta.env.BASE_URL}sprites/${sprite}-front.png")`;
  face.style.backgroundPositionY = `${(((HEAD_TOP[sprite] ?? USUAL_HEAD_TOP) - ABOVE_HEAD) * PIXEL_AS_SHARE * 100).toFixed(2)}%`;
  return face;
};

/** Someone's face, by who she is. */
export const faceOf = (id: string): HTMLElement => faceOfSprite(spriteOf(id));

/** The point of the map someone out of doors is at. */
export const pointOf = (where: Whereabouts): MapPoint => {
  if ("at" in where) return PLACES[where.at].at;
  const a = PLACES[where.from].at;
  const b = PLACES[where.to].at;
  return { x: a.x + (b.x - a.x) * where.along, y: a.y + (b.y - a.y) * where.along };
};

/** A place the house has found: its piece, and its name under it. */
const foundPlace = (place: Place, node: HTMLElement): void => {
  const piece = PIECES[place.id];
  node.classList.add("map-place");
  // (Home says what a press on it does, which is not what a press on any other place does: map-view.ts.)
  node.title = place.id === HOME ? `${place.name}: back to the house` : place.name;
  if (place.id === HOME) node.setAttribute("aria-label", node.title);
  Object.assign(node.style, { left: px(place.at.x), top: px(place.at.y - piece.width * piece.tall * PIECE_FOOT), width: px(piece.width) });
  const picture = el("img", "map-piece");
  picture.src = MAP_ART + piece.file;
  picture.alt = place.name;
  picture.draggable = false;
  node.append(picture, el("span", "map-name", place.name));
};

/** A place it only knows is there. */
const unknownPlace = (place: Place, node: HTMLElement): void => {
  node.classList.add("map-unknown");
  node.textContent = "?";
  node.setAttribute("aria-label", "A place not yet visited");
  node.title = "Not yet visited";
  // (What would make it known, for trying things out: reveal.ts.)
  node.dataset.reveal = JSON.stringify({ kind: "place", id: place.id });
  Object.assign(node.style, { left: px(place.at.x), top: px(place.at.y), width: px(UNKNOWN_RADIUS * 2), height: px(UNKNOWN_RADIUS * 2) });
};

/**
 * A place as the house knows it: a button. Pressing anywhere but home asks what can be done
 * there; pressing home is the way back to the house (map-view.ts). `arrived` is for a place
 * found this moment: its piece is seen to be set down.
 */
export const placeNode = (game: Game, place: Place, arrived: boolean): HTMLElement => {
  const node = el("button", "");
  node.dataset.place = place.id;
  if (game.places[place.id] === "found") foundPlace(place, node);
  else unknownPlace(place, node);
  if (arrived) node.classList.add("arrived");
  return node;
};

/** The ways between the places on the map, as broken lines that stop short of what they run to. */
export const waysDrawn = (game: Game): SVGElement => {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "map-ways");
  svg.setAttribute("viewBox", "0 0 1 1");
  svg.setAttribute("aria-hidden", "true");
  const clearOf = (id: Place["id"]): number => (game.places[id] === "found" ? PIECES[id].clear : UNKNOWN_RADIUS + WAY_GAP);
  for (const [from, to] of waysOnMap(game)) {
    const a = PLACES[from].at;
    const b = PLACES[to].at;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const start = clearOf(from) / length;
    const end = 1 - clearOf(to) / length;
    if (end <= start) continue;
    const line = document.createElementNS(SVG, "line");
    line.setAttribute("class", "map-way");
    for (const [name, value] of Object.entries({ x1: a.x + (b.x - a.x) * start, y1: a.y + (b.y - a.y) * start, x2: a.x + (b.x - a.x) * end, y2: a.y + (b.y - a.y) * end })) line.setAttribute(name, String(value));
    svg.append(line);
  }
  return svg;
};
